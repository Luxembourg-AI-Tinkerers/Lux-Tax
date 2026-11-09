import io
p = "packages/contracts/src/tax.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

# 1) params additions before closing of TaxCalculationParams
old = """  /** True when the taxpayer is a single parent (CIM gate). */
  isSingleParent?: boolean;
}"""
new = """  /** True when the taxpayer is a single parent (CIM gate). */
  isSingleParent?: boolean;
  /** Art. 48 n° 3: the spouse draws a salary from the household business. */
  spouseEmployedByBusiness?: boolean;

  /** Art. 114 loss stock, per year of origin (17-year clock, oldest first). */
  lossCarryForward?: Array<{ year: number; amount: number }>;

  /** Plus-values on movable property (Art. 99bis / 100). */
  movableGains?: Array<{
    proceeds: number;
    cost: number;
    holdingMonths: number;
    participationPercent: number;
  }>;
  /** Plus-values on real estate (Art. 99bis / 99ter / 102bis). */
  realEstateGains?: Array<{
    proceeds: number;
    cost: number;
    holdingYears: number;
    isPrincipalResidence: boolean;
  }>;

  /** Rental: allow the 35 % / EUR 2 700 forfait (private patrimoine, >= 15 years). */
  rentalForfaitEligible?: boolean;
  /** Rental: social-management exemption (Art. 115 n° 22a, 90 %). */
  rentalSocial?: boolean;

  /** Qualifying dividends eligible for the 50 % exemption (Art. 115 n° 15a). */
  qualifyingDividends?: number;

  /** Assurance solde restant dû: single premium and subscriber profile. */
  asrdPrimeUnique?: number;
  asrdSubscriberAge?: number;
  asrdChildren?: number;

  /** Credit for resident investors in eligible start-ups (2026+). */
  startupInvestment?: number;

  /** Art. 157ter / Art. 3 d): non-resident assimilation inputs. */
  nonResidentAssimilation?: boolean;
  worldwideIncome?: number;
  luxembourgProfessionalIncome?: number;
  householdProfessionalIncome?: number;
  foreignNetIncome?: number;
}"""
assert s.count(old) == 1
s = s.replace(old, new)

# 2) credits DTO: add startup
old2 = """export interface CreditBreakdownDto {
  cis: number;"""
new2 = """export interface CreditBreakdownDto {
  /** Credit for resident investors in eligible start-ups (2026+). */
  startup: number;
  cis: number;"""
assert s.count(old2) == 1
s = s.replace(old2, new2)

# 3) result additions before provenance
old3 = """  freelanceIncomeBreakdown?: FreelanceIncomeBreakdownDto;
  provenance: CalculationLineItemProvenance[];"""
new3 = """  freelanceIncomeBreakdown?: FreelanceIncomeBreakdownDto;
  /** Plus-values detail (all amounts excluding the final tax). */
  plusValues?: {
    speculation: number;
    article100: number;
    article99ter: number;
    abattement: number;
    taxableExtraordinary: number;
    tax: number;
  };
  /** Rental detail. */
  rental?: {
    gross: number;
    charges: number;
    net: number;
    forfaitApplied: boolean;
    socialExemption: number;
  };
  /** Non-resident assimilation outcome. */
  nonResident?: {
    assimilationGranted: boolean;
    worldwideShare: number;
    professionalShareInLuxembourg: number;
    /** 'RESIDENT_RULES' | 'EXEMPTION_WITH_PROGRESSION' | 'NOT_SUPPORTED' */
    method: string;
  };
  provenance: CalculationLineItemProvenance[];"""
assert s.count(old3) == 1
s = s.replace(old3, new3)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
