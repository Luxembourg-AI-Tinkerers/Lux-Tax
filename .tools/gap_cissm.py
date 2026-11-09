import io

# 1) rule types
p = "packages/tax-engine/src/rules/types.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
s = s.replace("""export interface AmvpRules {""",
"""export interface CissmRules {
  /** Monthly salary band where the credit is granted. */
  readonly monthlyFloor: number;
  readonly monthlyFlatUntil: number;
  readonly monthlyZeroFrom: number;
  /** Flat monthly credit inside the band. */
  readonly monthlyAmount: number;
}

export interface AmvpRules {""")
s = s.replace("""  readonly startupCredit: StartupCreditRules;""",
"""  readonly startupCredit: StartupCreditRules;
  readonly cissm: CissmRules;""")
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))

# 2) 2025 package value
p2 = "packages/tax-engine/src/rules/2025.ts"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")
s2 = s2.replace("""  // The start-up credit is a 2026 measure; 2025 has no such credit.
  startupCredit: { rate: 0, maxInvestment: 0 },""",
"""  // The start-up credit is a 2026 measure; 2025 has no such credit.
  startupCredit: { rate: 0, maxInvestment: 0 },
  cissm: {
    monthlyFloor: 1_800,
    monthlyFlatUntil: 3_000,
    monthlyZeroFrom: 3_600,
    monthlyAmount: 70,
  },""")
io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace("\n", "\r\n"))

# 3) credits function
p3 = "packages/tax-engine/src/credits.ts"
raw3 = io.open(p3, encoding="utf-8", newline="").read()
s3 = raw3.replace("\r\n", "\n")
s3 = s3.replace("""export function ciCo2ForSalary(grossSalary: number, pkg: RulePackage): number {""",
"""/**
 * CISSM — crédit d'impôt salaire social minimum.
 * Monthly salary 1 800–3 000: EUR 70/month; 3 000–3 600: linear phase-out;
 * annualised here (x12) because the engine works on annual figures.
 */
export function cissmForSalary(grossSalary: number, pkg: RulePackage): number {
  const monthly = grossSalary / 12;
  const { monthlyFloor, monthlyFlatUntil, monthlyZeroFrom, monthlyAmount } = pkg.cissm;
  if (!Number.isFinite(monthly) || monthly < monthlyFloor || monthly >= monthlyZeroFrom) return 0;
  const monthlyCredit =
    monthly <= monthlyFlatUntil
      ? monthlyAmount
      : (monthlyAmount / (monthlyZeroFrom - monthlyFlatUntil)) * (monthlyZeroFrom - monthly);
  return ceilCent(monthlyCredit * 12);
}

export function ciCo2ForSalary(grossSalary: number, pkg: RulePackage): number {""")
io.open(p3, "w", encoding="utf-8", newline="").write(s3.replace("\n", "\r\n"))

# 4) contracts: cissm field
p4 = "packages/contracts/src/tax.ts"
raw4 = io.open(p4, encoding="utf-8", newline="").read()
s4 = raw4.replace("\r\n", "\n")
s4 = s4.replace("""  /** Foreign tax credited under the treaty / Art. 134bis. */
  foreignTaxCredit: number;""",
"""  /** Foreign tax credited under the treaty / Art. 134bis. */
  foreignTaxCredit: number;
  /** Crédit d'impôt salaire social minimum. */
  cissm: number;""")
io.open(p4, "w", encoding="utf-8", newline="").write(s4.replace("\n", "\r\n"))
print("ok")
