import { test, describe } from 'node:test';
import assert from 'node:assert';
import { TaxClass, TaxResidence } from '@luxtax/contracts';
import { resolveChildReliefHistory } from '../src/child-relief';
import { LuxembourgTaxEngine } from '../src/index';

const salary = (amount = 60_000) => [
  { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount },
];

const run = (extra: Record<string, unknown>) =>
  LuxembourgTaxEngine.calculate({
    taxYear: 2025,
    taxClass: TaxClass.CLASS_1,
    residence: TaxResidence.RESIDENT,
    primaryUserId: 'u1',
    facts: salary(),
    ...extra,
  } as never);

describe('Art. 123bis per-child history', () => {
  test('a child moderated this year with no allowance creates the dégrèvement only', () => {
    const result = resolveChildReliefHistory(
      [{ childId: 'A', moderationThisYear: true, benefitReceived: false }],
      2025,
    );
    assert.strictEqual(result.moderationCount, 1);
    assert.strictEqual(result.degrevementChildren, 1);
    assert.strictEqual(result.bonificationChildren, 0);
    assert.deepStrictEqual(result.warnings, []);
  });

  test('an allowance paid for a moderated child blocks the dégrèvement', () => {
    const result = resolveChildReliefHistory(
      [{ moderationThisYear: true, benefitReceived: true }],
      2025,
    );
    assert.strictEqual(result.moderationCount, 1);
    assert.strictEqual(result.degrevementChildren, 0);
  });

  test('a moderation ended one or two years ago opens the bonification', () => {
    for (const endYear of [2024, 2023]) {
      const result = resolveChildReliefHistory([{ moderationEndYear: endYear }], 2025);
      assert.strictEqual(result.bonificationChildren, 1, `end year ${endYear}`);
    }
  });

  test('a moderation ended three years ago is outside the two-year window', () => {
    const result = resolveChildReliefHistory([{ moderationEndYear: 2022 }], 2025);
    assert.strictEqual(result.bonificationChildren, 0);
    assert.deepStrictEqual(result.warnings, []);
  });

  test('a moderation still running cannot create a bonification', () => {
    const result = resolveChildReliefHistory([{ moderationEndYear: 2025 }], 2025);
    assert.strictEqual(result.bonificationChildren, 0);
    assert.ok(result.warnings.some((w) => /moderation ends in 2025/.test(w)));
  });

  test('the two-bonification lifetime cap is enforced', () => {
    const two = resolveChildReliefHistory(
      [{ moderationEndYear: 2024, bonificationsGranted: 2 }],
      2025,
    );
    assert.strictEqual(two.bonificationChildren, 0);
    assert.ok(two.warnings.some((w) => /lifetime maximum is two/.test(w)));

    const one = resolveChildReliefHistory(
      [{ moderationEndYear: 2024, bonificationsGranted: 1 }],
      2025,
    );
    assert.strictEqual(one.bonificationChildren, 1);
  });

  test('a child counted in both reliefs is refused and named', () => {
    const result = resolveChildReliefHistory(
      [{ childId: 'A', moderationThisYear: true, moderationEndYear: 2024 }],
      2025,
    );
    assert.strictEqual(result.bonificationChildren, 0);
    assert.ok(result.warnings.some((w) => /A still generates a modération/.test(w)));
  });

  test('résidence alternée is admitted only in 2025–2026 with all three conditions', () => {
    const entry = {
      moderationEndYear: 2024,
      inHousehold: false,
      residenceAlternee: true,
      jointParentalAuthority: true,
      familyAllowanceReceived: true,
    };
    assert.strictEqual(resolveChildReliefHistory([entry], 2025).bonificationChildren, 1);
    assert.strictEqual(resolveChildReliefHistory([entry], 2026).bonificationChildren, 1);
    assert.strictEqual(resolveChildReliefHistory([entry], 2027).bonificationChildren, 0);

    const missing = resolveChildReliefHistory(
      [{ ...entry, familyAllowanceReceived: false }],
      2025,
    );
    assert.strictEqual(missing.bonificationChildren, 0);
    assert.ok(missing.warnings.some((w) => /résidence-alternée/.test(w)));
  });

  test('a missing moderation end year warns instead of guessing', () => {
    const result = resolveChildReliefHistory([{ childId: 'B' }], 2025);
    assert.strictEqual(result.bonificationChildren, 0);
    assert.ok(result.warnings.some((w) => /B has no moderation end year/.test(w)));
  });

  test('the engine prefers the per-child history over the scalar counts', () => {
    const withHistory = run({
      childrenWithBonification: 5,
      childReliefHistory: [{ moderationEndYear: 2024 }],
    });
    assert.strictEqual(withHistory.childRelief.bonificationChildren, 1);

    const scalarOnly = run({ childrenWithBonification: 2 });
    assert.strictEqual(scalarOnly.childRelief.bonificationChildren, 2);
  });
});

describe('Art. 111bis clamp is visible (LEG-6 W1)', () => {
  test('two declared souscripteurs on a single filer warn', () => {
    const result = run({ art111bisContributors: 2 });
    assert.ok(
      result.warnings.some((w) => /Art\. 111bis: 2 souscripteur/.test(w)),
      'expected the clamp warning',
    );
  });

  test('one declared souscripteur does not warn', () => {
    const result = run({ art111bisContributors: 1 });
    assert.ok(!result.warnings.some((w) => /Art\. 111bis/.test(w)));
  });
});

describe('Class 2 without spouse is labelled (LEG-6 W1)', () => {
  test('the flag survives into the DTO and the assessment mode stays Class 2', () => {
    const result = run({ taxClass: TaxClass.CLASS_2, class2WithoutSpouse: true });
    assert.strictEqual(result.class2WithoutSpouse, true);
    assert.strictEqual(result.assessmentMode, 'COLLECTIVE');
  });
});

describe('DS 1553 is the covered total, not the minimum forfait', () => {
  test('specialExpensesCovered sums the DS lines covered by the minimum', () => {
    const result = run({
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 },
        { id: 'f2', category: 'INSURANCE_DEDUCTION', fieldKey: 'insurance', amount: 400 },
        { id: 'f3', category: 'PENSION_SAVINGS_111BIS', fieldKey: 'pension111bis', amount: 3_200 },
      ],
    });
    assert.strictEqual(result.deductions.specialExpensesCovered, 3_600);
    assert.ok(result.deductions.specialExpensesForfait > 0);
    assert.ok(result.deductions.specialExpensesTotal >= result.deductions.specialExpensesCovered);
  });
});

describe('Per-child history drives the CIM gate and the caps (MF-2)', () => {
  test('a moderated child in the history enables the CIM', () => {
    const result = run({
      taxClass: TaxClass.CLASS_1A,
      isSingleParent: true,
      facts: salary(40_000),
      childReliefHistory: [{ moderationThisYear: true, benefitReceived: true }],
    });
    assert.ok(result.credits.cim > 0, 'expected a CIM for a moderated child');
  });

  test('an expired child alone does not enable the CIM', () => {
    const result = run({
      taxClass: TaxClass.CLASS_1A,
      isSingleParent: true,
      facts: salary(40_000),
      childReliefHistory: [{ moderationEndYear: 2024 }],
    });
    assert.strictEqual(result.credits.cim, 0);
  });
});

describe('Non-resident without assimilation ignores itemised foreign income (MF-4)', () => {
  test('the foreign item neither raises the base nor earns a credit', () => {
    const base = {
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.NON_RESIDENT,
      primaryUserId: 'u1',
      facts: salary(60_000),
    };
    const without = LuxembourgTaxEngine.calculate(base as never);
    const withItem = LuxembourgTaxEngine.calculate({
      ...base,
      foreignIncomeItems: [{ country: 'DE', amount: 20_000, foreignTax: 2_000 }],
    } as never);

    assert.strictEqual(withItem.taxableIncome, without.taxableIncome);
    assert.strictEqual(withItem.baseTax, without.baseTax);
    assert.strictEqual(withItem.credits.foreignTaxCredit, 0);
    assert.ok(withItem.warnings.some((w) => /itemised foreign income was ignored/.test(w)));
  });
});
