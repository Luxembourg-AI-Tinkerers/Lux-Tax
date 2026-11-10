import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { questionnaireSchema } from '../src/questionnaire.schema';

/**
 * Defect 5 (questionnaire side): a dated answer after the tax year is refused.
 *
 * The engine derives an age from these years — completion year → Art. 98
 * amortisation band, fixation year → Art. 105 interest band, loss year → the
 * 17-year carry-forward window. A year in the future gives a negative age and
 * the wrong band, so the questionnaire must not let the user store one.
 *
 * The clamp uses the `taxYear` the caller supplies with the answers. The engine
 * also ignores a future-dated entry with a warning, so a client that omits the
 * year still cannot have it used.
 */
const base = {
  maritalStatus: 'SINGLE' as const,
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

describe('questionnaire — future-dated years', () => {
  it('rejects a valeur-locative fixation year after the tax year', () => {
    assert.deepEqual(
      issuePaths({ ...base, taxYear: 2025, mortgageOccupancyYear: 2030 }),
      ['mortgageOccupancyYear'],
    );
  });

  it('rejects a rental completion year after the tax year', () => {
    assert.deepEqual(
      issuePaths({ ...base, taxYear: 2025, rentalCompletionYear: 2030 }),
      ['rentalCompletionYear'],
    );
  });

  it('rejects a loss year after the tax year', () => {
    assert.deepEqual(
      issuePaths({ ...base, taxYear: 2025, lossCarryForward: [{ year: 2027, amount: 1_000 }] }),
      ['lossCarryForward.0.year'],
    );
  });

  it('accepts the tax year itself and any past year', () => {
    assert.deepEqual(
      issuePaths({
        ...base,
        taxYear: 2025,
        mortgageOccupancyYear: 2025,
        rentalCompletionYear: 1998,
        lossCarryForward: [{ year: 2019, amount: 1_000 }],
      }),
      [],
    );
  });

  it('explains which year is impossible', () => {
    const result = questionnaireSchema.safeParse({
      ...base,
      taxYear: 2025,
      mortgageOccupancyYear: 2030,
    });
    assert.equal(result.success, false);
    const message = result.success ? '' : result.error.issues[0]!.message;
    assert.match(message, /2030/);
    assert.match(message, /after the tax year 2025/);
  });

  it('leaves an answer without a tax year untouched (the engine guard is the backstop)', () => {
    assert.deepEqual(issuePaths({ ...base, mortgageOccupancyYear: 2030 }), []);
  });
});
