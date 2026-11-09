import io
p = "packages/tax-engine/test/tax-engine.spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

anchor = """  test('a loss-making side-business reduces the salary (Art. 7 al. 2)', () => {"""
new_tests = """  test('a professional loss caps the AEP at zero (Art. 129b al. 3)', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_2,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'a',
      spouseUserId: 'b',
      bothSpousesProfessional: true,
      facts: [
        { id: 'f1', ownerId: 'a', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 70_000 },
        { id: 'f2', ownerId: 'b', category: 'FREELANCE_INCOME', fieldKey: 'freelanceRevenue', amount: 2_000 },
        { id: 'f3', ownerId: 'b', category: 'BUSINESS_EXPENSE', fieldKey: 'expense', amount: 9_000 },
      ],
    });
    close(result.deductions.aep, 0);
  });

  test('FDS is doubled for a dual-earner couple', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_2,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'a',
      spouseUserId: 'b',
      facts: [
        { id: 'f1', ownerId: 'a', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 40_000 },
        { id: 'f2', ownerId: 'b', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 30_000 },
      ],
    });
    assert.strictEqual(result.deductions.specialExpensesForfait, 960);
  });

  test('a loss-making side-business reduces the salary (Art. 7 al. 2)', () => {"""
assert s.count(anchor) == 1
s = s.replace(anchor, new_tests)
out = s.replace("\n", "\r\n")
io.open(p, "w", encoding="utf-8", newline="").write(out)
print("ok")
