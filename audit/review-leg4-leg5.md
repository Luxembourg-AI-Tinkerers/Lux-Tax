# Review — LEG-4 and LEG-5 (foreign income correctness)

Date: 2026-11-08. Reviewed: `audit/impl-leg4-leg5.md`, `packages/tax-engine/src/engine.ts`, `packages/tax-engine/test/tax-engine.spec.ts`, plus the DTO/API/UI path the report claims. Baseline: `audit/audit-legal.md` §LEG-4 (`:134-156`) and §LEG-5 (`:160-188`). Read-only: no file was edited.

## 1. Conclusion

**allPass: true.** No must-fix finding. The LEG-4 double count is gone — with an independent probe, a foreign withholding changes the credit and leaves `netIncome`, `taxableIncome` and `baseTax` byte-identical; the qualifying-dividend slice is the taxable half (credit 1,399, not 2,582); `creditSlice` is subtracted exactly once. LEG-5 now refuses all four individual mode × method combinations (including FR with `foreignTax: 0`) with the Art. 3ter text in both `unsupported` and `warnings`, and collective is untouched. 103/103 tests pass, `tsc` exit 0, syntax 28/28. Three worth-considering items (test gap on the combined slice, the unbuilt per-holding cap the audit proposed, stale-snapshot throw) and four record-only observations.

## 2. Must-fix

None.

## 3. Worth considering

### W1 — No test exercises `creditForeignIncome` and `securitiesCreditIncome` together

- **Location:** `packages/tax-engine/test/tax-engine.spec.ts:1153-1192`; code under test `engine.ts:952-958`.
- **Problem:** both LEG-4 tests pass only `securities` and no `foreignIncomeItems`, so `creditForeignIncome` is 0 in every new assertion. The additive slice and the single subtraction are therefore never pinned in the one case where both accumulators are non-zero.
- **Impact:** a regression that subtracts only `creditForeignIncome` (or drops `securitiesCreditIncome` from `creditSlice`) still passes the suite, although it is exactly the "double count / double subtraction" the audit names.
- **Evidence:** own probe, DE treaty 20,000 (tax 5,000) + security 10,000 (tax 9,000): `credit = 10,696 = cote(68,955) − cote(38,955)`; the treaty-only cap would be 7,681, so the suite would not notice a slice of 20,000.
- **Fix direction:** one test with one `foreignIncomeItems` row and one foreign-taxed security, asserting the credit equals `min(totalForeignTax, cote(base) − cote(base − treatyAmount − taxableSecurity))`.

### W2 — The audit's per-holding credit cap was not built; the aggregate slice can borrow cap across items

- **Location:** `engine.ts:952-958`; disclosed in `impl-leg4-leg5.md` §6 ("The credit is still an aggregate slice, not per holding or per country").
- **Problem:** `min(foreignTaxPaid, cote(baseForCote) − cote(baseForCote − creditSlice))` caps the sum of all foreign items. A high-tax holding is credited against tax room created by a low-tax one, so the credit can exceed the Luxembourg tax on that holding's own income.
- **Impact:** probe — same case as W1: the security's 9,000 withholding receives 5,696 of credit while the marginal LU tax on its 10,000 slice is 3,900 (1,796 over the per-holding cap); the treaty item's 5,000 is fully credited either way. Over-credit in mixed portfolios, not under-credit.
- **Evidence:** `audit-legal.md:154` proposes "compute the credit as `min(foreignTax, LU tax on that holding's income)`"; the delivery keeps the aggregate method. The audit's **Acceptance** (`:156`) does not require per-holding, so this is a gap against the proposal, not against acceptance.
- **Fix direction:** cap each holding / country separately before summing, keeping the combined slice only as a secondary total cap; add a mixed high/low-tax test.

### W3 — Stale `calculationResult` makes the calculator throw before it can show the LEG-5 banner

- **Location:** `apps/web/src/components/TaxCalculatorView.tsx:80` (`calc.unsupported.length`), `:451` (`calc.warnings.length`); `apps/api/src/modules/calculations/calculations.service.ts:263` returns `workspace.calculationResult` verbatim.
- **Problem:** both keys are new in this batch (the HEAD version of the view has neither block and the HEAD `TaxCalculationResultDto` has no `unsupported`). A result persisted before the batch has no `unsupported`/`warnings` key, and the first paint dereferences `.length` on `undefined`.
- **Impact:** the calculator page throws and renders nothing for such a workspace until the household recalculates — the new Art. 3ter warning is exactly what disappears. New calculations are unaffected.
- **Evidence:** `git show HEAD:apps/web/src/components/TaxCalculatorView.tsx` matches neither `unsupported` nor `warnings`; `git show HEAD:packages/contracts/src/tax.ts` has `warnings` but no `unsupported`. `impl-leg4-leg5.md` §6 says old snapshots "still lack the new `unsupported` entry"; in fact they lack the key.
- **Fix direction:** `(calc.unsupported ?? [])` and `(calc.warnings ?? [])`, as the neighbouring `childRelief`/`cimApplied` rows already do.

## 4. Record only

- The mobile estimate screen (`apps/mobile/app/(tabs)/estimate.tsx`) renders neither `warnings` nor `unsupported`; the LEG-5 refusal is invisible there (the pre-existing foreign-credit warning already was).
- A plain `FOREIGN_INCOME` fact (`apps/web/src/components/FactsView.tsx:35` → `engine.ts:233-234`) is taxed in the base with no treaty relief and triggers neither the credit nor the new Art. 3ter entry in any mode. Pre-existing and outside the itemised `foreignIncomeItems` model the audit targets; not a LEG-4/5 regression, but it is a separate silent-foreign-income path if the product keeps that fact type.
- `LIR-ART-13-134bis` provenance (`engine.ts:336-349`) still reports `outputAmount = creditForeignIncome` (treaty-only) while `inputs.foreignTaxPaid` now includes securities withholding; the securities slice is on `LIR-ART-97-115-15a-RELIBI` (`:496`). Cosmetic reconciliation gap.
- `capitalAfterTranche` (`engine.ts:523`) is still not applied to the base, so `creditSlice` can include up to 1,500/3,000 of Art. 115 n° 15-exempt capital. Pre-existing and disclosed (§6).

## 5. Review scope and not covered

**Claims checked (id, verdict, evidence).**

| Id | Claim | Verdict | Evidence |
|---|---|---|---|
| LEG-4.1 | Securities income enters the base once; `creditForeignIncome` never receives the gross; `securitiesCreditIncome` is the taxable amount and is not in `netIncome` | PASS | `engine.ts:315-321, 474-483, 575, 781`; repo-wide grep: `securitiesCreditIncome` only at `:320,481,496,952`; probe: gross 10,000 ± `foreignTax` 1,500 → `netIncome` 50,000 both, `taxableIncome` 48,955, `baseTax` 6,974 |
| LEG-4.2 | `creditSlice` drives both the gate and the single `baseForCote − creditSlice` subtraction | PASS | `engine.ts:952-958` (one subtraction); probe: credit 10,696 = `cote(68,955) − cote(38,955)`, not the treaty-only 7,681 |
| LEG-4.3 | Tests: 10,000 ± tax, qualifying half, credit plausible | PASS | `spec.ts:1153-1192`; probe credit 0 vs 1,500 (≤ 1,500) and 1,399 for the 5,000-tax qualifying case (gross cap would be 2,582) |
| LEG-5.1 | Non-collective + any foreign item → `unsupported` + warning; collective does not | PASS | `engine.ts:502-517`; probe matrix: DE/FR × PURE/REALLOCATION → 1 entry each, COLLECTIVE → 0 |
| LEG-5.2 | Entry names the limitation; legacy warning preserved | PASS | `engine.ts:513-516` text; `:1061-1064` legacy warning still fires (DE individual shows 2 warnings, FR 1) |
| LEG-5.3 | DE (credit) and FR (exemption, tax 0) under both individual modes + collective negative | PASS | `spec.ts:1195-1247`, 5 tests, exact-message assertions |
| REG-1 | 103/103 tests, tsc exit 0, syntax 28/28 | PASS | ran this session: 103 pass / 0 fail / 0 skipped, 16 suites; `tsc -p tsconfig.test.json` exit 0; `syntax_check.cjs` 28 × `ok` |
| REG-2 | LEG-2/LEG-3/P0 fixes unchanged | PASS (behavioural) | LEG-1/LEG-2/LEG-3 suites green, exact values (752.85, 15,306.35, 922.50, 560, 0 at 76,600, −2,754.04) unchanged; the working tree is one uncommitted batch, so no isolated diff exists |
| REG-3 | No other `creditForeignIncome` consumer misses the securities slice | PASS | repo-wide grep: only `engine.ts` reads it (`:332,344,348,575,949-952`); no API/UI/filing consumer; `packages/contracts/src/tax.ts:222` exposes only the finished `foreignTaxCredit` |

**Commands run.** `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test` over the five named specs; `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json`; `node .tools/syntax_check.cjs`; throwaway probes under `tmp/` (deleted after use) exercising the engine directly.

**Not covered.** API e2e (no `@nestjs/*`, Prisma client or Postgres); browser render of the banner/warning (no React runtime), so the UI claims are code inspection only; `tsc -p tsconfig.api.json`; mobile app; the "before" column of `impl-leg4-leg5.md` §3 is not reproducible from HEAD because the HEAD engine has no securities ledger or capital module at all — the audit's own reproduction (`audit-legal.md:148-151`) was used as the pre-fix reference instead; no pre-batch database snapshot was available, so W3 is conditional on such rows existing.
