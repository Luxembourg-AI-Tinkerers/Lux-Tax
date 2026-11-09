import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  assertFilingYearAllowed,
  filingYearVerdict,
  FilingPackageNotAllowedError,
} from '../src/modules/filing/filing-year-guard';
import { getRulePackage } from '@luxtax/tax-engine';

describe('Filing-year guard (LEG-9)', () => {
  test('2025 and 2026 are allowed — their packages are in force', () => {
    for (const year of [2025, 2026]) {
      const verdict = filingYearVerdict(year);
      assert.strictEqual(verdict.allowed, true, `${year} should be allowed`);
      assert.strictEqual(verdict.reason, undefined);
      assert.doesNotThrow(() => assertFilingYearAllowed(year));
    }
  });

  test('2028 preview is refused with an explicit reason', () => {
    const verdict = filingYearVerdict(2028);
    assert.strictEqual(verdict.allowed, false);
    assert.match(verdict.reason ?? '', /single-class preview/i);
    assert.match(verdict.reason ?? '', /modelling only/i);
  });

  test('2028 refusal throws the dedicated error, not a generic one', () => {
    assert.throws(
      () => assertFilingYearAllowed(2028),
      (error: unknown) =>
        error instanceof FilingPackageNotAllowedError &&
        /2028\.0\.0-preview/.test((error as Error).message),
    );
  });

  test('an unsupported year is refused and lists the supported years', () => {
    const verdict = filingYearVerdict(2019);
    assert.strictEqual(verdict.allowed, false);
    assert.match(verdict.reason ?? '', /Supported years: 2025, 2026, 2028/);
    assert.throws(() => assertFilingYearAllowed(2019), FilingPackageNotAllowedError);
  });

  test('the refusal is driven by package metadata, not a hard-coded year list', () => {
    // Allowed <=> the package does not carry `singleClass`.
    for (const year of [2025, 2026, 2028]) {
      const pkg = getRulePackage(year);
      assert.strictEqual(
        filingYearVerdict(year).allowed,
        !pkg.singleClass,
        `${year} allowed should mirror singleClass`,
      );
    }
  });
});
