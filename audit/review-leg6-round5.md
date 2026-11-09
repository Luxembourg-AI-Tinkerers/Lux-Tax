# LEG-6 round 5 — Art. 111bis contributor clamp

Reviewer: independent re-check of `audit/review-leg6-round4.md` §2 M1 against `audit/impl-leg6.md` §12, the brief's
four VERIFY points and the current source. Read-only on the source; this report is the only file written.

**allPass: true** — must-fix 0, worth considering 1, notes 3.

## 1. Conclusion

The round-4 blocker is closed. `deductions.ts` now caps the Art. 111bis contributor count at the number of assessed
persons (`resolveArt111bisContributors`, `deductions.ts:118-123`, applied at `:217-224`), so a stale questionnaire
answer of 2 no longer doubles a spouse-less filer's cap: measured 3,200 (2025) and 4,500 (2026) for a single filer,
3,200 for a widow on both the Class 1a and the Class 2 Art. 119 n° 3 paths, while a couple keeps 6,400 / 9,000. The
engine computes the count once from the same helper and reports it in `LIR-ART-111bis`, the service sends 1 whenever
`spouseUserId` is null, and the warning now says "another ACTIVE household member". The mortgage provenance
multiplier uses the same `isCollective` as the deduction and matches it for the spouse-less Class 2 filer (1 and 1)
and for the couple (2 and 2). No couple-scaled deduction survives for a spouse-less filer: Art. 111 672,
épargne-logement 672, mortgage ×1, FDS 480, AEP 0, capital tranche 1,500, against 1,344 / 1,344 / ×2 / 960 / 4,500 /
3,000 for a couple. Gates: 131/131 tests, `tsc` exit 0, `syntax_check` 29/29 ok. Nothing to send back.

## 2. Items (VERIFY 1–4)

| # | Item | Verdict | Evidence |
|---|---|---|---|
| 1 | `deductions.ts` clamps contributors to the assessed persons; single stale 2 → 3,200/4,500, couple → 6,400/9,000; couple cap intact | **pass** | `deductions.ts:118-123,177,217-224`; probe |
| 2 | Engine passes/provenances the clamped count; service sends 1 when `spouseUserId` is null; warning wording | **pass** | `engine.ts:686-690,699,773`; `calculations.service.ts:24-26,191,270-272`; probe |
| 3 | Mortgage provenance multiplier equals the deduction's `isCollective` multiplier for a spouse-less Class 2 filer | **pass** | `engine.ts:788` vs `deductions.ts:171-175`; probe |
| 4 | Regression: 131/131, `tsc` 0, syntax 29/29; LEG-6 window, former/deceased exclusion, LEG-2/3/4/5/P0 unchanged | **pass** | run below; `class-resolution.ts:46-60,83-120,226-235` |

### Item 1 — the clamp and both caps

`resolveArt111bisContributors(declared, assessedPersons)` = `min(max(1, floor(declared || 1)), max(1, assessedPersons))`
(`deductions.ts:118-123`); `people` is one entry without a spouse and two with one (`:177`), and the cap is
`art111bisCapPerPerson * contributors` (`:217-224`). Measured on the current package (2025/2026, salary 101,020,
6,500 declared):

- single, stale `art111bisContributors: 2` → **3,200 / 4,500**; provenance `contributors = 1`.
- couple, two salaries and 13,000 declared, count 2 → **6,400 / 9,000**; provenance `contributors = 2`.
- couple with no answer → 6,400 (engine default 2 still applies); couple with answer 1 → 3,200 — the existing
  couple shapes are unchanged, so the clamp does not break the couple cap.
- helper edge inputs: (2,1)→1, (2,2)→2, (1,2)→1, (undefined,1)→1, (0,1)→1, (3,2)→2, (-5,1)→1, (2.99,2)→2,
  (NaN,2)→1 — no fractional or negative cap can be produced from the call sites.

### Item 2 — engine, service and warning

- `engine.ts:686-690` computes `art111bisContributorCount` once with the same helper (`params ?? (spouse ? 2 : 1)`
  declared against `spouse ? 2 : 1` assessed), passes it into the deduction context (`:699`) and into the
  `LIR-ART-111bis` provenance inputs `{ declared, cap, contributors }` (`:773`). Replay is exact:
  `min(6500, 3200 × 1) = 3200`, `min(13000, 3200 × 2) = 6400`.
- `calculations.service.ts:191` — `art111bisContributors: spouseUserId ? answers.art111bisContributors : 1`. With the
  nulling at `:116-118`, a WIDOWED/DIVORCED filer enters with one souscripteur whether or not a stale ACTIVE row is
  present.
- Warning (`:24-26`, pushed at `:270-272` only when a spouse row was actually excluded) reads "…is still another
  ACTIVE household member (possibly the PRIMARY_FILER)…", i.e. the requested neutral wording.
- Measured through the service decision chain (selection → gate → null → class → flag → contributors): widow with a
  stale `CO_FILER` and no death year → Class 1a, 3,200, `contributors = 1`; widow with death 2024 → Class 2 + flag,
  3,200, `contributors = 1`.

### Item 3 — mortgage provenance

The provenance now reports `1 + (isCollective ? 1 : 0) + children` (`engine.ts:788`) — literally the expression the
deductions use for `multiplier` (`deductions.ts:171-175`), and both `isCollective` definitions key on
`taxClass === CLASS_2 && spouse && assessmentMode !== 'INDIVIDUAL_PURE'`; `ctx.spouse` is `spouseIncome`, which is
`undefined` exactly when `spouseUserId` is absent (`engine.ts:574-575`), so the two cannot diverge. Measured
(interest 5,000, fixation 2020): spouse-less Class 2 → deduction 4,000 with `multiplier: 1`; couple → 5,000 with
`multiplier: 2`; the Class 2 safety-downgrade path without the flag also reports 1 against a 4,000 deduction.

### Item 4 — regression

- Five files: `tests 131 / suites 21 / pass 131 / fail 0 / skipped 0`, exit 0. Delta over the 127 baseline is the
  four new tests in `tax-engine.spec.ts:1306` (at `:1340,1349,1354,1371`); no suite lost a test.
- `tsc -p tsconfig.test.json` exit 0; `syntax_check.cjs` 29 files "ok", 0 bad, exit 0 (the brief's 30/30 is again
  one high).
- LEG-6 window and former/deceased exclusion: `class-resolution.ts` is untouched this round (mtime 20:58:45, before
  the round-4 report at 21:08:13); `spouseEndsAtEvent` is still status-based (`:226-235`), `classWindowWarning`
  unchanged (`:46-60`), and the 31 tests in `class-resolution.spec.ts` pass.
- LEG-2/3/4/5 describes are present and green in the same run; "P0" has no separately labelled group — the
  `audit-legal.md` §4.1 items are exercised by the engine suite, which is fully green, and no P0 test file changed.
- Change surface: after `audit/review-leg6-round4.md` (21:08:13) only `deductions.ts` (21:10:17), `engine.ts`
  (21:10:39), `calculations.service.ts` (21:10:36) and `tax-engine.spec.ts` (21:13:28) changed — matches §12.1.

## 3. Findings

### 3.1 Must fix — 0

None. The blocker condition ("a remaining couple-scaled deduction for a single/widowed filer") is not met on any
path I could construct: Art. 111 672, épargne-logement 672, mortgage ×1, FDS 480, AEP 0, capital tranche 1,500 for
the spouse-less Class 2 filer and for the plain single filer, against 1,344 / 1,344 / ×2 / 960 / 4,500 / 3,000 for
the married couple.

### 3.2 Worth considering — 1

**W1 — the clamp is silent on both surfaces a reader can see.**

- **Position.** `packages/contracts/src/tax.ts:84-85`, `apps/api/src/modules/calculations/calculations.service.ts:191`,
  `apps/web/src/components/QuestionnaireView.tsx:717-733`.
- **Problem.** The DTO still describes `art111bisContributors` as "Number of 111bis/111ter souscripteurs (1 or 2)",
  and the questionnaire keeps showing and accepting 2 for a WIDOWED/DIVORCED filer, while the service silently sends
  1. Nothing the caller or the user sees says the stored answer is ignored, and the provenance records the clamped
  count only (`engine.ts:773`), so the reason for a 3,200 cap on a declared 2 is not reconstructible from the audit
  line either.
- **Impact.** No wrong amount — the cap is right. But a user who answered 2 gets no explanation, and a future caller
  reading the contract would expect 2 to double the cap.
- **Evidence.** Service line 191; form lines 717-733 (label "111bis souscripteurs (1 or 2)", placeholder "default 2 if
  married", no status condition); my probe: widow with `art111bisContributors: 2` → 3,200 with `contributors: 1`.
- **Suggestion.** One sentence on the DTO parameter ("values above the number of assessed persons are clamped; a
  spouse-less filer uses 1") and a hint, or a disabled field, for non-married statuses. Documentation only.

### 3.3 Notes — 3

- A SINGLE filer with an ACTIVE `CO_FILER` is still taxed as Class 1 but with two assessed persons: measured
  `art111bis = 6,400` and `aep = 4,500`. Pre-existing and unchanged by this round; it needs contradictory household
  data (invitations default to `CO_FILER`, `household.schema.ts:15-21`), and the inconsistent field is the class, not
  the 111bis cap.
- Round-4's absolute final-tax figures are not reproducible from the inputs §2 M1 lists: my reconstruction of the
  same shape gives 25,005.90 for the 3,200 variant, not 22,773.88. The 3,200-vs-6,400 deduction delta that defines
  the blocker is confirmed, so the conclusion stands; the absolute levels in that note appear to omit inputs.
- The provenance-multiplier correction is wider than §12.2 states: a Class 1 filer with two moderated children now
  reports 3 (was 4) against a 12,000 deduction — the deduction had always used 3, so this repairs every non-couple
  case, not only the spouse-less Class 2 one.

## 4. Summary

The fix does what §12 claims, and the claims survive independent probing rather than only inspection. The clamp sits
in the deduction layer as the brief's fix direction asked, the engine applies the same helper so the audit line and
the amount agree, and the service stops the stale count at the source; the couple path is bit-for-bit unchanged at
3,200/4,500 per person and 6,400/9,000 for the household. The mortgage provenance now reports the multiplier the
deduction actually used, including on the safety-downgrade path. The only surviving observation is that the
override is undocumented on the DTO and invisible in the form — a clarity item, not a correctness one. Acceptance:
all four VERIFY points pass, the gates are green, and no couple-scaled deduction remains for a spouse-less filer.

## 5. Review scope and what was not covered

**Standard used.** The brief's four VERIFY points; `review-leg6-round4.md` §2 M1 and its fix direction;
`impl-leg6.md` §12; the brief's acceptance sentence; the five-file gate; and `lux-deductions-2025-2026-research.md:196`
("Plafond annuel (per person, each spouse calculated individually)") as the basis for capping the count at assessed
persons.

**Checked.** The helper on eleven input shapes; the full deduction basket for widow, single and couple (Art. 111,
épargne-logement, mortgage, FDS, AEP, capital tranche); the engine wiring and provenance; the service ternary, nulling
and warning push; `deriveTaxClass` / `classWindowWarning` / `spouseEndsAtEvent`; the change surface by mtime; the
three gates; and the new tests' assertions against my own numbers.

**Not covered, and why.**

- `calculateTax` was not executed: `calculations.service.ts` is outside `tsconfig.test.json`, and
  `tsc -p tsconfig.api.json` fails at baseline on missing `@nestjs/*`, `@prisma/client`, `fastify`. My probe mirrors
  the service chain (selection → gate → null → class → flag → contributors), it is not the service.
- No database/Nest e2e, so real `household.members` rows and the persisted `calculationResult` were not observed.
- The web form was read, not rendered (`react` / `@types/react` absent from `node_modules`), so the stale-2 display
  is taken from the JSX, not from a browser.
- No test pins the service ternary — confirmed by inspection; immaterial to the amount, because the engine clamp
  produces the same number.
- The legal question whether a `CO_FILER` under a SINGLE marital status should count as a spouse was not assessed
  (note 1).
- Round-4's absolute final-tax levels were not reproduced (note 2); only its deduction delta was.
