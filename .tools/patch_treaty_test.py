import io
p = "packages/tax-engine/test/tax-engine.spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

anchor = """  test('2028 single-class package is a preview and warns', () => {"""
block = """  test('treaty relief: FR exempts with progression, DE grants a credit', () => {
    const facts = [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 }];

    const fr = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      facts,
      foreignIncomeItems: [{ country: 'FR', amount: 20_000, foreignTax: 2_000 }],
    });
    close(fr.credits.foreignTaxCredit, 0);
    close(fr.netIncome, 60_000);

    const noForeign = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      facts,
    });
    assert.ok(fr.baseTax > noForeign.baseTax, 'progression should raise the Luxembourg cote');

    const de = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      facts,
      foreignIncomeItems: [{ country: 'DE', amount: 20_000, foreignTax: 4_000 }],
    });
    close(de.netIncome, 80_000);
    assert.ok(de.credits.foreignTaxCredit > 0);
    assert.ok(de.credits.foreignTaxCredit <= 4_000);
  });

  test('2028 single-class package is a preview and warns', () => {"""
assert s.count(anchor) == 1
s = s.replace(anchor, block)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
