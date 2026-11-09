import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import {
  LUXEMBOURG_TAX_TERMS,
  getTermTranslation,
  type SupportedLanguage,
} from '../src/translations';

/**
 * The terminology table is shown in the admin console and is the only place the app
 * spells out Luxembourg tax vocabulary in three languages. A missing or duplicated key
 * surfaces as a raw identifier in the UI, which looks like a broken product rather than
 * a missing translation, so the invariants are pinned here.
 */
const LANGUAGES: readonly SupportedLanguage[] = ['en', 'fr', 'de'];

describe('tax terminology table', () => {
  it('has unique keys', () => {
    const seen = new Set<string>();
    for (const term of LUXEMBOURG_TAX_TERMS) {
      assert.equal(seen.has(term.key), false, `duplicate key ${term.key}`);
      seen.add(term.key);
    }
  });

  it('uses key-shaped identifiers', () => {
    for (const term of LUXEMBOURG_TAX_TERMS) {
      assert.match(term.key, /^[a-z0-9_]+$/, `key ${term.key} is not snake_case`);
    }
  });

  it('is translated in every supported language', () => {
    for (const term of LUXEMBOURG_TAX_TERMS) {
      for (const lang of LANGUAGES) {
        const value = term[lang];
        assert.equal(typeof value, 'string', `${term.key}.${lang} is not a string`);
        assert.ok(value.trim().length > 0, `${term.key}.${lang} is empty`);
      }
    }
  });

  it('does not leave an English string pasted into another language', () => {
    for (const term of LUXEMBOURG_TAX_TERMS) {
      assert.notEqual(term.fr, term.en, `${term.key}: fr equals en`);
      assert.notEqual(term.de, term.en, `${term.key}: de equals en`);
    }
  });

  it('documents a legal reference for most terms', () => {
    const withReference = LUXEMBOURG_TAX_TERMS.filter((t) => t.legalReference);
    assert.ok(
      withReference.length >= LUXEMBOURG_TAX_TERMS.length - 1,
      `${LUXEMBOURG_TAX_TERMS.length - withReference.length} terms have no legal reference`,
    );
  });
});

describe('getTermTranslation', () => {
  const anyKey = LUXEMBOURG_TAX_TERMS[0]!.key;

  it('returns the requested language', () => {
    const term = LUXEMBOURG_TAX_TERMS[0]!;
    for (const lang of LANGUAGES) {
      assert.equal(getTermTranslation(anyKey, lang), term[lang]);
    }
  });

  it('defaults to English', () => {
    assert.equal(getTermTranslation(anyKey), LUXEMBOURG_TAX_TERMS[0]!.en);
  });

  it('echoes an unknown key instead of throwing, so a missing term is visible', () => {
    assert.equal(getTermTranslation('no_such_term'), 'no_such_term');
    assert.equal(getTermTranslation('no_such_term', 'fr'), 'no_such_term');
    assert.equal(getTermTranslation(''), '');
  });

  it('resolves every key in the table', () => {
    for (const term of LUXEMBOURG_TAX_TERMS) {
      assert.equal(getTermTranslation(term.key, 'de'), term.de);
    }
  });
});
