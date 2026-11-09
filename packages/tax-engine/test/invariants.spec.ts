import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TaxClass, TaxResidence } from '@luxtax/contracts';
import {
  LuxembourgTaxEngine,
  SUPPORTED_TAX_YEARS,
  baseTax,
  getRulePackage,
} from '../src/index';

/**
 * Property tests for the tariff and the assembled calculation.
 *
 * The golden values in `tax-engine.spec.ts` pin a handful of points an auditor checked by hand.
 * These tests pin the **shape** of the function across the whole input range, which is where an
 * arithmetic slip in a bracket boundary shows up: a progressive tariff must be monotone, a
 * liability can never be negative, splitting can never be worse than separate taxation, and
 * adding a deduction can never raise the tax.
 *
 * Sampling is deterministic (fixed seed), so a failure is reproducible and the suite is stable.
 */

/** 32-bit LCG — deterministic, dependency-free, good enough for sampling. */
function sampler(seed: number): () => number {
  let state = seed >>> 0;
  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 0x1_0000_0000;
  };
}

const random = sampler(20261109);
const between = (min: number, max: number): number => min + random() * (max - min);

const CLASSES = [TaxClass.CLASS_1, TaxClass.CLASS_1A, TaxClass.CLASS_2] as const;

describe('Art. 118 tariff — properties that must hold for every income', () => {
  for (const taxYear of SUPPORTED_TAX_YEARS) {
    const pkg = getRulePackage(taxYear);

    it(`${taxYear}: base tax is non-negative and zero at or below zero income`, () => {
      for (const cls of CLASSES) {
        assert.equal(baseTax(0, cls, pkg), 0);
        assert.equal(baseTax(-1, cls, pkg), 0);
        assert.equal(baseTax(-50_000, cls, pkg), 0);
        for (let i = 0; i < 50; i += 1) {
          const income = between(1, 500_000);
          assert.ok(
            baseTax(income, cls, pkg) >= 0,
            `${cls} ${income} produced a negative base tax`,
          );
        }
      }
    });

    it(`${taxYear}: base tax never decreases when income rises`, () => {
      for (const cls of CLASSES) {
        let previous = baseTax(0, cls, pkg);
        // Dense enough to hit every bracket boundary at least once.
        for (let income = 0; income <= 320_000; income += 250) {
          const current = baseTax(income, cls, pkg);
          assert.ok(
            current >= previous - 1e-9,
            `${cls}: base tax fell from ${previous} at ${income - 250} to ${current} at ${income}`,
          );
          previous = current;
        }
      }
    });

    it(`${taxYear}: base tax stays below a proportional ceiling`, () => {
      // A progressive tariff with a top rate cannot exceed that rate applied to the whole income.
      for (const cls of CLASSES) {
        const topRate = 0.42;
        for (let i = 0; i < 40; i += 1) {
          const income = between(10_000, 1_000_000);
          const tax = baseTax(income, cls, pkg);
          assert.ok(
            tax <= income * topRate + 1,
            `${cls}: ${tax} exceeds ${topRate} x ${income}`,
          );
        }
      }
    });

    it(`${taxYear}: no bracket cliff — +50 EUR of income cannot raise the tax by more`, () => {
      // A progressive tariff is continuous: crossing a bracket boundary changes the marginal
      // rate, not the amount already taxed. A jump above the top statutory rate would mean the
      // brackets overlap or a boundary is off by one.
      const topRate = 0.42;
      for (const cls of CLASSES) {
        for (let income = 0; income <= 300_000; income += 50) {
          const delta = baseTax(income + 50, cls, pkg) - baseTax(income, cls, pkg);
          assert.ok(
            delta <= 50 * topRate + 1e-6,
            `${cls}: +50 EUR at ${income} raised the tax by ${delta.toFixed(2)}`,
          );
        }
      }
    });

    it(`${taxYear}: Class 2 splitting never costs more than Class 1`, () => {
      for (let income = 30_000; income <= 300_000; income += 1_000) {
        const class1 = baseTax(income, 'CLASS_1', pkg);
        const class2 = baseTax(income, 'CLASS_2', pkg);
        assert.ok(
          class2 <= class1 + 1e-9,
          `splitting is worse: CLASS_2 ${class2} > CLASS_1 ${class1} at ${income}`,
        );
      }
    });

    it(`${taxYear}: Class 1a is never heavier than Class 1 on the same income`, () => {
      for (let income = 26_460; income <= 160_000; income += 1_000) {
        const class1 = baseTax(income, 'CLASS_1', pkg);
        const class1a = baseTax(income, 'CLASS_1A', pkg);
        assert.ok(
          class1a <= class1 + 1e-9,
          `CLASS_1A ${class1a} > CLASS_1 ${class1} at ${income}`,
        );
      }
    });
  }
});

describe('assembled calculation — properties', () => {
  const base = {
    residence: TaxResidence.RESIDENT,
    primaryUserId: 'u1',
    taxYear: 2025,
  } as const;

  const salaryScenario = (salary: number, extra: Array<Record<string, unknown>> = []) => ({
    ...base,
    taxClass: TaxClass.CLASS_1,
    facts: [
      { id: 'f0', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: salary },
      ...extra,
    ] as never,
  });

  it('never produces a negative liability, for any sampled salary', () => {
    for (let i = 0; i < 60; i += 1) {
      const salary = between(0, 400_000);
      const result = LuxembourgTaxEngine.calculate(salaryScenario(salary));
      assert.ok(
        result.finalTaxLiability >= 0,
        `salary ${salary} produced liability ${result.finalTaxLiability}`,
      );
      assert.ok(
        Number.isFinite(result.finalTaxLiability),
        `salary ${salary} produced a non-finite liability`,
      );
    }
  });

  it('taxable income never exceeds gross income', () => {
    for (let i = 0; i < 40; i += 1) {
      const salary = between(1_000, 300_000);
      const result = LuxembourgTaxEngine.calculate(salaryScenario(salary));
      assert.ok(
        result.taxableIncome <= result.grossIncome + 1e-6,
        `taxable ${result.taxableIncome} > gross ${result.grossIncome} at ${salary}`,
      );
    }
  });

  it('adding a deduction never raises the liability', () => {
    for (let i = 0; i < 40; i += 1) {
      const salary = between(30_000, 250_000);
      const plain = LuxembourgTaxEngine.calculate(salaryScenario(salary));
      const withThirdPillar = LuxembourgTaxEngine.calculate(
        salaryScenario(salary, [
          {
            id: 'f1',
            category: 'PENSION_SAVINGS_111BIS',
            fieldKey: 'art111bis',
            amount: 4_500,
          },
        ]),
      );
      assert.ok(
        withThirdPillar.finalTaxLiability <= plain.finalTaxLiability + 1e-6,
        `a 4 500 EUR third-pillar contribution raised the tax at ${salary}: ` +
          `${plain.finalTaxLiability} -> ${withThirdPillar.finalTaxLiability}`,
      );
    }
  });

  it('a higher salary never lowers the liability', () => {
    let previous = 0;
    for (let salary = 0; salary <= 250_000; salary += 2_500) {
      const liability = LuxembourgTaxEngine.calculate(salaryScenario(salary)).finalTaxLiability;
      assert.ok(
        liability >= previous - 1e-6,
        `liability fell from ${previous} at ${salary - 2_500} to ${liability} at ${salary}`,
      );
      previous = liability;
    }
  });

  it('is reproducible: the same input yields the same figures', () => {
    // `calculatedAt` is a wall-clock stamp, so the comparison excludes it: what must be
    // deterministic is the arithmetic, not the time of day.
    const { calculatedAt: _a, ...first } = LuxembourgTaxEngine.calculate(
      salaryScenario(73_421.37, [
        { id: 'f1', category: 'PENSION_SAVINGS_111BIS', fieldKey: 'art111bis', amount: 3_200 },
      ]),
    ) as unknown as Record<string, unknown>;
    const { calculatedAt: _b, ...second } = LuxembourgTaxEngine.calculate(
      salaryScenario(73_421.37, [
        { id: 'f1', category: 'PENSION_SAVINGS_111BIS', fieldKey: 'art111bis', amount: 3_200 },
      ]),
    ) as unknown as Record<string, unknown>;
    assert.deepEqual(second, first);
  });
});
