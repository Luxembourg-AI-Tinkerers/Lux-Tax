import type { RulePackage, TaxBracket } from './rules/types';
import { fromCents, mulRate, toCents } from './money';

/**
 * Art. 126 al. 2 LIR: before applying the tariff, the taxable income is rounded
 * down to the next multiple of €50.
 */
export function roundRiaDownTo50(income: number): number {
  if (!Number.isFinite(income) || income <= 0) return 0;
  return Math.floor(income / 50) * 50;
}

/**
 * Art. 124 LIR: the income-tax cote is rounded down to the next euro, and cotes
 * below €12 are treated as nil.
 */
export function floorEuroToCote(amount: number): number {
  const floored = Math.floor(amount);
  return floored < 12 ? 0 : floored;
}

/** Raw progressive tariff on an already-rounded base, without any class logic. */
export function progressiveScaleTax(
  taxableIncome: number,
  scale: readonly TaxBracket[],
): number {
  if (!Number.isFinite(taxableIncome) || taxableIncome <= 0) return 0;

  // Bracket slices and rates are combined in integer cents so that repeated
  // rate multiplications cannot drift (e.g. 0.39 on a long band).
  const incomeCents = toCents(taxableIncome);
  let totalCents = 0;

  for (const bracket of scale) {
    const lowerCents = toCents(bracket.lower);
    if (incomeCents <= lowerCents) break;
    const upperCents = Number.isFinite(bracket.upper) ? toCents(bracket.upper) : incomeCents;
    const sliceCents = Math.min(incomeCents, upperCents) - lowerCents;
    if (sliceCents > 0) totalCents += mulRate(sliceCents, bracket.rate);
  }

  return fromCents(totalCents);
}

/**
 * Art. 120bis LIR (rewritten by the loi du 20 décembre 2024, in force from AY 2025).
 *
 * The tariff is applied to a reduced base:
 *   R' = R − (79 380 − R) / 4     for R ≤ 79 380
 *   R' = R                        for R > 79 380
 * and the marginal growth of the cote with respect to R is capped at
 * 39 % / 40 % / 41 % / 42 % in the bands set by the article.
 */
export function class1aTax(taxableIncome: number, pkg: RulePackage): number {
  if (taxableIncome <= 0) return 0;

  const { pivot, divisor, marginalCaps } = pkg.class1a;
  const baseOf = (r: number): number => (r <= pivot ? r - (pivot - r) / divisor : r);

  const raw = progressiveScaleTax(baseOf(taxableIncome), pkg.scale);
  if (marginalCaps.length === 0) return raw;

  const first = marginalCaps[0];
  if (taxableIncome <= first.from) return raw;

  // Cote at the start of the first capped band (no cap applies below it).
  let anchorTax = progressiveScaleTax(baseOf(first.from), pkg.scale);
  let result = raw;

  for (let i = 0; i < marginalCaps.length; i += 1) {
    const cap = marginalCaps[i];
    if (taxableIncome <= cap.from) break;

    if (taxableIncome <= cap.to) {
      result = Math.min(
        raw,
        anchorTax + fromCents(mulRate(toCents(taxableIncome - cap.from), cap.rate)),
      );
      break;
    }

    // Income passes the whole band: move the anchor forward under this cap.
    const bandTax = anchorTax + fromCents(mulRate(toCents(cap.to - cap.from), cap.rate));
    const rawAtBandEnd = progressiveScaleTax(baseOf(cap.to), pkg.scale);
    anchorTax = Math.min(rawAtBandEnd, bandTax);
    result = anchorTax;
  }

  return result;
}

/**
 * Base income tax before the fonds pour l'emploi surcharge and before credits.
 *
 * - Class 1: tariff on the rounded income.
 * - Class 2: Art. 121 — twice the tariff on half the rounded income.
 *   No additional rounding of the half (Art. 121 does not authorise it).
 * - Class 1a: Art. 120bis reduced base with marginal caps.
 *
 * The returned cote is *not* floored to the euro; call `floorEuroToCote` at the
 * end of the cote computation (after credits do not apply — Art. 124 applies to
 * the cote determined under Art. 118–121).
 */
export function baseTax(
  taxableIncome: number,
  taxClass: 'CLASS_1' | 'CLASS_1A' | 'CLASS_2',
  pkg: RulePackage,
): number {
  if (!Number.isFinite(taxableIncome) || taxableIncome <= 0) return 0;

  const rounded = roundRiaDownTo50(taxableIncome);

  if (taxClass === 'CLASS_2') {
    return 2 * progressiveScaleTax(rounded / 2, pkg.scale);
  }
  if (taxClass === 'CLASS_1A') {
    return class1aTax(rounded, pkg);
  }
  return progressiveScaleTax(rounded, pkg.scale);
}

/** Marginal rate at a given taxable income, for display purposes. */
export function marginalRate(taxableIncome: number, pkg: RulePackage): number {
  const bracket = pkg.scale.find(
    (b) => taxableIncome > b.lower && taxableIncome <= b.upper,
  );
  return bracket ? bracket.rate : 0;
}
