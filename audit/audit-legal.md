# Legal / engine audit — Luxembourg resident tax app

**Date:** 8 November 2026
**Scope:** `packages/tax-engine` (engine, credits, deductions, money, scale, rules), `packages/contracts/src/tax.ts`, `packages/validation/src/questionnaire.schema.ts`, `apps/api/src/modules/calculations/calculations.service.ts`, `apps/web/src/components/{TaxCalculatorView,QuestionnaireView}.tsx`, and the filing service where it carries the Form 100 / certificate 160 claims.
**Requirement baseline:** `luxembourg-tax-resident-gap-analysis.md` §4.1 (P0-1…P0-11), §4.2 (P1-1…P1-10), §4.3, §8; `docs/luxembourg-resident-tax-optimisation-checklist-2025-2026.md` §11 and the sections it cites; `research/2025-2026-lu-tax-credits-and-classes.md` §2.3; `docs/lir-118-121-bareme-2025-2026.md`; `implementation-tracker.md`; `gap-check-2026-11-08.md`.
**Method:** read the requirement documents, then every engine/API/UI path named above; every suspect was reproduced by executing the engine through `.tools/node_modules/tsx` with stdin scripts (no files written). Claims in `implementation-tracker.md` and `gap-check-2026-11-08.md` were treated as claims, not facts.

---

## 1. Summary

The 48-test green baseline is real but does not cover the return: the engine's tariff (`baseTax`) is ACD-conformant, while the **final liability is not**. Three defects dominate:

1. **The solidarity surcharge is computed in cents and added as euros** (`engine.ts:929`). Every non-3ter return reports the surcharge 100× too large: a €60,000 salary reports €85,644 instead of €11,111.85.
2. **Art. 122 dégrèvement and Art. 123bis bonification (€922.50/child) have no code path.** `childrenWithModeration` is only a cap multiplier and a gate; a two-child family with no cap-sensitive deductions pays exactly the same tax as a childless one.
3. **Foreign-taxed securities income is counted twice** in the base, and **Art. 3ter individual assessment** zeroes the foreign credit (with a warning) and silently drops exemption-with-progression (no warning).

Secondary: CIM is unreachable for divorced/widowed parents and is never refunded; the Art. 119 n° 3 b–c three-year Class 2 window is absent; the certificate 160 / Form 100F maps are partial; there is no Class 2 vs 2×Class 1 comparison; 2028 is a documented preview that can still produce a filing package; prime jeune salarié is genuinely out of the first-release P0/P1 scope.

**Overall confidence: high.** Every finding below was reproduced by execution, or pinned to a `file:line` (or a zero-match grep) that shows the absence.

---

## 2. Checks run

| Check | Command | Result |
|---|---|---|
| Engine + annex PDF suites | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts` | **48 / 48 pass** |
| Strict typecheck | `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` | exit **0** |
| JSX/TS syntax | `node .tools/syntax_check.cjs` | **9 / 9 ok**, exit 0 |
| Engine probes (stdin, not persisted) | five `tsx -` scripts: child credit, CIM, foreign credit under 3 modes, treaty methods, securities WHT, surcharge | outputs quoted in each finding |
| Coverage grep | `finalTaxLiability|solidarity|balancePayable` in `tax-engine.spec.ts` | **0 matches** (13 assertions on `baseTax` only) |
| Absence greps | `922.5|922,50|922.50`, `prime jeune`, `13d`, `scenario` across `packages/*` and `apps/*`; `three year|3 ans|119 n°` in the class paths | no implementation match (only doc comments and the 8775 source string) |

The green suite is therefore consistent with a 100× error in the headline number: the tests assert the tariff function, never the return.

---

## 3. Findings

### LEG-1 — Solidarity surcharge (contribution au fonds pour l'emploi) is 100× too large on every ordinary return

- **Status:** incorrect
- **Priority:** P0
- **Requirement:** `docs/lir-118-121-bareme-2025-2026.md` Finding 5 (7 % / 9 %, whole cote); `luxembourg-tax-resident-gap-analysis.md` §1.4.

**Evidence**

- `packages/tax-engine/src/engine.ts:929`:
  `solidarityAmount = round2(mulRate(toCents(taxCote), fondsRateFor(ordinaryTaxable)));`
- `packages/tax-engine/src/money.ts:17-21` — `mulRate` is documented and implemented as *cents → cents*:
  `/** Multiply a cent amount by a rate, rounding half-up to the cent. */`
  `return Math.round(cents * rate);`
- The two individual-assessment branches do divide by 100 — `engine.ts:855-856` and `engine.ts:886-887`:
  `mulRate(toCents(primaryCote), fondsRateFor(primaryTaxable)) / 100 + …`
  Only the collective path (line 929, used by Class 1, 1a, 2 and the 2028 package) omits it.
- The inflated value is then added as euros at `engine.ts:957`:
  `const totalTaxBeforeCredits = round2(taxCote + solidarityAmount);`
- No test catches it: grep for `finalTaxLiability|solidarity|balancePayable` in `packages/tax-engine/test/tax-engine.spec.ts` returns **0 matches**; the 13 golden assertions call `baseTax` directly, e.g. `tax-engine.spec.ts:35` `close(floorEuroToCote(baseTax(50_000, 'CLASS_1', pkg2025)), 7_341);` and `:39` for Class 2 €14,682.

**Reproduced (2025, resident, default forfaits included)**

| Case | `baseTax` | Surcharge reported | Correct 7 % | Final reported | Correct final |
|---|---|---|---|---|---|
| Class 1, gross €60,000 | 10,755.00 | **75,285.00** | 752.85 | **85,644.00** | **11,111.85** |
| Class 1, gross €50,000 | 6,974.00 | **48,818.00** | 488.18 | **55,198.00** | **6,868.18** |
| Class 2, gross €100,000 | 14,305.00 | **100,135.00** | 1,001.35 | **114,440.00** | **15,306.35** |

(The 50k/60k cases include the €540 FFO and €480 FDS, hence `taxableIncome` 48,980 / 58,980 and credits €594 / €396. The Class 2 case has no credits above €80,000.)

**User-visible and persisted.** The hero banner renders `balancePayableOrRefund` (`TaxCalculatorView.tsx:143`) and the surcharge line prints `{(calc.solidaritySurchargeRate * 100).toFixed(0)}% (€{calc.solidaritySurchargeAmount.toFixed(2)})` (`TaxCalculatorView.tsx:164-167`). `calculations.service.ts:238-239` persists `finalTaxLiability` and `balance` into the workspace and the audit log, so every stored calculation is wrong.

**Proposal.** Divide by 100 (or introduce a euro-returning `mulRateEuros`); add assertions on `solidaritySurchargeAmount`, `totalTaxBeforeCredits` and `balancePayableOrRefund` for Class 1 €50,000, Class 2 €100,000 and Class 1a €26,460, plus a boundary test at €150,000/€150,050 (Class 1) and €300,000/€300,050 (Class 2).

**Acceptance.** Class 1 gross €60,000 → surcharge €752.85, final €11,111.85; Class 2 €100,000 → final €15,306.35; deleting the `/100` makes the suite fail.

---

### LEG-2 — Art. 122 dégrèvement and Art. 123bis bonification (€922.50/child) are not computed anywhere

- **Status:** missing
- **Priority:** P1 (P1-8 in §4.2; also §3 matrix row “Modération / bonification”)
- **Requirement:** `luxembourg-tax-resident-gap-analysis.md:347` (“Dégrèvement **€922.50/child, not refundable** … Bonification after modération expires, same €922.50 cap, phase-out `(76 600 − RIA)/10` between €67,400 and €76,600”), `:689` (P1-8 “bonification €922.50”); `docs/luxembourg-resident-tax-optimisation-checklist-2025-2026.md:255` and `:470`; `research/2025-2026-lu-tax-credits-and-classes.md:127-158`.

**Evidence**

- `childrenWithModeration` is only a multiplier and a gate:
  - `engine.ts:634` `childrenWithModeration: Math.max(0, childrenWithModeration),` (passed to deductions)
  - `deductions.ts:160` `const multiplier = 1 + (isCollective ? 1 : 0) + Math.max(0, ctx.childrenWithModeration);` — drives the Art. 111 / 111bis / mortgage / épargne-logement caps
  - `engine.ts:726` (provenance multiplier), `engine.ts:806` (Class 1a warning), `engine.ts:982` (CIM gate), `engine.ts:653` (ASRD children)
- `packages/tax-engine/src/credits.ts:48-175` exports CIS, CISSM, CIC, CI-CO2 (salary/pension/independent), CIP, CII, CIM and `resolvePerPersonCredits` — **no child dégrèvement, no bonification**. Grep for the amount (`922.5|922,50|922.50`) in `packages/tax-engine/src` → 0 matches; `bonif` → only the 8775 newsletter string in `rules/2026.ts:52`.
- The result contract has no field for it: `packages/contracts/src/tax.ts:198-214` (`CreditBreakdownDto`: startup, foreignTaxCredit, cissm, cic, cis, ciCo2Salary, cip, ciCo2Pension, cii, ciCo2Independant, cim, total). The UI mirrors that list (`TaxCalculatorView.tsx:361-395`), so there is no row either.
- No questionnaire input asks whether a family allowance / CEDIES / SNJ payment was made — the condition that switches Art. 122 on.

**Reproduced.** Class 1a, gross €60,000, everything else equal:
`childrenWithModeration: 0` → final **67,068.00**; `childrenWithModeration: 2` → final **67,068.00**; delta **€0.00**. (The absolute figure carries the LEG-1 error; the delta is what matters here.) Two children should be worth up to €1,845 of dégrèvement (or bonification), capped at the tax due.

**Why it matters.** The only child-sensitive money in the engine is the *cap majoration* of deductions (€672 etc.); the child tax relief itself is absent. A family with two moderated children is over-taxed by up to €1,845 a year, and a bonification case (child left the household, studies finished) is invisible.

**Proposal.** Add two pure functions to `credits.ts` — `moderationFor(childCount, taxDue)` (non-refundable, imputed only up to the cote) and `bonificationFor(childCount, ria)` (`(76,600 − RIA)/10` in the 67,400–76,600 band, zero above, cap lifted at 6+ children, max two bonifications per child) — plus DTO fields, two UI rows, and a questionnaire gate (“was a family allowance / CEDIES / SNJ payment received for this child?”). Do not make the dégrèvement refundable.

**Acceptance.** One child, RIA €40,000, no allowance paid → liability reduced by €922.50 but not below zero; RIA €71,000 with bonification → €560; RIA €76,600 → €0; the same child cannot generate dégrèvement and bonification in the same year; tests for each.

---

### LEG-3 — CIM: unreachable for divorced/widowed parents, and truncated when it is computed

- **Status:** partial
- **Priority:** P1
- **Requirement:** §4.1 P0-4 (CIM 2025) and `docs/luxembourg-resident-tax-optimisation-checklist-2025-2026.md:250-253` (CIM), `:255` (dégrèvement/bonification); `research/2025-2026-lu-tax-credits-and-classes.md:108` (Art. 154ter al. 2: “Le crédit d'impôt monoparental est restituable au contribuable dans la mesure où il dépasse la créance d'impôt.”).

**(a) The gate can never open for a divorced or widowed parent**

- `apps/api/src/modules/calculations/calculations.service.ts:146`:
  `isSingleParent: answers.isSingleParent ?? (answers.maritalStatus === 'SINGLE' && childrenWithModeration > 0),`
- The contract exposes the field (`packages/contracts/src/questionnaire.ts:37`) but `QuestionnaireView.tsx` has **no control for it** — grep `isSingleParent` in that file returns nothing; the only parent-related input is `bothParentsSameHome` (`QuestionnaireView.tsx:657`).
- `resolveTaxClass` puts a divorced parent with children in Class 1a and a widowed parent in Class 1a unconditionally (`calculations.service.ts:51-54`), so the class precondition is satisfied while the CIM flag remains false.
- Engine gate: `engine.ts:978-984` (`taxClass === CLASS_1A && params.isSingleParent && childrenWithModeration > 0 && !bothParentsSameHome`).
- **Reproduced:** Class 1a, gross €40,000, 1 child, `bothParentsSameHome: false` → `isSingleParent: true` gives `credits.cim = 3,504`; `false` gives **0**. No UI control sets it for a divorced or widowed user; only a hand-crafted API payload can (the Zod schema still accepts the field, `questionnaire.schema.ts:39`).

**(b) A refundable CIM is clipped to zero**

- `engine.ts:1101-1102`:
  `const finalTaxLiability = Math.max(0, round2(totalTaxBeforeCredits - credits.total));`
  `const balancePayableOrRefund = round2(finalTaxLiability - withheld);`
- **Reproduced:** Class 1a, gross €20,000, 1 child, single parent → `baseTax 0`, `cim 3,504`, `finalTaxLiability 0`, `balance 0`. Art. 154ter makes the excess refundable; the correct balance is **−€3,504** (minus 50 % of allocations above €2,712). The €3,504 simply disappears.

**Proposal.** Derive `isSingleParent` from the household instead of marital status (`Class 1a && childrenWithModeration > 0 && !bothParentsSameHome && no second adult`), or add the explicit questionnaire toggle; separate refundable credits (CIM) from non-refundable ones and carry `max(0, refundableCredits − taxBeforeCredits)` into `balancePayableOrRefund`.

**Acceptance.** DIVORCED + 1 child + `bothParentsSameHome=false` → CIM €3,504 at RIA ≤ €60,000 with no extra flag; WIDOWED likewise; at gross €20,000 with no withholding the balance is −€3,504 (refund), not 0.

---

### LEG-4 — Foreign-taxed securities income is counted twice in the taxable base

- **Status:** incorrect
- **Priority:** P1
- **Requirement:** gap-analysis §4.2 P1-1 (capital module), P1-4 (foreign income).

**Evidence**

- `engine.ts:458` adds the holding to the capital base:
  `primaryCapital = addMoney(primaryCapital, round2(taxable));`
- `engine.ts:462` adds the **gross** again when a foreign withholding is present:
  `creditForeignIncome = addMoney(creditForeignIncome, gross);`
- `engine.ts:538` then sums both into net income:
  `const netIncome = round2(primaryNet + spouseNet + creditForeignIncome);`
  (`primaryNet` already contains `capitalIncome = primaryCapital`, built in `toPersonIncome`, `engine.ts:502-517`.)
- The same inflated `creditForeignIncome` is the slice used to compute the credit (`engine.ts:912-919`), so the credit is computed on a base that includes the income twice.

**Reproduced.** One security, gross €10,000:
`foreignTax: 0` → `netIncome 10,000`; `foreignTax: 1,500` → **`netIncome 20,000`**, `credits.foreignTaxCredit 555`. The presence of a withholding tax doubles the declared income.

**Proposal.** Keep two separate accumulators: capital income already included in the base, and the foreign tax paid on it. Do not add securities income to `creditForeignIncome`; compute the credit as `min(foreignTax, LU tax on that holding's income)`.

**Acceptance.** `netIncome` is identical with and without `foreignTax` on the same holding; the credit changes, the base does not; a regression test pins both.

---

### LEG-5 — Art. 3ter individual assessment: foreign credit is zeroed (warned) and exemption-with-progression is dropped silently

- **Status:** incorrect
- **Priority:** P1
- **Requirement:** gap-analysis §4.2 P1-4 (“per-country method … include in RIA for taux”), P1-7 (Art. 3ter); `implementation-tracker.md` known limitation 7 (“Foreign tax credit is computed only under collective assessment”).

**Evidence**

- Exemption-with-progression and the ordinary credit exist only in the collective `else` branch: `engine.ts:900-919` (the `if (exemptForeignIncome > 0)` block is `engine.ts:905-911`).
- `INDIVIDUAL_PURE` (`engine.ts:836-866`) and `INDIVIDUAL_REALLOCATION` (`engine.ts:868-898`) never read `exemptForeignIncome` and never compute `foreignTaxCreditComputed`.
- The only warning is conditional on a *foreign tax amount*: `engine.ts:1018-1022`
  `if (foreignTaxPaid > 0 && foreignTaxCreditComputed === 0 && assessmentMode !== 'COLLECTIVE')` → “Foreign tax credit is only computed under collective assessment; individual assessment modes ignore it.”
  With an exemption-method country (`foreignTax = 0`), nothing fires.

**Reproduced (married couple, €60,000 + €40,000, 2025)**

| Case | Collective | `INDIVIDUAL_PURE` |
|---|---|---|
| DE €20,000, foreign tax €5,000 | credit **5,000** | credit **0**, warning present |
| FR €20,000 (exemption with progression) | `baseTax` **17,878.78** | `baseTax` **14,857** — progression lost, **0 warnings** |

The FR case is the dangerous one: the number is wrong and the UI says nothing. The DE case is wrong but at least flagged.

**Proposal.** Either implement the per-spouse credit and the progression (the exempt income must still raise the rate under Art. 3ter), or append an `unsupported[]` entry whenever `foreignIncomeItems` is non-empty and the mode is individual. The warning must not depend on `foreignTax > 0`.

**Acceptance.** For each mode × method pair, the result is either computed correctly or listed in `unsupported[]`; no combination changes `baseTax` silently; tests for FR and DE under both individual modes.

---

### LEG-6 — Art. 119 n° 3 b–c three-year Class 2 window is not modelled

- **Status:** missing
- **Priority:** P1 (P1-7)
- **Requirement:** `docs/lir-118-121-bareme-2025-2026.md` Finding 4 (who is Class 1a vs Class 2: widows within three years of death, divorced/separated within three years where the five-year prior condition is met); `luxembourg-tax-resident-gap-analysis.md:688`.

**Evidence**

- `apps/api/src/modules/calculations/calculations.service.ts:51-54`:
  `case 'WIDOWED': return TaxClass.CLASS_1A;`
  `case 'DIVORCED': return childrenWithModeration > 0 || age65 ? TaxClass.CLASS_1A : TaxClass.CLASS_1;`
  No year of death/divorce is read, and no three-year window exists anywhere (grep `three year|3 ans|119 n°` in `packages/tax-engine/src`, `apps/api/.../calculations`, `packages/contracts/src` → only the Class 1a warning text at `engine.ts:808`).
- The questionnaire has no `dateOfDeath` / `divorceYear` / `priorClass2` input (`questionnaire.schema.ts` — the whole file has no such field).

**Impact.** A widow taxed collectively in the year of death should stay in Class 2 for the three following years; the app moves her to Class 1a immediately. At RIA €100,000 that is €24,443 (Class 1a, `docs/lir-118-121-bareme-2025-2026.md` Finding 4 table) against €14,682 (Class 2, ACD example) — **≈ €9,761 over-taxed per year**, for up to three years. The same logic applies to a recent divorce where the five-year prior condition is met.

**Proposal.** Add `spouseDeathYear`, `divorceOrSeparationYear`, `class2BeforeEvent` to the questionnaire; in `resolveTaxClass`, return `CLASS_2` when the event falls in the three years preceding the tax year (and, for divorce/separation, the prior-benefit condition holds); warn when the dates are missing rather than defaulting silently.

**Acceptance.** Widow since 2024 → Class 2 for 2025–2027; divorce in 2023 with five prior years of Class 2 → Class 2 in 2025; otherwise Class 1/1a; tests for all three.

---

### LEG-7 — Certificate 160 and Form 100F maps are partial

- **Status:** partial
- **Priority:** P1 (P0-9 for the 100F case map, P1-10 for the 160 codes)
- **Requirement:** gap-analysis §4.1 P0-9 (Form 100F sheet/case map), §4.2 P1-10 (“certificat 160 full codes (not only 101/103/105)”).

**Evidence**

- Engine input map: `engine.ts:183-189` accepts `grossSalary`, `code_101`, `code_102` (all three → gross salary), `socialSecurity`/`code_103`, `withholdingTax`/`code_105`. Nothing else from a 160 is read.
- Filing map: `filing.service.ts:226-236` emits certificate-import lines for **101, 103, 105 only** (`code_102` is folded into the engine's gross salary but not listed on the import sheet). Everything else in the certificate is either dropped or left to free-text heuristics.
- Extractor: `receipt-ai-vision.service.ts:213-222` (101/102), `:234` (103), `:244` (105); pension certificate 170 at `:283` (200/201) and `:295` (203/205). The rest of a salary certificate is matched by labels (“brut”, “gross”, “rémunération brute”), not by code.
- The tracker admits the state: `implementation-tracker.md`, Phase 4 row 4.12 — “other 160 codes still text-matched only”.
- Form 100F: `addBox(pageNumber, sheet, …)` stores a **sheet letter**, not a case number (`filing.service.ts:212-220`; the whole list is `:228-318`). Real case numbers appear only in prose: `:401` (cases 317/318/319 for E/R) and `:372` (“feuille Enfants (case 228+)” as an annex code string). The §4.1 P0-9 requirement was “Signalétique, Enfants 228+, E/R 316–319, S, P, CM, L, DS, CE, RD, recap 2001+”.
- **Reproduced by inspection:** a fact whose `fieldKey` is outside 101/102/103/105 falls through the `EMPLOYMENT_INCOME` branch in `engine.ts:183-191` and is silently ignored; `filing.service.ts:226-236` also drops it. No warning is emitted.

**Proposal.** Define an explicit certificate-160 code table (code → field key → legal box → engine category) and reject or report unknown codes; remove the `code_102`/`code_101` ambiguity by naming what each code is; add the real 100F case numbers for the sheets already emitted, and a “not produced — sheet not supported” list for the annexes that are deliberately absent.

**Acceptance.** A 160 fixture containing codes outside the current four produces either a mapped value or an explicit “code X not supported” warning — never a silent drop; every emitted 100F box carries a case number, not only a sheet letter.

---

### LEG-8 — No Class 2 vs 2×Class 1 (Art. 3ter) scenario comparison

- **Status:** missing
- **Priority:** P2 (§4.3 first bullet)
- **Requirement:** `luxembourg-tax-resident-gap-analysis.md:695` — “Joint vs individual **scenario comparison** (Class 2 vs 2× Class 1) — legally meaningful for married residents”.

**Evidence**

- Grep `scenario` across `apps/` → one hit, a JSX comment: `TaxCalculatorView.tsx:79` `{/* Unsupported-scenario banner */}`. No comparison feature.
- `packages/contracts/src/tax.ts` has no comparison type; `calculations.service.ts` exposes only `calculateTax` (no `compare`).
- The primitives exist: the engine computes `INDIVIDUAL_PURE` (`engine.ts:836`), `INDIVIDUAL_REALLOCATION` (`:868`) and collective Class 2, and the questionnaire exposes the modes (`QuestionnaireView.tsx:1010-1012`, reallocation share `:1018-1027`).

**Impact.** A married couple must re-run the calculation three times and write the numbers down; the product advertises “differentiation” but cannot answer “is the Art. 3ter election worth it?”. This is a §4.3 item that is purely missing rather than partially built.

**Proposal.** Add `POST /calculations/compare` returning collective Class 2, 2×Class 1 and reallocation results from the same facts, with the delta and the Art. 3ter deadline; render a side-by-side table in `TaxCalculatorView`.

**Acceptance.** One action returns all three totals and the delta, with the same rule-package version and no re-entry of facts.

---

### LEG-9 — 2028 “classe U” is a hook only; the limitation is documented, but a 2028 filing package can still be produced

- **Status:** partial
- **Priority:** P2 (preview package; tracker known limitation 6)
- **Requirement:** gap-analysis §4.3 (“2028 single-class package behind a flag; do not leak to 2025/2026 users”).

**Evidence — the limitation is documented at every layer**

- `packages/tax-engine/src/rules/2028.ts:14-19`: “the transition rules (25-year phase-out for existing Class 2 couples) are not yet implemented … The tariff itself is held identical to 2025/2026 until the 2028 law publishes its own scale — deliberately conservative”.
- `rules/2028.ts:21,26,29`: `...RULES_2026`, `singleClass: true`, `classUTransition: { years: 25, method: 'NONE' }`.
- Engine warnings: `engine.ts:791-797` (single-class preview; “The 25-year transition … is not applied (parameters not published; method NONE)”).
- UI label: `TaxCalculatorView.tsx:103` “Supported tax years: 2025 … 2026 · 2028 preview”.
- Tracker: `implementation-tracker.md` known limitation 6.

**Residual risk.** `getRulePackage(2028)` is a normal supported year (`rules/index.ts:14`, `:25-33`), `calculateTax` accepts it (`calculations.service.ts:86-89`), and `filing.service.ts` has **no year guard** (grep `taxYear` there → templating only, no `2028` / `isSupportedTaxYear` check). A 2028 workspace therefore produces a full calculation with the 2026 tariff, no transition, and a downloadable filing package and annex PDF.

**Verdict.** The limitation is documented and acceptable **as a preview**; it is not acceptable as a filing year. No code change to the tariff is required until the 2028 law publishes its scale.

**Proposal.** Mark the result as preview (e.g. `status: 'PREVIEW'` or `rulePackageVersion` check), and refuse filing-package / annex generation for 2028, or stamp both “preview — not for filing”.

**Acceptance.** A 2028 calculation still renders with both warnings; `GET …/filing-package` and `…/annexes.pdf` refuse (or stamp) 2028; a test covers the refusal.

---

### LEG-10 — Prime jeune salarié (Art. 115 n° 13d) has no code path; it is out of the promised first-release scope

- **Status:** missing
- **Priority:** P2 (out of §4.1/§4.2 scope)
- **Requirement:** `docs/luxembourg-resident-tax-optimisation-checklist-2025-2026.md:280-285` (§5.9) and `:474` (§11 row 22); `luxembourg-tax-resident-gap-analysis.md:388` and `:851`.

**Evidence**

- Grep `prime jeune|primeJeune|jeune salari|13d` across `packages/` and `apps/` → **0 matches**. No input, no rule, no credit, no exemption line.
- The checklist itself classifies it as a **salary exemption, not an IR deduction** (`checklist:30`: “Bëllegen Akt … and prime jeune salarié … are **not** IR deductions; they sit in registration duties / salary exemption”).
- It is **not** in §4.1 (P0-1…P0-11) nor §4.2 (P1-1…P1-10); it appears only in the optimisation catalogue (`gap-analysis:851`, marked ❌) and in §1.9 as a 2026 measure the 2025-only engine cannot produce (`:388`).

**Verdict.** Genuinely out of the promised first-release scope; not a regression against the tracker. The legal rule (75 % exempt, caps €5,000 / €3,750 / €2,500 by gross band, age < 30 on 1 January, first Luxembourg CDI, first prime < 5 years, lost on employer change) is documented in §5.9 and should be treated as a later-scope item.

**Proposal.** Either add the three inputs (age on 1 January, first-CDI/prime date, prime amount) and a separate exempt line, or document “not supported — employer-side exemption” and warn when a certificate line labelled “prime jeune” is detected, so the salary is not silently taxed in full.

**Acceptance.** A prime-jeune case produces either the 75 % exemption (capped by band) on its own line, or a warning naming Art. 115 n° 13d; never a silent full taxation with no message.

---

## 4. P0/P1 coverage matrix (§4.1 / §4.2)

Legend: ✅ implemented · 🟡 implemented with a defect · ⛔ missing / no code path.

| Item | Status | Evidence |
|---|---|---|
| P0-1 official scale + year packages | ✅ | `rules/2025.ts:14-38` (official walls), `rules/index.ts:25-33` (throws) |
| P0-2 Class 2 / 1a / rounding | ✅ | `scale.ts:17-21` (Art. 124), `:104-121` (Art. 121, no half-rounding), `:54-100` (Art. 120bis caps) |
| P0-3 CIS / CI-CO2 / CIP / CIM | ✅ | `credits.ts:38-175` |
| P0-4 CIM 2025 | 🟡 | computed (`engine.ts:978-997`) but unreachable for divorced/widowed and non-refundable — **LEG-3** |
| P0-5 three fact types (111 / 111bis / mortgage) | ✅ | `enums.ts:102-106`; `engine.ts:183-260` |
| P0-6 deductions composition | ✅ | `deductions.ts:155-319`; FDS al. 2 edge (lesser spouse net < €480) still absent — `deductions.ts:227-235` |
| P0-7 pensions + Art. 111bis payout warning | 🟡 | pension + FFO 300 + CIP done (`deductions.ts:172-175`); **no warning path** for an Art. 111bis capital payout (grep `rachat|versement unique|lump` → 0) |
| P0-8 FFO per person / distinct owner | ✅ | `deductions.ts:164-179`; per-owner buckets `engine.ts:172-179` |
| P0-9 filing package / 100F case map | 🟡 | sheets emitted, case numbers only in prose — **LEG-7** |
| P0-10 refuse unsupported input | 🟡 | non-resident refusal only (`engine.ts:116-160`); capital/rental/foreign now implemented, so the guard is narrower than the text |
| P0-11 golden tests | 🟡 | 41 engine tests, but **0** on `finalTaxLiability` / surcharge — **LEG-1** |
| P1-1 capital income | 🟡 | ledger implemented (`engine.ts:439-500`); double-count with foreign WHT — **LEG-4** |
| P1-2 plus-values | ✅ | `engine.ts:551-606` |
| P1-3 rental | ✅ | `engine.ts:273-436` |
| P1-4 foreign income per country | 🟡 | `rules/treaties.ts`; broken under Art. 3ter — **LEG-5** |
| P1-5 épargne-logement + CE €5,400 | ✅ | `deductions.ts:213-245`, `:246-252` |
| P1-6 CIP / CISSM / CII | ✅ | `credits.ts:57-77`, `:124-149` |
| P1-7 class determination service | 🟡 | PACS / age / children done (`calculations.service.ts:38-57`); **3-year window missing** — **LEG-6** |
| P1-8 2026 package (AMVP, 111bis, CO2, bonification) | 🟡 | first three done (`rules/2026.ts:26-45`); **bonification missing** — **LEG-2** |
| P1-9 decimal / cents | ✅ | `money.ts`; 29 accumulation sites |
| P1-10 extractor v2 / 160 codes | 🟡 | 101/102/103/105 + 170 codes only — **LEG-7** |

---

## 5. Blocked facts (external, not code gaps)

These two were **not** reported as findings. Verified on disk that they are gated, sourced and switched off:

1. **CIC 2026 monthly table** — no published table. `rules/2026.ts:47-66` records `pendingMeasures: [{ id: 'CIC_2026', status: 'NOT_IN_FORCE', source: 'Projet de loi 8775 …', activation: … }]`; `credits.ts:75-81` returns 0 while the measure is `NOT_IN_FORCE`; `engine.ts:766-773` emits the sourced warning; UI row prints `calc.credits.cic` (`TaxCalculatorView.tsx:373-374`). Correct behaviour: 0 plus warning, not a reused 2023 table.
2. **Loi 8775 / épargne-logement age limit** — current law applied (€1,344 up to 40, €672 above), `rules/2026.ts:58-66` pending measure, `engine.ts:780-789` warning for subscribers over 40, `deductions.ts:213-219` cap. No attempt to pay out the un-promulgated change.

Both remain blocked on the Mémorial publication; nothing in the repository can close them.

---

## 6. Document status (stale descriptions, not code gaps)

- `docs/lir-118-121-bareme-2025-2026.md` §2 Findings 2 and 4 describe `packages/tax-engine/src/scale2025.ts` and the old brackets / `(C1+C2)/2` Class 1a. Both were replaced: `scale2025.ts` is now a 1.3 KB shim and the live tariff is `scale.ts` + `rules/2025.ts`. The document is historically accurate, stale as a description of the current engine.
- `docs/luxembourg-resident-tax-optimisation-checklist-2025-2026.md` §11 is a pre-implementation scorecard (rows 1, 3, 9–12, 15–19, 24–29, among others, are now implemented). Do not read it as current status; it was the input to Phases 0–4.
- `gap-check-2026-11-08.md:7` (“the P0 engine work … genuinely implemented and tested”) and `:95` (“Engine: conforms to the audited rules … with ACD-checked golden values”) are contradicted by LEG-1: the golden values cover `baseTax`, not the return. The claim is overstated, not the tests.
- `implementation-tracker.md:7` (“48 tests passing”) is accurate.

---

## 7. What to fix first

1. **LEG-1** — one-line fix, highest value; add the missing final-liability assertions first so the fix is locked.
2. **LEG-3** — CIM reachability + refundability (a few lines in the API mapping and the balance computation).
3. **LEG-2** — the only missing *credit* with a statutory amount; needs a rule, a DTO field, a UI row and a questionnaire gate.
4. **LEG-4 / LEG-5** — foreign income correctness; LEG-4 is a straightforward accumulator split, LEG-5 needs a decision (implement or refuse).
5. **LEG-6 / LEG-7** — class history and certificate mapping; both need new inputs and a table, not new arithmetic.
6. **LEG-8 / LEG-9 / LEG-10** — product scope; document and gate rather than compute.

## 8. Open items (not verified in this run)

- Exact official certificate-160 code list (the local documents name only 101/103/105; the full map was not retrieved). Closing it requires the ACD model 160 PDF.
- Whether the 2028 reform (projet de loi 8676) was definitively voted; the package itself labels it a preview and the scale is deliberately not invented.
- The Form 100F case references exist only as instruction prose (`filing.service.ts:401` cases 317/318/319, `:372` “case 228+”); no machine-readable case map exists to diff against the official 20-page form.
