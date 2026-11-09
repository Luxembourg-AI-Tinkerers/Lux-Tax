# Independent review — round 1 (2026-11-08)

**Verdict: not shippable as-is.** P0-1 passes; P0-2 passes (one documented follow-up); P0-3 is partial — the document/fact/calculation/upload paths are correct, but a spouse can still read a private-draft fact's field and exact amount from the household activity trail, and a second (documented) read path opens when the private document is deleted.

**Review basis:** `audit/implementation-plan-2026-11-08.md` (scope + acceptance), `audit/impl-engine-auth.md`, `audit/impl-privacy.md`, `audit/impl-integration.md`, the current worktree diff, and the commands listed in §5. No implementer claim was accepted without reading the code.

## 1. Per-item verdicts

| Item | Verdict | Basis |
|---|---|---|
| P0-1 LEG-1 (engine surcharge) | **PASS** | Ordinary branch divides by 100 at `packages/tax-engine/src/engine.ts:931`; both Art. 3ter branches still divide at `:855-856` and `:886-887`; all five `mulRate` call sites are cents→euros correct; new tests assert final liability, not just the cote. |
| P0-2 API-1 (admin gate + write roles) | **PASS** (follow-ups recorded) | `ADMIN_EMAILS` allowlist fails closed, exact/case-insensitive, applied class-wide to the only admin controller; `@Roles(PRIMARY_FILER, CO_FILER)` on every mutating handler in the four controllers except the accepted `tasks/:taskId/resolve`; e2e sets the env before admin calls, adds plain-user 403 cases, and cleans up. Out-of-scope mutation routes remain (M2). |
| P0-3 API-2/PROD-1 (private drafts) | **PARTIAL — 1 blocker** | Read filters, calculation, filing/freelance predicates, upload contract and web PATCH flow are correct; a private fact's amount is still broadcast to the household through the audit feed (B1), and the documented `SetNull` edge (M1) is a second read leak in the "delete a bad scan" flow. |

## 2. Must fix (blockers)

### B1 — Private-draft fact values are still readable by the spouse through the household activity trail

**Location:** `apps/api/src/modules/facts/facts.service.ts:231-246` (confirm), `:336-345` (update), `:394-405` (delete); read at `apps/api/src/modules/audit/audit.controller.ts:14-33`; payload built at `apps/api/src/modules/audit/audit.service.ts:84-100`; rendered at `apps/web/src/app/(workspace)/[householdId]/dashboard/page.tsx:56` and `:376`.

**Problem:** `confirmFact` writes a household-visible audit event containing the fact's `fieldKey` and exact `amount`:

```ts
newValue: { category: confirmed.category, fieldKey: confirmed.fieldKey, amount: confirmed.amount.toString() },
description: `Confirmed fact "${confirmed.fieldKey}" for ${confirmed.amount} EUR`,
```

`updateFact` logs both the previous and the new amount (`:343-345`), and `deleteFact` logs the amount too (`:401-402`). `GET /api/households/:id/activity` is guarded only by `JwtAuthGuard` + `HouseholdGuard` — every ACTIVE member may read it — and `getHouseholdActivity` filters only by `householdId`, `workspaceId` and `eventType` (`audit.service.ts:71-82`); it returns `description` and `newValue` verbatim. The dashboard fetches the last 10 events (`page.tsx:56`) and prints `event.description` (`:376`).

**Impact:** spouse B opens the dashboard after spouse A confirms a fact from a PRIVATE_DRAFT and reads the fact's category, field key and exact amount — the data P0-3 promises to hide. The event also exposes `entityId` (the confirmed-fact id), which `deleteFact` accepts without any ownership check (M3), turning the read leak into a destructive path. The new e2e coverage does not catch this: `tax-lifecycle-full.e2e-spec.ts:226-236` asserts only `GET /facts`, and no assertion reads `/activity` after A confirms a private fact.

**Evidence:** the private-source gate added at `facts.service.ts:191-202` protects the `ConfirmedFact` row and the `GET /facts` query, but the audit call at `:231` is unconditional and does not receive `sourceVisibility`. Nothing in `audit.service.ts` redacts `newValue` or `description`.

**Fix direction:** do not persist private fact values in household-visible audit rows — log the fact id and category only (or write a redacted description when `sourceVisibility` is `PRIVATE_DRAFT`/`SHARED_FOR_DISCUSSION`), or redact at read time using the fact's source-document visibility; alternatively scope `FACT_CONFIRMED`/`FACT_UPDATED` events to the actor. Add an e2e assertion that B's `/activity` response contains neither the amount nor the field key of A's private fact.

**Confidence:** verified in code; API e2e cannot run here (no Nest/Prisma/Postgres), so the HTTP path is review-level, not executed.

## 3. Worth considering (major, not counted as blockers)

### M1 — `ConfirmedFact.sourceDocument` `SetNull` turns a private-draft fact into a shared "manual" fact when the document is deleted

**Location:** `apps/api/prisma/schema.prisma` (`ConfirmedFact.sourceDocument ... onDelete: SetNull`); read branch `apps/api/src/modules/facts/facts.service.ts:78-83`; default visibility of confirmed facts `:215`; `updateFact` manual branch `:295-309`.

**Problem:** A uploads a private salary certificate, confirms `grossSalary` (the API correctly stores `isIncludedInReturn=false`), then deletes the bad scan. `sourceDocumentId` becomes `NULL`; the fact is now a "manual" fact with `isSharedWithHousehold = true` (default at `:215`), so B's `GET /facts` returns it with the exact amount. A can then set `isIncludedInReturn=true` through `updateFact` because `canIncludeInReturn(null)` is true (`fact-visibility.ts:90-100`, gate at `facts.service.ts:307`), putting it into the joint return.

**Impact:** a realistic "replace a bad scan" flow leaks the amount to the spouse and can move the fact into the return. This is documented as limitation 5 in `audit/impl-privacy.md` §4.5 ("Not implemented — it was outside the approved rules"); because it is explicitly documented I am not counting it as a blocker, but it is inside the P0-3 privacy guarantee, so the parent should decide whether the documented exception is acceptable.

**Fix direction:** force `isSharedWithHousehold=false` for facts confirmed from a `PRIVATE_DRAFT` source, and/or replace `SetNull` with a tombstone/`RESTRICT` so the source visibility is never lost; add a unit/e2e case for delete-then-read.

### M2 — VIEWER can still mutate through unguarded household/freelance routes

**Location:** `apps/api/src/modules/households/households.controller.ts:59-70` (invite), `packages/validation/src/household.schema.ts:10-12` (any `HouseholdRole` accepted), `apps/api/src/modules/households/households.service.ts:162-166` (`invitedRole: dto.role`); `apps/api/src/modules/freelance/freelance.controller.ts:35-43` (`PUT profiles/:ownerId`), `:55-60` (`POST demo`); `apps/api/src/modules/freelance/freelance.service.ts:473-487` (demo facts written with `isIncludedInReturn` true for the loader's `INCLUDED_IN_RETURN` documents).

**Problem:** a VIEWER is blocked from upload/confirm/approve in the four controllers, but can (a) invite a new account with `role: PRIMARY_FILER` (the invitation endpoint has no `@Roles` and the schema allows every role), then use that account to write, and (b) call `POST /freelance/demo`, which creates documents and confirmed facts that the calculation includes. `PUT /freelance/profiles/:ownerId` is likewise open.

**Impact:** the P0-2 control is bypassable in practice: a read-only member can mint a filer account or inject demo revenue/expense into the joint return. This is outside the four controllers enumerated in the acceptance, so P0-2 still passes its stated check, but it is the same class of gap and is not documented as a follow-up in either implementation report.

**Fix direction:** `@Roles(PRIMARY_FILER)` on `POST :id/invitations`, restrict `inviteMemberSchema.role` to `CO_FILER`/`VIEWER`, and put `@Roles(PRIMARY_FILER, CO_FILER)` on the freelance write/demo handlers; or record them explicitly as accepted follow-ups.

### M3 — `deleteFact` has no ownership or visibility check

**Location:** `apps/api/src/modules/facts/facts.service.ts:368-390`.

**Problem:** after loading the fact and checking only `workspaceId`, `deleteFact` deletes it. Unlike `updateFact` (`:288-309`), there is no check that the caller owns the fact, uploaded/owns the source document, or may read a private manual fact. Combined with B1, B can obtain the id of A's private fact from the activity feed and delete it.

**Impact:** a CO_FILER can destroy another member's private fact (data loss); not a read leak, but an authorization gap in the module this run changes. The UI only exposes delete for facts the list returns, which limits accidental use, not a crafted call.

**Fix direction:** apply the same `isPrivateDraft`/`isPrivateManualFact`/`ownedByAnotherUser` guard as `updateFact` before deleting.

### M4 — Web confirm reports success when the API downgrades `isIncludedInReturn` to false

**Location:** `apps/web/src/components/DocumentsView.tsx:232-247`; server rule `apps/api/src/modules/facts/facts.service.ts:201-202`.

**Problem:** the confirm handler always sends `isIncludedInReturn: true` and, on a 201, shows `Confirmed €X (field) into return facts!` without inspecting the returned flag. For a document left in `SHARED_FOR_DISCUSSION` (which is what `DocumentsView` itself sets after upload, `:41,97`), the API stores `false` and the calculation excludes the fact; the user is told the opposite.

**Impact:** the user can confirm salary/withholding from a discussion document, see success, and file a return that omits the income. This is documented as limitation 9 in `audit/impl-privacy.md` and limitation 6 in `audit/impl-integration.md`, so it is not a blocker; but it is a real correctness gap, not cosmetics.

**Fix direction:** read `res.data.isIncludedInReturn` and warn/prompt promotion when false, or promote to `PROPOSED_FOR_RETURN` before confirming with explicit user consent.

## 4. Record only

- **Metadata oracles from private facts:** `questionnaire.service.ts:112-113,143-190` derives "has salary/mortgage" and "N extracted facts awaiting confirmation" from all facts/documents; `freelance.service.ts:80-90` creates a profile from any `FREELANCE_INCOME`/`BUSINESS_EXPENSE` fact; `:186-196` counts all workspace documents. No amounts, but the spouse can infer that private evidence exists and its category/count. Applying the same predicate to the readiness/profile/count queries would close it.
- **`ARCHIVED` inconsistency:** `fact-visibility.ts:40-49` treats `ARCHIVED` as shared, but `documents.service.ts:221-240` omits it from the spouse's document list; facts from an archived document are readable while the document is not listed (documented in impl-privacy §4.7).
- **`ADMIN_EMAILS` is not in `.env.example`/README:** `.env.example:3-4` lists only the JWT secrets. An unset value fails closed (correct) but silently 403s every admin route; operators need the variable documented.
- **`updateVisibility` transition policy remains open:** `documents.service.ts:269-300` allows the uploader/owner to jump straight to `INCLUDED_IN_RETURN` (or `ARCHIVED`); the web flows depend on it and "who may promote" is an open policy question (impl-privacy §4.3).
- **`GET /facts` has no `@Roles`:** a VIEWER can read shared facts; by design (impl-privacy §4.8), recorded for completeness.
- **`POST tasks/:taskId/resolve` is still open to VIEWER:** accepted as the known follow-up in the brief; no change.
- **Legacy snapshots:** `ReturnVersion.factsSnapshotJson` rows created before this fix can still contain private facts and have no backfill/migration; new approvals use the filtered set (`filing.service.ts:33-52,71`).
- **Pre-existing `freelance-lifecycle` box assertions:** `apps/api/test/freelance-lifecycle.e2e-spec.ts:450-468` expects `boxNumber` `'21'`–`'24'`, while `filing.service.ts:283-288` emits `'C/A-I'`; documented in impl-integration §5.4, not caused by this run, and not run here.
- **Engine DTO rate field:** `engine.ts:1142` reports `solidaritySurchargeRate` from the joint `ordinaryTaxable` even in the Art. 3ter branches, where the amount uses each spouse's own taxable; the amount is correct, the reported rate can differ for asymmetric reallocation (prior-session code, not this fix).
- **JWT default secret:** `apps/api/src/modules/auth/jwt.strategy.ts:16-17` falls back to a hard-coded development secret if `JWT_ACCESS_SECRET` is unset; the allowlist gate is only as strong as the token issuer (pre-existing, API-8 scope).

## 5. Verification run (this machine, read-only)

| # | Command | Result |
|---|---|---|
| 1 | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts` | exit 0 — `tests 66`, `suites 9`, `pass 66`, `fail 0` |
| 2 | `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` | exit 0, no output |
| 3 | `node .tools/syntax_check.cjs` | exit 0 — 22 files `ok`, 0 `FAIL` |
| 4 | `ts.transpileModule` on `tax-lifecycle-full`, `receipt-scanning`, `freelance-lifecycle`, `admin-governance` e2e specs | 0 syntax diagnostics each |

P0-1 mutation check by assertion reading (no file edited): `close(expected, tolerance=0.01)` at `tax-engine.spec.ts:23-28`; the new tests assert `solidaritySurchargeAmount` `752.85` / `1_001.35` / `3_261.3` / `4_194.9` / `6_522.6` / `8_388`, `totalTaxBeforeCredits` `11_507.85`, `finalTaxLiability` `11_111.85` / `15_306.35`, and `balancePayableOrRefund` `11_111.85` (`:694-759`). Removing the `/100` at `engine.ts:931` makes the surcharge `75_285` / `100_135` / `326_130` / `419_490` / `652_260` / `838_800`, so the four non-zero cases fail by orders of magnitude; the Class 1a case is zero on both sides and stays green — consistent with the reported 4/5. I did not re-run the mutation to keep the worktree unmodified.

## 6. Coverage and not covered

**Checked:** every acceptance bullet for P0-1/P0-2/P0-3; all five `mulRate` sites (plus `scale.ts:39,77,83`); class-level guard coverage of `AdminController`; JWT payload includes `email`; role enum values; `HouseholdGuard` role branch; all mutating handlers in documents/facts/filing/questionnaire; every `confirmedFact.findMany`/`confirmedFacts` include in the API; `documents` upload/list/visibility; `confirmFact`/`updateFact`/`deleteFact`; calculation, filing snapshot, filing package, freelance metrics/demo creation predicates; the three web upload flows and `updateDocumentVisibility`; the four e2e specs' diffs; `tsconfig.test.json` and `syntax_check.cjs` inclusion.

**Not covered / not executable here:** the API e2e suite (no `@nestjs/*`, no generated Prisma client, no Postgres — as stated in the brief), so the 403/200 guard paths, the `@Roles` runtime branch, and the new e2e assertions are review+transpile only. `tsc -p tsconfig.api.json` was not run (explicitly excluded); the Prisma nested-filter shapes (`document.OR`, `sourceDocument.is.OR`) were checked against `schema.prisma`, not by the compiler. The mutation run was not repeated (read-only). No browser/UI run.

**Files judged:** only this run's files (`engine.ts`, engine spec, platform-admin helper/guard, admin/documents/facts/filing/questionnaire controllers, facts/documents/calculations/filing/freelance services, `fact-visibility.ts`, the three web upload components, the four e2e specs, test config/syntax list). The large pre-existing diffs in `receipt-ai-vision.service.ts`, `schema.prisma`, questionnaire/contracts/web views were not re-reviewed except where they intersect these paths.
