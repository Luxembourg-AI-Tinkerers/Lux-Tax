# LEG-6 review — Art. 119 n° 3 three-year Class 2 window and the Class 2-without-spouse path

Reviewer: independent re-check against the brief, `audit/audit-legal.md` LEG-6 and
`docs/lir-118-121-bareme-2025-2026.md` Finding 4. Read-only; no source file was modified.

## 1. Conclusion

**Not deliverable as-is.** One must-fix, in the correctness/legal layer: the "Class 2 without spouse"
guarantee only holds for a household with exactly one ACTIVE member. Any second ACTIVE membership —
a VIEWER invited through the existing UI, or the deceased/former spouse's record, which cannot be
removed because the household API has no way to end a membership — is treated as the spouse. The flag
is then false, `isCollective` is true, and the couple's AEP (EUR 4,500) and doubled Art. 111 /
epargne-logement / mortgage caps reach a filer who has no spouse. Measured on the engine: final tax
EUR 1,658.50 too low, no warning.

The rest of the delivery holds: the window is inclusive on both ends (2024–2027 for a 2024 death,
2023–2026 for a 2023 divorce), the warning fires when the year is missing, the tariff really changes
(14,682 vs 26,764 at RIA 100,000), the single 1,500 tranche is used without a spouse, re-derivation
prevents a stale class, and the regression baseline stands (113/113 tests, tsc exit 0, syntax exit 0).

## 2. Must fix

### M1 — a second ACTIVE member is read as a spouse, so the couple's extras still leak to a spouse-less filer

- **Position.** `apps/api/src/modules/calculations/calculations.service.ts:34` (member query:
  `where: { status: 'ACTIVE' }`, no role filter), `:79` (`spouseMember = members.length > 1 ?
  members[1] : null`), `:111-114` (`class2WithoutSpouse` requires `!spouseMember`);
  `packages/tax-engine/src/engine.ts:95-96` (`isCollective` requires only `spouseUserId`);
  `packages/tax-engine/src/deductions.ts:159-160` (plafond multiplier) and `:263` (AEP).
  Enablers: `packages/validation/src/household.schema.ts:15-18` admits `VIEWER`,
  `apps/web/src/components/InviteModal.tsx:120` offers "Viewer (Read-only)", and
  `apps/api/src/modules/households/households.controller.ts:34-79` has no DELETE/PATCH endpoint, so a
  membership can never be removed or deactivated.
- **Problem.** The "spouse" is chosen by array position, not by role or household state. A widow(er) or
  divorced filer inside the window who has a VIEWER membership, or whose deceased/former spouse is
  still stored ACTIVE (the only possible state — there is no removal path), gets `spouseUserId` set.
  `class2WithoutSpouse` is therefore false and `isCollective` true, on the engine side purely because a
  second membership row exists.
- **Impact.** The couple's collective extras are granted to a filer with no spouse: Art. 129b AEP up to
  EUR 4,500, the doubled Art. 111 / epargne-logement / mortgage plafonds (multiplier 2 instead of 1),
  the doubled Art. 115 n° 15 tranche (reporting-only today), and the second member's facts, if any, are
  bucketed as spouse income. Read-only probe (2025, resident, gross 101,020, `spouseHasProfessionalIncome:
  true`, `taxClass: CLASS_2`): flag path AEP 0, final 15,709.74; same input with a second member as
  `spouseUserId` (a VIEWER or the deceased's record): AEP 4,500, final 14,051.24 — **EUR 1,658.50 too
  low, zero warnings**. With EUR 1,000 of Art. 111 declared the cap doubles 672 → 1,000 (+328 deduction).
  No test covers this configuration (`packages/tax-engine/test/tax-engine.spec.ts:1250-1304`).
- **Evidence.** The code above; the probe output; the implementation's own §8.4 #5 states that a
  deceased spouse still stored ACTIVE "keeps `spouseMember` non-null, so the service would not set the
  flag and the couple's extras would still apply" — the risk was seen, nothing prevents it, and the
  missing membership end-point makes it permanent.
- **Fix direction.** Select the spouse by role (exclude VIEWER) and by household state (a membership
  ended by death or divorce must not count), not by `members[1]`; give the household a way to end a
  membership while keeping the death-year joint data possible; warn when a WIDOWED/DIVORCED window case
  has a second ACTIVE member. Changing only the flag is not enough — `isCollective` and `spouseUserId`
  must stop seeing the phantom spouse too.

## 3. Worth considering

### W1 — the window warning over-fires for a divorced filer who answered "no"

- **Position.** `apps/api/src/modules/calculations/class-resolution.ts:53-54`; call site
  `calculations.service.ts:229-230`.
- **Problem.** With `class2BeforeEvent: false` and no divorce year the class is correctly Class 1/1a,
  but the message says the window "cannot be checked because the year of death/divorce is missing; the
  default class is applied", implying a provisional result the user could fix. The five-year condition
  already rules Class 2 out.
- **Suggestion.** Fire only when `class2BeforeEvent !== false`, or reword to say the year is only
  relevant when the five-year condition is claimed.

### W2 — the flag case is reported and audited as a collective assessment

- **Position.** `packages/tax-engine/src/engine.ts:89` (`assessmentMode` defaults to COLLECTIVE for
  Class 2), `calculations.service.ts:255-264` (audit event `newValue`), `apps/web/src/components/
  TaxCalculatorView.tsx:308` (display).
- **Problem.** A widow assessed alone is shown and audited as "COLLECTIVE", and nothing in the result
  records that the Class 2 tariff came from Art. 119 n° 3 rather than a couple's joint assessment.
- **Suggestion.** Echo the flag (or a "basis" field) in the result and in the audit `newValue`, or add
  a distinct label without re-routing the Art. 3ter branches.

### W3 — spouse answers survive a status change and the AEP checkbox is always shown

- **Position.** `apps/web/src/components/QuestionnaireView.tsx:278` (the status button sets only
  `maritalStatus`), `:755-760` (the "My spouse also has professional income — Art. 129b AEP EUR 4,500"
  checkbox is outside any marital-status gate), `calculations.service.ts:146`.
- **Problem.** Switching MARRIED → WIDOWED/DIVORCED keeps `spouseHasProfessionalIncome`,
  `spouseIsConjointAidant`, `spouseRetiredUnder3Years`, `class2BeforeEvent` and both event years in the
  submitted object, and the AEP checkbox stays visible to a widow. A stale `true` is what turns M1's
  phantom spouse into the EUR 4,500 AEP.
- **Suggestion.** Clear spouse-specific answers when the status leaves MARRIED/PACS and gate the spouse
  block on the status.

### W4 — the new tranche line reports an exemption the engine does not apply

- **Position.** `packages/tax-engine/src/engine.ts:526-540` (new `LIR-ART-115-15`), test
  `tax-engine.spec.ts:1275-1295`.
- **Problem.** `capitalAfterTranche` is provenance-only: the tranche is never deducted from the taxable
  base (pre-existing, implementation §8.4 #4). The test's "500 taxable" pins a reporting number that
  does not move `taxableIncome` or `finalTaxLiability`, and the description calls the tranche
  "exemptee" while the base still contains the full 2,000.
- **Suggestion.** Label the line as "not deducted from the taxable base" until the deduction is wired,
  or wire it and assert the taxable income.

## 4. Notes

- N1. A future or mistyped event year (e.g. 2042 for 2024) is outside the window with no warning
  (`class-resolution.ts:35-39`; schema accepts 1900–2100) — the filer silently gets Class 1a / Class 1.
- N2. Rule packages exist for 2025, 2026 and 2028 only (`packages/tax-engine/src/rules/index.ts:12-15`);
  `calculations.service.ts:70-74` refuses 2024 and 2027, so the window's first and last years cannot be
  calculated today (the class logic itself is year-generic).
- N3. `.tools/syntax_check.cjs` covers 29 files (`.tools/syntax_check.cjs:3-32`), exit 0; the
  implementation report's "30 files" and the brief's "28/28" are each off by one.
- N4. The implementation report's gate references (`engine.ts:798/:838`) are stale; the code is at
  `engine.ts:816` and `:856`.
- N5. `tmp/probe-leg6.ts` is still in the tree (implementation §1 says "delete if unwanted").
- N6. `CLASS_2` + `INDIVIDUAL_PURE` + flag is not refused by the engine (implementation §8.4 #3);
  unreachable from the service, but it would apply the Class 2 tariff inside a pure individual mode.

## 5. Review scope and what was not covered

**Standard used.** The five VERIFY points of the brief; LEG-6 acceptance in
`audit/audit-legal.md:189-205` (widow since 2024 → Class 2 2025–2027; divorce 2023 with five prior
years → Class 2 2025; otherwise Class 1/1a; tests for all three); `docs/lir-118-121-bareme-2025-2026.md:
158-200` Finding 4.

**Claims checked, with evidence.**

- Window: `class-resolution.ts:35-39` uses `elapsed >= 0 && elapsed <= 3`; tests assert 2024/2025/2027
  → CLASS_2 and 2028 → CLASS_1A for a 2024 death, and 2025/2026 → CLASS_2, 2027 → CLASS_1 for a 2023
  divorce; `class2BeforeEvent: false` → CLASS_1 / CLASS_1A; missing year → default plus warning.
  Inclusive on both ends.
- Tariff switch: the flag path gives baseTax 14,682 / final 15,709.74, the downgraded path 26,764 /
  28,637.48 at RIA 100,000 — the window changes the tariff, not only the label.
- Couple extras without a spouse: `isCollective` requires `spouseUserId`, the deduction multiplier and
  the AEP require `ctx.spouse`, the tranche is 1,500 vs 3,000, the FDS is 480; the tranche test shows
  1,500/500 without a spouse and 3,000/0 with one.
- Expected Class 1 figures: Class 2 at 100,000 = 14,682 matches the ACD Splitting example (7,341 × 2,
  fetched 2026-11-08). Class 1 at 100,000 = 26,764 is the rule package's bracket arithmetic (the 50,000
  anchor 7,341 plus the 36/38/39 % bands up to 100,000); 24,443 is the **Class 1a** cote at 100,000
  (Finding 4's table; `class1aTax(100_000)` = 24,443.04). The brief's "Class 1 = 24,443" was a mislabel;
  the implementation's correction to 26,764 is right.
- Re-derivation and no stale class: `calculations.service.ts:99-105` passes `null` for the stored class
  whenever a tax profile exists, and `:235` persists the re-derived class; the questionnaire save
  updates `maritalStatus` and `answersJson` together (`questionnaire.service.ts:71-82`).
- UI: inputs render only under `WIDOWED` (`QuestionnaireView.tsx:292`) and `DIVORCED` (`:314`); the save
  sends the whole `answers` object (`:65`); loaded answers include the new fields (`:48-52`).
- Regression: 113/113 tests, 18 suites, exit 0; LEG-1 through LEG-5 suites present and green;
  `tsc -p tsconfig.test.json` exit 0; syntax check exit 0.

**Not covered, and why.**

- API e2e (Nest + Postgres unavailable). `calculations.service.ts` is outside `tsconfig.test.json`, so
  the `workspace.taxYear` argument, `result.warnings.push(...)`, the `class2WithoutSpouse` computation and
  the audit event were read and syntax-checked, not executed.
- Web UI not rendered or type-checked (`react` / `@types/react` absent); conditional rendering, binding
  and round-trip of the three fields were verified by reading and transpile only.
- Zod schema not executed (`zod` absent); 1899 / 2101 / 2024.5 rejection is untested.
- Art. 119's own consolidated text was not retrieved (Legilux returns "version consolidee ... pas
  disponible" for every date on 2026-11-08). The boundaries were cross-checked against the brief,
  Finding 4 and a KPMG summary ("tax class 2 for the next 3 tax years"), which agree with elapsed 0..3.
- M1's euro figures come from read-only probes written to `%TEMP%` (`leg6-review-*.ts`), not from the
  repository test suite.
