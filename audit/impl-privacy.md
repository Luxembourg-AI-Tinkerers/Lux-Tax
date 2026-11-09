# P0-3 / API-2 / PROD-1 — private-draft enforcement

Date: 2026-11-08
Scope: `apps/api` facts, documents and calculations read paths + upload contract; tests and test config.
Plan reference: `audit/implementation-plan-2026-11-08.md` P0-3; `audit/audit-api.md` API-2; `audit/audit-product.md` PROD-1.

## 1. Files changed

| File | Change |
|---|---|
| `apps/api/src/modules/facts/fact-visibility.ts` | **New** pure policy module: `Visibility` type, `canReadDocument`, `isSharedForDiscussion`, `canIncludeInReturn`. No Nest/Prisma/Node imports. |
| `apps/api/src/modules/facts/facts.service.ts` | User-aware `getFactsForWorkspace`; source-visibility gate in `confirmFact` (forces `isIncludedInReturn=false`); edit/visibility guards in `updateFact`. DTO shapes unchanged. |
| `apps/api/src/modules/facts/facts.controller.ts` | Passes `@CurrentUser('id')` into `getFactsForWorkspace`. Existing `@Roles` decorators untouched. |
| `apps/api/src/modules/documents/documents.service.ts` | Upload forces `ownerId = uploaderId` and `visibility = PRIVATE_DRAFT`, rejects conflicting bodies with 400; document list adds `PROPOSED_FOR_RETURN` and the `ownerId` branch. |
| `apps/api/src/modules/calculations/calculations.service.ts` | `confirmedFacts` relation filter now also requires a manual fact or a `PROPOSED_FOR_RETURN`/`INCLUDED_IN_RETURN` source document. |
| `apps/api/test/fact-visibility.spec.ts` | **New** `node:test` suite for the helper (8 tests). |
| `apps/api/test/tax-lifecycle-full.e2e-spec.ts` | Promotes the document to `PROPOSED_FOR_RETURN` before inclusion; new assertions (a) and (b); spoofed-upload assertions. Existing assertions kept. |
| `tsconfig.test.json` | Includes `fact-visibility.ts` and `fact-visibility.spec.ts`. |
| `.tools/syntax_check.cjs` | Adds `facts.service.ts`, `documents.service.ts`, `fact-visibility.ts` (`calculations.service.ts`, `facts.controller.ts` were already listed). |

## 2. Exact access / filter logic

### 2.1 Helper (`fact-visibility.ts`)

```
canReadDocument(visibility, uploaderId, ownerId, userId):
  userId missing                    -> false
  userId === uploaderId or ownerId  -> true
  SHARED_FOR_DISCUSSION | PROPOSED_FOR_RETURN | INCLUDED_IN_RETURN | ARCHIVED -> true
  PRIVATE_DRAFT | unknown           -> false

canIncludeInReturn(visibility):
  null/undefined (manual fact) -> true
  PROPOSED_FOR_RETURN | INCLUDED_IN_RETURN -> true
  PRIVATE_DRAFT | SHARED_FOR_DISCUSSION | ARCHIVED -> false

isSharedForDiscussion(visibility) === (visibility === 'SHARED_FOR_DISCUSSION')
```

### 2.2 `getFactsForWorkspace(workspaceId, userId)`

Extracted facts (Prisma, to-one relation shorthand on the required `document`):

```ts
where: {
  workspaceId,
  document: {
    OR: [
      { uploaderId: userId },
      { ownerId: userId },
      { visibility: { in: [SHARED_FOR_DISCUSSION, PROPOSED_FOR_RETURN, INCLUDED_IN_RETURN, ARCHIVED] } },
    ],
  },
}
```

Confirmed facts:

```ts
where: {
  workspaceId,
  OR: [
    { sourceDocumentId: null, OR: [{ ownerId: userId }, { isSharedWithHousehold: true }] },
    { sourceDocument: { is: { OR: [
      { uploaderId: userId },
      { ownerId: userId },
      { visibility: { in: [SHARED_FOR_DISCUSSION, PROPOSED_FOR_RETURN, INCLUDED_IN_RETURN, ARCHIVED] } },
    ] } } },
  ],
}
```

`HOUSEHOLD_VISIBLE_DOCUMENT_STATES` is defined once at the top of the service and mirrors the shared branch of `canReadDocument`. DTO construction is untouched.

### 2.3 `confirmFact`

With `input.extractedFactId`:

1. Fetch the extracted fact **with its document** (`uploaderId`, `ownerId`, `visibility`).
2. `404` if missing or `extracted.workspaceId !== workspaceId`.
3. `403` if `!canReadDocument(document.visibility, document.uploaderId, document.ownerId, userId)` (i.e. another member's `PRIVATE_DRAFT`).
4. `sourceVisibility` is recorded; the created fact stores
   `isIncludedInReturn = (body.isIncludedInReturn ?? true) && canIncludeInReturn(sourceVisibility)`.
   A body asking for `true` cannot override `PRIVATE_DRAFT`, `SHARED_FOR_DISCUSSION` or `ARCHIVED`.
5. Without `extractedFactId` the fact is manual (`sourceVisibility = null`) and inclusion is unchanged.

### 2.4 `updateFact`

Loads the confirmed fact with `sourceDocument { uploaderId, ownerId, visibility }`.

- `403` when the fact is private to another user: `PRIVATE_DRAFT` source document, or a manual fact with `isSharedWithHousehold = false`, and the caller is neither fact owner, uploader nor document owner.
- `400` when `body.isIncludedInReturn === true` and `!canIncludeInReturn(sourceVisibility)` (manual facts pass).
- Other edits are unchanged; `isIncludedInReturn` is only written when the request sets it.

### 2.5 Upload contract (`uploadDocument`)

Before hashing or writing the file:

```ts
if (input.ownerId && input.ownerId !== uploaderId) throw BadRequestException(...)
if (input.visibility && input.visibility !== PRIVATE_DRAFT) throw BadRequestException(...)
```

Creation then uses `ownerId: uploaderId`, `visibility: PRIVATE_DRAFT`, and extracted facts get `ownerId: uploaderId`. Rest of the flow (hash, dedupe, storage, extraction, audit) unchanged.

### 2.6 Document list

```ts
OR: [
  { uploaderId: currentUserId },
  { ownerId: currentUserId },
  { visibility: { in: [SHARED_FOR_DISCUSSION, PROPOSED_FOR_RETURN, INCLUDED_IN_RETURN] } },
]
```

### 2.7 Calculation

```ts
confirmedFacts: {
  where: {
    isIncludedInReturn: true,
    OR: [
      { sourceDocumentId: null },
      { sourceDocument: { is: { visibility: { in: [PROPOSED_FOR_RETURN, INCLUDED_IN_RETURN] } } } },
    ],
  },
}
```

## 3. Tests run (this machine)

| # | Command | Result |
|---|---|---|
| 1 | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test apps/api/test/fact-visibility.spec.ts` | exit 0 — 8 tests, 8 pass, 0 fail |
| 2 | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts` | exit 0 — 53 tests, 53 pass, 0 fail |
| 3 | `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` | exit 0, no output |
| 4 | `node .tools/syntax_check.cjs` | exit 0 — 19 files `ok`, 0 `FAIL` |

Additional check performed: `ts.transpileModule` on `apps/api/test/tax-lifecycle-full.e2e-spec.ts` → 0 diagnostics (syntax only; the spec is outside both tsconfigs).

### New assertions in `tax-lifecycle-full.e2e-spec.ts`

- Step 2: while the document is `PRIVATE_DRAFT`, spouse B's `GET /facts` returns `extractedFacts.length === 0` and `confirmedFacts.length === 0` (assertion a).
- Step 3: document promoted to `PROPOSED_FOR_RETURN` before confirming; confirmed gross fact returns `isIncludedInReturn === true`.
- Step 3b (new): B's upload is `PRIVATE_DRAFT` with `ownerId === B`; uploads with `ownerId: A` or `visibility: INCLUDED_IN_RETURN` return 400; B's document is moved to `SHARED_FOR_DISCUSSION`; confirming its `grossSalary` with `isIncludedInReturn: true` returns `false`; a calculation then returns `grossIncome === 75000` (B's 20000 excluded) — assertion (b).
- Step 4, 5, 6 and all pre-existing assertions are unchanged.

## 4. Limitations / not verified

1. **API e2e not executed.** `@nestjs/*`, the generated Prisma client and Postgres are absent (`Test-Path node_modules\@prisma\client` → False). The lifecycle spec was updated and syntax-checked, but never run. It must be executed in a DB-enabled environment.
2. **API service files are not typechecked here.** `tsconfig.test.json` does not include `facts/**` or `documents/**`; `syntax_check.cjs` only transpiles (no type checking). `tsc -p tsconfig.api.json` was not run per instructions and would still not cover facts/documents. Prisma nested-filter shapes (`document.OR`, `sourceDocument.is.OR`) are therefore verified by review against `schema.prisma`, not by the compiler.
3. **Promotion endpoint not audited.** `updateVisibility` was left unchanged: only the uploader/owner may promote a document, any visibility value is accepted, and the action is audited. Who *should* be allowed to promote to `PROPOSED_FOR_RETURN`/`INCLUDED_IN_RETURN` (e.g. both spouses, or a specific approval) is not enforced by this change.
4. **Two other e2e specs now fail at upload** because they send a non-private visibility (and owner ids): `apps/api/test/freelance-lifecycle.e2e-spec.ts:201,224,277,299` and `apps/api/test/receipt-scanning.e2e-spec.ts:98,134,224,257`. Under the new contract they receive 400. They were out of the assigned edit list; the fix is to upload with no `visibility`/`ownerId` and then `PATCH /documents/:id/visibility` (and for receipt-scanning, promote before confirming facts that must be included).
5. **Deletion edge case.** `ConfirmedFact.sourceDocument` is `onDelete: SetNull`. A fact confirmed from a private draft (which defaults `isSharedWithHousehold = true`) becomes a "manual" fact if its document is deleted, and would then satisfy the manual branch for the spouse. Closing this needs one of: forcing `isSharedWithHousehold = false` for private-draft facts at confirmation, or a tombstone instead of `SetNull`. Not implemented — it was outside the approved rules.
6. **No database constraint.** Visibility is enforced in the service layer; a direct Prisma write could still store `isIncludedInReturn = true` on a shared-document fact. The calculation query is the second line of defence and does filter it out.
7. **`ARCHIVED` inconsistency.** `canReadDocument` treats `ARCHIVED` as shared (as instructed), but `getDocumentsForWorkspace` still omits `ARCHIVED` from the spouse-visible list (pre-existing behaviour, unchanged). Facts from an archived document are readable while the document itself is not listed.
8. **`GET /facts` has no `@Roles`.** A `VIEWER` can read the facts visible under the rules above; no write route is reachable for `VIEWER`. Not changed.
9. **Plan-6.3 disclosure warning is not implemented.** The web confirm handler still sends `isIncludedInReturn: true` unconditionally; for a private/shared source the API now silently stores `false`. There is no user-facing explanation and no promotion guidance in the UI. The server rule is stricter than the plan's warning, but the downgrade is silent from the client's point of view.
10. **`confirmFact` behaviour change for unknown ids.** A supplied `extractedFactId` that does not exist now returns 404 instead of falling back to a manual fact; this was required to make the workspace check meaningful and to stop a caller from claiming a source that does not exist. No existing test used an unknown id.
11. **Web uploads still send `visibility` (and will now receive 400).** The web client was not in this task's file list but is a direct caller of the changed contract: `apps/web/src/components/DocumentsView.tsx:65,106` (SHARED_FOR_DISCUSSION), `apps/web/src/components/CameraScanModal.tsx:24,121` (default INCLUDED_IN_RETURN, user-selectable), `apps/web/src/components/FreelanceBusinessView.tsx:220` (INCLUDED_IN_RETURN). They must drop `visibility`/`ownerId` from the upload body and call `PATCH /documents/:id/visibility` after a successful upload when a non-private state was chosen. Until then those UI flows fail with 400 — not a privacy hole, but a user-visible regression.
12. **Other fact consumers still key on the flag alone.** `apps/api/src/modules/filing/filing.service.ts:42,178,223` (return snapshot and Form 100 box building) and `apps/api/src/modules/freelance/freelance.service.ts:153` (`getMetrics`) select `isIncludedInReturn: true` without a source-visibility predicate. With the new write gates a private/shared fact cannot be flipped to `true` through `confirmFact`/`updateFact`, but two paths bypass that gate: legacy rows, and `freelance.service.ts:441`, which creates confirmed facts with `isIncludedInReturn: true` from a freshly uploaded document that is now always `PRIVATE_DRAFT`. The calculation excludes such facts (2.7), so freelance revenue would silently disappear from the tax result while the freelance dashboard and the filing package still show it. Applying the same relation filter in filing/freelance, and deriving the flag in `freelance.service.ts` from the document visibility, is the recommended follow-up.

## 5. Handoff

Re-run in an environment with dependencies and Postgres:

```
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test apps/api/test/fact-visibility.spec.ts
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts
node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json
node .tools/syntax_check.cjs
```

Then, once `@nestjs/*` and the Prisma client are installed, also run the API e2e suite (or at least `tax-lifecycle-full.e2e-spec.ts`) and update `freelance-lifecycle.e2e-spec.ts` / `receipt-scanning.e2e-spec.ts` as described in limitation 4.
