# LEG-8 — Class 2 vs 2× Class 1 (Art. 3ter) scenario comparison — independent review

Reviewer: independent re-check of `audit/impl-leg8.md`, `audit/audit-legal.md` §LEG-8 and the brief's six VERIFY
points against the current source. Read-only on the source; this report is the only file written.

**allPass: false** — must-fix 1, worth considering 1, notes 3.

## 1. Conclusion

The engine helper, the non-persisting path, the controller/client pair, the UI card and the regression gates hold:
`compareAssessmentModes` issues the three overrides on copies (`engine.ts:69-82`), `calculateTax({ persist: false })`
skips both writes (`calculations.service.ts:298-333`), the new route cannot collide with `:year`, the client URL
matches the controller, and 134/134 tests, `tsc` 0 and 31/31 syntax pass. One blocker remains: `comparable` is
`taxClass === CLASS_2` alone (`calculations.service.ts:364`), so a Class 2 household with no assessed spouse is
presented as a three-scenario comparison although all three runs are the same computation. That is the brief's
named blocker ("treats a non-couple as comparable"), and it is reachable from the questionnaire today. The author
discloses the widow(er) case in `impl-leg8.md` §5; disclosure does not clear the blocker.

## 2. Items (VERIFY 1–6)

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | `compareAssessmentModes`: three `calculate` calls, correct overrides, no input mutation, one rule package, no duplicated legal logic | **pass** | `engine.ts:69-82`; snapshots/tests `tax-engine.spec.ts:1427-1452`; probe |
| 2 | `calculateTax({ persist: false })` skips workspace update + audit + election, still validates/returns; normal path persists | **pass** | `calculations.service.ts:96-101,190,298-333`; only `prisma` writes are `:299` and `:314`; normal caller `calculations.controller.ts:28` |
| 3 | `compareScenarios`: three results, two deltas (collective − other), `comparable` only for a real Class 2 couple, warnings; no Art. 3ter for Class 1 | **fail** | `calculations.service.ts:347-395`; probe below; `TaxCalculatorView.tsx:557` |
| 4 | Route ordering and client URL | **pass** | `calculations.controller.ts:17,42`; no `:year` route under `api/workspaces/:workspaceId` (the `:year` route is `api/households/:id/workspaces/:year`, `workspaces.controller.ts:35`); `client.ts:365-368` |
| 5 | UI: button calls the endpoint, three totals + two deltas + deadline note, hides the table when not comparable, GET only | **pass** | `TaxCalculatorView.tsx:59-71,541-625` |
| 6 | Tests meaningful; 134/134, `tsc` 0, syntax 31/31; prior fixes unchanged | **pass (gap below)** | run below; LEG-1…LEG-6 describes present and green |

Item 3 fails only on `comparable`; the three results, the delta direction and the warnings union are correct.

## 3. Must fix (1)

### M1 — `comparable` is true for every Class 2 household, including one with no assessed spouse

- **Position.** `apps/api/src/modules/calculations/calculations.service.ts:364`, consumed at
  `apps/web/src/components/TaxCalculatorView.tsx:557`; contract wording at `packages/contracts/src/tax.ts:356-361`.
- **Problem.** The predicate is `collective.taxClass === TaxClass.CLASS_2`, but Class 2 is not equivalent to "two
  spouses assessed" in this codebase. `deriveTaxClass` returns Class 2 for a married filer (`class-resolution.ts:98`),
  a PACS couple that elected collective (`:103`), a widow(er) inside the Art. 119 n° 3 window (`:107`) and a divorced
  filer with `class2BeforeEvent` and an open window (`:114-117`). For the last two the service nulls the spouse
  (`calculations.service.ts:136-138`) and sets `class2WithoutSpouse` (`:164-167`); the engine then has no
  `spouseIncome`, so the `INDIVIDUAL_PURE` and `INDIVIDUAL_REALLOCATION` branches are skipped (`engine.ts:933,965`)
  and all three results are one computation. A married filer with no ACTIVE CO_FILER is taxed as Class 1
  (`engine.ts:842-849`, warning `:887-888`) but still carries `taxClass = CLASS_2`, so the card labels Class 1
  numbers "Collective Class 2 (Art. 3)". PACS partners are a couple but cannot elect "individual pure" — the
  project's own research says reallocation only (`research/class2-vs-art3ter-2025-2026.md:160`), yet the card offers
  a "2× Class 1 (Art. 3ter pure)" column.
- **Impact.** A widow(er) with a €60,000 salary sees 3,678.56 / 3,678.56 / 3,678.56 and €0.00 / €0.00 deltas under
  three different labels; a married filer whose spouse has not joined sees 11,111.85 three times; a PACS couple is
  shown a pure-individual election it cannot make. Because `comparable` is true, the UI renders the table and the
  "Only a Class 2 couple" guard never appears. For the widow the warning list is empty, so nothing caveats the
  table (probe, 2025 package, 60,000 salary, no other facts; observation, not golden).
- **Evidence.** `const comparable = collective.taxClass === TaxClass.CLASS_2;` (`calculations.service.ts:364`);
  probe output: widow `COLLECTIVE/INDIVIDUAL_PURE/INDIVIDUAL_REALLOCATION` all `3,678.56`, `warnings=[]`; married
  without CO_FILER all `11,111.85`; PACS `3,678.56 / 11,111.85 / 3,667.86`. The DTO comment claims "the household is
  a Class 2 couple, so the three scenarios are legally distinct" (`tax.ts:356-361`), which these states contradict.
- **Fix direction.** Decide comparability where marital status and the assessed spouse are already resolved
  (`calculateTax`), expose that as a result flag (`assessedWithSpouse` / `comparisonEligible`), and set
  `comparable = taxClass === CLASS_2 && that flag` — only a MARRIED household with a CO_FILER. A PACS card, if kept,
  can offer the reallocation only, never "individual pure". Add regression tests for the widow, the
  married-without-CO_FILER and the PACS states; today they would all assert `comparable === false` (or PACS
  reallocation-only) and fail.

## 4. Worth considering (1)

### W1 — The highest-risk invariant (`persist: false`) has no test

- **Position.** `apps/api/src/modules/calculations/calculations.service.ts:298-333`; new tests
  `packages/tax-engine/test/tax-engine.spec.ts:1414-1471`.
- **Problem.** All three new tests exercise the pure engine helper. None calls `calculateTax` with `persist: false`
  or checks the Prisma/audit calls; the only guard against a persisted comparison or a spurious `TAX_CALCULATED`
  event is code inspection.
- **Impact.** Moving `taxYearWorkspace.update` or `auditService.logEvent` outside the `if`, or changing the default,
  would leave 134/134 green and silently turn the comparison into a filed-looking run — exactly the blocker the
  brief names.
- **Suggestion.** Add a small service test with a Prisma stub and an audit spy: `persist: false` → 0 updates,
  0 events; normal path → 1 update, 1 event. If Nest DI is impractical here, extract the decision into a pure
  `shouldPersist(options)` helper and test that.

## 5. Record only (3)

- `compareScenarios` reads the workspace three times (`calculations.service.ts:348-360`), so a concurrent
  fact/document edit between runs can mix snapshots; disclosed in `impl-leg8.md` §5, permitted by the brief, and
  never persisted.
- `LuxembourgTaxEngine.compareAssessmentModes` (`engine.ts:69-82`) has no production caller; `compareScenarios`
  repeats the three overrides (`calculations.service.ts:348-360`). Two lists to keep in sync; harmless today.
- The UI deadline note (`TaxCalculatorView.tsx:617`) says "within the deadline" without the 31 December N+1 date
  given in `research/class2-vs-art3ter-2025-2026.md:13`; copy-only.

## 6. Scope and not covered

**Standard.** The brief's six VERIFY points, the LEG-8 requirement `luxembourg-tax-resident-gap-analysis.md:695`
and `audit/audit-legal.md:232-242`, plus the DTO's own doc comment. Where the brief and the executable rule
disagree on the `comparable` polarity, I reviewed against the executable rule and the UI contract.

**Verified.** Read the engine helper, the full `calculateTax`/`compareScenarios` path, every Prisma and audit call
in the service (only `:299` and `:314` write), the controller and route table, the client method, the UI card and
the three new tests. Ran:

```
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test
  packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts
  apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts
  apps/api/test/class-resolution.spec.ts
→ tests 134 / suites 22 / pass 134 / fail 0

node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json   → exit 0
node .tools/syntax_check.cjs                                        → exit 0, 31 files ok
```

Probes used a temporary `tsx` script (removed) on the 2025 package: 60,000 salary, 2025, Class 2, with and without
`spouseUserId` / `class2WithoutSpouse`.

**Not covered.** No API e2e and no browser rendering (Nest/Prisma/fastify not installed; `tsconfig.api.json` cannot
type-check here), so the controller, service and TSX card have transpile + inspection evidence only. No service-level
test of `persist: false` and no DB concurrency test. I did not re-run the full repository suite or a web build. I did
not verify the original brief's DTO-comment wording (the implementation note says it contradicted the executable
rule); the review uses the rule and the UI contract.
