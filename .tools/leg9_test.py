import io
p = "apps/api/test/filing-year-guard.spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

old = """  test('the guard is driven by package metadata, not a hard-coded year list', () => {
    // The refusal must come from `singleClass` on the package: every allowed year
    // has a package without that flag, and 2028 is the only one with it.
    assert.strictEqual(filingYearVerdict(2025).allowed, !filingYearVerdict(2025).allowed === false);
    assert.strictEqual(filingYearVerdict(2028).allowed, false);
  });"""
new = """  test('the refusal is driven by package metadata, not a hard-coded year list', () => {
    // Allowed <=> the package does not carry `singleClass`.
    for (const year of [2025, 2026, 2028]) {
      const pkg = getRulePackage(year);
      assert.strictEqual(
        filingYearVerdict(year).allowed,
        !pkg.singleClass,
        `${year} allowed should mirror singleClass`,
      );
    }
  });"""
assert s.count(old) == 1
s = s.replace(old, new)
s = s.replace("""} from '../src/modules/filing/filing-year-guard';""",
"""} from '../src/modules/filing/filing-year-guard';
import { getRulePackage } from '@luxtax/tax-engine';""")
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))

# include the new spec in the test tsconfig
p2 = "tsconfig.test.json"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")
s2 = s2.replace('"apps/api/test/annex-pdf.spec.ts"', '"apps/api/test/annex-pdf.spec.ts",\n    "apps/api/test/filing-year-guard.spec.ts"')
io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace("\n", "\r\n"))
print("ok")
