import io

# 1) syntax check list: add the three new test files and the touched component.
p = ".tools/syntax_check.cjs"
s = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in s else "\n"
target = '  "packages/tax-engine/test/certificate160.spec.ts",'
assert s.count(target) == 1
s = s.replace(
    target,
    target + nl
    + '  "apps/web/test/tax-calculator-view.spec.ts",' + nl
    + '  "apps/web/test/fact-inclusion.spec.ts",' + nl
    + '  "packages/design-tokens/test/translations.spec.ts",',
)
io.open(p, "w", encoding="utf-8", newline="").write(s)

# 2) Tracker.
p2 = "implementation-tracker.md"
t = io.open(p2, encoding="utf-8", newline="").read().replace("\r\n", "\n")

anchor = "## Phase 34 — certificate 160 gets tests (the mapping that feeds real returns)"
assert t.count(anchor) == 1

phase = """## Phase 35 — the web layer gets its first tests, and one crash fixed

**Continuing the non-R6/R7 track.** `apps/web` had **no tests at all** — ten components, ~250 KB,
including the screen that shows the taxpayer their final figure. Three additions, and one defect
found in the process.

**A defect, not just coverage.** `TaxCalculatorView` rendered `calc.unsupported.length` directly.
`getLatestCalculation()` returns a **stored JSON blob cast straight to the DTO**
(`workspace.calculationResult as unknown as TaxCalculationResultDto`), so any result saved before the
`unsupported` field existed arrives without it — and the view threw
`TypeError: Cannot read properties of undefined (reading 'length')` *instead of rendering the
figures it does have*. Fixed to `Array.isArray(calc.unsupported) && …`, with a regression test that
mounts a payload with the field deleted. This is the class of bug that only appears on real
historical data, which is exactly what the cast makes reachable.

**`apps/web/test/tax-calculator-view.spec.ts`** — the first mounted web view. It stubs `fetch`
(the client's only I/O) rather than the client, so the URL, the envelope handling and the render are
all exercised. The fixture is **not hand-written**: `calculations.service.ts` builds the DTO as
`{ ...engineResult, comparisonEligible }`, so the test runs the real engine on a 60 000 € salary and
feeds its output to the view — the numbers on screen are the engine's numbers (58 980.00 € taxable,
1 020.00 € deductions, 396.00 € credits).

| Case | Asserts |
|---|---|
| saved calculation | requests `/api/workspaces/ws-1/calculation`, renders the year, the rule-package version and the exact formatted taxable income |
| refused input | the "This scenario is not fully supported" banner and the specific `unsupported` line |
| nothing refused | banner absent |
| no saved result | empty state ("Run First Tax Calculation"), no crash |
| **legacy result** | a payload without `unsupported` still renders — the regression above |
| API error | degrades to the empty state and never leaks `NaN` or `undefined` into the view |

**`apps/web/test/fact-inclusion.spec.ts`** (5 tests) — `factInclusionWarning()` decides whether the
UI tells the taxpayer that a saved figure is *not* in the return because its document is only shared
for discussion. Pinned: warn only on `requested && returned === false`; an **absent** flag is not a
refusal (warning on `undefined` would fire on every older payload and teach users to ignore it).

**`packages/design-tokens/test/translations.spec.ts`** (9 tests) — unique snake_case keys, every term
translated in en/fr/de, no English pasted into `fr`/`de`, a legal reference on all but at most one
term, and `getTermTranslation()` echoing an unknown key rather than throwing. **Noted, not fixed:
`getTermTranslation()` currently has no consumer** — only `LUXEMBOURG_TAX_TERMS` is used, by the admin
console. The function is kept because the test pins its contract, but it is dead code today.

**Infrastructure.** `tsconfig.test.json` gained `jsx: react-jsx`, path mappings for
`@luxtax/api-client` and `@luxtax/design-tokens`, and the five new files — so the web view is now
type-checked in the main configuration rather than only transpiled.

**Verification:** **434 / 434 tests** (414 + 20), `tsc -p tsconfig.test.json` exit 0,
`tsc -p tsconfig.render.json` exit 0, **59 files** syntax `ok`.

## Phase 34 — certificate 160 gets tests (the mapping that feeds real returns)"""

t = t.replace(anchor, phase, 1)
t = t.replace(
    "> - **Implemented and tested:** Phases 0–34 — tax engine, filing package + annex PDFs, eight",
    "> - **Implemented and tested:** Phases 0–35 — tax engine, filing package + annex PDFs, eight",
    1,
)
t = t.replace(">   Evidence: **414 / 414 tests**,", ">   Evidence: **434 / 434 tests**,", 1)
t = t.replace("56 files syntax `ok`.", "59 files syntax `ok`.", 1)
t = t.replace(
    "**Last updated:** 2026-11-09 · Phases 0–34 implemented · **414 tests passing** across **29 spec files**",
    "**Last updated:** 2026-11-09 · Phases 0–35 implemented · **434 tests passing** across **32 spec files**",
    1,
)
t = t.replace(
    "· 56 files syntax `ok` · **API e2e and a React Native build are NOT run**",
    "· 59 files syntax `ok` · **API e2e and a React Native build are NOT run**",
    1,
)
t = t.replace(
    "Totals: 414 tests, two `tsc` configurations at exit 0, 56 files syntax `ok`.",
    "Totals: 434 tests, two `tsc` configurations at exit 0, 59 files syntax `ok`.",
    1,
)

io.open(p2, "w", encoding="utf-8", newline="").write(t.replace("\n", "\r\n"))
print("ok")
