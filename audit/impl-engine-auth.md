# Implementation report — LEG-1 (surcharge) + API-1 (admin gate, household write roles)

Date: 2026-11-08. Scope: `audit/implementation-plan-2026-11-08.md` P0-1 and P0-2 only.
Privacy files (`facts.service.ts`, `documents.service.ts`, `calculations.service.ts`) were not touched; only `@Roles` decorators were added to their controllers.

## 1. Files changed

### LEG-1 — engine

| File | Change |
|---|---|
| `packages/tax-engine/src/engine.ts:929-931` | Ordinary (collective) branch: `solidarityAmount = round2(mulRate(toCents(taxCote), fondsRateFor(ordinaryTaxable)) / 100)` — `mulRate` returns cents, the result is added to the euro cote at `:959`. Comment added. This matches the two Art. 3ter individual-assessment branches (`:855-856`, `:886-887`), which already divide by 100. |
| `packages/tax-engine/test/tax-engine.spec.ts` | New `describe('Fonds pour l’emploi surcharge — the return, not only the cote (LEG-1)')`, 5 tests asserting `solidaritySurchargeAmount`, `totalTaxBeforeCredits`, `finalTaxLiability` (and `balancePayableOrRefund` / `solidaritySurchargeRate`). |

No helper was added to `money.ts`: dividing by 100 at the call site is the convention already used by the two sibling branches, so the diff stays one expression.

### API-1 — platform admin

| File | Change |
|---|---|
| `apps/api/src/common/auth/platform-admin.ts` (new) | Pure, dependency-free `parseAdminEmails(raw?: string): string[]` (comma-split, trim, lower-case, drop empties) and `isPlatformAdminEmail(email, allowlist): boolean` (exact, case-insensitive, empty candidate never matches). |
| `apps/api/src/common/guards/platform-admin.guard.ts` (new) | `CanActivate`. Reads `request.user.email`, parses `process.env.ADMIN_EMAILS` on every request, throws `ForbiddenException('Platform administrator access required')` unless the email is on the allowlist. Fails closed when the variable is unset/empty. Class comment states it is an interim allowlist gate, not the nine-role RBAC of plan §5.1. |
| `apps/api/src/modules/admin/admin.controller.ts` | `@UseGuards(JwtAuthGuard, PlatformAdminGuard)` (was `JwtAuthGuard` only); import added; two-line comment marking the interim gate. All routes stay protected. |
| `apps/api/src/modules/documents/documents.controller.ts` | `@Roles(HouseholdRole.PRIMARY_FILER, HouseholdRole.CO_FILER)` on `POST /` (upload), `PATCH :documentId/visibility`, `DELETE :documentId`. `GET /` untouched. |
| `apps/api/src/modules/facts/facts.controller.ts` | Same decorator on `POST confirm`, `PATCH :factId`, `DELETE :factId`. `GET /` untouched. |
| `apps/api/src/modules/filing/filing.controller.ts` | Same decorator on `POST approve`, `POST filing-package`, `POST assessment`, `POST rollover`. The four `GET` handlers untouched. |
| `apps/api/src/modules/questionnaire/questionnaire.controller.ts` | Same decorator on `PUT questionnaire`. `GET questionnaire` untouched. |
| `apps/api/test/platform-admin.spec.ts` (new) | 5 `node:test` cases: empty/unset env, exact match, comma list + case-insensitivity + trimming, no substring/prefix/suffix match, empty candidate. |
| `apps/api/test/admin-governance.e2e-spec.ts` | Sets `process.env.ADMIN_EMAILS = uniqueEmail` in `beforeAll` after registering the admin and before the first admin call; registers a second ordinary user (`ordinaryToken`); adds two 403 tests (`GET /api/admin/overview`, `GET /api/admin/audit`); `afterAll` deletes both users (audit events, sessions, profiles) and unsets `ADMIN_EMAILS`. No existing assertion was weakened or removed. |
| `tsconfig.test.json` | `include` gains `apps/api/src/common/auth/platform-admin.ts` and `apps/api/test/platform-admin.spec.ts` (the only two Nest-free API files). |
| `.tools/syntax_check.cjs` | `files` gains 7 entries: admin, platform-admin guard, platform-admin helper, documents/facts/filing/questionnaire controllers. No entry removed (9 → 16). |

### Household write roles — guard precondition
All four controllers already carry class-level `@UseGuards(JwtAuthGuard, HouseholdGuard)` (`documents:24`, `facts:24`, `filing:24`, `questionnaire:20`), so the `ROLES_KEY` branch of `HouseholdGuard:60-67` is now live. `PlatformAdminGuard` is dependency-free, like `JwtAuthGuard`, neither of which is registered in a module `providers` array — Nest instantiates enhancers of that shape, so no module change was needed (this is the same pattern the working admin routes already rely on).

## 2. Engine output before/after (2025 package, resident, default forfaits)

Probe: `LuxembourgTaxEngine.calculate` with one `EMPLOYMENT_INCOME/grossSalary` fact, run once with the `/100` removed and once with it restored.

| Case | baseTax | surcharge before | surcharge after | final before | final after |
|---|---|---|---|---|---|
| Class 1 gross 60,000 (RIA 58,980) | 10,755 | 75,285.00 | **752.85** | 85,644.00 | **11,111.85** |
| Class 2 gross 100,000 (RIA 98,980) | 14,305 | 100,135.00 | **1,001.35** | 114,440.00 | **15,306.35** |
| Class 1a gross 27,480 (RIA 26,460) | 0 | 0 | 0 | 0 | 0 |
| Class 1 RIA 150,000 | 46,590 | 326,130.00 | 3,261.30 (7 %) | 372,720.00 | 49,851.30 |
| Class 1 RIA 150,050 | 46,610 | 419,490.00 | 4,194.90 (9 %) | 466,100.00 | 50,804.90 |
| Class 2 RIA 300,000 | 93,180 | 652,260.00 | 6,522.60 (7 %) | 745,440.00 | 99,702.60 |
| Class 2 RIA 300,050 | 93,200 | 838,800.00 | 8,388.00 (9 %) | 932,000.00 | 101,588.00 |

The `totalTaxBeforeCredits` values are `baseTax + surcharge`; Class 1 €60,000 is 11,507.85 (credits 396.00 → final 11,111.85).

## 3. Deviations from the brief, and why

1. **Threshold cases use gross €151,020 / €151,070 and €301,020 / €301,070, not €150,000 / €150,050.** The 7 %/9 % wall is on the *taxable* base (`engine.ts:822-826`, `fondsRateFor(ordinaryTaxable)`), and every return carries the default forfaits of €1,020 (540 frais d'obtention + 480 FDS, `deductions.ts:227-232`). With literal gross €150,000 / €150,050 the taxable base is 148,980 / 149,030 and both stay at 7 %; same for €300,000 / €300,050 → 298,980 / 299,030. The tests therefore hold the *taxable* base at exactly 150,000 / 150,050 (and 300,000 / 300,050) and assert rate 0.07 → 0.09 plus `surcharge == baseTax × rate` to the cent. The comment in each test states the €1,020 offset.
2. **Class 2 needs `spouseUserId`.** `engine.ts:756-763` downgrades `CLASS_2` to `CLASS_1` when no spouse is registered, so a Class 2 case without `spouseUserId` produced baseTax 26,355 (Class 1 tariff on 98,980), not the audited 14,305. The test passes `spouseUserId: 'u2'` and asserts `result.taxClass === CLASS_2`.
3. **Class 1a uses gross €27,480.** The brief specifies *taxable* 26,460; with the €1,020 forfaits that is gross 27,480.
4. All other expected figures in the brief reproduced exactly, with no reason to adjust.

## 4. Verification

| Check | Command | Result |
|---|---|---|
| Engine + annex suites | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts` | **53 tests, 6 suites, 53 pass, 0 fail** (was 48: 41 engine + 7 annex) |
| New allowlist unit tests | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test apps/api/test/platform-admin.spec.ts` | **5 tests, 5 pass, 0 fail** |
| Type check | `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` | **exit 0** |
| Syntax/transpile | `node .tools/syntax_check.cjs` | **16/16 ok, exit 0** (was 9) |
| Mutation check (LEG-1) | Removed `/ 100`, re-ran the engine suite | **4 of the 5 new tests fail** (Class 1 60k, Class 2 100k, both thresholds). The Class 1a case passes either way because its cote is 0 — it guards against a spurious surcharge on a zero cote, not against the 100× factor. Fix restored, suite re-run green. |
| Engine before/after | Temporary revert of the one expression | Table in §2 |

Not run: `tsc -p tsconfig.api.json` (per instructions).

## 5. Not verified / open

- **API e2e not executed.** `@nestjs/*` and the generated Prisma client are absent in this environment, so `admin-governance.e2e-spec.ts` and the `@Roles` paths in the four controllers are **verified by review and transpile only** (`tsc -p tsconfig.test.json` does not include them; `syntax_check.cjs` transpiles the four controllers and the two new guard/helper files with 0 diagnostics; the e2e spec itself was parsed with `ts.transpileModule` — 0 syntax diagnostics). Runtime behaviour of the guard chain is untested.
- **Not proven at runtime:** ordinary user → 403 on `/api/admin/**`; allowlisted email → 200; `VIEWER` membership → 403 on upload / confirm / approve; `PRIMARY_FILER` → the write routes still succeed. Suggested command once Nest and the Prisma client exist: the admin-governance e2e plus `household-collaboration` / `cross-household-isolation` suites.
- **Static check on existing e2e flows (inference, not run):** the household creator is granted `HouseholdRole.PRIMARY_FILER` (`households.service.ts:52`), and no file under `apps/api/test` mentions `VIEWER`, so the existing suites — which act as the creator — should keep passing the new `@Roles` branch. This was read from the code, not executed.
- **Left undecorated (out of the enumerated scope):** `POST /api/workspaces/:workspaceId/tasks/:taskId/resolve` (`questionnaire.controller.ts:44`) mutates a readiness task and is still open to `VIEWER`. The brief listed only "submit/update" for this controller. Decision needed.
- **Still unscoped behind the gate:** `AdminService.getAdminAudit` remains an all-household query (`admin.service.ts:901-907`). API-1's interim gate limits *who* may call it; redaction and per-role audit scope are follow-ups in the audit.
- **No platform role in the schema:** as planned, this is an `ADMIN_EMAILS` allowlist, not the nine-role RBAC; it grants no document access and requires no migration.

## 6. Blocker

None for the code delivered. The only blocker is environmental: the API e2e suite cannot run here, so the authorization changes stop at transpile-level verification.
