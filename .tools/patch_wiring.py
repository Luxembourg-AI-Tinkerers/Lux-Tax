import io

# --- contracts questionnaire
p = "packages/contracts/src/questionnaire.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """  invalidityRatePrimary?: number;
  invalidityRateSpouse?: number;

  notes?: string;"""
new = """  invalidityRatePrimary?: number;
  invalidityRateSpouse?: number;

  /** Art. 48 n° 3: the spouse draws a salary from the household business. */
  spouseEmployedByBusiness?: boolean;

  /** Rental: allow the 35 % / EUR 2 700 forfait. */
  rentalForfaitEligible?: boolean;
  /** Rental: social-management exemption (90 %). */
  rentalSocial?: boolean;

  /** ASRD single premium and subscriber profile. */
  asrdPrimeUnique?: number;
  asrdSubscriberAge?: number;
  asrdChildren?: number;

  /** Credit for resident investors in eligible start-ups (2026+). */
  startupInvestment?: number;

  /** Non-resident assimilation inputs (Art. 157ter / Art. 3 d). */
  nonResidentAssimilation?: boolean;
  worldwideIncome?: number;
  luxembourgProfessionalIncome?: number;
  householdProfessionalIncome?: number;
  foreignNetIncome?: number;

  notes?: string;"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))

# --- validation schema
p2 = "packages/validation/src/questionnaire.schema.ts"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")
old2 = """  invalidityRatePrimary: z.number().min(0).max(1).optional(),
  invalidityRateSpouse: z.number().min(0).max(1).optional(),
  notes: z.string().max(1000).optional(),"""
new2 = """  invalidityRatePrimary: z.number().min(0).max(1).optional(),
  invalidityRateSpouse: z.number().min(0).max(1).optional(),
  spouseEmployedByBusiness: z.boolean().optional(),
  rentalForfaitEligible: z.boolean().optional(),
  rentalSocial: z.boolean().optional(),
  asrdPrimeUnique: z.number().min(0).max(1_000_000).optional(),
  asrdSubscriberAge: z.number().int().min(16).max(110).optional(),
  asrdChildren: z.number().int().min(0).max(20).optional(),
  startupInvestment: z.number().min(0).max(10_000_000).optional(),
  nonResidentAssimilation: z.boolean().optional(),
  worldwideIncome: z.number().min(0).max(100_000_000).optional(),
  luxembourgProfessionalIncome: z.number().min(0).max(100_000_000).optional(),
  householdProfessionalIncome: z.number().min(0).max(100_000_000).optional(),
  foreignNetIncome: z.number().min(0).max(100_000_000).optional(),
  notes: z.string().max(1000).optional(),"""
assert s2.count(old2) == 1
io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace(old2, new2).replace("\n", "\r\n"))

# --- API service passthrough
p3 = "apps/api/src/modules/calculations/calculations.service.ts"
raw3 = io.open(p3, encoding="utf-8", newline="").read()
s3 = raw3.replace("\r\n", "\n")
old3 = """      isSingleParent: answers.isSingleParent ?? (answers.maritalStatus === 'SINGLE' && childrenWithModeration > 0),
    });"""
new3 = """      isSingleParent: answers.isSingleParent ?? (answers.maritalStatus === 'SINGLE' && childrenWithModeration > 0),
      spouseEmployedByBusiness: answers.spouseEmployedByBusiness ?? false,
      rentalForfaitEligible: answers.rentalForfaitEligible ?? false,
      rentalSocial: answers.rentalSocial ?? false,
      asrdPrimeUnique: answers.asrdPrimeUnique,
      asrdSubscriberAge: answers.asrdSubscriberAge,
      asrdChildren: answers.asrdChildren,
      startupInvestment: answers.startupInvestment,
      nonResidentAssimilation: answers.nonResidentAssimilation,
      worldwideIncome: answers.worldwideIncome,
      luxembourgProfessionalIncome: answers.luxembourgProfessionalIncome,
      householdProfessionalIncome: answers.householdProfessionalIncome,
      foreignNetIncome: answers.foreignNetIncome,
    });"""
assert s3.count(old3) == 1
io.open(p3, "w", encoding="utf-8", newline="").write(s3.replace(old3, new3).replace("\n", "\r\n"))
print("ok")
