import io

# ---- A) contracts: the ledger becomes part of the questionnaire answers.
p = "packages/contracts/src/questionnaire.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
crlf = "\r\n" in raw
s = raw.replace("\r\n", "\n")

old = """  /** Art. 114 prior-year losses. */
  priorYearLosses?: number;
"""
new = """  /** Art. 114 prior-year losses as a single total (legacy: no year, so no expiry check). */
  priorYearLosses?: number;
  /**
   * Art. 114 losses with the year each arose. Preferred over `priorYearLosses` when present:
   * the 17-year carry-forward window can only be enforced when the year is known.
   */
  lossCarryForward?: Array<{ year: number; amount: number }>;
"""
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new, 1)
if crlf:
    s = s.replace("\n", "\r\n")
io.open(p, "w", encoding="utf-8", newline="").write(s)

# ---- B) validation: bounded array of year/amount pairs.
p2 = "packages/validation/src/questionnaire.schema.ts"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
crlf2 = "\r\n" in raw2
v = raw2.replace("\r\n", "\n")

old2 = "  priorYearLosses: z.number().min(0).max(10_000_000).optional(),\n"
new2 = (
    "  priorYearLosses: z.number().min(0).max(10_000_000).optional(),\n"
    "  /** Art. 114 losses by year; the engine enforces the 17-year window on these. */\n"
    "  lossCarryForward: z\n"
    "    .array(\n"
    "      z.object({\n"
    "        year: z.number().int().min(1990).max(2100),\n"
    "        amount: z.number().min(0).max(10_000_000),\n"
    "      }),\n"
    "    )\n"
    "    .max(50)\n"
    "    .optional(),\n"
)
assert v.count(old2) == 1, v.count(old2)
v = v.replace(old2, new2, 1)
if crlf2:
    v = v.replace("\n", "\r\n")
io.open(p2, "w", encoding="utf-8", newline="").write(v)

# ---- C) API: pass the ledger through.
p3 = "apps/api/src/modules/calculations/calculations.service.ts"
raw3 = io.open(p3, encoding="utf-8", newline="").read()
crlf3 = "\r\n" in raw3
c = raw3.replace("\r\n", "\n")

old3 = "      priorYearLosses: answers.priorYearLosses,\n"
new3 = "      priorYearLosses: answers.priorYearLosses,\n      lossCarryForward: answers.lossCarryForward,\n"
assert c.count(old3) == 1, c.count(old3)
c = c.replace(old3, new3, 1)
if crlf3:
    c = c.replace("\n", "\r\n")
io.open(p3, "w", encoding="utf-8", newline="").write(c)

# ---- D) engine: the ledger is authoritative; a stale total must not resurrect expired losses.
p4 = "packages/tax-engine/src/engine.ts"
raw4 = io.open(p4, encoding="utf-8", newline="").read()
crlf4 = "\r\n" in raw4
e = raw4.replace("\r\n", "\n")

old4 = """    const priorLosses = round2(Math.max(priorLossesFromLedger, params.priorYearLosses ?? 0));
"""
new4 = """    // A ledger, when supplied, is authoritative: taking the larger of the two would let a stale
    // total re-introduce losses the 17-year window has already expired.
    const priorLosses = round2(
      (params.lossCarryForward?.length ?? 0) > 0
        ? priorLossesFromLedger
        : (params.priorYearLosses ?? 0),
    );
"""
assert e.count(old4) == 1, e.count(old4)
e = e.replace(old4, new4, 1)
if crlf4:
    e = e.replace("\n", "\r\n")
io.open(p4, "w", encoding="utf-8", newline="").write(e)

print("ok")
