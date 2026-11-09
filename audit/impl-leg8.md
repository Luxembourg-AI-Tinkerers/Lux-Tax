# LEG-8 — Class 2 vs 2× Class 1 (Art. 3ter) scenario comparison

**Item:** LEG-8 (P2, `audit/audit-legal.md:232`), requirement `luxembourg-tax-resident-gap-analysis.md:695`.
**Scope executed:** contracts DTO, pure engine helper + tests, non-persisting API comparison, controller route,
api-client method, calculator UI card. No engine tariff, filing, docs or other LEG item touched.

## 1. Files changed

| File | Change |
|---|---|
| `packages/contracts/src/tax.ts` | `ScenarioComparisonDto`: `taxYear`, `rulePackageVersion`, the three `TaxCalculationResultDto` runs, `deltaCollectiveVsIndividual`, `deltaCollectiveVsReallocation`, `comparable`, `warnings`. |
| `packages/tax-engine/src/engine.ts` | `static compareAssessmentModes(params)` — three `calculate` calls with `assessmentMode` overridden (`COLLECTIVE`, `INDIVIDUAL_PURE`, `INDIVIDUAL_REALLOCATION`), each on a shallow copy. No mutation of the caller's params. |
| `apps/api/src/modules/calculations/calculations.service.ts` | Extracted `loadWorkspace` (same findUnique include + NotFound + `isSupportedTaxYear` checks); `calculateTax(..., options?: { assessmentMode?; persist? })`; the workspace update and `TAX_CALCULATED` audit write are inside `if (options?.persist !== false)`; `compareScenarios(workspaceId, actorId)` runs the three modes non-persisting and builds the DTO with rounded deltas. |
| `apps/api/src/modules/calculations/calculations.controller.ts` | `@Get('scenario-comparison')` under `api/workspaces/:workspaceId`, same `JwtAuthGuard` + `HouseholdGuard` as the calculate routes. |
| `packages/api-client/src/client.ts` | `compareScenarios(workspaceId)` → `GET /api/workspaces/:id/scenario-comparison`, typed `ScenarioComparisonDto`. |
| `apps/web/src/components/TaxCalculatorView.tsx` | "Scenario comparison" card with button "Compare Class 2 vs 2× Class 1"; table of the three final liabilities, both deltas, rule-package/year, warnings, the estimate/Art. 3ter-deadline note; `comparable === false` shows only "Only a Class 2 couple can compare these scenarios." |
| `packages/tax-engine/test/tax-engine.spec.ts` | 3 tests (see §4). |
| `.tools/syntax_check.cjs` | Added `calculations.controller.ts` and `packages/api-client/src/client.ts`. |

## 2. Endpoint and DTO

```
GET /api/workspaces/:workspaceId/scenario-comparison   (JWT + household membership)
→ ScenarioComparisonDto
```

- One workspace read per run through `loadWorkspace` (three reads, not three mappings): the facts filter
  (`isIncludedInReturn` + document visibility), the spouse/class resolution and the questionnaire mapping are the
  existing `calculateTax` code, not a copy.
- `assessmentMode` override: `options?.assessmentMode ?? answers.assessmentMode`; the stored election is never edited.
- `persist: false` skips the `taxYearWorkspace.update` and the `TaxCalculationEvent`; the result is still returned.
- `comparable = collective.taxClass === TaxClass.CLASS_2` (the executable rule in the brief and the UI contract).
- Deltas are `collective.finalTaxLiability - individual*.finalTaxLiability`, rounded to cents to avoid float noise.
- `warnings` is the deduplicated union of the three runs' `warnings` + `unsupported`; a non-comparable household
  also gets an explicit "Only a Class 2 couple can compare these scenarios…" entry.
- `rulePackageVersion` is taken from the collective run; all three runs use the same `taxYear`, so they share it.

## 3. Engine helper

```ts
LuxembourgTaxEngine.compareAssessmentModes(params) // → { collective, individualPure, individualReallocation }
```

- Pure: each run is `calculate({ ...params, assessmentMode: X })`; the facts array and the input object are not mutated
  (asserted by test).
- The engine already forces `COLLECTIVE` when `taxClass !== CLASS_2`; a non-Class-2 household therefore gets three
  identical collective results and `comparable: false` at the API/UI layer. No separate legal logic was added.
- `INDIVIDUAL_PURE` computes two Class 1 tariffs; `INDIVIDUAL_REALLOCATION` splits the joint base using the existing
  `reallocationPercentPrimary` (default 50). Foreign income under either individual mode keeps the existing LEG-5
  `unsupported`/`warnings` message, which the DTO surfaces.

## 4. Tests run (from `B:\B\tax-app`)

```
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test ^
  packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts ^
  apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts ^
  apps/api/test/class-resolution.spec.ts
→ tests 134 / suites 22 / pass 134 / fail 0 (baseline 131; +3 new)
```

New tests in `Scenario comparison — Class 2 vs 2 × Class 1 vs Art. 3ter reallocation (LEG-8)`:

| Test | Assertion |
|---|---|
| Class 2 couple gets three modes and one rule package | 60,000 + 40,000 → `COLLECTIVE` / `INDIVIDUAL_PURE` / `INDIVIDUAL_REALLOCATION`; one distinct `rulePackageVersion` = `2025.1.0`; both totals > 0 and collective ≠ pure. |
| comparison does not mutate the caller's params | deep-equal against a JSON snapshot after the call. |
| non-Class-2 household still gets three results | Class 1 → all three `assessmentMode === 'COLLECTIVE'`, pure total equals collective. |

Probe values (2025 package, default forfaits, same facts): collective 13,381.21; pure 14,335.65; reallocation 13,363.02;
deltas −954.44 and +18.19. These are observation, not golden assertions.

```
node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json   → exit 0
node .tools/syntax_check.cjs                                        → exit 0 (31 files "ok")
```

## 5. Limits / not verified

- **API e2e and browser rendering not run** (no runnable API stack in this environment). The controller route, the
  Prisma calls and the React card are verified by transpile + inspection only.
- `tsconfig.api.json` cannot type-check here: `@nestjs/*`, `@prisma/client` and `fastify` are not installed
  (`TS2307` on every API file, pre-existing). The API service/controller therefore have no type-check evidence
  beyond `syntax_check` (transpile-level).
- `compareScenarios` re-reads the workspace three times (explicitly allowed by the brief). A concurrent fact edit
  between reads could give mixed snapshots; the comparison is still never persisted.
- `comparable` is `taxClass === CLASS_2`. A widowed/divorced filer keeping Class 2 without a spouse is therefore
  reported as comparable even though the three runs are identical; fixing that needs `class2WithoutSpouse`/spouse
  presence in the comparison result.
- The DTO comment in the brief said "true when the household is **not** a Class 2 couple", which contradicts the
  executable rule (`=== CLASS_2`) and the UI copy. Implemented as true **for** a Class 2 couple, per the rule and §6.
- Comparison runs are not audited by design; if the product needs an audit trail of "comparison viewed", that is a
  separate decision (would require a new event type).
- Reallocation uses the questionnaire's `reallocationPercentPrimary`; the UI does not let the user vary the share
  inside the comparison card.

## 6. Comparability + persist guard

`comparable` was `collective.taxClass === CLASS_2`, so every Class 2 household — a widow(er) or divorced filer in
the Art. 119 n° 3 window, a married filer without a joined CO_FILER, a PACS couple — was reported comparable even
though the three runs are identical. Fixed at the source of the fact. This supersedes the §5 bullet that recorded
`comparable` as `taxClass === CLASS_2`.

| File | Change |
|---|---|
| `apps/api/src/modules/calculations/class-resolution.ts` | `isScenarioComparisonEligible(maritalStatus, taxClass, hasAssessedSpouse)` — true only for `MARRIED` + `CLASS_2` + a spouse; `shouldPersist(options?)` — `options?.persist !== false`. Both pure, dependency-free. |
| `packages/contracts/src/tax.ts` | `TaxCalculationResultDto.comparisonEligible?: boolean` — computed by the API, not the pure engine; absent on results stored before LEG-8. |
| `apps/api/src/modules/calculations/calculations.service.ts` | `comparisonEligible` from `maritalStatus`, the resolved `taxClass` and `Boolean(spouseMember)` — the *assessed* spouse, null for WIDOWED/DIVORCED; the DTO is `{ ...result, comparisonEligible }` (spread, never an in-place mutation) and the persisted `calculationResult` is that same object; `compareScenarios` uses `collective.comparisonEligible === true`; the write/audit block is `if (shouldPersist(options))`. |
| `apps/api/test/class-resolution.spec.ts` | 6 new tests: the eligibility matrix and the persist guard. |

New tests:

| Test | Assertion |
|---|---|
| married Class 2 couple with an assessed spouse | `true` |
| married Class 2 without an assessed spouse | `false` |
| WIDOWED / DIVORCED / PACS / SINGLE / undefined, Class 2, spouse `true` | `false` for each |
| married outside Class 2 (`CLASS_1`, `CLASS_1A`) | `false` |
| `shouldPersist()` / `{}` / `{persist:true}` | `true` |
| `shouldPersist({persist:false})` | `false` |

Web: no change. `TaxCalculatorView` reads `comparison.comparable` (field name unchanged); its non-comparable branch
already renders "Only a Class 2 couple can compare these scenarios." instead of the table, so widows, PACS couples
and married filers without a joined spouse now get exactly that.

```
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test ^
  packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts ^
  apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts ^
  apps/api/test/class-resolution.spec.ts
→ tests 140 / suites 24 / pass 140 / fail 0 (baseline 134; +6 new)

node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json   → exit 0
node .tools/syntax_check.cjs                                        → exit 0 (incl. calculations.service.ts)
```

Not verified: the service wiring (`Boolean(spouseMember)` → `comparisonEligible` → `comparable`, and the
`shouldPersist` branch) is transpiled and inspected only — `tsconfig.test.json` does not include
`calculations.service.ts`, and `@nestjs/*` / `@prisma/client` are not installed for a real type check. An API e2e
(widow workspace → `comparable: false`, `persist:false` leaving `calculationResult` untouched) remains the
regression test to add when a runnable stack exists.
