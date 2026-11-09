import io

# syntax list
p = ".tools/syntax_check.cjs"
s = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in s else "\n"
target = '  "apps/api/test/param-wiring.spec.ts",'
assert s.count(target) == 1
s = s.replace(
    target,
    target + nl
    + '  "packages/tax-engine/test/mixed-couple.spec.ts",' + nl
    + '  "packages/validation/test/mixed-couple.spec.ts",',
)
io.open(p, "w", encoding="utf-8", newline="").write(s)

# tracker
p2 = "implementation-tracker.md"
t = io.open(p2, encoding="utf-8", newline="").read().replace("\r\n", "\n")
anchor = "## Phase 43 — the Art. 114 ledger was unreachable, and its precedence was wrong"
assert t.count(anchor) == 1

phase = """## Phase 44 — the mixed-couple gate is now reachable from the app

**Closing the two gaps Phase 43 documented.** `spouseResidence` and `mixedCoupleCollectiveRequested`
were engine parameters with **no questionnaire field and no UI control**, so Art. 3 d) could never
fire: every mixed resident/non-resident couple — a very common Luxembourg situation — silently fell
into separate taxation, and the app could not even describe the household.

**Wired end to end, four layers.**

| Layer | Change |
|---|---|
| Contracts | `spouseResidence?: 'RESIDENT' \\| 'NON_RESIDENT'`, `mixedCoupleCollectiveRequested?: boolean` |
| Validation | enum + boolean, plus a refinement: a collective request **without** a spouse residence is rejected — the gate compares two residences, so one alone is meaningless |
| API | both passed into `TaxCalculationParams` |
| Web UI | for `MARRIED` / `PACS`, a "Where does your spouse live?" select and — once a residence is chosen — a checkbox whose label states the real rule (≥ 90 % of household professional income in Luxembourg, otherwise separate taxation) |

**A vacuous test caught before it shipped.** The first version of the engine tests asserted
`ruleCode === 'LIR-ART-3-d'` in uppercase. The engine emits `'LIR-ART-3-d'`, so the two *negative*
cases passed for the wrong reason — they would have passed with the gate removed. Corrected, all five
now exercise the real branch:

- mixed couple without a request → separate treatment **and** the explanatory warning;
- request with a 95 % Luxembourg share → admitted, provenance line `LIR-ART-3-d`;
- request with a 70 % share → refused, warning names the 90 % threshold;
- both spouses resident → the request is ignored, no Art. 3 d) line;
- spouse residence unknown → unaffected.

**Also:** `param-wiring.spec.ts` now asserts `KNOWN_UNWIRED` is **empty** — every engine parameter
reaches a code path in the service.

**Verification:** **513 / 513 tests** (500 + 5 engine + 5 validation + 1 view + 2 wiring),
`tsc -p tsconfig.test.json` exit 0, `tsc -p tsconfig.render.json` exit 0, **68 files** syntax `ok`.

## Phase 43 — the Art. 114 ledger was unreachable, and its precedence was wrong"""

t = t.replace(anchor, phase, 1)
t = t.replace(
    "> - **Implemented and tested:** Phases 0–43 — tax engine, filing package + annex PDFs, eight",
    "> - **Implemented and tested:** Phases 0–44 — tax engine, filing package + annex PDFs, eight",
    1,
)
t = t.replace(">   Evidence: **500 / 500 tests**,", ">   Evidence: **513 / 513 tests**,", 1)
t = t.replace("66 files syntax `ok`.", "68 files syntax `ok`.", 1)
t = t.replace(
    "**Last updated:** 2026-11-09 · Phases 0–43 implemented · **500 tests passing** across **38 spec files**",
    "**Last updated:** 2026-11-09 · Phases 0–44 implemented · **513 tests passing** across **40 spec files**",
    1,
)
t = t.replace(
    "· 66 files syntax `ok` · **API e2e and a React Native build are NOT run**",
    "· 68 files syntax `ok` · **API e2e and a React Native build are NOT run**",
    1,
)

io.open(p2, "w", encoding="utf-8", newline="").write(t.replace("\n", "\r\n"))
print("ok")
