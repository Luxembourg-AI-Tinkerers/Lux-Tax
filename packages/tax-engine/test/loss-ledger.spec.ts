import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TaxClass, TaxResidence } from '@luxtax/contracts';
import { LuxembourgTaxEngine } from '../src/index';

/**
 * Art. 114 — the carry-forward ledger.
 *
 * The scalar `priorYearLosses` has no year, so it cannot be checked against the 17-year window. The
 * ledger can, and when it is supplied it must be **authoritative**: taking the larger of the two
 * would let a stale total resurrect losses that have already expired.
 */
const base = {
  taxClass: TaxClass.CLASS_1,
  residence: TaxResidence.RESIDENT,
  primaryUserId: 'u1',
  taxYear: 2025,
} as const;

const salaryFacts = [
  { id: 'f0', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 },
  { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'socialSecurity', amount: 0 },
] as never;

const priorLossesOf = (params: Record<string, unknown>): number =>
  (
    LuxembourgTaxEngine.calculate({ ...base, ...params, facts: salaryFacts } as never) as unknown as {
      deductions: { priorLosses: number };
    }
  ).deductions.priorLosses;

describe('Art. 114 — loss ledger', () => {
  it('sums the entries inside the 17-year window', () => {
    const applied = priorLossesOf({
      lossCarryForward: [
        { year: 2024, amount: 5_000 },
        { year: 2015, amount: 3_000 },
      ],
    });
    assert.equal(applied, 8_000);
  });

  it('ignores an entry that fell out of the window', () => {
    // 2025 − 2005 = 20 years: expired.
    const applied = priorLossesOf({ lossCarryForward: [{ year: 2005, amount: 40_000 }] });
    assert.equal(applied, 0);
  });

  it('keeps an entry exactly 17 years old', () => {
    const applied = priorLossesOf({ lossCarryForward: [{ year: 2008, amount: 7_000 }] });
    assert.equal(applied, 7_000);
  });

  it('does not let a stale scalar outrank a smaller valid ledger', () => {
    // The bug this guards: max(ledger, scalar) would apply the 90 000 that partly expired.
    const applied = priorLossesOf({
      lossCarryForward: [{ year: 2024, amount: 5_000 }],
      priorYearLosses: 90_000,
    });
    assert.equal(applied, 5_000);
  });

  it('falls back to the scalar when no ledger is supplied', () => {
    assert.equal(priorLossesOf({ priorYearLosses: 12_000 }), 12_000);
  });

  it('uses the ledger even when every entry has expired', () => {
    const applied = priorLossesOf({
      lossCarryForward: [{ year: 2000, amount: 50_000 }],
      priorYearLosses: 50_000,
    });
    assert.equal(applied, 0, 'an all-expired ledger must not fall back to the scalar');
  });

  it('ignores non-positive ledger entries', () => {
    const applied = priorLossesOf({
      lossCarryForward: [
        { year: 2024, amount: 0 },
        { year: 2024, amount: -1_000 },
        { year: 2023, amount: 2_000 },
      ],
    });
    assert.equal(applied, 2_000);
  });
});
