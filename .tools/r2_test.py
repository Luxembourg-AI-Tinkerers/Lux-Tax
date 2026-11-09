import io
p = "packages/tax-engine/test/tax-engine.spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
anchor = """  test('securities ledger: 50 % qualifying, RELIBI final, foreign credit', () => {"""
block = """  test('rental asset register: amortisation by age and energy rate', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      rentalProperties: [
        {
          grossRent: 18_000,
          charges: 2_000,
          purchasePrice: 400_000,
          completionYear: 1990, // 35 years -> 2 %
          landSharePercent: 20,
          energyRenovationAmount: 20_000, // 6 % in 2025
          interest: 1_000,
        },
      ],
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 50_000 }],
    });
    // amortisation = 400 000 × 80 % × 2 % = 6 400 ; energy = 20 000 × 6 % = 1 200
    // net = 18 000 − 2 000 − 7 600 − 1 000 = 7 400
    close(result.rental!.net, 7_400);
    assert.ok(result.provenance.some((p) => p.ruleCode === 'LIR-ART-98-AMORT'));
  });

  test('securities ledger: 50 % qualifying, RELIBI final, foreign credit', () => {"""
assert s.count(anchor) == 1
s = s.replace(anchor, block)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
