# LEG-6 missing event year — round 4 review

Reviewer: independent re-check against the brief's four VERIFY points, `audit/review-leg6-round3.md` §2 M1,
`audit/impl-leg6.md` §11 and the current `class-resolution.ts` / `calculations.service.ts`. Read-only on the source;
this report is the only file written.

## 1. Conclusion

**Not clean: one must-fix remains, so allPass = false — but it is not the round-3 blocker.** The missing-year leak is
closed: `spouseEndsAtEvent` is status-based, so a WIDOWED/DIVORCED filer with an ACTIVE `CO_FILER` and no event year
now produces exactly the spouse-less result (2025 probe: 26 154.01, `spouseUserId = null`, AEP 0; with a death year
2024: 15 709.74, `class2WithoutSpouse = true`), identical to the same household without the stale row. The remaining
defect is a different spouse-scaled input that the nulling does not reach: an `art111bisContributors` value of 2
carried over from the marriage still doubles the Art. 111bis cap for a filer assessed alone, worth EUR 1 335.36 in the
probe (§2 M1). Under the brief's acceptance sentence ("any remaining couple benefit for a WIDOWED/DIVORCED filer is a
blocker") that blocks. Everything else in VERIFY 1–4 passes: the nulling and the warning fire for every
WIDOWED/DIVORCED case, the flag is set for Class 2, no AEP / double tranche / couple FDS / couple deduction multiplier
survives, the Class 2 window still uses the event year with a warning when it is missing, and the gates are 127/127
tests, `tsc` exit 0, `syntax_check` 29/29 ok.

## 2. Must fix (1)

### M1 — A stale `art111bisContributors: 2` still doubles the Art. 111bis cap for a spouse-less WIDOWED/DIVORCED filer

- **Position.** `apps/api/src/modules/calculations/calculations.service.ts:188` (the answer is passed through
  unchanged), `packages/tax-engine/src/engine.ts:692` (the default is 2 only when a spouse exists),
  `packages/tax-engine/src/deductions.ts:203-206` (cap = `art111bisCapPerPerson × contributors`),
  `packages/validation/src/questionnaire.schema.ts:61` (`1..2`), `apps/web/src/components/QuestionnaireView.tsx:717-733`
  (generic deductions block, placeholder "default 2 if married"),
  `apps/web/src/components/QuestionnaireView.tsx:278` (a status change keeps the previous answers).
- **Problem.** The status gate nulls the spouse id, but the questionnaire's souscripteur count still reaches the
  engine. A widow(er) who entered 2 while married keeps 2 after the status changes (only `maritalStatus` is rewritten,
  `QuestionnaireView.tsx:278`), and `calculateDeductions` multiplies the per-souscripteur cap by 2 although `people`
  holds one person (`deductions.ts:165`). The engine already defaults to 1 when there is no spouse
  (`engine.ts:692`), so only an explicit 2 leaks.
- **Impact.** 2025, resident, salary 101 020, third-pillar premiums 6 500, WIDOWED with a stale `CO_FILER`, no death
  year: `art111bisDeduction` **6 400** and `finalTaxLiability` **21 438.52**, against **3 200** and **22 773.88** with
  the count at 1 — **EUR 1 335.36 too low** on one return. The same figure appears with no `CO_FILER` row at all and
  for a SINGLE filer, so this is not the year branch; it is the same "spouse-era answer survives the nulled spouse"
  family. For 2026 the cap is 4 500, so the excess rises to 4 500.
- **Evidence.** The four positions were read. Probe `%TEMP%\probe-leg6-r4c.ts` mirrors the service chain
  (`selectFilerMembers` → `spouseEndsAtEvent` → `spouseUserId` → `deriveTaxClass` → `class2WithoutSpouse` →
  `LuxembourgTaxEngine.calculate`) and prints the two deductions; the inputs and outputs are the ones above. The
  project's own legal note states the cap is per person, each spouse calculated individually
  (`lux-deductions-2025-2026-research.md:196`), so a second souscripteur has to be a second assessed person.
- **Fix direction.** Cap the count at the number of assessed persons — `Math.min(ctx.art111bisContributors,
  people.length)` at `deductions.ts:205`, or pass 1 from the service when `spouseUserId === null`; optionally stop
  persisting a 2 once the status is WIDOWED/DIVORCED.

## 3. Worth considering (2)

### W1 — `FORMER_SPOUSE_WARNING` calls "co-filer" a row that is usually the PRIMARY_FILER

- **Position.** `calculations.service.ts:24-25,267-269`; `class-resolution.ts:192-203`.
- **Problem.** The canonical widow household is widow CO_FILER + deceased PRIMARY_FILER. `selectFilerMembers(members,
  actorId)` promotes the acting CO_FILER and takes the remaining PRIMARY_FILER as the spouse
  (`class-resolution.ts:192-203`), so `selectedSpouseMember` is a PRIMARY_FILER while the text says "still an ACTIVE
  co-filer".
- **Impact.** The exclusion is right; the audit line and the user-facing warning point at a role the excluded row does
  not have. Cosmetic, but it is the only explanation the user gets for the missing spouse.
- **Suggestion.** Neutral wording ("another ACTIVE household member") or name the actual role.

### W2 — The mortgage provenance reports the couple multiplier the deduction did not use

- **Position.** `engine.ts:781` against `deductions.ts:159-163`.
- **Problem.** `inputs.multiplier` is `1 + (assessmentMode === 'INDIVIDUAL_PURE' ? 0 : 1) + children`; for a
  spouse-less Class 2 filer `assessmentMode` is `COLLECTIVE` (`engine.ts:88-89`), so the audit line says 2 while the
  deduction used `1 + children`.
- **Impact.** Probe: `LIR-ART-98-5-105` reports `multiplier: 2` with `outputAmount: 4 000` (= the 4 000 band × 1) on
  the widow scenario; the amount is correct, the provenance contradicts it, so the result cannot be reconstructed
  from its own audit trail.
- **Suggestion.** Derive the reported multiplier from the same `isCollective` the deduction uses.

## 4. Notes (9)

- `syntax_check.cjs` lists **29** files (`.tools/syntax_check.cjs:3-32`), all `ok`, exit 0; the brief's "30/30" is off
  by one, as in rounds 2 and 3.
- `assessmentMode` still reports `COLLECTIVE` for the spouse-less Class 2 case (round-3 W3); cosmetic, unchanged.
- Facts owned by the excluded spouse still bucket to the primary (`engine.ts:191-193`), so that income remains in the
  base; not a benefit, but the return is not actually split.
- A non-filer actor (VIEWER) would keep the deceased `PRIMARY_FILER` row as primary
  (`calculations.service.ts:96-101`); `POST calculate` has no `@Roles` (round-3 §4, unchanged).
- The engine warning "Class 1a selected without … widow status" fires for a widow without a death year (observed in the
  probe); misleading, pre-existing (`engine.ts:870-874`).
- A future death/divorce year is outside the window and raises no `classWindowWarning` (the warning only fires when the
  year is missing), so a data-entry error is silent and the class falls to 1a/1.
- The status rule has no tax-year dimension: a 2025 workspace with a 2026 death is spouse-less although the couple was
  married during 2025. This follows VERIFY 1 verbatim ("with or without a year"), so it is a product decision, not a
  defect of this delivery.
- `tmp/probe-leg6.ts` and `tmp/leg3-probe.ts` are still in the tree.
- The `LIR-ART-111bis` provenance `inputs` omits `contributors`, so a 6 400 deduction cannot be reconstructed from
  declared 6 500 and cap 3 200.

## 5. Review scope and what was not covered

**Standard used.** The four VERIFY points; round-3 M1 and its fix direction; `impl-leg6.md` §11; the brief's
acceptance sentence; the five-file gate; `lux-deductions-2025-2026-research.md` for the 111bis cap basis.

**Checked.**

- Helper: read `class-resolution.ts:173-203` (`selectFilerMembers`) and `:218-232` (`spouseEndsAtEvent`, status-only,
  `_answers`/`_taxYear` unread); `class-resolution.spec.ts` is 31 tests (4 + 7 + 6 + 8 + 6), all green.
- Service: read `calculations.service.ts:44,96-101,116-118,144-147,188,259-269`; one call to the gate, one nulling
  (`spouseMember = spouseIsFormer ? null : selectedSpouseMember`), one warning guarded by
  `spouseIsFormer && selectedSpouseMember`, `class2WithoutSpouse` from `!spouseUserId`.
- Engine/deductions: `engine.ts:88-96,180-193,526,636,692,816-818,856-866,1303`; `deductions.ts:159-165,203-206,230-235,
  257-263`. Every couple extra (`isCollective`) requires `Boolean(spouseUserId)` / `ctx.spouse`; the AEP is gated at
  `deductions.ts:263`.
- Form/schema: `QuestionnaireView.tsx:278,292-350,717-733`; `questionnaire.schema.ts:32,34,61`.
- Change surface: after `audit/review-leg6-round3.md` (20:57:31) only `class-resolution.ts` (20:58:45),
  `calculations.service.ts` (20:58:52) and `class-resolution.spec.ts` (20:59:16) changed — matches `impl-leg6.md`
  §11.1; no engine, deductions, schema or UI edit this round.
- Gates: five files → 127 tests / 20 suites / 127 pass / 0 fail, exit 0; `tsc -p tsconfig.test.json` exit 0;
  `syntax_check.cjs` exit 0 over 29 files. LEG-1/2/3/4/5/6, "Class 2 without spouse", the Art. 118 tariff and the
  Art. 154ter CIM describes all ran green in that run.
- Probes: read-only `%TEMP%\probe-leg6-r4*.ts` importing the current `@luxtax/tax-engine` and `class-resolution`,
  mirroring the service decision (selection → gate → null → class → flag → `calculate`). Numbers in §2 M1 and §3 W2;
  the married control (two salaries, `bothSpousesProfessional`) still yields AEP 4 500, FDS 960, tranche 3 000, so the
  nulling, not a global change, is what removes the widow's couple extras.

**Not covered, and why.**

- `calculateTax` was not executed: `calculations.service.ts` is outside `tsconfig.test.json`, and
  `tsc -p tsconfig.api.json` fails at baseline on missing `@nestjs/*`, `@prisma/client`, `fastify`. The service is read
  and syntax-checked, not run or type-checked.
- No database/Nest e2e, so the real `household.members` rows and the persisted `calculationResult` were not observed.
- The web form was read, not rendered (`react` / `@types/react` absent); the "status change keeps answers" path is
  taken from the `setAnswers({ ...answers, maritalStatus: status })` handler, not exercised in a browser.
- The legal question whether the death year itself should stay a collective year was not assessed; the brief
  prescribes `<=`.
- Round-3 W1/W2/W4 were re-read, not re-tested; unchanged by this round.