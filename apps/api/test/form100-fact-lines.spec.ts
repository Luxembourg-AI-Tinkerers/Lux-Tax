import { test, describe } from 'node:test';
import assert from 'node:assert';
import { FORM100_CASES } from '../src/modules/filing/form100-case-map';
import {
  factAmountRole,
  RD_WITHHOLDING_CREDIT,
  RENTAL_CHARGES_DEDUCTION,
} from '../src/modules/filing/form100-fact-lines';

describe('Form 100 — capital and rental facts print on the line their field key means', () => {
  test('a capital withholding is a credit, never income', () => {
    assert.strictEqual(factAmountRole('CAPITAL_INCOME', 'withholdingTax'), 'CREDIT');
  });

  test('ordinary capital income and qualifying dividends stay income', () => {
    assert.strictEqual(factAmountRole('CAPITAL_INCOME', 'capitalIncome'), 'INCOME');
    assert.strictEqual(
      factAmountRole('CAPITAL_INCOME', 'qualifyingDividend'),
      'INCOME',
    );
  });

  test('rental charges are a deduction, never income', () => {
    assert.strictEqual(factAmountRole('RENTAL_INCOME', 'rentalCharges'), 'DEDUCTION');
  });

  test('gross rent and a net rent amount stay income', () => {
    assert.strictEqual(factAmountRole('RENTAL_INCOME', 'grossRent'), 'INCOME');
    assert.strictEqual(factAmountRole('RENTAL_INCOME', 'rentalNet'), 'INCOME');
  });

  test('a category this table does not cover has no role', () => {
    assert.strictEqual(factAmountRole('EMPLOYMENT_INCOME', 'grossSalary'), null);
    assert.strictEqual(factAmountRole('BUSINESS_EXPENSE', 'businessExpense'), null);
  });
});

describe('Form 100 — credit and deduction pointers are not the income case', () => {
  test('the capital withholding points at RD page 19, not CM 901', () => {
    assert.strictEqual(RD_WITHHOLDING_CREDIT.sheet, 'RD');
    assert.strictEqual(RD_WITHHOLDING_CREDIT.page, 19);
    assert.notStrictEqual(
      RD_WITHHOLDING_CREDIT.caseNumber,
      FORM100_CASES.capital.caseNumber,
    );
    // No printed case number is asserted: the contract reserves 'computed' for
    // credits the ACD derives, and the package must not invite a copy to 901.
    assert.match(RD_WITHHOLDING_CREDIT.caseNumber, /\D/);
  });

  test('the rental charges pointer stays on sheet L and is not case 1001', () => {
    assert.strictEqual(RENTAL_CHARGES_DEDUCTION.sheet, 'L');
    assert.strictEqual(RENTAL_CHARGES_DEDUCTION.page, 10);
    assert.notStrictEqual(
      RENTAL_CHARGES_DEDUCTION.caseNumber,
      FORM100_CASES.rental.caseNumber,
    );
    assert.strictEqual(RENTAL_CHARGES_DEDUCTION.caseNumber, 'charges (deduction)');
  });
});
