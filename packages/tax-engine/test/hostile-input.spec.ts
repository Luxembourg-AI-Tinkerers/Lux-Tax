import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FactCategory, TaxClass, TaxResidence } from '@luxtax/contracts';
import { LuxembourgTaxEngine } from '../src/index';

/**
 * Hostile-input contract.
 *
 * The engine is fed by an OCR pipeline, a web form and an importer, so it receives amounts that are
 * strings, `null`, `NaN`, `Infinity` and objects. The rule pinned here is narrow and absolute: a bad
 * amount may be **ignored**, but it may never (a) throw, (b) make an output non-finite, or (c) make a
 * figure that is structurally non-negative go below zero.
 *
 * This is deliberately not a validation test — the validation package rejects bad payloads earlier.
 * The engine is the last line, so it must stay total on garbage.
 */

const base = {
  taxClass: TaxClass.CLASS_1,
  residence: TaxResidence.RESIDENT,
  primaryUserId: 'u1',
  taxYear: 2025,
} as const;

/** Every figure must be a finite number, whatever the input looked like. */
const alwaysFinite = [
  'grossIncome',
  'netIncome',
  'taxableIncome',
  'totalDeductions',
  'baseTax',
  'totalTaxCredits',
  'finalTaxLiability',
  'balancePayableOrRefund',
  'effectiveTaxRate',
] as const;

/**
 * Figures that cannot be negative by construction.
 *
 * Deliberately excluded:
 *  - `netIncome` may be negative in a loss year (rental or business losses exceed income); the
 *    taxable base is floored at zero later, so a negative net income is information, not an error.
 *  - `balancePayableOrRefund` is signed: positive = payable, negative = refund.
 */
const neverNegative = [
  'grossIncome',
  'taxableIncome',
  'totalDeductions',
  'baseTax',
  'totalTaxCredits',
  'finalTaxLiability',
] as const;

function assertSane(result: Record<string, unknown>, label: string): void {
  for (const key of alwaysFinite) {
    const value = result[key] as number;
    assert.ok(
      Number.isFinite(value),
      `${label}: ${key} is not finite (${String(value)})`,
    );
  }
  for (const key of neverNegative) {
    const value = result[key] as number;
    assert.ok(value >= 0, `${label}: ${key} is negative (${value})`);
  }
}

function calculate(amount: unknown, fieldKey = 'grossSalary', category = 'EMPLOYMENT_INCOME') {
  return LuxembourgTaxEngine.calculate({
    ...base,
    facts: [{ id: 'f0', category, fieldKey, amount }],
  } as never) as unknown as Record<string, unknown>;
}

describe('hostile amounts — ignored, never propagated', () => {
  for (const [label, amount] of [
    ['Infinity', Number.POSITIVE_INFINITY],
    ['-Infinity', Number.NEGATIVE_INFINITY],
    ['NaN', Number.NaN],
    ['non-numeric string', 'abc'],
    ['null', null],
    ['undefined', undefined],
    ['object', {}],
    ['negative', -60_000],
  ] as const) {
    it(`treats ${label} as no income and keeps every figure finite`, () => {
      const result = calculate(amount);
      assertSane(result, label);
      assert.equal(result.grossIncome, 0, `${label} must not enter gross income`);
      assert.equal(result.taxableIncome, 0);
    });
  }

  it('still accepts a numeric string, because imports arrive as text', () => {
    const result = calculate('60000');
    assert.equal(result.grossIncome, 60_000);
    assertSane(result, 'numeric string');
  });

  it('stays finite for an absurd but finite amount', () => {
    const result = calculate(1e21);
    assertSane(result, '1e21');
  });

  it('does not throw and keeps the figures finite for a garbage deduction', () => {
    for (const amount of [Number.NaN, Number.POSITIVE_INFINITY, -1, {}, 'x'] as const) {
      const result = LuxembourgTaxEngine.calculate({
        ...base,
        facts: [
          { id: 'f0', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 },
          { id: 'f1', category: 'DONATION_DEDUCTION', fieldKey: 'donations', amount },
        ],
      } as never) as unknown as Record<string, unknown>;
      assertSane(result, `donation ${String(amount)}`);
      assert.ok((result.totalDeductions as number) <= (result.grossIncome as number) + 1_020 + 1e-6);
    }
  });

  it('survives randomised garbage facts without throwing or emitting NaN', () => {
    let state = 123456789;
    const next = (): number => {
      state = (state * 1664525 + 1013904223) >>> 0;
      return state / 0x1_0000_0000;
    };
    const categories = Object.values(FactCategory) as string[];
    const amounts: unknown[] = [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      -1,
      0,
      1,
      1e18,
      '12',
      '',
      null,
      undefined,
      {},
    ];

    for (let round = 0; round < 200; round += 1) {
      const factCount = 1 + Math.floor(next() * 5);
      const facts = Array.from({ length: factCount }, (_, index) => ({
        id: `f${index}`,
        category: categories[Math.floor(next() * categories.length)]!,
        fieldKey: next() < 0.3 ? 'code_999' : next() < 0.5 ? 'S' : 'grossSalary',
        amount: amounts[Math.floor(next() * amounts.length)],
      }));

      let result: Record<string, unknown>;
      assert.doesNotThrow(() => {
        result = LuxembourgTaxEngine.calculate({ ...base, facts } as never) as unknown as Record<
          string,
          unknown
        >;
      }, `round ${round} threw`);
      assertSane(result!, `round ${round}`);
    }
  });
});
