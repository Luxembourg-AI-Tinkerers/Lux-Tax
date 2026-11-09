# Implementation report — LEG-4 and LEG-5 (foreign income correctness)

Date: 2026-11-08. Scope: `audit/audit-legal.md` §LEG-4 (P1, foreign-taxed securities double-counted) and §LEG-5 (P1, Art. 3ter individual assessment silently drops foreign relief). Nothing from LEG-1/2/3 was reverted; no docs were edited.

Files: `packages/tax-engine/src/engine.ts`, `packages/tax-engine/test/tax-engine.spec.ts`.

## 1. Rules as implemented

### LEG-4 — two accumulators instead of one

| Quantity | Before | After |
|---|---|---|
| Securities income in the taxable base | `primaryCapital += round2(taxable)` (`taxable = 50 % of a qualifying dividend, else gross`) | unchanged |
| Credit-method treaty income (added to `netIncome`) | `creditForeignIncome += gross` for every holding with `foreignTax > 0` | never receives securities income |
| New accumulator | — | `securitiesCreditIncome += round2(taxable)` for every holding with `foreignTax > 0`; **not** added to `netIncome` |
| Foreign tax pool | `foreignTaxPaid += holding.foreignTax` | unchanged |
| `netIncome` | `primaryNet + spouseNet + creditForeignIncome` | unchanged formula, but `creditForeignIncome` no longer carries the securities gross |
| Credit slice (collective branch) | `creditForeignIncome` | `const creditSlice = addMoney(creditForeignIncome, securitiesCreditIncome);` |
| Credit | `min(foreignTaxPaid, cote(baseForCote) − cote(baseForCote − creditForeignIncome))`, computed when `creditForeignIncome > 0 && foreignTaxPaid > 0` | `min(foreignTaxPaid, cote(baseForCote) − cote(baseForCote − creditSlice))`, computed when `creditSlice > 0 && foreignTaxPaid > 0` |
| Provenance `LIR-ART-97-115-15a-RELIBI` inputs | `holdings`, `relibiFinalExcluded`, `relibiFinalElective` | + `securitiesCreditIncome` |

The credit is unchanged in value where the foreign tax was already below the cap (see §3); what changed is the base, which no longer contains the income twice.

### LEG-5 — refusal entry for foreign income under Art. 3ter

Pushed once, after the treaty breakdown **and** after the securities ledger (so it also covers a withholding carried by a security, whose `foreignTaxPaid` is only known there):

```
if (assessmentMode !== 'COLLECTIVE' &&
    (hasForeignItems || foreignTaxPaid > 0 || exemptForeignIncome > 0)) {
  unsupported.push(msg); warnings.push(msg);
}
```

with `msg` = `Foreign income under Art. 3ter individual assessment (pure or reallocation) is not supported: the per-spouse ordinary credit and exemption-with-progression are not modelled. Use collective assessment or obtain a professional review.`

`unsupported` is rendered by the red banner (`TaxCalculatorView.tsx:79-90`, map at `:84`), `warnings` by the amber list (`:451-457`, map at `:453`); the API returns the engine result verbatim (`calculations.service.ts`), so both reach the UI. The pre-existing warning `foreignTaxPaid > 0 && foreignTaxCreditComputed === 0 && assessmentMode !== 'COLLECTIVE'` is kept, per the brief; an individual-mode household with a foreign tax therefore sees two warnings (legacy one + the new one) and one `unsupported` entry.

No arithmetic in the individual branches was changed: making an unsupported case visible is the fix, not computing it.

## 2. Files changed

| File | Change |
|---|---|
| `packages/tax-engine/src/engine.ts` | (a) new `let securitiesCreditIncome = 0;` beside `creditForeignIncome`; (b) securities ledger now adds `round2(taxable)` to `securitiesCreditIncome` instead of the gross to `creditForeignIncome`; (c) `securitiesCreditIncome` added to the `LIR-ART-97-115-15a-RELIBI` provenance inputs; (d) collective branch: `creditSlice = addMoney(creditForeignIncome, securitiesCreditIncome)`, used both as the gate and as the amount removed from `baseForCote` for `luTaxOnForeign`; (e) new Art. 3ter foreign-relief block (13 lines) after the securities ledger, before the Art. 115 n° 15 tranche. |
| `packages/tax-engine/test/tax-engine.spec.ts` | Two new `describe` blocks, 7 tests (§4). No existing test was edited. |

Rollback: revert (a)–(e) in `engine.ts` (restore `creditForeignIncome = addMoney(creditForeignIncome, gross)` in the securities loop, drop the `creditSlice` constant, drop the new block) and delete the two `describe` blocks at the end of the spec file. `git` cannot isolate this change (the whole batch is uncommitted in the working tree), so the reverse patch is described rather than stashed.

## 3. Before / after values

### LEG-4 — 2025, resident, Class 1, salary 40,000, one security gross 10,000, no withholding

"Before" = the pre-fix formula evaluated on the same inputs: `netIncome = 50,000 + gross`, `taxable = netIncome − 1,045` (the salary-only deductions, unchanged by capital), `baseTax = floorEuroToCote(baseTax(taxable, 'CLASS_1', pkg2025))`, credit cap on the gross slice. "After" = read from the engine.

| Security | before netIncome | before taxable | before baseTax | before credit | after netIncome | after taxable | after baseTax | after credit |
|---|---|---|---|---|---|---|---|---|
| gross 10,000 | 50,000 | 48,955 | 6,974 | 0 | 50,000 | 48,955 | 6,974 | 0 |
| gross 10,000, `foreignTax: 1,500` | **60,000** | 58,955 | 10,755 | 1,500 | **50,000** | 48,955 | 6,974 | 1,500 |
| gross 10,000, qualifying dividend | 45,000 | 43,955 | 5,358 | 0 | 45,000 | 43,955 | 5,358 | 0 |
| gross 10,000, qualifying, `foreignTax: 5,000` | **55,000** | 53,955 | 8,806 | **3,448** | **45,000** | 43,955 | 5,358 | **1,399** |

Final liability on the second row: **8,842.51 before → 4,796.84 after** (`totalTaxBeforeCredits` 11,507.85 → 7,462.18; the credits are unchanged at 2,665.34 — CIS 600, CISSM 373.34, CI-CO2 192, foreign 1,500 — because the cap on the smaller slice, 3,781, still exceeds the 1,500 withheld). The credit alone is therefore an unreliable symptom: it was already correct while the base, the RIA-driven child relief and every deduction cap fed by `netIncome` were wrong. The fourth row is the qualifying-dividend control: the credit drops from 3,448 (cap on the 10,000 gross) to 1,399 (cap on the 5,000 taxable half), i.e. the slice now follows the base.

### LEG-5 — 2025, married 60,000 + 40,000, one foreign item of 20,000

Arithmetic is identical before and after (the change adds no computation); only `unsupported` / `warnings` move.

| Mode | Country | netIncome | taxable | baseTax | foreignTaxCredit | unsupported | warnings before → after |
|---|---|---|---|---|---|---|---|
| COLLECTIVE | DE, tax 5,000 | 120,000 | 117,960 | 21,529 | 5,000 | 0 | 0 → 0 |
| COLLECTIVE | FR, tax 0 | 100,000 | 97,960 | 17,878.78 | 0 | 0 | 0 → 0 |
| INDIVIDUAL_PURE | DE, tax 5,000 | 120,000 | 118,440 | 14,941 | 0 | 0 → **1** | 1 → 2 |
| INDIVIDUAL_PURE | FR, tax 0 | 100,000 | 98,440 | 14,857 | 0 | **0 → 1** | **0 → 1** |
| INDIVIDUAL_REALLOCATION | DE, tax 5,000 | 120,000 | 117,960 | 21,510 | 0 | 0 → **1** | 1 → 2 |
| INDIVIDUAL_REALLOCATION | FR, tax 0 | 100,000 | 97,960 | 13,948 | 0 | **0 → 1** | **0 → 1** |

The FR rows are the reported defect: `baseTax` 14,857 (pure) / 13,948 (reallocation) against 17,878.78 collective, and before the fix nothing at all was said about it. These figures reproduce the audit's table (17,878.78 / 14,857) exactly.

## 4. Tests added (7)

`describe('Foreign-taxed securities are not double-counted (LEG-4)')`:

1. `a foreign withholding changes the credit, never the declared income` — gross 10,000 with `foreignTax: 0` vs `1,500`: `netIncome` both 50,000 and equal to each other, `taxableIncome` and `baseTax` equal, credit 0 vs > 0 and ≤ 1,500.
2. `a qualifying dividend feeds the credit slice with the taxable half only` — gross 10,000 `qualifyingDividend: true`: `netIncome` 45,000 with and without a 5,000 withholding; provenance `securitiesCreditIncome` = 5,000; credit equals `cote(taxable) − cote(taxable − 5,000)` and is strictly below the gross-based cap `cote(taxable) − cote(taxable − 10,000)` (1,399 vs 2,582 on these inputs).

`describe('Art. 3ter individual assessment drops foreign relief (LEG-5)')`, exact-message assertions on `unsupported.includes(...)` and `warnings.includes(...)`:

3. DE 20,000 / tax 5,000 under `INDIVIDUAL_PURE` — entry present, credit 0.
4. FR 20,000 / tax 0 under `INDIVIDUAL_PURE` — entry present (the silent case), credit 0.
5. DE 20,000 / tax 5,000 under `INDIVIDUAL_REALLOCATION` — entry present, credit 0.
6. FR 20,000 / tax 0 under `INDIVIDUAL_REALLOCATION` — entry present, credit 0.
7. `collective assessment keeps computing the credit and raises no Art. 3ter gap` — DE 20,000: no entry, credit > 0 and ≤ 5,000.

## 5. Verification

| Check | Command | Result |
|---|---|---|
| Engine + API unit suites | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts apps/api/test/class-resolution.spec.ts` | **103 tests, 16 suites, 103 pass, 0 fail** (baseline 96; the 7 new tests are listed as passing) |
| Type check | `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` | **exit 0**, no diagnostics |
| Syntax / transpile | `node .tools/syntax_check.cjs` | **exit 0**, 28/28 files `ok` |
| Scenario probe | `tsx --tsconfig tsconfig.test.json <probe>` (two throwaway scripts, deleted) | produced every figure in §3; the "before" column is the pre-fix formula evaluated with the package's own `baseTax` / `floorEuroToCote` |

## 6. Not verified

- **API e2e not run** — `@nestjs/*`, the generated Prisma client and Postgres are absent, as the brief states. No e2e was added for either item.
- **UI not rendered.** The banner wiring was read, not clicked: `TaxCalculatorView.tsx:84` maps `calc.unsupported` and `:453` maps `calc.warnings`; `calculations.service.ts` returns the engine result unchanged and only logs `unsupported` into the audit event. There is no component test for the view.
- **No snapshot migration.** A `TaxYearWorkspace.calculationResult` persisted before this change still carries the inflated `netIncome` for foreign-taxed securities and still lacks the new `unsupported` entry; `getLatestCalculation` returns it verbatim until the household recalculates. Out of scope, no backfill.
- **The credit is still an aggregate slice, not per holding or per country.** `min(foreignTaxPaid, LU tax on creditSlice)` lets a high-tax holding borrow cap from a low-tax one, and the exemption-with-progression path shares the same `baseForCote`. LEG-4 removes the double count; a per-item cap (the audit's "LU tax on that holding's income") was not built.
- **Art. 115 n° 15 tranche still not applied to the base.** `capitalAfterTranche` is computed but only used as the `LIR-ART-115-15a` provenance output; `toPersonIncome` receives `primaryCapital`. So `creditSlice` can include up to 1,500 (3,000 collective) of capital that the tranche nominally exempts. Pre-existing and untouched, but it means the credit cap is slightly generous at low capital amounts.
- **RELIBI-final holdings** with a foreign withholding remain excluded from the base *and* uncredited (the `continue` runs before the credit block). Unchanged.
- **Individual modes remain numerically incomplete** for foreign income: no per-spouse ordinary credit and no progression. The entry refuses the scenario; it does not fix it.
- **`packages/tax-engine/src/engine.ts` is inside `tsconfig.test.json`** (clean `tsc` covers it), but `apps/api/src/modules/calculations/calculations.service.ts` is not, so its pass-through of `unsupported` / `warnings` was inspected and syntax-checked, not compiled by `tsc`.

## 7. Decisions and observations

1. **The Art. 3ter entry sits after the securities ledger, not directly under the treaty block.** The brief said "after the treaty breakdown is computed"; placing it two blocks lower keeps that ordering and additionally covers a foreign withholding declared on a security, whose `foreignTaxPaid` contribution is only accumulated there. With a treaty item the behaviour is identical to the literal placement.
2. **Same string in `unsupported` and `warnings`.** The brief asks for both "the same substance"; one constant is used so the two can never diverge, and the tests pin the exact text the brief specified.
3. **The legacy individual-mode warning was kept as-is**, so a foreign tax under an individual mode now yields two warnings. Intentional per the brief; if the duplication is unwanted later, delete the legacy `if` and keep the new entry, which covers a superset of its cases.
4. **`creditSlice` replaces `creditForeignIncome` in the gate as well as in the subtraction.** Without that, a securities-only case (treaty credit income 0) would never enter the credit block at all — the accumulator split would have silently disabled the credit it was meant to preserve.
