import io
p = "packages/tax-engine/test/tax-engine.spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

s = s.replace("""  cicForSalary,""", """  cicForSalary,
  calculateDeductions,""")

anchor = """  test('CIC: no table published -> no credit, mechanism ready', () => {"""
block = """  test('pending measures are recorded with their activation path', () => {
    const pending = pkg2026.pendingMeasures ?? [];
    const ids = pending.map((m) => m.id);
    assert.deepStrictEqual(ids.sort(), ['CIC_2026', 'EPARGNE_LOGEMENT_8775']);
    for (const measure of pending) {
      assert.strictEqual(measure.status, 'NOT_IN_FORCE');
      assert.ok(measure.source.length > 20);
      assert.ok(measure.activation.length > 20);
    }
    assert.strictEqual((pkg2025.pendingMeasures ?? []).length, 0);
  });

  test('épargne-logement above 40: capped at 672 and warns about 8775', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2026,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      savingsHousingSubscriberAge: 45,
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 },
        { id: 'f2', category: 'SAVINGS_HOUSING', fieldKey: 'savingsHousing', amount: 1_344 },
      ],
    });
    close(result.deductions.savingsHousing, 672);
    assert.ok(result.warnings.some((w) => w.includes('8775')));
  });

  test('activation is a data change: no age limit and a CIC table both apply', () => {
    const activated = {
      ...pkg2026,
      specialExpenses: { ...pkg2026.specialExpenses, savingsHousingYoungMaxAge: 200 },
      cic: {
        bands: [{ from: 1_000, to: 20_000, slope: 0, offset: 10 }],
        topAmount: 10,
      },
      pendingMeasures: (pkg2026.pendingMeasures ?? []).map((m) => ({ ...m, status: 'IN_FORCE' as const })),
    };

    const base = {
      grossSalary: 60_000,
      socialContributions: 0,
      grossPension: 0,
      capitalIncome: 0,
      rentalIncome: 0,
      foreignIncome: 0,
      independentProfit: 0,
      actualFraisObtention: 0,
      travelUnits: 0,
    };

    const deductions = calculateDeductions({
      pkg: activated,
      taxClass: 'CLASS_1',
      assessmentMode: 'COLLECTIVE',
      primary: base,
      childrenWithModeration: 0,
      art111Declared: 0,
      art111bisDeclared: 0,
      art111bisContributors: 1,
      savingsHousingDeclared: 1_344,
      savingsHousingSubscriberAge: 45,
      lrcpDeclared: 0,
      mortgageInterest: 0,
      donationsDeclared: 0,
      extraordinaryChargesDeclared: 0,
      bothSpousesProfessional: false,
      conjointAidant: false,
      spouseRetiredUnder3Years: false,
      priorYearLosses: 0,
      amvpEligible: false,
      asrdPrimeUnique: 0,
      asrdChildren: 0,
      netIncomeForDonationCap: 60_000,
    });

    close(deductions.savingsHousingDeduction, 1_344);
    close(cicForSalary(60_000, activated), 120);
  });

  test('CIC: no table published -> no credit, mechanism ready', () => {"""
assert s.count(anchor) == 1
s = s.replace(anchor, block)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
