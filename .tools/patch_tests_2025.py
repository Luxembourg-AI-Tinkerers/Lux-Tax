import io
p = "packages/tax-engine/test/tax-engine.spec.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

anchor = """describe('Credits', () => {"""
block = """describe('Tax year 2025 is fully supported (filing season open until 31 Dec 2026)', () => {
  const base = {
    taxClass: TaxClass.CLASS_1,
    residence: TaxResidence.RESIDENT,
    primaryUserId: 'u1',
  } as const;

  test('2025 package is present and selectable', () => {
    assert.ok(SUPPORTED_TAX_YEARS.includes(2025));
    assert.strictEqual(getRulePackage(2025).version, '2025.1.0');
  });

  test('2025 keeps the 3,200 EUR third-pillar cap (2026 gets 4,500)', () => {
    const facts = [
      { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 50_000 },
      { id: 'f2', category: 'PENSION_SAVINGS_111BIS', fieldKey: 'art111bis', amount: 4_500 },
    ];
    close(LuxembourgTaxEngine.calculate({ ...base, taxYear: 2025, facts }).deductions.art111bis, 3_200);
    close(LuxembourgTaxEngine.calculate({ ...base, taxYear: 2026, facts }).deductions.art111bis, 4_500);
  });

  test('2025 CI-CO2 is 192, 2026 is 216', () => {
    const facts = [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 30_000 }];
    close(LuxembourgTaxEngine.calculate({ ...base, taxYear: 2025, facts }).credits.ciCo2Salary, 192);
    close(LuxembourgTaxEngine.calculate({ ...base, taxYear: 2026, facts }).credits.ciCo2Salary, 216);
  });

  test('AMVP and the start-up credit do not exist in 2025', () => {
    const v2025 = LuxembourgTaxEngine.calculate({
      ...base,
      taxYear: 2025,
      amvpEligible: true,
      startupInvestment: 100_000,
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 }],
    });
    close(v2025.deductions.amvp, 0);
    close(v2025.credits.startup, 0);

    const v2026 = LuxembourgTaxEngine.calculate({
      ...base,
      taxYear: 2026,
      amvpEligible: true,
      startupInvestment: 100_000,
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 }],
    });
    close(v2026.deductions.amvp, 9_000);
    close(v2026.credits.startup, 20_000);
  });
});

describe('Credits', () => {"""
assert s.count(anchor) == 1
s = s.replace(anchor, block)

s = s.replace("""  getRulePackage,
  baseTax,""", """  getRulePackage,
  SUPPORTED_TAX_YEARS,
  baseTax,""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
