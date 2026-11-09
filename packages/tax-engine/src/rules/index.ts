import type { RulePackage } from './types';
import { RULES_2025 } from './2025';
import { RULES_2026 } from './2026';
import { RULES_2028 } from './2028';

export * from './types';
export * from './treaties';
export { SCALE_2025 } from './2025';
export { RULES_2025, RULES_2026, RULES_2028 };

const PACKAGES: Readonly<Record<number, RulePackage>> = {
  2025: RULES_2025,
  2026: RULES_2026,
  2028: RULES_2028,
};

export const SUPPORTED_TAX_YEARS: readonly number[] = Object.keys(PACKAGES)
  .map(Number)
  .sort((a, b) => a - b);

/**
 * Returns the immutable rule package for a tax year.
 * Throws instead of silently falling back to another year's rules.
 */
export function getRulePackage(taxYear: number): RulePackage {
  const pkg = PACKAGES[taxYear];
  if (!pkg) {
    throw new Error(
      `No tax rule package for tax year ${taxYear}. Supported years: ${SUPPORTED_TAX_YEARS.join(', ')}.`,
    );
  }
  return pkg;
}

export function isSupportedTaxYear(taxYear: number): boolean {
  return Boolean(PACKAGES[taxYear]);
}
