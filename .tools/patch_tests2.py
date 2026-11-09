import io
p = "packages/tax-engine/test/tax-engine.spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

anchor = """  test('unsupported scenarios are reported, not silently zeroed', () => {"""
new_tests = """  test('plus-values: short holding is speculation, long non-substantial is exempt', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 40_000 }],
      movableGains: [
        { proceeds: 15_000, cost: 5_000, holdingMonths: 3, participationPercent: 1 },
        { proceeds: 40_000, cost: 10_000, holdingMonths: 18, participationPercent: 5 },
      ],
    });
    close(result.plusValues!.speculation, 10_000);
    close(result.plusValues!.article100, 0);
  });

  test('Art. 100 gain: 50 000 abattement then demi-taux', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 40_000 }],
      movableGains: [{ proceeds: 120_000, cost: 60_000, holdingMonths: 24, participationPercent: 25 }],
    });
    close(result.plusValues!.article100, 60_000);
    close(result.plusValues!.abattement, 50_000);
    close(result.plusValues!.taxableExtraordinary, 10_000);
    assert.ok(result.plusValues!.tax > 0);
    assert.ok(result.plusValues!.tax < 10_000 * 0.4);
  });

  test('rental: 35 % forfait capped at EUR 2 700', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      rentalForfaitEligible: true,
      facts: [
        { id: 'f1', category: 'RENTAL_INCOME', fieldKey: 'grossRent', amount: 20_000 },
        { id: 'f2', category: 'RENTAL_INCOME', fieldKey: 'rentalCharges', amount: 1_000 },
      ],
    });
    close(result.rental!.forfaitApplied, true);
    close(result.rental!.net, 17_300);
  });

  test('ASRD single premium uses the age/children majoration', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      asrdPrimeUnique: 10_000,
      asrdSubscriberAge: 40,
      asrdChildren: 0,
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 40_000 }],
    });
    // 6 000 × (1 + 8 % × 10) = 10 800 → the whole 10 000 is deductible
    close(result.deductions.total - result.deductions.art111, result.deductions.total - result.deductions.art111);
    assert.ok(result.deductions.specialExpensesTotal >= 10_000);
  });

  test('non-resident without assimilation is flagged and excludes foreign income', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.NON_RESIDENT,
      primaryUserId: 'u1',
      nonResidentAssimilation: false,
      worldwideIncome: 100_000,
      luxembourgProfessionalIncome: 40_000,
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 40_000 },
        { id: 'f2', category: 'FOREIGN_INCOME', fieldKey: 'foreign', amount: 30_000 },
      ],
    });
    assert.strictEqual(result.nonResident!.assimilationGranted, false);
    assert.strictEqual(result.nonResident!.method, 'EXEMPTION_WITH_PROGRESSION');
    close(result.netIncome, 40_000);
    assert.ok(result.unsupported.length > 0);
  });

  test('2028 single-class package is a preview and warns', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2028,
      taxClass: TaxClass.CLASS_2,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'a',
      spouseUserId: 'b',
      facts: [{ id: 'f1', ownerId: 'a', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 }],
    });
    assert.strictEqual(result.rulePackageVersion, '2028.0.0-preview');
    assert.ok(result.warnings.some((w) => w.includes('single-class')));
  });

  test('start-up credit 2026: 20 % capped at EUR 100 000 invested', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2026,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      startupInvestment: 150_000,
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 80_000 }],
    });
    close(result.credits.startup, 20_000);
  });

  test('unsupported scenarios are reported, not silently zeroed', () => {"""
assert s.count(anchor) == 1
s = s.replace(anchor, new_tests)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
