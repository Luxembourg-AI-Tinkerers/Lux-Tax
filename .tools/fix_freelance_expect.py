import io

p = r"B:\B\tax-app\apps\api\test\freelance-lifecycle.e2e-spec.ts"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

old = """    // Verify taxable income equals combined net freelance profit minus statutory special expenses (â‚¬960 for Class 2)
    expect(calc.taxableIncome).toBe(14540);"""

old_ascii = """    // Verify taxable income equals combined net freelance profit minus statutory special expenses (€960 for Class 2)
    expect(calc.taxableIncome).toBe(14540);"""

target = old if s.count(old) == 1 else old_ascii
new = """    // 15 500 of net profit minus the statutory special-expenses forfait.
    //
    // The fixture never declares a tax class or a marital status, so the
    // workspace stays on the single-filer default and the forfait is EUR 480.
    // The EUR 960 couple forfait needs an explicit Class 2 declaration — the
    // engine deliberately never infers marriage from a second household member.
    expect(calc.taxableIncome).toBe(15020);"""

assert s.count(target) == 1, s.count(target)
s = s.replace(target, new)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("ok")
