import io

p = "implementation-tracker.md"
t = io.open(p, encoding="utf-8", newline="").read().replace("\r\n", "\n")
anchor = "## Phase 37 — property tests for the tariff (the shape, not just the points)"
assert t.count(anchor) == 1

phase = """## Phase 38 — an over-deduction bug: owner-occupier interest with no fixation year

**Found by probing, not by reading.** While testing that deductions cannot exceed income, a probe
scenario (5 000 € salary, 99 999 € mortgage interest) returned `deductions.total = 103 739`. The
`mortgageCap()` docstring said *“undefined = not owner-occupied”*, but the code read:

```ts
if (beforeDisposition || fixationYear === undefined) return interest;   // before Phase 38
```

So a mortgage-interest fact **without** `mortgageFixationYear` was deductible **without limit** — the
Art. 105 habit_pers bands (years 1–2 unlimited, 3–6 → 4 000, 7–11 → 3 000, 12+ → 2 000) were skipped
entirely. One missing optional field would have wiped out any taxable income, which is the
over-deduction this engine must never produce. It also contradicted the function's own comment.

**Why it was reachable.** `mortgageFixationYear` is optional on the DTO. `calculations.service.ts`
does map `answers.mortgageOccupancyYear` into it, so the normal questionnaire path supplies a year —
but nothing forced a caller to, and a missing year silently became an unlimited deduction rather than
an error.

**Fix.** `deductions.ts`: construction before *libre disposition* stays fully deductible
(`mortgageBeforeDisposition`), and an **absent** fixation year now returns **0**; `engine.ts` pushes a
warning naming the field and both ways to supply it. The refusal is visible in `warnings` rather than
being a silent 0 — the same "refuse rather than guess" rule the pending-measure gate follows.

**A test had pinned the buggy behaviour.** `code_141 reaches the MORTGAGE_INTEREST branch` asserted
1 000 € of interest with no year produced a 1 000 € deduction. It now supplies `mortgageFixationYear:
2025` (year 1 of the schedule, where unlimited *is* correct), so the certificate-mapping assertion is
preserved and the permissive case is gone.

| New test | Asserts |
|---|---|
| no fixation year | 99 999 € declared → **0 € deducted**, warning mentions "without the year the valeur locative was fixed" |
| construction | `mortgageBeforeDisposition: true` → 12 000 € fully deductible and **no** warning |
| schedule bands | tax year 2025 with fixation 2023 → 4 000 €, 2017 → 3 000 €, 2005 → 2 000 € |

**Second finding, in my own test.** The Phase 37 "reproducible" case failed after the change, and the
probe showed why: the only difference between two runs is `calculatedAt`, a wall-clock stamp. The
engine is pure (the input object is not mutated); the *test* was wrong to deep-equal the whole DTO. It
now compares every field except the timestamp.

**Verification:** **466 / 466 tests** (463 + 3), `tsc -p tsconfig.test.json` exit 0,
`tsc -p tsconfig.render.json` exit 0, **61 files** syntax `ok`.

## Phase 37 — property tests for the tariff (the shape, not just the points)"""

t = t.replace(anchor, phase, 1)
t = t.replace(
    "> - **Implemented and tested:** Phases 0–37 — tax engine, filing package + annex PDFs, eight",
    "> - **Implemented and tested:** Phases 0–38 — tax engine, filing package + annex PDFs, eight",
    1,
)
t = t.replace(">   Evidence: **463 / 463 tests**,", ">   Evidence: **466 / 466 tests**,", 1)
t = t.replace(
    "**Last updated:** 2026-11-09 · Phases 0–37 implemented · **463 tests passing**",
    "**Last updated:** 2026-11-09 · Phases 0–38 implemented · **466 tests passing**",
    1,
)
t = t.replace(
    "Totals: 463 tests, two `tsc` configurations at exit 0, 61 files syntax `ok`.",
    "Totals: 466 tests, two `tsc` configurations at exit 0, 61 files syntax `ok`.",
    1,
)

io.open(p, "w", encoding="utf-8", newline="").write(t.replace("\n", "\r\n"))
print("ok")
