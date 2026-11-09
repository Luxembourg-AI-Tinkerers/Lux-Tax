# Implementation plan — 2026-11-08 (second pass)

**Source:** four independent audits in `audit/audit-legal.md`, `audit/audit-product.md`, `audit/audit-api.md`, `audit/audit-mobile.md`.
**Baseline:** 48/48 tests pass; `tsc -p tsconfig.test.json` exit 0; `node .tools/syntax_check.cjs` 9/9, exit 0. API e2e cannot run here (no `@nestjs/*`, no generated Prisma client). API changes are therefore gated by syntax/transpile checks plus review, not by a live database.

## Selected for this run

### P0-1 — LEG-1: solidarity surcharge is 100× too large

- **Evidence:** `packages/tax-engine/src/engine.ts:929` adds a cents result (`mulRate(toCents(taxCote), rate)`) directly to a euro amount at `:957`. The two Art. 3ter branches divide by 100 at `:855-856` and `:886-887`; the ordinary branch does not.
- **Impact:** every Class 1, 1a and 2 return overstates `totalTaxBeforeCredits`, `finalTaxLiability` and `balancePayableOrRefund` by 99× the surcharge. The 48-test suite never asserts the final liability.
- **Scope:** `packages/tax-engine/src/engine.ts`, `packages/tax-engine/test/tax-engine.spec.ts`.
- **Acceptance:** Class 1 gross €60,000 → surcharge €752.85, final €11,111.85; Class 2 €100,000 → final €15,306.35; Class 1a €26,460 → final €0; threshold cases at €150,000/€150,050 and €300,000/€300,050 prove 7 %/9 %. Deleting the `/100` makes the suite fail.

### P0-2 — API-1: any registered user can call `/api/admin/**`

- **Evidence:** `apps/api/src/modules/admin/admin.controller.ts:36-39` applies only `JwtAuthGuard`. No platform role exists in `prisma/schema.prisma`. `@Roles()` is defined but applied to zero controllers, so `VIEWER` can upload, confirm and approve.
- **Scope (minimal, no schema migration):**
  - new pure helper `apps/api/src/common/auth/platform-admin.ts` and guard `platform-admin.guard.ts` reading `ADMIN_EMAILS` (comma-separated, case-insensitive);
  - apply it to `AdminController`; every admin route returns 403 unless the authenticated email is allowlisted;
  - apply `@Roles(PRIMARY_FILER, CO_FILER)` to write endpoints in documents, facts, filing and questionnaire so `VIEWER` cannot mutate or approve;
  - update `admin-governance.e2e-spec.ts` with a plain-user 403 case and an allowlisted 200 case;
  - add a pure unit test for the allowlist helper.
- **Acceptance:** plain user 403 on all `/api/admin/**`; allowlisted email 200; `VIEWER` 403 on upload/confirm/approve; full admin RBAC (nine roles, time-bound grants) remains a documented follow-up, not silently claimed.

### P0-3 — API-2 / PROD-1: private drafts leak through facts and calculations

- **Evidence:** `apps/api/src/modules/facts/facts.service.ts:38-44` queries all extracted/confirmed facts by workspace only; `facts.controller.ts:27-31` passes no user; `calculations.service.ts:75-77` consumes every `isIncludedInReturn` fact; `documents.service.ts:93,102` accepts `ownerId` and `visibility` from the upload body. `PROPOSED_FOR_RETURN` has zero references outside the enum.
- **Scope:**
  - new pure helper `apps/api/src/modules/facts/fact-visibility.ts`;
  - fact reads become user-aware: `PRIVATE_DRAFT` facts only for uploader/owner, shared states for household members;
  - confirmation and calculation only consume facts whose source document is `PROPOSED_FOR_RETURN` or `INCLUDED_IN_RETURN`; manual facts (no document) remain allowed;
  - upload forces `ownerId = uploaderId` and `visibility = PRIVATE_DRAFT`; reject a conflicting body instead of accepting it;
  - document list includes `PROPOSED_FOR_RETURN` for the spouse, keeps `PRIVATE_DRAFT` private;
  - add a pure unit test file for the helper.
- **Acceptance:** spouse B gets zero facts from spouse A's `PRIVATE_DRAFT` document; a calculation excludes `PRIVATE_DRAFT` and `SHARED_FOR_DISCUSSION` facts; upload with `visibility=INCLUDED_IN_RETURN` or a foreign `ownerId` is rejected; manual facts still calculate.

## Verified done, not selected

- Rule packages 2025/2026/2028, scale/Class 1a/Class 2, CIS/CI-CO2/CIM/CIP/CII/CISSM, FFO/travel/invalidity/FDS/111/111bis/épargne-logement/dons/AEP/LRCP/ASRD/CE, rental, securities, plus-values, treaties, migration baseline + 3 applied migrations (per tracker and audits).
- Form 100F sheet map, certificate 160/170 extractor branches, annex PDF builder, 7 annex tests.
- Household invitations, separate logins, audit feed, approval records, rollover endpoint, assessment import/compare (partial).

## Missing but not selected this run (documented, not hidden)

- **LEG-2** Art. 122 dégrèvement / Art. 123bis bonification (€922.50/child) — no code path.
- **LEG-3** CIM unreachable for divorced/widowed parents; not refunded when it exceeds tax.
- **LEG-4/5** foreign-taxed securities double-counted; Art. 3ter drops exemption-with-progression and foreign credit.
- **LEG-6** Art. 119 n° 3 b–c three-year Class 2 window.
- **LEG-7** certificate 160 / Form 100F maps partial.
- **LEG-8** Class 2 vs 2×Class 1 scenario comparison.
- **API-3** cross-workspace `confirmFact`; `HouseholdGuard` fails open.
- **API-4/PROD-8** no notification persistence, delivery or preferences.
- **API-5/PROD-3** approval invalidation only on fact edits; no version history UI.
- **API-6/PROD-6** no filing record, follow-up/objection dates, frozen filed version.
- **API-7/PROD-4** package can be generated with one approval; hash overwritten; no evidence index/mapping version.
- **API-8** no rate limiting, MFA/passkeys, session hardening.
- **API-9/PROD-7** no scenario comparison or calculation history.
- **MOB-1..11** mobile is outside the workspace/build; wrong workspace ids in upload/calculation/approval; no push, deep links, offline queue, biometric gate or package download.
- **DOC-1..4** gap-check §5 and tracker counts are stale; docs editor will correct only what this run proves.

## Externally blocked (not code work)

- 2026 CIC monthly table: no published Mémorial table as of 2026-11-08; `pendingMeasures.CIC_2026` returns 0 with a warning.
- Loi 8775 épargne-logement age-limit suppression: no published text; `pendingMeasures.EPARGNE_LOGEMENT_8775` gates activation.

## Execution order

1. P0-1 (engine) — smallest, changes expected numbers; must land before API tests.
2. P0-2 (admin/household authorization) — independent files.
3. P0-3 (private-draft enforcement) — touches facts/documents/calculations.
4. Verification: engine + annex suites, `tsc -p tsconfig.test.json`, `node .tools/syntax_check.cjs`; API checks are syntax/transpile plus review.
5. Independent review, then docs update.
