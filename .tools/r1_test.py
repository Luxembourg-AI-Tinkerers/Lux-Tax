import io
p = "packages/tax-engine/test/tax-engine.spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
anchor = """  test('rental: 35 % forfait capped at EUR 2 700', () => {"""
block = """  test('securities ledger: 50 % qualifying, RELIBI final, foreign credit', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      relibiFinalElective: true,
      securities: [
        { grossIncome: 10_000, qualifyingDividend: true },
        { grossIncome: 4_000, relibiWithheld: 800 },
        { grossIncome: 2_000, foreignTax: 300 },
      ],
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 40_000 }],
    });
    // 5 000 (half of the qualifying dividend) + 2 000 (foreign, relibi-final interest excluded)
    assert.ok(result.provenance.some((p) => p.ruleCode === 'LIR-ART-97-115-15a-RELIBI'));
    assert.ok(result.credits.foreignTaxCredit > 0);
  });

  test('rental: 35 % forfait capped at EUR 2 700', () => {"""
assert s.count(anchor) == 1
s = s.replace(anchor, block)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
