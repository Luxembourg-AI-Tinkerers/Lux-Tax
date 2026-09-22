import { test, describe } from 'node:test';
import assert from 'node:assert';
import { TaxClass, TaxResidence } from '@luxtax/contracts';
import { LuxembourgTaxEngine, calculateProgressiveScaleTax, calculateBaseTaxForClass } from '../dist/index.js';

describe('Luxembourg Tax Engine (2025)', () => {
  test('progressive scale tax: income under €13,230 is tax exempt (0%)', () => {
    assert.strictEqual(calculateProgressiveScaleTax(10000), 0);
    assert.strictEqual(calculateProgressiveScaleTax(13230), 0);
  });

  test('progressive scale tax: bracket computation', () => {
    // €20,000 income:
    // 0 - 13,230 = 0
    // 13,230 - 15,435 (2205 * 0.08) = 176.40
    // 15,435 - 17,640 (2205 * 0.09) = 198.45
    // 17,640 - 19,845 (2205 * 0.10) = 220.50
    // 19,845 - 20,000 (155 * 0.11) = 17.05
    // Total = 176.40 + 198.45 + 220.50 + 17.05 = 612.40
    const tax = calculateProgressiveScaleTax(20000);
    assert.strictEqual(Math.abs(tax - 612.40) < 0.1, true);
  });

  test('Class 2 splitting method reduces tax for married couple', () => {
    const singleTax = calculateBaseTaxForClass(60000, TaxClass.CLASS_1);
    const marriedTax = calculateBaseTaxForClass(60000, TaxClass.CLASS_2);
    // Splitting on 60,000 gives 2 * Tax(30,000), which is substantially lower than Tax(60,000)
    assert.strictEqual(marriedTax < singleTax, true);
    assert.strictEqual(marriedTax > 0, true);
  });

  test('Single resident employee scenario (Class 1) with standard deductions and withholding tax refund', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'user-alice-123',
      facts: [
        {
          id: 'fact-salary',
          category: 'EMPLOYMENT_INCOME',
          fieldKey: 'grossSalary',
          amount: 50000,
        },
        {
          id: 'fact-social',
          category: 'EMPLOYMENT_INCOME',
          fieldKey: 'socialSecurity',
          amount: 6000,
        },
        {
          id: 'fact-withholding',
          category: 'EMPLOYMENT_INCOME',
          fieldKey: 'withholdingTax',
          amount: 7000,
        },
        {
          id: 'fact-insurance',
          category: 'INSURANCE_DEDUCTION',
          fieldKey: 'lifeInsurance',
          amount: 800, // Capped at €672
        },
      ],
    });

    assert.strictEqual(result.taxYear, 2025);
    assert.strictEqual(result.grossIncome, 50000);
    // Net employment = 50,000 - 6,000 = 44,000
    // Frais d'obtention minimum = €540
    // Special expenses: max(480, min(800, 672)) = 672
    // Total deductions = 540 + 672 = 1212
    assert.strictEqual(result.totalDeductions, 1212);
    // Taxable income = 44,000 - 1,212 = 42,788
    assert.strictEqual(result.taxableIncome, 42788);
    assert.strictEqual(result.baseTax > 0, true);
    assert.strictEqual(result.solidaritySurchargeRate, 0.07);
    assert.strictEqual(result.solidaritySurchargeAmount > 0, true);
    assert.strictEqual(result.totalTaxCredits > 0, true); // CIS applied
    // Withholding tax was 7000, verify balance is computed
    assert.strictEqual(typeof result.balancePayableOrRefund, 'number');
    // Provenance must be complete
    assert.strictEqual(result.provenance.length >= 5, true);
  });

  test('Married joint filing scenario (Class 2) with mortgage deduction and two salaries', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_2,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'user-spouse-a',
      spouseUserId: 'user-spouse-b',
      dependantsCount: 1, // 1 child -> 3 household members
      facts: [
        {
          id: 'fact-salary-a',
          ownerId: 'user-spouse-a',
          category: 'EMPLOYMENT_INCOME',
          fieldKey: 'grossSalary',
          amount: 60000,
        },
        {
          id: 'fact-social-a',
          ownerId: 'user-spouse-a',
          category: 'EMPLOYMENT_INCOME',
          fieldKey: 'socialSecurity',
          amount: 7200,
        },
        {
          id: 'fact-withholding-a',
          ownerId: 'user-spouse-a',
          category: 'EMPLOYMENT_INCOME',
          fieldKey: 'withholdingTax',
          amount: 8500,
        },
        {
          id: 'fact-salary-b',
          ownerId: 'user-spouse-b',
          category: 'EMPLOYMENT_INCOME',
          fieldKey: 'grossSalary',
          amount: 45000,
        },
        {
          id: 'fact-social-b',
          ownerId: 'user-spouse-b',
          category: 'EMPLOYMENT_INCOME',
          fieldKey: 'socialSecurity',
          amount: 5400,
        },
        {
          id: 'fact-withholding-b',
          ownerId: 'user-spouse-b',
          category: 'EMPLOYMENT_INCOME',
          fieldKey: 'withholdingTax',
          amount: 4200,
        },
        {
          id: 'fact-mortgage',
          category: 'MORTGAGE_DEDUCTION',
          fieldKey: 'primaryMortgageInterest',
          amount: 15000, // Capped at 3 members * €4,000 = €12,000
        },
      ],
    });

    assert.strictEqual(result.taxClass, TaxClass.CLASS_2);
    assert.strictEqual(result.grossIncome, 105000);
    // Two employed spouses: Frais d'obtention = 2 * 540 = €1080
    // Mortgage interest deduction capped at 3 * 4000 = €12000
    // Special expenses flat minimum for Class 2 = €960
    // Total deductions = 1080 + 12000 + 960 = 14040
    assert.strictEqual(result.totalDeductions, 14040);
    assert.strictEqual(result.provenance.some((p) => p.ruleCode === 'LIR-ART-102'), true);
    assert.strictEqual(result.provenance.some((p) => p.ruleCode === 'LIR-ART-118-121'), true);
  });
});
