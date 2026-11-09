# LEG-7 — Certificate 160 code table and Form 100F case map

**Item:** LEG-7 (P0-9 Form 100F sheet/case map + P1-10 “certificat 160 full codes”), `audit/audit-legal.md:211`.
**Scope executed:** a dependency-free 160-code table, engine-side resolution + warnings, a machine-readable 100F case map, DTO fields, unit tests, syntax/type checks.
**Not touched:** the tariff, `docs/`, the admin form registry (`audit-api.md` item (e)), Prisma schema/migrations.

## 1. Certificate 160 code table

`packages/tax-engine/src/forms/certificate160.ts` (new, no imports):

```ts
export interface Certificate160Code {
  code: string; labelFr: string; labelDe: string;
  category: string; fieldKey: string;
  supported: boolean;
  note?: string;
}
export const CERTIFICATE_160_CODES: Record<string, Certificate160Code>;
export function normalizeCertificate160Code(raw: string | null | undefined): string;
export function lookupCertificate160Code(raw: string | null | undefined): Certificate160Code | undefined;
export function isCertificate160FieldKey(fieldKey: string | null | undefined): boolean;
```

Normalization: `trim()` → upper case → strip one `code_` prefix (`code_101`, `code_101 `, `CODE_101` all → `101`).

| code | labelFr | category (engine) | fieldKey | supported |
|---|---|---|---|---|
| `101` | Rémunération brute — salaire | `EMPLOYMENT_INCOME` | `grossSalary` | yes |
| `102` | Rémunération brute — deuxième contrat / complément | `EMPLOYMENT_INCOME` | `grossSalary` | yes |
| `103` | Cotisations sociales déductibles (C) | `EMPLOYMENT_INCOME` | `socialSecurity` | yes |
| `105` | Retenue d'impôt (E) | `EMPLOYMENT_INCOME` | `withholdingTax` | yes |
| `141` | Intérêts débiteurs — habitation personnelle | `MORTGAGE_INTEREST` | `mortgageInterest` | yes |
| `S` | Salaire | `EMPLOYMENT_INCOME` | `grossSalary` | yes |
| `P` | Pension | `PENSION_INCOME` | `grossPension` | yes |
| `LRCP` | Régime complémentaire de pension | `LRCP_CONTRIBUTION` | `lrcp` | yes |
| `FD` | Frais de déplacement | — | `""` | **no** |
| `FO` | Frais d'obtention | — | `""` | **no** |
| `FFO` | Forfait pour frais d'obtention | — | `""` | **no** |
| `DS` | Dépenses spéciales | — | `""` | **no** |
| `FDS` | Forfait pour dépenses spéciales | — | `""` | **no** |
| `CE` | Charges extraordinaires | — | `""` | **no** |
| `AC` | Abattement conjoint | — | `""` | **no** |

Anything else returns `undefined`.

**Labels are sourced, not guessed.** The 2025 modèle 160F PDF already in the workspace (`tmp/160f-25.pdf`, 2 pages) prints the letter codes in notes 3, 6 and 8:

- note 3 — `S = salaire`, `C = cotisation de sécurité sociale complémentaire`, `R = rappels d'années antérieures`, `P = pension`;
- note 6 — “déduction inscrite sur la fiche de retenue pour frais de déplacement (FD), frais d'obtention (FO), forfait pour frais d'obtention (FFO), dépenses spéciales (DS), forfait pour dépenses spéciales (FDS), charges extraordinaires (CE), abattement conjoint (AC) ou régime complémentaire de pension (LRCP)”;
- note 8 — LRCP checkbox.

The seven `supported: false` codes therefore carry the shared note “Deduction entered by the employer on the fiche de retenue (modèle 160F, note 6). It reduces the withholding base only: it is not a return fact and has no Form 100 case, so the engine ignores it.”

Two honesty constraints are recorded in the file: the numeric codes (101/102/103/105/141) are **not printed** on the paper certificate — they come from the audit requirement; and the German wording for `AC` is not in the local corpus, so `labelDe` keeps the French legal term rather than inventing one.

Export: `packages/tax-engine/src/index.ts` now re-exports `./forms/certificate160` (there was no `forms` barrel).

## 2. Engine mapping and warnings

`packages/tax-engine/src/engine.ts`, inside the fact loop, before the category switch:

```ts
const isCertificateField = isCertificate160FieldKey(fact.fieldKey);
const certificateCode = isCertificateField ? lookupCertificate160Code(fact.fieldKey) : undefined;
```

- **Known but unsupported** (`FD`, `FO`, `FFO`, `DS`, `FDS`, `CE`, `AC`, with or without the prefix):
  `Certificate 160 code "FFO" (Forfait pour frais d'obtention) is a withholding-base deduction, not a return fact; fact f2 was ignored.`
  then `continue`.
- **Unknown code** (`code_999`, `999`):
  `Certificate 160 code "999" is not supported by this engine; fact f2 was ignored. Add it to certificate160.ts or review it manually.`
  then `continue`.
- **Supported code**: the table's `category`/`fieldKey` replace the stored ones, so `code_101`/`code_102`/`S` → `grossSalary`, `code_103` → `socialSecurity`, `code_105` → `withholdingTax`, `code_141` → `MORTGAGE_INTEREST` → `deductions.mortgageInterest`, `P` → `grossPension`, `LRCP` → `lrcp`. The stored category is treated as a hint only — a `LRCP` fact stored as `OTHER_DEDUCTION` still lands in the LRCP bucket (probe, §6).
- **Normal field keys** (`grossSalary`, `withholdingTax`, …) are not certificate keys: no lookup, no warning, byte-identical behaviour (the old `|| fact.fieldKey === 'code_101'` branches were removed because the table now supplies those keys).

One side effect worth knowing: `bucket.factIds.push(fact.id)` moved **after** the two guards, so an ignored fact is no longer listed as a source of the income provenance line. Previously every fact — including ones the switch dropped — was pushed.

`isCertificate160FieldKey` triggers on the `code_` prefix, a three-digit key, or any key of the table (`S`, `P`, `LRCP`, `FD`, …). Engine field keys are camelCase, so there is no collision (checked: no fixture in `apps/api/test` or `packages/tax-engine/test` uses a 160-shaped `fieldKey`).

## 3. Form 100F case map

`apps/api/src/modules/filing/form100-case-map.ts` (new, dependency-free constant, exactly the map supplied in the brief):

| key | page | sheet | case |
|---|---|---|---|
| salaryGross | 7 | S | 701 |
| socialSecurity | 16 | DS | 1601 |
| withholdingSalary | 19 | RD | 1901 |
| pension | 8 | P | 801 |
| pensionWithholding | 19 | RD | 1903 |
| capital | 9 | CM | 901 |
| rental | 10 | L | 1001 |
| foreign | 11 | D | 1101 |
| freelance | 5 | C/A | 501 |
| businessExpense | 5 | C/A | 502 |
| mortgageInterest | 10 | L | 1033 |
| art111 | 14 | DS | 1471 |
| art111bis | 15 | DS | 1503 |
| savingsHousing | 15 | DS | 1525 |
| lrcp | 16 | DS | 1609 |
| donations | 16 | DS | 1611 |
| childcare | 17 | CE | 1715 |
| ffo | 7 | S | 730 |
| travel | 7 | S | 742 |
| specialExpensesForfait | 15 | DS | 1553 |
| aep | 20 | Recap | 0621 |
| cim | 2 | Enfants | 228 |

**Verification of the numbers:** all 22 case numbers occur in the text extracted from the official `100f-2025.pdf` (`pypdf`, page-by-page text). What that proves is that no number is invented; the page/sheet pairing is the one supplied by the brief — text extraction flattens the layout, so it does not machine-verify which page each number belongs to.

Contracts (`packages/contracts/src/filing.ts`):

- `Form100BoxMapping.boxNumber` → **`sheet`** (a box was never carrying a case number);
- **`caseNumber: string`** — official case, or `"computed"` for ACD-computed credits;
- **`kind: 'FORM_100' | 'COMPUTED'`**;
- `FilingPackageDto.unsupportedCertificateCodes?: Array<{ code; factId; message }>`.

## 4. Filing service

`apps/api/src/modules/filing/filing.service.ts`:

- `addBox(pageNumber, sheet, caseNumber, labelFr, labelDe, amount, sourceFactId?, kind = 'FORM_100')`; every call now passes `FORM100_CASES.<key>.page / .sheet / .caseNumber`. No hardcoded page/sheet number is left in the Form 100 block.
- Confirmed facts are normalized through the same 160 table before the switch (a `code_141` or `code_102` fact now produces a box; before, it produced none), and each supported certificate code is added to `certificateImport` with its table label — `code_102` is no longer missing from the import control sheet (audit evidence, `audit-legal.md:220`).
- Unmapped codes are collected in `unsupportedCertificateCodes` (unknown code → “not supported … not mapped to a Form 100 case”; withholding-base code → “withholding-base deduction … not mapped”), included in the package checksum payload and returned in `FilingPackageDto`. Report only — the current Prisma model has no column for it, so it is recomputed on each generation (§7).
- Category → case: `EMPLOYMENT_INCOME` gross → `salaryGross`; social security → `socialSecurity` (was page 7/S, now the real 1601 line of DS); withholding → `withholdingSalary`; `PENSION_INCOME` split into `pension` and `pensionWithholding` (RD 1903, previously one P box); capital → 901; rental → 1001; foreign → `D` 1101 (previously labelled `E/R` page 3); freelance/business expense → `C/A` 501/502; mortgage → 1033; 111 → 1471; 111bis → 1503; épargne-logement → 1525; LRCP → 1609; dons → 1611; garde/domesticité → 1715; frais d'obtention forfait → `ffo` 730; déplacement → `travel` 742; forfait dépenses spéciales → 1553; AEP → 0621.
- Credits: CIS, CI-CO2, CIP, CII, CISSM and start-up are emitted with `kind: 'COMPUTED'`, `caseNumber: 'computed'`, page 20 / sheet `Recap`, label suffixed `— Computed by ACD — no 100F case`. **CIM is not in that loop**: it is a request on the Enfants sheet, so it is emitted as a real `FORM_100` box on `FORM100_CASES.cim` (page 2, case 228) — the option the brief allows. The existing CIM annex entry is unchanged.
- `MyGuichetStepGuide` field filters follow the new pages (`[5,7,8,9,10,11]` income, `[14,15,16,17]` expenses, 19/20 recap) and boxes are referenced through `boxRef()` (`Feuille <sheet> — case <caseNumber>`, or `Recapitulation (computed by ACD)`), instead of the old sheet-only string.

`apps/web/src/components/FilingPackageView.tsx`: table header “Sheet / Case”, cell `{sheet} · case {caseNumber}`, copy state keyed by row index (several facts can share one case number).

## 5. Files changed

| File | Change |
|---|---|
| `packages/tax-engine/src/forms/certificate160.ts` | **new** — 160 code table, normalize/lookup/isCertificate160FieldKey |
| `packages/tax-engine/src/index.ts` | re-export `./forms/certificate160` |
| `packages/tax-engine/src/engine.ts` | code resolution before the switch, two warning paths, effective category/fieldKey, `factIds` pushed only for mappable facts |
| `packages/tax-engine/test/tax-engine.spec.ts` | new `describe('Certificate 160 codes (LEG-7)')`, 4 tests |
| `apps/api/src/modules/filing/form100-case-map.ts` | **new** — 22-entry `FORM100_CASES` constant + `Form100CaseKey` |
| `apps/api/src/modules/filing/filing.service.ts` | addBox signature, case constants, 160 normalization + `unsupportedCertificateCodes`, computed credits, CIM request, guide filters, checksum/return |
| `packages/contracts/src/filing.ts` | `sheet` / `caseNumber` / `kind` on `Form100BoxMapping`; `unsupportedCertificateCodes` on `FilingPackageDto` |
| `apps/web/src/components/FilingPackageView.tsx` | sheet + case rendering |
| `apps/api/test/form100-case-map.spec.ts` | **new** — 3 tests |
| `tsconfig.test.json` | include the map module and its spec |
| `.tools/syntax_check.cjs` | syntax-check the map module |

No dependency, schema or migration change. Revert = restore these 11 files (2 new files can simply be deleted; `git checkout --` works for the other 9).

## 6. Verification run

| Check | Command | Result |
|---|---|---|
| Type check | `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` | exit 0, no output |
| Prescribed suite | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts apps/api/test/class-resolution.spec.ts apps/api/test/form100-case-map.spec.ts` | **147 tests, 147 pass, 0 fail** (26 suites) |
| Case map alone | same runner, `apps/api/test/form100-case-map.spec.ts` | 3 tests, 3 pass |
| Syntax | `node .tools/syntax_check.cjs` | exit 0, every listed file `ok` |
| Mapping probe (throw-away, deleted) | `tsx tmp/probe-leg7.ts` | `P` 20 000 → `grossIncome` 20 000, no warning; `LRCP` stored as `OTHER_DEDUCTION` → `deductions.lrcp` 1 000; `code_101` 30 000 + `code_102` 5 000 → `grossIncome` 35 000; bare `999` → warning “not supported … fact f2 was ignored”, `grossIncome` unchanged at 40 000; `grossSalary`/`socialSecurity`/`withholdingTax` → 40 000 / net 35 200 / withheld 6 000, no warning |

New engine tests (all green): `code_101 + code_103 + code_105 fill gross pay, social contributions and withholding`; `code_141 reaches the MORTGAGE_INTEREST branch`; `an unknown code_999 warns "not supported" and changes neither income nor deductions`; `code_FFO warns "withholding-base" and does not change deductions`.
New case-map tests (all green): every entry has page 1–20 / non-empty sheet / numeric case; the 701 / 1601 / 1901 / 228 pairs; no duplicate `page/sheet/case` triple.

## 7. Limitations — not verified, or deliberately out of scope

1. **Exact official numeric-code list is still not sourced.** The paper 160F prints letter codes only; 101/102/103/105/141 came from the brief/audit. Adding a code is a data edit in `certificate160.ts`. Consequence: a real certificate line whose numeric code is not in the table still produces the “not supported” warning rather than a value — by design, but it means the table is not yet “the full 160”.
2. **German labels for the withholding-base letters are translations** (FD/FO/FFO/DS/FDS/CE). `AC` keeps the French term because the German 160F wording is not in the local corpus.
3. **`unsupportedCertificateCodes` is not persisted.** `FilingPackage` has no column for it and no migration was added (out of scope); the API recomputes it on each generation, so a package read back from the database has no such field.
4. **CIM moved from a computed recap line to a `FORM_100` request** (Enfants, case 228). If the ACD actually grants the CIM without a request, the box is a harmless duplicate of the annex; if any consumer counted on a recap CIM row, that row no longer exists.
5. **No API e2e and no UI run.** The environment has no `@nestjs/*`, Prisma client, database or web build, so `apps/api` / `apps/web` are not type-checked as projects (`tsc -p tsconfig.api.json` and `tsc -p apps/api/tsconfig.json` fail on missing modules that predate this change). `filing.service.ts` is therefore verified only by `syntax_check` transpile + code review; `FilingPackageView.tsx` by transpile only. Suggested re-run where dependencies exist: `pnpm --filter @luxtax/api typecheck`, `pnpm --filter @luxtax/api test:e2e`, `pnpm --filter @luxtax/web build`.
6. **Page/sheet pairing is not machine-verified** (see §3); only the existence of the 22 case numbers in the official PDF text.
7. **Out of scope, still open:** the admin form registry (`admin.service.ts:287-305`) still presents 101/103/105 as Form 100 box numbers, which contradicts this map (`audit-api.md` item (e)); and `freelance-lifecycle.e2e-spec.ts:451-454` looks for boxes `'21'…'24'`, which this map never produced (pre-existing, e2e not runnable here).

## 8. Review fixes (M1–M3)

Addresses `audit/review-leg7.md` §2 M1/M2/M3, plus W1, W3 and W7. Nothing outside the
review: the tariff, `docs/`, the admin registry and the Prisma schema are untouched.

### 8.1 M1 — C / R / unknown letters warn instead of vanishing

- `certificate160.ts`: added `C` (cotisation de sécurité sociale complémentaire — a
  section-A gross-pay component, **not** the `103` deduction) and `R` (rappels d'années
  antérieures; LIR Art. 132 timing decides the year) with `supported: false` and an
  explanatory note each. Corrected the `103` note, which wrongly said the letter `C`
  was the `103` code.
- `isCertificate160FieldKey` now treats any bare single letter A–Z (after trim and
  upper-case) as certificate-shaped, so an unmapped letter such as `X` reaches the
  unknown-code warning instead of falling through the category switch.
- The unsupported-code warning now says "is a certificate withholding-base label"
  (C is not a deduction); the filing service uses the same wording.
- Engine tests added: `C` and `R` warn `withholding-base` with gross/net/taxable/
  deductions unchanged; bare `X` warns `not supported`; `102` adds to the same gross as
  `101`; `S` and `P` fill their lines; `LRCP` reaches the lrcp deduction; canonical
  `grossSalary`/`socialSecurity`/`withholdingTax` behave like `101`/`103`/`105`.

### 8.2 M2 — FOREIGN_INCOME is an instruction, not case 1101

- Removed `foreign` (page 11 / `D` / `1101`) from `FORM100_CASES`: 1101 is the
  substantial-participation capital-gains line.
- `Form100BoxMapping.kind` gains `INSTRUCTION`.
- `FORM100_INSTRUCTIONS.foreignCredit` = page 19 / `RD` / `1081/1082` /
  `INSTRUCTION`. `FOREIGN_INCOME` emits that box with the prescribed label, keeping
  `amount` and `sourceFactId` for traceability.
- Case-map spec: no `foreign` entry (and `businessExpense` removed too); the RD pointer
  is asserted explicitly.

### 8.3 M3 — owner-aware columns and one net freelance line

- `generateFilingPackage` resolves `primaryUserId` from the `PRIMARY_FILER` membership
  (fallback: first member). A fact owned by another member is the spouse fact; `addBox`
  picks the spouse case and sets `personName` from the member's profile
  (`firstName lastName`) or e-mail address.
- Spouse cases added and used: 702 (salary), 1602 (social), 1902 (salary withholding),
  802 (pension), 1904 (pension withholding), 902 (capital), 1002 (rent), 502
  (freelance).
- `FREELANCE_INCOME` / `BUSINESS_EXPENSE` no longer emit per-fact boxes. Revenue and
  expenses accumulate per owner, then one net-profit box is emitted: 501 (taxpayer) or
  502 (spouse), label `Bénéfice net (Art. 14/91)`. A negative net writes `0.00` and adds
  an `INSTRUCTION` box for the Art. 114 carry-forward; no negative case amount.
- Deleted `businessExpense: 502`: page 5 case 502 is the spouse non-exempt profit
  column, not an expense line.

### 8.4 W1 / W3 / W7

- `FilingPackageView.tsx`: legacy packages render `box.sheet ?? box.boxNumber ?? ''` and
  `box.caseNumber ?? 'n/a'` instead of "case undefined".
- Canonical `grossSalary` / `socialSecurity` / `withholdingTax` facts also push the
  101 / 103 / 105 control lines, so the 160 step is populated for OCR output; `code_`
  keys still push their own line.
- Computed credits use the `RECAP` constant (page 20 / `Recap` / `computed` /
  `COMPUTED`) instead of a hard-coded triplet.
- Case-map regex tightened to `/^\d{3,4}$/`; `computed` and `1081/1082` exist only on
  the RECAP / INSTRUCTION pointers.

### 8.5 Files changed

| File | Change |
|---|---|
| `packages/tax-engine/src/forms/certificate160.ts` | `C`/`R` rows, corrected `103` note, single-letter predicate |
| `packages/tax-engine/src/engine.ts` | warning wording for unsupported codes |
| `packages/tax-engine/test/tax-engine.spec.ts` | 7 new tests (C, R, X, 102, S/P, LRCP, canonical keys) |
| `apps/api/src/modules/filing/form100-case-map.ts` | spouse cases; `foreign`/`businessExpense` removed; `RECAP` + `FORM100_INSTRUCTIONS` |
| `apps/api/src/modules/filing/filing.service.ts` | owner-aware `addBox`, net-profit aggregation, foreign instruction, 101/103/105 control lines, `RECAP` |
| `packages/contracts/src/filing.ts` | `INSTRUCTION` kind; `personName` documented |
| `apps/api/test/form100-case-map.spec.ts` | tightened regex, 4 new tests |
| `apps/web/src/components/FilingPackageView.tsx` | legacy sheet/case fallback |

### 8.6 Verification

| Check | Result |
|---|---|
| Prescribed six-file suite | **158 tests, 158 pass, 0 fail** (26 suites; baseline 147 + 11 new) |
| `tsc -p tsconfig.test.json` | exit 0 |
| `node .tools/syntax_check.cjs` | exit 0, every listed file `ok` |
| Filing-service probe (mock Prisma, `tmp/probe-leg7-review.ts`) | `PROBE OK`: 60 000 → S 701 "Marie Dupont"; 30 000 → S 702 "jean@example.lu"; 1601/1901 present; 802/902/1002 spouse-owned; **no 1101**; one RD `1081/1082` `INSTRUCTION` with amount 8000 and fact f8; 50 000 − 20 000 → 501 `30000.00`; 10 000 − 15 000 → 502 `0.00` + Recap `INSTRUCTION` `5000.00` (Art. 114); step 4 = Code 101 ×2, 103, 105; `C` listed in `unsupportedCertificateCodes`; CIS on page 20 / `Recap` / `computed` / `COMPUTED` |
| Case numbers | PDF text extraction confirms 702, 802, 902, 1002 on pages 7–10 and 1602, 1904, 1081/1082 on pages 16/19 |
| `tsc -p tsconfig.api.json` | still fails only on the pre-existing missing `@nestjs/*` / `@prisma/client` modules; no error on the new `addBox` calls |

### 8.7 Not verified

- No API e2e and no web build (dependencies absent). The probe mocks Prisma, so DB
  read-back, persistence of `unsupportedCertificateCodes` and the browser rendering of
  the legacy fallback are reviewed, not executed.
- `INSTRUCTION` boxes appear in the MyGuichet step lists (the step-5 filter is by page),
  by design; no UI run to check how they read on screen.
- The C/R legal reading (section-A component vs. Art. 132 timing) is the reviewer's; the
  engine deliberately computes neither.
