import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  FACT_INCLUSION_DOWNGRADE_MESSAGE,
  factInclusionWarning,
} from '../src/lib/fact-inclusion';

/**
 * The API downgrades `isIncludedInReturn` to false when the source document is only
 * shared for discussion. The client must surface that, because the figure is saved but
 * the return does not use it — a silent downgrade would make the taxpayer believe a
 * deduction is claimed when it is not.
 *
 * The interesting case is the third one: an absent flag is **not** a downgrade. Warning
 * on `undefined` would fire on every older payload and train users to ignore the banner.
 */
describe('fact inclusion downgrade', () => {
  it('warns only when the client asked for inclusion and the server refused', () => {
    assert.equal(factInclusionWarning(true, false), FACT_INCLUSION_DOWNGRADE_MESSAGE);
  });

  it('stays quiet when the server honoured the request', () => {
    assert.equal(factInclusionWarning(true, true), null);
  });

  it('stays quiet when the client did not ask for inclusion', () => {
    assert.equal(factInclusionWarning(false, false), null);
    assert.equal(factInclusionWarning(false, true), null);
  });

  it('treats an absent flag as unknown, not as a refusal', () => {
    assert.equal(factInclusionWarning(true, null), null);
    assert.equal(factInclusionWarning(true, undefined), null);
  });

  it('carries a message that names the fix', () => {
    assert.match(FACT_INCLUSION_DOWNGRADE_MESSAGE, /NOT included in the return/);
    assert.match(FACT_INCLUSION_DOWNGRADE_MESSAGE, /Proposed for return/);
    assert.match(FACT_INCLUSION_DOWNGRADE_MESSAGE, /Included in return/);
  });
});
