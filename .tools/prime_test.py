import io
p = "packages/tax-engine/test/tax-engine.spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

anchor = """  test('pending measures are recorded with their activation path', () => {"""
block = """  test('prime jeune salarié: 75 % exempt, capped by the gross-salary band', () => {
    const base = {
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      youngEmployeePrimeEligible: true,
    } as const;

    // 12 000 prime on 40 000 gross -> 75 % = 9 000, capped at 5 000
    const low = LuxembourgTaxEngine.calculate({
      ...base,
      youngEmployeePrime: 12_000,
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 40_000 }],
    });
    close(low.youngEmployeePrimeExemption, 5_000);
    close(low.netIncome, 35_000);

    // 60 000 gross -> band cap 3 750
    const mid = LuxembourgTaxEngine.calculate({
      ...base,
      youngEmployeePrime: 12_000,
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 }],
    });
    close(mid.youngEmployeePrimeExemption, 3_750);

    // 90 000 gross -> band cap 2 500
    const high = LuxembourgTaxEngine.calculate({
      ...base,
      youngEmployeePrime: 12_000,
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 90_000 }],
    });
    close(high.youngEmployeePrimeExemption, 2_500);

    // ineligible -> no exemption, even with a prime
    const notEligible = LuxembourgTaxEngine.calculate({
      ...base,
      youngEmployeePrimeEligible: false,
      youngEmployeePrime: 12_000,
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 40_000 }],
    });
    close(notEligible.youngEmployeePrimeExemption, 0);
    close(notEligible.netIncome, 40_000);

    // above 100 000 -> zero, with a warning
    const tooHigh = LuxembourgTaxEngine.calculate({
      ...base,
      youngEmployeePrime: 12_000,
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 120_000 }],
    });
    close(tooHigh.youngEmployeePrimeExemption, 0);
    assert.ok(tooHigh.warnings.some((w) => w.includes('Prime jeune salarié')));
  });

  test('pending measures are recorded with their activation path', () => {"""
assert s.count(anchor) == 1
s = s.replace(anchor, block)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
