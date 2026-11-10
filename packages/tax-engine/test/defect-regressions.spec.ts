import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TaxClass, TaxResidence } from '@luxtax/contracts';
import { LuxembourgTaxEngine, round2 } from '../src/index';
import { fromCents, toCents } from '../src/money';

/**
 * Regression tests for the engine defects of the security & code review register.
 *
 * Every case is built from the exact inputs quoted in the register, so a
 * regression reproduces the precise wrong figure that was reported:
 *
 *  1. pension 20 000 + withholding 3 000  → gross 23 000 (was)
 *  2. salary 60 000, + qualifying dividend 10 000 → base unchanged (was)
 *  3. salary 60 000, + capital 5 000 → base + 4 975 while the tranche said 3 500 (was)
 *  4. salary 20 000 + pension 20 000 → CIS and CIP both granted on the tie (was)
 *  5. future-dated loss / completion / fixation years accepted (was)
 *  7. NaN amount silently became 0 (was)
 */

const base = {
  taxClass: TaxClass.CLASS_1,
  residence: TaxResidence.RESIDENT,
  primaryUserId: 'u1',
  taxYear: 2025,
} as const;

const close = (actual: number, expected: number, tolerance = 0.01): void => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected} ± ${tolerance}, got ${actual}`,
  );
};

const salary = (amount: number) => ({
  id: 's1',
  category: 'EMPLOYMENT_INCOME',
  fieldKey: 'grossSalary',
  amount,
});

const run = (facts: unknown[], extra: Record<string, unknown> = {}) =>
  LuxembourgTaxEngine.calculate({ ...base, facts, ...extra } as never);

describe('Defect 1 — a pension withholding is not pension income', () => {
  const pension = { id: 'p1', category: 'PENSION_INCOME', fieldKey: 'grossPension', amount: 20_000 };
  const withholding = {
    id: 'p2',
    category: 'PENSION_INCOME',
    fieldKey: 'withholdingTax',
    amount: 3_000,
  };

  it('taxes 20 000 of pension, not 23 000, and keeps the 3 000 as withheld tax', () => {
    const result = run([pension, withholding]);

    assert.equal(result.grossIncome, 20_000, 'the withholding must not be added to gross income');
    assert.equal(result.netIncome, 20_000);
    // 20 000 − 780 of pension frais d'obtention (Art. 105).
    assert.equal(result.taxableIncome, 19_220);
    assert.equal(result.taxWithheldAtSource, 3_000);
    assert.equal(result.finalTaxLiability, 0);
    assert.equal(result.balancePayableOrRefund, -3_000);
  });

  it('produces the same income line with and without the withholding fact', () => {
    const withoutWithholding = run([pension]);

    assert.equal(withoutWithholding.grossIncome, 20_000);
    assert.equal(withoutWithholding.taxableIncome, 19_220);
    assert.equal(withoutWithholding.taxWithheldAtSource, 0);
  });
});

describe('Defect 2 — a standalone qualifying dividend is taxed at half', () => {
  const salaryOnly = run([salary(60_000)]);

  it('adds the taxable half of the dividend to the base', () => {
    const withDividend = run([
      salary(60_000),
      { id: 'd1', category: 'CAPITAL_INCOME', fieldKey: 'qualifyingDividend', amount: 10_000 },
    ]);

    assert.equal(salaryOnly.taxableIncome, 58_980);

    // 5 000 of the 10 000 enters the base (50 % exemption) and the 1 500
    // Art. 115 n° 15 tranche is then applied once at household level.
    close(withDividend.netIncome, 63_500);
    close(withDividend.taxableIncome, 62_455);
    assert.ok(
      withDividend.taxableIncome > salaryOnly.taxableIncome,
      'a qualifying dividend must raise the taxable base',
    );
    assert.ok(withDividend.finalTaxLiability > salaryOnly.finalTaxLiability);
  });

  it('treats 10 000 of qualifying dividend like 5 000 of ordinary capital income', () => {
    const withDividend = run([
      salary(60_000),
      { id: 'd1', category: 'CAPITAL_INCOME', fieldKey: 'qualifyingDividend', amount: 10_000 },
    ]);
    const withHalfAsCapital = run([
      salary(60_000),
      { id: 'c1', category: 'CAPITAL_INCOME', fieldKey: 'capitalIncome', amount: 5_000 },
    ]);

    close(withDividend.netIncome, withHalfAsCapital.netIncome);
    close(withDividend.taxableIncome, withHalfAsCapital.taxableIncome);
    close(withDividend.finalTaxLiability, withHalfAsCapital.finalTaxLiability);
  });
});

describe('Defect 3 — the Art. 115 n° 15 tranche reaches the taxable base', () => {
  it('reduces the taxable capital by the tranche it reports in provenance', () => {
    const salaryOnly = run([salary(60_000)]);
    const withCapital = run([
      salary(60_000),
      { id: 'c1', category: 'CAPITAL_INCOME', fieldKey: 'capitalIncome', amount: 5_000 },
    ]);

    const trancheLine = withCapital.provenance.find((line) => line.ruleCode === 'LIR-ART-115-15');
    assert.ok(trancheLine, 'the Art. 115 n° 15 line must be reported');
    close(Number(trancheLine.inputs.capitalGrossTaxable), 5_000);
    close(Number(trancheLine.outputAmount), 3_500);

    // 5 000 of capital less the 1 500 tranche; the 25 EUR capital frais
    // d'obtention forfait still applies, hence 3 475 of taxable, not 3 500.
    close(withCapital.netIncome - salaryOnly.netIncome, 3_500);
    close(withCapital.taxableIncome - salaryOnly.taxableIncome, 3_475);
  });
});

describe('Defect 4 — CIS and CIP cannot both be granted', () => {
  it('keeps only the salary credit on an exact tie (20 000 salary + 20 000 pension)', () => {
    const result = run([
      salary(20_000),
      { id: 'p1', category: 'PENSION_INCOME', fieldKey: 'grossPension', amount: 20_000 },
    ]);

    // Both credits are worth 792 EUR before the tie-break: exactly one survives.
    close(result.credits.cis + result.credits.ciCo2Salary, 792);
    assert.equal(result.credits.cip, 0);
    assert.equal(result.credits.ciCo2Pension, 0);
    assert.equal(result.credits.cii, 0);
    assert.equal(result.credits.ciCo2Independant, 0);
    assert.ok(
      result.warnings.some((warning) => warning.includes('cannot be cumulated')),
      JSON.stringify(result.warnings),
    );
  });
});

describe('Defect 5 — future-dated years are ignored, never used', () => {
  it('refuses a mortgage fixation year after the tax year instead of granting the full interest', () => {
    const result = run(
      [
        salary(60_000),
        { id: 'm1', category: 'MORTGAGE_INTEREST', fieldKey: 'mortgageInterest', amount: 8_000 },
      ],
      { mortgageFixationYear: 2030 },
    );

    close(result.deductions.mortgageInterest, 0);
    assert.ok(
      result.warnings.some(
        (warning) => warning.includes('is after tax year 2025') && warning.includes('refused (0)'),
      ),
      JSON.stringify(result.warnings),
    );
  });

  it('ignores a loss carry-forward entry dated after the tax year', () => {
    const facts = [salary(60_000)];
    const result = run(facts, { lossCarryForward: [{ year: 2027, amount: 5_000 }] });

    close(result.deductions.priorLosses, 0);
    assert.ok(
      result.warnings.some(
        (warning) =>
          warning.includes('loss carried forward from 2027') &&
          warning.includes('dated after tax year 2025'),
      ),
      JSON.stringify(result.warnings),
    );

    // A past year still reduces the base: the guard must not disable Art. 114.
    const pastYear = run(facts, { lossCarryForward: [{ year: 2024, amount: 5_000 }] });
    close(pastYear.deductions.priorLosses, 5_000);
  });

  it('does not grant Art. 98 amortisation from a future completion year', () => {
    const building = (completionYear: number) => ({
      grossRent: 12_000,
      purchasePrice: 400_000,
      completionYear,
    });

    const future = run([], { rentalProperties: [building(2030)] });
    close(future.rental!.net, 12_000);
    assert.ok(
      future.warnings.some(
        (warning) =>
          warning.includes('completion year (2030)') && warning.includes('after tax year 2025'),
      ),
      JSON.stringify(future.warnings),
    );

    // A past completion year still amortises the building (age 5 → 1.5 % band).
    const past = run([], { rentalProperties: [building(2020)] });
    close(past.rental!.net, 7_200);
  });
});

describe('Defect 7 — a non-finite amount warns instead of silently becoming 0', () => {
  it('names the field in a warning and ignores the fact', () => {
    const result = run([salary(Number.NaN), { ...salary(60_000), id: 's2' }]);

    assert.equal(result.grossIncome, 60_000);
    assert.ok(
      result.warnings.some(
        (warning) => warning.includes('non-finite amount') && warning.includes('grossSalary'),
      ),
      JSON.stringify(result.warnings),
    );
  });

  it('warns on a non-finite securities holding', () => {
    const result = LuxembourgTaxEngine.calculate({
      ...base,
      facts: [salary(40_000)],
      securities: [{ label: 'ACME', grossIncome: Number.POSITIVE_INFINITY }],
    });

    assert.equal(result.netIncome, 40_000);
    assert.ok(
      result.warnings.some(
        (warning) => warning.includes('Securities holding 1') && warning.includes('ACME'),
      ),
      JSON.stringify(result.warnings),
    );
  });

  it('warns on a non-finite prior-year loss instead of deducting 0 silently', () => {
    const result = run([salary(60_000)], { priorYearLosses: Number.NaN });

    close(result.deductions.priorLosses, 0);
    assert.ok(
      result.warnings.some((warning) => warning.includes('priorYearLosses')),
      JSON.stringify(result.warnings),
    );
  });

  it('warns on a non-finite loss ledger entry instead of deducting 0 silently', () => {
    const result = run([salary(60_000)], {
      lossCarryForward: [{ year: 2024, amount: Number.NaN }],
    });

    close(result.deductions.priorLosses, 0);
    assert.ok(
      result.warnings.some(
        (warning) => warning.includes('non-finite amount') && warning.includes('2024'),
      ),
      JSON.stringify(result.warnings),
    );
  });
});

describe('Defect 6 — one rounding rule for the whole engine', () => {
  it('round2 delegates to the cents helpers on exact halves', () => {
    for (const value of [1.005, 2.675, 0.125, -1.005, 12_345.675]) {
      assert.equal(round2(value), fromCents(toCents(value)), `round2(${value})`);
    }
    // The decimals that are exactly representable keep their value.
    assert.equal(round2(1.005), 1);
    assert.equal(round2(0.1 + 0.2), 0.3);
  });
});
