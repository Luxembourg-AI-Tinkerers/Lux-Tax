# Review - API-3: deny-by-default `HouseholdGuard`

Date: 2026-11-08
Reviewer: independent, read-only. Author report: `audit/impl-api3.md`.
Subject: `apps/api/src/common/guards/household.guard.ts`, the two new cases in `apps/api/test/cross-household-isolation.e2e-spec.ts`.
Standard: `audit/audit-api.md:153-181` (API-3 acceptance), plan sections 14.5 and 17.1, and the five checks in the review request.

## 1. Conclusion

The fail-closed edit itself is correct and minimal: the guard no longer returns `true` without a resolved membership, every guarded route carries a household id, `confirmFact` checks before it writes, and the three commands pass (140/140 tests, tsc exit 0, syntax 31/31). One blocker remains in the same function: `body.householdId` is preferred over `params.workspaceId`, so the caller chooses which household the membership check runs against. Not ready to accept as a complete fix for API-3.

## 2. Must fix (1)

### M1 - `body.householdId` outranks the route's `workspaceId`; the caller picks the household it is checked against

- Location: `apps/api/src/common/guards/household.guard.ts:27-30` (resolution), `:41-43` (new throw), `:72` (`return true`).
- Problem: `let householdId = request.params.id || request.params.householdId || request.body?.householdId;` and the workspace lookup runs only `if (!householdId && ...)`. On a route whose only key is `:workspaceId`, a JSON body `{"householdId": "<household the caller belongs to>"}` makes `householdId` truthy, the workspace row is never read, membership is checked against the caller's own household, and the guard returns `true`.
- Impact: cross-tenant read and write with nothing but the victim's workspace UUID - the exact property that plan section 14.5 forbids and the one API-3 exists to establish. Confirmed reachable on `POST /api/workspaces/:workspaceId/calculate`: `calculations.service.ts:106` loads the workspace by id, `:116` uses `actorId` only to select filer members, `:317` overwrites the workspace row (taxClass, estimatedTaxBalance, calculationResult, status) and `:332` writes a `TAX_CALCULATED` audit event into the victim household. Nothing else checks membership: `assertWorkspaceAccess` and equivalents have zero hits across `apps/api/src`. The same shape applies to `POST .../facts/confirm` (`facts.service.ts:185-193` checks existence only) and to the other guarded write routes that pass `(workspaceId, userId)` and assume the guard already authorised the pair.
- Evidence: the guard lines above; `calculations.service.ts:98-116, 317, 420` (`getLatestCalculation` likewise fetches by id with no actor); `facts.service.ts:185, 209, 229`; the two new e2e cases send no body, so they cannot detect this.
- Fix direction: when `params.workspaceId` is present, derive the household from the workspace row and ignore body-supplied ids. The `body.householdId` branch can be deleted outright: every guarded route carries `:id` or `:workspaceId`, and no schema in `packages/validation` defines a body `householdId` (zero occurrences), so nothing legitimate depends on it. Cover it with a case that posts `{householdId: <attacker household>}` to a victim workspace UUID.

## 3. Worth considering (3)

### W1 - a malformed route id yields 500, not 403

- Location: `household.guard.ts:30-38`.
- Guards run before pipes, so the lookup sees the raw param; `TaxYearWorkspace.id` is `String @db.Uuid` (`schema.prisma:265`), and a non-UUID string is rejected by Postgres (22P02, surfaced by Prisma as P2023) as an unmapped 500. Pre-existing - the identical query exists at HEAD, so not a regression - but "deny by default" currently holds only for well-formed UUIDs. Evidence tier: read from the schema and Nest's request lifecycle, not run (no `@nestjs`/`@prisma` in the tree). Validate the param shape, or catch P2023, before the query.

### W2 - the new cases prove the null-lookup path only

- Location: `cross-household-isolation.e2e-spec.ts:144-163`.
- Both use a random UUID that matches no row, so they exercise "lookup returned null". No case sends a *real* victim workspace UUID, so membership denial on workspace routes is untested (the four original cases cover it only for `:id` household routes). A `GET /api/workspaces/<victimWorkspaceId>/calculation` -> 403 case would pin the property the fix is about.

### W3 - no unit test targets the guard

- The author report says so. The only coverage is the e2e suite that cannot run here. A guard unit test with a stub Prisma would pin "never true without an ACTIVE membership", which is literally API-3's acceptance clause.

## 4. Noted

- `NotFoundException` is imported and unused (`household.guard.ts:6`); pre-existing at HEAD, harmless.
- `audit/impl-api3.md` section 5 reports `tests 103` and `29 files ok`; the current tree yields 140 and 31. Stale numbers, both runs pass.
- No `@NoHousehold()` / `@Public()` escape hatch exists anywhere in `apps/api/src`; consistent with the instruction, but every future guarded route must carry a route id or it will 403.

## 5. Scope and not covered

Verified against the tree, not the author's prose:

| Check | Result | Basis |
|---|---|---|
| 1. Unresolved household -> 403, not `true`; unknown workspace -> 403, not 404/200 | pass | `household.guard.ts:41-43`; lookup returns null -> `householdId` stays undefined |
| 2. Every guarded route carries a household id, no legitimate route breaks | pass | all 9 guarded controllers read in full; all use `:workspaceId` or `:id`; 4 unguarded household routes unchanged; no `:id` sub-resource under a `:workspaceId` prefix |
| 3. `confirmFact` workspace check precedes the update | pass | `facts.service.ts:209` before `:229`; also `canReadDocument` before |
| 4. New cases use a valid random UUID, assert 403 on POST calculate and GET calculation, four existing assertions intact | pass | `cross-household-isolation.e2e-spec.ts:5, 144-163`; `git diff` is import + two appended `it` blocks |
| 5. 140/140, tsc 0, syntax 31/31, no unrelated guard change | pass | ran all three; `git diff` on the guard is one hunk (return true -> throw) |

- Not covered: e2e execution. `@nestjs` and `@prisma/client` are absent from both the root and `apps/api`, so `AppModule` cannot boot and the two new cases are verified by reading and transpile only.
- Not covered: type checking of the two changed files. `tsconfig.test.json` `include` lists neither `household.guard.ts` nor the e2e spec; `tsc -p tsconfig.test.json` passing says nothing about them, and `syntax_check.cjs` only transpiles.
- Not covered: runtime behaviour of Prisma on malformed UUIDs (W1) - inferred from the schema type and Nest's guard-before-pipe order.
