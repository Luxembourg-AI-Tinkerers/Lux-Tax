import { test, describe } from 'node:test';
import assert from 'node:assert';
import { FORM100_CASES, FORM100_INSTRUCTIONS, RECAP } from '../src/modules/filing/form100-case-map';

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
