# P0-3 integration fallout — uploads, filing and freelance

Date: 2026-11-08
Scope: the callers and fact consumers broken by the private-draft change in `audit/impl-privacy.md` (P0-3). No change to the visibility engine, admin RBAC or the privacy rules themselves.
Plan reference: `audit/implementation-plan-2026-11-08.md` P0-3; `audit/impl-privacy.md` §4.4, §4.11, §4.12.

## 1. Files changed

| File | Change |
|---|---|
| `apps/api/src/modules/documents/documents.service.ts` | Upload may set `ownerId` only to the uploader or an `ACTIVE` `HouseholdMembership` of the workspace household (lines 55-82); anything else is 400. `visibility` must still be absent or `PRIVATE_DRAFT`. The resolved owner is stored on the document **and** on the extracted facts, so an upload-on-behalf-of-spouse record is not split between two owners. |
| `apps/web/src/components/DocumentsView.tsx` | Upload body no longer sends `visibility`; `ownerId` is sent only when the selection is a household member. After a successful upload the document is promoted with `PATCH …/visibility` to `SHARED_FOR_DISCUSSION`; a failed patch is reported and the document stays private. Same flow for the sample salary slip. |
| `apps/web/src/components/CameraScanModal.tsx` | Upload sends no `visibility`/`ownerId` (always private), then patches the user's chosen state (skipped when the choice is `PRIVATE_DRAFT`). A failed patch is reported through `onError` and the modal closes with the scan kept private. |
| `apps/web/src/components/FreelanceBusinessView.tsx` | Upload sends no `visibility` (owner stays, server validates membership), then patches `INCLUDED_IN_RETURN`. On patch failure the error is shown and the document remains private. |
| `apps/api/src/modules/filing/filing.service.ts` | New `CONFIRMED_FACT_IN_RETURN_WHERE` constant (line 33) applied to the return snapshot (line 71) and to the fact set that builds Form 100 boxes and the certificate-import list (line 206). |
| `apps/api/src/modules/freelance/freelance.service.ts` | Same constant (line 25) applied to `getMetrics` (line 182). Demo-data confirmed facts now derive `isIncludedInReturn` from the document visibility via `canIncludeInReturn` (line 473) instead of hardcoding `true`. |
| `apps/api/test/receipt-scanning.e2e-spec.ts` | Four uploads dropped `visibility`; each promotes with `PATCH …/visibility` and asserts 200 plus `PRIVATE_DRAFT` at upload. Confirm test now asserts the confirmed fact is `isIncludedInReturn === true`. |
| `apps/api/test/freelance-lifecycle.e2e-spec.ts` | Four uploads dropped `visibility` (self `ownerId` kept, which the new rule allows); each promotes with `PATCH …/visibility` and asserts 200 plus `PRIVATE_DRAFT` at upload. Metrics, calculation and box assertions untouched. |
| `apps/api/test/tax-lifecycle-full.e2e-spec.ts` | Step 3b's "foreign owner" case used `userAId`, an active household member, which the new rule allows. It now uses a non-member UUID and still expects 400, plus a new positive case: B uploads with `ownerId: userAId` → 201, `ownerId = A`, `uploaderId = B`, `PRIVATE_DRAFT`. |
| `.tools/syntax_check.cjs` | Appended `DocumentsView.tsx`, `CameraScanModal.tsx`, `FreelanceBusinessView.tsx` (19 → 22 entries). No entry removed. |

## 2. Exact upload → patch flow

Server (`documents.service.ts:55-82`), before hashing or writing the file:

```
if input.ownerId && input.ownerId !== uploaderId:
    membership = householdMembership.findUnique(householdId_userId: { workspace.householdId, input.ownerId })
    if !membership || membership.status !== ACTIVE -> 400
if input.visibility && input.visibility !== PRIVATE_DRAFT -> 400
documentOwnerId = input.ownerId ?? uploaderId   // used for document.ownerId and extractedFact.ownerId
document.visibility = PRIVATE_DRAFT             // always
```

Clients:

| Flow | POST body | Promotion |
|---|---|---|
| `DocumentsView` file upload | `fileName`, `fileContentBase64`, `mimeType`, `ownerId?` | `PATCH /api/workspaces/:ws/documents/:id/visibility { SHARED_FOR_DISCUSSION }` |
| `DocumentsView` sample slip | same | same |
| `CameraScanModal` | `fileName`, `fileContentBase64`, `mimeType` | `PATCH … { chosenVisibility }`, skipped when `PRIVATE_DRAFT` |
| `FreelanceBusinessView` | `fileName`, `fileContentBase64`, `mimeType`, `documentType`, `ownerId` | `PATCH … { INCLUDED_IN_RETURN }` |

Every flow treats the patch as part of the operation: on `res.error` from the PATCH the user sees an error naming the document and the intended state, the document stays `PRIVATE_DRAFT`, and the list is refreshed. A missing `res.data.id` is also an error, not a silent success. The patch endpoint still requires uploader or owner (`documents.service.ts:updateVisibility`), which the uploader always satisfies.

## 3. Query predicate

Defined once per service, annotated `Prisma.ConfirmedFactWhereInput`:

```ts
{
  isIncludedInReturn: true,
  OR: [
    { sourceDocumentId: null },                       // manual fact
    { sourceDocument: { is: { visibility: { in: [
        DocumentVisibility.PROPOSED_FOR_RETURN,
        DocumentVisibility.INCLUDED_IN_RETURN,
      ] } } } },
  ],
}
```

Mirrors `canIncludeInReturn` in `apps/api/src/modules/facts/fact-visibility.ts` and the filter already used by `calculations.service.ts:83-96`, so calculation, filing package and freelance metrics now agree.

Applied at:

- `filing.service.ts:71` — `approveReturn` fact snapshot (`ReturnVersion.factsSnapshotJson`).
- `filing.service.ts:206` — `generateFilingPackage` fact set, which feeds both `form100Boxes` and `certificateImport`.
- `freelance.service.ts:182` — `getMetrics` fact set (per-owner and household).

Not changed: `calculations.service.ts` (already correct), `getProfiles` category lookup (used only to decide whether a member runs a freelance activity), and `getMetrics`' `documents: true` (document counts only, no amounts).

Freelance fact creation (`freelance.service.ts:473`): `isIncludedInReturn = canIncludeInReturn(doc.visibility)`. The demo loader creates its own `INCLUDED_IN_RETURN` documents, so demo metrics keep counting; a fact from a private document could never be seeded as included. The normal promotion path (`PATCH /documents/:id/visibility`) is unaffected.

## 4. Tests and results

| # | Command | Observed |
|---|---|---|
| 1 | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test apps/api/test/fact-visibility.spec.ts packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts` | exit 0 — `tests 61`, `pass 61`, `fail 0` (same count as the pre-change baseline) |
| 2 | `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` | exit 0, no output |
| 3 | `node .tools/syntax_check.cjs` | exit 0 — 22 files `ok`, 0 `FAIL` (all three new web entries included) |
| 4 | `ts.transpileModule` on `freelance-lifecycle.e2e-spec.ts`, `receipt-scanning.e2e-spec.ts`, `tax-lifecycle-full.e2e-spec.ts` | 0 diagnostics each |

Baseline before any edit: the same three commands were run and were already green (61 tests, tsc 0, 19 syntax files). Level reached: unit + typecheck + transpile. No HTTP path was executed.

## 5. Remaining limits

1. **API e2e not executed.** `node_modules/@nestjs/common` and the generated `@prisma/client` are absent, so no Nest app boots and no Postgres is available. All three e2e specs are updated but unrun; they must be executed in a DB-enabled environment.
2. **The four changed API services are not typechecked here.** `tsconfig.test.json` does not include `facts/**`, `documents/**`, `filing/**` or `freelance/**`, and `tsc -p tsconfig.api.json` was explicitly excluded from this task. `syntax_check.cjs` transpiles only. The Prisma nested-filter shape (`sourceDocument.is.visibility.in`) was verified by reading `prisma/schema.prisma` (`ConfirmedFact.sourceDocument` is a nullable to-one relation) and matches the shape already present in `calculations.service.ts`; it is still a review-level statement.
3. **`Prisma.ConfirmedFactWhereInput` annotation is unverified by a compiler.** With no generated client, only transpilation ran. A real `tsc -p tsconfig.api.json` with a generated client should confirm it.
4. **Pre-existing failure, outside this change:** `freelance-lifecycle.e2e-spec.ts:450-468` asserts `form100Boxes` entries `'21'`, `'22'`, `'23'`, `'24'`. `HEAD`'s filing service produced those; the worktree's Form 100F sheet map emits sheet labels (`'C/A-I'` for freelance income/expense), so those four `toBeDefined()` assertions will fail for a reason unrelated to visibility. They were left untouched rather than redefined here; the task that owns the sheet map should update them.
5. **`getMetrics` still lists all workspace documents** (`documents: true`) for its counts, without a visibility filter. That exposes document existence/count, not amounts, and was left as-is because the task scoped the metric query to the fact predicate.
6. **Web confirm buttons still send `isIncludedInReturn: true`** for a private or discussion document; the API silently stores `false` (known P0-3 limitation 9 in `audit/impl-privacy.md`). The client still reports success, so the UI can claim inclusion while the fact is excluded. Not changed by this task.
7. **One added e2e case has no local run**: the "upload on behalf of an active spouse" positive path exists only in `tax-lifecycle-full.e2e-spec.ts` step 3b and could not be executed here.
8. **`updateVisibility` still lets the uploader promote a document owned by the spouse.** Unchanged by design; the privacy task already lists "who may promote" as an open policy question.

## 6. Handoff

```
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test apps/api/test/fact-visibility.spec.ts packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts
node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json
node .tools/syntax_check.cjs
```

With dependencies and Postgres installed, add:

```
tsc -p tsconfig.api.json
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test apps/api/test/receipt-scanning.e2e-spec.ts apps/api/test/freelance-lifecycle.e2e-spec.ts apps/api/test/tax-lifecycle-full.e2e-spec.ts
```

Expect `freelance-lifecycle` step 5 to fail on the stale box numbers described in limit 4 until the sheet-map owner updates those assertions.
