# API-4 UI — notification client, bell, dropdown, preferences

Date: 2026-11-08
Scope: `packages/api-client` notification methods, `NotificationCenter` component, dashboard header wiring, syntax-check list. No API/contracts/service or docs edits.
Backend reference: `audit/impl-api4.md` (contracts, six routes under `/api/workspaces/:workspaceId/notifications`).

## 1. Files changed

| File | Change |
|---|---|
| `packages/api-client/src/client.ts` | Imports `NotificationListDto`, `NotificationDto`, `NotificationPreferenceDto`, `UpdateNotificationPreferencesDto`. Adds six methods after the audit section: `getNotifications` (GET list, `?unreadOnly=`), `getNotificationUnreadCount` (GET `unread-count`), `markNotificationRead` (PATCH `:id/read`), `markAllNotificationsRead` (POST `read-all`), `getNotificationPreferences` (GET `preferences`), `updateNotificationPreferences` (PUT `preferences`). Existing `request<T>` wrapper and `{ data?, error?, status }` shape unchanged. |
| `apps/web/src/components/NotificationCenter.tsx` | New client component (props `{ workspaceId: string }`). |
| `apps/web/src/app/(workspace)/[householdId]/dashboard/page.tsx` | Imports and renders `<NotificationCenter workspaceId={workspace.id} />` inside the header right cluster, before the user email block, only when `workspace` is non-null. |
| `.tools/syntax_check.cjs` | Adds the new component to the file list. |
| `audit/impl-api4-ui.md` | This report. |

Supporting verification files (not shipped): `tmp/probe-api4-notification.ts`, `tmp/tsconfig.probe-api4.json`, `tmp/probe-api4-age.cjs`.

## 2. API client surface

| Method | Request | Return type |
|---|---|---|
| `getNotifications(workspaceId, unreadOnly = false)` | `GET /api/workspaces/:id/notifications?unreadOnly=<bool>` | `NotificationListDto` |
| `getNotificationUnreadCount(workspaceId)` | `GET .../notifications/unread-count` | `{ unreadCount: number }` |
| `markNotificationRead(workspaceId, notificationId)` | `PATCH .../notifications/:notificationId/read` | `{ success: boolean }` |
| `markAllNotificationsRead(workspaceId)` | `POST .../notifications/read-all` | `{ updated: number }` |
| `getNotificationPreferences(workspaceId)` | `GET .../notifications/preferences` | `NotificationPreferenceDto` |
| `updateNotificationPreferences(workspaceId, body)` | `PUT .../notifications/preferences` | `NotificationPreferenceDto` |

Return types match the controller (`notifications.controller.ts`), including `{ updated }` for read-all and `{ success }` for single read.

## 3. Component behaviour

- Wiring: rendered in the dashboard header's right cluster as `<NotificationCenter workspaceId={workspace.id} />`, before the user email/sign-out block, only when `workspace` is loaded. The component owns its data; the dashboard keeps no notification state.
- State: `items`, `unreadCount`, `open`, `loading`, `error`, `preferences`, `showPreferences`, `savingPrefs`, plus local `preferenceFeedback`.
- Load: effect keyed on `workspaceId` resets all state, fetches once, then polls every 60 s via `window.setInterval`; cleanup clears the interval and sets a `cancelled` flag so in-flight responses from the previous workspace cannot land.
- Dropdown opens call `refresh()`; a `activeWorkspaceRef` guard drops a late response if the workspace changed while the request was in flight.
- Bell: inline `<svg>` (no icon package), unread badge capped at `99+`, `aria-label` includes the unread count, `aria-expanded`/`aria-haspopup` set.
- Panel: `absolute right-0`, `w-[360px] max-w-[calc(100vw-2rem)]`, scroll body `max-h-[420px]`; closes on outside `mousedown` and `Escape`.
- List: first 20 of the API page (API returns newest-first, default 50). Severity dot INFO `bg-sky-500`, WARNING `bg-amber-500`, CRITICAL `bg-rose-500`; title, body (2-line clamp), `notificationAge` label; unread rows get `bg-sky-50/60`. Empty and first-load states rendered.
- Click item: PATCH read, update row locally and decrement `unreadCount`; a failed PATCH shows the inline error but still follows `actionUrl` via `router.push` so a bookkeeping failure cannot trap the user. The hooks emit `actionUrl: '/dashboard'`, while the only dashboard route is `/[householdId]/dashboard`; that exact value is resolved against the current `householdId` route param, every other value passes through unchanged.
- Mark all read: POST `read-all`, then mark every loaded row read and zero the badge.
- Preferences: loaded lazily on first open of the subpanel; checkboxes bound to `emailEnabled` / `pushEnabled`; `MATERIAL_FIELD_CHANGED` and `DEADLINE_REMINDER` toggle membership in `mutedTypes` through a `Set`, so any other muted types returned by the API survive the save. Save PUTs only the three preference fields and renders success/error feedback.
- Copy states email/push are stored preferences and that delivery is not implemented, matching the backend's current behaviour.
- Errors are confined to a small banner inside the panel; no error path throws into the dashboard header.

## 4. Checks run

| Check | Command | Result |
|---|---|---|
| Syntax/transpile of touched files | `node .tools/syntax_check.cjs` | 38/38 `ok`, including `NotificationCenter.tsx`, dashboard page and `client.ts` |
| Repo type check | `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` | exits 0, no output — **does not include** the web component or `client.ts` (see limits) |
| Client/contract type check | `node .tools/node_modules/typescript/bin/tsc -p tmp/tsconfig.probe-api4.json` | exits 0 under `strict`; probe calls all six methods, narrows `NotificationListDto.items` to `NotificationDto[]`, builds `UpdateNotificationPreferencesDto`, and keys a `Record<NotificationSeverity, string>` |
| Relative-age behaviour | `node tmp/probe-api4-age.cjs` | 10/10 cases pass: 0 s and 30 s → `just now`, 5 min, 59 min, 1 h, 3 h, 23 h, 1 d, 3 d, invalid input → `''` |

## 5. Limits / not verified

- No browser run and no `next build`: JSX rendering, dropdown positioning inside the sticky header, and the badge layout are inspected only, not observed.
- No React type check: the repo has no `@types/react` or `next` packages installed, so the component is covered by transpile plus contract-level probe, not full TSX type checking. `tsconfig.test.json` does not include `apps/web` or `packages/api-client`.
- No live API call: polling, mark-read, read-all and preferences save were not exercised against a running backend or database.
- `actionUrl` navigation was not exercised in a browser. The API emits `'/dashboard'` (`facts.service.ts:333`, `filing.service.ts:199/214/940`) which has no route of its own; the component rewrites that one value to `/[householdId]/dashboard`. This is a UI-side compatibility shim, not a backend fix — the API should eventually emit a resolvable path.
- Email/push remain preference flags only; the UI explicitly says so.
