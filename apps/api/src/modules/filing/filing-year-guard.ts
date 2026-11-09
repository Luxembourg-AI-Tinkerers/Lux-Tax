import { getRulePackage, isSupportedTaxYear, SUPPORTED_TAX_YEARS } from '@luxtax/tax-engine';

/**
 * Guard for filing-package generation (LEG-9).
 *
 * A filing package is a set of values a taxpayer copies into an official return.
 * It must therefore never be produced from a *preview* rule package — one whose
 * tariff, transition rules or amounts are not yet law. The 2028 single-class
 * ("classe U") package is exactly that: it exists so the engine can model the
 * reform as data, but its transition rules are unpublished and the 25-year
 * couple phase-out is not implemented.
 *
 * Keeping the rule in a pure function means the check is unit-testable without
 * Nest, Prisma or a database, and cannot drift away from the package metadata.
 */
export class FilingPackageNotAllowedError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FilingPackageNotAllowedError';
  }
}

export interface FilingYearVerdict {
  allowed: boolean;
  reason?: string;
}

export function filingYearVerdict(taxYear: number): FilingYearVerdict {
  if (!isSupportedTaxYear(taxYear)) {
    return {
      allowed: false,
      reason: `No tax rule package for ${taxYear}. Supported years: ${SUPPORTED_TAX_YEARS.join(', ')}.`,
    };
  }

  const pkg = getRulePackage(taxYear);

  if (pkg.singleClass) {
    return {
      allowed: false,
      reason:
        `Tax year ${taxYear} uses the single-class preview package (${pkg.version}). ` +
        'Its scale, transition rules and amounts are not yet in force, so a filing package cannot be generated from it. ' +
        'Use it for modelling only.',
    };
  }

  return { allowed: true };
}

/** Throws when a filing package may not be generated for the given year. */
export function assertFilingYearAllowed(taxYear: number): void {
  const verdict = filingYearVerdict(taxYear);
  if (!verdict.allowed) {
    throw new FilingPackageNotAllowedError(verdict.reason ?? 'Filing package not allowed.');
  }
}
