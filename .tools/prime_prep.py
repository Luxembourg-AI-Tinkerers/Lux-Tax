import io

# 1) rule types
p = "packages/tax-engine/src/rules/types.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
s = s.replace("""export interface PendingMeasure {""",
"""/**
 * Prime jeune salarié (Art. 115 n° 13d L.I.R., in force from AY 2025).
 *
 * 75 % of the prime is exempt, capped by an annual amount that steps down with
 * the gross salary. The exemption is lost on a change of employer, so eligibility
 * is an explicit input rather than something inferred.
 */
export interface YoungEmployeePrimeRules {
  readonly exemptRate: number;
  /** Annual exemptible cap, by gross salary band (first match wins). */
  readonly bands: readonly { readonly maxSalary: number; readonly cap: number }[];
}

export interface PendingMeasure {""")
s = s.replace("""  readonly cissm: CissmRules;""",
"""  readonly cissm: CissmRules;
  readonly youngEmployeePrime: YoungEmployeePrimeRules;""")
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))

# 2) 2025 values (2026/2028 inherit via spread)
p2 = "packages/tax-engine/src/rules/2025.ts"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")
s2 = s2.replace("""  rentalAmortisation: {""",
"""  youngEmployeePrime: {
    exemptRate: 0.75,
    bands: [
      { maxSalary: 50_000, cap: 5_000 },
      { maxSalary: 75_000, cap: 3_750 },
      { maxSalary: 100_000, cap: 2_500 },
    ],
  },
  rentalAmortisation: {""")
io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace("\n", "\r\n"))
print("ok")
