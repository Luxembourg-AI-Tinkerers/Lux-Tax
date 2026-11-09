# Implementation report — LEG-3 (CIM reachability and refundability, Art. 154ter)

Date: 2026-11-08. Scope: `audit/audit-legal.md` §LEG-3 only (P0-4 "CIM 2025"). Nothing from LEG-1, LEG-2, LEG-4+ was touched.
Inputs read first: `audit/audit-legal.md:106-130`; `research/2025-2026-lu-tax-credits-and-classes.md:86-121` (§2.2 CIM, §2.3 A/B).

## 1. Rules as implemented

| Rule | Input | Formula |
|---|---|---|
| CIM amount (unchanged) | RIA (taxable rounded down to 50), allocations | `cimFor(ria, allocations, pkg)` — 3,504 at RIA ≤ 60,000, linear 0.0612 down to 750 at 105,000, 750 above, minus 50 % of allocations above 2,712 |
| CIM gate (engine, unchanged) | Class 1a · `isSingleParent` · `childrenWithModeration ≥ 1` · `!bothParentsSameHome` | all four must hold |
| Non-refundable credits | `credits.total`, `credits.cim` | `nonRefundableCredits = round2(credits.total − credits.cim)` |
| Tax left for the CIM | `totalTaxBeforeCredits` | `taxAfterNonRefundable = max(0, round2(totalTaxBeforeCredits − nonRefundableCredits))` |
| CIM imputed | CIM, tax left | `cimApplied = min(credits.cim, taxAfterNonRefundable)` |
| CIM paid out (Art. 154ter al. 2) | CIM, applied | `cimRefund = round2(max(0, credits.cim − cimApplied))` |
| Child-relief base (ordering unchanged) | — | `taxAfterCredits = max(0, round2(taxAfterNonRefundable − cimApplied))` |
| Final liability | — | `finalTaxLiability = max(0, round2(taxAfterCredits − childReliefTotal))` |
| Balance | — | `balancePayableOrRefund = round2(finalTaxLiability − withheld − cimRefund)` |

Consequences that matter:

- **No CIM → nothing moves.** `nonRefundableCredits = credits.total`, `taxAfterNonRefundable` is the old `taxAfterCredits`, `cimApplied = 0`. All 79 pre-existing tests pass without an edit.
- **`totalTaxCredits` stays `credits.total`** and `credits.cim` keeps the statutory amount; the change adds the split, it does not reduce the credit.
- **The refund is paid, not netted against tax.** `cimRefund > 0` implies `finalTaxLiability = 0` by construction (`cimApplied` already covered everything the tax could absorb), so subtracting it from the balance can only deepen a refund.
- **Provenance** `LIR-ART-154ter-refund` ("CIM refundable portion paid out (Art. 154ter al. 2)") is pushed only when `cimRefund > 0`, with `cim`, `cimApplied`, `cimRefund`, `taxAfterNonRefundable` as inputs. The `LIR-ART-154` reconciliation entry now fires on `withheld > 0 || cimRefund > 0` and names the refund as a third term (`finalTaxLiability − taxWithheldAtSource − cimRefund`) — otherwise the trace would no longer add up to the balance.

## 2. Files changed

| File | Change |
|---|---|
| `packages/tax-engine/src/engine.ts` | `credits` literal gains `cimApplied: 0` / `cimRefund: 0`; new imputation block (6 lines + refund provenance) between the credit-sum provenance and the child relief; `taxAfterCredits` now derived from `taxAfterNonRefundable − cimApplied`; `balancePayableOrRefund` subtracts `cimRefund`; `LIR-ART-154` description/formula/inputs/gate updated. `credits.cimApplied` / `credits.cimRefund` assigned from the local computation. |
| `packages/contracts/src/tax.ts` | `CreditBreakdownDto`: `cimApplied` ("part of the CIM actually imputed against the tax due") and `cimRefund` ("excess paid back — refundable under Art. 154ter al. 2; increases a refund and never reduces an amount payable"), both with JSDoc, between `cim` and `total`. |
| `apps/api/src/modules/calculations/calculations.service.ts` | `isSingleParent` default now `answers.isSingleParent ?? ((SINGLE \|\| DIVORCED \|\| WIDOWED) && childrenWithModeration > 0)`. An explicit `false` still wins (`??`, not `||`). Comment cites Art. 154ter. |
| `apps/web/src/components/QuestionnaireView.tsx` | New checkbox directly above `bothParentsSameHome`: label "Single parent (CIM, Art. 154ter)", helper line "A single, divorced or widowed parent with a moderated child; blocked when both parents share the child's home." Bound to `answers.isSingleParent`; `checked` falls back to the same marital-status + moderated-child derivation the API uses, so a stored explicit `false` is shown as unchecked and never overridden. |
| `apps/web/src/components/TaxCalculatorView.tsx` | CIM row renamed `CIM applied (single parent)` and now prints `credits.cimApplied`; new `CIM refunded (Art. 154ter)` row rendered only when `credits.cimRefund > 0`, printed as `+€…` in emerald with the note "Refundable excess paid out — increases your refund". `cimApplied` reads `?? 0` so a pre-LEG-3 stored snapshot renders 0.00 instead of throwing. |
| `packages/tax-engine/test/tax-engine.spec.ts` | New `describe('CIM reachability and refundability — Art. 154ter al. 2 (LEG-3)')` with 6 tests (§4). |

Not changed: `credits.ts` (`cimFor`, `cim` rule package), the CIM gate inside the engine, `filing.service.ts` (form 100 still reports the statutory `credits.cim`), `questionnaire.schema.ts` (already accepted `isSingleParent`), `packages/contracts/src/questionnaire.ts` (field already declared).

## 3. Before / after values

2025 package, resident, no withholding unless stated. "Before" is the previous formula `finalTaxLiability = max(0, totalTaxBeforeCredits − credits.total)` evaluated on the same inputs; "after" is read from the engine now (`tmp/leg3-probe.ts` reproduces this table in one command).

| Case | taxable | before credits | credits.total | cim | cimApplied | cimRefund | childRelief | final / balance before | final / balance after |
|---|---|---|---|---|---|---|---|---|---|
| 1a, 20,000, 1 moderated child, single parent | 18,980 | 0 | 4,296 | 3,504 | 0 | 3,504 | 0 | 0 / **0** | 0 / **−3,504** |
| 1a, 40,000, 1 moderated child, single parent | 38,980 | 1,915.30 | 4,669.34 | 3,504 | 749.96 | 2,754.04 | 0 | 0 / **0** | 0 / **−2,754.04** |
| 1a, 100,000, 1 moderated child, single parent | 98,980 | 25,715.31 | 1,120.26 | 1,120.26 | 1,120.26 | 0 | 0 | 24,595.05 / 24,595.05 | 24,595.05 / 24,595.05 |
| 1a, 40,000, `isSingleParent: false` | 38,980 | 1,915.30 | 1,165.34 | 0 | 0 | 0 | 0 | 749.96 / 749.96 | 749.96 / 749.96 |
| 1a, 20,000, 1,000 withheld | 18,980 | 0 | 4,296 | 3,504 | 0 | 3,504 | 0 | 0 / **−1,000** | 0 / **−4,504** |
| 1a, 40,000, single parent, `childBenefitReceived: false` | 38,980 | 1,915.30 | 4,669.34 | 3,504 | 749.96 | 2,754.04 | 0 | 0 / **0** | 0 / **−2,754.04** |

Reading the first two rows: the €3,504 (and €2,754.04) simply disappeared before; after the fix they are the taxpayer's refund. Row 3 is the control — when the tax exceeds the CIM, nothing changes. Row 4 is the control for the gate — with `isSingleParent: false` the figures are identical to the pre-change engine, i.e. the refund path is not reachable without the flag.

Reachability (the other half of LEG-3): before, `calculations.service.ts` derived `isSingleParent` only for `maritalStatus === 'SINGLE'`, so a DIVORCED parent (Class 1a because of the moderated child) or a WIDOWED parent (Class 1a unconditionally) always reached the engine with `false` and could never obtain the CIM through the normal UI flow — only a hand-crafted payload with the flag set could. The default now covers all three statuses; `bothParentsSameHome` still vetoes inside the engine (`CIM not granted: both parents share the same home as the child (Art. 154ter).`) and can also be unticked in the questionnaire.

## 4. Tests added (6)

All in `packages/tax-engine/test/tax-engine.spec.ts`, `describe('CIM reachability and refundability — Art. 154ter al. 2 (LEG-3)')`:

1. `the CIM excess over the tax due is refunded, not clipped to zero` — 1a/20,000/1 child/`isSingleParent: true`/`bothParentsSameHome: false`: `cim 3,504`, `cimApplied 0`, `cimRefund 3,504`, `final 0`, `balance < 0` and `= −3,504`, `totalTaxCredits === credits.total`, `LIR-ART-154ter-refund` present.
2. `a CIM fully covered by the tax is applied in full, with nothing refunded` — 1a/100,000: `cim 1,120.26` (3,504 − (98,950 − 60,000) × 0.0612), `cimApplied 1,120.26`, `cimRefund 0`, no refund provenance, `final = before − cim`.
3. `a partly applicable CIM is imputed up to the cote and the rest is refunded` — 1a/40,000: `cim 3,504`, `cimApplied 749.96`, `cimRefund 2,754.04`, `final 0`, `balance −2,754.04`; asserts `before − nonRefundable − cimApplied − childRelief.total === final` with `nonRefundable = credits.total − cim`, and the floored equivalent `max(0, max(0, before − nonRefundable) − cimApplied − childRelief) === final` at RIA 18,980 (where the non-refundable credits exceed the cote).
4. `the CIM gate needs the flag and the parents not sharing the home` — `isSingleParent: false` → `cim 0`, refund 0; `bothParentsSameHome: true` → `cim 0`, refund 0, warning emitted.
5. `the refundable CIM adds to the refund instead of cancelling the withholding` — 20,000 with 1,000 withheld: `balance −4,504 = final − withheld − cimRefund`.
6. `child relief is imputed only on what the CIM left, and never reduces the refund` — 40,000 + `childBenefitReceived: false`: `cimApplied 749.96`, `degrèvement 0` (the CIM already covered the 749.96 still due), `cimRefund 2,754.04`, `balance −2,754.04`.

## 5. Verification

| Check | Command | Result |
|---|---|---|
| Engine + API unit suites | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts` | **85 tests, 12 suites, 85 pass, 0 fail** (baseline before the change: 79/79; the 6 new CIM tests are listed in the output) |
| Type check | `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` | **exit 0**, no diagnostics |
| Syntax / transpile | `node .tools/syntax_check.cjs` | **exit 0**, every file `ok`, including `calculations.service.ts`, `QuestionnaireView.tsx`, `TaxCalculatorView.tsx` |
| Scenario probe | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json tmp/leg3-probe.ts` | produced the §3 table (values match the assertions) |

Rollback: pre-change copies of the six edited files are in `tmp/leg3-backup/` (byte-identical to the state before this task).

## 6. Not verified

- **API e2e not run** (`@nestjs/*`, generated Prisma client and Postgres absent), per the brief.
- **Item 7 (e2e regression in `tax-lifecycle-full.e2e-spec.ts`) was not added.** It is one linear lifecycle whose questionnaire is set to `MARRIED` in Step 3 and whose cleanup hard-codes two e-mail addresses; a DIVORCED/WIDOWED case needs a third user, a second household, a 2025 workspace, a confirmed salary fact and a questionnaire PUT — and it cannot be executed here to prove the endpoint shapes and the readiness gates. Recipe for whoever can run it: register a third user, `POST /api/households`, `GET /api/households/:id/workspaces/2025`, `POST /api/workspaces/:id/facts` + confirm with `isIncludedInReturn: true`, `PUT /api/workspaces/:id/questionnaire` with `{ maritalStatus: 'DIVORCED', childrenWithModeration: 1, bothParentsSameHome: false }` (no `isSingleParent`), `POST /api/workspaces/:id/calculations`, then assert `credits.cim > 0` and `credits.cimRefund > 0` with no withholding. Add the e-mail to `testEmails` in `cleanupTestUsers`.
- **`calculations.service.ts` is not inside `tsconfig.test.json`**, so the mapping change is verified only by `syntax_check.cjs` (transpile, 0 diagnostics) and by reading it — not by `tsc`. `childrenWithModeration` in that scope is a `number` (line 125-127), so the new expression is a plain boolean; the `??` keeps an explicit `false`.
- **`tsc -p tsconfig.api.json` not run** (excluded by the brief).
- **Web not type-checked**: `apps/web/node_modules` and `@types/react` are not installed; the two TSX files are verified by `syntax_check.cjs` only.
- **UI never rendered** in a browser: the checkbox default, the new refund row and its conditional were reviewed, not clicked. No component test exists for either view.
- **Stale snapshots**: `workspace.calculationResult` written before this change has no `cimApplied` / `cimRefund`. `getLatestCalculation` returns such a snapshot verbatim, so the calculator's first paint on an old workspace shows `CIM applied −€0.00` (the `?? 0` guard) and no refund row until the user recalculates. No backfill or recompute was added (out of scope).
- **CIM pro-rata** (whole months of assujettissement), the "married during the year" exclusion, and the per-child allocation reduction beyond the existing `childAllocations` input are unchanged and still not modelled — no new inputs were introduced.

## 7. Decisions and observations

1. **Child relief is computed after the CIM, as briefed.** Consequence, now pinned by test 6: when the CIM covers the remaining tax, the Art. 122 dégrèvement has no base left and is 0. The taxpayer is not worse off — the alternative order (relief first, then CIM) would leave less refund (2,511.20 instead of 2,754.04 at RIA 38,980) because the non-refundable relief would absorb tax that the refundable CIM can otherwise pay out. Flagged rather than changed.
2. **`?? 0` on `credits.cimApplied` in the UI** is the only defensive addition; it mirrors the file's existing `calc.rental?.net ?? 0` style and prevents a pre-LEG-3 snapshot from throwing during render.
3. **The "Tax Credits (CIS/CIM)" summary card still shows `totalTaxCredits`** as a negative amount with the subtitle "Credited against base tax". When part of the CIM is refunded, that card overstates what was credited; the breakdown rows beneath it are correct. Left untouched because the brief scopes the UI change to the CIM row; the card's wording is the follow-up.
4. **`filing.service.ts` keeps reporting `credits.cim`** (statutory amount) on the form 100 sheet. The CIM claimed on the return is the statutory credit, so no change was made.
5. **`resolveTaxClass` falls back to `workspace.taxProfile?.maritalStatus` when the questionnaire has none, while the new `isSingleParent` default reads `answers.maritalStatus` only** (as briefed, verbatim). A workspace with a marital status only in the tax profile would therefore get Class 1a without the CIM default; the explicit questionnaire checkbox now closes that gap for real users. Single-line follow-up if wanted: derive both from the same resolved status.

## 8. Review fixes (M1, M2)

Both must-fix findings of `audit/review-leg3.md` §2 are addressed. No other consumer of the DTO was touched.

**M1 — the card no longer double-counts the refund.** `TaxCalculatorView.tsx` renders `totalTaxCredits - (credits.cimRefund ?? 0)`, i.e. the credit actually applied against the base tax, with the subtitle "Credited against base tax; the refundable CIM excess is paid out separately". The detail rows are unchanged; `credits.total` and `totalTaxCredits` stay statutory. JSDoc added on `TaxCalculationResultDto.totalTaxCredits` (`packages/contracts/src/tax.ts`) recording that convention and the subtraction. Card values at the review's scenarios: 40,000 -> 1,915.30 (= `totalTaxBeforeCredits`; applied 749.96 + non-CIM 1,165.34), 20,000 -> 792.00 with 3,504.00 refunded; card + refund = `totalTaxCredits` in both.

**M2 — one resolved household situation per calculation.** `calculations.service.ts` now computes `maritalStatus` (tax profile ?? questionnaire) and `childrenWithModeration` (answer ?? `childrenCount` ?? household dependants) once, before the class, and passes both into `deriveTaxClass`; `isSingleParent` uses the same pair through `deriveIsSingleParent`. The class switch moved to the dependency-free `apps/api/src/modules/calculations/class-resolution.ts` (imports only `TaxClass` from contracts). A stored `workspace.taxClass` is passed only when the workspace has no tax profile: with a questionnaire the class is re-derived, because `calculateTax` persists the resolved class after every run and that persisted value is not an explicit override (commented in place). Questionnaire helper text now reads "Automatic for a single, divorced or widowed parent with a moderated child; tick only to force it on or off"; the `checked` fallback already matched the brief and still respects a stored `false`.

**Tests.** `apps/api/test/class-resolution.spec.ts` (node:test/assert, 11 cases): single-parent default for SINGLE/DIVORCED/WIDOWED with a child, explicit `false`, MARRIED/PACS, no child; classes SINGLE+child -> 1A, DIVORCED+0 -> 1, WIDOWED -> 1A, MARRIED -> 2, PACS+COLLECTIVE -> 2, an explicit workspace class wins, `Partial<QuestionnaireAnswersDto>` accepted as-is. Both new files added to `tsconfig.test.json`; the module also to `syntax_check.cjs`.

**Verification.** `tsx --test` over the four prior suites plus the new one -> 96 tests, 14 suites, 96 pass, 0 fail (was 85). `tsc -p tsconfig.test.json` -> exit 0. `syntax_check.cjs` -> exit 0, 28/28 `ok`. Still not executed: API e2e (no `@nestjs/*`/Prisma/Postgres) and web rendering; `calculations.service.ts` sits outside `tsconfig.test.json`, so its wiring is syntax-checked and inspected, not compiled by `tsc`.