# Independent review — LEG-2 (Art. 122 dégrèvement, Art. 123bis bonification)

Date: 2026-11-08. Reviewer: independent, read-only. No source file was edited; only this report and two throw-away probes under `tmp/` (deleted) were written.

**Verdict: allPass = false.** One must-fix: the six-child cap-lift count at `packages/tax-engine/src/engine.ts:1130` uses `max(dependantsCount, moderationCount + bonificationCount)`, which over-relieves when the household has more dependants than children generating a moderation/bonification. The core formulas are correct: 922.50 per child, 560 at RIA 71,000, 0 at 76,600, full 922.50 at six or more children, non-refundable and capped at the tax still due, `totalTaxCredits` unchanged, no double count with CIM or the deduction-cap multiplier. Regression is green: 77/77 tests, `tsc` exit 0, syntax 27/27 exit 0.

**Standard used.** `audit/audit-legal.md` §LEG-2 (lines 79–116); `research/2025-2026-lu-tax-credits-and-classes.md` §2.3 A/B (lines 123–158); the ACD page <https://impotsdirects.public.lu/fr/az/b/bonif_enfant.html> (fetched 2026-11-08); the three commands in the brief; and the regression constraint “no change to CIM or the `childrenWithModeration` cap multiplier”.

## 1. Per-item verdicts

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | Legal formulas and the six-child-vs-RIA order | **PASS** | Dégrèvement: `min(count × 922.50, taxDue)` (`credits.ts:183-198`). Bonification: `count × min(922.50, (76,600 − RIA)/10)` for 67,400–76,600, 0 above, full 922.50 at 6+ (`credits.ts:208-231`). Engine applies them on `taxAfterCredits` and caps the bonification at the remaining tax (`engine.ts:1117-1138`). The ACD text makes the ≤5 phase-out and the ≥6 “sans limitation du revenu imposable ajusté” alternative branches, so testing the cap lift first is the legally correct reading; the brief’s literal order would return 0 at RIA 80,000 with 6 children and contradict its own required test. The deviation is documented at `credits.ts:213-216`. |
| 2 | `bonificationPhaseOut` semantics | **PASS** (one minor) | DTO JSDoc `tax.ts:243-247`; engine `engine.ts:1204-1211`; UI note `TaxCalculatorView.tsx:429-431`. All three mean “the 67,400–76,600 RIA band reduced the per-child bonification”; true at RIA 71,000 (560), false below the band and at the six-child lift. Minor: the engine hardcodes `< 6` instead of `pkg.childRelief.capLiftedFromChildren` (all current packages are 6, so no current amount error). The UI report §4.6 still describes the old `bonificationComputed > bonification` semantics; that section is stale (see C7). |
| 3 | Engine integration | **PASS except M1** | `taxAfterCredits` 1117; dégrèvement 1122–1124; bonification 1130–1138; `finalTaxLiability` 1181; balance 1182; `totalTaxCredits` 1233 equals `credits.total`; provenance only when amount > 0 (1140, 1156); warning 1174–1178. CIM gate 993–1000 and deductions multiplier `deductions.ts:160` still use raw `childrenWithModeration`; the new relief does not enter `credits` and does not feed the multiplier, so there is no CIM or multiplier double count. The cap-lift input at 1130 is M1. |
| 4 | Contracts / API / validation | **PASS** | `TaxCalculationParams.childBenefitReceived?` and `childrenWithBonification?` (`tax.ts:39-52`); `ChildReliefBreakdownDto` (`tax.ts:232-247`); result `childRelief` (`tax.ts:271`); questionnaire fields (`questionnaire.ts:39-51`); Zod (`questionnaire.schema.ts:42-45`); `CalculationsService` maps both (`calculations.service.ts:155-156`). No field-name or shape mismatch found. Minor doc issue: `bonificationChildren` is documented as “children that generated a bonification” but is the input count even when the phase-out zeroes the amount (RIA 76,600, or 80,000 with five children). |
| 5 | UI | **PASS** (two minor) | Initial state `childBenefitReceived: true` (`QuestionnaireView.tsx:29`); checkbox `?? true` (`:574`); whole-object submit (`:66`) carries both new fields; `childrenWithBonification` input `:591-604`. Calculator group `TaxCalculatorView.tsx:410-433` is display-only: it renders `childRelief.degrevement/bonification/total` and the note, and performs no arithmetic; the hero uses `balancePayableOrRefund`, which already contains the relief. `calc.childRelief && …` guards old snapshots. Minor: the group is hidden when `total === 0`, so a phased-out bonification at RIA ≥ 76,600 shows nothing (C8); the label “Child left the household / studies finished” invites a bonification child who is not a current dependant, which can trigger the misleading warning in C3. |
| 6 | Tests | **PARTIAL** | Covered: 1 child/5,000 → 922.50; 2 children/1,000 → 1,000; 71,000 → 560; 76,600 → 0; 6/80,000 → 922.50; 5/80,000 → 0; non-refundable at tax 0; 2026 inheritance; provenance gate. Gaps: the exact acceptance case 1 child/RIA 40,000 is not engine-asserted (the pure test uses 5,000 tax due; the engine test uses 60,000/2 children); “the same child cannot generate both” (`:879-901`) asserts only the warning, not the amount; the 80,000/6 engine test (`:867-876`) passes `dependantsCount: 6` with no moderation count, so it validates the M1 shortcut, not a legal 6-child household; `close(final, totalTaxBeforeCredits − credits.total − 1,845)` (`:824-826`) is an identity after the engine definition (the delta assertion immediately above it is the meaningful one). No wrong numerical assertion was found. |
| 7 | Regression | **PASS** | 77 tests / 11 suites / 77 pass / 0 fail; `tsc -p tsconfig.test.json` exit 0; `syntax_check.cjs` 27/27 ok exit 0. CIM gate and multiplier unchanged: `engine.ts:634` still passes raw `childrenWithModeration` to deductions, `deductions.ts:160` still uses `1 + collective + Math.max(0, childrenWithModeration)`, and `engine.ts:993-1000` still gates CIM on `childrenWithModeration > 0`. |

## 2. Must fix

### M1 — The six-child cap lift counts all dependants, not the children generating a moderation/bonification

- **Location:** `packages/tax-engine/src/engine.ts:1130`; `packages/tax-engine/test/tax-engine.spec.ts:867-876`.
- **Problem:** `const householdChildren = Math.max(countOf(dependantsCount), moderationCount + bonificationCount);` feeds `bonificationForChildren`. The ACD text says the six-child branch applies to “au moins six enfants **pour lesquels il obtient une modération d’impôt pour enfant ou une bonification d’impôt pour enfant**” — the count is the sum of children generating either relief, not every household dependant. With `childrenWithModeration: 1`, `childrenWithBonification: 1`, `dependantsCount: 6`, RIA 80,000, the engine returns 922.50; the law applies the ≤5 phase-out and returns 0 because only two children generate a moderation/bonification. Probe output: `taxableIncome 80,000`, `childRelief { bonification: 922.5, total: 922.5 }`, no warning. The test at `:867-876` uses `dependantsCount: 6` with no `childrenWithModeration`, so it expects 922.50 for a case that is not a six-child relief household; a legal six-child case would be 5 moderated + 1 bonification.
- **Impact:** silent over-relief of up to 922.50 per bonification child (capped at the tax still due) for a supported questionnaire state (`childrenCount=6`, `childrenWithModeration=1`, `childrenWithBonification=1`). The warning does not fire because `2 > max(6,1,1)` is false. A household with a child whose moderation is claimed by the other parent (résidence alternée) or an adult dependant is the realistic trigger.
- **Evidence:** ACD page, §4 “Détermination du montant”: “Si le contribuable a au moins six enfants pour lesquels il obtient une modération d’impôt pour enfant ou une bonification d’impôt pour enfant, la bonification d’impôt est accordée sans limitation du revenu imposable ajusté.” Code `engine.ts:1130`; test `tax-engine.spec.ts:867-876`; probe run in §5.
- **Fix direction:** use `moderationCount + bonificationCount` for the cap-lift test. If a fallback is needed for callers that omit `childrenWithModeration`, use `dependantsCount` only when both counts are zero. Update the 80,000/6 test to `childrenWithModeration: 5, childrenWithBonification: 1` and add a `dependantsCount: 6, childrenWithModeration: 1, childrenWithBonification: 1` case expecting 0 at RIA 80,000.

## 3. Worth considering

### C1 — Major: per-child history is still not modelled (same child can get both; third-year bonification)

- **Location:** `packages/tax-engine/src/engine.ts:1122-1138`, `:1174-1178`; `packages/tax-engine/src/credits.ts:208-231`; `packages/tax-engine/test/tax-engine.spec.ts:879-901`; `audit/impl-leg2.md` §4.6.
- **Problem:** with `childrenWithModeration: 1`, `childrenWithBonification: 1`, `dependantsCount: 1`, `childBenefitReceived: false`, the engine returns `degrevement 922.50 + bonification 922.50 = 1,845` for one child. The only mitigation is the warning at `:1174-1178`; the test named “the same child cannot generate both reliefs” asserts only that the warning is present, not that the amount is capped. The ACD says “Au titre d’une même année, le contribuable ne peut pas, du chef d’un même enfant, cumuler l’avantage de la bonification … avec celui de la modération”. The same bare-count model also pays a third-year bonification (the UI helper says “at most two bonifications per child” but the engine cannot know), and cannot enforce the résidence-alternée single-household rule. This is the documented per-child-history limitation; per the brief it is **major**, not a blocker.
- **Impact:** over-relief of 922.50 in the same-child case, or 922.50/year for a child that already received two bonifications; the user sees a warning, but `finalTaxLiability` is already reduced and persisted. The test name overstates what is asserted.
- **Fix direction:** either add per-child history (year the moderation expired, left-household/alternate-residence flag) or, for the count model, cap the relief-generating children at the declared children and document that a third-year bonification is the user’s responsibility. At minimum rename the test to “warns when …” and add an assertion on `childRelief.total`.

### C2 — Major: the Art. 122 gate is household-level, not per child

- **Location:** `packages/contracts/src/tax.ts:39-45`; `packages/contracts/src/questionnaire.ts:39-51`; `packages/tax-engine/src/engine.ts:1122`; `apps/web/src/components/QuestionnaireView.tsx:574-583`.
- **Problem:** `childBenefitReceived` is one boolean for all moderated children. A household with two moderated children where one received CAE/CEDIES/SNJ and the other did not must answer `true` (some received), so the child without a benefit gets no 922.50 dégrèvement; answering `false` over-relieves the child with. The law’s condition is per child (the audit proposal asked “was a payment received **for this child**?”). Impact: under- or over-relief of 922.50 for a mixed household.
- **Fix direction:** add a per-child flag, or a second count (“moderated children with no CAE/CEDIES/SNJ”) and compute the dégrèvement on that count; otherwise document the household-level simplification explicitly.

### C3 — Minor: warning false positive for a legitimate bonification child who left

- **Location:** `packages/tax-engine/src/engine.ts:1174-1178`; `apps/web/src/components/QuestionnaireView.tsx:589-606`; `apps/web/src/components/TaxCalculatorView.tsx:417-431`.
- **Problem:** `dependantsCount` is `workspace.household.dependants.length` (current dependants, `calculations.service.ts:145`). A bonification child who left the household is no longer a dependant; `1 moderated + 1 bonification + 1 current dependant` gives `2 > max(1,1,1) = 1`, so the engine warns “the same child cannot generate both” although the two children are distinct. The UI tells the user to enter exactly such a child (“Child left the household / studies finished”). Impact: misleading warning; no amount effect.
- **Fix direction:** separate “counts exceed current dependants” from “same child counted twice”, or use the questionnaire’s declared `childrenCount` for the warning rather than only the DB dependants list. A message such as “the bonification count includes a child who is no longer a dependant; verify” would be accurate.

### C4 — Minor: hardcoded six-child threshold in the phase-out flag

- **Location:** `packages/tax-engine/src/engine.ts:1209` (`householdChildren < 6`) vs `packages/tax-engine/src/credits.ts:217` (`rules.capLiftedFromChildren`).
- **Problem:** the amount uses the rule package; the flag uses a literal 6. All current packages (2025, 2026, 2028) inherit 6, so no current amount error, but a future package with a different threshold would make the flag disagree with the amount.
- **Fix direction:** `householdChildren < pkg.childRelief.capLiftedFromChildren`.

### C5 — Minor: the exact acceptance case 1 child / RIA 40,000 is not engine-asserted

- **Location:** `packages/tax-engine/test/tax-engine.spec.ts:782-789`, `:808-831`.
- **Problem:** the pure test uses `degrevementForChildren(1, 5_000)`; the engine test uses 60,000/2 children. My probe confirms 1 child at 40,000 → 922.50 and final reduced by 922.50, but the suite would not catch a regression in that path. Add an engine assertion at 40,000/1 child.

### C6 — Minor: the “same child” test name overstates the assertion

- **Location:** `packages/tax-engine/test/tax-engine.spec.ts:879-901`.
- **Problem:** the test asserts only that the warning is present; the engine pays both (C1). Rename it to “warns when the moderation and bonification counts exceed the declared children” or assert the amount after the C1 fix.

### C7 — Documentation: the implementation reports are stale on the final tree

- **Location:** `audit/impl-leg2-ui.md` §4.6; `audit/impl-leg2.md` §5 and §6.
- **Problem:** the UI report still says `bonificationPhaseOut` is `bonificationComputed > bonification` and that the note does not appear in the 67,400–76,600 band; the final engine returns true in the band (`engine.ts:1207-1211`, test `:856-876`). The engine report §6 says “no component reads `childRelief`”; the UI report adds the component. §5 says 76 tests; the final suite is 77. The code is correct; a reader of the reports would misjudge the flag and the UI coverage. Update the report text.

### C8 — Minor UX: zero child relief is hidden

- **Location:** `apps/web/src/components/TaxCalculatorView.tsx:410`.
- **Problem:** the group renders only when `total > 0`. A bonification child at RIA 76,600 (or 80,000 with five children) produces 0; the user sees no child-relief row and no note explaining the phase-out. Impact: the user cannot tell why the relief is zero. Consider a zero row/note when `bonificationChildren > 0` or `eligibleChildren > 0` and `total === 0`.

## 4. Record only

- **API e2e not run** (no `@nestjs/*`, generated Prisma client, Postgres here). `calculations.service.ts` is outside `tsconfig.test.json`, so the two-line mapping at `:155-156` is transpile + review only; the questionnaire-PUT → calculation persistence path is not exercised.
- **UI not mounted** (no React/Next dependencies); the `childRelief` guard and layout are transpile + review only.
- **Old snapshots** without `childRelief` are guarded in `TaxCalculatorView` (`calc.childRelief && …`); no backfill was added (out of scope).
- **Contract doc precision:** `bonificationChildren` (`tax.ts:241-242`) says “children that generated a bonification” but returns `bonificationCount` even when the phase-out zeroes the amount; `eligibleChildren` is the gate count even when the tax cap reduces the amount.
- **Provenance formula:** the bonification formula string (`engine.ts:1162`) omits the 6+ cap-lift branch; the description at `:1160` mentions it. Cosmetic.
- **Surcharge convention:** the 7% contribution is computed on the pre-relief cote and the relief is subtracted from `cote + surcharge`, consistent with the existing credits convention; the net effect is exactly the relief amount. Not a LEG-2 change.
- **Duplication:** `normaliseCount` (`credits.ts:174-177`) duplicates `countOf` (`engine.ts:55-57`); same floor logic. Minor.
- **Input cap mismatch:** `childrenWithBonification` UI max 20 vs `childrenCount` max 15; not a correctness bug.
- **`bonificationPhaseOut` at exactly RIA 76,600** is true with amount 0; the UI group is hidden when total is 0, so no visible false note unless a dégrèvement also applies.

## 5. Verification run and scope

| Check | Command | Result |
|---|---|---|
| Engine + API unit suites | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts` | 77 tests, 11 suites, 77 pass, 0 fail, exit 0 |
| Type check | `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` | exit 0, no output |
| Syntax / transpile | `node .tools/syntax_check.cjs` | 27 files `ok`, 0 `FAIL`, exit 0 |

**Independent probes** (2025 package, resident, default forfaits, run from `tmp/` and deleted):

| Input | Result |
|---|---|
| 1 moderated child, RIA 40,000, no benefit | `degrevement 922.50`, final −922.50 vs baseline |
| `childrenWithBonification: 1`, RIA 71,000 | `bonification 560`, `bonificationPhaseOut true` |
| `childrenWithBonification: 1`, RIA 76,600 | `bonification 0`, `bonificationPhaseOut true` |
| `childrenWithBonification: 1, dependantsCount: 5`, RIA 80,000 | `bonification 0` |
| `childrenWithBonification: 1, dependantsCount: 6`, RIA 80,000 | `bonification 922.50` |
| `childrenWithModeration: 1, childrenWithBonification: 1, dependantsCount: 6`, RIA 80,000 | `bonification 922.50`, no “cannot generate both” warning — M1 over-count |
| `childrenWithModeration: 1, childrenWithBonification: 1, dependantsCount: 1`, Class 1a 60,000, no benefit | `total 1,845`, warning present — C1 double relief |
| `childBenefitReceived: false`, 2 moderated children, Class 1a 60,000 | `degrevement 1,845`, final −1,845 vs default |
| RIA 26,460, 2 moderated children, no benefit | `childRelief.total 0`, `finalTaxLiability 0`, `balancePayableOrRefund 0` |

**Not covered:** API e2e execution (no Nest/Prisma/Postgres); `tsc -p tsconfig.api.json` (not in the brief; API deps absent); web `tsc`/browser rendering (no React deps); database persistence; the `syntax_check.cjs` is transpile-only, not a type check of the web/API files. The ACD page was read on 2026-11-08; the legal text and the research §2.3 agree on the 922.50, 67,400/76,600 band, 6+ cap lift, same-child prohibition and the two-bonification limit.
