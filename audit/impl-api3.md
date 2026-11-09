# API-3 — deny-by-default `HouseholdGuard`

Date: 2026-11-08
Scope: `apps/api/src/common/guards/household.guard.ts`, one e2e spec, `.tools/syntax_check.cjs`.
Plan reference: `audit/audit-api.md` API-3 (remaining defect only — the cross-workspace `confirmFact` write was fixed by the privacy pass, `audit/impl-privacy.md`); §14.5 "knowing a UUID must never be sufficient"; §17.1 object-level access.

## 1. Files changed

| File | Change |
|---|---|
| `apps/api/src/common/guards/household.guard.ts` | `canActivate`: the `if (!householdId) { return true; }` fall-through is replaced by `throw new ForbiddenException('Household context could not be resolved for this request')`. The workspace-id lookup is unchanged, so an unknown workspace leaves `householdId` undefined and the new throw fires. |
| `apps/api/test/cross-household-isolation.e2e-spec.ts` | Adds `import { randomUUID } from 'node:crypto'` and two cases: `POST /api/workspaces/<random v4 UUID>/calculate` → 403, `GET /api/workspaces/<random v4 UUID>/calculation` → 403. Existing four assertions untouched. |
| `.tools/syntax_check.cjs` | Adds `apps/api/src/common/guards/household.guard.ts` (it was not listed). |
| `audit/impl-api3.md` | This report. |

No production call site changed. `ForbiddenException` was already imported in the guard.

## 2. Guard behaviour

```ts
let householdId =
  request.params.id || request.params.householdId || request.body?.householdId;

if (!householdId && (request.params.workspaceId || request.body?.workspaceId)) {
  const wsId = request.params.workspaceId || request.body?.workspaceId;
  const ws = await this.prisma.taxYearWorkspace.findUnique({
    where: { id: wsId },
    select: { householdId: true },
  });
  if (ws) {
    householdId = ws.householdId;
  }
}

if (!householdId) {
  // Deny by default: an unresolved household context must never bypass the check.
  throw new ForbiddenException('Household context could not be resolved for this request');
}
```

Consequences:

- Existing workspace + active membership → unchanged (membership/role checks run as before).
- Existing workspace + non-member → 403 from the membership check, as before.
- Unknown or non-existent workspace UUID → lookup returns `null` → `householdId` stays `undefined` → 403 (previously 200/404 downstream).
- Route with no household/workspace id at all under this guard → 403 instead of silent allow.

`NotFoundException` remains imported but unused in this file. That was already true before the change (it has no other reference in the file); left untouched to keep the diff minimal.

## 3. Route audit — `rg -l HouseholdGuard apps/api/src/modules`

`rg` returns ten files; nine are controllers and `apps/api/src/modules/facts/fact-visibility.ts` only mentions the guard in a doc comment (no decorator).

| Controller | Controller-level route | Household id source | Guard scope |
|---|---|---|---|
| `calculations.controller.ts` | `api/workspaces/:workspaceId` | `params.workspaceId` | class-level |
| `filing.controller.ts` | `api/workspaces/:workspaceId` | `params.workspaceId` | class-level |
| `questionnaire.controller.ts` | `api/workspaces/:workspaceId` | `params.workspaceId` | class-level |
| `documents.controller.ts` | `api/workspaces/:workspaceId/documents` | `params.workspaceId` | class-level |
| `facts.controller.ts` | `api/workspaces/:workspaceId/facts` | `params.workspaceId` | class-level |
| `freelance.controller.ts` | `api/workspaces/:workspaceId/freelance` | `params.workspaceId` | class-level |
| `workspaces.controller.ts` | `api/households/:id/workspaces` | `params.id` | class-level |
| `audit.controller.ts` | `api/households/:id/activity` | `params.id` | class-level |
| `households.controller.ts` | `api/households` | `params.id` on the two guarded routes | per-method: `GET :id`, `POST :id/invitations` only |

`households.controller.ts` also defines `POST /`, `GET /`, `GET invitations/:token/details` and `POST invitations/accept`; those carry `JwtAuthGuard` only (or nothing, for invitation details), so they never enter `HouseholdGuard` and are unaffected. Every route that *does* apply the guard carries `:id`, `:workspaceId`, or a body `householdId`/`workspaceId`.

**No legitimate exception exists, so no `@NoHousehold()` decorator was added.** The guard is deny-by-default with no escape hatch, as instructed.

## 4. Tests added

In `apps/api/test/cross-household-isolation.e2e-spec.ts` (attacker = registered user with no membership in the target household):

```ts
it('Attacker cannot calculate in a non-existent workspace', async () => {
  const res = await app.inject({
    method: 'POST',
    url: `/api/workspaces/${randomUUID()}/calculate`,
    headers: { authorization: `Bearer ${attackerToken}` },
  });
  expect(res.statusCode).toBe(403);
});

it('Attacker cannot read a calculation from a non-existent workspace', async () => {
  const res = await app.inject({
    method: 'GET',
    url: `/api/workspaces/${randomUUID()}/calculation`,
    headers: { authorization: `Bearer ${attackerToken}` },
  });
  expect(res.statusCode).toBe(403);
});
```

`randomUUID()` yields a well-formed v4 UUID, so `ParseUUIDPipe` passes and the request reaches the guard; the expected 403 therefore proves the guard denies, not that the pipe rejected the id. The GET case is valid because `CalculationsController` exposes `@Get('calculation')` under the same `:workspaceId` prefix and the guard sits at class level.

## 5. Verification

Run from `B:\B\tax-app`:

| Check | Result |
|---|---|
| `node .tools/syntax_check.cjs` | exit 0; 29 files `ok`, including `apps/api/src/common/guards/household.guard.ts` |
| `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts apps/api/test/class-resolution.spec.ts` | `tests 103`, `pass 103`, `fail 0`, exit 0 |
| `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` | exit 0, no diagnostics |
| `ts.transpileModule` on the updated e2e spec (ES2022/CommonJS, `reportDiagnostics: true`) | `transpile ok`, no diagnostics |

Also checked by reading: all existing `/api/workspaces/...` calls in `apps/api/test/*.e2e-spec.ts` use workspaces created by that spec's own household, so their `householdId` resolves and membership passes — the new throw cannot turn those into 403s.

## 6. Limits

- **The e2e suite was not executed.** There is no `node_modules` at the repo root and no `@nestjs/*` or `@prisma/client` installed, so `AppModule` cannot boot here; the two new cases are verified by transpile and by reading the guard, not by a live request. Expected result when run with a database: both cases 403, the other four cases still 403.
- **`tsc -p tsconfig.test.json` does not cover the two changed files.** Its `include` list is tax-engine, contracts, `annex-pdf`, `fact-visibility`, `class-resolution`, `platform-admin` and their specs; neither `household.guard.ts` nor `cross-household-isolation.e2e-spec.ts` is in it. Adding them is not possible without the Nest/Prisma types, so type checking of the guard stops at the syntax transpile above. Suggested follow-up for the parent: run the API e2e suite in an environment with dependencies installed.
- No unit test targets `HouseholdGuard` directly; the fix is currently covered only by the new (not yet run) e2e cases.
- Behaviour change to note for reviewers: any *future* guarded route that omits a household/workspace id will now return 403 rather than passing through. That is the intended deny-by-default contract.

## 4. Body-id bypass fix

Follow-up to `audit/review-api3.md` §2 M1. Date: 2026-11-08.

### 4.1 Change

`apps/api/src/common/guards/household.guard.ts`:

- `canActivate` no longer reads `request.body` at all — neither `body.householdId` nor `body.workspaceId`. Resolution order is `request.params.id || request.params.householdId`, else `request.params.workspaceId` with the household taken from that workspace row. No body fallback was added.
- New exported, dependency-free helper `isUuid(value)` (`/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i`, case-insensitive, no version-nibble restriction so any Postgres-valid UUID passes). It guards the `workspaceId` lookup: a malformed value throws `ForbiddenException('Invalid workspace id')` before Prisma is called, so a non-UUID path segment can no longer surface as an unmapped 500 (review W1 — workspace path only).
- `params.workspaceId` is tested with `!== undefined`, so a present-but-empty segment is rejected as invalid instead of being silently skipped.
- Unchanged: the unresolved-household 403 (`Household context could not be resolved for this request`), the membership/`ACTIVE` check, the optional `@Roles()` check, and `request.householdMembership` assignment.

Effect on the reported attack: `POST /api/workspaces/<victim workspace>/calculate` carrying `{"householdId":"<attacker household>"}` now resolves the victim household from the workspace row and checks the attacker's membership against it, so it returns 403 instead of 200.

### 4.2 Route audit (item 2)

All nine guarded controllers re-read: every guarded route carries `:id` or `:workspaceId`, so the removed body fallback cannot break a legitimate caller.

| Controller | Household id source |
|---|---|
| `calculations`, `filing`, `questionnaire` | `params.workspaceId` |
| `documents`, `facts`, `freelance` | `params.workspaceId` (additional `:documentId`/`:factId`/`:ownerId` segments are not household ids) |
| `workspaces`, `audit` | `params.id` |
| `households` | `params.id`, on `GET :id` and `POST :id/invitations` only |

Cross-checks: `rg 'body\??\.householdId|body\.workspaceId' apps/api/src/modules` → 0 hits; `rg householdId packages/validation/src` → 0 hits. No guarded handler or schema reads a body household id, so there is nothing to report under item 2.

### 4.3 Tests (item 3)

`apps/api/test/cross-household-isolation.e2e-spec.ts`, setup now captures the ids the spoofing cases need:

- `GET /api/households/<victimHouseholdId>/workspaces/2025` with the victim token, asserts 200, stores `victimWorkspaceId` and asserts it is a string (so a failed setup cannot silently produce a `.../undefined/...` URL that would 403 for the wrong reason).
- `POST /api/households` with the attacker token, asserts 201, stores `attackerHouseholdId`.

New cases (attacker = user with no membership in the victim household):

- `POST /api/workspaces/<victimWorkspaceId>/calculate` with body `{ householdId: attackerHouseholdId }` → 403.
- `GET /api/workspaces/<victimWorkspaceId>/calculation` → 403.

The four original cases and the two random-UUID cases are untouched; the file now has 8 `it` blocks. `afterAll` cleanup already deletes households by `createdById`, so it covers the attacker's new household too.

### 4.4 Verification

Run from `B:\B\tax-app`:

| Check | Result |
|---|---|
| `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts apps/api/test/class-resolution.spec.ts` | `tests 140`, `suites 24`, `pass 140`, `fail 0`, exit 0 |
| `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` | exit 0, no diagnostics |
| `node .tools/syntax_check.cjs` | exit 0, 31 files `ok`, including `apps/api/src/common/guards/household.guard.ts` |
| `node tmp/guard-harness/check-guard.cjs` | exit 0, 19 assertions pass |
| `ts.transpileModule` on the updated e2e spec (ES2022/CommonJS, `reportDiagnostics: true`) | 0 diagnostics |

`tmp/guard-harness/check-guard.cjs` is a temporary harness, not product code: it transpiles the real guard source and loads it with stubbed `@nestjs/common`, `@nestjs/core`, `@luxtax/contracts` and a recording Prisma double. Observed results:

- `POST`/`GET` on the victim workspace with `body.householdId = attacker household` → `ForbiddenException 'Access to household workspace is denied'`, Prisma calls `workspace.findUnique(victim workspace)` then `householdMembership.findUnique(victim household, attacker)` — i.e. the body id is not consulted.
- `body.workspaceId = attacker workspace` on the victim path → same 403, lookup still targets the victim workspace.
- `:id` route with `body.householdId = attacker household` → 403; attacker's own `:workspaceId` route and the owner's `:id` route → `true`.
- Malformed `workspaceId` (`not-a-uuid`) → 403 `Invalid workspace id` with zero Prisma calls; unknown UUID → 403 `Household context could not be resolved…`; no route id → same 403 with zero Prisma calls; no user → 403 `User is not authenticated`.
- Negative control: with the pre-fix resolution block temporarily restored, the same harness reported 5 failures, including `resolved without throwing (bypass)` for both M1 cases. The harness therefore detects the bug it is asserting against. The fix was restored and the harness re-run green (file back to 3369 bytes).

### 4.5 Not verified

- **The e2e suite was not executed.** There is no `@nestjs/*` or `@prisma/client` in the tree, so `AppModule` cannot boot; the two new cases are verified by transpile, by reading, and by the guard harness above, not by a live HTTP request. Expected on a machine with a database: both new cases 403, the six existing cases unchanged at 403.
- **No type checking of the two changed files.** `tsconfig.test.json` `include` lists neither `household.guard.ts` nor the e2e spec, and `@nestjs`/`@prisma` types are absent, so `tsc` passing says nothing about them; coverage stops at the syntax transpile and the harness load.
- **Malformed `:id` on household routes still reaches Prisma** (`params.id` is not UUID-checked), so a non-UUID household id can still produce a 22P02/P2023 500. Pre-existing at HEAD and outside this fix's stated scope; the same `isUuid` helper would close it.
