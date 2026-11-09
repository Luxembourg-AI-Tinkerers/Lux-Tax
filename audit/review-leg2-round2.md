# Independent re-review — LEG-2 fixes (round 2): M1, C2, C4, C5, C6

Date: 2026-11-08. Reviewer: independent, read-only. No source file was edited. One throw-away probe (`tmp/probe-leg2-r2.ts`) was created, run and deleted; this report is the only file written.

**Verdict: allPass = true.** The five fixes are present and reproduce the required numbers. No remaining over-relief for a supported input was found outside the documented bare-count / per-child-history limitation. Regression is green: 79/79 tests, `tsc -p tsconfig.test.json` exit 0, `syntax_check.cjs` 27/27 ok.

**Standard used.** The six VERIFY items in the task brief; `audit/review-leg2.md` (findings M1, C2, C4–C6); `audit/impl-leg2.md` §8; the current source at the cited lines; and the legal baseline in `research/2025-2026-lu-tax-credits-and-classes.md` §2.3 A/B (lines 127–147). The two ACD pages were re-fetched this run: <https://impotsdirects.public.lu/fr/az/b/bonif_enfant.html> ("au moins six enfants **pour lesquels il obtient une modération d’impôt pour enfant ou une bonification**"; "922,50 euros par enfant et par année") and <https://impotsdirects.public.lu/fr/az/m/moder_enfant.html> ("Le montant de 922,5 € **par enfant** qui satisfait aux conditions, est imputé, mais uniquement dans la limite de l’impôt dû").

## 1. Item verdicts

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | M1 — six-child cap lift uses only relief children | **PASS** | `engine.ts:1141` `reliefChildren = moderationCount + bonificationCount`, passed at `:1145`; `dependantsCount` survives only at `:1190` for the plausibility warning. Test `tax-engine.spec.ts:894-933`: 5 moderated + 1 bonification, `dependantsCount: 6`, RIA 80,000 → `bonification 922.5` (`:916`); 1 + 1 with `dependantsCount: 6` at RIA 80,000 → `bonification 0`, `total 0` (`:930-931`). Independent probe reproduced both (rows A/B below). |
| 2 | C2 — per-child Art. 122 gate | **PASS** | Field exists in `TaxCalculationParams` (`tax.ts:48-51`), `QuestionnaireAnswersDto` (`questionnaire.ts:45-49`), Zod (`questionnaire.schema.ts:44-45`), mapping (`calculations.service.ts:156`). Engine: `degrevementChildren = min(moderationCount, countOf(moderatedChildrenWithoutBenefit ?? (childBenefitReceived === false ? moderationCount : 0)))` (`engine.ts:1126-1132`), drives the amount and `eligibleChildren` (`:1133`, `:1259`). Test `:833-855`: 2 moderated with count 1 → 922.50, `eligibleChildren 1` (not 1,845); count 3 with 1 moderated → clamped to 922.50. Fallback still tested at `:802-831` (`childBenefitReceived: false`, 2 moderated → 1,845). UI uses a number input bound to the count (`QuestionnaireView.tsx:569-589`), has no `childBenefitReceived` reference anywhere, and the whole `answers` object is submitted (`:65`); the PUT validates through `questionnaireSchema` (`questionnaire.controller.ts:37-42`). |
| 3 | C4 — phase-out flag reads the rule package | **PASS** | `engine.ts:1230` `reliefChildren < pkg.childRelief.capLiftedFromChildren`; amount path uses the same property (`credits.ts:217`). No literal `6` remains in the child-relief path (grep over `packages/tax-engine/src`); `capLiftedFromChildren: 6` exists only in `rules/2025.ts:176`, inherited by 2026 through the spread. |
| 4 | C5 — 1 moderated child at RIA 40,000 asserted through the engine | **PASS** | Test `:857-869`: salary 41,020 → `taxableIncome 40,000`, `degrevement 922.5`, `eligibleChildren 1`, `finalTaxLiability = baseline − 922.5`. Probe G reproduced 922.50. |
| 5 | C6 — warning test name accurate, amount still paid | **PASS** | Test renamed to `engine: warns when the moderation and bonification counts exceed the declared children` (`:935`); asserts the warning (`:942`), then `degrevement 922.5`, `bonification 922.5`, `total 1,845` (`:944-947`), i.e. the bare-count double count is paid, not silently capped. Second fixture with `dependantsCount: 2` asserts no warning (`:950-957`). Probe D reproduced 1,845 with the warning. |
| 6 | Regression | **PASS** | 79 tests / 11 suites / 79 pass / 0 fail / exit 0; `tsc -p tsconfig.test.json` exit 0 with no output; `syntax_check.cjs` 27 files ok, 0 FAIL, exit 0. CIM gate still raw `childrenWithModeration` (`engine.ts:993-1001`); deductions multiplier still `1 + collective + Math.max(0, ctx.childrenWithModeration)` (`deductions.ts:160`, fed at `engine.ts:647`); `totalTaxCredits` still `credits.total` (`:1254`); child relief is imputed after credits and never enters `credits`. |

## 2. Must fix

None. The M1 over-relief is gone; the C2 mixed household now pays one child, not two; the cap lift can no longer be triggered by household dependants who generate neither relief. No supported input was found that over-relieves outside the documented bare-count limitation (§4, first item).

## 3. Worth considering

### RC-1 — A legacy `childBenefitReceived: false` is now invisible in the questionnaire but still pays the dégrèvement

- **Location:** `apps/web/src/components/QuestionnaireView.tsx:569-589` (count input, `value … ?? ''`), `engine.ts:1126-1131`, `calculations.service.ts:155`.
- **Problem:** answers persisted by the previous UI may contain `childBenefitReceived: false` with no `moderatedChildrenWithoutBenefit`. The new form shows an empty count field (which reads as 0) and offers no control over the legacy flag, yet the engine falls back to `moderationCount` and pays 922.50 per moderated child. Clearing the count field (`undefined`) also re-enables that fallback, so "empty" does not mean "none".
- **Impact:** a returning user sees a blank questionnaire field but a child-relief line in the calculator; a user who clears the field to say "no child without benefit" gets the relief back. The amount follows the stored declaration, so this is a UI/engine transparency gap, not a wrong persisted answer — but it is reachable for any household that used the old checkbox.
- **Fix direction:** drop `childBenefitReceived` when the questionnaire is saved with the new model (or when the count is edited), or display the effective value (prefill the input with `moderationCount` when the flag is `false`) and a hint that the legacy flag is active.

### RC-2 — No cross-field validation `moderatedChildrenWithoutBenefit <= childrenWithModeration`

- **Location:** `packages/validation/src/questionnaire.schema.ts:44-45`; `engine.ts:1126-1132`.
- **Problem:** the schema bounds the new count to 0–20 but does not compare it with `childrenWithModeration`. The engine silently clamps, so a form state such as 1 moderated child and 3 "without benefit" children yields 922.50, not the 2,767.50 the entered count implies, and the user gets no feedback.
- **Impact:** silent under-relief for a contradictory but reachable form state (under-relief only; the clamp prevents over-relief).
- **Fix direction:** a Zod `superRefine` (or service check) rejecting `count > childrenWithModeration`, and/or a UI hint; keep the engine clamp as the last line of defence.

### RC-3 — `audit/impl-leg2.md` §4.2, §4.4 and §4.5 now contradict §8

- **Location:** `audit/impl-leg2.md:59` (§4.2 "`bonificationPhaseOut` is `bonificationComputed > bonification`"), `:63` (§4.4 "`totalChildren` … is `max(dependantsCount, …)`"), `:65` (§4.5 "No UI row and no questionnaire control") versus `:100-136` (§8).
- **Problem:** §7/§8 supersede all three statements, but §4 still presents them as current. A reader who stops before §7 takes the old flag semantics, the old cap-lift input and the absence of a UI control as the implemented behaviour.
- **Impact:** documentation only; no runtime effect. Cost is a wrong mental model for the next reviewer or maintainer.
- **Fix direction:** mark §4.2, §4.4 and §4.5 as superseded by §7/§8 (one line each) or rewrite them in place.

## 4. Record only

- **C1 limitation persists and now also feeds the cap-lift threshold.** With 3 moderated + 3 bonification and only 3 declared children, probe J returns `degrèvement 2,767.50 + bonification 2,767.50 = 5,535` and the "cannot generate both" warning fires. Bare counts cannot tell that a child is counted twice; the warning at `engine.ts:1190-1199` is the only guard and the limitation is documented in the engine comment and `impl-leg2.md` §4.6. Per the brief this is not a blocker; the cap-lift consequence could be added to that same sentence.
- **`bonificationChildren` DTO doc** (`tax.ts:247`) still says "Children that generated a bonification" but returns the input count when the phase-out zeroes the amount (RIA 76,600, or 80,000 with five children). Pre-existing, no amount effect.
- **Zero relief is still hidden** (`TaxCalculatorView.tsx:410` renders the group only when `total > 0`), so a phased-out bonification shows neither the row nor the note. Prior C8, unchanged and out of scope.
- **Warning false positive unchanged** (prior C3): `dependantsCount` is the current dependants list, so a bonification child who left the household can trigger "cannot generate both" even when the two children are distinct.
- **UI bounds mismatch:** the new input allows 0–20 while `childrenCount`/`childrenWithModeration` use their own bounds; the engine clamp makes it harmless.
- **`bonificationPhaseOut` at exactly RIA 76,600** is `true` with amount 0 (correct band semantics, but combined with the zero-row rendering above nothing is shown).
- **2026/2028 packages** inherit `capLiftedFromChildren` through the spread in `rules/2026.ts`; no separate literal to update.

## 5. Verification run and scope

| Check | Command | Result |
|---|---|---|
| Engine + API unit suites | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts` | 79 tests, 11 suites, 79 pass, 0 fail, 0 skipped, exit 0 |
| Type check | `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` | exit 0, no output |
| Syntax / transpile | `node .tools/syntax_check.cjs` | 27 `ok`, 0 `FAIL`, exit 0 (covers `calculations.service.ts`, `QuestionnaireView.tsx`, `questionnaire.schema.ts`; engine files are covered by `tsc`) |

**Independent probes** (2025 package, resident, default forfaits; run from `tmp/` and deleted):

| Row | Input | Result |
|---|---|---|
| A | 5 moderated + 1 bonification, dependants 6, RIA 80,000 | `bonification 922.50`, `degrevement 0`, `total 922.50`, `phaseOut false` |
| B | 1 moderated + 1 bonification, dependants 6, RIA 80,000 | `bonification 0`, `total 0`, no warning |
| C | 2 moderated, `moderatedChildrenWithoutBenefit: 1`, 60,000 | `degrevement 922.50`, `eligibleChildren 1`, `total 922.50` |
| D | 1 moderated + 1 bonification, dependants 1, `childBenefitReceived: false` | `total 1,845`, warning present (documented limitation) |
| E | 2 moderated, `childBenefitReceived: false` | `degrèvement 1,845` (fallback intact) |
| F | 2 moderated, count 0, `childBenefitReceived: false` | `total 0` (explicit 0 wins) |
| G | 1 moderated, salary 41,020 (RIA 40,000) | `degrèvement 922.50`, `finalTaxLiability 219.17` |
| H | 1 bonification, RIA 71,000 | `560`, `phaseOut true` |
| I | 6 bonification children, RIA 80,000 | `5,535`, `phaseOut false` (cap lift on relief children only) |
| J | 3 moderated + 3 bonification, dependants 3, 60,000 | `total 5,535`, warning present (C1 overlap, record only) |
| K | 1 moderated (no benefit) + 1 bonification, dependants 6, RIA 80,000 | `degrèvement 922.50`, `bonification 0` (no dependant-driven lift) |

**Claims checked:** every assertion in the six VERIFY items was traced to code lines and re-executed through the engine; the two legal quotes were re-fetched from the ACD this run.

**Not covered:** API e2e (no `@nestjs/*`, Prisma client or Postgres in this workspace), web mount/rendering (no React/Next dependencies), `tsc -p tsconfig.api.json` (not runnable: no `@nestjs/*` types), and therefore the questionnaire PUT → `calculations.service.ts` → calculation persistence path is transpile + review only (`calculations.service.ts` is outside `tsconfig.test.json`; `syntax_check.cjs` transpiles without type checking). Database persistence and old-snapshot rendering were not exercised.
