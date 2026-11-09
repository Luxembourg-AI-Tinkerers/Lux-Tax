# Review — LEG-3 round 2 (M1/M2 fixes)

Independent re-review, 2026-11-08. Scope: `audit/review-leg3.md` §2 M1/M2, `audit/impl-leg3.md` §8, and the task's items 1–3. No implementation file was edited; this report is the only file written.

## 1. Conclusion

**allPass: true.** No must-fix issue remains. M1 and M2 meet the blocker criteria: the summary card no longer counts the refunded CIM a second time, and the class/CIM resolution now derives the class and the single-parent default from one resolved household situation. Regression is green: 96/96 tests, `tsc -p tsconfig.test.json` exit 0, `syntax_check.cjs` 28/28 files ok. Three display/consistency residuals and one coverage gap are worth considering; none changes a tax amount or loses the CIM in a normal flow.

| id | verdict | evidence |
|---|---|---|
| M1 | **Pass** (W1 note) | Card now renders `totalTaxCredits - (credits.cimRefund ?? 0)` at `TaxCalculatorView.tsx:202`; JSDoc at `packages/contracts/src/tax.ts:283-288` says the field is the statutory sum; 20k card 792.00 / detail CIM applied 0.00 / refund 3,504.00 / hero 3,504.00; 40k card 1,915.30 / detail 749.96 / 2,754.04 / hero 2,754.04; card + refund = statutory total in both cases, so no double count. |
| M2 | **Pass** (W2/W3 notes) | `calculations.service.ts:85` resolves `maritalStatus` once, `:90-92` resolves `childrenWithModeration` once (with the dependants fallback), `:99-104` passes the count explicitly to `deriveTaxClass` and uses `workspace.taxClass` only when there is no tax profile, and `:151` feeds the same pair to `deriveIsSingleParent`; `class-resolution.ts:24-30,44-72` implements the pure helpers; all 11 `apps/api/test/class-resolution.spec.ts` tests pass; explicit `false` wins in `class-resolution.ts:29` and in the UI's `??` at `QuestionnaireView.tsx:720`. |
| R1 | **Pass** | `tsx --test` over the five files: 96 tests, 14 suites, 96 pass, 0 fail. `tsc -p tsconfig.test.json`: exit 0. `syntax_check.cjs`: exit 0, 28/28 ok. Diff against `tmp/leg3-backup` shows the engine only in the CIM split block, contracts only in the CIM fields/JSDoc, and the two views only in the CIM/card areas; the LEG-2 child-relief block is untouched and its 9 tests pass; the P0 suites pass and no M1/M2 edit touches `fact-visibility.ts` or `platform-admin.ts`. |

## 2. Must fix

None. No remaining lost CIM and no remaining double-counted refund was found in a new calculation.

## 3. Worth considering

### W1 — At 20k the card still calls 792.00 "credited against base tax", although the cote is zero

- **Location:** `apps/web/src/components/TaxCalculatorView.tsx:202-207`; `packages/contracts/src/tax.ts:283-288`.
- **Problem:** `totalTaxCredits - cimRefund` is the non-refunded credit amount, not necessarily the amount absorbed by the tax. At 20k, `totalTaxBeforeCredits = 0`, `totalTaxCredits = 4,296`, `cimRefund = 3,504`, so the card shows 792.00; that 792.00 is the non-refundable CIS, and with a zero cote it is not applied at all. The M1 double count is gone, but the card/subtitle still overstates the credit actually used in this case.
- **Impact:** display only; the hero balance and the refund are correct. A user sees a 792.00 credit that did not reduce any tax. At 40k the card is exact (1,915.30 = all credits applied).
- **Evidence:** probe `tmp/leg3-probe.ts` (run this session): 20k `before 0`, `credits.total 4,296`, `cimApplied 0`, `cimRefund 3,504`, `balance -3,504`; 40k `before 1,915.30`, `credits.total 4,669.34`, `cimApplied 749.96`, `cimRefund 2,754.04`, `balance -2,754.04`. Engine test 1 also pins `totalTaxCredits === credits.total`.
- **Suggestion:** if the card is meant to be "applied", render `min(totalTaxBeforeCredits, totalTaxCredits - cimRefund)`; otherwise relabel it as "non-refunded credits" and leave the applied amount to the detail rows. Do not change the formula without deciding how the lost non-CIM credit should be presented.

### W2 — The questionnaire checkbox fallback is not fully consistent with the API resolution

- **Location:** `apps/web/src/components/QuestionnaireView.tsx:719-724`; API `apps/api/src/modules/calculations/calculations.service.ts:85,90-92`.
- **Problem:** the checkbox falls back to `answers.maritalStatus` and `answers.childrenWithModeration ?? answers.childrenCount ?? 0`. The API falls back to `taxProfile.maritalStatus` and then to `household.dependants.length`. In the dependant-only case (questionnaire `childrenCount` 0, moderated count blank, one household dependant), the API derives `isSingleParent: true`, Class 1a and the CIM, while the checkbox renders unchecked. A legacy tax-profile-only status produces the same kind of display mismatch.
- **Impact:** display vs calculation disagreement; a user may believe the CIM is off. No lost CIM was found: the form PUTs the `answers` object (`QuestionnaireView.tsx:65`), and the checkbox only writes the key on change (`:726`), so an untouched dependant-only case leaves `isSingleParent` undefined and the API derives `true`. An explicit `false` is respected by `deriveIsSingleParent` (`class-resolution.ts:29`).
- **Evidence:** code lines above; the 11 class-resolution tests (including "an explicit false is respected") pass; no component test/render exists.
- **Suggestion:** return the resolved single-parent default (or the resolved status and dependants count) from `GET questionnaire` and use it for `checked`; or show the effective value next to the override checkbox. The label "tick only to force it on or off" helps but does not make the unchecked state truthful in the dependant-only case.

### W3 — No test pins the service-level fallbacks that fixed M2

- **Location:** `apps/api/src/modules/calculations/calculations.service.ts:85-104`; `apps/api/test/class-resolution.spec.ts` (11 tests); `tsconfig.test.json:17-26`.
- **Problem:** the 11 tests cover the pure `deriveTaxClass` / `deriveIsSingleParent` helpers. They do not cover the service's input resolution: the household-dependants fallback, the `taxProfile.maritalStatus` precedence, or the `workspace.taxProfile ? null : workspace.taxClass` branch. `calculations.service.ts` is not in `tsconfig.test.json` (the include list has `class-resolution.ts` but not the service) and is only transpiled by `syntax_check.cjs`.
- **Impact:** no current wrong result (the branch is deterministic and inspected), but the exact M2(a) path — a child known only through household dependants — has no red test if someone edits the fallback.
- **Evidence:** `tsconfig.test.json` include lines; report §8 admits the service is outside `tsc`; the 11 tests use an explicit count of 1 rather than a dependants/answers fixture.
- **Suggestion:** extract the resolution into a pure helper (answers + dependants + profile -> `{ maritalStatus, childrenWithModeration }`) and unit-test: dependant-only child -> 1A + CIM; no profile + explicit class -> explicit; profile + persisted class -> re-derived; blank/0 variants. Or add one narrow service test.

### W4 — The refund banner still names withholding when the refund is the CIM

- **Location:** `apps/web/src/components/TaxCalculatorView.tsx:145-147`.
- **Problem:** when `cimRefund > 0` and `taxWithheldAtSource = 0`, the hero says "Excess tax deducted at source will be reimbursed". At 20k the refund is the CIM, not withholding (prior review W2, still present).
- **Impact:** wrong explanation; the amount is correct.
- **Evidence:** probe 20k: `withheld 0`, `balance -3,504`; the banner branch is only `isRefund`.
- **Suggestion:** branch on `taxWithheldAtSource > 0` vs `cimRefund > 0`, or say "refund due, including the refundable CIM (Art. 154ter)".

## 4. Record only

- **`bothParentsSameHome` unanswered defaults to "not shared"** (`engine.ts:998`, service `:130`): a parent who shares the home and never ticks the box gets the CIM. Prior W3; over-grant risk, not a lost CIM.
- **Old snapshots** returned by `getLatestCalculation` have no `cimApplied`/`cimRefund`; the calculator shows "CIM applied -€0.00" and no refund row until a manual recalculation. Prior W5; new calculations only.
- **`assert.ok(r.credits.cimApplied >= 0)`** in the 20k test is tautological; the exact `close(..., 0)` is the meaningful assertion.
- **The mobile estimate screen** still prints `totalTaxCredits` and has no CIM refund row (`apps/mobile/app/(tabs)/estimate.tsx:153-161`). It prints `totalTaxLiability`, not the balance, so it does not double count; out of scope.
- **Filing reads `workspace.taxClass`** (`filing.service.ts:138,410,486,498`). `saveProfile` does not update it, so a questionnaire change without a new calculation leaves the filing class stale; pre-existing, outside this fix.
- **Prior W1 arithmetic caveat** in `impl-leg3.md` §7 (relief-first 2,511.20 vs CIM-first 2,754.04) remains unchanged; documentation/legal-order issue, not a code defect in this fix.
- **`deriveTaxClass`'s JSDoc** says a caller-supplied class overrides the family situation; the service only supplies one for a workspace without a tax profile, so in practice the family situation wins once a questionnaire exists. Wording only.

## 5. Review scope and not covered

### Standard applied

- Task items 1–3; `audit/review-leg3.md` §2 M1/M2; `audit/impl-leg3.md` §8; Art. 154ter al. 2 refund rule as already established in round 1 (no new legal research).
- Calculator: applied card, detail rows, hero balance, JSDoc; API: one resolution of status/count, class re-derivation, no-profile explicit class; regression: five suites, tsc, syntax, LEG-2/P0.

### Commands run (this machine, read-only)

| # | Command | Result |
|---|---|---|
| 1 | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts apps/api/test/class-resolution.spec.ts` | 96 tests, 14 suites, 96 pass, 0 fail, 0 skipped |
| 2 | `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` | exit 0, no diagnostics |
| 3 | `node .tools/syntax_check.cjs` | exit 0, 28/28 files `ok` |
| 4 | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tmp/leg3-probe.ts` | 20k / 40k values quoted above; 100k control 24,595.05; `isSingleParent:false` 749.96; 1,000 withheld -4,504 |

### Diff scope checked

- `tmp/leg3-backup/engine.ts` vs `packages/tax-engine/src/engine.ts`: only the CIM split, refund provenance and balance block (+33/−6); the Art. 122 / 123bis child-relief block is unchanged.
- `tmp/leg3-backup/tax.ts` vs `packages/contracts/src/tax.ts`: only `cimApplied`/`cimRefund` and the `totalTaxCredits` JSDoc (+13).
- `tmp/leg3-backup/QuestionnaireView.tsx`: only the single-parent checkbox/helper text (+22).
- `tmp/leg3-backup/TaxCalculatorView.tsx`: only the card and the CIM applied/refund rows (+20/−4).
- `tmp/leg3-backup/tax-engine.spec.ts`: only the six LEG-3 tests (+164).
- `calculations.service.ts` vs backup: the class switch removed, one resolved status/count block added, `deriveTaxClass`/`deriveIsSingleParent` used, profile/no-profile branch added; no other change.
- New `apps/api/test/class-resolution.spec.ts` (11 tests), `tsconfig.test.json` includes, `syntax_check.cjs` entry.

### Not covered / limits

- **API e2e not run:** `@nestjs/*`, the generated Prisma client and Postgres are absent. The dependant-only and persisted-class paths are traced by inspection, not executed through HTTP. `tsc -p tsconfig.api.json` still fails on missing `@nestjs/common`, `@prisma/client`, `fastify` and missing Prisma model types; `class-resolution.ts` itself produced no diagnostic, and the `calculations.service.ts` diagnostics are the same environmental ones, not M2 logic.
- **Web not rendered:** `apps/web/node_modules` and `@types/react` are absent; the two TSX files are syntax-checked only. The checkbox fallback and the card are inspected, not clicked.
- **No component test** exists for either view; W2 is a code-level display finding.
- **Filing scenario not executed:** the stale `workspace.taxClass` observation is code inspection only.
- **Old snapshots** and the mobile screen were not re-run; they are record-only.

### allPass rationale

No must-fix finding remains. The two blockers from round 1 are addressed on their stated criteria: the card no longer double-counts the refund, and a profile-based calculation no longer freezes the persisted class or loses the dependants-only child. The residual issues (W1–W4) do not change a tax amount, do not lose the CIM when the form is saved untouched, and do not double count a refund; they are follow-up quality items.