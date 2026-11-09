import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { questionnaireSchema } from '../src/questionnaire.schema';

/**
 * Art. 3 d) needs two answers: where the spouse lives, and whether the couple asks for collective
 * assessment. Until Phase 44 there was no field for either, so the engine capability was unreachable
 * and any mixed couple silently fell into separate taxation.
 */
const base = {
  maritalStatus: 'MARRIED' as const,
  hasEmploymentIncome: true,
  hasPensionIncome: false,
  hasDonations: false,
  hasLifeInsuranceOrPensionPlan: false,
  hasPrimaryResidenceMortgage: false,
};

const issuePaths = (input: unknown): string[] => {
  const result = questionnaireSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
};

describe('questionnaire — Art. 3 d) mixed couple', () => {
  it('accepts a couple without a stated spouse residence', () => {
    assert.deepEqual(issuePaths(base), []);
  });

  it('accepts a resident and a non-resident spouse', () => {
    assert.deepEqual(issuePaths({ ...base, spouseResidence: 'RESIDENT' }), []);
    assert.deepEqual(issuePaths({ ...base, spouseResidence: 'NON_RESIDENT' }), []);
  });

  it('rejects an unknown residence value', () => {
    assert.deepEqual(issuePaths({ ...base, spouseResidence: 'MARS' }), ['spouseResidence']);
  });

  it('rejects a collective request with no spouse residence to evaluate', () => {
    assert.deepEqual(issuePaths({ ...base, mixedCoupleCollectiveRequested: true }), [
      'spouseResidence',
    ]);
  });

  it('accepts a collective request alongside a spouse residence', () => {
    assert.deepEqual(
      issuePaths({
        ...base,
        spouseResidence: 'NON_RESIDENT',
        mixedCoupleCollectiveRequested: true,
      }),
      [],
    );
  });

  it('does not require the request to be granted — the engine decides that', () => {
    // The 90 % gate belongs to the engine; validation must not pre-empt it.
    assert.deepEqual(
      issuePaths({ ...base, spouseResidence: 'NON_RESIDENT', mixedCoupleCollectiveRequested: false }),
      [],
    );
  });
});
