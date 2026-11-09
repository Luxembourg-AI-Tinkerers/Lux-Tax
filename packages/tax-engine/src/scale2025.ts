/**
 * @deprecated Superseded by `./scale.ts` and the versioned rule packages in `./rules`.
 *
 * This module used to hold a hard-coded 2025 bracket table whose upper bands did
 * not match the official Art. 118 LIR tariff (uniform €2,205 steps instead of the
 * 2025 reform's €2,295 two-point steps and wider 39–42 % bands).
 *
 * It is kept only as a thin compatibility shim so that old imports fail loudly
 * rather than silently compute with the wrong brackets.
 */
import { RULES_2025 } from './rules/2025';
import { baseTax, progressiveScaleTax } from './scale';
import { TaxClass } from '@luxtax/contracts';

/** @deprecated Use `getRulePackage(year).scale`. */
export const TAX_BRACKETS_2025 = RULES_2025.scale;

/** @deprecated Use `progressiveScaleTax(income, getRulePackage(year).scale)`. */
export function calculateProgressiveScaleTax(taxableIncome: number): number {
  return progressiveScaleTax(taxableIncome, RULES_2025.scale);
}

/** @deprecated Use `baseTax(income, taxClass, getRulePackage(year))`. */
export function calculateBaseTaxForClass(taxableIncome: number, taxClass: TaxClass): number {
  const mapped = taxClass === TaxClass.CLASS_2 ? 'CLASS_2' : taxClass === TaxClass.CLASS_1A ? 'CLASS_1A' : 'CLASS_1';
  return baseTax(taxableIncome, mapped, RULES_2025);
}
