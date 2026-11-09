import io

p = "implementation-tracker.md"
t = io.open(p, encoding="utf-8", newline="").read().replace("\r\n", "\n")
anchor = "## Phase 39 — a second over-deduction bug: losses bigger than the income they offset"
assert t.count(anchor) == 1

phase = """## Phase 40 — a sign error could reduce another income line

**Third probe pass, third class of defect.** The sweep now covered inputs rather than caps: negative
amounts, absurd `travelUnits`, an oversized actual-expense claim, absurd child counts and ages.

Most held. `travelUnits: 10 000` and `1 000 000` produce the **same** deduction (the travel forfait is
bounded); a 500 000 € actual-expense fact is not mapped to any box and is reported as such;
`primaryAge` of 2 or 300 changes nothing. One input did not hold:

```
salary −60 000 + pension 40 000  →  grossIncome = −20 000
```

Facts were ingested with `const amount = Number(fact.amount) || 0` and **no sign check**. A negative
salary did not reduce the tax (net income is floored per person, so the final figure was right), but it
did flow into `grossIncome` — the first number the UI shows and the base of `effectiveTaxRate`. A
minute later someone reads "Gross Salary Income: −€20 000.00".

**Fix.** The ingestion loop refuses `amount < 0` with a warning that explains the intent: *"Enter the
correction as a positive amount in the right box; a sign error must not reduce another income line."*
A refused fact never reaches a bucket, so it cannot appear in `factIds`, `grossIncome` or any
deduction.

| Probe | Before | After |
|---|---|---|
| salary −60 000 alone | `gross = −60 000` | `gross = 0`, fact refused with a warning |
| salary −60 000 + pension 40 000 | `gross = −20 000` | `gross = 40 000` |
| negative donation / negative mortgage | ignored by the per-deduction clamp | refused at ingestion, with a warning instead of silence |

Two tests added (negative income and negative deduction). No existing test used a negative amount, so
nothing had to be rewritten this time.

**Verification:** **470 / 470 tests** (468 + 2), `tsc -p tsconfig.test.json` exit 0,
`tsc -p tsconfig.render.json` exit 0, **61 files** syntax `ok`.

## Phase 39 — a second over-deduction bug: losses bigger than the income they offset"""

t = t.replace(anchor, phase, 1)
t = t.replace(
    "> - **Implemented and tested:** Phases 0–39 — tax engine, filing package + annex PDFs, eight",
    "> - **Implemented and tested:** Phases 0–40 — tax engine, filing package + annex PDFs, eight",
    1,
)
t = t.replace(">   Evidence: **468 / 468 tests**,", ">   Evidence: **470 / 470 tests**,", 1)
t = t.replace(
    "**Last updated:** 2026-11-09 · Phases 0–39 implemented · **468 tests passing**",
    "**Last updated:** 2026-11-09 · Phases 0–40 implemented · **470 tests passing**",
    1,
)
t = t.replace(
    "Totals: 468 tests, two `tsc` configurations at exit 0, 61 files syntax `ok`.",
    "Totals: 470 tests, two `tsc` configurations at exit 0, 61 files syntax `ok`.",
    1,
)

io.open(p, "w", encoding="utf-8", newline="").write(t.replace("\n", "\r\n"))
print("ok")
