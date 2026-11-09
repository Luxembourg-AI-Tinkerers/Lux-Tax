# Review — API-3 body-id fix (round 2)

Date: 2026-11-08
Reviewer: independent, read-only. Author report: `audit/impl-api3.md` §4. Prior review: `audit/review-api3.md` §2 M1, §3 W1-W2.
Subject: `apps/api/src/common/guards/household.guard.ts`, `apps/api/test/cross-household-isolation.e2e-spec.ts`.
Standard: the five checks in the review request; API-3 acceptance in `audit/audit-api.md:153-181`; plan §14.5 and §17.1.

## 1. Conclusion

Pass on all five checks; no must-fix. The M1 bypass is closed: the guard reads no request body, and on a `:workspaceId` route the household comes from the workspace row, so `{"householdId": "<own household>"}` against a victim workspace is denied with 403 and the membership lookup is pinned to the victim household. A malformed workspace id is 403 before Prisma, an unknown workspace is 403, and `:id` household routes, own-workspace calls and the role/status gates behave as before. Regression is green: 140/140 tests, tsc exit 0, syntax 31/31, and the round-1 fail-closed change is still in place. Two worth-considering items and four notes, none blocking.

## 2. Must fix (0)

None. Both blocker conditions were exercised directly:

- Body id still choosing the household: no. No `request.body` read remains (`household.guard.ts:34-41`); zero `body.householdId` / `body.workspaceId` occurrences in `apps/api/src`; zero `householdId` fields in `packages/validation/src`. Harness cases A/B/J/K/Q/R/S.
- Legitimate guarded route returning 403: none found. Every guarded route carries `:id` or `:workspaceId` (all nine controllers re-read); the victim's own `GET .../workspaces/2025` returning 200 in the spec's setup is a positive control; guard-level owner/member paths return true.

## 3. Worth considering (2)

### W1 — the household-id path still skips the UUID gate, and `params.householdId` is dead

- Location: `household.guard.ts:39` (resolution), `:41-47` (gate applied only to `workspaceId`), `:57-59`.
- Problem: `isUuid` validates only `params.workspaceId`. `params.id` goes straight into the `householdId_userId` lookup and is sent to Prisma unvalidated, so `GET /api/households/not-a-uuid` still produces the unmapped 500 (22P02/P2023) that this change removed for workspace routes. `request.params.householdId` has no declaring route: no controller in `apps/api/src/modules` uses `:householdId`.
- Impact: an inconsistent error contract on a guarded, user-visible route, and a 500 path on the household half of the same guard. Not a bypass (membership is still evaluated) and not a regression — HEAD behaves identically.
- Evidence: the guard lines above; the route inventory below; `audit/impl-api3.md` §4.5 acknowledges the malformed `:id` case; round-1 `review-api3.md` §3 W1 recorded it. Runtime mapping is inferred, not run.
- Fix direction: apply the same `isUuid` check to the resolved household id (403, or 400 if a shape error is preferred) and delete or validate the unused `householdId` branch.

### W2 — neither changed file is typechecked, and the guard property rests on a non-runnable e2e plus an untracked temp harness

- Location: `tsconfig.test.json` `include` (neither `household.guard.ts` nor `cross-household-isolation.e2e-spec.ts` is listed); `tsconfig.api.json` `include` (`common/guards` absent); `tmp/guard-harness/check-guard.cjs` (not referenced by the root `package.json`, `turbo.json` or `apps/api/package.json`).
- Problem: `tsc -p tsconfig.test.json` exit 0 and 140/140 say nothing about the two files this fix changed. The guard has no unit test in the repo, and the e2e suite cannot boot here (no `@nestjs/*`, no `@prisma/client` at root or in `apps/api`).
- Impact: a later edit could reintroduce a body fallback or a 500 path with every current gate still green.
- Fix direction: once dependencies are installed, add a guard unit test with a Prisma stub (body id, malformed, unknown, `:id`, role/status) and put the guard into a typecheck config.

## 4. Noted (4)

- `NotFoundException` is still imported and unused (`household.guard.ts:6`); pre-existing, harmless.
- `isUuid` is stricter than Postgres UUID input: it rejects unhyphenated 32-hex and braced forms that Postgres accepts. Every id in the tree comes from an API response in canonical form; no caller impact.
- `audit/impl-api3.md` has two `## 4.` headings — line 70 "Tests added" and line 116 "Body-id bypass fix" — so a reference to "§4" is ambiguous.
- The two random-UUID e2e cases from round 1 are now partly redundant with the victim-workspace cases; they still cover the unknown-row path, so they are worth keeping.

## 5. Scope and not covered

| Check | Result | Basis |
|---|---|---|
| 1. Guard reads no `body.householdId` / `body.workspaceId`; a body id cannot choose the household | pass | guard `:34-41` (no `request.body`); zero `body.householdId`/`body.workspaceId` hits in `apps/api/src`; zero `householdId` in `packages/validation/src`; harness A/B/J/K/Q/R/S |
| 2. `:workspaceId` routes derive the household from the workspace row; unknown 403; malformed 403 not 500; `:id` routes still work | pass | guard `:41-55`, `:57-73`; harness D (403 "Invalid workspace id", zero Prisma calls), E (unknown UUID 403), G (owner `:id` true, membership attached), H (own workspace true), L (empty segment 403) |
| 3. New cases use the victim workspace id and attacker token, POST calculate and GET calculation 403; existing assertions intact | pass (by reading and diff; not executed) | spec `:47-57`, `:68-77`, `:185-202`; `git diff` is the import + setup + two appended `it` blocks, the original four untouched; 8 `it` blocks total |
| 4. No legitimate guarded route breaks; every guarded controller has a route id | pass | nine controllers re-read; every guarded route has `:id` or `:workspaceId`; sub-resource params are `:documentId` / `:factId` / `:ownerId` / `:taskId` / `:year`, never `:id`; no `APP_GUARD` registration and no use outside `modules` |
| 5. 140/140, tsc 0, syntax 31/31; prior fixes unchanged | pass | all three run below; `git diff` of the guard is the round-1 throw plus the round-2 body removal and `isUuid`; `facts.service.ts:185-229` workspace/extracted-fact checks intact |

Commands run from `B:\B\tax-app`:

- `tsx --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts apps/api/test/class-resolution.spec.ts` → tests 140, suites 24, pass 140, fail 0, exit 0.
- `tsc -p tsconfig.test.json` → exit 0, no diagnostics.
- `node .tools/syntax_check.cjs` → 31 files `ok`, exit 0.

Independent guard harness: two throwaway scripts under `%TEMP%` (not written into the repo) transpile the real `household.guard.ts` and load it against stubbed `@nestjs/common`, `@nestjs/core`, `@luxtax/contracts` and a recording Prisma double; 27 assertions, 27 pass. They cover the M1 payload on a victim workspace (lookup pinned to the victim workspace, membership queried for the victim household and the attacker), a spoofed `body.workspaceId`, body-only ids, malformed / unknown / empty workspace ids, `:id` owner versus attacker, own-workspace success, INVITED status, the role gate and the no-user case.

Not covered:

- e2e execution: no `@nestjs/*` or `@prisma/client` at root or in `apps/api`, so `AppModule` cannot boot; the cases are verified by reading, diff and transpile, not by a live request. Transpile of the spec and the guard: 0 diagnostics each.
- Typechecking of the two changed files: they are in no tsconfig `include`, and the Nest/Prisma types are absent, so they cannot be typechecked here.
- Prisma's runtime 22P02/P2023 mapping for a malformed `:id` (W1): inferred from the `@db.Uuid` column and guard-before-pipe ordering, not run.
- Prisma uuid comparison for uppercase ids: inferred, not run.