# API-4 — notification foundation

Date: 2026-11-08
Scope: Prisma model + migration, contracts, validation, pure rules + tests, notifications module/service/endpoints, fact/approval/package hooks, test wiring.
Plan reference: `audit/audit-api.md` API-4 (missing); plan §7.9 (11 event types, user-controlled ordinary email/push); Phase 1 "Add notification foundation".

## 1. Files changed

| File | Change |
|---|---|
| `apps/api/prisma/schema.prisma` | Adds `NotificationType` (11 values) and `NotificationSeverity` (3) enums; `Notification` and `NotificationPreference` models; relation fields on `User`, `Household`, `TaxYearWorkspace`. |
| `apps/api/prisma/migrations/20261108140000_add_notifications/migration.sql` | New migration: 2 enum types, 2 tables, 2 indexes on `notifications`, unique `(userId, householdId)` on preferences, 6 FKs. **Not applied.** |
| `packages/contracts/src/enums.ts` | Mirrors `NotificationType` / `NotificationSeverity` as string enums. |
| `packages/contracts/src/notifications.ts` | `NotificationDto`, `NotificationListDto` (`items` + `unreadCount`), `NotificationPreferenceDto`, `UpdateNotificationPreferencesDto`. |
| `packages/contracts/src/index.ts` | Exports `./notifications`. |
| `packages/validation/src/notification.schema.ts` | `updateNotificationPreferencesSchema`: optional booleans, optional `mutedTypes` array of `NotificationType`, max 11. |
| `packages/validation/src/index.ts` | Exports `./notification.schema`. |
| `apps/api/src/modules/notifications/notification-rules.ts` | Pure `shouldDeliverNotification`, `defaultNotificationPreference`, `notificationAge`. No Nest/Prisma imports. |
| `apps/api/test/notification-rules.spec.ts` | 11 `node:test` cases (mute/unmute/null, enum shape, defaults, age buckets). |
| `apps/api/src/modules/notifications/notifications.service.ts` | `createForUser`, `emitToHousehold`, `list`, `unreadCount`, `markRead`, `markAllRead`, `getPreferences`, `updatePreferences`. |
| `apps/api/src/modules/notifications/notifications.controller.ts` | 6 routes under `api/workspaces/:workspaceId/notifications`. |
| `apps/api/src/modules/notifications/notifications.module.ts` | Imports `PrismaModule`; provides/exports the service. |
| `apps/api/src/app.module.ts` | Registers `NotificationsModule`. |
| `apps/api/src/modules/facts/facts.module.ts` | Imports `NotificationsModule`. |
| `apps/api/src/modules/facts/facts.service.ts` | Constructor gains `NotificationsService`; `confirmFact` emits `MATERIAL_FIELD_CHANGED`; private `safeNotify` logger guard. |
| `apps/api/src/modules/filing/filing.module.ts` | Imports `NotificationsModule`. |
| `apps/api/src/modules/filing/filing.service.ts` | Constructor gains the service; `approveReturn` emits `APPROVAL_REQUESTED` or `RETURN_READY_FOR_REVIEW`; `generateFilingPackage` emits `FILING_PACKAGE_GENERATED`; private `safeNotify`. |
| `tsconfig.test.json` | Includes the rules module and its spec. |
| `.tools/syntax_check.cjs` | Adds rules, service, controller, module and spec. |
| `audit/impl-api4.md` | This report. |

## 2. Data model

`Notification`: `id uuid`, `householdId`, `workspaceId?`, `userId`, `actorId?`, `type`, `severity` default `INFO`, `title`, `body`, `entityType?`, `entityId?`, `actionUrl?`, `isRead` default `false`, `readAt?`, `createdAt`; relations `user` (recipient, Cascade), `actor` (SetNull), `household` (Cascade), `workspace` (Cascade); indexes `(userId, isRead, createdAt)` and `(workspaceId, createdAt)`; table `notifications`.

`NotificationPreference`: `id uuid`, `userId`, `householdId`, `emailEnabled` default `true`, `pushEnabled` default `true`, `mutedTypes NotificationType[]` default `[]`, `createdAt`, `updatedAt`; unique `(userId, householdId)`; table `notification_preferences`.

`User` gains `notifications` (`NotificationRecipient`), `notificationsActedOn` (`NotificationActor`) and `notificationPreferences`; `Household` gains `notifications` and `notificationPreferences`; `TaxYearWorkspace` gains `notifications`. The second User relation is required by the nullable actor FK.

Migration check: a temporary schema copy (same models, datasource `url` injected because the repo schema is Prisma 7 config style and the local CLI is 6.16.2) passes `prisma validate`; `prisma migrate diff --from-schema-datamodel <without-notifications> --to-schema-datamodel <with>` emits the same 53 non-empty SQL lines (13 statements) as the migration, line-for-line after whitespace normalisation. The migration was not applied and no database was touched.

## 3. Contracts and validation

- Enums: `HOUSEHOLD_INVITATION`, `DOCUMENT_CONFIRMATION_REQUIRED`, `MATERIAL_FIELD_CHANGED`, `MISSING_DOCUMENT`, `DEADLINE_REMINDER`, `RETURN_READY_FOR_REVIEW`, `APPROVAL_REQUESTED`, `APPROVAL_INVALIDATED`, `FILING_PACKAGE_GENERATED`, `ASSESSMENT_FOLLOW_UP`, `SECURITY_ALERT`; `INFO`, `WARNING`, `CRITICAL`.
- `NotificationDto` mirrors the row, dates as ISO strings, `workspaceId`/`actorId`/`readAt` nullable. `NotificationListDto.unreadCount` is documented as the workspace/user total, not the page count.
- `NotificationPreferenceDto` has an optional `id`: the default returned before first save has no row yet.
- `updateNotificationPreferencesSchema` accepts `{}`; `mutedTypes` uses `z.nativeEnum(NotificationType)` capped at 11, so unknown strings are rejected rather than stored.

## 4. Pure rules

- `shouldDeliverNotification(pref, type)` returns `false` only when `pref.mutedTypes` includes `type`; `null`/`undefined` means deliver. It is the single delivery decision used by `emitToHousehold`.
- `defaultNotificationPreference(householdId, userId)` returns both channels enabled and no mutes.
- `notificationAge(createdAt, now)` returns `just now`, `<n> min ago`, `<n> h ago`, `<n> d ago`; future timestamps clamp to `just now`, malformed input returns `unknown`.

## 5. Service semantics

- `createForUser` writes directly and does **not** consult preferences; this is the path intended for non-mutable notices such as security alerts. It is not called by any hook yet.
- `emitToHousehold` loads `ACTIVE` memberships only, removes `excludeUserIds`, loads preferences for the remaining recipients in one query, filters muted types, then `createMany`. Returns the number of rows written (0 when everyone muted or everyone was the actor).
- `list` verifies the workspace exists (404), selects only the caller's rows for that workspace, orders `createdAt desc`, clamps `limit` to 1..100 (default 50), and returns the full workspace/user `unreadCount` in the same call. `unreadOnly` adds `isRead: false`.
- `markRead` uses `updateMany` scoped by `(id, workspaceId, userId)`; zero rows is a 404, so a guessed id from another user or household is indistinguishable from a missing one.
- `markAllRead` updates only the caller's unread rows and returns `{ updated }`.
- `getPreferences` reads `userId_householdId`; absent row returns the DTO defaults instead of creating one. `updatePreferences` upserts with `emailEnabled ?? true`, `pushEnabled ?? true`, `mutedTypes ?? []` on create and only the supplied fields on update.
- Payload rule: all hook text is static; no amount, field key, matricule or document name is written. `entityId` is a reference and `actionUrl` is a fixed dashboard path.

## 6. Endpoints

| Method | Path (after `/api/workspaces/:workspaceId/notifications`) | Result |
|---|---|---|
| GET | `/` | `NotificationListDto`; query `unreadOnly=true\|1` |
| GET | `/unread-count` | `{ unreadCount }` |
| PATCH | `/:notificationId/read` | `{ success: true }`; 400 malformed UUID, 404 not own |
| POST | `/read-all` | `{ updated }` |
| GET | `/preferences` | `NotificationPreferenceDto` (defaults if unsaved) |
| PUT | `/preferences` | Validated upsert, returns `NotificationPreferenceDto` |

The controller uses `@UseGuards(JwtAuthGuard, HouseholdGuard)` and `@CurrentUser('id')`. Preference handlers take `householdId` from `request.householdMembership`, which the guard resolves from the workspace; an unresolved context is 403. `HouseholdGuard` already rejects non-members, unknown workspaces and malformed workspace ids, so every route is scoped before the service runs.

## 7. Event hooks

| Source | Event | Recipients | Condition |
|---|---|---|---|
| `FactsService.confirmFact` | `MATERIAL_FIELD_CHANGED` / INFO | Active household members except the actor | `!redactAudit && confirmed.isSharedWithHousehold`; private facts and private drafts never emit |
| `FilingService.approveReturn` | `APPROVAL_REQUESTED` / INFO | Active members except the actor | Approval succeeded and `bothApproved === false` |
| `FilingService.approveReturn` | `RETURN_READY_FOR_REVIEW` / INFO | All active members | `bothApproved === true` |
| `FilingService.generateFilingPackage` | `FILING_PACKAGE_GENERATED` / INFO | All active members | Package persisted and workspace moved to `FILING_PACKAGE_READY` |

Each call is wrapped in a private `safeNotify` that logs `Notification skipped (...)` at warn level and swallows the error, so a notification failure cannot roll back or mask a fact, approval or package write. No hook was added to fact update/delete, private facts, document uploads, invitations, deadlines or assessment import.

## 8. Checks run

| Check | Command | Result |
|---|---|---|
| Baseline before edits | `tsc -p tsconfig.test.json`, `node .tools/syntax_check.cjs` | exit 0, exit 0 |
| Typecheck | `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` | exit 0 |
| Unit/integration suite | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts apps/api/test/class-resolution.spec.ts apps/api/test/form100-case-map.spec.ts apps/api/test/notification-rules.spec.ts` | 169 tests, 169 pass, 0 fail; 11 new notification cases |
| Syntax check | `node .tools/syntax_check.cjs` | exit 0; all files `ok`, including the 5 new notification entries |
| Prisma schema | `prisma validate` on a temp copy with `url` injected (CLI 6.16.2 from `.tools`) | valid |
| Migration parity | `prisma migrate diff` from the schema without the notification models to the schema with them | 53/53 non-empty lines (13 statements) equal to `migration.sql` after whitespace normalisation |

## 9. Limits / not verified

- **No API runtime check.** There is no `@nestjs/*`, no `@prisma/client`, no `apps/api/node_modules` and no Postgres here. The API cannot boot, so no endpoint, guard path, Prisma query or e2e test was executed. `tsc -p tsconfig.api.json` fails on the pre-existing missing Nest/Prisma modules (baseline condition), so the service, controller and hooks are covered by syntax transpilation and code inspection only — not by a typecheck or a running request.
- **Migration not applied.** It was authored and compared against Prisma's generated SQL, but never executed. A shadow/live database should apply `20261108140000_add_notifications` and re-run the Prisma client generation before the API is started.
- **No delivery layer.** `emailEnabled` / `pushEnabled` are persisted but no email, push, outbox, retry or dedupe exists. Only in-app rows are written. `markRead` refreshes `readAt` on repeat calls.
- **Event coverage is partial by design.** Invitation, document-confirmation, missing-document, deadline, approval-invalidation, assessment-follow-up and security-alert emitters are not wired in this batch; `createForUser` is ready for the security path but has no caller.
- **No UI/API client wiring**, no pagination cursor, no per-type preference UI. `limit` is service-only; the controller exposes only `unreadOnly`.

## 10. Handoff

Re-run in an environment with the API dependencies installed:

1. `pnpm --filter @luxtax/api prisma generate` (or the repo's `prisma:generate`).
2. Apply the migration in a disposable database: `pnpm --filter @luxtax/api prisma migrate deploy`.
3. `pnpm --filter @luxtax/api test:e2e` after adding notification e2e coverage for: spouse sees one `MATERIAL_FIELD_CHANGED` and the actor sees none; muted type yields zero rows; `unread-count` drops after `PATCH .../read`; another user's notification id returns 404; `GET/PUT preferences` round-trips.
4. Run the three commands in §8 in CI; they are the checks this environment could actually execute.

Suggested follow-ups (not done): emit `HOUSEHOLD_INVITATION` from `households.service`, `DOCUMENT_CONFIRMATION_REQUIRED` from document extraction, `APPROVAL_INVALIDATED` from the invalidation routine, `SECURITY_ALERT` on new-device login (requires persisting session `userAgent`/`ipAddress`), and a scheduler for deadline/assessment reminders.
