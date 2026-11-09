import io

# 1) rule types: CIC bands
p = "packages/tax-engine/src/rules/types.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
s = s.replace("""export interface CissmRules {""",
"""/**
 * Crédit d'impôt conjoncture (CIC).
 *
 * Piecewise-linear monthly table: each band gives the monthly gross salary
 * range and the linear formula `slope x (salary − from) + offset`, in euros per
 * month. The table is data, not code, so a newly published table is a package
 * change rather than an engine change.
 */
export interface CicRules {
  readonly bands: readonly {
    readonly from: number;
    readonly to: number;
    readonly slope: number;
    readonly offset: number;
  }[];
  /** Last band used above the highest `to` (flat monthly amount). */
  readonly topUpTo?: number;
  readonly topAmount?: number;
}

export interface CissmRules {""")
s = s.replace("""  readonly cissm: CissmRules;""",
"""  readonly cissm: CissmRules;
  /**
   * Present only when the CIC table has been published for that tax year.
   * Absent = the credit does not exist / is not yet in force.
   */
  readonly cic?: CicRules;""")
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))

# 2) credits: CIC function
p2 = "packages/tax-engine/src/credits.ts"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")
s2 = s2.replace("""export function ciCo2ForSalary(grossSalary: number, pkg: RulePackage): number {""",
"""/**
 * CIC — crédit d'impôt conjoncture (monthly table, annualised x12).
 * Returns 0 when the rule package carries no published table for the year.
 */
export function cicForSalary(grossSalary: number, pkg: RulePackage): number {
  const table = pkg.cic;
  if (!table) return 0;

  const monthly = grossSalary / 12;
  if (!Number.isFinite(monthly)) return 0;

  for (const band of table.bands) {
    if (monthly >= band.from && monthly <= band.to) {
      const value = band.slope * (monthly - band.from) + band.offset;
      return ceilCent(Math.max(0, value) * 12);
    }
  }

  if (table.topAmount !== undefined) return ceilCent(table.topAmount * 12);
  return 0;
}

export function ciCo2ForSalary(grossSalary: number, pkg: RulePackage): number {""")
io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace("\n", "\r\n"))

# 3) contracts: cic in credits
p3 = "packages/contracts/src/tax.ts"
raw3 = io.open(p3, encoding="utf-8", newline="").read()
s3 = raw3.replace("\r\n", "\n")
s3 = s3.replace("""  /** Crédit d'impôt salaire social minimum. */
  cissm: number;""",
"""  /** Crédit d'impôt salaire social minimum. */
  cissm: number;
  /** Crédit d'impôt conjoncture (0 while no table is published for the year). */
  cic: number;""")
io.open(p3, "w", encoding="utf-8", newline="").write(s3.replace("\n", "\r\n"))
print("ok")
