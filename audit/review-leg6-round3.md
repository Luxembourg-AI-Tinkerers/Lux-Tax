# LEG-6 former/deceased spouse — round 3 review

Reviewer: independent re-check against the brief, `audit/review-leg6-round2.md` M1, `audit/impl-leg6.md` §10 and the
current `class-resolution.ts` / `calculations.service.ts`. Read-only on the source; this report is the only file
written.

## 1. Conclusion

**Not deliverable as-is: one must-fix remains**, in the correctness layer. The actor-led selection and the new
`spouseEndsAtEvent` gate close round-2 M1 whenever the death/divorce year is on or before the tax year: a widow(er)
with a stale ACTIVE `CO_FILER` now produces exactly the spouse-less result (2025 probe: 15 709.74, `spouseUserId =
null`, `class2WithoutSpouse = true`, former-spouse warning). The VIEWER half holds, the actor swap is correct for the
"you / spouse" questionnaire labels, and the gates pass: 127/127 tests (20 suites, 0 fail), `tsc -p
tsconfig.test.json` exit 0, `syntax_check.cjs` exit 0 over 29 files.

What remains is the **missing-event-year** branch. `spouseEndsAtEvent` returns false for an undefined year, the
service therefore keeps the stale `CO_FILER` as `spouseUserId`, and the Art. 129b AEP (EUR 4 500) is still granted on
`ctx.spouse` alone — measured at **EUR 1 877.85 too low** with only the widow's salary, and **EUR 3 649.05 too low**
when the former spouse's salary fact is still in the return. Round-2 M1's fix direction was status-based ("for
`maritalStatus` WIDOWED / DIVORCED, no `CO_FILER` can be a jointly assessed spouse"); the implemented gate is
year-based, so a blank year is not covered. If that fallback is deliberate, the acceptance sentence needs the
exception written down; as written, a deceased/former spouse still restores a benefit.

## 2. Must fix

### M1 — A WIDOWED/DIVORCED filer with no death/divorce year keeps the stale CO_FILER and still gets the Art. 129b AEP

- **Position.** `apps/api/src/modules/calculations/calculations.service.ts:113-115` (the only gate),
  `apps/api/src/modules/calculations/class-resolution.ts:220-234` (undefined year returns false),
  `packages/tax-engine/src/deductions.ts:257-263` (AEP needs only `ctx.spouse`),
  `packages/validation/src/questionnaire.schema.ts:32,34` (year optional),
  `apps/web/src/components/QuestionnaireView.tsx:292-312,314-350` (year rendered but not required),
  `apps/web/src/components/QuestionnaireView.tsx:756-766` (spouse-professional-income box not status-gated),
  `apps/api/test/class-resolution.spec.ts:191-231` (every gate test supplies a year).
- **Problem.** When `spouseDeathYear` / `divorceOrSeparationYear` is undefined, `spouseIsFormer` is false,
  `spouseMember` stays `selectedSpouseMember`, and `spouseUserId` is passed non-null. The class falls to 1A (the
  window is not checkable), so the doubled tranche / couple multiplier / joint abattement are off, but
  `deductions.ts:263` grants the AEP on `ctx.spouse` alone, and the engine keeps a second person for the per-person
  frais and credits. No former-spouse warning is emitted (`calculations.service.ts:264-266` requires
  `spouseIsFormer`).
- **Impact.** Read-only probe in `%TEMP%`, importing the current engine and `class-resolution`, mirroring the service
  decision (2025, resident, `bothSpousesProfessional: true`):
  - widow, no death year, stale `CO_FILER`, facts = her 101 020 salary: **24 276.16** vs **26 154.01** spouse-less
    (totalDeductions 5 520 vs 1 020, i.e. the 4 500 AEP); **EUR 1 877.85 too low**, no former-spouse warning;
  - same with the former spouse's 40 000 salary fact in the return: **22 504.96** vs **26 154.01**
    (totalDeductions 6 060; credits 1 541.15 vs 0); **EUR 3 649.05 too low**;
  - with the AEP box unticked, the split case is still **24 382.81** vs **26 154.01** (**EUR 1 771.20**), because the
    former spouse remains a second person for the frais/credits;
  - divorced, no divorce year, `class2BeforeEvent: true`: **26 759.63** vs **28 637.48** (**EUR 1 877.85**).
  - Control: with the year present (widow death 2024, divorced 2023) the stale and spouse-less probes are
    **identical** (15 709.74), so the gate itself works.
- **Evidence.** `spouseEndsAtEvent` returns false for an undefined year (`class-resolution.ts:225-231`); the service's
  only use is `calculations.service.ts:113-115`; no other branch nulls the spouse. The year fields are optional in
  the schema (`:32,34`) and in the form (`QuestionnaireView.tsx:292-312,314-350`), and there is no readiness task for
  them (`spouseDeathYear` has no match under `apps/api/src/modules/questionnaire`). The seam test hard-codes
  `spouseDeathYear: 2024` (`class-resolution.spec.ts:223-231`); no test combines WIDOWED/DIVORCED, a missing year and
  a `CO_FILER`.
- **Fix direction.** Either require the year for WIDOWED/DIVORCED (schema + form; a blank year can then not reach the
  calculation), or have the service treat a missing year as "no current spouse" for the spouse-dependent inputs and
  warn, leaving the helper's `false` exactly as VERIFY 2 specifies. Add a decision test: WIDOWED + no year + ACTIVE
  `CO_FILER` -> spouse null, no AEP, result equals the spouse-less probe. The class can stay 1A + `classWindowWarning`.

## 3. Worth considering

### W1 — The member query still has no `orderBy`, so the spouse pick is DB-order dependent

- **Position.** `apps/api/src/modules/calculations/calculations.service.ts:44`;
  `apps/api/src/modules/calculations/class-resolution.ts:192-208`.
- **Problem.** With two `CO_FILER` rows, "first `CO_FILER` != primary" is whatever order Prisma returns. The
  actor-led primary no longer depends on it, but the spouse choice does, and with it `travelUnitsSpouse`,
  `invalidityRateSpouse` and the fact bucket.
- **Suggestion.** Add `orderBy: { joinedAt: 'asc' }` (or `id`) to the members include, or pass an explicitly ordered
  array. Round-2 W1; unchanged.

### W2 — `FilerMemberInput` carries no status, so the VIEWER guarantee is caller-dependent

- **Position.** `apps/api/src/modules/calculations/class-resolution.ts:128-137,177`;
  `calculations.service.ts:44`.
- **Problem.** The function is exported and pure; a future caller passing `PENDING_INVITATION` or `REMOVED` rows
  would get a `CO_FILER` spouse back with no error. The ACTIVE filter exists only in the service query.
- **Suggestion.** Add `status` to the input and filter inside, or state the precondition in the JSDoc and name the
  function for it. Round-2 W2; unchanged.

### W3 — `assessmentMode` still reports `COLLECTIVE` for the spouse-less Class 2 case

- **Position.** `packages/tax-engine/src/engine.ts:88-96,816`; probe output `mode=COLLECTIVE` for the 15 709.74
  widow case.
- **Problem.** The result and the audit description say collective while `class2WithoutSpouse` has switched the
  couple's extras off. Cosmetic/reporting, but it contradicts "assessed alone" in the same result.
- **Suggestion.** Report `INDIVIDUAL_PURE` (or a dedicated label) when `class2WithoutSpouse` is set, or explain the
  flag in the audit string. Round-2 note; unchanged (`impl-leg6.md` §8.4 #2).

### W4 — The service composition has no executable test

- **Position.** `apps/api/test/class-resolution.spec.ts:223-231` (selection + gate only);
  `tsconfig.test.json` `include` (no `calculations.service.ts`).
- **Problem.** The nulling, the flag and the warning are read and syntax-checked, not executed; the seam test stops
  one layer before `calculateTax`. `tsc -p tsconfig.api.json` fails at baseline on missing `@nestjs/*` /
  `@prisma/client`, so the service is not cleanly type-checked either.
- **Suggestion.** Extract the selection -> gate -> null/warn decision into a pure helper (or export it) and test it
  directly, including the missing-year case; keep `calculateTax` as the thin Prisma/Nest wrapper.

## 4. Notes

- `syntax_check.cjs` lists **29** files (`.tools/syntax_check.cjs:3-32`), all `ok`, exit 0; the brief's "30/30" is off
  by one (the same count as round 2).
- `tmp/probe-leg6.ts` is still in the tree (`impl-leg6.md` §10.4 #5).
- `apps/api/src/modules/filing/annex-pdf.service.ts:48` and `apps/api/src/modules/freelance/freelance.service.ts:271-273`
  still select positionally; out of scope, unchanged.
- Two `PRIMARY_FILER` rows resolve to the first and no spouse; invalid data, but fails safe.
- `POST calculate` has no `@Roles` (`calculations.controller.ts:19-27`); any ACTIVE member, including VIEWER, can
  trigger and persist a calculation. Pre-existing; on a widow household a non-filer actor would keep the deceased
  `PRIMARY_FILER` row as primary (the gate nulls the widow as spouse). Round-2 §10.4 #4 says real callers are filers.
- A widow outside the three-year window (e.g. death 2015, tax year 2025) gets `CLASS_1A` and the engine warning
  "Class 1a selected without ... widow status" (`engine.ts:870-874`), which is misleading because she is widowed.
  Pre-existing, not caused by this round.
- The gate treats the death year itself as spouse-less (`<=`); the brief's VERIFY 2 prescribes it, so it is compliant.
  Whether the death year should remain a collective year is a separate legal question, not assessed here.

## 5. Review scope and what was not covered

**Standard used.** The four VERIFY points; round-2 M1 and its fix direction; `impl-leg6.md` §10; the brief's
acceptance sentence ("a former/deceased spouse still restoring couple benefits is a blocker"); the five-file gate.

**Checked.**

- Helper: read `class-resolution.ts:173-208` (`selectFilerMembers`) and `:220-234` (`spouseEndsAtEvent`); ran the
  file alone -> 31/31 tests, 5 suites, 0 fail. Actor-first, VIEWER filtered before either pick, lone `CO_FILER`
  primary with no spouse, two `CO_FILER`s first/second, actor promoted from `CO_FILER` keeps the remaining
  `PRIMARY_FILER` as spouse.
- Service: read `calculations.service.ts:44,94-115,141-144,176,259-266`; one helper call, one gate, one warning, no
  positional member selection left in this service.
- Engine: `isCollective` `engine.ts:95-96`; tranche `:526`; abattement `:636`; effective class `:816`; flag warnings
  `:856-865`; deductions `deductions.ts:159-163,230-235,257-263`.
- Membership lifecycle: `households.controller.ts:34-81` has only `POST /`, `GET /`, `GET /:id`,
  `POST /:id/invitations`, `GET invitations/:token/details`, `POST invitations/accept`; no update/delete, so a stale
  ACTIVE row is the only state.
- Form/schema: the death/divorce year fields and the AEP checkbox are rendered; the year is `.optional()`; the AEP
  box is not gated by marital status.
- Gates: five files -> tests 127 / suites 20 / pass 127 / fail 0, exit 0; `tsc -p tsconfig.test.json` exit 0;
  `syntax_check.cjs` exit 0 over 29 files. LEG-1, LEG-2, LEG-3, LEG-4, LEG-5, LEG-6 and "Class 2 without spouse" are
  all green; the engine spec's mtime (20:25) predates the changed files (20:47/20:48), consistent with `impl-leg6.md`
  §10.1 listing only three changed files.
- Actor-swap regression: married household, actor primary vs actor co-filer -> both 14 051.24, totalDeductions 5 520,
  no warnings; the "you / spouse" questionnaire labels (`QuestionnaireView.tsx:530-590`) match the swap.
- Probes: read-only `%TEMP%` scripts importing the current `@luxtax/tax-engine` and `class-resolution`; scenario
  inputs and outputs are in §2 M1. The probes mirror the service decision (selection -> gate -> null -> class/flag),
  not the service's warning push (`classWindowWarning` at `:259-260`, `FORMER_SPOUSE_WARNING` at `:264-266`).

**Not covered, and why.**

- `calculateTax` was not executed: `calculations.service.ts` is outside `tsconfig.test.json`, and `tsc -p
  tsconfig.api.json` fails at baseline on missing `@nestjs/*`, `@prisma/client`, `fastify` (`Cannot find module`
  errors confirmed this round). The service is read and syntax-checked, not run or cleanly type-checked; no
  Nest/Postgres e2e.
- The membership lifecycle was read from the controller, not introspected in the database.
- The web UI was read, not rendered or type-checked (`react` / `@types/react` absent).
- Round-2 W1/W2 were re-read, not re-tested; they are unchanged by this round.
- The legal question of the death-year boundary was not assessed; the brief prescribes `<=`.
