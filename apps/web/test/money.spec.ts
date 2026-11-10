/**
 * One euro formatter for the whole web client (defect: every view formatted its
 * own amounts, and a null balance rendered as "€0.00").
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { NO_AMOUNT, formatEuro } from '../src/lib/money';

describe('formatEuro — the single money formatter', () => {
  it('formats with the euro sign, a fixed locale and two decimals', () => {
    assert.equal(formatEuro(75000), '€75,000.00');
    assert.equal(formatEuro(1234.5), '€1,234.50');
    assert.equal(formatEuro('3500.00'), '€3,500.00');
  });

  it('renders an absent amount as a dash, never as zero', () => {
    assert.equal(formatEuro(null), NO_AMOUNT);
    assert.equal(formatEuro(undefined), NO_AMOUNT);
    assert.equal(formatEuro(''), NO_AMOUNT);
    assert.notEqual(NO_AMOUNT, formatEuro(0));
  });

  it('keeps a real zero a zero', () => {
    assert.equal(formatEuro(0), '€0.00');
    assert.equal(formatEuro('0.00'), '€0.00');
  });

  it('refuses to invent a number for unparseable input', () => {
    assert.equal(formatEuro('not-a-number'), NO_AMOUNT);
    assert.equal(formatEuro(Number.NaN), NO_AMOUNT);
  });

  it('keeps the sign of a refund balance', () => {
    assert.equal(formatEuro(-1234.5), '-€1,234.50');
  });
});
