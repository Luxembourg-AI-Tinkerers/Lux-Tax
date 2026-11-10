import io

p = r"B:\B\tax-app\apps\api\test\form100-case-map.spec.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"

raw = raw.replace("\r\n", "\n")
raw = raw.replace(
    "import { FORM100_CASES, FORM100_INSTRUCTIONS, RECAP } from '../src/modules/filing/form100-case-map';",
    "import {\n  FORM100_CASES,\n  FORM100_INSTRUCTIONS,\n  RECAP,\n  foreignNatureSheet,\n} from '../src/modules/filing/form100-case-map';",
)

block = """
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
    const pointer = FORM100_INSTRUCTIONS.foreignCreditOnSheet('CM', 12);
    assert.strictEqual(pointer.sheet, 'CM');
    assert.strictEqual(pointer.page, 12);
    assert.strictEqual(pointer.kind, 'INSTRUCTION');
    // The credit itself stays on RD 1081/1082, independently of the income sheet.
    assert.strictEqual(FORM100_INSTRUCTIONS.foreignCredit.caseNumber, '1081/1082');
    assert.strictEqual(FORM100_INSTRUCTIONS.foreignCredit.page, 19);
  });
});
"""

raw = raw.rstrip("\n") + "\n" + block
io.open(p, "w", encoding="utf-8", newline="").write(raw.replace("\n", nl))
print("ok")
