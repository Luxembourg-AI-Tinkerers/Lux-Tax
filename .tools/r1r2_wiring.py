import io

# contracts questionnaire
p = "packages/contracts/src/questionnaire.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """  /** One foreign income row, for the treaty method. */"""
new = """  /** One securities row (capital income). */
  securitiesGrossIncome?: number;
  securitiesQualifying?: boolean;
  securitiesForeignTax?: number;
  securitiesRelibiWithheld?: number;
  relibiFinalElective?: boolean;

  /** One rental building (asset register). */
  rentalGrossRent?: number;
  rentalCharges?: number;
  rentalPurchasePrice?: number;
  rentalCompletionYear?: number;
  rentalEnergyRenovationAmount?: number;
  rentalInterest?: number;

  /** One foreign income row, for the treaty method. */"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))

# validation
p2 = "packages/validation/src/questionnaire.schema.ts"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")
old2 = """  foreignCountry: z.string().length(2).optional(),"""
new2 = """  securitiesGrossIncome: z.number().min(0).max(100_000_000).optional(),
  securitiesQualifying: z.boolean().optional(),
  securitiesForeignTax: z.number().min(0).max(100_000_000).optional(),
  securitiesRelibiWithheld: z.number().min(0).max(100_000_000).optional(),
  relibiFinalElective: z.boolean().optional(),
  rentalGrossRent: z.number().min(0).max(100_000_000).optional(),
  rentalCharges: z.number().min(0).max(100_000_000).optional(),
  rentalPurchasePrice: z.number().min(0).max(100_000_000).optional(),
  rentalCompletionYear: z.number().int().min(1800).max(2100).optional(),
  rentalEnergyRenovationAmount: z.number().min(0).max(100_000_000).optional(),
  rentalInterest: z.number().min(0).max(100_000_000).optional(),
  foreignCountry: z.string().length(2).optional(),"""
assert s2.count(old2) == 1
io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace(old2, new2).replace("\n", "\r\n"))

# service mapping
p3 = "apps/api/src/modules/calculations/calculations.service.ts"
raw3 = io.open(p3, encoding="utf-8", newline="").read()
s3 = raw3.replace("\r\n", "\n")
old3 = """      // One foreign income row -> treaty method."""
new3 = """      relibiFinalElective: answers.relibiFinalElective ?? false,
      securities:
        answers.securitiesGrossIncome && answers.securitiesGrossIncome > 0
          ? [{
              grossIncome: answers.securitiesGrossIncome,
              qualifyingDividend: answers.securitiesQualifying ?? false,
              foreignTax: answers.securitiesForeignTax ?? 0,
              relibiWithheld: answers.securitiesRelibiWithheld ?? 0,
            }]
          : undefined,
      rentalProperties:
        answers.rentalGrossRent && answers.rentalGrossRent > 0
          ? [{
              grossRent: answers.rentalGrossRent,
              charges: answers.rentalCharges ?? 0,
              purchasePrice: answers.rentalPurchasePrice,
              completionYear: answers.rentalCompletionYear,
              energyRenovationAmount: answers.rentalEnergyRenovationAmount,
              interest: answers.rentalInterest ?? 0,
            }]
          : undefined,
      // One foreign income row -> treaty method."""
assert s3.count(old3) == 1
io.open(p3, "w", encoding="utf-8", newline="").write(s3.replace(old3, new3).replace("\n", "\r\n"))
print("ok")
