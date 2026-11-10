/**
 * "Quick Load demo facts" inserted the same six figures on every click, and the
 * engine sums what is confirmed: two clicks produced €225,000 of gross salary
 * instead of €75,000. The loader now skips a figure that is already recorded on
 * the same category + field box.
 */
import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { FactCategory } from '@luxtax/contracts';

import { factKey, findFact, splitNewFacts } from '../src/lib/fact-dedup';

const DEMO = [
  { category: FactCategory.EMPLOYMENT_INCOME, fieldKey: 'grossSalary', amount: '75000.00' },
  { category: FactCategory.MORTGAGE_INTEREST, fieldKey: 'mortgageInterest', amount: '3500.00' },
  { category: FactCategory.DONATION_DEDUCTION, fieldKey: 'donations', amount: '500.00' },
];

describe('fact de-duplication', () => {
  it('identifies a fact by category and field box', () => {
    assert.equal(
      factKey({ category: FactCategory.EMPLOYMENT_INCOME, fieldKey: 'grossSalary' }),
      'EMPLOYMENT_INCOME::grossSalary',
    );
    // The same field key in another category is a different return line.
    assert.notEqual(
      factKey({ category: FactCategory.EMPLOYMENT_INCOME, fieldKey: 'withholdingTax' }),
      factKey({ category: FactCategory.CAPITAL_INCOME, fieldKey: 'withholdingTax' }),
    );
  });

  it('treats a second load of the same demo on an empty workspace as all-new', () => {
    const { missing, present } = splitNewFacts(DEMO, []);
    assert.equal(missing.length, 3);
    assert.equal(present.length, 0);
  });

  it('adds nothing on a second click once the facts are recorded', () => {
    const recorded = DEMO.map((fact, index) => ({ ...fact, id: `fact-${index}` }));
    const { missing, present } = splitNewFacts(DEMO, recorded);
    assert.equal(missing.length, 0, 'a second click must not duplicate the salary');
    assert.equal(present.length, 3);
  });

  it('adds only the figures that are still missing', () => {
    const recorded = [{ ...DEMO[0]!, id: 'fact-0' }];
    const { missing, present } = splitNewFacts(DEMO, recorded);
    assert.deepEqual(
      missing.map((fact) => fact.fieldKey),
      ['mortgageInterest', 'donations'],
    );
    assert.deepEqual(
      present.map((fact) => fact.fieldKey),
      ['grossSalary'],
    );
  });

  it('finds the recorded fact a quick estimate would otherwise duplicate', () => {
    const recorded = [{ ...DEMO[0]!, id: 'fact-0', amount: '60000.00' }];
    const found = findFact(recorded, { category: FactCategory.EMPLOYMENT_INCOME, fieldKey: 'grossSalary' });
    assert.equal(found?.id, 'fact-0', 'the existing fact is updated, not copied');
    assert.equal(
      findFact(recorded, { category: FactCategory.EMPLOYMENT_INCOME, fieldKey: 'withholdingTax' }),
      undefined,
    );
  });
});
