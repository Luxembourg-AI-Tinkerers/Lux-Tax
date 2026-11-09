# Implementation report — LEG-2 (Art. 122 dégrèvement, Art. 123bis bonification)

Date: 2026-11-08. Scope: `audit/audit-legal.md` §LEG-2 only (P1-8 "bonification").
Inputs read first: `audit/audit-legal.md:79-116` and `research/2025-2026-lu-tax-credits-and-classes.md:123-158` (§2.3 A/B).

## 1. Rules as implemented

| Rule | Input | Formula | Cap |
|---|---|---|---|
| Art. 122 dégrèvement | moderated children, tax still due after credits | `min(count × 922.50, max(0, taxAfterCredits))` | non-refundable: liability never below 0 |
| Art. 123bis bonification, ≤ 5 children, RIA < 67,400 | child count, RIA | `count × 922.50` | capped at the tax left after the dégrèvement |
| Art. 123bis, 67,400 ≤ RIA ≤ 76,600 | child count, RIA | `count × min(922.50, (76,600 − RIA)/10)` | same |
| Art. 123bis, RIA > 76,600 | — | `0` | — |
| Art. 123bis, ≥ 6 children (modération + bonification) | child count, `dependantsCount` | income cap lifted: `count × 922.50` at any RIA | same |

Constants live only in the rule package: `amountPerChild 922.5`, `bonificationPhaseOutFrom 67_400`, `bonificationZeroFrom 76_600`, `capLiftedFromChildren 6` (`rules/2025.ts`); 2026 and 2028 inherit them through the existing package spread (verified at runtime: `getRulePackage(2026).childRelief` returns the same four values).

Engine behaviour:

- Dégrèvement is **only** computed when `childBenefitReceived === false` (default `true` → 0, no provenance entry). `eligibleChildren = 0` in that case.
- Order: `taxAfterCredits = max(0, totalTaxBeforeCredits − credits.total)` → dégrèvement → `remaining = max(0, taxAfterCredits − dégrèvement)` → bonification `min(computed, remaining)` → `finalTaxLiability = max(0, taxAfterCredits − total)`.
- `totalTaxCredits` stays `credits.total`; child relief is **not** added to `credits` (it is a dégrèvement, not a crédit d'impôt), so `totalTaxBeforeCredits − credits.total − childRelief.total = finalTaxLiability` holds by construction.
- Provenance `LIR-ART-122` / `LIR-ART-123bis` is pushed only when the amount is > 0, with formula + inputs (`children`, `amountPerChild`, `taxAfterCredits`; `householdChildren`, `ria`, `amountComputed`, `taxAfterDegrevement`).
- Warning when `moderationCount + bonificationCount > max(dependantsCount, moderationCount, bonificationCount)`; text contains "cannot generate both". No warning when `childBenefitReceived === false` with `moderationCount === 0` (nothing to warn about) and none for a consistent 1 modération + 1 bonification with `dependantsCount: 2` (asserted).
- `bonificationPhaseOut` is `bonificationComputed > bonification` exactly as briefed (see §4.2).
- Counts are clamped with `countOf()` (finite, ≥ 0, floored) for the new relief path.

## 2. Files changed

| File | Change |
|---|---|
| `packages/tax-engine/src/rules/types.ts` | New `ChildReliefRules` (4 readonly fields, JSDoc citing Art. 122/123bis and non-refundability); `readonly childRelief: ChildReliefRules` added to `RulePackage` after `cim`. |
| `packages/tax-engine/src/rules/2025.ts` | `childRelief` literal (922.5 / 67 400 / 76 600 / 6) with a comment stating 2026 inherits it. |
| `packages/tax-engine/src/credits.ts` | Imports `ChildReliefRules` + `fromCents/toCents`; private `normaliseCount`; exported pure `degrevementForChildren(childCount, taxDue, rules)` and `bonificationForChildren(childCount, ria, totalChildren, rules)`. Arithmetic is done in integer cents. |
| `packages/contracts/src/tax.ts` | `TaxCalculationParams`: `childBenefitReceived?: boolean` (default-true semantics in JSDoc) and `childrenWithBonification?: number`. New `ChildReliefBreakdownDto`; `childRelief: ChildReliefBreakdownDto` added to `TaxCalculationResultDto` between `totalTaxCredits` and `finalTaxLiability`. |
| `packages/contracts/src/questionnaire.ts` | Same two optional fields on `QuestionnaireAnswersDto` with the Art. 122 gate / Art. 123bis explanation. |
| `packages/validation/src/questionnaire.schema.ts` | `childBenefitReceived: z.boolean().optional()`, `childrenWithBonification: z.number().int().min(0).max(20).optional()`. |
| `packages/tax-engine/src/engine.ts` | Destructures `childrenWithBonification = 0`, `childBenefitReceived = true`, `dependantsCount = 0`; `countOf()` helper + `moderationCount` / `bonificationCount`; new "Art. 122 / 123bis child relief" block before the balance, replacing the old `finalTaxLiability` expression; two provenance entries, one warning; `childRelief` in the return. |
| `apps/api/src/modules/calculations/calculations.service.ts` | Maps `answers.childBenefitReceived` and `answers.childrenWithBonification` into `TaxCalculationParams` next to `childAllocations`. |
| `packages/tax-engine/test/tax-engine.spec.ts` | New `describe('Art. 122 dégrèvement and Art. 123bis bonification (LEG-2)')` with 6 tests (details in §3). |

No change to: CIM gate/amount (`engine.ts` CIM block untouched), `deductions.ts` cap multiplier, `childrenWithModeration` plumbing, `packages/tax-engine/src/index.ts` (already `export * from './credits'`, which re-exports both new functions), UI, questionnaire view.

## 3. Behaviour observed (probe run, 2025 package, resident, default forfaits)

| Case | taxable | before credits | credits | childRelief | final |
|---|---|---|---|---|---|
| 1a, gross 60,000, 2 moderated children, benefit received (default) | 58,980 | 9,023.31 | 396.00 | `{degrevement:0, bonification:0, total:0, eligibleChildren:0}` | 8,627.31 |
| same + `childBenefitReceived: false` | 58,980 | 9,023.31 | 396.00 | `{degrevement:1845, total:1845, eligibleChildren:2}` | 6,782.31 |
| Class 1, gross 72,020 (RIA 71,000), `childrenWithBonification: 1` | 71,000 | 16,535.78 | 158.01 | `{bonification:560, bonificationChildren:1}` | 15,817.77 |
| Class 1, gross 72,020, no bonification | 71,000 | 16,535.78 | 158.01 | all 0 | 16,377.77 |
| Class 1, gross 77,620 (RIA 76,600), `childrenWithBonification: 1` | 76,600 | 18,872.66 | 47.13 | `{bonification:0, bonificationChildren:1}` | 18,825.53 |
| 1a, gross 27,480 (RIA 26,460), 2 children, no benefit | 26,460 | 0 | 0 | all 0 | 0 |

Deltas: 1,845.00 on the dégrèvement pair; 560.00 on the RIA 71,000 pair; 0 at RIA 76,600.

## 4. Deviations, with reasons

1. **The six-child cap lift is tested *before* the RIA ceiling, not after it.** The brief lists "0 if `ria > zeroFrom`; if `totalChildren >= capLiftedFromChildren` …", but its own required test says "6+ children at RIA 80,000 -> 922.5; 5 children at 80,000 -> 0", and Art. 123bis lifts the income cap at six children. With the brief's literal order the 80,000 case would return 0 and the test could not pass. The function therefore returns the flat amount when `totalChildren >= 6` first; the doc comment states why. All other branches follow the brief verbatim.
2. **`bonificationPhaseOut` is `bonificationComputed > bonification` as specified.** Note the semantics this produces: `bonificationComputed` already includes the RIA phase-out, so the flag is `true` only when the *remaining tax due* cut the bonification further, not when the €67,400–€76,600 band reduced it (at RIA 71,000 it is `false` while the amount is 560 instead of 922.50). The DTO JSDoc describes exactly that; if the intended meaning is "phase-out band applied", the comparison should instead be `bonificationComputed < bonificationCount * amountPerChild`. Flagged, not changed unilaterally.
3. **Clamping is applied to the new relief path only.** `countOf()` feeds `moderationCount` / `bonificationCount` (relief, `householdChildren`, the new warning). The pre-existing uses of the raw `childrenWithModeration` (deductions cap multiplier, Class 1a warning, CIM gate, ASRD default) are untouched, per "do not change the CIM logic or the `childrenWithModeration` cap multiplier". A negative/fractional count can therefore still reach the multiplier, exactly as before this change.
4. **`totalChildren` for the cap lift is `max(dependantsCount, moderationCount + bonificationCount)`**, as briefed; `dependantsCount` defaults to 0 when the caller omits it.
5. **No UI row and no questionnaire control.** Items 1–10 do not include them, so `TaxCalculatorView.tsx` and `QuestionnaireView.tsx` are unchanged; the new result field is simply not rendered yet. `childBenefitReceived` is currently settable only through the API payload. This is the remaining half of the audit's "two UI rows and a questionnaire gate" proposal.
6. **"At most two bonifications per child" and the résidence-alternée transitional rule (AY 2025–2026) are not modelled.** Both need per-child history (year the moderation right expired, alternate-residence flag) that the questionnaire does not carry; the brief's input is a bare count. Nothing in the engine claims otherwise.
7. **`packages/tax-engine/src/index.ts` was not edited** — it already re-exports `./credits`, so both pure functions are part of the public engine surface. Verified by importing them from `../src/index` in the tests (type-check + runtime).

## 5. Verification

| Check | Command | Result |
|---|---|---|
| Engine + API unit suites | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts` | **76 tests, 11 suites, 76 pass, 0 fail** (baseline 70 → 76; the 6 new LEG-2 tests are listed in the run output) |
| Type check | `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` | **exit 0** |
| Syntax/transpile | `node .tools/syntax_check.cjs` | **27/27 ok, exit 0** (unchanged count) |
| 2026 inheritance | probe `getRulePackage(2026).childRelief` | `{amountPerChild:922.5, bonificationPhaseOutFrom:67400, bonificationZeroFrom:76600, capLiftedFromChildren:6}` |
| Provenance | probe on the RIA 71,000 case | rule codes emitted include `LIR-ART-123bis`; `LIR-ART-122` appears only in the `childBenefitReceived: false` run (asserted in the test) |

New tests (all in `packages/tax-engine/test/tax-engine.spec.ts`):

1. `dégrèvement: 922.50 per child, capped at the tax still due` — 1 child/5,000 → 922.5; 2 children/1,000 → 1,000; 0 children → 0; 3 children/5,000 → 2,767.5; 2026 package → 922.5.
2. `bonification: 560 at RIA 71,000, zero at 76,600, cap lifted from six children` — 71,000×1 → 560; 71,000×2 → 1,120; 76,600 → 0; 60,000 → 922.5; 80,000 with 6 children → 922.5; 80,000 with 5 → 0; 65,000×2 → 1,845; 0 children → 0.
3. `engine: two moderated children without any benefit are worth 1,845` — delta 1,845 vs the default run, `childRelief.total` = delta, `eligibleChildren` 2, `totalTaxCredits` unchanged, no `LIR-ART-122` provenance when the benefit was received.
4. `engine: bonification at RIA 71,000 is 560; at RIA 76,600 it is 0` — also asserts the €560 reduction of `finalTaxLiability`.
5. `engine: the same child cannot generate both reliefs` — warning present for 1 + 1 with no declared children, absent for 1 + 1 with `dependantsCount: 2`.
6. `engine: child relief never pushes the liability below zero` — RIA 26,460, tax 0, relief 0, final 0, balance 0.

## 6. Not verified

- **API e2e not run** (`@nestjs/*`, generated Prisma client, Postgres absent). `calculations.service.ts` is not inside `tsconfig.test.json`, so the two-line mapping is verified by `syntax_check.cjs` (transpile, 0 diagnostics) and by review only — not by `tsc`.
- **`tsc -p tsconfig.api.json` not run** (excluded by the brief).
- **UI not exercised**: no component reads `childRelief`, so nothing renders the new figures; the mobile/web totals stay `totalTaxCredits` and `finalTaxLiability`.
- **Stored snapshots**: `workspace.calculationResult` written before this change has no `childRelief` key; `getLatestCalculation` casts, so an old snapshot served to a future UI row would read `undefined`. No migration/backfill was added (out of scope).
- **No end-to-end persistence check** that `childBenefitReceived`/`childrenWithBonification` survive the questionnaire PUT → calculation path (needs the API).

## 7. Phase-out flag correction

`childRelief.bonificationPhaseOut` previously meant "the remaining tax due cut the bonification" (`bonificationComputed > bonification`). The contract and the UI note ("Bonification phased out at your RIA") mean the Art. 123bis RIA band, so the engine now returns `bonificationCount > 0 && householdChildren < 6 && riaForBonification >= pkg.childRelief.bonificationPhaseOutFrom && riaForBonification <= pkg.childRelief.bonificationZeroFrom` (band read from the rule package, six-child cap lift and tax-cap cuts both excluded). The DTO JSDoc in `packages/contracts/src/tax.ts` describes that meaning. This supersedes the §4.2 / §5 item 2 note.

Tests: `engine: bonification at RIA 71,000 is 560; at RIA 76,600 it is 0` now also asserts the flag is `true` at RIA 71,000 (the old expression evaluated to `false` there: computed 560 = granted 560, verified by probe). New test `engine: bonificationPhaseOut follows the 67,400-76,600 RIA band, not the tax cap` asserts `false` at RIA 60,000 (922.50 granted) and `false` at RIA 80,000 with six children (cap lift, 922.50). Suite: 77 tests / 77 pass; `tsc -p tsconfig.test.json` exit 0; `syntax_check.cjs` 27/27 ok, exit 0.

## 8. Review fixes (M1, C2, C4–C6)

Date: 2026-11-08. Scope: `audit/review-leg2.md` §2 M1 and §3 C2/C4/C5/C6. No other behaviour was changed.

### M1 — six-child cap lift counts only relief children

`packages/tax-engine/src/engine.ts` no longer feeds `Math.max(dependantsCount, moderationCount + bonificationCount)` into `bonificationForChildren`. The cap-lift input is `reliefChildren = moderationCount + bonificationCount`, matching the ACD wording (six children “pour lesquels il obtient une modération … ou une bonification”). `dependantsCount` is now only a plausibility input for the same-child warning; it never drives an amount. The `LIR-ART-123bis` provenance input key changed from `householdChildren` to `reliefChildren` accordingly.

Tests:

- `engine: bonificationPhaseOut follows the 67,400-76,600 RIA band, not the tax cap` now uses a legal six-relief-child household (`childrenWithModeration: 5`, `childrenWithBonification: 1`, `dependantsCount: 6`, RIA 80,000) → 922.50.
- The same test adds `dependantsCount: 6`, `childrenWithModeration: 1`, `childrenWithBonification: 1` at RIA 80,000 → bonification 0, total 0, and asserts the same-child warning does not fire.

### C2 — per-child Art. 122 gate

- `packages/contracts/src/tax.ts` (`TaxCalculationParams`) and `packages/contracts/src/questionnaire.ts` (`QuestionnaireAnswersDto`): new optional `moderatedChildrenWithoutBenefit` — “Moderated children for whom no family allowance / CEDIES / SNJ was paid; each generates the EUR 922.50 Art. 122 dégrèvement.” `childBenefitReceived` is kept and re-documented as the all-or-nothing fallback; the count takes precedence.
- `packages/validation/src/questionnaire.schema.ts`: `moderatedChildrenWithoutBenefit: z.number().int().min(0).max(20).optional()`.
- `apps/api/src/modules/calculations/calculations.service.ts`: maps `answers.moderatedChildrenWithoutBenefit` into the engine params.
- `packages/tax-engine/src/engine.ts`: `degrevementChildren = min(moderationCount, countOf(moderatedChildrenWithoutBenefit ?? (childBenefitReceived === false ? moderationCount : 0)))`. That count drives the dégrèvement and is returned as `eligibleChildren`. The clamp stops a count larger than the moderated children from over-relieving; an explicit `0` wins over the boolean fallback.
- `apps/web/src/components/QuestionnaireView.tsx`: the `childBenefitReceived` checkbox is replaced by a number input bound to `moderatedChildrenWithoutBenefit` (min 0, max 20, placeholder 0), label “Moderated children with no family allowance / CEDIES / SNJ (Art. 122 dégrèvement)”, helper “Each such child gives EUR 922.50, capped at the tax due and never refundable.” The checkbox and its initial state value are removed; the contract field remains for API compatibility.
- `ChildReliefBreakdownDto.eligibleChildren` JSDoc now reads “Moderated children for whom no CAE / CEDIES / SNJ was paid (Art. 122 gate).”

Test `engine: the Art. 122 gate applies per child, not to the whole household`: 2 moderated children with `moderatedChildrenWithoutBenefit: 1` → 922.50 (not 1,845), `eligibleChildren` 1; 1 moderated child with count 3 → clamped to 922.50.

### C4 — phase-out flag uses the rule package

`bonificationPhaseOut` now tests `reliefChildren < pkg.childRelief.capLiftedFromChildren` instead of the literal `6`.

### C5 — acceptance case asserted through the engine

New test `engine: one moderated child at RIA 40,000 receives the full 922.50`: RIA 40,000 (salary 41,020), `childrenWithModeration: 1`, no benefit → `degrevement` 922.50 and `finalTaxLiability` 922.50 below the same run without the child.

### C6 — warning test name and amount

`engine: the same child cannot generate both reliefs` is renamed `engine: warns when the moderation and bonification counts exceed the declared children` and now also asserts `degrevement` 922.50, `bonification` 922.50 and `total` 1,845 in the bare-count case: the warning is the only guard and the relief is not silently capped (the C1 per-child-history limitation is unchanged and remains documented).

### Verification

| Check | Command | Result |
|---|---|---|
| Engine + API unit suites | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts` | 79 tests, 11 suites, 79 pass, 0 fail, exit 0 (77 baseline + 2 new) |
| Type check | `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` | exit 0, no output |
| Syntax / transpile | `node .tools/syntax_check.cjs` | 27 files `ok`, 0 `FAIL`, exit 0 |

Not run: API e2e (no Nest/Prisma/Postgres), web mount/render, and `tsc` over `apps/api` / `apps/web` (outside `tsconfig.test.json`; `calculations.service.ts` and `QuestionnaireView.tsx` are transpile-only here).
