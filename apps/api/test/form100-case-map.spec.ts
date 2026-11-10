import { test, describe } from 'node:test';
import assert from 'node:assert';
import {
  FORM100_CASES,
  FORM100_INSTRUCTIONS,
  RECAP,
  foreignNatureSheet,
  foreignSheetPointer,
} from '../src/modules/filing/form100-case-map';
import { TaxClass, TaxResidence } from '@luxtax/contracts';
import { LuxembourgTaxEngine } from '@luxtax/tax-engine';

describe('Form 100F page / sheet / case map', () => {
  test('every entry has a page in 1-20, a non-empty sheet and a numeric case number', () => {
    for (const [key, entry] of Object.entries(FORM100_CASES)) {
      assert.ok(
        entry.page >= 1 && entry.page <= 20,
        `${key}: page ${entry.page} is outside the 20-page form`,
      );
      assert.ok(entry.sheet.trim().length > 0, `${key}: empty sheet`);
      assert.match(entry.caseNumber, /^\d{3,4}$/, `${key}: case number "${entry.caseNumber}" is not a printed case`);
    }
  });

  test('the sheet / case pairs the filing service emits are the official ones', () => {
    assert.deepStrictEqual(FORM100_CASES.salaryGross, { page: 7, sheet: 'S', caseNumber: '701' });
    assert.deepStrictEqual(FORM100_CASES.socialSecurity, { page: 16, sheet: 'DS', caseNumber: '1601' });
    assert.deepStrictEqual(FORM100_CASES.withholdingSalary, {
      page: 19,
      sheet: 'RD',
      caseNumber: '1901',
    });
    assert.deepStrictEqual(FORM100_CASES.cim, { page: 2, sheet: 'Enfants', caseNumber: '228' });
  });

  test('a case number identifies one line: no duplicate on the same page and sheet', () => {
    const seen = new Set<string>();
    for (const [key, entry] of Object.entries(FORM100_CASES)) {
      const id = `${entry.page}/${entry.sheet}/${entry.caseNumber}`;
      assert.ok(!seen.has(id), `${key}: ${id} is already mapped by another entry`);
      seen.add(id);
    }
  });

  test('spouse-owned income uses the spouse column of the same line', () => {
    assert.deepStrictEqual(FORM100_CASES.salaryGrossSpouse, { page: 7, sheet: 'S', caseNumber: '702' });
    assert.deepStrictEqual(FORM100_CASES.socialSecuritySpouse, { page: 16, sheet: 'DS', caseNumber: '1602' });
    assert.deepStrictEqual(FORM100_CASES.withholdingSalarySpouse, { page: 19, sheet: 'RD', caseNumber: '1902' });
    assert.deepStrictEqual(FORM100_CASES.pensionSpouse, { page: 8, sheet: 'P', caseNumber: '802' });
    assert.deepStrictEqual(FORM100_CASES.pensionWithholdingSpouse, { page: 19, sheet: 'RD', caseNumber: '1904' });
    assert.deepStrictEqual(FORM100_CASES.capitalSpouse, { page: 9, sheet: 'CM', caseNumber: '902' });
    assert.deepStrictEqual(FORM100_CASES.rentalSpouse, { page: 10, sheet: 'L', caseNumber: '1002' });
    assert.deepStrictEqual(FORM100_CASES.freelanceSpouse, { page: 5, sheet: 'C/A', caseNumber: '502' });
  });

  test('foreign income has no FORM_100 case: only the RD 1081/1082 instruction', () => {
    assert.ok(!('foreign' in FORM100_CASES), 'FOREIGN_INCOME must not map to case 1101');
    assert.ok(!('businessExpense' in FORM100_CASES), 'a business expense is not a positive case amount');
    assert.deepStrictEqual(FORM100_INSTRUCTIONS.foreignCredit, {
      page: 19,
      sheet: 'RD',
      caseNumber: '1081/1082',
      kind: 'INSTRUCTION',
    });
  });

  test('only the COMPUTED / INSTRUCTION pointers carry a non-numeric case', () => {
    assert.deepStrictEqual(RECAP, { page: 20, sheet: 'Recap', caseNumber: 'computed' });
    for (const [key, entry] of Object.entries(FORM100_INSTRUCTIONS)) {
      assert.strictEqual(entry.kind, 'INSTRUCTION', `${key}: not an instruction`);
    }
    for (const [key, entry] of Object.entries(FORM100_CASES)) {
      assert.match(entry.caseNumber, /^\d{3,4}$/, `${key}: case "${entry.caseNumber}" is not printed`);
    }
  });

  test('the net-profit line is 501 for the taxpayer and 502 for the spouse', () => {
    assert.deepStrictEqual(FORM100_CASES.freelance, { page: 5, sheet: 'C/A', caseNumber: '501' });
    assert.deepStrictEqual(FORM100_CASES.freelanceSpouse, { page: 5, sheet: 'C/A', caseNumber: '502' });
  });
});

describe('foreignNatureSheet', () => {
  test('maps each known foreign nature to its own sheet and page', () => {
    assert.deepStrictEqual(foreignNatureSheet('foreignSalary'), {
      sheet: 'S',
      page: 9,
      label: 'salary / employment income',
    });
    assert.strictEqual(foreignNatureSheet('foreignPension')?.sheet, 'P');
    assert.strictEqual(foreignNatureSheet('foreignCapital')?.sheet, 'CM');
    assert.strictEqual(foreignNatureSheet('foreignRental')?.sheet, 'L');
  });

  test('an unknown or absent nature returns null instead of guessing a sheet', () => {
    assert.strictEqual(foreignNatureSheet('foreignIncome'), null);
    assert.strictEqual(foreignNatureSheet(''), null);
    assert.strictEqual(foreignNatureSheet(null), null);
    assert.strictEqual(foreignNatureSheet(undefined), null);
  });

  test('the sheet-specific pointer keeps the RD credit page reachable', () => {
    const pointer = foreignSheetPointer({ sheet: 'CM', page: 12 });
    assert.strictEqual(pointer.sheet, 'CM');
    assert.strictEqual(pointer.page, 12);
    assert.strictEqual(pointer.kind, 'INSTRUCTION');
    // The credit itself stays on RD 1081/1082, independently of the income sheet.
    assert.strictEqual(FORM100_INSTRUCTIONS.foreignCredit.caseNumber, '1081/1082');
    assert.strictEqual(FORM100_INSTRUCTIONS.foreignCredit.page, 19);
  });
});

/**
 * DS 1553 was reported as "EUR 3,200 while the engine deducted EUR 3,700 - one of
 * the two is wrong". Neither is: 1553 carries the expenses covered by the
 * statutory minimum (cases 1301-1552), and Art. 112 donations sit on their own
 * case 1611 "in addition to the forfait". The package's DS lines therefore
 * reconcile to the engine's special-expenses total, and this test pins that
 * arithmetic so a later change cannot fold the donation into 1553.
 */
describe('Form 100 - the DS special-expense cases reconcile to the engine total', () => {
  const facts = [
    { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 },
    { id: 'f2', category: 'PENSION_SAVINGS_111BIS', fieldKey: 'pensionSavings', amount: 3_200 },
    { id: 'f3', category: 'DONATION_DEDUCTION', fieldKey: 'donations', amount: 500 },
  ];

  const deductionsOf = (input: typeof facts | Array<{ id: string; category: string; amount: number }>) =>
    (
      LuxembourgTaxEngine.calculate({
        taxYear: 2025,
        taxClass: TaxClass.CLASS_1,
        residence: TaxResidence.RESIDENT,
        primaryUserId: 'u1',
        facts: input,
      } as never) as unknown as { deductions: Record<string, number> }
    ).deductions;

  test('1553 is the covered total, not the forfait, and 1611 is separate', () => {
    const d = deductionsOf(facts);
    assert.strictEqual(d.specialExpensesCovered, 3_200);
    assert.strictEqual(d.specialExpensesForfait, 480);
    assert.strictEqual(d.donations, 500);
    // The aggregate the report compared against a single case.
    assert.strictEqual(d.specialExpensesTotal, 3_700);
  });

  test('1553 + 1609 + 1611 equals the engine total', () => {
    const d = deductionsOf(facts);
    assert.strictEqual(
      d.specialExpensesCovered + d.lrcp + d.donations,
      d.specialExpensesTotal,
    );
  });

  test('the three amounts are mapped to the cases that carry them', () => {
    assert.deepStrictEqual(FORM100_CASES.specialExpensesForfait, {
      page: 15,
      sheet: 'DS',
      caseNumber: '1553',
    });
    assert.strictEqual(FORM100_CASES.lrcp.caseNumber, '1609');
    assert.strictEqual(FORM100_CASES.donations.caseNumber, '1611');
    // Donations must not be routed to 1553: that would double-count them.
    assert.notStrictEqual(FORM100_CASES.donations.caseNumber, '1553');
  });

  test('a forfait above the covered total is an instruction, never a silent overwrite', () => {
    const d = deductionsOf([{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 }]);
    assert.strictEqual(d.specialExpensesCovered, 0);
    assert.strictEqual(d.specialExpensesTotal, 480);
    assert.strictEqual(FORM100_INSTRUCTIONS.specialExpensesMinimum.caseNumber, '1553');
    assert.strictEqual(FORM100_INSTRUCTIONS.specialExpensesMinimum.kind, 'INSTRUCTION');
  });
});
