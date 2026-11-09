# LEG-6 spouse selection — round 2 review

Reviewer: independent re-check against the brief, `audit/review-leg6.md` M1, `audit/impl-leg6.md` §9 and the
current `class-resolution.ts` / `calculations.service.ts`. Read-only on the source; no source file was modified.

## 1. Conclusion

**Not deliverable as-is: one must-fix remains**, in the correctness/legal layer. The role-aware
`selectFilerMembers` closes the VIEWER half of `review-leg6.md` M1 and its five selection rules hold; but a stale
ACTIVE `CO_FILER` — the deceased/former spouse's membership, which still cannot be ended because the household API
has no removal or role-change endpoint — is still selected as the spouse. `spouseUserId` stays non-null,
`class2WithoutSpouse` stays false, and the couple's extras return: measured on the current engine at **EUR 1,658.50
too low** in the AEP configuration and **EUR 134.82 too low** from the doubled Art. 111 cap alone, with zero
warnings. The VIEWER case, 118/118 tests, tsc exit 0 and the syntax gate (29 files, exit 0) all hold. The blocker is
the stale-member half that `audit/impl-leg6.md` §9.4 #4 itself records as unfixed.

## 2. Must fix

### M1 — a stale ACTIVE CO_FILER is still read as a spouse, so the couple's extras still reach a widow(er)/divorced filer

- **Position.** `apps/api/src/modules/calculations/class-resolution.ts:143,161-175` (every `CO_FILER` is a spouse
  candidate); `apps/api/src/modules/calculations/calculations.service.ts:39,87,119-123` (ACTIVE-only query, helper
  call, flag requires `spouseUserId === null`); `apps/api/src/modules/households/households.controller.ts:34-81`
  (only `@Post()` / `@Get()` routes — a membership can never be ended or re-roled);
  `packages/tax-engine/src/engine.ts:95-96,191-193,526`; `packages/tax-engine/src/deductions.ts:159-163,263-282`.
- **Problem.** The helper treats any ACTIVE `CO_FILER` as the spouse. When a marriage ends by death or divorce the
  membership row remains ACTIVE `CO_FILER` (no API changes it), so the service hands the engine
  `spouseUserId = <deceased/former spouse>`. The engine then sets `isCollective = true` on the strength of that id
  alone and grants the couple's extras to a filer who has no spouse. The new tests only vary the roles
  (`apps/api/test/class-resolution.spec.ts:116-158`); no test combines WIDOWED/DIVORCED with a `CO_FILER`.
- **Impact.** For a widow(er) in the Art. 119 n° 3 window whose deceased spouse is still an ACTIVE `CO_FILER`:
  - Art. 115 n° 15 tranche doubles 1 500 → 3 000 (`engine.ts:526`; the §8.3 engine test asserts 3 000 with a
    `spouseUserId` and 1 500 without);
  - the deduction plafond multiplier becomes `1 + 1 + enfants` (`deductions.ts:159-163`), so EUR 1 000 of Art. 111
    declared gives a 1 000 deduction instead of 672 — probe: final 15 632.70 → 15 497.88 (**−134.82**);
  - with `spouseHasProfessionalIncome` true (a stale answer, and the AEP checkbox is still outside any marital-status
    gate at `apps/web/src/components/QuestionnaireView.tsx:754-765`), Art. 129b AEP 4 500 applies
    (`deductions.ts:263`): probe final 15 709.74 → 14 051.24 (**−1 658.50**), `warnings: []`;
  - facts owned by the stale member are bucketed as spouse income (`engine.ts:191-193`).
- **Evidence.** `selectFilerMembers([{u1,PRIMARY_FILER},{u2,CO_FILER}])` returns `{u1,u2}` (test at
  `class-resolution.spec.ts:118-128`); the service then computes `class2WithoutSpouse = false` because
  `spouseUserId !== null` (`calculations.service.ts:119-123`). Probe on the current tree (2025, resident, gross
  101 020, Class 2, one member vs the same household with a `CO_FILER`):
  ```
  selection for WIDOWED household with stale CO_FILER = {"primaryUserId":"u1","spouseUserId":"u2"} class2WithoutSpouse = false
  widow alone      : final 15709.74 base 14682 warnings ["AEP requested but no spouse is registered in the workspace."]
  widow + CO_FILER : final 14051.24 base 13132 warnings []
  delta final = 1658.50
  alone | art111 672  | total 1212 | final 15632.7
  stale | art111 1000 | total 1540 | final 15497.88
  ```
  `audit/impl-leg6.md` §9.4 #4: "A stale ACTIVE CO_FILER still counts as a spouse." `review-leg6.md` M1's fix
  direction required selection "by role (exclude VIEWER) **and by household state (a membership ended by death or
  divorce must not count)**" — only the role half is implemented, and no warning was added for a WINDOW case with a
  second ACTIVE member.
- **Fix direction.** For `maritalStatus` `WIDOWED` / `DIVORCED`, no `CO_FILER` can be a jointly assessed spouse:
  force `spouseUserId = null` for the calculation (and set `class2WithoutSpouse` when Class 2 comes from the window),
  and warn when a second ACTIVE filer row is being ignored. Alternatively add a membership end/role-change path and
  make the selection depend on it. Keep the VIEWER filter. Add a decision-level regression test (WIDOWED + CO_FILER
  → spouse null, flag true, result equals the spouse-less probe).

## 3. Worth considering

### W1 — "first CO_FILER" is DB-order dependent

- **Position.** `calculations.service.ts:39` (`members: { where: { status: 'ACTIVE' } }`, no `orderBy`) feeding
  `class-resolution.ts:163-170`.
- **Problem.** With two `CO_FILER` rows the primary/spouse assignment is whatever order Prisma returns; the helper's
  "first CO_FILER" is not stable across calls.
- **Suggestion.** Add `orderBy: { joinedAt: 'asc' }` (or `id`) to the member query, or pass an explicitly ordered
  array. Impact is limited to a two-CO_FILER household, but the swap moves `travelUnitsPrimary`/`travelUnitsSpouse`
  and the fact-owner bucket without any data change.

### W2 — the helper assumes pre-filtered ACTIVE rows but its input carries no status

- **Position.** `class-resolution.ts:128-137` (`FilerMemberInput` has only `userId`/`role`), `:161-162`.
- **Problem.** The "a VIEWER never files" guarantee depends on the caller querying only ACTIVE rows. The function is
  exported and pure; a future caller passing `PENDING_INVITATION` or `REMOVED` rows would get a `CO_FILER` spouse
  back with no error.
- **Suggestion.** Add `status` to the input and filter inside, or state the precondition in the JSDoc and name the
  function for it (e.g. `selectFilerMembersFromActive`).

## 4. Notes

- `syntax_check.cjs` lists 29 files (`.tools/syntax_check.cjs:3-32`), not 30; exit 0. The brief's "30/30" and
  `impl-leg6.md` §9.3 repeat the off-by-one already noted in `review-leg6.md` N3.
- `tmp/probe-leg6.ts` is still in the tree.
- `assessmentMode` still reports `COLLECTIVE` for the flag case (`impl-leg6.md` §8.4 #2), so a widow's result and
  audit string still say collective.
- A VIEWER-only household now yields `primaryUserId = actorId` (`impl-leg6.md` §9.4 #5); no test covers it.
- `apps/api/src/modules/filing/annex-pdf.service.ts:48` and `apps/api/src/modules/freelance/freelance.service.ts:271-273`
  still select positionally; out of scope here and unchanged (`impl-leg6.md` §9.4 #3).
- Two `PRIMARY_FILER` rows resolve to the first and no spouse; invalid data, but fails safe.

## 5. Review scope and what was not covered

**Standard used.** The four VERIFY points of the brief; `review-leg6.md` M1 and its fix direction; `impl-leg6.md`
§9; the brief's acceptance sentence "a VIEWER or stale member restoring couple benefits is a blocker".

**Brief items.**

| # | Verdict | Evidence |
|---|---|---|
| 1 | PASS | `class-resolution.ts:143,161-175`: filer roles filtered before either pick; PRIMARY_FILER preferred; lone CO_FILER = primary/no spouse; two CO_FILERs = first/second; VIEWER-only and `[]` = `{null,null}`. Exercised by `class-resolution.spec.ts:116-158` (5 tests, 22/22 in the file). |
| 2 | PASS on the four literal bullets; **the fourth is exactly what leaves M1 open** | `calculations.service.ts:87` uses the helper; PRIMARY_FILER + VIEWER → `spouseUserId null`; WIDOWED/DIVORCED + no CO_FILER + CLASS_2 → flag true (`:119-123`); a CO_FILER → `spouseUserId` non-null → flag false. |
| 3 | PASS | Five test files: 118/118, 19 suites, 0 fail; `tsc -p tsconfig.test.json` exit 0; `syntax_check.cjs` exit 0 over 29 files. LEG-6 window and `Class 2 without spouse` suites green; LEG-2/3/4/5 suites present and green; the five added tests are the 113 → 118 delta. |
| 4 | PASS | One helper call at `:87` feeds `primaryUserId` (`:138`) and `spouseUserId` (`:139`); no `members[0]` / `members[1]` / `primaryMember` / `spouseMember` remains in this service. `dependantsCount` is `workspace.household.dependants.length` (`:140`); `Dependant` has no member link (`schema.prisma:248-258`), so household scope is the only consistent one. |

**Claims checked, with evidence.**

- Helper rules: read `class-resolution.ts:161-175` and ran the five tests; all assertions pass.
- Service wiring: read `calculations.service.ts:39,82-87,119-123,138-141`; the ACTIVE filter and the single helper
  call are the only member selection in the file.
- Membership lifecycle: `households.controller.ts:34-81` has only `POST /`, `GET /`, `GET /:id`,
  `POST /:id/invitations`, `GET invitations/:token/details`, `POST invitations/accept`; `MEMBER_REMOVED`,
  `householdMembership.update/delete` and `status: REMOVED` have no matches under `apps/api/src`.
- Engine consequence: `engine.ts:95-96` (`isCollective` needs only `spouseUserId`), `:526` (tranche ×2),
  `deductions.ts:159-163` (multiplier), `:263` (AEP needs `ctx.spouse`); the §8.3 test asserts the 3 000/1 500
  tranche split with and without a spouse id.
- Gates: the five-file command → `tests 118 / suites 19 / pass 118 / fail 0`, exit 0; `tsc -p tsconfig.test.json`
  → exit 0; `.tools/syntax_check.cjs` → exit 0, 29 "ok" lines.
- Leak magnitude: read-only probes in `%TEMP%` (`leg6-round2-probe*.ts`) importing the current engine; outputs above.

**Not covered, and why.**

- `calculateTax` was not executed: `calculations.service.ts` is outside `tsconfig.test.json`, and
  `tsc -p tsconfig.api.json` fails at baseline on missing `@nestjs/*`, `@prisma/client`, `fastify` (confirmed, exit 2).
  The service composition is read and syntax-checked, not run; no Nest/Postgres e2e.
- The membership lifecycle was established by reading the controller/service (no removal endpoint), not by DB
  introspection.
- The web UI was not rendered or type-checked (`react` / `@types/react` absent); the AEP checkbox gating
  (`QuestionnaireView.tsx:754-765`) and status buttons (`:292`, `:314`) were read, not clicked.
- `audit/impl-leg6.md` §9.4 #2/#3 (assessmentMode, INDIVIDUAL_PURE + flag) were not re-tested; they are outside the
  spouse-selection blocker.
