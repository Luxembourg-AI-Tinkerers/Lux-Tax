import io

# types
p = "packages/tax-engine/src/rules/types.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
s = s.replace("""export interface CissmRules {""",
"""export interface RentalAmortisationRules {
  /** 4 % for up to N buildings completed less than 5 years ago. */
  readonly recentRate: number;
  readonly recentMaxBuildings: number;
  readonly rateUnder30: number;
  readonly rate30to60: number;
  readonly rateOver60: number;
  /** Rate applied to a durable energy-renovation investment. */
  readonly energyRenovationRate: number;
}

export interface CissmRules {""")
s = s.replace("""  readonly cissm: CissmRules;""",
"""  readonly cissm: CissmRules;
  readonly rentalAmortisation: RentalAmortisationRules;""")
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))

# 2025 values
p2 = "packages/tax-engine/src/rules/2025.ts"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")
s2 = s2.replace("""  cissm: {
    monthlyFloor: 1_800,""",
"""  rentalAmortisation: {
    recentRate: 0.04,
    recentMaxBuildings: 2,
    rateUnder30: 0.015,
    rate30to60: 0.02,
    rateOver60: 0.03,
    energyRenovationRate: 0.06,
  },
  cissm: {
    monthlyFloor: 1_800,""")
io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace("\n", "\r\n"))

# 2026 override
p3 = "packages/tax-engine/src/rules/2026.ts"
raw3 = io.open(p3, encoding="utf-8", newline="").read()
s3 = raw3.replace("\r\n", "\n")
s3 = s3.replace("""  startupCredit: { rate: 0.2, maxInvestment: 100_000 },""",
"""  startupCredit: { rate: 0.2, maxInvestment: 100_000 },
  // 2026: energy-renovation amortisation rises from 6 % to 10 %.
  rentalAmortisation: { ...RULES_2025.rentalAmortisation, energyRenovationRate: 0.1 },""")
io.open(p3, "w", encoding="utf-8", newline="").write(s3.replace("\n", "\r\n"))

# contracts
p4 = "packages/contracts/src/tax.ts"
raw4 = io.open(p4, encoding="utf-8", newline="").read()
s4 = raw4.replace("\r\n", "\n")
s4 = s4.replace("""  /** Rental: social-management exemption (Art. 115 n° 22a, 90 %). */
  rentalSocial?: boolean;""",
"""  /** Rental: social-management exemption (Art. 115 n° 22a, 90 %). */
  rentalSocial?: boolean;

  /** Rental asset register: amortisation and interest are computed per building. */
  rentalProperties?: Array<{
    label?: string;
    grossRent: number;
    charges?: number;
    purchasePrice?: number;
    completionYear?: number;
    landSharePercent?: number;
    energyRenovationAmount?: number;
    interest?: number;
  }>;""")
io.open(p4, "w", encoding="utf-8", newline="").write(s4.replace("\n", "\r\n"))
print("ok")
