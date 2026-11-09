import io

# syntax list
p = ".tools/syntax_check.cjs"
s = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in s else "\n"
target = '  "apps/web/test/fact-inclusion.spec.ts",'
assert s.count(target) == 1
s = s.replace(target, target + nl + '  "apps/web/test/questionnaire-view.spec.ts",')
io.open(p, "w", encoding="utf-8", newline="").write(s)

# tracker
p2 = "implementation-tracker.md"
t = io.open(p2, encoding="utf-8", newline="").read().replace("\r\n", "\n")

anchor = "## Phase 35 — the web layer gets its first tests, and one crash fixed"
assert t.count(anchor) == 1

phase = """## Phase 36 — the questionnaire's write path is exercised

**What was untested.** `QuestionnaireView` is not just a form: on save it turns three optional
"quick estimate" fields into **facts** through `POST /facts/confirm`, which the engine then taxes.
That write path had never been executed by any test — a wrong `fieldKey`, a wrong category or a
`NaN` amount would have shipped.

**Six tests, real client, stubbed `fetch`** (`apps/web/test/questionnaire-view.spec.ts`). Events are
invoked as the props React would call (`form.onSubmit`, `input.onChange`), so the handler wiring and
the JSON body are real while the browser is not.

| Case | Asserts |
|---|---|
| mount | GET `/api/workspaces/ws-1/questionnaire`, saved answers and readiness rendered |
| save, no estimates | exactly one write, `PUT …/questionnaire`, body deep-equals the answers, **no** `/facts/confirm` call |
| one estimate | one fact: `fieldKey: 'grossSalary'`, `amount: '50000.00'`, category `EMPLOYMENT_INCOME`, `isIncludedInReturn: true` |
| three estimates | facts in order: `grossSalary`, `withholdingTax`, `mortgageInterest` — the mortgage block only renders after its checkbox is toggled, so the test toggles it |
| non-numeric estimate | `'not-a-number'` posts **no** fact at all (rather than `amount: 'NaN'`) |
| server downgrade | when the API echoes `isIncludedInReturn: false`, the view renders the `factInclusionWarning()` message — the taxpayer is told the saved figure is not in the return |

**Two things this cost, both worth recording.** `saveQuestionnaire()` uses **PUT**, not POST, so the
first assertion draft filtered on the wrong method. And a re-render replaces the element tree:
submitting the tree captured before typing invoked a handler closed over the *previous* state, which
made the salary fact silently disappear. The suite now re-reads the tree before submitting — a
harness bug, not a product one, but exactly the kind that would have made a weaker test "pass" while
proving nothing.

**Type coverage.** `QuestionnaireView.tsx` and its spec were added to `tsconfig.test.json`, so the
view is compiled in the main configuration rather than only transpiled.

**Verification:** **440 / 440 tests** (434 + 6), `tsc -p tsconfig.test.json` exit 0,
`tsc -p tsconfig.render.json` exit 0, **60 files** syntax `ok`.

## Phase 35 — the web layer gets its first tests, and one crash fixed"""

t = t.replace(anchor, phase, 1)
t = t.replace(
    "> - **Implemented and tested:** Phases 0–35 — tax engine, filing package + annex PDFs, eight",
    "> - **Implemented and tested:** Phases 0–36 — tax engine, filing package + annex PDFs, eight",
    1,
)
t = t.replace(">   Evidence: **434 / 434 tests**,", ">   Evidence: **440 / 440 tests**,", 1)
t = t.replace("59 files syntax `ok`.", "60 files syntax `ok`.", 1)
t = t.replace(
    "**Last updated:** 2026-11-09 · Phases 0–35 implemented · **434 tests passing** across **32 spec files**",
    "**Last updated:** 2026-11-09 · Phases 0–36 implemented · **440 tests passing** across **33 spec files**",
    1,
)
t = t.replace(
    "· 59 files syntax `ok` · **API e2e and a React Native build are NOT run**",
    "· 60 files syntax `ok` · **API e2e and a React Native build are NOT run**",
    1,
)
t = t.replace(
    "Totals: 434 tests, two `tsc` configurations at exit 0, 59 files syntax `ok`.",
    "Totals: 440 tests, two `tsc` configurations at exit 0, 60 files syntax `ok`.",
    1,
)

io.open(p2, "w", encoding="utf-8", newline="").write(t.replace("\n", "\r\n"))
print("ok")
