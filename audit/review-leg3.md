# Review — LEG-3 (CIM reachability and refundability, Art. 154ter)

Independent review, 2026-11-08. Scope: `audit/audit-legal.md` §LEG-3, Art. 154ter al. 2, and the task's five verification items. Read-only: no implementation file was changed.

Evidence tiers used below: **executed** = I ran the command/probe myself this session; **inspected** = read the code and traced a deterministic branch; **not executed** = API e2e/web rendering unavailable.

## 1. Conclusion

**allPass: false.** **Not ready to ship — 2 must-fix issues (both correctness layer).** The refund math itself is correct and well tested: `cimApplied + cimRefund = cim`, `totalTaxCredits` stays `credits.total`, the balance is `final − withheld − cimRefund`, a refund deepens the negative balance, withheld is counted once, and child relief is applied on `taxAfterCredits` (after the CIM). The six new engine tests plus the 79 pre-existing tests pass (85/85), `tsc -p tsconfig.test.json` exits 0, and `syntax_check.cjs` is 27/27.

The two blockers are outside the engine arithmetic: (1) the summary card still presents the full statutory CIM (`totalTaxCredits`) as a tax credit, so the new refunded portion is displayed twice; (2) the reachability fix is bypassed by the class/input resolution in real flows — a child that exists only as a household dependant, a class persisted by a previous calculation, or a legacy tax-profile-only marital status can leave the engine in Class 1 / CIM 0. Everything else is display, test-coverage or documentation follow-up.

## 2. Must fix

### M1 — The summary card still shows the full CIM as a deduction, double-counting the refund

- **Location:** `apps/web/src/components/TaxCalculatorView.tsx:196-204` (card; value is `calc.totalTaxCredits` at line 201), against the corrected detail rows at `:384-398`.
- **Problem:** `totalTaxCredits` remains `credits.total` (the statutory total, including the full CIM). The card renders it with a minus sign and the subtitle "Credited against base tax". When only part of the CIM is applied, the rest is paid out as `cimRefund`; the card still counts the full CIM as a credit and the separate "+€ CIM refunded" row counts the same money again.
- **Impact:** the most prominent credit figure is wrong in exactly the new LEG-3 case. At 20,000 single parent: `totalTaxBeforeCredits = 0`, `totalTaxCredits = 4,296`, `cimApplied = 0`, `cimRefund = 3,504`; the card says "-€4,296.00 credited against base tax". At 40,000: `totalTaxCredits = 4,669.34`, `cimApplied = 749.96`, `cimRefund = 2,754.04`, `taxBefore = 1,915.30`; the card overstates the credit by 2,754.04 and double-counts the refund. The detail rows and the hero balance are correct, so the screen contradicts itself.
- **Evidence:** code lines above; the probe values in §5; the author's own observation 3 (`audit/impl-leg3.md:94`) admits the card still shows `totalTaxCredits`. The verification item 3 is explicit: "the UI shows applied/refunded, not full CIM as a deduction when only part applied." This is not a wording issue — the amount is wrong.
- **Fix direction:** render `totalTaxCredits − (credits.cimRefund ?? 0)` in the card (the amount actually credited), or split it into "CIM applied" and "CIM refunded"; add a JSDoc to `totalTaxCredits` in `packages/contracts/src/tax.ts:283` saying it is the statutory total, not the applied amount.

### M2 — The reachability fix is bypassed by the class/input resolution in real flows

- **Location:** `apps/api/src/modules/calculations/calculations.service.ts:30-60` (`resolveTaxClass`), `:119-123` (call), `:125-127` (later child count), `:174-179` (`isSingleParent` default), `:246` (persisted `taxClass`); `apps/web/src/components/QuestionnaireView.tsx:719-725` (checkbox fallback).
- **Problem:** the new `isSingleParent` default is correct, but the engine gate also requires `taxClass === CLASS_1A` (`engine.ts:993-999`). The class is resolved from different inputs than the CIM default:
  - **(a) Dependant-only child.** `resolveTaxClass` computes `childrenWithModeration` at `:37-38` without the household-dependants fallback; the later count at `:125-127` does use `workspace.household.dependants.length`. A DIVORCED (or SINGLE) parent whose child is registered only in the household (questionnaire `childrenCount` left at its default 0, `childrenWithModeration` blank) resolves to Class 1; the engine gate then blocks the CIM even though `isSingleParent` is true. The questionnaire's own placeholder at `QuestionnaireView.tsx:556` is "same as dependants", so leaving the field blank is an intended flow.
  - **(b) Persisted class.** `calculateTax` writes the resolved class to `workspace.taxClass` at `:246`; on the next calculation `resolveTaxClass` returns `workspace.taxClass` unconditionally at `:35`. A user who calculated once before adding the child or changing marital status stays in the old class; the questionnaire change cannot move them to 1a and the CIM stays 0. The report's e2e recipe starts a fresh workspace and does not cover this.
  - **(c) Marital-status source.** `resolveTaxClass` receives `workspace.taxProfile?.maritalStatus ?? answers.maritalStatus` (`:121`), while the CIM default reads `answers.maritalStatus` (`:176-178`). A legacy tax-profile-only status gives Class 1a but no CIM (the report's observation 5, `impl-leg3.md` §7).
  - **(d) UI display.** The checkbox's derived `checked` uses `answers.childrenWithModeration ?? answers.childrenCount ?? 0` (`QuestionnaireView.tsx:719-725`), so in the dependant-only case it shows unchecked while the API default grants the CIM; the form does not persist a false, so the display and the calculation disagree.
- **Impact:** a divorced/single parent with a child in the household can be taxed as Class 1 instead of 1a and lose the CIM refund. Probe at 40,000: Class 1 + `isSingleParent: true` → `cim 0`, `final 3,070.79`; the same case as Class 1a → `cim 3,504`, `cimApplied 749.96`, `cimRefund 2,754.04`, `final 0`. That is a 5,824.83 swing between the two outcomes. The acceptance "DIVORCED + 1 child + bothParentsSameHome=false → CIM €3,504 with no extra flag" holds only for a fresh workspace whose questionnaire child count is set; the flows above lose the refund. This is a blocker under the task's "refund lost" rule.
- **Evidence:** code lines above; engine probes in §5; the UI placeholder; the report's §6 recipe explicitly sets `childrenWithModeration: 1` on a fresh workspace. Not executed end-to-end: `@nestjs/*`, the generated Prisma client and Postgres are absent, so the API path is traced by inspection, not by an HTTP call.
- **Fix direction:** resolve the household inputs once per calculation — `maritalStatus` (current questionnaire, falling back to the tax profile), `childrenWithModeration` (with the dependants fallback), `bothParentsSameHome` — pass the same status/count to `resolveTaxClass` and the CIM default, use the same count in the questionnaire checkbox (or return the resolved default), and distinguish an explicit class override from a computed one (or re-resolve when the questionnaire changes) instead of persisting the computed class as an override.

## 3. Worth considering

### W1 — The report's alternative-order arithmetic is invalid

- **Location:** `audit/impl-leg3.md:92` (§7 decision 1).
- **Problem:** the report compares "relief first" 2,511.20 with "CIM first" 2,754.04 and concludes the taxpayer is not worse off. 2,511.20 is the **no-non-refundable-credits** case: 3,504 − (1,915.30 − 922.50) = 2,511.20. With the same 1,165.34 non-refundable credits used in the 2,754.04 case, relief-first gives 3,504: tax 1,915.30 − 1,165.34 = 749.96; relief min(922.50, 749.96) = 749.96; CIM applied 0; refund 3,504. The comparison mixes two different scenarios.
- **Suggestion:** correct the comparison, or state that the ordering is per the brief and flag the relief loss separately. On these numbers the chosen order costs the taxpayer the 749.96 relief relative to relief-first; if the legal order is relief-before-CIM, the engine under-refunds by that amount. The code matches the brief, so this is a documentation/legal-risk finding, not a code defect.

### W2 — The refund banner names the wrong cause when there is no withholding

- **Location:** `apps/web/src/components/TaxCalculatorView.tsx:145-147`.
- **Problem:** with `cimRefund > 0` and `taxWithheldAtSource = 0`, the refund is due to the CIM, but the banner says "Excess tax deducted at source will be reimbursed". At 20,000 single parent the balance is −3,504 with zero withholding.
- **Suggestion:** branch the text on `taxWithheldAtSource > 0` vs `cimRefund > 0`, or say "refund due, including the refundable CIM (Art. 154ter)".

### W3 — `bothParentsSameHome` unanswered defaults to "not shared"

- **Location:** `packages/tax-engine/src/engine.ts:998` (`!params.bothParentsSameHome`), `apps/api/src/modules/calculations/calculations.service.ts:153` (passes the possibly-undefined answer).
- **Problem:** the gate blocks only when the flag is `true`; an unanswered questionnaire passes `undefined`, which the engine treats as false. The UI checkbox defaults unchecked. A divorced parent who shares the home and never ticks the box gets the CIM and the refund.
- **Suggestion:** require the answer (tri-state / readiness task) or emit a warning when it is unanswered; at minimum document the default.

### W4 — No test covers the API reachability default

- **Location:** `apps/api/src/modules/calculations/calculations.service.ts:174-179`; the six new tests at `packages/tax-engine/test/tax-engine.spec.ts:976-1137` all set `isSingleParent` explicitly.
- **Problem:** the central reachability change is outside `tsconfig.test.json` and has no unit/e2e test; the tests verify the engine formulas, not the `??` default or the `taxProfile`/`answers` sources. The report's §6 gives an e2e recipe but did not add it.
- **Suggestion:** extract the mapping into a pure helper and unit-test it: SINGLE/DIVORCED/WIDOWED + child → true; explicit false → false; MARRIED/PACS → false; no child → false; or add the e2e recipe.

### W5 — Stale pre-LEG-3 snapshots keep the old (clipped) refund until a manual recalculation

- **Location:** `apps/web/src/components/TaxCalculatorView.tsx:384-398`; the stored `calculationResult` returned by `getLatestCalculation`.
- **Problem:** old results have no `cimApplied`/`cimRefund` and their `balancePayableOrRefund` is the pre-fix value (0 for the clipped CIM). The `?? 0` guard avoids a throw but displays "CIM applied −€0.00", no refund row, and the old balance/dashboard `estimatedTaxBalance` until the user clicks Calculate.
- **Suggestion:** version the calculation result and recompute on read when the engine/rules version changed, or show a "recalculate" prompt; add a backfill plan. The report discloses the snapshot gap; this is not a blocker for new calculations.

## 4. Record only

- `assert.ok(r.credits.cimApplied >= 0)` in test 1 is tautological; the exact `close(..., 0)` is the meaningful assertion. The balance identity in test 5 restates the engine formula; the exact −4,504 is the meaningful part.
- The "CIM applied" row renders `-€0.00` for every non-CIM user; cosmetic.
- `calc.credits.cimRefund > 0` is safe without `?? 0` for old snapshots (`undefined > 0` is false); no change needed.
- The checkbox is visible for MARRIED/PACS users; the engine gate blocks by class, but the control can confuse. The mobile estimate screen still uses `totalTaxCredits` and has no CIM refund row; out of scope here (the task names the two web components), but it is a third consumer of the DTO.

## 5. Review scope and not covered

### Item-by-item verdicts

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | CIM gate: `isSingleParent` reachable for SINGLE/DIVORCED/WIDOWED with a moderated child; explicit false respected; `bothParentsSameHome` blocks; API/UI do not override a stored false | **Partial** — default is correct and `??` respects false; `bothParentsSameHome` blocks when true; the class/input paths in M2 can still keep the CIM at 0 | `calculations.service.ts:174-179`; `engine.ts:993-1014`; `QuestionnaireView.tsx:719-726`; test 4 (`bothParentsSameHome:true`) → cim 0 + warning; probe `isSingleParent:false` → cim 0; probe defaultHome → cim 3,504 (W3) |
| 2 | Refund math: `nonRefundable = total − cim`; `cimApplied = min(cim, taxAfterNonRefundable)`; `cimRefund = max(0, cim − cimApplied)`; `final`; `balance = final − withheld − cimRefund`; refund increases the negative balance; withheld not double-counted; child relief after CIM | **Pass** — formulas exact; `cimApplied + cimRefund = cim`; `credits.total` = sum of components; balance recomputes exactly; relief is applied on `taxAfterCredits` | `engine.ts:1117-1142`, `:1226-1229`; probes: 20k → 0 / 0 / 3,504 / −3,504; 40k → 749.96 / 2,754.04 / 0 / −2,754.04; 40k + 1,000 withheld → −3,754.04; 100k relief → 23,672.55 |
| 3 | `credits.cim`/`cimApplied`/`cimRefund` consistent; `totalTaxCredits` = `credits.total`; no double count; UI shows applied/refunded, not full CIM | **Partial** — engine/DTO consistent; the detail rows are correct; the summary card still shows the full `totalTaxCredits` as a deduction (M1) | `engine.ts:1084-1096`, `:1281`; `tax.ts:233-241`, `:283`; `TaxCalculatorView.tsx:196-204`, `:384-398`; 40k card 4,669.34 vs applied 1,915.30 |
| 4 | Tests: low-income final 0 / refund > 0 / balance < 0; high-income refund 0; gate false/shared-home cim 0; assertions meaningful | **Pass with reservations** — exact values pin the math; one tautological assertion; no API-default test | `tax-engine.spec.ts:976-1137`; run 85/85 |
| 5 | Regression: 85/85, tsc exit 0, syntax 27/27; LEG-2 and P0 fixes unchanged | **Pass** — commands below; backup diff shows only the CIM/split/balance block in the engine and the six new tests | `git diff --no-index tmp/leg3-backup/...`; 85/85; tsc 0; syntax 27/27 |

### What was run

- `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts` → **85 tests, 12 suites, 85 pass, 0 fail**.
- `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` → **exit 0**, no diagnostics.
- `node .tools/syntax_check.cjs` → **exit 0**, 27/27 files `ok`, including `calculations.service.ts`, `QuestionnaireView.tsx`, `TaxCalculatorView.tsx`.
- Engine probes via `tsx` stdin (no files written): 20k / 40k / 100k single parent; `isSingleParent:false`; `bothParentsSameHome` undefined; `childAllocations:5000`; 1,000 withheld; `childBenefitReceived:false`; Class 1 vs Class 1a. Values quoted above.
- Backup diff: `tmp/leg3-backup/*` vs the working files → engine +33/−6, contracts +8, calculations +9/−1, QuestionnaireView +22, TaxCalculatorView +13/−2, tests +164. No LEG-2/P0 code changed.
- Legal cross-check: [ACD CIM 2025](https://impotsdirects.public.lu/fr/az/c/cim/cim2025.html) (fetched 2026-11-08) — "Lorsque la cote d'impôt est inférieure au CIM, le montant du CIM dépassant la cote d'impôt est à restituer au contribuable"; `research/2025-2026-lu-tax-credits-and-classes.md` §2.2.

### Not verified / limits

- **API e2e not run:** `@nestjs/*`, the generated Prisma client and Postgres are absent. `tsc -p tsconfig.api.json --noEmit` fails on missing `@nestjs/common`, `@prisma/client`, `fastify` (environmental, not a diagnostic about this change). The new API default is inspected, not executed through HTTP.
- **Web not rendered or type-checked:** `apps/web/node_modules` and `@types/react` are absent; the two TSX files are syntax-checked only. The UI findings (M1, W2, W3, W5) are code inspection plus engine values, not a browser click.
- **Sticky class and dependant-only paths** are code-inspected (deterministic branches), not executed; the e2e recipe in `impl-leg3.md` §6 starts a fresh workspace and sets `childrenWithModeration: 1`, so it does not exercise them.
- **Legal order of Art. 122 relief vs the CIM** is taken from the task brief (CIM first); the report's alternative-order comparison is arithmetic-checked in W1, but the legally correct order is not independently confirmed beyond the brief and the ACD refund sentence.
- **CIM amount/formula** (3,504 / 0.0612 / 750 / 2,712) were not changed by LEG-3 and were not re-derived; the review uses the existing 2025 package and the research note.

