import io

# syntax list
p = ".tools/syntax_check.cjs"
s = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in s else "\n"
target = '  "packages/validation/test/mortgage-year.spec.ts",'
assert s.count(target) == 1
s = s.replace(
    target,
    target + nl
    + '  "packages/tax-engine/test/loss-ledger.spec.ts",' + nl
    + '  "apps/api/test/param-wiring.spec.ts",',
)
io.open(p, "w", encoding="utf-8", newline="").write(s)

# tracker
p2 = "implementation-tracker.md"
t = io.open(p2, encoding="utf-8", newline="").read().replace("\r\n", "\n")
anchor = "## Phase 42 — closing the loop on my own Phase 38 change"
assert t.count(anchor) == 1

phase = """## Phase 43 — the Art. 114 ledger was unreachable, and its precedence was wrong

**Found by auditing the boundary, not the engine.** A name-level sweep of `TaxCalculationParams`
against `calculations.service.ts` returned four parameters that never appear in the API mapping. Two
were legitimate (`qualifyingDividends`, `rentalProperties`, `movableGains`, `realEstateGains` and the
like are derived from **facts**, not from answers). One was not:

**`lossCarryForward` — the Art. 114 multi-year ledger — was never supplied.** The engine accepts
`{ year, amount }[]` and filters it against the 17-year window, but the API passed only the scalar
`priorYearLosses`, which carries no year. So in production the 17-year rule could never fire: a loss
from 20 years ago would be deducted as if it were current.

**Two defects, one shape.**

1. *Unreachable:* `lossCarryForward` added to `QuestionnaireAnswersDto`, bounded in the validation
   schema (≤ 50 entries, year 1990–2100, amount 0–10 M) and passed through by the service.
2. *Wrong precedence:* the engine computed `max(ledgerSum, scalar)`. With a valid 5 000 € ledger and
   a stale 90 000 € total, the **expired** 90 000 won. It now reads:
   if a non-empty ledger is supplied it is authoritative; otherwise fall back to the scalar. An
   all-expired ledger therefore yields **0**, not the stale total.

**Seven engine tests** (`loss-ledger.spec.ts`): entries inside the window sum; a 20-year-old entry is
ignored; one exactly 17 years old is kept; a stale scalar cannot outrank a smaller valid ledger; the
scalar still works when no ledger exists; an all-expired ledger does not fall back; non-positive
entries are ignored.

**And the audit became a test.** `apps/api/test/param-wiring.spec.ts` parses `TaxCalculationParams`
and `calculations.service.ts` and fails when a parameter reaches no code path. Two lists keep it
honest: `NOT_FROM_ANSWERS` (fact-derived or workspace-derived, with the reason) and `KNOWN_UNWIRED`,
which documents a **real remaining gap** rather than hiding it:

| Known gap | Consequence |
|---|---|
| `spouseResidence` | no questionnaire field, so a mixed resident/non-resident couple cannot be described |
| `mixedCoupleCollectiveRequested` | no questionnaire field, so the Art. 3ter collective election cannot be expressed |

A third assertion fails if a name on the known-gap list becomes wired, so the list cannot rot.

**Verification:** **500 / 500 tests** (488 + 7 + 5), `tsc -p tsconfig.test.json` exit 0,
`tsc -p tsconfig.render.json` exit 0, **67 files** syntax `ok`.

## Phase 42 — closing the loop on my own Phase 38 change"""

t = t.replace(anchor, phase, 1)
t = t.replace(
    "> - **Implemented and tested:** Phases 0–42 — tax engine, filing package + annex PDFs, eight",
    "> - **Implemented and tested:** Phases 0–43 — tax engine, filing package + annex PDFs, eight",
    1,
)
t = t.replace(">   Evidence: **488 / 488 tests**,", ">   Evidence: **500 / 500 tests**,", 1)
t = t.replace("64 files syntax `ok`.", "67 files syntax `ok`.", 1)
t = t.replace(
    "**Last updated:** 2026-11-09 · Phases 0–42 implemented · **488 tests passing** across **36 spec files**",
    "**Last updated:** 2026-11-09 · Phases 0–43 implemented · **500 tests passing** across **38 spec files**",
    1,
)
t = t.replace(
    "· 64 files syntax `ok` · **API e2e and a React Native build are NOT run**",
    "· 67 files syntax `ok` · **API e2e and a React Native build are NOT run**",
    1,
)

io.open(p2, "w", encoding="utf-8", newline="").write(t.replace("\n", "\r\n"))
print("ok")
