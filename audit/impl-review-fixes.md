# Review round 1 — fixes (B1, M1, M2, M3, M4)

Date: 2026-11-08
Scope: only the review findings in `audit/review-round1.md` §2–§3. The engine, admin allowlist, privacy read filters and the web upload→PATCH flow were left as they are on disk.

## 1. Files changed

| File | Change |
|---|---|
| `apps/api/src/modules/facts/fact-visibility.ts` | **B1** new pure helper `shouldRedactFactAudit(visibility, isSharedWithHousehold)`. |
| `apps/api/src/modules/facts/facts.service.ts` | **B1** redacted audit rows in `confirmFact`/`updateFact`/`deleteFact` (and in the approval-invalidation reason); **M1** private-draft facts forced to `isSharedWithHousehold=false` + `ownerId=userId`; **M3** shared private/ownership guard (`isPrivateFactOfAnotherUser`) applied by both `updateFact` and `deleteFact`, with `deleteFact` now loading the source document. |
| `apps/api/src/modules/households/households.controller.ts` | **M2** `@Roles(HouseholdRole.PRIMARY_FILER)` on `POST :id/invitations` (guard was already `JwtAuthGuard, HouseholdGuard`). |
| `packages/validation/src/household.schema.ts` | **M2** `inviteMemberSchema.role` restricted to `CO_FILER` / `VIEWER`; `PRIMARY_FILER` is a 400. |
| `apps/api/src/modules/freelance/freelance.controller.ts` | **M2** `@Roles(PRIMARY_FILER, CO_FILER)` on `PUT profiles/:ownerId` and `POST demo`; GETs untouched (class-level guard already present). |
| `apps/web/src/lib/fact-inclusion.ts` | **M4** new `factInclusionWarning(requested, returned)` + shared message constant. |
| `apps/web/src/components/DocumentsView.tsx` | **M4** confirm reads `res.data.isIncludedInReturn`; a downgrade is reported as a warning, never as "into return facts". |
| `apps/web/src/components/FreelanceBusinessView.tsx` | **M4** same check on the freelance confirm. |
| `apps/web/src/components/FactsView.tsx` | **M4** same check on manual-fact create and on the 6-fact demo loop (aggregated). |
| `apps/web/src/components/QuestionnaireView.tsx` | **M4** same check on the three quick-estimate confirms (aggregated). |
| `apps/api/test/fact-visibility.spec.ts` | 4 new tests for `shouldRedactFactAudit`. |
| `apps/api/test/tax-lifecycle-full.e2e-spec.ts` | New "Step 3c": private confirm → B's `/activity` redaction, B delete → 403, update redaction, document delete then B read/edit → hidden/403, fact delete redaction. |
| `.tools/syntax_check.cjs` | Adds the two controllers, `household.schema.ts`, `fact-inclusion.ts`, `FactsView.tsx`. |

No schema/migration change: `ConfirmedFact.sourceDocument` stays `onDelete: SetNull`.

## 2. Exact logic

### 2.1 `shouldRedactFactAudit(visibility, isSharedWithHousehold)`

```
PRIVATE_DRAFT                                            -> true
SHARED_FOR_DISCUSSION | PROPOSED_FOR_RETURN |
INCLUDED_IN_RETURN | ARCHIVED                            -> false   (already readable via GET /facts)
null | undefined (manual fact, or source doc deleted)     -> isSharedWithHousehold === false
anything else (unknown state)                             -> true    (fails closed)
```

### 2.2 `confirmFact`

- `isPrivateSource = sourceVisibility === 'PRIVATE_DRAFT'`.
- `ownerId        = isPrivateSource ? userId : (input.ownerId || userId)` — a different owner in the body is ignored for private drafts.
- `isSharedWithHousehold = isPrivateSource ? false : (input.isSharedWithHousehold ?? true)` — M1; the fact can never become a shared "manual" fact when the document is deleted.
- `isIncludedInReturn` unchanged: `(input.isIncludedInReturn ?? true) && canIncludeInReturn(sourceVisibility)`.
- `redact = shouldRedactFactAudit(sourceVisibility, confirmed.isSharedWithHousehold)`.
  - redacted: `newValue = { category }`, `description = 'Confirmed a private fact (details hidden)'`, and the `invalidateApprovalsIfAny` reason is the same string (that reason is stored on the approval and echoed into the household-visible `APPROVAL_INVALIDATED` event).
  - not redacted: previous payload/description unchanged.

### 2.3 `updateFact`

- Ownership/visibility guard extracted unchanged into `isPrivateFactOfAnotherUser(fact, userId)`:
  `(visibility === 'PRIVATE_DRAFT' || (visibility === null && !isSharedWithHousehold)) && fact.ownerId !== userId && uploaderId !== userId && documentOwnerId !== userId`.
- `redact = shouldRedactFactAudit(sourceVisibility, before.isSharedWithHousehold) || shouldRedactFactAudit(sourceVisibility, after.isSharedWithHousehold)` — sharing a formerly private fact must not retroactively publish the amount.
- redacted: `previousValue = { category }`, `newValue = { category }`, `description = 'Updated a private fact (details hidden)'`; invalidation reason redacted too.

### 2.4 `deleteFact` (M3 + B1)

- Now loads `sourceDocument { uploaderId, ownerId, visibility }`, applies the same `isPrivateFactOfAnotherUser` guard → `403` `'Private facts can only be deleted by their uploader or owner'`.
- `redact = shouldRedactFactAudit(sourceVisibility, fact.isSharedWithHousehold)`.
- redacted: `previousValue = { category }`, `description = 'Deleted a private fact (details hidden)'`.
- Response shape unchanged (`{ success: true }`); the event type is unchanged (`FACT_UPDATED`).

### 2.5 Web downgrade check (M4)

`factInclusionWarning(requested, returned)` returns the message only when `requested === true && returned === false`; every confirmed-fact response is now inspected. The message states the fact was saved but is **not** in the return, and that the document must be promoted to `PROPOSED_FOR_RETURN` / `INCLUDED_IN_RETURN`. It is rendered through the existing toast channel (`error` styling) — no new UI state, and no automatic promotion: promoting a `PRIVATE_DRAFT` from a confirm click would publish the document to the household without consent.

## 3. Tests run (this machine)

| # | Command | Result |
|---|---|---|
| 1 | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test apps/api/test/fact-visibility.spec.ts packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts apps/api/test/platform-admin.spec.ts` | exit 0 — `tests 70`, `suites 10`, `pass 70`, `fail 0` (was 66; +4 audit-redaction tests) |
| 2 | `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` | exit 0, no output |
| 3 | `node .tools/syntax_check.cjs` | exit 0 — 27 files `ok`, 0 `FAIL` |
| 4 | `node .tools/transpile_check.cjs <specs>` | 0 diagnostics for `tax-lifecycle-full`, `freelance-lifecycle`, `receipt-scanning`, `admin-governance`, `household-collaboration`, `cross-household-isolation` |

What the new tests actually assert:

- **Unit (executed):** `PRIVATE_DRAFT` redacted regardless of the shared flag; manual fact redacted only while `isSharedWithHousehold === false`; shared/proposed/included/archived not redacted; unknown visibility redacted.
- **e2e (not executed — see §4) "Step 3c":**
  1. A uploads a private certificate, confirms `privateSalaryMemo` / `97531.42` while sending `isIncludedInReturn: true`, `isSharedWithHousehold: true`, `ownerId: userBId`.
  2. Response must be `ownerId === A`, `isSharedWithHousehold === false`, `isIncludedInReturn === false` (M1).
  3. B's `/activity` payload must not contain `privateSalaryMemo` or `97531.42`; the event for the fact must read `Confirmed a private fact (details hidden)` and its `newValue` must have no `fieldKey`/`amount` (B1).
  4. B `DELETE` the fact → `403` (M3).
  5. A `PATCH` amount to `86420.11`; B's `/activity` must contain neither the old nor the new amount (B1 update path).
  6. A deletes the private **document**; B's `GET /facts` must not return the fact, A's must return it with `sourceDocumentId: null`, `isSharedWithHousehold: false`, `isIncludedInReturn: false`; B `PATCH` → `403` (M1 delete-then-read).
  7. A deletes the fact; every event for that id must be redacted and contain neither amount nor field key (B1 delete path).

## 4. Remaining limits / not verified

1. **API e2e not executed.** `@nestjs/*`, `@prisma/client` and Postgres are absent, so Step 3c, the 403 paths and the `@Roles` runtime branch are review + transpile only. They must be run in a DB-enabled environment (`tax-lifecycle-full.e2e-spec.ts`, plus `household-collaboration` / `freelance-lifecycle` for the invitation and freelance role changes).
2. **`facts.service.ts`, both controllers and `household.schema.ts` are not typechecked here.** `tsconfig.test.json` does not include them, `tsc -p tsconfig.api.json` was excluded by the brief, and there is no `zod`/`@nestjs`/`@prisma/client` on disk. Prisma include shapes (`sourceDocument.select`) and the nullable `ConfirmedFact.ownerId` were checked by reading `schema.prisma`; the `.refine(...).default(...)` chain was verified by review, not by the compiler.
3. **Web is transpile-only.** No web `tsc`, no browser run: the new toast text and its `res.data?.isIncludedInReturn` reads were not rendered.
4. **No backfill.** Audit rows written before this fix keep their plaintext amounts, and a private fact confirmed before this fix still has `isSharedWithHousehold = true`; if its document was already deleted, it remains a shared manual fact. Closing that needs a data migration (and, for the audit rows, a scrub), which was out of scope.
5. **`updateFact` still lets an owner re-share their own private fact** (`isSharedWithHousehold: true`, or `ownerId` reassignment). That is an explicit owner action; once shared, later edits are deliberately not redacted.
6. **M4 wording is a warning, not a repair.** The saved fact stays excluded until someone promotes the document and includes the figure; `DocumentsView` offers no per-fact include toggle, so the message points at the document vault only. Owner-facing policy for promotion (`impl-privacy.md` §4.3) is unchanged.
7. **`GET /facts` still has no `@Roles`** (recorded, by design in `impl-privacy.md` §4.8).
