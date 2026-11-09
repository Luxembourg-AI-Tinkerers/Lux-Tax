import type { CicRules, RulePackage } from './rules/types';
import { fromCents, toCents } from './money';

/**
 * Pending-measure gate.
 *
 * A measure that has been announced but not published (or published but not
 * yet in force) must never contribute to a tax figure. Two rules follow from
 * that, and this module enforces both:
 *
 *  1. A value is only produced when the rule package actually carries the data
 *     for it *and* the measure is declared in force. Absent data yields an
 *     explicit `NOT_IN_FORCE` result, never a silent zero.
 *  2. The package must not contradict itself — declaring a measure in force
 *     while its parameters are missing is a bug, not a configuration choice,
 *     so `checkPendingConsistency` reports it and `assertPendingConsistency`
 *     throws.
 *
 * Nothing here encodes a published amount: the numbers live in the rule
 * packages, this is the switching and lookup logic around them.
 */

export type PendingMeasureStatus = 'IN_FORCE' | 'NOT_IN_FORCE' | 'UNKNOWN';

/** Declared status of a measure, or `UNKNOWN` when the package does not mention it. */
export function pendingMeasureStatus(
  pkg: RulePackage,
  id: string,
): PendingMeasureStatus {
  const measure = pkg.pendingMeasures?.find((m) => m.id === id);
  return measure ? measure.status : 'UNKNOWN';
}

export interface CicLookup {
  /** `NOT_IN_FORCE` means no credit is granted for this year. */
  status: 'APPLIED' | 'NOT_IN_FORCE';
  /** Monthly credit in euro, rounded up to the cent (never negative). */
  monthlyAmount: number;
  /** Annual amount (12 x monthly), for the annual assessment. */
  annualAmount: number;
  /** Which band produced the amount; absent when not in force. */
  band?: { from: number; to: number };
  /** Human-readable reason, always set when `status` is `NOT_IN_FORCE`. */
  note?: string;
}

function ceilCent(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.ceil(value * 100 - 1e-9) / 100;
}

/** Monthly CIC for one band table. Pure; exported for the activation dry-run. */
export function cicFromTable(rules: CicRules, monthlySalary: number): CicLookup {
  const salary = Number.isFinite(monthlySalary) ? monthlySalary : 0;
  if (salary <= 0) {
    return {
      status: 'APPLIED',
      monthlyAmount: 0,
      annualAmount: 0,
      note: 'No salary, so no salary credit.',
    };
  }

  for (const band of rules.bands) {
    if (salary >= band.from && salary <= band.to) {
      const cents = toCents(salary * band.slope) + toCents(band.offset);
      const monthlyAmount = ceilCent(fromCents(Math.max(0, cents)));
      return {
        status: 'APPLIED',
        monthlyAmount,
        annualAmount: ceilCent(monthlyAmount * 12),
        band: { from: band.from, to: band.to },
      };
    }
  }

  const highestTo = rules.bands.reduce((max, b) => Math.max(max, b.to), 0);
  if (
    rules.topAmount !== undefined &&
    salary > highestTo &&
    (rules.topUpTo === undefined || salary <= rules.topUpTo)
  ) {
    const monthlyAmount = ceilCent(rules.topAmount);
    return {
      status: 'APPLIED',
      monthlyAmount,
      annualAmount: ceilCent(monthlyAmount * 12),
      band: { from: highestTo, to: rules.topUpTo ?? highestTo },
    };
  }

  return {
    status: 'APPLIED',
    monthlyAmount: 0,
    annualAmount: 0,
    note: `Monthly salary ${salary} is outside every published CIC band.`,
  };
}

/**
 * Monthly CIC for a tax year, honouring the gate.
 *
 * Returns `NOT_IN_FORCE` — not zero — while the table is unpublished, so a
 * caller can tell "no credit by law" from "credit worth nothing".
 */
export function cicForMonthlySalary(
  pkg: RulePackage,
  monthlySalary: number,
  id = 'CIC_2026',
): CicLookup {
  const declared = pendingMeasureStatus(pkg, id);

  if (!pkg.cic) {
    return {
      status: 'NOT_IN_FORCE',
      monthlyAmount: 0,
      annualAmount: 0,
      note:
        declared === 'IN_FORCE'
          ? `Measure ${id} is declared in force but package ${pkg.version} carries no CIC table; refusing to compute.`
          : `No CIC table for tax year ${pkg.taxYear} (measure ${id}: ${declared}).`,
    };
  }

  if (declared === 'NOT_IN_FORCE') {
    return {
      status: 'NOT_IN_FORCE',
      monthlyAmount: 0,
      annualAmount: 0,
      note: `Package ${pkg.version} carries a CIC table but measure ${id} is not in force yet.`,
    };
  }

  return cicFromTable(pkg.cic, monthlySalary);
}

/**
 * Self-consistency of the declared measures against the data they activate.
 * An empty array means the package is coherent.
 */
export function checkPendingConsistency(pkg: RulePackage): string[] {
  const problems: string[] = [];
  const measures = pkg.pendingMeasures ?? [];

  for (const measure of measures) {
    if (!measure.source.trim()) {
      problems.push(`${measure.id}: missing source reference.`);
    }
    if (!measure.activation.trim()) {
      problems.push(`${measure.id}: missing activation description.`);
    }
  }

  if (measures.length === 0) {
    return problems;
  }

  const cic = measures.find((m) => m.id === 'CIC_2026');
  if (cic?.status === 'IN_FORCE' && !pkg.cic) {
    problems.push(
      'CIC_2026 is IN_FORCE but the package has no cic table; the credit would silently be zero.',
    );
  }
  if (pkg.cic && cic && cic.status === 'NOT_IN_FORCE') {
    problems.push(
      'The package carries a cic table while CIC_2026 is NOT_IN_FORCE; the two contradict each other.',
    );
  }

  const epargne = measures.find((m) => m.id === 'EPARGNE_LOGEMENT_8775');
  if (epargne?.status === 'IN_FORCE' && pkg.specialExpenses.savingsHousingYoungMaxAge !== 200) {
    problems.push(
      `EPARGNE_LOGEMENT_8775 is IN_FORCE but savingsHousingYoungMaxAge is ${pkg.specialExpenses.savingsHousingYoungMaxAge}, expected 200.`,
    );
  }

  return problems;
}

/** Throwing form of {@link checkPendingConsistency}, for package construction. */
export function assertPendingConsistency(pkg: RulePackage): void {
  const problems = checkPendingConsistency(pkg);
  if (problems.length > 0) {
    throw new Error(
      `Rule package ${pkg.taxYear} (${pkg.version}) is inconsistent:\n- ${problems.join('\n- ')}`,
    );
  }
}
