import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { TaxClass, TaxResidence } from '@luxtax/contracts';
import { LuxembourgTaxEngine } from '../src/index';

/**
 * Art. 3 d) — mixed resident/non-resident couple.
 *
 * A couple split between Luxembourg and abroad is taxed separately unless it asks for collective
 * assessment **and** the resident spouse realises at least 90 % of the household professional income
 * in Luxembourg. These two inputs were reachable from the engine but from nowhere in the app before
 * Phase 44, so none of this could ever trigger.
 */
const base = {
  taxClass: TaxClass.CLASS_2,
  residence: TaxResidence.RESIDENT,
  primaryUserId: 'u1',
  spouseUserId: 'u2',
  taxYear: 2025,
  facts: [
    { id: 'f0', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 80_000 },
    { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', ownerId: 'u2', amount: 20_000 },
  ] as never,
};

const run = (params: Record<string, unknown>) =>
  LuxembourgTaxEngine.calculate({ ...base, ...params } as never);

describe('Art. 3 d) — mixed couple gate', () => {
  it('taxes a mixed couple separately when collective assessment is not requested', () => {
    const result = run({ spouseResidence: 'NON_RESIDENT' });
    assert.ok(
      result.warnings.some((w) => w.includes('Mixed resident/non-resident couple')),
      JSON.stringify(result.warnings),
    );
    assert.equal(
      result.provenance.some((p) => p.ruleCode === 'LIR-ART-3-d'),
      false,
      'no Art. 3 d) admission without a request',
    );
  });

  it('admits collective assessment when >= 90 % of professional income is Luxembourg', () => {
    const result = run({
      spouseResidence: 'NON_RESIDENT',
      mixedCoupleCollectiveRequested: true,
      luxembourgProfessionalIncome: 95_000,
      householdProfessionalIncome: 100_000,
    });
    assert.ok(
      result.provenance.some((p) => p.ruleCode === 'LIR-ART-3-d'),
      'expected the Art. 3 d) admission line',
    );
  });

  it('refuses the request when the Luxembourg share is below 90 %', () => {
    const result = run({
      spouseResidence: 'NON_RESIDENT',
      mixedCoupleCollectiveRequested: true,
      luxembourgProfessionalIncome: 70_000,
      householdProfessionalIncome: 100_000,
    });
    assert.equal(
      result.provenance.some((p) => p.ruleCode === 'LIR-ART-3-d'),
      false,
    );
    assert.ok(
      result.warnings.some((w) => w.includes('at least 90 %')),
      JSON.stringify(result.warnings),
    );
  });

  it('ignores the request when both spouses are resident', () => {
    const bothResident = run({ spouseResidence: 'RESIDENT', mixedCoupleCollectiveRequested: true });
    assert.equal(
      bothResident.provenance.some((p) => p.ruleCode === 'LIR-ART-3-d'),
      false,
      'a same-country couple does not need Art. 3 d)',
    );
    assert.ok(
      !bothResident.warnings.some((w) => w.includes('Mixed resident/non-resident couple')),
    );
  });

  it('is unaffected by the request when the spouse residence is unknown', () => {
    const unknown = run({ mixedCoupleCollectiveRequested: true });
    assert.equal(unknown.provenance.some((p) => p.ruleCode === 'LIR-ART-3-d'), false);
  });
});
