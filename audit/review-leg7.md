# LEG-7 review — Certificate 160 code table, engine warnings and the Form 100F case map

Reviewer: independent re-check against the brief, `audit/audit-legal.md` LEG-7
(`:211-228`), `audit/impl-leg7.md`, the official `100f-2025.pdf` (20 pages) and
`tmp/160f-25.pdf` (modèle 160F 2025, notes 3/6/8). Read-only; no source file was
modified.

## 1. Conclusion

**Not deliverable as-is.** Three must-fix findings, all in the correctness/legal layer:

- a certificate line keyed with the printed letter **C** or **R** — both documented in
  `certificate160.ts`'s own 160F note-3 header — is silently dropped by the engine and by
  the filing service, with no warning and no `unsupportedCertificateCodes` entry;
- `FOREIGN_INCOME` is emitted on page 11 / sheet D / case **1101**, which the official
  100F prints as the substantial-participation capital-gains line, not foreign income. The
  100F has no foreign-income sheet; treaty-exempt foreign income belongs in the exempt
  column of the relevant category sheet (S/P/CM/L) and the credit on RD 1081/1082.
- `BUSINESS_EXPENSE` is emitted on page 5 / C/A / case **502**, which the official form
  uses for the *spouse's* non-exempt commercial profit; the map is single-column, so a
  spouse's salary/pension/capital/rent is also emitted on the taxpayer's case
  (701/801/901/1001 instead of 702/802/902/1002).

The structural checks otherwise hold. All 22 case numbers occur on the pages the map
claims; the four called-out pairs — S 701 (p7), DS 1601 (p16), RD 1901 (p19), Enfants
228 (p2) — are correct. Every `FORM_100` box carries a numeric case; the six computed
credits are `kind: 'COMPUTED'` / `caseNumber: 'computed'`; CIM is a `FORM_100` box on
Enfants 228; no generated box is sheet-only. The prescribed suite is 147/147,
`tsc -p tsconfig.test.json` exits 0, `node .tools/syntax_check.cjs` reports 32 files
`ok`, and the LEG-1…LEG-8 regression tests still pass. The rest of the 160 table
(101/102/103/105/141/S/P/LRCP and the FD/FO/FFO/DS/FDS/CE/AC rejection) behaves as
claimed.

## 2. Must fix

### M1 — the printed letter codes C and R are silently dropped

- **Position.** `packages/tax-engine/src/forms/certificate160.ts:10-13` (header lists
  `S`, `C`, `R`, `P`), `:57-197` (the table has `S` and `P` but no `C` or `R`),
  `:218-230` (`isCertificate160FieldKey`); `packages/tax-engine/src/engine.ts:234-251`
  (the two guards); `apps/api/src/modules/filing/filing.service.ts:267-289` (the same
  guards).
- **Problem.** `isCertificate160FieldKey` returns true only for a `code_` prefix, a bare
  three-digit key, or a key present in `CERTIFICATE_160_CODES`. A fact whose `fieldKey`
  is the printed letter `C` or `R` fails all three tests, so neither the unknown-code
  guard nor the unsupported-code guard runs. The engine then falls through the
  `EMPLOYMENT_INCOME` switch (no `fieldKey` match), pushes the fact into
  `bucket.factIds` (`engine.ts:255`) and ignores the amount. The filing service takes the
  same path: no box, no `unsupportedCertificateCodes` entry. The table's own doc says
  "Anything absent here is reported as unknown by the engine rather than dropped"
  (`certificate160.ts:34`), and the 160F note 3 prints
  `C = cotisation de sécurité sociale complémentaire` and
  `R = rappels d'années antérieures` next to `S = salaire` and `P = pension`.
- **Impact.** A certificate line keyed `C` (complementary social-security contribution)
  or `R` (prior-year arrears) is lost from both the calculation and the filing package.
  No warning appears in `calc.warnings`, the fact is not listed in
  `unsupportedCertificateCodes`, and the package view has no cue. This is exactly the
  "never a silent drop" failure LEG-7's acceptance forbids (`audit-legal.md:228`). The
  same gap applies to any unknown bare letter code (e.g. `X`); only three-digit numerics
  and `code_`-prefixed keys can warn.
- **Evidence.** Engine probe (2025, resident, Class 1, one fact):
  `{category:'EMPLOYMENT_INCOME', fieldKey:'C', amount:7000}` → `grossIncome 0`,
  `netIncome 0`, `certificate warnings []`; the same for `R` and `X`. By contrast `S`
  → gross 20 000, `P` → gross 20 000, `code_102` → gross 5 000, `LRCP` →
  `deductions.lrcp` 1 000, `999` → "not supported" warning, `FD` → "withholding-base"
  warning. The table's key list is
  `101,102,103,105,141,S,P,LRCP,FD,FO,FFO,DS,FDS,CE,AC` — no `C`, no `R`. The source
  PDF note 3 is quoted above. The `103` note at `certificate160.ts:83` says "the letter C
  is the certificate letter code of note 3", but note-3 letters are the section-A
  gross-pay components, not the section-B `103` deduction, so the table currently
  conflates the two.
- **Fix direction.** Add `C` and `R` to the table with an explicit legal decision (C is a
  section-A gross-pay component, not the `103` social-security deduction; R is prior-year
  arrears), or mark them `supported: false` with an explanatory note. Broaden
  `isCertificate160FieldKey` so any bare letter code is certificate-shaped and therefore
  warns, and add tests for `C`, `R` and an unknown letter.

### M2 — FOREIGN_INCOME is mapped to a capital-gains line, not a foreign-income line

- **Position.** `apps/api/src/modules/filing/form100-case-map.ts:23`;
  `apps/api/src/modules/filing/filing.service.ts:386-396` (label at `:391`).
- **Problem.** The map assigns `FOREIGN_INCOME` to page 11 / sheet `D` / case `1101`, and
  the guide label is "Feuille D - revenus etrangers (methodes conventionnelles)". Official
  100F page 11 is headed "REVENUS NETS DIVERS"; case 1101 is the first line of section A,
  "Revenu provenant de la cession à titre onéreux de participations importantes dans des
  organismes à caractère collectif ... ou du partage total ou partiel de l'actif net
  investi" — a capital-gains line for substantial shareholdings. The miscellaneous
  "prestations diverses" line is 1117, not 1101. The 100F has no foreign-income sheet:
  treaty-exempt foreign income is declared in the "revenus exonérés" column of the
  relevant category sheet (S, P, CM, L), and the foreign tax credit is claimed on RD page
  19, "Impôt étranger imputable suivant les conventions contre les doubles impositions",
  cases 1081/1082. The `D` sheet is not a foreign-income bucket.
- **Impact.** A resident with foreign income (for example a German salary exempt with
  progression) who adds the `Foreign income — Art. 2 / treaties` fact
  (`FactsView.tsx:35`) is told to copy it onto line 1101, the substantial-participation
  capital-gains line. If followed, the exempt foreign income is declared as a Luxembourg
  capital gain and the RD 1081/1082 credit is not claimed — a wrong return, not just a
  missing number. This is distinct from the category-level collapses in W6: foreign income has no
  valid 100F line at all.
- **Evidence.** `100f-2025.pdf` page 11 header and section A (`1101` block), page 19 RD
  ("Impôt étranger imputable suivant les conventions", cases 1081/1082), page 12 EX
  ("Revenus extraordinaires"). The number 1101 exists on page 11; it is the *line* that
  is wrong.
- **Fix direction.** Do not emit a single `FORM_100` box for a generic `FOREIGN_INCOME`
  fact. Either require the income category/country at fact entry and map to that
  category's exempt case (S/P/CM/L), or emit an annex/instruction that says foreign
  income must be split by category and the credit claimed on RD 1081/1082. At minimum,
  stop labelling 1101 as foreign income.

### M3 — `BUSINESS_EXPENSE` is emitted on C/A 502, which is the spouse's profit column; the map is single-column

- **Position.** `apps/api/src/modules/filing/form100-case-map.ts:25`
  (`businessExpense: 502`), `:24` (`freelance: 501`);
  `apps/api/src/modules/filing/filing.service.ts:248-258` (`addBox` has no owner
  argument and never sets `personName`), `:398-420` (FREELANCE_INCOME / BUSINESS_EXPENSE);
  `packages/contracts/src/filing.ts:43` (`personName?` is declared but never populated).
- **Problem.** On 100F page 5 the four columns of section A are taxpayer non-exempt (501),
  spouse non-exempt (502), taxpayer exempt (503), spouse exempt (504) — the header is
  "Revenus non exonérés / Revenus exonérés" over "Contribuable / Contribuable
  conjoint/partenaire". Section A has no separate "business expenses" case; the net
  commercial profit goes in 501/502. The filing service emits the gross
  `FREELANCE_INCOME` amount to 501 and every `BUSINESS_EXPENSE` fact to 502, so the net
  profit line is overstated by the expenses and a primary taxpayer's expense is written
  into the spouse's profit column as a positive amount. The same single-column assumption
  sends a spouse's salary
  to 701 (page 7's spouse column is 702), pension to 801 (spouse 802), capital to 901
  (spouse 902) and rent to 1001 (spouse 1002). `addBox` receives no `ownerId`, and
  `personName` is never set.
- **Impact.** A single filer's business expense is reported on the spouse column (a line
  that should be blank/zero); a couple with a business expense or spouse-owned income
  gets amounts in the wrong column, and the spouse's income is attributed to the
  taxpayer. For a Class 2 return this is a wrong package. If the package is deliberately
  primary-taxpayer-only, 502 is still wrong for an expense; the other spouse-column cases
  are then a documented limitation rather than a regression.
- **Evidence.** `100f-2025.pdf` page 5 layout (header + 501-504 under section A; section C
  has the separate 509-516 receipts/expenses rows), page 7 (701-704 taxpayer/spouse ×
  non-exempt/exempt), page 9 (901-904), page 10 (1001-1004); `addBox` signature
  `:248-258`; grep finds no `personName` assignment and no `ownerId` use in the filing
  switch.
- **Fix direction.** Compute the net profit (`freelanceRevenue - businessExpenses`) and
  emit it to 501 (primary) or 502 (spouse), or drop the `BUSINESS_EXPENSE` box and put
  the expense detail in an annex; make `addBox` owner-aware and use the spouse cases
  (702, 802, 902, 1002, 1102) for facts owned by the spouse. Do not use 502 for an
  expense.

## 3. Worth considering

### W1 — old stored packages render "· case undefined"

- **Position.** `apps/web/src/components/FilingPackageView.tsx:260`;
  `apps/api/src/modules/filing/filing.service.ts:1012-1022`;
  `packages/contracts/src/filing.ts:28-45`.
- **Problem.** `getLatestFilingPackage` returns `fp.form100BoxesJson` verbatim. Packages
  generated before LEG-7 carry the old `boxNumber` field (a sheet letter) and no `sheet`,
  `caseNumber` or `kind`; the UI reads `box.sheet` / `box.caseNumber` and renders
  ` · case undefined`. It does not crash, which is what the brief required, but every
  pre-LEG-7 package now shows a broken sheet/case cell.
- **Suggestion.** Normalise on read-back or fall back in the UI
  (`box.sheet ?? (box as any).boxNumber ?? ''`, `box.caseNumber ?? 'n/a'`) and type the
  legacy shape explicitly.

### W2 — `unsupportedCertificateCodes` is not persisted and is never rendered

- **Position.** `packages/contracts/src/filing.ts:83`;
  `filing.service.ts:1012-1022` (read-back omits it); `FilingPackageView.tsx` has no
  reference to it.
- **Problem.** The list is returned only by the `generateFilingPackage` call. A reload
  through `getLatestFilingPackage` loses it, and the package view never displays it. A
  user who generates a package from a 160 containing an unmapped code sees the fact
  missing from the box table with no on-screen explanation; the engine warning lives on
  the calculator screen, not the package.
- **Suggestion.** Persist the list (or recompute it on read) and render it as a warning
  block in `FilingPackageView`.

### W3 — the 160 control sheet is empty for every scanned salary certificate

- **Position.** `filing.service.ts:291-298` (only populates `certificateImport` when
  `certificateCode` is set), `:709-713` (step 4); extractors
  `receipt-ai-vision.service.ts:226,237,247` and `documents.service.ts:398,409,420`
  emit `grossSalary`, `socialSecurity`, `withholdingTax`, not `code_101`/`code_103`/
  `code_105`.
- **Problem.** Both in-repo extractors produce canonical keys, so `certificateImport` is
  empty for a scanned 160 and the "Annexe - contrôle du certificat 160" step has no
  lines. The audit's evidence describes a 101/103/105 control list; the current
  predicate only fills it for actual code keys, not for the normal OCR path.
- **Suggestion.** Also push the 101/103/105 control lines when the canonical salary keys
  are present, or reword the step so it does not promise a control list it cannot fill.

### W4 — the CIM box is in the table but in no MyGuichet step

- **Position.** `filing.service.ts:666-726`: step 1 `fieldsToEnter: []` at `:677`, step 2
  filter `[5,7,8,9,10,11]` at `:687`, step 3 `[14,15,16,17]` at `:699`, step 5
  `19/20` at `:723`; `FORM100_CASES.cim` is page 2 (`form100-case-map.ts:37`).
- **Problem.** The package table shows "Enfants · case 228", but the step-by-step guide
  never lists it; only the CIM annex entry at `:640` mentions the request. A user
  following the steps can miss the CIM request.
- **Suggestion.** Add page 2 to step 1's `fieldsToEnter` (or add an Enfants step).

### W5 — the code tests cover four codes, not the table

- **Position.** `packages/tax-engine/test/tax-engine.spec.ts:1477-1557` (101/103/105,
  141, `code_999`, `code_FFO`); `apps/api/test/form100-case-map.spec.ts:17-25` (four
  pairs).
- **Problem.** No test exercises `102`, `S`, `P`, `LRCP`, `FD`, a bare `999`, a normal
  `grossSalary`/`socialSecurity`/`withholdingTax` key, or `C`/`R`. The behaviours I
  probed are correct for the first group, but the suite would not catch the M1 silent
  drop or a future table regression. The case-map spec asserts only four of the 22 pairs.
- **Suggestion.** Add a table-driven test over every `CERTIFICATE_160_CODES` entry plus
  an unknown numeric, an unknown letter, a canonical key and a `code_` key; assert the
  documented letter set (`S/C/R/P` plus the note-6 set) is present.

### W6 — several map entries are category-level, not line-level

- **Position.** `form100-case-map.ts:35` (`specialExpensesForfait` 1553), `:24`
  (`freelance` 501), `:21`/`:22` (`capital` 901 / `rental` 1001);
  `filing.service.ts:532-538`, `:399-407`.
- **Problem.** The map assigns one case per engine category. Three consequences are
  visible against the official form: (a) page 15 prints 1553 as "Total des dépenses
  spéciales couvertes par le minimum forfaitaire (cases 1301 à 1552)" and says the
  minimum substitutes if 1553 is lower; the app writes the 480/960 forfait there, so a
  user who also has 1471/1503/1525 can understate the total. (b) Page 5 C/A is the
  commercial profit sheet; an Art. 91 liberal profession belongs on page 6 sheet I
  (601/609-612), while the label says "commercial ou profession libérale (Art. 14 / 91)".
  (c) `CAPITAL_INCOME` → 901 and `RENTAL_INCOME` → 1001 also collapse sub-lines:
  901 is the 50%-exempt dividend/participation line on page 9 (interest is 915, foreign
  securities 903/907), and 1001 is gross rent on page 10 (charges are 1029/1030); the
  switch also sends a capital `withholdingTax` fact to 901 instead of the RD withholding
  line.
- **Suggestion.** Decide whether the product wants category-level or line-level
  precision. If line-level, split by `fieldKey` (e.g. `capitalIncome` interest →
  915, `capitalWithholding` → the RD withholding line, `rentalCharges` → 1029/1030,
  Art. 91 → I 601) and use the covered-DS total for 1553; if not, make the labels say
  what the line really is.

### W7 — the computed-credit loop still hardcodes page 20 / "Recap"

- **Position.** `filing.service.ts:577-586` (`20`, `"Recap"`, `"computed"`), against
  `FORM100_CASES.aep` at `:36` and `addBox` at `:248-258`.
- **Problem.** The brief says "the filing service uses the constants for every addBox";
  the six computed-credit calls do not. The values are correct today (page 20, Recap), but
  the invariant is not enforced and the implementation note "every call now passes
  FORM100_CASES" (`impl-leg7.md:122`) is inaccurate.
- **Suggestion.** Use `FORM100_CASES.aep.page` / `.sheet` with `caseNumber: 'computed'`
  and `kind: 'COMPUTED'`, or add a `RECAP` constant.

## 4. Record only

- `apps/api/src/modules/admin/admin.service.ts:295-297` still presents 101/103/105 as
  Form 100 box numbers, contradicting the new map; explicitly out of LEG-7 scope
  (`impl-leg7.md` §7.7).
- `apps/api/test/freelance-lifecycle.e2e-spec.ts:450-454` still looks for `boxNumber`
  21–24; stale against the current map, e2e not runnable here.
- `apps/web/src/components/FactsView.tsx:210,214` still counts only `grossSalary`/
  `code_101` and `withholdingTax`/`code_105` in the summary tiles; facts keyed `code_102`,
  `S`, `P`, `LRCP` or `code_141` are counted by the engine but not by those tiles.
- `apps/api/test/form100-case-map.spec.ts:13` uses `/^\d/` for the case number; the
  current map is correct, but `'701x'` would pass. Tighten to `/^\d{3,4}$/`.
- `FilingPackageView.tsx:260` shows "Recap · case computed" for computed credits; the
  `kind` field is not displayed. Cosmetic.
- `.tools/syntax_check.cjs` checks 32 files, but not `certificate160.ts` or `engine.ts`;
  those are covered by `tsc` and the tests.

## 5. Scope and what was not covered

**Verified.** Read the brief, `audit/audit-legal.md:211-228`, `impl-leg7.md`, all changed
files (`certificate160.ts`, `engine.ts`, `form100-case-map.ts`, `filing.service.ts`,
`packages/contracts/src/filing.ts`, `FilingPackageView.tsx`, `index.ts`,
`tax-engine.spec.ts`, `form100-case-map.spec.ts`), and the two extractors.

- Ran the prescribed six test files: **147 tests, 147 pass, 0 fail** (26 suites).
- `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json`: exit **0**.
- `node .tools/syntax_check.cjs`: exit **0**, **32** files `ok`.
- Engine probe (throw-away, no file written): `S` 20 000, `P` 20 000, `code_102` 5 000,
  `LRCP` 1 000, `code_141` → mortgage 1 000 (test), `999` warning + unchanged, `FD` warning + unchanged,
  `grossSalary` 40 000 / no warning; `C`, `R`, `X` no warning and 0.
- Extracted all 20 pages of `100f-2025.pdf` with `pypdf` and checked every one of the 22
  case numbers against its claimed page: all **22/22** occur there. Manually read the
  section around each number; the four called-out pairs (7/S/701, 16/DS/1601, 19/RD/1901,
  2/Enfants/228) are correct. Read the layout extraction of pages 5, 7, 9 and 10; the
  four-column header there (taxpayer/spouse × non-exempt/exempt) is the basis for M3.
  Read `tmp/160f-25.pdf` notes 3, 6 and 8; the note-6 set
  (FD/FO/FFO/DS/FDS/CE/AC/LRCP) matches the table.

**Not covered.**

- The official ACD numeric-code list for 101/102/103/105/141. The paper 160F prints
  letters only, and `impl-leg7.md` §7.1 admits the numeric list is unsourced; I could not
  verify `141 = mortgage interest` against an official list. Treat those five as
  brief-supplied data, not independently verified.
- API e2e and browser/UI runs are unavailable in this environment; `filing.service.ts`
  is not included in `tsconfig.test.json`, so it was checked by `syntax_check`, the
  filtered `tsc -p tsconfig.api.json` run (no errors in the changed filing files beyond
  the pre-existing missing `@nestjs`/`@prisma` modules) and code review, not a project
  typecheck. `apps/web` was not built or typechecked.
- Prisma schema/migrations and a real database were not run; `unsupportedCertificateCodes`
  persistence and the old-package read path are assessed statically.
- The page/sheet pairing is verified by text extraction and manual heading reading, not by
  a layout-aware PDF parser; text extraction flattens the form, so a number that appears
  on the right page is not proof of the exact field label in every case. The
  foreign-income mismatch is an exception where the heading itself is unambiguous.