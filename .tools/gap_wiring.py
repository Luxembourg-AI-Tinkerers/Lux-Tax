import io

# contracts questionnaire additions
p = "packages/contracts/src/questionnaire.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """  /** Non-resident assimilation inputs (Art. 157ter / Art. 3 d). */"""
new = """  /** One movable gain (Art. 99bis / 100) — simple single-row entry. */
  movableGainProceeds?: number;
  movableGainCost?: number;
  movableGainHoldingMonths?: number;
  movableGainParticipationPercent?: number;

  /** One real-estate gain (Art. 99bis / 99ter / 102bis). */
  realEstateGainProceeds?: number;
  realEstateGainCost?: number;
  realEstateGainHoldingYears?: number;
  realEstateGainPrincipalResidence?: boolean;

  /** One foreign income row, for the treaty method. */
  foreignCountry?: string;
  foreignAmount?: number;
  foreignTax?: number;

  /** Non-resident assimilation inputs (Art. 157ter / Art. 3 d). */"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))

# validation schema
p2 = "packages/validation/src/questionnaire.schema.ts"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")
old2 = """  nonResidentAssimilation: z.boolean().optional(),"""
new2 = """  movableGainProceeds: z.number().min(0).max(100_000_000).optional(),
  movableGainCost: z.number().min(0).max(100_000_000).optional(),
  movableGainHoldingMonths: z.number().int().min(0).max(1200).optional(),
  movableGainParticipationPercent: z.number().min(0).max(100).optional(),
  realEstateGainProceeds: z.number().min(0).max(100_000_000).optional(),
  realEstateGainCost: z.number().min(0).max(100_000_000).optional(),
  realEstateGainHoldingYears: z.number().int().min(0).max(200).optional(),
  realEstateGainPrincipalResidence: z.boolean().optional(),
  foreignCountry: z.string().length(2).optional(),
  foreignAmount: z.number().min(0).max(100_000_000).optional(),
  foreignTax: z.number().min(0).max(100_000_000).optional(),
  nonResidentAssimilation: z.boolean().optional(),"""
assert s2.count(old2) == 1
io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace(old2, new2).replace("\n", "\r\n"))

# service mapping
p3 = "apps/api/src/modules/calculations/calculations.service.ts"
raw3 = io.open(p3, encoding="utf-8", newline="").read()
s3 = raw3.replace("\r\n", "\n")
old3 = """      nonResidentAssimilation: answers.nonResidentAssimilation,"""
new3 = """      // Single-row plus-values entry mirroring the questionnaire.
      movableGains:
        answers.movableGainProceeds && answers.movableGainProceeds > 0
          ? [{
              proceeds: answers.movableGainProceeds,
              cost: answers.movableGainCost ?? 0,
              holdingMonths: answers.movableGainHoldingMonths ?? 12,
              participationPercent: answers.movableGainParticipationPercent ?? 0,
            }]
          : undefined,
      realEstateGains:
        answers.realEstateGainProceeds && answers.realEstateGainProceeds > 0
          ? [{
              proceeds: answers.realEstateGainProceeds,
              cost: answers.realEstateGainCost ?? 0,
              holdingYears: answers.realEstateGainHoldingYears ?? 10,
              isPrincipalResidence: answers.realEstateGainPrincipalResidence ?? false,
            }]
          : undefined,
      // One foreign income row -> treaty method.
      foreignIncomeItems:
        answers.foreignAmount && answers.foreignAmount > 0
          ? [{
              country: answers.foreignCountry ?? 'FR',
              amount: answers.foreignAmount,
              foreignTax: answers.foreignTax ?? 0,
            }]
          : undefined,
      nonResidentAssimilation: answers.nonResidentAssimilation,"""
assert s3.count(old3) == 1
io.open(p3, "w", encoding="utf-8", newline="").write(s3.replace(old3, new3).replace("\n", "\r\n"))
print("ok")
