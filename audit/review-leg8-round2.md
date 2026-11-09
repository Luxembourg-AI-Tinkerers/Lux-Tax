# LEG-8 — comparability + persist guard (round 2)

Reviewer: independent re-check of `audit/review-leg8.md` §3 M1 and §4 W1, and of
`audit/impl-leg8.md` §6, against the current source. Read-only on the source; this report is the only file written.

**allPass: true** — must-fix 0, worth considering 2, record 5.

## 1. Conclusion

Both blockers are cleared. Comparability is now decided where the marital status, the resolved class and the
assessed spouse already exist (`calculations.service.ts:176-180`), the predicate is the narrow one
(`class-resolution.ts:243-249`: `MARRIED` + `CLASS_2` + `hasAssessedSpouse`), and `comparable` reads that flag
(`calculations.service.ts:384`). A widow(er), a divorced filer in the Art. 119 n° 3 window, a PACS couple and a
married filer without a joined CO_FILER therefore get `comparable: false` and the UI renders the guard sentence,
not the table (`TaxCalculatorView.tsx:557,620-623`). The persist guard is a single `if (shouldPersist(options))`
around both the workspace update (`:317`) and the `TAX_CALCULATED` audit event (`:332`); `compareScenarios` passes
`persist: false` to all three runs (`:368-382`) and the normal controller call passes no options (`calculations.controller.ts:28`).
Regression is green: 140/140 tests, `tsc` 0, syntax 31/31.

## 1a. Items (VERIFY 1–4)

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | `isScenarioComparisonEligible` true only for MARRIED + CLASS_2 + assessed spouse; WIDOWED / DIVORCED / PACS / SINGLE / CLASS_1 / married-without-spouse false | **pass** | `class-resolution.ts:243-249`; probe matrix below; `class-resolution.spec.ts:254-282` (4 tests) |
| 2 | `comparisonEligible` in both persist and non-persist returns; `compareScenarios` uses `=== true`; widow / PACS / married-without-spouse get `comparable: false` and the UI hides the table | **pass** | `calculations.service.ts:176-180,311,354,384`; probe; `TaxCalculatorView.tsx:556-557,620-623` |
| 3 | `shouldPersist` wraps the workspace update and the audit write; `{persist:false}` skips both; normal path persists; pure helper tested | **pass** | `calculations.service.ts:316-352`; `calculations.controller.ts:28`; `class-resolution.ts:257-259`; `class-resolution.spec.ts:284-296` |
| 4 | Regression 140/140, `tsc` 0, syntax 31/31, LEG-2…LEG-6 and P0 unchanged | **pass** | run output below; no round-2 change in `engine.ts` / `tax-engine.spec.ts` |

### Probe — service derivation order, real helpers (2025, no Prisma)

```
married PRIMARY+CO_FILER              class=CLASS_2  spouse=b  former=false  eligible=true
married, second member VIEWER         class=CLASS_2  spouse=-  former=false  eligible=false
married, single member                class=CLASS_2  spouse=-  former=false  eligible=false
widow in 3-yr window + stale CO_FILER class=CLASS_2  spouse=b  former=true   eligible=false
widow outside window                  class=CLASS_1A spouse=b  former=true   eligible=false
widow, no death year                  class=CLASS_1A spouse=b  former=true   eligible=false
divorced class2BeforeEvent in window  class=CLASS_2  spouse=b  former=true   eligible=false
PACS collective + co-filer            class=CLASS_2  spouse=b  former=false  eligible=false
single                                class=CLASS_1  spouse=-  former=false  eligible=false
married, actor is the CO_FILER        class=CLASS_2  spouse=a  former=false  eligible=true
shouldPersist: default=true  {}: true  {persist:true}=true  {persist:false}=false
```

The matrix runs `deriveTaxClass` → `selectFilerMembers` → `spouseEndsAtEvent` → `isScenarioComparisonEligible`
in the same order as `calculateTax`, so it exercises the composition the service relies on, not only the helper.

### Probe — engine, CLASS_2, one 60,000 employment fact, 2025 package

```
spouse present (PACS / married): COLLECTIVE 3678.56 | INDIVIDUAL_PURE 11111.85 | INDIVIDUAL_REALLOCATION 3667.86
no spouse (widow, class2WithoutSpouse): 3678.56 | 3678.56 | 3678.56
no spouse (no flag): 11111.85 | 11111.85 | 11111.85
```

This confirms the round-1 premise for widows/married-without-spouse (three identical runs) and is the evidence for
W2 below.

## 2. Must fix (0)

None. The two failure modes the brief calls blockers do not reproduce:

- **Non-couple shown as comparable.** `comparable` is `collective.comparisonEligible === true` (`:384`), and the flag
  is `maritalStatus === 'MARRIED' && taxClass === CLASS_2 && Boolean(spouseMember)` (`class-resolution.ts:248`,
  `calculations.service.ts:176-180`). `spouseMember` is the *assessed* spouse — null after `spouseEndsAtEvent` for
  WIDOWED/DIVORCED and null when no CO_FILER exists — so the widow, PACS, CLASS_1 and married-without-spouse states
  all return false, as the probe shows.
- **A comparison run persisted.** Both writes sit inside one `if (shouldPersist(options))` block
  (`calculations.service.ts:316-352`); `compareScenarios` is the only caller that passes `persist: false`
  (`:368-382`); the service's only other Prisma calls are reads (`findUnique` at `:48` and `:420`). The route is GET
  only (`calculations.controller.ts:41-48`), so a comparison cannot overwrite `calculationResult`,
  `estimatedTaxBalance`, `status`, or emit `TAX_CALCULATED`.

## 3. Worth considering (2)

### W1 — `ScenarioComparisonDto.comparable` still documents the class-only rule

- **Position.** `packages/contracts/src/tax.ts:364-369`.
- **Problem.** The comment still says "True when the household is a Class 2 couple … a non-Class-2 household gets
  three identical collective results". After the fix the flag also requires a married status and an assessed
  spouse, and two *Class 2* states now return `comparable: false` — a PACS couple assessed collectively, and a
  widow(er) in the Art. 119 n° 3 window. The sibling field comment (`tax.ts:276-282`) states the correct rule, so
  the two contract comments now disagree.
- **Impact.** A consumer or maintainer reading only `comparable` can re-derive `taxClass === CLASS_2`, i.e. the
  exact predicate that produced the round-1 blocker, and expect a table for a PACS couple.
- **Evidence.** `calculations.service.ts:384`; probe: PACS collective → `class=CLASS_2`, `eligible=false`; the
  engine probe shows that PACS case does *not* produce identical runs.
- **Fix direction.** Restate the `comparable` comment as "married Class 2 couple with an assessed spouse", and drop
  the "non-Class-2" framing.

### W2 — PACS rationale is factually wrong in the code comment and in the returned warning

- **Position.** `apps/api/src/modules/calculations/calculations.service.ts:379-383` (comment) and `:398` (string
  pushed into `warnings`).
- **Problem.** Both claim a PACS couple "resolve[s] all three runs to collective" / "the three runs apply the same
  collective rules". A PACS couple that elected collective resolves to `CLASS_2` with a CO_FILER, and the engine
  computes three *distinct* results (probe: 3,678.56 / 11,111.85 / 3,667.86). The message also tells that couple it
  is "not assessed as a Class 2 couple" when it is.
- **Impact.** `warnings` is part of the API response; a client that renders it is told the three figures are identical
  when they differ by thousands. The current UI does not render `warnings` in the non-comparable branch
  (`TaxCalculatorView.tsx:620-623`), which is why this is not a blocker — but the contract text is wrong.
- **Evidence.** Probe values above; `engine.ts:120` (`isCollective` is false for `INDIVIDUAL_PURE`, and the pure /
  reallocation branches require `spouseIncome`, `engine.ts:933,965`).
- **Fix direction.** Say "not a married Class 2 couple with an assessed spouse" and drop the identical-runs claim
  (or derive the reason from the three `assessmentMode` values actually returned). `comparable: false` for PACS is
  what the brief requires; only the wording is at issue.

## 4. Record only (5)

- `comparable` is read from the first (collective) run only, and the three runs are three separate workspace reads
  (`:348-382`): a concurrent membership/fact edit between them can label comparable a set that later collapsed.
  Same permitted trade-off as round 1 (`impl-leg8.md` §5), one more consequence.
- No test executes `calculateTax` or `compareScenarios`; reverting `:384` to the old class-only predicate would keep
  140/140 green. The wiring is inspection + probe evidence only.
- The compare button renders for every household (`TaxCalculatorView.tsx:547-553`), so a single filer spends three
  full server calculations to be told the table does not apply.
- The card is still offered when the questionnaire already stores an `INDIVIDUAL_PURE` / `INDIVIDUAL_REALLOCATION`
  election, which is irrevocable for the year; the DTO carries no "already elected" state. Outside this brief.
- PACS now loses the Art. 3ter reallocation comparison it may legally elect
  (`luxembourg-tax-resident-gap-analysis.md:802`); hiding all three is the brief's choice, not a regression against it.

## 5. Scope and not covered

**Standard.** The brief's VERIFY 1–4, round-1 M1 and W1, `impl-leg8.md` §6, and the LEG-8 requirement
(`audit/audit-legal.md:232-242`, `luxembourg-tax-resident-gap-analysis.md:695`), with a legal cross-check at
`gap-analysis:802-803` (PACS: no individual pure, reallocation only; widow/divorce in the window: no Art. 3ter).

**Verified.** Read `class-resolution.ts`, `calculateTax`/`compareScenarios` in full, the controller, the contract
fields, the UI card and the six new tests. Ran from `B:\B\tax-app`:

```
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test
  packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts
  apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts
  apps/api/test/class-resolution.spec.ts
→ tests 140 / suites 24 / pass 140 / fail 0

node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json   → exit 0
node .tools/syntax_check.cjs                                        → exit 0, 31 files ok
```

Two `tsx` probes (no files written): the 10-case eligibility composition above, and the engine mode comparison
above. Also ran `tsc -p tsconfig.api.json`: 107 errors, all pre-existing (`@nestjs/*`, `@prisma/client`, `fastify`
absent → 38 × TS2307, 46 × TS2339 on the Prisma stub, 23 × TS7006 implicit any); none on the new helper, the flag
or the guard lines, so it adds no signal beyond transpile.

**Not covered.** No Nest/Prisma runtime (dependencies absent), so no API e2e: the controller route, the
`Boolean(spouseMember)` wiring, the `if (shouldPersist(options))` branch and the React branch are transpile +
inspection + helper-probe evidence, not execution. No browser render, no DB concurrency test, no full repository
suite or web build. File mtimes place `engine.ts` / `tax-engine.spec.ts` earlier than the four round-2 files, and
neither mentions the new flag, so I treat the engine as unchanged this round; I did not diff against a commit
because the whole tree is uncommitted.