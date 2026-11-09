# LEG-6 — Art. 119 n° 3 b–c three-year Class 2 window

**Item:** LEG-6 (P1-7, `audit/audit-legal.md:189`), requirement `docs/lir-118-121-bareme-2025-2026.md` Finding 4
(`luxembourg-tax-resident-gap-analysis.md:688`).
**Scope executed:** class derivation, warning, questionnaire inputs (contracts + zod + UI), unit tests.
**Not touched:** the engine tariff, `docs/`, any other LEG item.

## 1. Files changed

| File | Change |
|---|---|
| `packages/contracts/src/questionnaire.ts` | `spouseDeathYear?`, `divorceOrSeparationYear?`, `class2BeforeEvent?` with Art. 119 n° 3 b–c JSDoc, next to `primaryAge`/`spouseAge`. |
| `packages/validation/src/questionnaire.schema.ts` | `spouseDeathYear` / `divorceOrSeparationYear`: `z.number().int().min(1900).max(2100).optional()`; `class2BeforeEvent: z.boolean().optional()`. |
| `apps/api/src/modules/calculations/class-resolution.ts` | Three fields on `ClassResolutionAnswers`; new private `isInClass2Window`; `deriveTaxClass(..., taxYear: number)` as the new last parameter; exported `classWindowWarning(maritalStatus, answers)`. |
| `apps/api/src/modules/calculations/calculations.service.ts` | `deriveTaxClass` now receives `workspace.taxYear`; after the engine result, `classWindowWarning(...)` is pushed onto `result.warnings` before the workspace update and the audit event. Existing re-derivation (taxProfile ⇒ ignore stored class) untouched. |
| `apps/web/src/components/QuestionnaireView.tsx` | Conditional fields right below the marital-status buttons: WIDOWED → "Year of spouse's death" (1900–2100, placeholder 2024) + Art. 119 n° 3 b helper; DIVORCED → "Year of divorce / separation" + checkbox "Class 2 for five years before the divorce (Art. 119 n° 3 c)" + helper. Nothing rendered for SINGLE / MARRIED / PACS. Whole-object `saveQuestionnaire(workspaceId, answers)` unchanged. |
| `apps/api/test/class-resolution.spec.ts` | All 7 existing `deriveTaxClass` calls updated with the `taxYear` argument; 6 new tests (see §3). |
| `tmp/probe-leg6.ts` | Throw-away reproduction probe used for the limitation in §4.1 — delete if unwanted. |

## 2. Window logic

```
elapsed = taxYear - eventYear        // 0..3 inclusive ⇒ Class 2
```

- **WIDOWED** — `spouseDeathYear` set and `elapsed ∈ [0,3]` ⇒ `CLASS_2`; otherwise `CLASS_1A` (unchanged default).
- **DIVORCED** — `class2BeforeEvent === true` **and** `divorceOrSeparationYear` set and `elapsed ∈ [0,3]` ⇒ `CLASS_2`;
  otherwise the pre-existing `childrenWithModeration > 0 || age65 → CLASS_1A, else CLASS_1` test.
  `class2BeforeEvent: false` and an absent flag both fall through to that test.
- `elapsed < 0` (event year in the future) is outside the window. A missing year is outside the window *and* warns.
- **MARRIED / PACS / SINGLE** — untouched.
- `classWindowWarning` returns the exact requested sentence — “The three-year Class 2 window (Art. 119 n° 3) cannot be
  checked because the year of death/divorce is missing; the default class is applied.” — for WIDOWED without
  `spouseDeathYear` and for DIVORCED without `divorceOrSeparationYear`; `null` otherwise (including once a year is present).
- Explicit stored class still wins first (`if (workspaceTaxClass) return workspaceTaxClass;`) before any window check.

## 3. Tests run (all from `B:\B\tax-app`)

```
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test ^
  packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts ^
  apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts ^
  apps/api/test/class-resolution.spec.ts
```
→ `tests 109 / suites 17 / pass 109 / fail 0`, exit 0. Baseline before the change was the same command with
`tests 103 / pass 103` — the 6 added tests are the delta, no pre-existing test changed its outcome.

```
node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json     → exit 0
node .tools/syntax_check.cjs                                           → exit 0 (all 30 files "ok")
```

New tests in `apps/api/test/class-resolution.spec.ts` (`Art. 119 n° 3 b–c three-year Class 2 window`):

| Test | Assertion |
|---|---|
| a widow keeps Class 2 for the death year and the three following years | death 2024 → 2024 `CLASS_2`, 2025 `CLASS_2`, 2027 `CLASS_2`, 2028 `CLASS_1A` |
| a widow without a death year falls back to Class 1a and warns | 2025 `CLASS_1A`, `classWindowWarning` non-null |
| a recently divorced filer with five prior years of Class 2 keeps Class 2 | divorce 2023, `class2BeforeEvent: true` → 2025 `CLASS_2`, 2026 `CLASS_2`, 2027 `CLASS_1` |
| a divorced filer without the five-year condition is not Class 2 | `class2BeforeEvent: false` → `CLASS_1` (0 children) and `CLASS_1A` (1 moderated child) |
| a divorced filer without a divorce year falls back and warns | `CLASS_1`, warning non-null |
| the window warning is null when the window is checkable or not applicable | WIDOWED+year, DIVORCED+year, SINGLE, MARRIED, PACS → `null` |

Probe `tmp/probe-leg6.ts` (run with the same tsx command) printed, for taxYear 2025 and a single member with
EUR 100,000 salary:

```
resolved class for widow(2024) in 2025 = CLASS_2
window warning = null
resolved class for widow(no year) in 2025 = CLASS_1A
window warning (no year) = The three-year Class 2 window … the default class is applied.
input=CLASS_1 resultClass=CLASS_1 baseTax=26355 final=28199.85 warnings=[]
input=CLASS_2 resultClass=CLASS_2 baseTax=26355 final=28199.85 warnings=["Class 2 selected but no spouse is registered in the workspace: taxed as Class 1."]
```

## 4. Limitations / not verified

1. **The tariff does not follow the new class (observed, needs a decision).** The gate is
   `packages/tax-engine/src/engine.ts:798` (`effectiveClass`) and `:838` (the warning):
   `taxClass === TaxClass.CLASS_2 && !spouseUserId ? 'CLASS_1' : …`. A widowed or divorced filer in the window lives in a
   one-member household, so `spouseUserId` is `null` and the effective class is downgraded to `CLASS_1`; the probe above
   shows the identical `baseTax` (26,355) and `finalTaxLiability` (28,199.85) for `CLASS_1` and `CLASS_2` input.
   Net effect today: correct class label, audit trail and result `taxClass`, but **the Class 1 tariff** and an extra
   warning “Class 2 selected but no spouse is registered…”. Relaxing that gate was outside the approved edit list
   (`engine.ts` is not one of the six implementation steps), so it is left for the parent agent. Suggested fix: a boolean
   on `TaxCalculationParams` (e.g. `class2Window: true`) that lets `CLASS_2` through the `effectiveClass` gate and
   suppresses that warning, then a golden test on the Class 2 splitting amount for a single filer.
2. **Web UI not rendered or typechecked.** `react` / `@types/react` are absent from `node_modules` and `.tools/node_modules`,
   so no render and no JSX typecheck was possible. The UI change is verified by inspection plus `syntax_check.cjs`
   (transpile only). Conditional rendering and binding of `spouseDeathYear`, `divorceOrSeparationYear`, `class2BeforeEvent`
   were not exercised in a browser.
3. **Validation schema not executed.** `zod` is not installed in this sandbox (`Cannot find module 'zod'`), so
   `questionnaireSchema` is verified by inspection + syntax check only. No test asserts that 1899 / 2101 / 2024.5 are rejected.
4. **`calculations.service.ts` is not in `tsconfig.test.json`.** `tsc -p tsconfig.api.json` already fails at baseline
   (missing `@nestjs/common`, `@prisma/client`, `fastify`, …), so the 5-argument call and the `result.warnings.push(...)`
   are verified by inspection, not by a compiler. No API e2e (needs Nest + Postgres), so the warning was never observed
   inside a real `TaxCalculationResultDto`.
5. **Warning wording.** Per the brief, one sentence covers both statuses (“death/divorce”) and it also fires for a
   divorced filer with `class2BeforeEvent: false`, who could never reach Class 2. Left exactly as specified; changing it
   would be a scope decision.

## 8. Class 2 without spouse

**Scope:** the engine gate that swallowed the §2 window. The class resolution already returns `CLASS_2` for a
widow(er) / divorced filer inside Art. 119 n° 3, but `effectiveClass` downgraded it to `CLASS_1` whenever
`spouseUserId` was null, so the one-member household got the Class 1 tariff (see §4.1). This section closes that gap
and removes the couple's collective extras from the same filer. No `docs/` file was edited.

### 8.1 Files changed

| File | Change |
|---|---|
| `packages/contracts/src/tax.ts` | `TaxCalculationParams.class2WithoutSpouse?: boolean` with the Art. 119 n° 3 JSDoc: “A widowed/divorced filer keeping Class 2 under Art. 119 n° 3 has no spouse in the workspace; apply the Class 2 tariff without the couple's collective extras.” |
| `packages/tax-engine/src/engine.ts` | (a) `effectiveClass` downgrades `CLASS_2 → CLASS_1` only when `!spouseUserId && !params.class2WithoutSpouse`; (b) `isCollective = taxClass === CLASS_2 && Boolean(spouseUserId) && assessmentMode !== 'INDIVIDUAL_PURE'`; (c) the “taxed as Class 1” warning is suppressed when the flag is set, and two new warnings fire when the flag is redundant / ignored; (d) new `LIR-ART-115-15` provenance entry reporting `tranche` and `capitalAfterTranche`. |
| `packages/tax-engine/src/deductions.ts` | Its own `isCollective` now also requires `ctx.spouse`, so the couple's plafond multiplier (`1 + collectif + enfants`) and the 960 FDS are not granted to a spouse-less Class 2 filer. |
| `apps/api/src/modules/calculations/calculations.service.ts` | `const class2WithoutSpouse = taxClass === TaxClass.CLASS_2 && !spouseMember && (maritalStatus === 'WIDOWED' \|\| maritalStatus === 'DIVORCED');`, passed to `LuxembourgTaxEngine.calculate`. |
| `packages/tax-engine/test/tax-engine.spec.ts` | New `describe`, 4 tests (§8.3). No existing test edited. |

### 8.2 Behaviour

- **Tariff.** `effectiveClass` keeps `CLASS_2` when the flag is set, so the cote is `2 × Tarif(RIA / 2)` (Art. 121).
  The result keeps reporting `taxClass: CLASS_2`; only the internal effective class moves.
- **Collective extras.** `isCollective` now needs a spouse in the workspace. For the flag case this removes:
  the doubled Art. 115 n° 15 capital tranche (1 500 instead of 3 000), the joint Art. 130 al. 4 plus-value
  abattement, and — through `deductions.ts` — the `+1` plafond multiplier (art. 111 / épargne-logement / mortgage caps).
  The 960 couple FDS was already gated on `ctx.spouse` and is unchanged.
- **Capital tranche visibility.** `capitalAfterTranche` was previously only emitted through the
  `LIR-ART-115-15a` provenance, which requires qualifying dividends. A plain 2 000 security produced no observable
  tranche, so the new `LIR-ART-115-15` entry reports `{ tranche, capitalGrossTaxable }` and
  `outputAmount = capitalAfterTranche` whenever capital is non-zero. This is reporting only: the tranche is still not
  deducted from the taxable base (pre-existing, §4 of `audit/impl-leg4-leg5.md`).
- **Warnings.** Flag + spouse present → “Class 2 without spouse requested but a spouse is registered in the
  workspace: the couple is assessed collectively, so the flag is unnecessary and ignored.” Flag + class ≠ 2 →
  “Class 2 without spouse requested but the filer is not in Class 2: the flag is ignored.” Without the flag the
  pre-existing “Class 2 selected but no spouse … taxed as Class 1.” warning is unchanged.

### 8.3 Tests run (all from `B:\B\tax-app`)

```
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test ^
  packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts ^
  apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts ^
  apps/api/test/class-resolution.spec.ts
```
→ `tests 113 / suites 18 / pass 113 / fail 0`, exit 0. Baseline before this change was the same command with
`tests 109 / pass 109`; the delta is the 4 new tests.

```
node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json     → exit 0
node .tools/syntax_check.cjs                                          → exit 0 (all 30 files "ok")
```

New tests (`Class 2 without spouse — Art. 119 n° 3 window keeps the Class 2 tariff (LEG-6)`), all 2025, resident,
single member, gross 101 020 (taxable 100 000 after the 1 020 default forfaits):

| Test | Assertion |
|---|---|
| the flag applies the Class 2 tariff to a spouse-less filer | `taxableIncome` 100 000, `baseTax` = `floorEuroToCote(baseTax(100 000, 'CLASS_2', pkg2025))` = **14 682**, `taxClass` still `CLASS_2`, no “taxed as Class 1” warning |
| without the flag the safety downgrade to Class 1 still applies | `baseTax` = `floorEuroToCote(baseTax(100 000, 'CLASS_1', pkg2025))` = **26 764**, “taxed as Class 1” warning present |
| the flag does not double the Art. 115 n° 15 capital tranche | one security 2 000, no spouse: `tranche` 1 500, `capitalAfterTranche` **500**; the same input with `spouseUserId: 'u2'` → `tranche` 3 000, `capitalAfterTranche` 0 |
| the flag warns when it is redundant (spouse present) or ignored (not Class 2) | both new warnings observed |

The brief's Class 1 anchor (24 443) does not match the engine at this scenario's base: `baseTax(100 000, 'CLASS_1',
2025)` is 26 764 (24 443 is the Class 1 cote at roughly 94 020 taxable, i.e. a different income). The test asserts the
tariff function first and the observed literal second, so it pins the value without hiding a regression.

### 8.4 Limitations / not verified

1. **`calculations.service.ts` is not compiled or executed.** It is outside `tsconfig.test.json`; `tsconfig.api.json`
   already fails at baseline on missing `@nestjs/*`, `@prisma/client`, `fastify`. The new const and the parameter are
   covered by `syntax_check.cjs` (transpile) and inspection only. No API e2e (needs Nest + Postgres), so the
   widow → `class2WithoutSpouse: true` path was never observed through a real `TaxCalculationResultDto`.
2. **`assessmentMode` still reports `COLLECTIVE`** for the flag case, because the Class 2 branch of the engine keys on
   it. For a widow there is no Art. 3 collective assessment, so the field's label is now the only imprecise part of the
   result. Left as-is to avoid re-routing the Art. 3ter branches.
3. **`CLASS_2` + `INDIVIDUAL_PURE` + flag** would apply the Class 2 tariff (the flag wins over the individual mode,
   which needs a spouse to split). Not reachable from the service (a widowed / divorced filer with no household member
   has nobody to assess individually), but the engine does not refuse it.
4. **Art. 115 n° 15 tranche still not deducted from the base.** Pre-existing (§4 of `audit/impl-leg4-leg5.md`); the
   new provenance makes the amount auditable, it does not change taxable income.
5. **A deceased spouse still stored as an ACTIVE household member** keeps `spouseMember` non-null, so the service would
   not set the flag and the couple's extras would still apply. That is a household-data question, outside this edit.
6. **A married filer with no spouse member** is still downgraded to `CLASS_1` (the pre-existing safety net); the flag
   is only computed for WIDOWED / DIVORCED.

## 9. Role-aware spouse selection

**Scope:** the blocker found in review of §8. `calculations.service.ts` read `members[0]` as the primary and
`members[1]` as the spouse on the `status: 'ACTIVE'` list, so any second ACTIVE membership — a VIEWER, a stale row —
became a spouse: `spouseUserId` non-null, `class2WithoutSpouse` false, and the couple's collective extras (doubled
Art. 115 n° 15 capital tranche, `+1` deduction plafond multiplier) came back for a filer who has none. Selection now
follows the household role. No `docs/` file edited.

### 9.1 Files changed

| File | Change |
|---|---|
| `apps/api/src/modules/calculations/class-resolution.ts` | New pure `selectFilerMembers(members: readonly FilerMemberInput[]): FilerMembers` plus the `FilerMemberInput` / `FilerMembers` interfaces; imports `HouseholdRole`. No Prisma/Nest import, so `tsconfig.test.json` compiles and tests it. |
| `apps/api/src/modules/calculations/calculations.service.ts` | `members[0]` / `members[1]` replaced by `const { primaryUserId, spouseUserId } = selectFilerMembers(members);`; `class2WithoutSpouse` now tests `spouseUserId === null`; the engine inputs pass `primaryUserId ?? actorId` and `spouseUserId`. |
| `apps/api/test/class-resolution.spec.ts` | `selectFilerMembers` import; new `describe` with 5 tests (§9.3). No existing test edited. |

`FilerMemberInput.role` is typed `string` on purpose: `HouseholdRole` from `@luxtax/contracts` and the Prisma
`$Enums.HouseholdRole` are distinct enums, so a `HouseholdRole`-typed parameter would force a cast at the only call
site. The comparisons use the `HouseholdRole` enum members.

### 9.2 Selection rules

```
filerMembers = members.filter(role ∈ {PRIMARY_FILER, CO_FILER})
primary      = filerMembers.find(PRIMARY_FILER) ?? filerMembers[0] ?? null
spouse       = filerMembers.find(userId ≠ primary.userId ∧ role = CO_FILER) ?? null
```

- **PRIMARY_FILER wins as primary** regardless of row order; the old `members[0]` assumed the query returned it first.
- **A lone CO_FILER** is the primary and has no spouse; **two CO_FILERs** give first = primary, second = spouse.
- **VIEWER is filtered out** before either pick, so it can be neither primary nor spouse. That is the blocker: a VIEWER
  used to make `spouseUserId` non-null.
- **A VIEWER-only household** returns `{ null, null }`. The service keeps `primaryUserId ?? actorId`, so the engine
  still gets a primary, while `spouseUserId` stays null.
- **The brief's `?? members[0] ?? null` tail is deliberately absent** from the helper: it would hand the VIEWER back as
  primary and contradict the required test “no filers (only VIEWER) → primary null”. The actor fallback lives in the
  service instead.

### 9.3 Tests run (all from `B:\B\tax-app`)

```
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test ^
  packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts ^
  apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts ^
  apps/api/test/class-resolution.spec.ts
```
→ `tests 118 / suites 19 / pass 118 / fail 0`, exit 0. Baseline before this change: the same command →
`tests 113 / suites 18 / pass 113 / fail 0`; the delta is the 5 new tests. Alone, `class-resolution.spec.ts` is 22/22.

```
node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json     → exit 0
node .tools/syntax_check.cjs                                          → exit 0 (all 30 files "ok")
```

New tests (`member selection — role-aware spouse resolution (LEG-6 blocker)`):

| Input | Expected `{ primaryUserId, spouseUserId }` |
|---|---|
| PRIMARY_FILER u1 + CO_FILER u2 | `{ u1, u2 }`; the same pair in reverse order still `{ u1, u2 }` |
| PRIMARY_FILER u1 + VIEWER u2 | `{ u1, null }` |
| CO_FILER u1 alone | `{ u1, null }` |
| CO_FILER u1 + CO_FILER u2 | `{ u1, u2 }` |
| VIEWER u1 alone / no members | `{ null, null }` |

### 9.4 Limitations / not verified

1. **The service change is transpiled and inspected, not executed.** `calculations.service.ts` is still outside
   `tsconfig.test.json`, and `tsconfig.api.json` fails at baseline on missing `@nestjs/*`, `@prisma/client`, `fastify`.
   `syntax_check.cjs` reports "ok" for the file, but the wiring from real `workspace.household.members` rows
   (`$Enums.HouseholdRole`) to `spouseUserId` was never observed through `calculateTax`. The helper itself is executed
   by the unit tests above.
2. **The end-to-end effect is not observed.** No API e2e (needs Nest + Postgres), so “VIEWER present ⇒
   `spouseUserId` null ⇒ `class2WithoutSpouse` true ⇒ 1 500 tranche instead of 3 000” follows from the §8.3 engine test
   plus the new selection test, not from one run of `calculateTax`.
3. **The same positional selection remains elsewhere, out of scope:** `apps/api/src/modules/filing/annex-pdf.service.ts:48`
   (`members[0]` as primary) and `apps/api/src/modules/freelance/freelance.service.ts:271-273` (`members[1]` as
   spouse B). Not changed here; flagged for the review of those modules.
4. **A stale ACTIVE CO_FILER still counts as a spouse.** The role check removes the VIEWER false positive; a membership
   that keeps `CO_FILER` after the marriage ended is household data, not selection logic (§8.4 item 5 stands).
5. **A household whose only ACTIVE member is a VIEWER** previously produced `primaryUserId` = that viewer; it now
   produces `actorId`. Identical when the caller is that viewer, different for any other actor. No test covers that path.

## 10. Former/deceased spouse

### 10.1 Files changed

| File | Change |
|---|---|
| `apps/api/src/modules/calculations/class-resolution.ts` | `selectFilerMembers(members, actorUserId?)`: the acting user is the primary when their membership is a PRIMARY_FILER or CO_FILER; otherwise PRIMARY_FILER, then the first filer. The spouse is the other CO_FILER; when the acting CO_FILER was promoted over the PRIMARY_FILER, that remaining primary stays the spouse, so a married couple keeps its collective extras when the co-filer runs the calculation. New `spouseEndsAtEvent(maritalStatus, answers, taxYear)`. |
| `apps/api/src/modules/calculations/calculations.service.ts` | `selectFilerMembers(members, actorId)`; the returned ids are mapped back to member rows (`primaryMember`, `selectedSpouseMember`). `spouseEndsAtEvent(...)` forces `spouseMember`/`spouseUserId` to null from the event year on and pushes `FORMER_SPOUSE_WARNING` when a spouse row existed; `class2WithoutSpouse` now reads `!spouseUserId`. `dependantsCount` (`workspace.household.dependants.length`) untouched. |
| `apps/api/test/class-resolution.spec.ts` | 9 new tests: 4 actor-preference cases, 4 `spouseEndsAtEvent` cases, 1 selection/gate seam test. No existing test edited. |

### 10.2 Rules

```
primary = actor ∈ filers ? actor : (PRIMARY_FILER ?? first filer)
spouse  = first CO_FILER ≠ primary
          ?? (actor promoted from CO_FILER ? remaining PRIMARY_FILER : null)
ignore spouse ⇔ WIDOWED  ∧ spouseDeathYear            ≤ taxYear
               ∨ DIVORCED ∧ divorceOrSeparationYear   ≤ taxYear
```

- **Acting user first.** A widow(er)/divorced filer is typically the CO_FILER while the deceased/former spouse still owns the PRIMARY_FILER row; before this the calculation was anchored on that row.
- **Spouse fallback is limited to the promoted-CO_FILER case.** Two PRIMARY_FILER rows still yield no spouse (invalid data fails closed); a lone CO_FILER has no spouse.
- **A missing event year returns false.** Nothing is proven, the membership stays a spouse, and `classWindowWarning` already reports the unchecked Class 2 window.
- **Warning text** (pushed only when a spouse row was actually excluded): "A former/deceased spouse is still an ACTIVE co-filer; the calculation excludes that spouse because the event year is on or before the tax year."

### 10.3 Tests run (all from `B:\B\tax-app`)

```
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test ^
  packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts ^
  apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts ^
  apps/api/test/class-resolution.spec.ts
```
→ `tests 127 / suites 20 / pass 127 / fail 0`, exit 0 (118 → 127, the 9 new tests).

```
node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json     → exit 0
node .tools/syntax_check.cjs                                          → exit 0 (29 files "ok")
```

Engine probe (temporary `tmp/probe-leg6-former-spouse.ts`, deleted after the run) mirroring the service decision — 2025, WIDOWED, `spouseDeathYear: 2024`, salary 101 020, `bothSpousesProfessional: true`:

```
selection = { primaryUserId: 'widow', spouseUserId: 'deceased' } gate = true class = CLASS_2 flag = true
spouse null  : final 15 709.74  base 14 682  warnings ["AEP requested but no spouse is registered in the workspace."]
stale spouse : final 14 051.24  base 13 132  warnings []
delta = 1 658.50
```

The two figures match `review-leg6-round2.md` §2 M1 exactly.

New tests (`member selection — role-aware spouse resolution` and `spouse ends at event`):

| Input | Expected |
|---|---|
| actor `u2` CO_FILER + `u1` PRIMARY_FILER | `{ u2, u1 }` |
| actor `u1` PRIMARY_FILER + `u2` CO_FILER | `{ u1, u2 }` |
| actor `u3` VIEWER (+ primary + co-filer) | `{ u1, u2 }`; non-member actor on a lone CO_FILER → `{ u1, null }` |
| WIDOWED, death year 2024, tax years 2024/2025 | true / true; tax year 2023, missing year → false |
| DIVORCED, 2023 at 2023/2025; 2022 at 2025; 2026 at 2025 | true / true / true / false; missing year false |
| MARRIED, PACS, SINGLE, undefined | false |
| WIDOWED household: `widow` CO_FILER + `deceased` PRIMARY_FILER | selection `spouseUserId = 'deceased'`, gate true (the service nulls it) |

### 10.4 Limitations / not verified

1. **The service is transpiled and inspected, not executed.** `calculations.service.ts` is outside `tsconfig.test.json`; `tsc` does not type-check it and `syntax_check.cjs` only transpiles. `spouseIsFormer`, the nulling and the new warning were never observed through `calculateTax` (needs Nest + Postgres).
2. **No service-level test.** The seam test asserts selection + gate, not a `calculateTax` result; the engine consequence rests on the §8.3 tests plus the probe above.
3. **Facts owned by the excluded spouse move to the primary bucket** (`engine.ts:191-193`). For a widow(er), income realised by the deceased before death is an Art. 3 / succession question and is not handled here.
4. **A non-filer actor leaves the primary side unresolved.** If a VIEWER calls and the deceased/former spouse holds PRIMARY_FILER, that row stays primary (the gate nulls only the spouse), so facts bucket on the wrong side. Real callers are filers.
5. **Out of scope, unchanged:** `tmp/probe-leg6.ts` still in the tree; `annex-pdf.service.ts:48` and `freelance.service.ts:271-273` still select positionally.

## 11. Missing event year

Round-3 blocker: `spouseEndsAtEvent` returned `false` when the death/divorce year was missing, so a WIDOWED or
DIVORCED filer kept a stale ACTIVE `CO_FILER` as `spouseUserId` and the couple's AEP came back (2025 probe:
26 759.63 instead of 28 637.48 on a widow's salary of 101 020).

### 11.1 Change

| File | Change |
|---|---|
| `apps/api/src/modules/calculations/class-resolution.ts` | `spouseEndsAtEvent` is now status-based: `maritalStatus === 'WIDOWED' \|\| maritalStatus === 'DIVORCED'`. The year inputs stay in the signature (`_answers`, `_taxYear`, deliberately unread) and only bound the Art. 119 n° 3 Class 2 window in `deriveTaxClass` / `classWindowWarning`. The JSDoc says a missing year is a data gap, not evidence of a surviving marriage. |
| `apps/api/src/modules/calculations/calculations.service.ts` | `FORMER_SPOUSE_WARNING` now reads "...because the taxpayer is widowed/divorced."; the branch comment says the status, not the year, ends the spouse link. `spouseIsFormer ? null : selectedSpouseMember` is unchanged and now fires for every WIDOWED/DIVORCED case. `class2WithoutSpouse` unchanged (`CLASS_2` + no spouse + widowed/divorced). |
| `apps/api/test/class-resolution.spec.ts` | Spouse-link tests rewritten around the status rule (6 tests, count unchanged): widow/divorced true with a past, future or missing year; MARRIED/PACS/SINGLE/undefined false with and without a year; one status-vs-window test keeps the 2027/2028 boundary; the seam test now uses a missing year and states that the service branch is inspected, not run. |

### 11.2 Rules

- WIDOWED / DIVORCED never has a current spouse for the calculation. An ACTIVE CO_FILER is a former/deceased
  spouse or a data artefact, whether or not the event year is filled in.
- The event year only opens/closes the Art. 119 n° 3 three-year Class 2 window; a missing year still warns through
  `classWindowWarning` and falls back to the default class.
- `class2WithoutSpouse` stays true for a CLASS_2 widow(er)/divorced filer with no spouse.
- With `spouseUserId = null` the engine is non-collective: AEP needs `ctx.spouse` (`deductions.ts:263`), the Art. 115
  n° 15 tranche is single (`engine.ts:526`), the deduction multiplier is `1 + children` (`deductions.ts:159-163`), and
  the primary is the acting filer (`primaryUserId ?? actorId`).

### 11.3 Checks

```
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test ^
  packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts ^
  apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts ^
  apps/api/test/class-resolution.spec.ts
```
→ `tests 127 / suites 20 / pass 127 / fail 0`, exit 0.

```
node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json     → exit 0
node .tools/syntax_check.cjs                                          → exit 0 (29 files "ok")
```

Engine probe (temporary `tmp/probe-leg6-missing-year.ts`, deleted after the run) mirroring the service decision —
2025, DIVORCED, no divorce year, `class2BeforeEvent: true`, widow salary 101 020, `bothSpousesProfessional: true`:

```
after fix  (gate true)  spouse=null   aep=0     final 28 637.48
before fix (gate false) spouse=former aep=4 500 final 26 759.63   delta 1 877.85
```

The two figures match `review-leg6-round3.md` §2 exactly.

### 11.4 Limitations / not verified

1. **The service is inspected, not executed.** `calculations.service.ts` is outside `tsconfig.test.json`, so `tsc`
   never type-checks it and `syntax_check.cjs` only transpiles. `calculateTax` (needs Nest + Postgres) was not run.
2. **The probe copies the service ternary.** It validates gate + engine composition for the missing-year case, not
   the service's own branch.
3. **Facts owned by the excluded spouse still bucket to the primary** (`engine.ts:191-193`) — unchanged, as §10.4/3.

## 12. Art. 111bis contributor clamp

Round-4 blocker: `deductions.ts` multiplied the per-souscripteur cap by `art111bisContributors` without looking at how
many people are assessed, so a stale questionnaire answer `2` doubled the Art. 111bis cap of a WIDOWED / DIVORCED (or
single) filer: 6 400 EUR instead of 3 200 in 2025, 9 000 instead of 4 500 in 2026. The same review found two smaller
defects: `LIR-ART-111bis` provenance did not carry the multiplier, so the deduction could not be replayed, and the
mortgage provenance reported a multiplier of 2 for a spouse-less Class 2 filer although the deduction used 1.

### 12.1 Files changed

| File | Change |
|---|---|
| `packages/tax-engine/src/deductions.ts` | New exported pure `resolveArt111bisContributors(declared, assessedPersons)` = `min(max(1, floor(declared \|\| 1)), max(1, assessedPersons))`. `calculateDeductions` sets `const contributors = resolveArt111bisContributors(ctx.art111bisContributors, people.length)` and the Art. 111bis cap becomes `pkg.art111bisCapPerPerson * contributors`; the per-person cap and the `min(declared, …)` shape are unchanged. Comment: a second souscripteur must be a second assessed person, so a stale couple answer cannot double a single filer's cap. |
| `packages/tax-engine/src/engine.ts` | Computes `art111bisContributorCount` once from the same helper (`params.art111bisContributors ?? (spouse ? 2 : 1)` declared, `spouse ? 2 : 1` assessed persons) and feeds both the deduction context and the `LIR-ART-111bis` provenance inputs, which now read `{ declared, cap, contributors }`. The `LIR-ART-98-5-105` provenance multiplier is now `1 + (isCollective ? 1 : 0) + children` — the same `isCollective` the deductions use — instead of `assessmentMode === 'INDIVIDUAL_PURE' ? 0 : 1`, which reported 2 for a spouse-less Class 2 filer (and for any Class 1 filer) while the deduction used 1. |
| `apps/api/src/modules/calculations/calculations.service.ts` | `art111bisContributors: spouseUserId ? answers.art111bisContributors : 1` — a spouse-less filer enters with one souscripteur whatever the questionnaire says; a couple keeps the answered 1/2 (`undefined` still falls back to the engine's 2). `FORMER_SPOUSE_WARNING` now reads "…still another ACTIVE household member (possibly the PRIMARY_FILER)…" instead of "ACTIVE co-filer", since the excluded ACTIVE row may hold PRIMARY_FILER; the JSDoc above it follows. |
| `packages/tax-engine/test/tax-engine.spec.ts` | New `describe` with 4 tests, no existing test edited (§12.3). |

### 12.2 Rules

- The cap is `capPerPerson × souscripteurs`, and a souscripteur only counts if that person is assessed: one assessed
  person → one cap; a collectif couple → two. A questionnaire value above the assessed-person count is a stale data
  artefact and is clamped, not trusted.
- The clamp is deliberate in two layers: the service stops sending a stale 2 for a spouse-less filer, and the deduction
  recomputes from its own `people` list. Either alone is enough; the pair keeps future callers honest.
- `LIR-ART-111bis` is replayable: `declared`, `cap` and `contributors` are provenance inputs, so
  `min(declared, cap × contributors)` reproduces `deductions.art111bis`.
- The mortgage provenance multiplier now equals the one the deduction applied (`1 + collectif + enfants modérés`). A
  spouse-less Class 2 filer reports 1, a couple 2.

### 12.3 Checks (from `B:\B\tax-app`)

Baseline before the change: `tests 127 / suites 20 / pass 127 / fail 0`.

```
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test ^
  packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts ^
  apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts ^
  apps/api/test/class-resolution.spec.ts
```
→ `tests 131 / suites 21 / pass 131 / fail 0`, exit 0 (127 → 131, the 4 new tests).

```
node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json     → exit 0
node .tools/syntax_check.cjs                                          → exit 0 (29 files "ok")
```

New tests (`Art. 111bis contributor clamp — a stale couple answer cannot double a single filer (LEG-6)`):

| Input | Expected |
|---|---|
| Class 1, gross 101 020, 6 500 Art. 111bis, `art111bisContributors: 2`, 2025 | `deductions.art111bis = 3 200`; provenance `contributors = 1`, `declared = 6 500` |
| same, 2026 | `4 500` (not 9 000) |
| Class 2 couple, `spouseUserId`, 6 500 each (13 000), `art111bisContributors: 2`, 2025 / 2026 | `6 400` / `9 000` |
| Class 2 `class2WithoutSpouse`, 6 500, stale `2`, 2025 | `3 200`; provenance `contributors = 1` |
| direct `calculateDeductions`: one person / two persons, 13 000 declared, stale `2` | `3 200` / `6 400`; 2026 couple `9 000` |

Negative check: with the old expression (`capPerPerson × max(1, min(2, ctx.art111bisContributors))`) temporarily
restored in `deductions.ts`, the direct test failed with `expected 3200 ± 0.01, got 6400`; the fixed file was restored
and the suite re-ran green. That test exists because the three engine-level cases would pass on the engine clamp alone.

Engine probe (`tmp/probe-leg6-art111bis.ts`, deleted after the run) — 2025, salary 101 020, 6 500
`PENSION_SAVINGS_111BIS`, 5 000 mortgage interest, fixation 2020, `art111bisContributors: 2`:

```
widow  art111bis=3200 declared=6500 contributors=1 | mortgage=4000 multiplier=1
single art111bis=3200 declared=6500 contributors=1 | mortgage=4000 multiplier=1
couple art111bis=6400 declared=13000 contributors=2 | mortgage=5000 multiplier=2
```

The widow/single lines are the blocker: 3 200, not 6 400, with `contributors = 1` in the provenance; the couple keeps
6 400. The mortgage multiplier now matches the deduction it annotates (cap 4 000 for one person, 5 000 interest-capped
for the couple).

### 12.4 Limitations / not verified

1. **The service is inspected and transpiled, not executed.** `calculations.service.ts` is outside
   `tsconfig.test.json`; `tsc` never type-checks it and `syntax_check.cjs` only transpiles it. The new
   `spouseUserId ? … : 1` ternary and the reworded warning were not observed through `calculateTax` (needs Nest +
   Postgres).
2. **No test pins the service ternary.** For a spouse-less filer the engine clamp produces the same number, so only
   the value on the wire differs; a service test would need the Nest/Postgres harness.
3. **The 2026 couple case is covered at the engine and deduction layers only**, not through the annex/API path.
4. **A contributor count above 2 is not warned about** — validation caps it at 2 (`questionnaire.schema.ts:61`) and the
   clamp handles anything else silently.

