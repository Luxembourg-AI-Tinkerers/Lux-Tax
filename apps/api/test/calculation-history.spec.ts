import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  canonicalJson,
  hashCalculationResult,
  isSameCalculation,
  summariseCalculation,
} from '../src/modules/calculations/calculation-history';

describe('Calculation history (API-9)', () => {
  test('canonical JSON is key-order independent', () => {
    const a = { b: 2, a: 1, nested: { z: 26, y: 25 } };
    const b = { nested: { y: 25, z: 26 }, a: 1, b: 2 };
    assert.strictEqual(canonicalJson(a), canonicalJson(b));
    assert.strictEqual(hashCalculationResult(a), hashCalculationResult(b));
  });

  test('array order still matters', () => {
    const a = { list: [1, 2, 3] };
    const b = { list: [3, 2, 1] };
    assert.notStrictEqual(hashCalculationResult(a), hashCalculationResult(b));
  });

  test('a changed amount changes the hash', () => {
    const before = { taxableIncome: 40_000, finalTaxLiability: 4_000 };
    const after = { taxableIncome: 40_000, finalTaxLiability: 4_000.01 };
    assert.notStrictEqual(hashCalculationResult(before), hashCalculationResult(after));
    assert.strictEqual(isSameCalculation(before, { finalTaxLiability: 4_000, taxableIncome: 40_000 }), true);
  });

  test('the hash is a hex SHA-256', () => {
    const hash = hashCalculationResult({ a: 1 });
    assert.match(hash, /^[0-9a-f]{64}$/);
  });

  test('summary extracts the figures a history list needs', () => {
    const summary = summariseCalculation({
      taxableIncome: 51_780,
      finalTaxLiability: 6_120.5,
      balancePayableOrRefund: -879.5,
      calculatedAt: '2026-11-09T09:00:00.000Z',
    });
    assert.deepStrictEqual(summary, {
      taxableIncome: 51_780,
      finalTaxLiability: 6_120.5,
      balancePayableOrRefund: -879.5,
      generatedAt: '2026-11-09T09:00:00.000Z',
    });
  });

  test('summary tolerates a partial or empty result', () => {
    assert.deepStrictEqual(summariseCalculation(null), {
      taxableIncome: 0,
      finalTaxLiability: 0,
      balancePayableOrRefund: 0,
      generatedAt: null,
    });
    assert.strictEqual(summariseCalculation({ taxableIncome: 'nope' }).taxableIncome, 0);
  });

  test('NaN and undefined never leak into a hash', () => {
    // JSON.stringify drops undefined and turns NaN into null — both are stable.
    const withUndefined = { a: 1, b: undefined };
    const withoutB = { a: 1 };
    assert.strictEqual(hashCalculationResult(withUndefined), hashCalculationResult(withoutB));
  });
});
