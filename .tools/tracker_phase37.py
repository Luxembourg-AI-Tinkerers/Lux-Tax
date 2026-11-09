import io

# syntax list
p = ".tools/syntax_check.cjs"
s = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in s else "\n"
target = '  "packages/tax-engine/test/certificate160.spec.ts",'
assert s.count(target) == 1
s = s.replace(target, target + nl + '  "packages/tax-engine/test/invariants.spec.ts",')
io.open(p, "w", encoding="utf-8", newline="").write(s)

# tracker
p2 = "implementation-tracker.md"
t = io.open(p2, encoding="utf-8", newline="").read().replace("\r\n", "\n")
anchor = "## Phase 36 — the questionnaire's write path is exercised"
assert t.count(anchor) == 1

phase = """## Phase 37 — property tests for the tariff (the shape, not just the points)

**Why.** Every engine test so far pinned **points**: eight golden values an auditor could check by
hand. That catches a wrong table but not an arithmetic slip at a bracket boundary, and it says
nothing about the other 99 % of the income range. This phase pins the **shape** instead.

`packages/tax-engine/test/invariants.spec.ts` — **23 tests**, deterministic sampling (LCG seeded
`20261109`, so a failure is reproducible), run over **all three packages (2025/2026/2028)** and all
three classes:

| Invariant | Why it must hold |
|---|---|
| non-negative, zero at or below zero income | a tariff cannot tax a loss |
| monotone: base tax never falls as income rises (dense 250 € sweep to 320 000 €) | progressivity |
| below a proportional ceiling (42 %) | the top marginal rate bounds the average rate |
| **no bracket cliff**: +50 € cannot raise the tax by more than 42 % × 50 | brackets must be continuous; an off-by-one boundary or an overlap shows up here |
| Class 2 splitting ≤ Class 1 | Art. 121 exists to reduce, never increase, the burden |
| Class 1a ≤ Class 1 | Art. 120bis relief can only help |

Assembled-calculation properties (six more): liability is never negative or non-finite across sampled
salaries up to 400 000 €; taxable income never exceeds gross income; **adding a 4 500 € third-pillar
contribution never raises the liability**; a higher salary never lowers the liability; and the same
input yields a deep-equal result twice.

**What the probe found: nothing — and that is the result.** The cliff sweep came back with a maximum
implied marginal of exactly **42.0 %** for Class 1 / 1a and **40.0 %** for Class 2 splitting, which
matches the published top rates. The brackets are continuous and no marginal exceeds the statute. The
invariants are now locked, so a future bracket edit that introduces an overlap fails immediately
instead of waiting for someone to notice a strange number in a return.

**Verification:** **463 / 463 tests** (440 + 23), `tsc -p tsconfig.test.json` exit 0,
`tsc -p tsconfig.render.json` exit 0, **61 files** syntax `ok`.

## Phase 36 — the questionnaire's write path is exercised"""

t = t.replace(anchor, phase, 1)
t = t.replace(
    "> - **Implemented and tested:** Phases 0–36 — tax engine, filing package + annex PDFs, eight",
    "> - **Implemented and tested:** Phases 0–37 — tax engine, filing package + annex PDFs, eight",
    1,
)
t = t.replace(">   Evidence: **440 / 440 tests**,", ">   Evidence: **463 / 463 tests**,", 1)
t = t.replace("60 files syntax `ok`.", "61 files syntax `ok`.", 1)
t = t.replace(
    "**Last updated:** 2026-11-09 · Phases 0–36 implemented · **440 tests passing** across **33 spec files**",
    "**Last updated:** 2026-11-09 · Phases 0–37 implemented · **463 tests passing** across **34 spec files**",
    1,
)
t = t.replace(
    "· 60 files syntax `ok` · **API e2e and a React Native build are NOT run**",
    "· 61 files syntax `ok` · **API e2e and a React Native build are NOT run**",
    1,
)
t = t.replace(
    "Totals: 440 tests, two `tsc` configurations at exit 0, 60 files syntax `ok`.",
    "Totals: 463 tests, two `tsc` configurations at exit 0, 61 files syntax `ok`.",
    1,
)

io.open(p2, "w", encoding="utf-8", newline="").write(t.replace("\n", "\r\n"))
print("ok")
