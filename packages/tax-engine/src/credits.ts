import type { ChildReliefRules, CiiRules, CipRules, CisRules, RulePackage } from './rules/types';
import { fromCents, toCents } from './money';

export interface TaxCreditsBreakdown {
  /** Crédit d'impôt salarié (Art. 154quater). */
  cisAmount: number;
  /** Crédit d'impôt CO2 salarié. */
  ciCo2SalaryAmount: number;
  /** Crédit d'impôt pensionné (Art. 154quinquies). */
  cipAmount: number;
  /** Crédit d'impôt CO2 pensionné. */
  ciCo2PensionAmount: number;
  /** Crédit d'impôt indépendant (Art. 152ter). */
  ciiAmount: number;
  /** Crédit d'impôt CO2 indépendant. */
  ciCo2IndependantAmount: number;
  /** Crédit d'impôt monoparental (Art. 154ter). */
  cimAmount: number;
  totalTaxCredits: number;
  /** Notes explaining a tie-break or a refused cumulation. */
  notes: string[];
}

/**
 * Credit amounts are rounded up to the next cent (Art. 154quater al. 2 and the
 * 12 March 2025 circulars). The annual gross base is rounded down to the euro.
 */
function ceilCent(value: number): number {
  if (value <= 0) return 0;
  return Math.ceil(value * 100 - 1e-9) / 100;
}

function floorEuro(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.floor(value);
}

/** Shared CIS/CIP/CII geometry: build-up, plateau, phase-out, zero. */
export function creditFromScale(amount: number, rules: CisRules): number {
  const base = floorEuro(amount);
  if (base < rules.floor || base >= rules.zeroFrom) return 0;
  if (base <= rules.buildUpEnd) {
    return ceilCent(rules.base + (base - rules.floor) * rules.buildUpSlope);
  }
  if (base <= rules.plateauEnd) return rules.minimum;
  return Math.max(0, ceilCent(rules.minimum - (base - rules.plateauEnd) * rules.phaseOutSlope));
}

export function cisForSalary(grossSalary: number, rules: CisRules): number {
  return creditFromScale(grossSalary, rules);
}

/**
 * CISSM — crédit d'impôt salaire social minimum.
 * Monthly salary 1 800–3 000: EUR 70/month; 3 000–3 600: linear phase-out;
 * annualised here (x12) because the engine works on annual figures.
 */
export function cissmForSalary(grossSalary: number, pkg: RulePackage): number {
  const monthly = grossSalary / 12;
  const { monthlyFloor, monthlyFlatUntil, monthlyZeroFrom, monthlyAmount } = pkg.cissm;
  if (!Number.isFinite(monthly) || monthly < monthlyFloor || monthly >= monthlyZeroFrom) return 0;
  const monthlyCredit =
    monthly <= monthlyFlatUntil
      ? monthlyAmount
      : (monthlyAmount / (monthlyZeroFrom - monthlyFlatUntil)) * (monthlyZeroFrom - monthly);
  return ceilCent(monthlyCredit * 12);
}

/**
 * CIC — crédit d'impôt conjoncture (monthly table, annualised x12).
 * Returns 0 when the rule package carries no published table for the year.
 */
export function cicForSalary(grossSalary: number, pkg: RulePackage): number {
  const table = pkg.cic;
  if (!table) return 0;

  // Safety gate: a table transcribed from a bill must never be paid out while the
  // measure is still flagged NOT_IN_FORCE. This prevents shipping the numbers of a
  // projet de loi as if they were law.
  const measure = (pkg.pendingMeasures ?? []).find((m) => m.id === 'CIC_2026');
  if (measure && measure.status === 'NOT_IN_FORCE') return 0;

  const monthly = grossSalary / 12;
  if (!Number.isFinite(monthly)) return 0;

  const bands = table.bands;
  if (bands.length === 0) return 0;

  // Below the first band the credit is not granted.
  if (monthly < bands[0].from) return 0;

  for (const band of bands) {
    if (monthly >= band.from && monthly <= band.to) {
      const value = band.slope * (monthly - band.from) + band.offset;
      return ceilCent(Math.max(0, value) * 12);
    }
  }

  // Above the last band: the flat top amount, when the table defines one.
  const last = bands[bands.length - 1];
  if (monthly > last.to && table.topAmount !== undefined) return ceilCent(table.topAmount * 12);
  return 0;
}

export function ciCo2ForSalary(grossSalary: number, pkg: RulePackage): number {
  const base = floorEuro(grossSalary);
  const { salarie, slope, zeroFrom } = pkg.ciCo2;
  if (base < 936 || base >= zeroFrom) return 0;
  if (base <= 40_000) return salarie;
  return Math.max(0, ceilCent(salarie - (base - 40_000) * slope));
}

export function ciCo2ForPension(pension: number, pkg: RulePackage): number {
  const base = floorEuro(pension);
  const { pension: amount, slope, zeroFrom } = pkg.ciCo2;
  if (base < 300 || base >= zeroFrom) return 0;
  if (base <= 40_000) return amount;
  return Math.max(0, ceilCent(amount - (base - 40_000) * slope));
}

/**
 * CIP: nil below €300 of pension, a flat €300 on €300–€935, then the same
 * build-up as CIS from €936 upward.
 */
export function cipForPension(pension: number, rules: CipRules): number {
  const base = floorEuro(pension);
  if (base < rules.pensionFloor) return 0;
  if (base <= rules.lowBandEnd) return rules.lowBandAmount;
  return creditFromScale(base, rules);
}

/** CII is more generous at the bottom: €300 even below the €936 floor. */
export function ciiForProfit(profit: number, rules: CiiRules): number {
  const base = floorEuro(profit);
  if (base <= 0) return 0;
  if (base < rules.floor) return rules.subFloorAmount;
  if (base >= rules.zeroFrom) return 0;
  return creditFromScale(base, rules);
}

export function ciCo2ForIndependant(profit: number, pkg: RulePackage): number {
  const base = floorEuro(profit);
  const { independant, slope, zeroFrom } = pkg.ciCo2;
  if (base < 936 || base >= zeroFrom) return 0;
  if (base <= 40_000) return independant;
  return Math.max(0, ceilCent(independant - (base - 40_000) * slope));
}

/**
 * CIM — Art. 154ter, reformed for AY 2025.
 * €3 504 up to €60 000 RIA, linear to €750 at €105 000, €750 above.
 * Reduced by 50 % of the child's allocations above €2 712.
 */
export function cimFor(ria: number, childAllocations: number, pkg: RulePackage): number {
  const { maximum, fullAmountUntil, zeroFrom, phaseOutSlope, minimum, allocationThreshold, reductionRate } =
    pkg.cim;

  let amount: number;
  if (ria <= fullAmountUntil) amount = maximum;
  else if (ria <= zeroFrom) amount = Math.max(minimum, maximum - (ria - fullAmountUntil) * phaseOutSlope);
  else amount = minimum;

  const excess = Math.max(0, childAllocations - allocationThreshold);
  amount -= excess * reductionRate;

  return Math.max(0, Math.round(amount * 100) / 100);
}

/** Counts come from a questionnaire: normalise to a non-negative integer. */
function normaliseCount(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.floor(value));
}

/**
 * Art. 122 LIR — dégrèvement d'impôt pour enfant.
 *
 * When none of the family allowance (CAE / Zukunftskeess), the CEDIES study aid
 * or the SNJ volunteer aid was paid for a moderated child, the household may
 * request a fiscal dégrèvement of EUR 922.50 per child instead. It is **not
 * refundable**: it only reduces the tax still due, never below zero.
 */
export function degrevementForChildren(
  childCount: number,
  taxDue: number,
  rules: ChildReliefRules,
): number {
  const count = normaliseCount(childCount);
  if (count === 0) return 0;
  const reliefCents = count * toCents(rules.amountPerChild);
  const availableCents = Math.max(0, toCents(taxDue));
  return fromCents(Math.min(reliefCents, availableCents));
}

/**
 * Art. 123bis LIR — bonification d'impôt pour enfant.
 *
 * Granted for a child whose moderation right expired at the end of one of the
 * two preceding years (at most twice per child). Same EUR 922.50 per child
 * ceiling as the dégrèvement, phased out as (76 600 − RIA) / 10 between
 * EUR 67 400 and EUR 76 600 for households with up to five children; from six
 * children (modération + bonification) the income cap is lifted.
 *
 * Non-refundable as well: the engine caps the result at the remaining tax due.
 * The income cap is therefore tested *before* the RIA ceiling, otherwise the
 * six-child lift could never apply above EUR 76 600.
 */
export function bonificationForChildren(
  childCount: number,
  ria: number,
  totalChildren: number,
  rules: ChildReliefRules,
): number {
  const count = normaliseCount(childCount);
  if (count === 0) return 0;

  if (normaliseCount(totalChildren) >= rules.capLiftedFromChildren) {
    return fromCents(count * toCents(rules.amountPerChild));
  }

  if (!Number.isFinite(ria) || ria > rules.bonificationZeroFrom) return 0;

  if (ria >= rules.bonificationPhaseOutFrom) {
    const perChild = Math.min(rules.amountPerChild, (rules.bonificationZeroFrom - ria) / 10);
    return fromCents(count * toCents(perChild));
  }

  return fromCents(count * toCents(rules.amountPerChild));
}

/**
 * Applies the per-person non-cumulation rule (Art. 152ter, Art. 154quater,
 * Art. 154quinquies): a person receives at most one of CIS / CIP / CII, and at
 * most one of the corresponding CO2 credits.
 *
 * The law forbids cumulation but publishes no tie-break. This implementation
 * grants the higher credit and records a note, so the choice is visible rather
 * than silent.
 */
export function resolvePerPersonCredits(input: {
  salary: number;
  pension: number;
  independentProfit: number;
  pkg: RulePackage;
}): {
  cis: number;
  ciCo2: number;
  cip: number;
  cipCo2: number;
  cii: number;
  ciiCo2: number;
  note?: string;
} {
  const { salary, pension, independentProfit, pkg } = input;

  const cis = cisForSalary(salary, pkg.cis);
  const cisCo2 = ciCo2ForSalary(salary, pkg);
  const cip = cipForPension(pension, pkg.cip);
  const cipCo2 = ciCo2ForPension(pension, pkg);
  const cii = ciiForProfit(independentProfit, pkg.cii);
  const ciiCo2 = ciCo2ForIndependant(independentProfit, pkg);

  const salaryCredit = cis + cisCo2;
  const pensionCredit = cip + cipCo2;
  const independentCredit = cii + ciiCo2;

  const hasSalary = salary >= 936;
  const hasPension = pension >= 300;
  const hasIndependent = independentProfit > 0;

  const kinds = [hasSalary, hasPension, hasIndependent].filter(Boolean).length;
  if (kinds <= 1) {
    return {
      cis: hasSalary ? cis : 0,
      ciCo2: hasSalary ? cisCo2 : 0,
      cip: hasPension ? cip : 0,
      cipCo2: hasPension ? cipCo2 : 0,
      cii: hasIndependent ? cii : 0,
      ciiCo2: hasIndependent ? ciiCo2 : 0,
    };
  }

  // More than one category: keep the highest total credit, zero the others.
  const best = Math.max(salaryCredit, pensionCredit, independentCredit);
  const note =
    'CIS, CIP and CII cannot be cumulated for the same person (Art. 152ter, 154quater, 154quinquies). ' +
    'No official tie-break is published; the engine kept the highest credit (' +
    best.toFixed(2) +
    ' EUR) and set the others to zero. Verify against the ACD assessment.';

  return {
    cis: salaryCredit === best ? cis : 0,
    ciCo2: salaryCredit === best ? cisCo2 : 0,
    cip: pensionCredit === best ? cip : 0,
    cipCo2: pensionCredit === best ? cipCo2 : 0,
    cii: independentCredit === best ? cii : 0,
    ciiCo2: independentCredit === best ? ciiCo2 : 0,
    note,
  };
}

export { ceilCent, floorEuro };
