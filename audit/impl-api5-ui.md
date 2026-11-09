# API-5 UI — client method + version history in the filing view

Date: 2026-11-08
Scope: `packages/api-client/src/client.ts` (one method) and `apps/web/src/components/FilingPackageView.tsx` (history card).
Not touched: API modules, `packages/contracts`, docs. Backend reference: `audit/impl-api5.md`, `apps/api/src/modules/filing/return-version-history.ts`.

## 1. Files changed

| File | Change |
|---|---|
| `packages/api-client/src/client.ts` | Imports `ReturnVersionHistoryDto`. Adds `getReturnVersionHistory(workspaceId)` in the filing/approvals section, before `getFilingPackage`: `GET /api/workspaces/${workspaceId}/return-versions` → `ReturnVersionHistoryDto`. Uses the existing `request<T>` wrapper, so it keeps the `{ data?, error?, status }` envelope. |
| `apps/web/src/components/FilingPackageView.tsx` | Imports `ReturnVersionHistoryDto`, `ReturnVersionHistoryItemDto`; adds `VERSION_STATUS_STYLES`; adds `history` + `historyLoaded` state; extends `loadFilingData` with the history request; reloads after approve and after package generation; renders a **Version history** card between the approval card and the package card. |
| `audit/impl-api5-ui.md` | This report. |

Probe files (not shipped, kept for re-running the check): `tmp/probe-api5-history.ts`, `tmp/tsconfig.probe-api5.json`.

## 2. Card layout

Position: directly below "Joint Household Return Approval", above "Form 100 Box Mappings & MyGuichet Transfer Guide". Header: `Version history` plus one explanatory line — a change to a material fact, questionnaire answer, document or calculation supersedes existing approvals and opens a new draft version.

One row per `history.versions` entry, in API order (newest first; the backend `mergeHistory` sorts descending and always materialises the active version):

- Title `Version N`, status badge from `VERSION_STATUS_STYLES`: `DRAFT` → `Current draft` (amber), `APPROVED` → `Approved` (emerald), `SUPERSEDED` → `Superseded` (slate).
- `isCurrent` → `Current version` pill (sky) and a `ring-2 ring-sky-100` / sky border on the row.
- Created: `Created <toLocaleDateString()>` from `createdAt`; without `createdAt` (synthetic draft) → `Draft not yet approved — no version snapshot exists.`
- Right side: `Final tax liability` as `€<2dp>` when `finalTaxLiability` is a number (0 renders `€0.00`), otherwise `Not available until approved`; `Filing package: Generated / Not generated` from `packageGenerated`.
- Approvals, all rows including superseded: email (`userEmail`, falling back to the first 8 chars of `userId`) + `Approved <toLocaleDateTimeString()>`. A superseded approval gets an amber panel with `Approval superseded on <date>: <reason>`; the reason falls back to `The return changed after this approval.` when `supersedingReason` is null.
- Empty states: no approvals on a `DRAFT` → `No approvals yet — this draft still needs every spouse to approve.`; no approvals on an older version → `No approvals were recorded for this version.`
- `history === null` → dashed placeholder reading `Loading version history…`, or `Version history is not available right now.` once a load attempt finished without data. `history.versions.length === 0` → `No return versions recorded for this workspace yet.`
- No placeholder/demo versions: every row comes from the API response.

## 3. Data flow

- `loadFilingData` now runs `getReturnVersion`, `getFilingPackage` and `getReturnVersionHistory` in one `Promise.all`; each result is applied only when `data` is present, so a failed history call cannot blank the approval or package sections.
- `handleApprove` and `handleGeneratePackage` `await loadFilingData()` after `onRefresh()`, so the new version, the superseded approval reason and the `packageGenerated` flag appear without a manual reload. Both actions still set their own state first, so the UI updates even if the follow-up read fails.
- The approval cards and package sections are unchanged.

## 4. Checks run

| Check | Command | Result |
|---|---|---|
| JSX/TS transpile of touched files | `node .tools/syntax_check.cjs` | 42/42 `ok`, including `FilingPackageView.tsx` and `packages/api-client/src/client.ts`; exit 0 |
| Repo type check | `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` | exit 0, no output — **does not include** `apps/web` or `packages/api-client` (see limits) |
| Client + contract type check | `node .tools/node_modules/typescript/bin/tsc -p tmp/tsconfig.probe-api5.json` | exit 0 under `strict`; probe calls `getReturnVersionHistory`, narrows `res.data` to `ReturnVersionHistoryDto`, and reads every field the card uses (`versionNumber`, `id?`, `isCurrent`, `isFrozen`, `status`, `createdAt?`, `finalTaxLiability?`, `packageGenerated`, `approvals[].{id,userId,userEmail?,approvedAt,isSuperseded,supersededAt?,supersedingReason?}`), plus keys a `Record<ReturnVersionHistoryStatus, string>` |

## 5. Limits / not verified

- No browser, no `next build`, no `next dev`: the rendered layout, the ring/pill look and responsive stacking are inspected in code only.
- No React/TSX type check: the repo has no `@types/react` or `next` installed (`node_modules/@types/react` absent). `FilingPackageView.tsx` is covered by JSX transpile plus the contract probe, not by a strict TSX compile.
- No live API/database call: the history payload, the newest-first order and the synthetic `DRAFT` row were not observed at runtime; ordering is taken from the backend contract (`mergeHistory` sort).
- A failed history request is not distinguished from "not loaded yet" beyond the `historyLoaded` flag; the API error message is not surfaced.
- Approvals inside a version are rendered in API order; the UI does not sort them.
