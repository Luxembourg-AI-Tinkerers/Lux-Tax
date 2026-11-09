import io

# ---------------------------------------------------------------- A) contracts
p = "packages/contracts/src/questionnaire.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
crlf = "\r\n" in raw
s = raw.replace("\r\n", "\n")

old = """  /**
   * Art. 114 losses with the year each arose. Preferred over `priorYearLosses` when present:
   * the 17-year carry-forward window can only be enforced when the year is known.
   */
  lossCarryForward?: Array<{ year: number; amount: number }>;
"""
new = """  /**
   * Art. 114 losses with the year each arose. Preferred over `priorYearLosses` when present:
   * the 17-year carry-forward window can only be enforced when the year is known.
   */
  lossCarryForward?: Array<{ year: number; amount: number }>;

  /**
   * Art. 3 d): residence of the spouse. A couple whose two members live in different countries is
   * a "mixed couple" and is taxed separately unless the conditions below are met.
   */
  spouseResidence?: 'RESIDENT' | 'NON_RESIDENT';
  /**
   * Art. 3 d): the mixed couple asks for collective assessment. Granted only when the resident
   * spouse realises at least 90 % of the household's professional income in Luxembourg.
   */
  mixedCoupleCollectiveRequested?: boolean;
"""
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new, 1)
if crlf:
    s = s.replace("\n", "\r\n")
io.open(p, "w", encoding="utf-8", newline="").write(s)

# ---------------------------------------------------------------- B) validation
p2 = "packages/validation/src/questionnaire.schema.ts"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
crlf2 = "\r\n" in raw2
v = raw2.replace("\r\n", "\n")

old2 = "  /** Art. 114 losses by year; the engine enforces the 17-year window on these. */\n"
new2 = (
    "  /** Art. 3 d): where the spouse lives, for the mixed-couple gate. */\n"
    "  spouseResidence: z.enum(['RESIDENT', 'NON_RESIDENT']).optional(),\n"
    "  /** Art. 3 d): the couple asks for collective assessment (needs a mixed couple). */\n"
    "  mixedCoupleCollectiveRequested: z.boolean().optional(),\n"
    "  /** Art. 114 losses by year; the engine enforces the 17-year window on these. */\n"
)
assert v.count(old2) == 1, v.count(old2)
v = v.replace(old2, new2, 1)

# Refinement: a collective request without a spouse residence cannot be evaluated.
old_refine = "  if (\n    answers.hasPrimaryResidenceMortgage &&"
new_refine = """  if (answers.mixedCoupleCollectiveRequested && answers.spouseResidence === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['spouseResidence'],
      message:
        'A request for collective assessment (Art. 3 d) needs the spouse\\'s residence: the gate ' +
        'compares the two residences and requires the resident spouse to realise at least 90 % of ' +
        'the household professional income in Luxembourg.',
    });
  }

  if (
    answers.hasPrimaryResidenceMortgage &&"""
assert v.count(old_refine) == 1, v.count(old_refine)
v = v.replace(old_refine, new_refine, 1)

if crlf2:
    v = v.replace("\n", "\r\n")
io.open(p2, "w", encoding="utf-8", newline="").write(v)

# ---------------------------------------------------------------- C) API mapping
p3 = "apps/api/src/modules/calculations/calculations.service.ts"
raw3 = io.open(p3, encoding="utf-8", newline="").read()
crlf3 = "\r\n" in raw3
c = raw3.replace("\r\n", "\n")

old3 = "      lossCarryForward: answers.lossCarryForward,\n"
new3 = (
    "      lossCarryForward: answers.lossCarryForward,\n"
    "      spouseResidence: answers.spouseResidence,\n"
    "      mixedCoupleCollectiveRequested: answers.mixedCoupleCollectiveRequested,\n"
)
assert c.count(old3) == 1, c.count(old3)
c = c.replace(old3, new3, 1)
if crlf3:
    c = c.replace("\n", "\r\n")
io.open(p3, "w", encoding="utf-8", newline="").write(c)

print("ok")
