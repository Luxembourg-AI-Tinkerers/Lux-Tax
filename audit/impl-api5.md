# API-5 — Shared approval invalidation + return-version history

Scope: one invalidation path for every material mutation and a read endpoint that
explains why an approval stopped counting. No Prisma schema change, no migration,
no web change.

## 1. Invalidation matrix

`ReturnApprovalsService.invalidateForChange(workspaceId, actorId, reason, ipAddress?)`
is the only place that supersedes approvals. With **no active approval** it does
nothing at all: no `isSuperseded` write, no `NEEDS_REVIEW`, no version bump, no
audit row (`{ invalidated: 0 }`). That is the pre-existing fact-path semantics,
now shared.

With at least one active approval (`isSuperseded: false` on any version of the
workspace) it runs, in this order:

1. `updateMany` → `isSuperseded: true`, `supersededAt: now()`,
   `supersedingReason: reason`;
2. workspace → `status: NEEDS_REVIEW`, `activeReturnVersion: { increment: 1 }`;
3. audit `APPROVAL_INVALIDATED`, `entityType: 'ReturnApproval'`,
   `entityId: <workspaceId>`, description
   `Approvals invalidated due to material change: <reason>`, plus
   `newValue: { reason, invalidatedApprovals, supersededVersion }`.

| # | Trigger | Call site | Reason string | Effect |
|---|---------|-----------|---------------|--------|
| 1 | Confirm a fact (`confirmFact`) | `facts.service.ts:289` | `New fact confirmed: <key> = <amount> EUR`, or `Confirmed a private fact (details hidden)` when the source is a private draft / unshared manual fact | supersede all approvals, `NEEDS_REVIEW`, version +1, audit |
| 2 | Update a fact (`updateFact`) | `facts.service.ts:420` | `Fact updated: <key> changed from <old> to <new> EUR`, or the redacted form | same |
| 3 | Delete a fact (`deleteFact`) | `facts.service.ts:506` | `Fact deleted: <key> (<amount> EUR)`, or the redacted form | same |
| 4 | Save the questionnaire (`saveProfile`) | `questionnaire.service.ts:93` | `Questionnaire answers updated` | same |
| 5 | Change document visibility (`updateVisibility`) | `documents.service.ts:313` | `Document visibility changed` | same |
| 6 | Delete a document (`deleteDocument`) | `documents.service.ts:384` | `Document deleted` | same |
| 7 | Persisted recalculation (`calculateTax`, `shouldPersist(options)`) | `calculations.service.ts:359` | `Tax calculation recalculated` | same; the new result is stored before the invalidation |

Deliberate properties:

- **Redaction preserved** (rows 1–3): the reason is the same string the fact path
  already used, so a private fact never leaks its key or amount into the
  household-readable audit feed.
- **No file names** (rows 5–6): the reason is generic even though the audit row
  that precedes it names the document. Reason is what the spouse sees on the
  superseded approval.
- **Calculation, not comparison** (row 7): `compareScenarios` runs with
  `persist: false` and never reaches the block, so a what-if comparison cannot
  invalidate an approval.
- **Failure is not swallowed**: if invalidation throws, the request fails. The
  triggering write has already committed, so the honest state is "change saved,
  approvals not yet invalidated" — a retry re-runs the invalidation. Silently
  keeping an active approval across a material change was judged worse.
- **No cycle**: `ReturnApprovalsModule` imports only `PrismaModule` +
  `AuditModule`; Facts, Questionnaire, Documents, Calculations and Filing import
  it.

## 2. History endpoint and DTO

`GET /api/workspaces/:workspaceId/return-versions` (same guards as the existing
`GET /return-version`, which is unchanged) → `ReturnVersionHistoryDto`.

```jsonc
{
  "workspaceId": "…",
  "activeReturnVersion": 4,
  "versions": [                       // newest first, active always present
    {
      "versionNumber": 4,             // synthetic: no row exists until approval
      "isCurrent": true,
      "isFrozen": false,
      "status": "DRAFT",
      "packageGenerated": false,
      "approvals": []
      // id, createdAt, finalTaxLiability omitted
    },
    {
      "id": "…",
      "versionNumber": 3,
      "isCurrent": false,
      "isFrozen": false,
      "status": "SUPERSEDED",
      "createdAt": "2026-04-02T09:11:03.000Z",
      "finalTaxLiability": 12480.5,
      "packageGenerated": true,
      "approvals": [
        {
          "id": "…", "returnVersionId": "…", "userId": "…",
          "userEmail": "a@example.lu",
          "approvedAt": "2026-04-02T09:12:00.000Z",
          "isSuperseded": true,
          "supersededAt": "2026-04-03T18:40:11.000Z",
          "supersedingReason": "Questionnaire answers updated"
        }
      ]
    }
  ]
}
```

Status rule (`historyStatus`, pure):

| Condition | Status |
|-----------|--------|
| `versionNumber < activeReturnVersion` | `SUPERSEDED` (even if it was fully approved) |
| `versionNumber === activeReturnVersion` and `activeApprovalCount >= requiredApproverCount > 0` | `APPROVED` |
| otherwise | `DRAFT` |

- `requiredApproverCount` = number of ACTIVE household members when the workspace
  is `CLASS_2`, else `1` — the same rule `approveReturn` applies, so the history
  agrees with the state machine instead of inventing a second one.
- `activeApprovalCount` excludes superseded rows, so a "revived" approval that is
  still superseded cannot make a changed return look approved.
- `finalTaxLiability` is read from `ReturnVersion.calculationSnapshotJson` and only
  accepted when it is a finite number (`NaN`, `"12480.50"`, `{}` → omitted).
- `packageGenerated` = a `FilingPackage` row exists for that version.
- Synthetic row: `mergeHistory` prepends `{ versionNumber: active, isCurrent: true,
  isFrozen: false, status: 'DRAFT', packageGenerated: false, approvals: [] }` when
  no `ReturnVersion` row has the active number (the invalidation bumps the counter
  before any row exists). No `id`, no `createdAt`, no `finalTaxLiability`; no row
  is written.

## 3. Changed files

New:

- `apps/api/src/modules/filing/return-approvals.service.ts` — `invalidateForChange`, `getHistory`.
- `apps/api/src/modules/filing/return-approvals.module.ts` — Prisma + Audit, exports the service.
- `apps/api/src/modules/filing/return-version-history.ts` — `historyStatus`, `mergeHistory`.
- `apps/api/test/return-version-history.spec.ts` — 10 unit tests.

Modified:

- `packages/contracts/src/filing.ts` — `ReturnVersionHistoryStatus`, `ReturnVersionHistoryItemDto`, `ReturnVersionHistoryDto` (already re-exported by `index.ts`).
- `apps/api/src/modules/facts/facts.service.ts` — injects the shared service at the three sites; private `invalidateApprovalsIfAny` deleted; unused `WorkspaceStatus` import removed.
- `apps/api/src/modules/facts/facts.module.ts`, `questionnaire/questionnaire.module.ts`, `documents/documents.module.ts`, `calculations/calculations.module.ts`, `filing/filing.module.ts` — import `ReturnApprovalsModule`.
- `apps/api/src/modules/questionnaire/questionnaire.service.ts` / `.controller.ts` — `saveProfile(workspaceId, userId, input, ipAddress?)`; controller passes `@CurrentUser('id')` and `@Req()`.
- `apps/api/src/modules/documents/documents.service.ts` — injects the service; invalidation after the visibility audit and after the delete audit.
- `apps/api/src/modules/calculations/calculations.service.ts` — injects the service; invalidation inside the `shouldPersist` branch, after the `TAX_CALCULATED` audit.
- `apps/api/src/modules/filing/filing.controller.ts` — injects the service; adds `GET return-versions`; keeps `GET return-version`.
- `tsconfig.test.json`, `.tools/syntax_check.cjs` — new module, test and helper registered.

## 4. Tests run

| Check | Command | Result |
|-------|---------|--------|
| Node test suites incl. the new one | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts apps/api/test/class-resolution.spec.ts apps/api/test/form100-case-map.spec.ts apps/api/test/notification-rules.spec.ts apps/api/test/return-version-history.spec.ts` | 179 tests / 30 suites, 179 pass, 0 fail |
| Typecheck of the pure layer | `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` | exit 0, no diagnostics |
| Per-file syntax (TS transpile + diagnostics) | `node .tools/syntax_check.cjs` | 42 files `ok`, exit 0 |

`apps/api/test/return-version-history.spec.ts` covers: current draft, current
fully approved, single filer (1/1), partially approved current version, old
fully-approved version → `SUPERSEDED`, `requiredApproverCount = 0` never
`APPROVED`, synthetic row contents, desc ordering, no duplicate for an existing
active row, input array not mutated.

## 5. Not verified / limits

1. **No runtime verification.** `node_modules` contains no dependencies
   (`@nestjs/*`, `@prisma/client` absent, Prisma client not generated), so the
   Nest DI graph, the Prisma queries and the endpoint were never executed.
   `tsc -p tsconfig.api.json` fails wholesale on missing modules — a pre-existing
   environment gap, not a signal about this change. API e2e and migrations were
   not run, per the brief.
2. **No diff endpoint.** PROD-3's `…/return-versions/:versionId/diff` is not
   implemented; this task delivers history + reasons only.
3. **Old route still filters.** `getLatestReturnVersion` keeps stripping
   superseded approvals; only the new endpoint exposes them. The web app does not
   consume it yet (out of scope).
4. **Gaps are not back-filled.** Only the active version gets a synthetic row. Two
   invalidations without a re-approval (versions 4 and 5 both absent) surface only
   version 5; 4 is not invented.
5. **Approver count mirrors `approveReturn`**, which counts every ACTIVE member
   for `CLASS_2` — a `VIEWER` in a Class 2 household therefore raises the bar for
   `APPROVED`. Consistent with the state machine, arguably wrong on its own; not
   changed here.
6. **Not atomic.** Invalidation follows the triggering write outside a
   transaction (same as the pre-existing fact path): a crash in between leaves the
   change saved and the approval active.
7. **Over-invalidation by design.** Any visibility change (including
   `PRIVATE_DRAFT → SHARED_FOR_DISCUSSION`) invalidates; the brief chose
   simplicity over a return-relevance filter.
8. **Not addressed from API-5's proposal:** the recalculation-freshness guard
   (`409 RECALCULATION_REQUIRED`, proposal item 2), reviving a superseded approval
   in place in `approveReturn` (item 3), and bumping the version even when no
   approval existed (item 4). Note that item 3 means the history can show an
   approval whose `supersedingReason` was cleared by a later re-approval of the
   same version — the supersession is then invisible in the row.

## 6. Review fixes (F1/F2)

Source: `audit/review-api5.md` §2. Only these two blockers were touched; the
demo data content, the invalidation matrix, the history endpoint and the DTOs are
unchanged.

### F1 — the freelance demo now goes through the shared invalidation

- `apps/api/src/modules/freelance/freelance.module.ts` — imports
  `ReturnApprovalsModule`. No cycle: that module still imports only
  `PrismaModule` + `AuditModule` and exports the service, and no feature module
  imports `FreelanceModule`.
- `apps/api/src/modules/freelance/freelance.service.ts` — injects
  `ReturnApprovalsService` as the third constructor argument (same shape as
  `FactsService`) and, after the demo loop, calls
  `invalidateForChange(workspaceId, actorId, 'Freelance demo facts loaded')`
  **only when `count > 0`**. `count` is incremented only for a newly written
  document + fact pair, so re-clicking the button on an already seeded workspace
  writes nothing and leaves approvals alone. The call happens after the last
  `confirmedFact.create` and after the demo-load audit row, so it is the final
  write of the request; the reason carries no amount, file name or business name.
  The signature already took `actorId` (controller passes `@CurrentUser('id')`),
  so no controller change was needed, and `{ success, count }` is unchanged.
- Other `confirmedFact` writes: a repo grep for
  `confirmedFact.(create|update|delete|upsert|…)` finds exactly the three in
  `facts.service.ts` (already shared), the one in `freelance.service.ts` fixed
  here, and `deleteMany` cleanups in the e2e specs. Nothing else to route.

### F2 — `FilingPackageView` treats `null` as state, not as "keep old"

- `apps/web/src/components/FilingPackageView.tsx`
  - `loadFilingData`: `if (!verRes.error) setReturnVersion(verRes.data ?? null)`
    and the same for `filingPackage` / `history`. A 200 `null` (the normal state
    after an invalidation, `filing.service.ts:1127-1132, 1169-1174`) now clears
    the previous rows; a failed request keeps them and the history card keeps its
    existing "not available right now" copy.
  - the `workspace.id` effect resets `returnVersion`, `filingPackage`, `history`
    and `historyLoaded` before loading, so a tax-year switch never renders the
    previous year while the requests are in flight.
  - the member card now resolves `approvalRecord` to a non-superseded approval
    only, and the unreachable `approvalRecord?.isSuperseded` block is removed.
    The legitimate "Approved on: …" line stays; superseded approvals and their
    reasons remain in the history card, which is the single source for them.
  - empty-history copy: "needs approval from all required approvers" instead of
    "needs every spouse to approve".
- `apps/web/src/app/(workspace)/[householdId]/dashboard/page.tsx` —
  `key={workspace.id}` on `<FilingPackageView>` so a tax-year switch remounts the
  component instead of reusing its state.

### Verification

| Check | Command | Result |
|-------|---------|--------|
| Eight suites (regression gate) | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts apps/api/test/class-resolution.spec.ts apps/api/test/form100-case-map.spec.ts apps/api/test/notification-rules.spec.ts apps/api/test/return-version-history.spec.ts` | 179 tests / 30 suites, 179 pass, 0 fail |
| Pure-layer typecheck | `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` | exit 0 |
| Per-file syntax | `node .tools/syntax_check.cjs` | 43 files `ok`, exit 0 (adds `freelance.module.ts`) |
| F1 behaviour, real service code + in-memory Prisma fake | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tmp/tsconfig.probe-f1.json tmp/probe-f1-freelance-demo.ts` | 13/13 assertions ok: two members → `count 8`, 8 facts all `isIncludedInReturn`, one `invalidateForChange` with `(workspaceId, actorId, 'Freelance demo facts loaded')`, no amount/file/business name in the arguments, call after the last fact write and last in the request; second run on the seeded workspace → `count 0` and no invalidation |
| F2 types (`strict`, component in the program) | `node .tools/node_modules/typescript/bin/tsc -p tmp/tsconfig.probe-f2.json` | exit 0; `--listFiles` confirms `apps/web/src/components/FilingPackageView.tsx` was checked |

The F1 probe is the first execution of the demo path in this environment. The
F2 probe only typechecks; the state transitions themselves were read, not run.

### Not verified

1. **No Nest DI / Prisma / DB.** The probe injects fakes; the real module graph,
   `document.create`, `confirmedFact.create` and `returnApprovals` against
   Postgres were not executed. That the demo run invalidates a real approval row
   is therefore inferred from `invalidateForChange`'s own code (unchanged,
   previously reviewed), not observed.
2. **No browser render.** `FilingPackageView.tsx` is typechecked against a
   stub `react` and transpiled, but never mounted: the two review scenarios
   (2025→2026 switch, re-approval after invalidation) were traced through the new
   code paths, not reproduced on screen.
3. **`dashboard/page.tsx` only transpiled** (syntax check); it is not in either
   probe program because it pulls `next/*` and further components.
4. **No new test in the eight-suite gate.** The API services need `@nestjs/*` and
   the component needs `react`/`next`, none of which resolve under
   `tsconfig.test.json`; the probes live in `tmp/` and are not part of the gate.
   W1 (mocked-Prisma `invalidateForChange` / `getHistory` tests) therefore remains
   open.
