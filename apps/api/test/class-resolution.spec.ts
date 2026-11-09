import { test, describe } from 'node:test';
import assert from 'node:assert';
import { TaxClass, type QuestionnaireAnswersDto } from '@luxtax/contracts';
import {
  classWindowWarning,
  deriveIsSingleParent,
  deriveTaxClass,
  isScenarioComparisonEligible,
  selectFilerMembers,
  shouldPersist,
  spouseEndsAtEvent,
} from '../src/modules/calculations/class-resolution';

describe('class resolution — Art. 154ter single-parent default', () => {
  test('a single, divorced or widowed parent with a moderated child is a single parent', () => {
    for (const maritalStatus of ['SINGLE', 'DIVORCED', 'WIDOWED']) {
      assert.strictEqual(deriveIsSingleParent(maritalStatus, 1, undefined), true, maritalStatus);
    }
  });

  test('an explicit false is respected', () => {
    assert.strictEqual(deriveIsSingleParent('DIVORCED', 1, false), false);
    assert.strictEqual(deriveIsSingleParent('SINGLE', 2, false), false);
  });

  test('married and PACS parents are not single parents', () => {
    assert.strictEqual(deriveIsSingleParent('MARRIED', 1, undefined), false);
    assert.strictEqual(deriveIsSingleParent('PACS', 1, undefined), false);
  });

  test('no moderated child means no single-parent CIM', () => {
    assert.strictEqual(deriveIsSingleParent('SINGLE', 0, undefined), false);
    assert.strictEqual(deriveIsSingleParent('DIVORCED', 0, undefined), false);
    assert.strictEqual(deriveIsSingleParent('WIDOWED', 0, undefined), false);
  });
});

describe('class resolution — Art. 119 / 3 / 3bis / 3ter class assignment', () => {
  test('single with a moderated child is Class 1a', () => {
    assert.strictEqual(deriveTaxClass(null, 'SINGLE', {}, 1, 2025), TaxClass.CLASS_1A);
  });

  test('divorced without a moderated child is Class 1', () => {
    assert.strictEqual(deriveTaxClass(null, 'DIVORCED', {}, 0, 2025), TaxClass.CLASS_1);
  });

  test('widowed is Class 1a regardless of children', () => {
    assert.strictEqual(deriveTaxClass(null, 'WIDOWED', {}, 0, 2025), TaxClass.CLASS_1A);
  });

  test('married is Class 2', () => {
    assert.strictEqual(deriveTaxClass(null, 'MARRIED', {}, 0, 2025), TaxClass.CLASS_2);
  });

  test('PACS with a collective assessment is Class 2', () => {
    assert.strictEqual(deriveTaxClass(null, 'PACS', { assessmentMode: 'COLLECTIVE' }, 0, 2025), TaxClass.CLASS_2);
  });

  test('accepts the Partial<QuestionnaireAnswersDto> shape used by the service', () => {
    const answers: Partial<QuestionnaireAnswersDto> = {
      maritalStatus: 'DIVORCED',
      childrenCount: 1,
      assessmentMode: 'COLLECTIVE',
    };
    assert.strictEqual(deriveTaxClass(null, answers.maritalStatus, answers, 1, 2025), TaxClass.CLASS_1A);
    assert.strictEqual(deriveIsSingleParent(answers.maritalStatus, 1, answers.isSingleParent), true);
  });

  test('an explicit workspace class still wins', () => {
    assert.strictEqual(deriveTaxClass(TaxClass.CLASS_1, 'SINGLE', {}, 1, 2025), TaxClass.CLASS_1);
    assert.strictEqual(deriveTaxClass(TaxClass.CLASS_2, 'DIVORCED', {}, 0, 2025), TaxClass.CLASS_2);
  });
});

describe('class resolution — Art. 119 n° 3 b–c three-year Class 2 window', () => {
  test('a widow keeps Class 2 for the death year and the three following years', () => {
    const answers = { spouseDeathYear: 2024 };
    assert.strictEqual(deriveTaxClass(null, 'WIDOWED', answers, 0, 2024), TaxClass.CLASS_2);
    assert.strictEqual(deriveTaxClass(null, 'WIDOWED', answers, 0, 2025), TaxClass.CLASS_2);
    assert.strictEqual(deriveTaxClass(null, 'WIDOWED', answers, 0, 2027), TaxClass.CLASS_2);
    assert.strictEqual(deriveTaxClass(null, 'WIDOWED', answers, 0, 2028), TaxClass.CLASS_1A);
  });

  test('a widow without a death year falls back to Class 1a and warns', () => {
    assert.strictEqual(deriveTaxClass(null, 'WIDOWED', {}, 0, 2025), TaxClass.CLASS_1A);
    assert.ok(classWindowWarning('WIDOWED', {}));
  });

  test('a recently divorced filer with five prior years of Class 2 keeps Class 2', () => {
    const answers = { divorceOrSeparationYear: 2023, class2BeforeEvent: true };
    assert.strictEqual(deriveTaxClass(null, 'DIVORCED', answers, 0, 2025), TaxClass.CLASS_2);
    assert.strictEqual(deriveTaxClass(null, 'DIVORCED', answers, 0, 2026), TaxClass.CLASS_2);
    assert.strictEqual(deriveTaxClass(null, 'DIVORCED', answers, 0, 2027), TaxClass.CLASS_1);
  });

  test('a divorced filer without the five-year condition is not Class 2', () => {
    const answers = { divorceOrSeparationYear: 2023, class2BeforeEvent: false };
    assert.strictEqual(deriveTaxClass(null, 'DIVORCED', answers, 0, 2025), TaxClass.CLASS_1);
    assert.strictEqual(deriveTaxClass(null, 'DIVORCED', answers, 1, 2025), TaxClass.CLASS_1A);
  });

  test('a divorced filer without a divorce year falls back and warns', () => {
    const answers = { class2BeforeEvent: true };
    assert.strictEqual(deriveTaxClass(null, 'DIVORCED', answers, 0, 2025), TaxClass.CLASS_1);
    assert.ok(classWindowWarning('DIVORCED', answers));
  });

  test('the window warning is null when the window is checkable or not applicable', () => {
    assert.strictEqual(classWindowWarning('WIDOWED', { spouseDeathYear: 2024 }), null);
    assert.strictEqual(classWindowWarning('DIVORCED', { divorceOrSeparationYear: 2023 }), null);
    assert.strictEqual(classWindowWarning('SINGLE', {}), null);
    assert.strictEqual(classWindowWarning('MARRIED', {}), null);
    assert.strictEqual(classWindowWarning('PACS', {}), null);
  });
});


describe('member selection — role-aware spouse resolution (LEG-6 blocker)', () => {
  const member = (userId: string, role: string) => ({ userId, role });

  test('PRIMARY_FILER + CO_FILER: the CO_FILER is the spouse', () => {
    assert.deepStrictEqual(
      selectFilerMembers([member('u1', 'PRIMARY_FILER'), member('u2', 'CO_FILER')]),
      { primaryUserId: 'u1', spouseUserId: 'u2' },
    );
    // The primary filer wins wherever the query returns it.
    assert.deepStrictEqual(
      selectFilerMembers([member('u2', 'CO_FILER'), member('u1', 'PRIMARY_FILER')]),
      { primaryUserId: 'u1', spouseUserId: 'u2' },
    );
  });

  test('PRIMARY_FILER + VIEWER: a VIEWER is never a spouse', () => {
    assert.deepStrictEqual(
      selectFilerMembers([member('u1', 'PRIMARY_FILER'), member('u2', 'VIEWER')]),
      { primaryUserId: 'u1', spouseUserId: null },
    );
  });

  test('a lone CO_FILER is the primary and has no spouse', () => {
    assert.deepStrictEqual(selectFilerMembers([member('u1', 'CO_FILER')]), {
      primaryUserId: 'u1',
      spouseUserId: null,
    });
  });

  test('two CO_FILERs: the first is primary, the second the spouse', () => {
    assert.deepStrictEqual(
      selectFilerMembers([member('u1', 'CO_FILER'), member('u2', 'CO_FILER')]),
      { primaryUserId: 'u1', spouseUserId: 'u2' },
    );
  });

  test('no filer (VIEWER only): no primary and no spouse', () => {
    assert.deepStrictEqual(selectFilerMembers([member('u1', 'VIEWER')]), {
      primaryUserId: null,
      spouseUserId: null,
    });
    assert.deepStrictEqual(selectFilerMembers([]), { primaryUserId: null, spouseUserId: null });
  });

  test('the acting CO_FILER is the primary and the other primary the spouse', () => {
    // A married couple where the co-filer runs the calculation must not compute
    // on the primary's side while keeping both collective extras.
    assert.deepStrictEqual(
      selectFilerMembers([member('u1', 'PRIMARY_FILER'), member('u2', 'CO_FILER')], 'u2'),
      { primaryUserId: 'u2', spouseUserId: 'u1' },
    );
  });

  test('the acting PRIMARY_FILER stays the primary', () => {
    assert.deepStrictEqual(
      selectFilerMembers([member('u2', 'CO_FILER'), member('u1', 'PRIMARY_FILER')], 'u1'),
      { primaryUserId: 'u1', spouseUserId: 'u2' },
    );
  });

  test('an actor who is not a filer does not lead the selection', () => {
    assert.deepStrictEqual(
      selectFilerMembers(
        [member('u1', 'PRIMARY_FILER'), member('u2', 'CO_FILER'), member('u3', 'VIEWER')],
        'u3',
      ),
      { primaryUserId: 'u1', spouseUserId: 'u2' },
    );
    assert.deepStrictEqual(selectFilerMembers([member('u1', 'CO_FILER')], 'u9'), {
      primaryUserId: 'u1',
      spouseUserId: null,
    });
  });
});

describe('spouse ends at event — Art. 119 n° 3 b–c (LEG-6 blocker)', () => {
  const member = (userId: string, role: string) => ({ userId, role });

  test('a widow(er) has no current spouse — death year or not', () => {
    assert.strictEqual(spouseEndsAtEvent('WIDOWED', { spouseDeathYear: 2024 }, 2024), true);
    assert.strictEqual(spouseEndsAtEvent('WIDOWED', { spouseDeathYear: 2024 }, 2025), true);
    // A future year does not revive the marriage: the status already ended it.
    assert.strictEqual(spouseEndsAtEvent('WIDOWED', { spouseDeathYear: 2024 }, 2023), true);
    // Missing year (LEG-6 round 3): the stale ACTIVE co-filer is still no spouse.
    assert.strictEqual(spouseEndsAtEvent('WIDOWED', {}, 2025), true);
  });

  test('a divorced filer has no current spouse — divorce year or not', () => {
    assert.strictEqual(spouseEndsAtEvent('DIVORCED', { divorceOrSeparationYear: 2023 }, 2023), true);
    assert.strictEqual(spouseEndsAtEvent('DIVORCED', { divorceOrSeparationYear: 2022 }, 2025), true);
    assert.strictEqual(spouseEndsAtEvent('DIVORCED', { divorceOrSeparationYear: 2026 }, 2025), true);
    assert.strictEqual(spouseEndsAtEvent('DIVORCED', {}, 2025), true);
  });

  test('married, PACS, single or unknown status keeps the spouse', () => {
    assert.strictEqual(spouseEndsAtEvent('MARRIED', { spouseDeathYear: 2024 }, 2025), false);
    assert.strictEqual(spouseEndsAtEvent('MARRIED', {}, 2025), false);
    assert.strictEqual(spouseEndsAtEvent('PACS', { divorceOrSeparationYear: 2023 }, 2025), false);
    assert.strictEqual(spouseEndsAtEvent('PACS', {}, 2025), false);
    assert.strictEqual(spouseEndsAtEvent('SINGLE', { spouseDeathYear: 2024 }, 2025), false);
    assert.strictEqual(spouseEndsAtEvent('SINGLE', {}, 2025), false);
    assert.strictEqual(spouseEndsAtEvent(undefined, { spouseDeathYear: 2024 }, 2025), false);
  });

  test('the status decides the spouse link; the year only decides the Class 2 window', () => {
    // Same missing year, same tax year: the spouse link ends, the window stays
    // unchecked and warns, so the default class is applied rather than Class 2.
    assert.strictEqual(spouseEndsAtEvent('WIDOWED', {}, 2025), true);
    assert.strictEqual(spouseEndsAtEvent('DIVORCED', {}, 2025), true);
    assert.strictEqual(deriveTaxClass(null, 'WIDOWED', {}, 0, 2025), TaxClass.CLASS_1A);
    assert.ok(classWindowWarning('WIDOWED', {}));
    // The year-boundary behaviour of the window itself is unchanged.
    assert.strictEqual(deriveTaxClass(null, 'WIDOWED', { spouseDeathYear: 2024 }, 0, 2027), TaxClass.CLASS_2);
    assert.strictEqual(deriveTaxClass(null, 'WIDOWED', { spouseDeathYear: 2024 }, 0, 2028), TaxClass.CLASS_1A);
  });

  test('accepts the Partial<QuestionnaireAnswersDto> shape used by the service', () => {
    const answers: Partial<QuestionnaireAnswersDto> = { spouseDeathYear: 2024 };
    assert.strictEqual(spouseEndsAtEvent('WIDOWED', answers, 2025), true);
  });

  test('a widow with an ACTIVE CO_FILER and no death year: the service nulls the spouse', () => {
    // The service seam (calculations.service.ts:113-115) is
    // `spouseMember = spouseIsFormer ? null : selectedSpouseMember`; selection
    // still names the stale row, the status gate then forces `spouseUserId` to
    // null. The two pure steps are run here; the Nest service branch itself is
    // inspected, not run (this harness has no Prisma).
    const members = [member('widow', 'CO_FILER'), member('deceased', 'PRIMARY_FILER')];
    const selection = selectFilerMembers(members, 'widow');
    const spouseIsFormer = spouseEndsAtEvent('WIDOWED', {}, 2025);
    assert.strictEqual(selection.spouseUserId, 'deceased');
    assert.strictEqual(spouseIsFormer, true);
    assert.strictEqual(spouseIsFormer ? null : selection.spouseUserId, null);
  });
});

describe('scenario comparison eligibility — LEG-8 comparability blocker', () => {
  test('a married Class 2 couple with an assessed spouse is eligible', () => {
    assert.strictEqual(isScenarioComparisonEligible('MARRIED', TaxClass.CLASS_2, true), true);
  });

  test('a married Class 2 filer without an assessed spouse is not eligible', () => {
    // No joined CO_FILER: there is no second taxpayer to compare against.
    assert.strictEqual(isScenarioComparisonEligible('MARRIED', TaxClass.CLASS_2, false), false);
  });

  test('a widow(er), divorced, PACS or single filer is never eligible, even in Class 2', () => {
    // A widow(er)/divorced filer in the Art. 119 n° 3 window keeps Class 2 but
    // has no spouse; a PACS couple may only reallocate (Art. 3ter), never file
    // as pure individuals.
    for (const maritalStatus of ['WIDOWED', 'DIVORCED', 'PACS', 'SINGLE']) {
      assert.strictEqual(
        isScenarioComparisonEligible(maritalStatus, TaxClass.CLASS_2, true),
        false,
        maritalStatus,
      );
    }
    assert.strictEqual(isScenarioComparisonEligible(undefined, TaxClass.CLASS_2, true), false);
  });

  test('a married couple outside Class 2 is not eligible', () => {
    assert.strictEqual(isScenarioComparisonEligible('MARRIED', TaxClass.CLASS_1, true), false);
    assert.strictEqual(isScenarioComparisonEligible('MARRIED', TaxClass.CLASS_1A, true), false);
  });
});

describe('calculation options — persist guard (LEG-8 test seam)', () => {
  test('persist defaults to true', () => {
    assert.strictEqual(shouldPersist(), true);
    assert.strictEqual(shouldPersist({}), true);
    assert.strictEqual(shouldPersist({ persist: true }), true);
  });

  test('persist: false skips the workspace write and the audit event', () => {
    assert.strictEqual(shouldPersist({ persist: false }), false);
  });
});