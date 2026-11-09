import io

p = "implementation-tracker.md"
t = io.open(p, encoding="utf-8", newline="").read().replace("\r\n", "\n")
anchor = "## Phase 38 — an over-deduction bug: owner-occupier interest with no fixation year"
assert t.count(anchor) == 1

phase = """## Phase 39 — a second over-deduction bug: losses bigger than the income they offset

**Same probe family, another instance.** Having found one "optional input becomes an unlimited
benefit" bug in Phase 38, the same sweep was pointed at every other deduction. Most held: donations of
500 000 € on a 60 000 € salary deduct **12 000 €** (the 20 % ceiling); épargne-logement without a
subscriber age deducts the **672 €** base amount rather than the doubled young-saver rate; LRCP,
Art. 111 and the childcare/household-help forfait all clamp.

Prior-year losses did not:

```ts
const priorLossesDeduction = clampPositive(ctx.priorYearLosses);   // no cap at all
```

A 900 000 € carry-forward against 60 000 € of income produced `priorLosses = 900 000`,
`deductions.total = 901 020` — twenty times the income it is deducted from. The *tax* was still 0
because the taxable base is floored, so nothing looked wrong on the final figure; what was wrong is
the record: **841 020 € of Art. 114 loss would have been silently consumed** instead of staying in the
carry-forward.

**Fix.** `DeductionContext` gains `availableIncomeForLosses` (the year's net income, already computed
before the deduction pass), and the loss deduction becomes
`min(declared, max(0, netIncome − otherDeductions))`. The engine then pushes a warning that names both
figures: how much was applied and how much stays in the carry-forward. A fully absorbed loss stays
silent.

| Result after the fix | Value |
|---|---|
| taxable income | 0 |
| `deductions.priorLosses` | **58 980** (= 60 000 net − 1 020 ordinary deductions) |
| `deductions.total` | **60 000**, never more than net income |
| warning | "…58 980.00 was applied and 841 020.00 stays in the Art. 114 carry-forward." |

Two tests added: the capped case above, and a 5 000 € loss that is absorbed in full without a warning
(so the warning cannot become noise that users learn to ignore).

**Verification:** **468 / 468 tests** (466 + 2), `tsc -p tsconfig.test.json` exit 0,
`tsc -p tsconfig.render.json` exit 0, **61 files** syntax `ok`.

## Phase 38 — an over-deduction bug: owner-occupier interest with no fixation year"""

t = t.replace(anchor, phase, 1)
t = t.replace(
    "> - **Implemented and tested:** Phases 0–38 — tax engine, filing package + annex PDFs, eight",
    "> - **Implemented and tested:** Phases 0–39 — tax engine, filing package + annex PDFs, eight",
    1,
)
t = t.replace(">   Evidence: **466 / 466 tests**,", ">   Evidence: **468 / 468 tests**,", 1)
t = t.replace(
    "**Last updated:** 2026-11-09 · Phases 0–38 implemented · **466 tests passing**",
    "**Last updated:** 2026-11-09 · Phases 0–39 implemented · **468 tests passing**",
    1,
)
t = t.replace(
    "Totals: 466 tests, two `tsc` configurations at exit 0, 61 files syntax `ok`.",
    "Totals: 468 tests, two `tsc` configurations at exit 0, 61 files syntax `ok`.",
    1,
)

io.open(p, "w", encoding="utf-8", newline="").write(t.replace("\n", "\r\n"))
print("ok")
