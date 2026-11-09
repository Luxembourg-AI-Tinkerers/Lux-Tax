# Review — API-4 notification foundation

Date: 2026-11-08
Reviewer: independent (read-only; no implementation file was modified)
Subject: `audit/impl-api4.md`, `audit/impl-api4-ui.md`, and the code they describe
Verdict: **allPass = true** — 0 must-fix, 6 worth considering, 8 recorded.

## 1. Conclusion

The notification foundation is deliverable. The data model and migration agree exactly with what Prisma itself generates, every read/write path is scoped by `(workspaceId, userId)` or `(userId, householdId)`, the six routes sit behind both guards with no dynamic route able to shadow the static ones, and the three hooks emit static text only after the domain write has committed. I reproduced all three regression commands (`169/169` tests, `tsc` exit 0, `38/38` syntax files) plus the Prisma parity check (`53/53` normalised SQL lines, `0` diffs). No cross-user/cross-workspace notification, private-fact leak, model/migration mismatch or route bypass was found. The six findings below are non-blocking: one latent security-preference trap, one unreachable-notification path, one UI race across a workspace switch, one `actionUrl` only this client can resolve, duplicate rows on repeated actions, and a wrong-recipient case for VIEWERs. The material residual risk is environmental, not logical: the migration was not applied and the API/UI were not executed.

## 2. Must fix

None.

The four blocker categories from the brief were checked directly and none is met: (a) `list`/`unreadCount`/`markRead`/`markAllRead` all filter `userId` (`notifications.service.ts:226-231, 247, 257, 275`), so a guessed foreign id returns the same 404 as a missing one (`:261-265`); (b) the fact hook fires only when `!redactAudit && confirmed.isSharedWithHousehold` (`facts.service.ts:320`) and the body contains no field key, amount or document name (`:329-331`); (c) the migration is byte-for-byte Prisma's generated SQL after whitespace normalisation; (d) both guards are class-level on the controller (`notifications.controller.ts:32-33`) and only `JwtAuthGuard`/`HouseholdGuard` gate every route.

## 3. Worth considering

### R1. The preference schema accepts `SECURITY_ALERT` as a mute, contradicting its own contract
- **Position:** `packages/validation/src/notification.schema.ts:4-12`
- **Problem:** The docstring says security alerts "ignore user preferences by design, so muting them is not an option this schema exposes" (lines 5-7), but `mutedTypes` is `z.array(z.nativeEnum(NotificationType))` (line 12) over all 11 types, `SECURITY_ALERT` included. A `PUT /preferences` with `{"mutedTypes":["SECURITY_ALERT"]}` validates and is persisted (the UI offers only two types, but the API is the contract).
- **Impact:** If a later emitter routes a security notice through `emitToHousehold` — the only preference-aware path (`notifications.service.ts:177-185`) — that notice is silently dropped for the user who stored the mute. No security emitter exists yet, so this is a trap for the next batch, not a live failure; it also makes the plan's "security notices are handled separately" unenforceable at the schema boundary.
- **Evidence:** schema lines above; `defaultNotificationPreference`/`shouldDeliverNotification` apply mutes without a type allow-list (`notification-rules.ts:16-24`); `createForUser` is the documented bypass (`notifications.service.ts:112-117`) but has no caller.
- **Fix direction:** Restrict `mutedTypes` to the ordinary types (exclude `SECURITY_ALERT`), or reject it explicitly; if the whole enum must stay accepted, state in the DTO that a stored security mute is ignored by both emit paths.

### R2. Notifications without a workspace can never be read or marked
- **Position:** `apps/api/prisma/schema.prisma:605`; `apps/api/src/modules/notifications/notifications.service.ts:117-141, 206-243, 251-268`
- **Problem:** `workspaceId` is nullable and `createForUser` defaults it to `null` (`:123`), but every read path requires a workspace id from the URL: `list` filters `workspaceId` (`:226-227`), `markRead` includes it in the `updateMany` (`:257`), `markAllRead` too (`:275`). A household-level or security row written without a workspace is therefore unreachable and permanently unreadable.
- **Impact:** The intended `SECURITY_ALERT` path (`createForUser`) would write rows no client can fetch; the only way to make them visible is to pass a workspace, which changes their scope to that tax year.
- **Evidence:** model line 605; service lines above; the controller exposes only `/api/workspaces/:workspaceId/notifications` (`notifications.controller.ts:32`), no household-scoped read.
- **Fix direction:** Require `workspaceId` on `createForUser` until a household-scoped read path exists, or add an optional workspace filter to `list`/`markRead` for household-level rows.

### R3. A preferences response can land after a workspace switch and be saved into the new household
- **Position:** `apps/web/src/components/NotificationCenter.tsx:194-210` (load) and `:232-255` (save); the list path has the correct guard at `:139-145`
- **Problem:** `getNotificationPreferences(workspaceId)` and `updateNotificationPreferences(workspaceId, ...)` capture the prop but never check `activeWorkspaceRef` before `setPreferences`. The workspace-change effect clears `preferences` (`:95`), yet a response from the previous workspace arriving after that reset re-populates it. `handleTogglePreferences` then returns early because `preferences` is truthy (`:203`), so the panel never refetches, and Save (`:237-242`) writes the old household's values under the new `workspaceId`.
- **Impact:** A user who switches tax year while the preferences panel is loading can see household A's preferences under household B and overwrite B's row with A's `mutedTypes`. Both households belong to the same user, so this is a data-mixup/UX bug, not a cross-user leak.
- **Evidence:** lines above; the dashboard re-renders the same component instance with a new `workspaceId` (`dashboard/page.tsx:144`), so state survives the prop change; by contrast `refresh()` drops late responses via `activeWorkspaceRef` (`:139-145`).
- **Fix direction:** Capture `const requested = workspaceId` and discard the response when `activeWorkspaceRef.current !== requested`, in both the get and the save handler (or key the panel on `workspaceId`).

### R4. `actionUrl` is not a resolvable route for any client but this component
- **Position:** `apps/api/src/modules/facts/facts.service.ts:333`; `apps/api/src/modules/filing/filing.service.ts:199, 214, 940`; shim at `apps/web/src/components/NotificationCenter.tsx:260-267`
- **Problem:** Every hook stores `actionUrl: '/dashboard'`, but the only dashboard route is `/[householdId]/dashboard` (`apps/web/src/app/(workspace)/[householdId]/dashboard`). The web client rewrites that one string using the current route param; any other consumer — the planned mobile client, an email template, an admin view — receives a path that does not exist.
- **Impact:** The stored link is only correct inside this one component, and the API contract is wrong for every other consumer; the shim hardcodes knowledge of one API value.
- **Evidence:** four emit sites above; route tree under `apps/web/src/app` contains no `dashboard` segment at the root; `resolveActionUrl` only handles the exact string `'/dashboard'`.
- **Fix direction:** Emit a resolvable route (or `entityType`/`entityId` only and let each client build the URL); at minimum document the `/dashboard` convention as part of the contract.

### R5. Repeated actions duplicate notifications; there is no dedupe key
- **Position:** `apps/api/src/modules/filing/filing.service.ts:929-941` (package) and `:203-215` (ready for review); model `apps/api/prisma/schema.prisma:602-627`
- **Problem:** `generateFilingPackage` upserts the package row and emits on every call, and approving again after both approvals re-emits `RETURN_READY_FOR_REVIEW`. Nothing scopes a notification by `(userId, type, entityId)`, so each repeat writes a fresh row for every member.
- **Impact:** Users accumulate identical unread notifications for the same package or approval. The audit proposal explicitly asked for a `dedupeKey` (`audit/audit-api.md`, API-4 proposal item 1); the delivered model has no equivalent.
- **Evidence:** package upsert at `:899-905`, emit at `:929`; approval emit at `:203`; no unique constraint or dedupe column in the model.
- **Fix direction:** Add a dedupe key (or a unique `(userId, type, entityId)` partial index) and skip the emit when the package row already existed or the approval state did not change.

### R6. `APPROVAL_REQUESTED` is sent to members who cannot approve
- **Position:** `apps/api/src/modules/filing/filing.service.ts:187-201`; role gate at `apps/api/src/modules/filing/filing.controller.ts:31-32`
- **Problem:** `emitToHousehold` selects every ACTIVE membership regardless of role, while `POST /approve` is restricted to `PRIMARY_FILER` and `CO_FILER`. A VIEWER — an invitable role (`packages/validation/src/household.schema.ts:15-22`) — receives "A household member approved the return and is waiting for your approval" for an action the guard forbids them from performing.
- **Impact:** A real role gets an instruction it cannot follow; the notification's recipient set does not match the permission model.
- **Evidence:** emit block and `@Roles` above; `emitToHousehold` has no role filter (`notifications.service.ts:147-151`); invitation schema allows VIEWER.
- **Fix direction:** Pass a role filter (or explicit recipient ids) for approval requests, or word the body so it does not ask a viewer to approve.

## 4. Record only

- Two `notificationAge` implementations: `notification-rules.ts:69-84` returns `unknown` for malformed input, `NotificationCenter.tsx:39-47` returns `''`; only the UI copy is probed.
- `NotificationDto` is imported but unused in `packages/api-client/src/client.ts:47`.
- `mutedTypes` accepts duplicates (`notification.schema.ts:12`); the UI `Set` dedupes only the two types it toggles.
- No database invariant ties `notifications.householdId` to `workspace.householdId`; `createForUser` takes both independently (`notifications.service.ts:117-141`), so a future caller can create a mismatched pair.
- Pre-existing, not introduced here: `requiredMemberIds` includes all ACTIVE members (`filing.service.ts:150-156`), so a CLASS_2 household with an active VIEWER can never reach `bothApproved` and never emits `RETURN_READY_FOR_REVIEW`.
- `getNotificationUnreadCount` is not called by the UI (the badge comes from the list's `unreadCount`); only the probe exercises it.
- `RETURN_READY_FOR_REVIEW` and `FILING_PACKAGE_GENERATED` include the actor, so the actor receives a self-notification (documented in `impl-api4.md` §7 as "All active members").
- Invitation, document-confirmation, missing-document, deadline, approval-invalidation, assessment-follow-up and security-alert emitters remain unwired (`impl-api4.md` §9); the original API-4 acceptance for invitation/invalidation is therefore only partly met, outside this brief's fact/approval/package scope.

## 5. Review scope and not covered

**Baseline used.** The six VERIFY items in the task brief, the two implementation reports, plan §7.9 (11 event types; "Users must control ordinary email and push notifications"; security notices handled separately), and the API-4 proposal/acceptance in `audit/audit-api.md`. Where the brief and the original audit differ (partial event coverage), the brief's "foundation" scope was used as the acceptance baseline and the gap is recorded, not scored as a defect.

**Reproduced checks.**

| Command | Result |
|---|---|
| `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts apps/api/test/class-resolution.spec.ts apps/api/test/form100-case-map.spec.ts apps/api/test/notification-rules.spec.ts` | `tests 169 / pass 169 / fail 0` (11 notification cases) |
| `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` | exit 0, no output |
| `node .tools/syntax_check.cjs` | `38/38` `ok`, exit 0 (includes `NotificationCenter.tsx` and the 4 notification API files) |
| `prisma validate` on a temp copy with `url` injected (CLI 6.16.2) | schema valid |
| `prisma migrate diff --from-schema-datamodel <without> --to-schema-datamodel <with> --script` | 53/53 non-empty lines, 0 diffs vs `migration.sql` (13 statements) |
| `tsc -p tmp/tsconfig.probe-api4.json` | exit 0 (six client methods + DTOs under `strict`) |
| `node tmp/probe-api4-age.cjs` | 10/10 |

**Item verdicts.**

| id | verdict | evidence |
|---|---|---|
| I1 Prisma model + migration | pass | `schema.prisma:602-627` and `:629-646`; inverse relations `:176-178, 229-230, 313`; `migration.sql:2, 5` enums, `:8, 29` tables, `:43, 46, 49` indexes, `:52, 55, 58, 61, 64, 67` FKs with Cascade/SetNull; `(userId, householdId)` unique present; Prisma diff exact; migration not applied, no drift claim made |
| I2 Service scoping | pass | `list` `:226-231`; `unreadCount` `:247`; `markRead` `:257` + 404 `:261-265`; `markAllRead` `:275`; prefs compound key `:287, 310`; `emitToHousehold` ACTIVE `:147-151`, actor exclusion `:154-159`, mute filter `:161-185`, `createMany` `:187-199`; hook bodies static |
| I3 Endpoints | pass | class-level guards `notifications.controller.ts:32-33`; routes `:37, 48, 60, 73, 81, 92`; no dynamic GET route; `ParseUUIDPipe` on both ids; zod `safeParse` `:98-104`; `householdIdOf` `:112-119`; guard writes `request.householdMembership` at `household.guard.ts:87` |
| I4 Hooks | pass | facts `:320-336` (`!redactAudit && isSharedWithHousehold`, actor excluded); filing `:186-215` and `:929-941`; `safeNotify` `facts:538-548`, `filing:1215-1225`; grep finds no other emit site; `FactsModule`/`FilingModule` import `NotificationsModule`, which imports only `PrismaModule` — no cycle |
| I5 UI/client | pass (R3, R4 non-blocking) | client paths `client.ts:443-499` match controller; load/poll/reset `NotificationCenter.tsx:86-116`; refresh guard `:139-145`; mark read/all `:159-192`; preferences `:194-255`; dashboard wiring `page.tsx:144` is conditional on `workspace`; all controls wired |
| I6 Regression | pass | 169/169, tsc 0, syntax 38/38; probe tsc 0; prior fixes present (`household.guard.ts:41-60` ignores a body-supplied household; `fact-visibility` 12 cases pass) |

**Not covered, and why.**

- No Postgres, `@prisma/client`, `@nestjs/*` or `apps/api/node_modules`: the migration was not applied, the Prisma client was not generated, and the service/controller/hooks were not typechecked or executed. No endpoint, guard chain or Prisma query ran; the scoping verdict is by code inspection, as `impl-api4.md` §9 states.
- No `@types/react`, `next` or browser: `NotificationCenter.tsx` was transpiled but not type-checked or rendered; polling, dropdown positioning, clicks and the badge were not observed.
- `zod` is absent from the workspace: `packages/validation/src/notification.schema.ts` is not in `tsconfig.test.json`, not in the syntax-check list, and could not be executed here. Its reject-unknown behaviour is reasoned from the zod 3 `nativeEnum` contract (`packages/validation/package.json` declares `^3.24.2`), not run.
- API e2e/DB/browser are unavailable in this batch, per the shared context; no notification e2e exists (the handoff in `impl-api4.md` §10 lists the cases to add).
- The working tree carries 49 modified files from earlier batches, so API-4 cannot be isolated with `git diff`. Attribution is by file content plus the two reports; the dashboard diff also contains three unrelated edits (lines 137, 226, 426) from earlier work, with notification wiring at line 144.
- The 169-test suite is a manual `tsx --test` command; `apps/api`'s package scripts point at jest, so the new spec is not yet wired into `pnpm test`. This matches the pre-existing setup of the other five `node:test` specs.