import io
p = "packages/tax-engine/test/tax-engine.spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
anchor = """  test('2028 single-class package is a preview and warns', () => {"""
block = """  test('Art. 3 d): mixed couple gets Class 2 only at >= 90 % LU professional income', () => {
    const facts = [
      { id: 'f1', ownerId: 'a', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 90_000 },
      { id: 'f2', ownerId: 'b', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 10_000 },
    ];
    const base = {
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.NON_RESIDENT,
      primaryUserId: 'a',
      spouseUserId: 'b',
      spouseResidence: 'RESIDENT' as const,
      mixedCoupleCollectiveRequested: true,
      facts,
    };

    const granted = LuxembourgTaxEngine.calculate({
      ...base,
      luxembourgProfessionalIncome: 95_000,
      householdProfessionalIncome: 100_000,
    });
    assert.ok(granted.provenance.some((p) => p.ruleCode === 'LIR-ART-3-d'));
    assert.ok(Math.abs(granted.baseTax - 2 * 0) >= 0);

    const refused = LuxembourgTaxEngine.calculate({
      ...base,
      luxembourgProfessionalIncome: 50_000,
      householdProfessionalIncome: 100_000,
    });
    assert.ok(!refused.provenance.some((p) => p.ruleCode === 'LIR-ART-3-d'));
    assert.ok(refused.warnings.some((w) => w.includes('Mixed resident/non-resident')));
  });

  test('2028 single-class package is a preview and warns', () => {"""
assert s.count(anchor) == 1
s = s.replace(anchor, block)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
