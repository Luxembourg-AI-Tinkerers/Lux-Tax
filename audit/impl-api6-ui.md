# API-6 UI — filing record, freeze badge, assessment follow-up dates

Date: 2026-11-09
Scope: `packages/api-client/src/client.ts` (three methods), `apps/web/src/components/AssessmentView.tsx`
(filing card + follow-up card), `apps/web/src/components/FilingPackageView.tsx` (one badge).
Not touched: API modules, `packages/contracts`, `packages/validation`, docs, `.tools`. Backend reference:
`audit/impl-api6.md`, `apps/api/src/modules/filing/filing.controller.ts`.

## 1. Files changed

| File | Change |
|---|---|
| `packages/api-client/src/client.ts` | Imports `FilingRecordDto`, `CreateFilingRecordDto`, `UpdateAssessmentFollowUpDto`. Adds `recordFiling`, `getFilingRecord`, `updateAssessmentFollowUp` after `getAssessment`, all through the existing `request<T>` wrapper (so they keep the `{ data?, error?, status }` envelope). |
| `apps/web/src/components/AssessmentView.tsx` | New filing-record state and card above the rollover card; new post-filing follow-up card below the discrepancy card; `loadAssessment` now also reads the filing record and seeds the follow-up fields. |
| `apps/web/src/components/FilingPackageView.tsx` | `Filed & frozen` badge plus one explanatory line in the version-history header when `workspace.status === WorkspaceStatus.FILED`. No approval or package logic changed. |
| `audit/impl-api6-ui.md` | This report. |

Probe files (not shipped, kept for re-running the checks): `tmp/probe-api6-client.ts`,
`tmp/tsconfig.probe-api6.json`, `tmp/probe-api6-view.ts`, `tmp/tsconfig.probe-api6-view.json`,
`tmp/probe-stubs-api6/react.d.ts`, `tmp/probe-stubs-api6/jsx.d.ts`.

## 2. API client methods

| Method | Request | Response |
|---|---|---|
| `recordFiling(workspaceId, body: CreateFilingRecordDto)` | `POST /api/workspaces/${workspaceId}/filing-record` | `FilingRecordDto` |
| `getFilingRecord(workspaceId)` | `GET /api/workspaces/${workspaceId}/filing-record` | `FilingRecordDto \| null` |
| `updateAssessmentFollowUp(workspaceId, assessmentId, body: UpdateAssessmentFollowUpDto)` | `PATCH /api/workspaces/${workspaceId}/assessment/${assessmentId}/follow-up` | `AssessmentDto` |

The controller (lines 55, 85, 142) declares exactly these paths; `GET filing-record` is guarded by
`@Roles(PRIMARY_FILER, CO_FILER)`, so a `VIEWER` gets an error envelope and the card stays in its
unfiled state (see limits).

## 3. AssessmentView

### State

`filingRecord`, `filedAt` (default `todayIsoDate()` in local time — `toISOString()` would shift the
calendar day near midnight), `filingRoute` (default `FilingRoute.MYGUICHET_MANUAL`),
`confirmationReference`, `filingNotes`, `recording`; follow-up state `objectionDeadline`,
`followUpAt`, `isFinal`, `savingFollowUp`.

`FILING_ROUTE_LABELS: Record<FilingRoute, string>` maps the three enum members to
`MyGuichet (manual entry)`, `Paper Form 100`, `Other channel`. `toDateInputValue` slices the API's ISO
instant to `YYYY-MM-DD`; a missing value becomes an empty string, never a made-up date.

### Loading

`loadAssessment` runs `getAssessment` and `getFilingRecord` in one `Promise.all`. The filing record is
applied whenever the request did not error (`data ?? null`, so a successful `null` clears the card).
When an assessment exists, `objectionDeadline` / `followUpAt` / `isFinal` are seeded from
`assessment.objectionDeadline` / `.followUpAt` / `.isFinal`.

`useEffect` resets `assessment` and `filingRecord` before loading. This is the one addition outside the
brief: without it the follow-up editor could show (and PATCH) the previous tax year's assessment after
a workspace switch. It follows the reset already used by `FilingPackageView`.

### Filing record & freeze card (above the rollover card)

Unfiled state — a form with:

- `Filed on` — `type="date"`, `required`, bound to `filedAt`;
- `Filing route` — `<select>` with the three enum options, default `MYGUICHET_MANUAL`;
- `Confirmation reference (optional)` — text, `maxLength={120}`;
- `Notes (optional)` — text, `maxLength={1000}`;
- button `Record filing & freeze this version`, disabled while `recording` or without a date.

Submit builds a `CreateFilingRecordDto`; the two optional strings are sent only when non-blank (the
validation schema caps them at 120/1000 and has no empty-string branch). On success the returned
record is stored, the optional inputs are cleared and the toast names the frozen version
(`Filing recorded — return version N is now frozen.` when the API reports `versionNumber`), then
`onRefresh()` runs so the workspace status refreshes. On failure the API message is shown verbatim —
that is how an unapproved workspace, a duplicate record or a frozen version surfaces, since the client
does not pre-judge those states. The form is replaced by the filed view as soon as a record exists, so a
second recording is not reachable from the UI.

Filed state — `Filed on`, `Filing route` label, `Confirmation reference` (or `Not provided`), and
`Filed return version` (`Version N`, or `Snapshot <first 8 chars of returnVersionId>` when the API omits
`versionNumber`), plus the notes when present. A `🔒 Filed & frozen` badge sits next to the heading, and
a note states that the snapshot is immutable (facts, calculation, approvals kept as filed) and that a
material change requires an amendment.

### Post-filing follow-up card (below the discrepancy card, only when `assessment` exists)

`Objection deadline` and `Follow-up date` date inputs, an `Assessment is final` checkbox, and a
`Save follow-up dates` button disabled while saving. The inputs show exactly what the API returned for
this assessment (the API derives objection +3 months and follow-up +30 days from the bulletin date at
import); there is no read-only variant of these fields in the API, so they are editable and seeded from
the response. Empty inputs are omitted from the `UpdateAssessmentFollowUpDto` body: the schema rejects
`''` (`^\d{4}-\d{2}-\d{2}$`) and an omitted field leaves the stored date untouched. On success the
returned `AssessmentDto` replaces the state, the fields are re-seeded from it, and a toast confirms; on
failure the API message is shown. A `Final assessment` pill appears while `assessment.isFinal` is true.

Discrepancy rendering, the rollover card and the assessment import form are unchanged.

## 4. FilingPackageView

`WorkspaceStatus` is imported and the version-history header now renders a `🔒 Filed & frozen` badge
plus `The filed version snapshot is immutable. Material changes after filing require an amendment
rather than an edit of the filed version.` when `workspace.status === WorkspaceStatus.FILED`. Nothing
else in the approval, history or package sections changed.

## 5. Checks run

| Check | Command | Result |
|---|---|---|
| JSX/TS transpile sweep | `node .tools/syntax_check.cjs` | exit 0, 45/45 `ok`, including `packages/api-client/src/client.ts` and `FilingPackageView.tsx`. `AssessmentView.tsx` is not in that tool's file list. |
| Repo type check | `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` | exit 0, no output. This project does not include `apps/web` or `packages/api-client`, so it says nothing about this change. |
| Client + contract type probe | `node .tools/node_modules/typescript/bin/tsc -p tmp/tsconfig.probe-api6.json` | exit 0 under `strict`. The probe calls all three methods with `CreateFilingRecordDto` / `UpdateAssessmentFollowUpDto` (with and without optionals), narrows `getFilingRecord` to `FilingRecordDto \| null`, reads every field the card renders (`filedAt`, `route`, `confirmationReference`, `notes`, `returnVersionId`, `versionNumber`, `isFrozen`) and indexes a `Record<FilingRoute, string>`. |
| Component TSX type probe | `node .tools/node_modules/typescript/bin/tsc -p tmp/tsconfig.probe-api6-view.json` | exit 0 under `strict`, with the real `packages/contracts` and `packages/api-client` sources plus minimal React/JSX declaration stubs. Covers `AssessmentView.tsx` and `FilingPackageView.tsx`. |
| JSX transpile diagnostics | `ts.transpileModule(..., { reportDiagnostics: true })` on both components | `ok` for both, no syntax/JSX-nesting diagnostics. |

## 6. Limits / not verified

- **No browser, no `next build`, no `next dev`.** Layout, badge colours, responsive stacking and the
  toast behaviour are inspected in code only; nothing was rendered. No screenshot exists.
- **No React typings.** The repo has no `@types/react`, so the component probe uses local stubs for
  `useState`/`useEffect`/`FormEvent`/JSX. It proves our state and contract usage type-checks; it cannot
  prove real React prop validity (e.g. a misspelled DOM attribute would not be caught).
- **No API, no database.** None of the three endpoints was called. HTTP statuses, the freeze
  transaction, the audit rows, the `VIEWER` 403 and the "already filed" 400 are inferred from the
  controller/service source, not observed.
- **Error paths unexercised.** Unapproved workspace, duplicate filing, frozen version, failed follow-up
  PATCH and network failure all render the API message, but that was not seen at runtime.
- **Transient states unexercised.** Loading, in-flight disabling and a double submit are reviewed in
  code; no click was simulated. The UI relies on the API to reject a duplicate record.
- **`GET filing-record` failure leaves the form visible.** For a `VIEWER` (403) or a transient error,
  `loadAssessment` keeps `filingRecord` null, so the card offers the form and only the submit reveals
  the permission error. No explanatory message is shown for the failed read.
- **A stored date cannot be cleared.** Because empty fields are omitted, the UI cannot blank an
  objection deadline or follow-up date once set; only overwrite it. The API offers no unset semantics.
- **`isFinal` is one-way in practice.** The checkbox can be unticked and the API accepts it; the UI does
  not warn or confirm.
- **Dates are shown as raw `YYYY-MM-DD`** (filed date, seeded inputs); no locale formatting was added,
  to keep a calendar day unambiguous.
- **Workspace-switch reset** (`setAssessment(null)`, `setFilingRecord(null)`) is a deliberate one-line
  behaviour change; the previous year's assessment no longer lingers while the new requests are in
  flight.
