import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  cimSplit,
  coveredSpecialExpenses,
  normalizeStoredCalculation,
} from '../src/modules/calculations/calculation-snapshot';

const deductions = (over: Record<string, unknown> = {}) => ({
  fraisObtention: 540,
  travel: 0,
  art111: 672,
  asrd: 0,
  art111bis: 3_200,
  savingsHousing: 0,
  donations: 0,
  lrcp: 1_200,
  childcare: 0,
  ...over,
});

const credits = (over: Record<string, unknown> = {}) => ({
  startup: 0,
  foreignTaxCredit: 0,
  cissm: 0,
  cic: 0,
  cis: 0,
  ciCo2Salary: 0,
  cip: 0,
  ciCo2Pension: 0,
  cii: 0,
  ciCo2Independant: 0,
  cim: 0,
  cimApplied: 0,
  cimRefund: 0,
  total: 0,
  ...over,
});

describe('coveredSpecialExpenses (DS 1553)', () => {
  test('uses the stored total when the snapshot has one', () => {
    assert.strictEqual(coveredSpecialExpenses(deductions({ specialExpensesCovered: 4_000 })), 4_000);
  });

  test('rebuilds the total from the four components when the field is absent', () => {
    assert.strictEqual(coveredSpecialExpenses(deductions()), 3_872);
  });

  test('returns null instead of a confident zero when nothing is derivable', () => {
    assert.strictEqual(coveredSpecialExpenses({}), null);
    assert.strictEqual(coveredSpecialExpenses(null), null);
  });

  test('a genuine all-zero breakdown still yields zero, not null', () => {
    const zero = deductions({ art111: 0, asrd: 0, art111bis: 0, savingsHousing: 0 });
    assert.strictEqual(coveredSpecialExpenses(zero), 0);
  });
});

describe('cimSplit (Art. 154ter al. 2)', () => {
  test('keeps the stored split untouched', () => {
    assert.deepStrictEqual(
      cimSplit(credits({ cim: 3_504, cimApplied: 1_000, cimRefund: 2_504 }), 1_000),
      { applied: 1_000, refund: 2_504 },
    );
  });

  test('recomputes the split after the non-refundable credits', () => {
    // cote 5 000, non-refundable 2 000 -> 3 000 of tax left, CIM 3 504
    const split = cimSplit(credits({ cim: 3_504, cis: 2_000 }), 5_000);
    assert.deepStrictEqual(split, { applied: 3_000, refund: 504 });
  });

  test('a CIM smaller than the tax due is fully applied and refunds nothing', () => {
    assert.deepStrictEqual(cimSplit(credits({ cim: 750 }), 5_000), {
      applied: 750,
      refund: 0,
    });
  });

  test('returns null when neither a stored split nor a cote is available', () => {
    const bare = credits({ cim: 750 });
    delete (bare as Record<string, unknown>).cimApplied;
    delete (bare as Record<string, unknown>).cimRefund;
    assert.strictEqual(cimSplit(bare, undefined), null);
  });

  test('a consistent stored split wins over recomputation, even with no cote', () => {
    assert.deepStrictEqual(
      cimSplit(credits({ cim: 750, cimApplied: 0, cimRefund: 750 }), undefined),
      { applied: 0, refund: 750 },
    );
  });

  test('an inconsistent stored split is recomputed, not displayed', () => {
    // A snapshot claiming 0 + 0 for a 750 credit cannot be right.
    assert.deepStrictEqual(cimSplit(credits({ cim: 750, cimApplied: 0, cimRefund: 0 }), 5_000), {
      applied: 750,
      refund: 0,
    });
  });
});

describe('normalizeStoredCalculation', () => {
  const snapshot = (over: Record<string, unknown> = {}) => ({
    taxYear: 2025,
    taxClass: 'CLASS_1',
    rulePackageVersion: '2025.1.0',
    assessmentMode: 'COLLECTIVE',
    grossIncome: 60_000,
    youngEmployeePrimeExemption: 0,
    netIncome: 60_000,
    totalDeductions: 5_072,
    deductions: deductions({ specialExpensesCovered: undefined }),
    taxableIncome: 54_928,
    baseTax: 10_000,
    solidaritySurchargeRate: 0.07,
    solidaritySurchargeAmount: 700,
    totalTaxBeforeCredits: 10_700,
    credits: credits({ cim: 1_000 }),
    finalTaxLiability: 9_700,
    balancePayableOrRefund: 9_700,
    taxWithheldAtSource: 0,
    warnings: [],
    ...over,
  });

  /** A pre-LEG-3 snapshot: the two CIM fields do not exist at all. */
  const legacyCredits = () => {
    const c = credits({ cim: 1_000 });
    delete (c as Record<string, unknown>).cimApplied;
    delete (c as Record<string, unknown>).cimRefund;
    return c;
  };

  test('fills the two derivable fields and reports what it reconstructed', () => {
    const result = normalizeStoredCalculation(snapshot({ credits: legacyCredits() }));
    assert.ok(result);
    assert.strictEqual(result.legacy, false);
    assert.deepStrictEqual(result.reconstructed.sort(), [
      'credits.cimApplied',
      'credits.cimRefund',
      'deductions.specialExpensesCovered',
    ]);
    assert.strictEqual(result.calculation.deductions.specialExpensesCovered, 3_872);
    assert.strictEqual(result.calculation.credits.cimApplied, 1_000);
    assert.strictEqual(result.calculation.credits.cimRefund, 0);
  });

  test('a snapshot without breakdowns is legacy and is left untouched', () => {
    const bare = { taxYear: 2024, finalTaxLiability: 1_000 } as Record<string, unknown>;
    const result = normalizeStoredCalculation(bare);
    assert.ok(result);
    assert.strictEqual(result.legacy, true);
    assert.deepStrictEqual(result.reconstructed, []);
  });

  test('a current snapshot is passed through without invented values', () => {
    const current = snapshot({
      deductions: deductions({ specialExpensesCovered: 3_872 }),
      credits: credits({ cim: 3_504, cimApplied: 749.96, cimRefund: 2_754.04 }),
    });
    const result = normalizeStoredCalculation(current);
    assert.ok(result);
    assert.strictEqual(result.legacy, false);
    assert.deepStrictEqual(result.reconstructed, []);
    assert.strictEqual(result.calculation.credits.cimRefund, 2_754.04);
  });

  test('null and non-objects are rejected rather than coerced', () => {
    assert.strictEqual(normalizeStoredCalculation(null), null);
    assert.strictEqual(normalizeStoredCalculation(undefined), null);
    assert.strictEqual(normalizeStoredCalculation('nope'), null);
    assert.strictEqual(normalizeStoredCalculation(0), null);
  });

  test('a zero-valued but complete breakdown is not treated as legacy', () => {
    const zero = snapshot({
      deductions: deductions({
        art111: 0,
        art111bis: 0,
        specialExpensesCovered: 0,
      }),
      credits: credits({ cim: 0, cimApplied: 0, cimRefund: 0 }),
    });
    const result = normalizeStoredCalculation(zero);
    assert.ok(result);
    assert.strictEqual(result.legacy, false);
    assert.strictEqual(result.calculation.deductions.specialExpensesCovered, 0);
  });
});
