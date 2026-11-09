import { test, describe } from 'node:test';
import assert from 'node:assert';
import { TaxClass, TaxResidence } from '@luxtax/contracts';
import { LuxembourgTaxEngine, baseTax, floorEuroToCote, getRulePackage } from '../src/index';

const pkg = getRulePackage(2025);
const close = (actual: number, expected: number, tolerance = 0.01): void => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected} ± ${tolerance}, got ${actual}`,
  );
};

const calculate = (foreignIncomeItems: Array<{ country: string; amount: number; foreignTax: number }>) =>
  LuxembourgTaxEngine.calculate({
    taxYear: 2025,
    taxClass: TaxClass.CLASS_1,
    residence: TaxResidence.RESIDENT,
    primaryUserId: 'u1',
    facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 }],
    foreignIncomeItems,
  });

const capOn = (taxable: number, slice: number): number =>
  floorEuroToCote(baseTax(taxable, 'CLASS_1', pkg)) -
  floorEuroToCote(baseTax(taxable - slice, 'CLASS_1', pkg));

describe('Foreign tax credit is capped per country (not on one aggregate slice)', () => {
  test('a high-tax country cannot borrow the unused cap of another country', () => {
    const de = { country: 'DE', amount: 40_000, foreignTax: 40_000 };
    const be = { country: 'BE', amount: 20_000, foreignTax: 100 };
    const result = calculate([de, be]);

    const taxable = result.taxableIncome;
    const cote = result.baseTax;
    const expected =
      Math.min(40_000, (cote * 40_000) / taxable) + Math.min(100, (cote * 20_000) / taxable);
    const aggregate = capOn(taxable, 60_000);

    close(result.credits.foreignTaxCredit, expected);
    assert.ok(
      result.credits.foreignTaxCredit < aggregate,
      `per-country credit ${result.credits.foreignTaxCredit} should be below the aggregate cap ${aggregate}`,
    );
    assert.ok(result.credits.foreignTaxCredit <= 40_100);
  });

  test('two items of the same country share one country cap', () => {
    const one = calculate([{ country: 'DE', amount: 40_000, foreignTax: 40_000 }]);
    const split = calculate([
      { country: 'DE', amount: 20_000, foreignTax: 20_000 },
      { country: 'DE', amount: 20_000, foreignTax: 20_000 },
    ]);
    close(split.credits.foreignTaxCredit, one.credits.foreignTaxCredit);
  });

  test('the credit never exceeds the Luxembourg cote', () => {
    const result = calculate([
      { country: 'DE', amount: 50_000, foreignTax: 50_000 },
      { country: 'BE', amount: 50_000, foreignTax: 50_000 },
    ]);
    assert.ok(result.credits.foreignTaxCredit <= result.baseTax + 0.01);
  });
});
