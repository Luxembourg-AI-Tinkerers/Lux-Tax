import io

p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

anchor = "## Phase 29 — MOB-11: banner and lock components (renderers only)"
assert s.count(anchor) == 1

phase = """## Phase 30 — the pending-measure gate becomes executable

**Gap found while auditing R6/R7.** The tracker claimed “a test proves the activation”. It did not.
`pendingMeasures` had **zero** references in any spec, `cic` had **no consumer anywhere** in
`packages/tax-engine`, and the gate existed only as a comment plus an optional field. Worse, the
natural way to read the current API — `cicForSalary()` returning `0` — conflates *“no credit by
law”* with *“a credit worth nothing”*. Both are the same number and different facts.

So the last truthfully-finishable piece of R6/R7 is not the numbers (blocked on projet de loi 8775)
but the **mechanism around them**, which is law-independent:

| New | What it does |
|---|---|
| `src/pending.ts` → `pendingMeasureStatus()` | `IN_FORCE` / `NOT_IN_FORCE` / `UNKNOWN` for a given measure id, from the package itself |
| `cicForMonthlySalary()` | Returns `status: 'NOT_IN_FORCE'` — **never a silent `0`** — while the table is unpublished, with a note naming the tax year and the measure status |
| `cicFromTable()` | Pure band lookup (`salary × slope + offset`, last band `topAmount` up to `topUpTo`), monthly amount rounded **up** to the cent, floored at zero, and banded out-of-range salaries reported rather than guessed |
| `checkPendingConsistency()` | Reports contradictions: a measure `IN_FORCE` with no data; a `cic` table present while the measure is `NOT_IN_FORCE`; `EPARGNE_LOGEMENT_8775` in force while `savingsHousingYoungMaxAge` is still 40; a measure with no source or activation text |
| `assertPendingConsistency()` | Throwing form, for package construction |

**What this fixes.** A maintainer who flips `CIC_2026` to `IN_FORCE` without pasting the table now
gets a named violation instead of a quietly-zero credit; one who pastes a table but forgets the
flag gets the mirror violation. Both are caught by the suite before the package ships.

**The activation dry-run.** One test builds a *synthetic* table on top of a deep clone of
`RULES_2026`, flips both measures, sets `savingsHousingYoungMaxAge: 200`, and asserts the package
is coherent and the lookup works (60 €/month at 3 000 €, 70 € at 4 000 €, 10 € at the top band,
0 € above it). That exercises the exact four-edit activation in the runbook **without writing a
single unpublished figure into shipped data** — `RULES_2026` itself is untouched and still carries
no `cic`.

**Verification:** **384 / 384 tests** (373 + 11 new in `packages/tax-engine/test/pending.spec.ts`),
`tsc -p tsconfig.test.json` exit 0, **54 files** syntax `ok` (the checker's curated list extended by
the two new files).
**Still open:** R6/R7 themselves — the published 2026 CIC bands and the 8775 entry into force.

## Phase 29 — MOB-11: banner and lock components (renderers only)"""

s = s.replace(anchor, phase, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
