import type {
  CreditBreakdownDto,
  DeductionBreakdownDto,
  TaxCalculationResultDto,
} from '@luxtax/contracts';

/**
 * What a stored calculation from an earlier model version can and cannot tell
 * us. A snapshot is *normalisable* when it still carries the breakdowns; when
 * it does not, no amount of filling can reconstruct the lines, and the caller
 * must ask for a recalculation rather than print a plausible-looking zero.
 */
export interface NormalizedSnapshot {
  calculation: TaxCalculationResultDto;
  /** True when the snapshot predates the breakdowns and cannot be rendered. */
  legacy: boolean;
  /** Fields this function reconstructed, for the audit trail and the UI copy. */
  reconstructed: string[];
}

const asNumber = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) ? value : null;

/**
 * The special expenses covered by the minimum forfait (DS 1553).
 *
 * A snapshot written before `specialExpensesCovered` existed still carries its
 * four components, so the total can be rebuilt exactly — this is the only field
 * that is safely derivable. The filing package used to rebuild it on its own;
 * deriving it in one place keeps the package and the calculator header from
 * disagreeing about the same stored result.
 */
export function coveredSpecialExpenses(
  deductions: Partial<DeductionBreakdownDto> | null | undefined,
): number | null {
  if (!deductions) return null;
  const stored = asNumber(deductions.specialExpensesCovered);
  if (stored !== null) return stored;

  const parts = [
    deductions.art111,
    deductions.asrd,
    deductions.art111bis,
    deductions.savingsHousing,
  ].map(asNumber);

  // Only derive when at least one component is actually present: an empty
  // object would otherwise produce a confident 0.
  if (parts.every((part) => part === null)) return null;
  return parts.reduce<number>((sum, part) => sum + (part ?? 0), 0);
}

/**
 * The CIM split (Art. 154ter al. 2). Both values are stored together; an old
 * snapshot has neither. Deriving them needs the cote, which the snapshot does
 * carry in `totalTaxBeforeCredits` — but the other non-refundable credits are
 * also in the snapshot, so the split can be recomputed exactly.
 */
export function cimSplit(
  credits: Partial<CreditBreakdownDto> | null | undefined,
  totalTaxBeforeCredits: unknown,
): { applied: number; refund: number } | null {
  if (!credits) return null;
  const applied = asNumber(credits.cimApplied);
  const refund = asNumber(credits.cimRefund);
  const cim = asNumber(credits.cim);

  // A stored split is only trustworthy when it actually accounts for the whole
  // credit: a snapshot whose two halves do not add up to `cim` was written by a
  // model that computed them differently (or not at all), so it is recomputed
  // instead of being displayed.
  const storedConsistent =
    applied !== null &&
    refund !== null &&
    (cim === null || Math.abs(applied + refund - cim) <= 0.01);
  if (storedConsistent) return { applied, refund };

  const cote = asNumber(totalTaxBeforeCredits);
  if (cim === null || cote === null) return null;

  // Sum every non-refundable credit the snapshot knows about, leaving the CIM
  // out of the subtraction — the same rule the engine applies.
  const nonRefundableKeys: Array<keyof CreditBreakdownDto> = [
    'startup',
    'foreignTaxCredit',
    'cissm',
    'cic',
    'cis',
    'ciCo2Salary',
    'cip',
    'ciCo2Pension',
    'cii',
    'ciCo2Independant',
  ];
  const nonRefundable = nonRefundableKeys.reduce<number>(
    (sum, key) => sum + (asNumber(credits[key]) ?? 0),
    0,
  );

  const taxAfterNonRefundable = Math.max(0, cote - nonRefundable);
  const appliedNow = Math.min(cim, taxAfterNonRefundable);
  return { applied: appliedNow, refund: Math.max(0, cim - appliedNow) };
}

/**
 * Upgrade a stored snapshot to the current read shape without inventing data.
 *
 * It reconstructs only what is arithmetically determined by the snapshot
 * itself. Anything else (a missing breakdown, an absent `assessmentMode`) makes
 * the snapshot `legacy`, and the caller must offer a recalculation.
 */
export function normalizeStoredCalculation(
  snapshot: unknown,
): NormalizedSnapshot | null {
  if (!snapshot || typeof snapshot !== 'object') return null;
  const calc = snapshot as TaxCalculationResultDto;
  const reconstructed: string[] = [];

  const hasBreakdowns = Boolean(calc.credits) && Boolean(calc.deductions);
  if (!hasBreakdowns) {
    return { calculation: calc, legacy: true, reconstructed };
  }

  const covered = coveredSpecialExpenses(calc.deductions);
  if (covered !== null && asNumber(calc.deductions.specialExpensesCovered) === null) {
    calc.deductions = { ...calc.deductions, specialExpensesCovered: covered };
    reconstructed.push('deductions.specialExpensesCovered');
  }

  const split = cimSplit(calc.credits, calc.totalTaxBeforeCredits);
  if (
    split !== null &&
    (asNumber(calc.credits.cimApplied) !== split.applied ||
      asNumber(calc.credits.cimRefund) !== split.refund)
  ) {
    calc.credits = { ...calc.credits, cimApplied: split.applied, cimRefund: split.refund };
    reconstructed.push('credits.cimApplied', 'credits.cimRefund');
  }

  return { calculation: calc, legacy: false, reconstructed };
}
