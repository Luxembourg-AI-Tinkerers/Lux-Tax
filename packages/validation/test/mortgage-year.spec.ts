import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { questionnaireSchema } from '../src/questionnaire.schema';

/**
 * The questionnaire is the only path a web or mobile user has into the engine, so a combination the
 * engine will refuse must be refused here first — with a message that says what to do.
 *
 * The case that matters: declaring a mortgage on the primary residence without the year the valeur
 * locative was fixed. The engine cannot place the taxpayer in the Art. 105 schedule, so since
 * Phase 38 it deducts nothing and warns; the questionnaire must not let the user get that far.
 */
const base = {
  maritalStatus: 'SINGLE' as const,
  hasEmploymentIncome: true,
  hasPensionIncome: false,
  hasDonations: false,
  hasLifeInsuranceOrPensionPlan: false,
};

const issuePaths = (input: unknown): string[] => {
  const result = questionnaireSchema.safeParse(input);
  return result.success ? [] : result.error.issues.map((issue) => issue.path.join('.'));
};

describe('questionnaire — mortgage fixation year', () => {
  it('accepts a household with no mortgage', () => {
    assert.deepEqual(issuePaths({ ...base, hasPrimaryResidenceMortgage: false }), []);
  });

  it('rejects a mortgage with neither a fixation year nor a construction flag', () => {
    assert.deepEqual(issuePaths({ ...base, hasPrimaryResidenceMortgage: true }), [
      'mortgageOccupancyYear',
    ]);
  });

  it('accepts a mortgage once the fixation year is supplied', () => {
    assert.deepEqual(
      issuePaths({
        ...base,
        hasPrimaryResidenceMortgage: true,
        mortgageOccupancyYear: 2019,
      }),
      [],
    );
  });

  it('accepts a home still under construction without a fixation year', () => {
    assert.deepEqual(
      issuePaths({
        ...base,
        hasPrimaryResidenceMortgage: true,
        mortgageBeforeDisposition: true,
      }),
      [],
    );
  });

  it('does not demand a year for a non-owner-occupied mortgage answer', () => {
    // hasPrimaryResidenceMortgage is the owner-occupier gate; anything else keeps the year optional.
    assert.deepEqual(
      issuePaths({ ...base, hasPrimaryResidenceMortgage: false, mortgageOccupancyYear: undefined }),
      [],
    );
  });

  it('explains the consequence in the message', () => {
    const result = questionnaireSchema.safeParse({ ...base, hasPrimaryResidenceMortgage: true });
    assert.equal(result.success, false);
    const message = result.success ? '' : result.error.issues[0]!.message;
    assert.match(message, /year the valeur locative was fixed is required/);
    assert.match(message, /would not be deducted/);
  });
});
