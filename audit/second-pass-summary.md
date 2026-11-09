# Lux-Tax — second gap-closure pass (2026-11-08)

**Question:** read the markdown docs, establish what is done, what is missing, implement what is missing, and verify.

**Method:** four independent audits against the requirement docs and the code (`audit/audit-legal.md`, `audit/audit-api.md`, `audit/audit-product.md`, `audit/audit-mobile.md`), a triage plan (`audit/implementation-plan-2026-11-08.md`), two implementation passes, an integration pass, independent review round 1 (`audit/review-round1.md`), a fix pass (`audit/impl-review-fixes.md`), review round 2 (`audit/review-round2.md`, allPass = true), and a docs update.

## What the audits found

The 48-test green baseline was real but incomplete. The most serious findings:

1. **P0 engine bug:** the solidarity surcharge was computed in cents and added as euros (`engine.ts:929`), so every ordinary Class 1/1a/2 return overstated the final liability by roughly 100× the surcharge. No test asserted the final return.
2. **P0 authorization:** `/api/admin/**` required only authentication; any self-registered user could read every household's audit log and repoint AI model routes. Household `@Roles` was defined but applied to zero controllers.
3. **P0 privacy:** facts from another spouse's `PRIVATE_DRAFT` document were returned by `GET /facts` and consumed by the joint calculation; upload accepted arbitrary `ownerId` and `visibility`.
4. P1/P2 gaps: Art. 122/123bis child relief absent, CIM unreachable for divorced/widowed parents, foreign-taxed securities double-counted, no scenario comparison, no notification centre, partial approval/version/filing-package lifecycle, mobile outside the build and passing household ids where workspace ids are required.

## What was implemented this pass

### P0-1 — solidarity surcharge unit bug

- `packages/tax-engine/src/engine.ts:931` now divides the cents result by 100 before adding it to the euro cote, matching the two Art. 3ter branches.
- Five new tests assert the final return, not only `baseTax`: Class 1 €60,000 → surcharge €752.85 / final €11,111.85; Class 2 €100,000 → final €15,306.35; Class 1a €26,460 → 0; 7 %→9 % walls at €150,000 and €300,000 taxable.

### P0-2 — admin authorization and household write roles

- New `ADMIN_EMAILS` allowlist gate (`platform-admin.ts`, `platform-admin.guard.ts`), applied class-wide to `AdminController`; fails closed when unset, exact/case-insensitive matching.
- `@Roles(PRIMARY_FILER, CO_FILER)` on document upload/visibility/delete, fact confirm/update/delete, filing approve/package/assessment/rollover, and questionnaire submit; `VIEWER` can no longer mutate or approve.
- Household invitations restricted to `PRIMARY_FILER` and may only grant `CO_FILER`/`VIEWER`; freelance write/demo handlers restricted to filers.
- This is an interim allowlist, **not** the nine-role platform RBAC in plan §5.1; that remains a follow-up.

### P0-3 — private-draft enforcement

- New pure policy module `fact-visibility.ts`; user-aware fact reads; calculation, filing package and freelance metrics only consume facts from `PROPOSED_FOR_RETURN`/`INCLUDED_IN_RETURN` documents (manual facts remain allowed).
- Upload is forced to `PRIVATE_DRAFT`; `ownerId` may only be the uploader or an active same-household member; a conflicting body is 400.
- Private fact values are redacted from the household activity feed (confirm/update/delete and approval-invalidation reasons); deleting a private source no longer turns the fact into a shared manual fact; `deleteFact` is ownership-guarded.
- Web uploads go private and then `PATCH` the chosen visibility; the UI warns when a fact is saved but the API refused to include it.

## Verification

| Check | Result |
|---|---|
| Engine + annex + platform-admin + fact-visibility suites | **70 / 70 pass** (46 engine, 7 annex PDF, 5 platform-admin, 12 fact-visibility) |
| `tsc -p tsconfig.test.json` | exit 0 |
| `node .tools/syntax_check.cjs` | 27 / 27 files `ok`, exit 0 |
| Independent review round 2 | **allPass = true**; no remaining private-fact read/write path in newly created data |

**Not verified here:** API e2e (`admin-governance`, `tax-lifecycle-full`, `household-collaboration`, `freelance-lifecycle`, `receipt-scanning`, `cross-household-isolation`) cannot run because `@nestjs/*`, the generated Prisma client and PostgreSQL are absent in this environment. Those specs were updated and transpile cleanly, but their runtime assertions (403/200 guard paths, updated lifecycle steps) still need a DB-enabled run. Legacy rows written before this pass are not backfilled.

## What is still missing

**Legal / engine (P1/P2):**

- Art. 122 dégrèvement and Art. 123bis bonification (€922.50/child) — no code path.
- CIM unreachable for divorced/widowed parents; not refunded when it exceeds tax.
- Foreign-taxed securities income double-counted; Art. 3ter drops exemption-with-progression and foreign credit.
- Art. 119 n° 3 b–c three-year Class 2 window.
- Certificate 160 / Form 100F maps partial.
- Class 2 vs 2×Class 1 (Art. 3ter) scenario comparison.

**API / product:**

- `HouseholdGuard` still fails open when no household id resolves; `confirmFact` cross-workspace edge.
- No notification persistence/delivery/preferences (plan 7.9).
- Approval invalidation only on fact edits; no visible version history.
- No filing record, assessment follow-up/objection dates or frozen filed version.
- Package can be generated with one approval; hash overwritten on regeneration; no evidence index/mapping version.
- No rate limiting, MFA/passkeys or session hardening.
- No calculation history.

**Mobile:** `apps/mobile` is outside the monorepo build; upload/calculation/approval pass household ids where workspace ids are required; no push, deep links, offline queue, biometric gate or package download.

**Externally blocked:** the 2026 CIC monthly table and the loi 8775 épargne-logement text are still unpublished. Both are gated (`pendingMeasures`), return 0 and warn; no code can close them.

## Files of record

- `audit/implementation-plan-2026-11-08.md` — selected scope and acceptance criteria.
- `audit/impl-engine-auth.md`, `audit/impl-privacy.md`, `audit/impl-integration.md`, `audit/impl-review-fixes.md` — implementation reports.
- `audit/review-round1.md`, `audit/review-round2.md` — independent review.
- `implementation-tracker.md`, `gap-check-2026-11-08.md`, `docs/luxembourg-resident-tax-optimisation-checklist-2025-2026.md` — updated status.
