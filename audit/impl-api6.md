# API-6 — Filing record, assessment follow-up dates, frozen filed version

Scope: record a real submission (date, route, confirmation), derive and track the
objection/follow-up dates of an assessment, and freeze the filed return version so
`FILED` becomes reachable instead of being skipped. No web change, no migration
applied, no docs edited outside this report.

## 1. Model

### `FilingRecord` (`filing_records`)

| Field | Type | Notes |
|---|---|---|
| `id` | uuid PK | `@default(uuid())` |
| `workspaceId` | uuid, **unique** | one filing per workspace |
| `returnVersionId` | uuid, **unique** | the snapshot that was filed |
| `filedAt` | `DateTime` | calendar day, stored 00:00:00Z |
| `route` | `FilingRoute` | default `MYGUICHET_MANUAL` |
| `confirmationReference` | `String?` | ACD / MyGuichet receipt |
| `notes` | `String?` | free text |
| `createdById` | uuid | who recorded the filing |
| `createdAt` / `updatedAt` | `DateTime` | standard |

Relations: `workspace` → `TaxYearWorkspace` (`onDelete: Cascade`), `returnVersion`
→ `ReturnVersion` (`onDelete: Restrict`, per brief), `createdBy` → `User`
(`@relation("FilingRecords")`, `onDelete: Restrict`). Index `workspaceId`; the
unique on the same column is kept as well, so the generated migration has both a
unique index and the requested plain index.

Inverses added: `TaxYearWorkspace.filingRecord`, `ReturnVersion.filingRecord`,
`User.filingRecords`.

### `FilingRoute`

`enum FilingRoute { MYGUICHET_MANUAL PAPER OTHER }` in Prisma and
`packages/contracts/src/enums.ts` (`FilingRoute.MYGUICHET_MANUAL | PAPER | OTHER`).

### `Assessment`

Added `receivedAt DateTime?`, `objectionDeadline DateTime?`,
`followUpAt DateTime?`, `isFinal Boolean @default(false)`. Nullable on purpose:
rows imported before this change keep working and read as "no known window"
rather than a fabricated deadline.

### Audit

`AuditEventType` gains `RETURN_FILED` and `ASSESSMENT_FOLLOW_UP_UPDATED` in both
the Prisma enum and the contracts enum.

### Migration

`apps/api/prisma/migrations/20261109100000_add_filing_record/migration.sql`:
`CREATE TYPE "FilingRoute"`, `ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS`
for both values, `CREATE TABLE filing_records` with PK, two unique indexes, the
`workspaceId` index and three FKs, then four `ALTER TABLE assessments ADD COLUMN`
statements (`isFinal BOOLEAN NOT NULL DEFAULT false`). **Not applied.**

## 2. Lifecycle

```
APPROVED ──recordFiling──▶ FILED ──importAssessment──▶ ASSESSED
             │               │
             │               └─ ReturnVersion.isFrozen = true (snapshot frozen)
             └─ FilingRecord row (date, route, confirmation, author)
```

`FilingService.recordFiling(workspaceId, userId, input, ipAddress?)`:

1. Loads the workspace with ACTIVE household members and the active
   `ReturnVersion` (with approvals).
2. Rejects with 400 when there is no version, when no approval is active, when
   the approval rule is not met, or when a `FilingRecord` already exists.
   The approval rule is the extracted `requiredApprovalsMet()` helper, which
   `approveReturn` now also uses — same behaviour as before: Class 2 needs every
   ACTIVE member, otherwise the acting filer's own approval.
3. In one `$transaction`: creates the record, sets `ReturnVersion.isFrozen = true`
   and `TaxYearWorkspace.status = FILED`. The three writes cannot diverge.
4. Audits `RETURN_FILED` (`entityType: 'FilingRecord'`, `newValue` with version,
   filed date, route, reference) and returns `FilingRecordDto` with
   `versionNumber` and `isFrozen: true`.

`getFilingRecord(workspaceId)` returns the record with its version number and
freeze flag, or `null` before filing.

`updateAssessmentFollowUp(workspaceId, assessmentId, userId, input, ipAddress?)`
loads the assessment **scoped to the workspace** (404 otherwise), updates only
`objectionDeadline` / `followUpAt` / `isFinal` (bulletin date and assessed amounts
are not editable), audits `ASSESSMENT_FOLLOW_UP_UPDATED` with previous and new
values, and returns the full `AssessmentDto`.

### Endpoints

| Method | Path | Roles | Validation |
|---|---|---|---|
| `POST` | `api/workspaces/:workspaceId/filing-record` | `PRIMARY_FILER`, `CO_FILER` | `createFilingRecordSchema` |
| `GET` | `api/workspaces/:workspaceId/filing-record` | `PRIMARY_FILER`, `CO_FILER` | — |
| `PATCH` | `api/workspaces/:workspaceId/assessment/:assessmentId/follow-up` | `PRIMARY_FILER`, `CO_FILER` | `updateAssessmentFollowUpSchema` |

Existing routes (`approve`, `filing-package`, `assessment`, `rollover`,
`return-version(s)`, `assessment` GET, annex PDF) are unchanged. Validation errors
reuse the controller's existing `safeParse` → `BadRequestException` pattern.

## 3. Dates

`apps/api/src/modules/filing/assessment-dates.ts` — pure, no Nest, no Prisma:

- `addMonthsUtc(date, months)` — whole months in UTC with end-of-month clamping
  (31 Jan + 3 → 30 Apr; 29 Feb 2024 + 12 → 28 Feb 2025). Time of day is preserved;
  a midnight input yields midnight.
- `defaultAssessmentFollowUp(bulletinDate)` — objection deadline = notice + 3
  months, follow-up = notice + 30 days, both at UTC midnight of the notice day.
  These are product defaults, not a legal citation; both can be overridden at
  import, so a later rule change never rewrites a stored deadline.
- `isObjectionOpen(deadline, now)` — true when a deadline exists and `now` is at or
  before 23:59:59.999Z of the deadline day; a missing deadline is never open.

`importAssessment` now sets `receivedAt = bulletinDate`,
`objectionDeadline = input.objectionDeadline ?? default.objectionDeadline`,
`followUpAt = input.followUpAt ?? default.followUpAt`, `isFinal = input.isFinal ?? false`,
and audits the two dates. `ImportAssessmentInput` accepts the three optional
overrides (`YYYY-MM-DD`, boolean).

DTO additions (all optional/nullable so older snapshots and clients still work):
`AssessmentDto.receivedAt?`, `.objectionDeadline?`, `.followUpAt?`, `.isFinal?`.
`FilingRecordDto` / `CreateFilingRecordDto` / `UpdateAssessmentFollowUpDto` live in
`packages/contracts/src/filing.ts`; schemas and inferred types in
`packages/validation/src/filing.schema.ts`.

## 4. Freeze guards

| Site | Condition | Result |
|---|---|---|
| `FilingService.approveReturn` | active version `isFrozen` | 400 `Filed return is frozen; start an amendment instead` |
| `FilingService.generateFilingPackage` | active version `isFrozen` | same 400, before any package upsert |
| `CalculationsService.calculateTax` (persist path) | `workspace.status === FILED` | same 400, before the workspace write and the audit event |
| `ReturnApprovalsService.invalidateForChange` | active version `isFrozen` | returns `{ invalidated: 0, frozen: true }`; no approval superseded, no `NEEDS_REVIEW`, no version bump, no audit row |

The invalidation result interface gains an optional `frozen?: boolean`; all
existing callers ignore the return value, so no call site changes. The
no-approval no-op (`{ invalidated: 0 }`) is unchanged for unfrozen workspaces.

## 5. Verification

Run and observed:

1. `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test …`
   (the nine specs in the brief) → **188 tests, 188 pass, 0 fail**, including the
   10 new `assessment-dates` cases (month add, clamping, leap day, year boundary,
   default follow-up, open/closed objection, missing deadline).
2. `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` → **exit 0**
   (contracts, tax engine, the new helper and its spec are in this project).
3. `node .tools/syntax_check.cjs` → **all files ok, exit 0**, including
   `filing.service.ts`, `filing.controller.ts`, `return-approvals.service.ts`,
   `calculations.service.ts`, `assessment-dates.ts` and the new spec.
4. Prisma schema validation: `prisma validate` on a temporary copy of the schema
   with `url = env("DATABASE_URL")` added (the committed schema has no `url`) →
   **"The schema … is valid"**. Model, enum and relation syntax is sound.

Inspection only (no execution): the four guard branches, the transaction order in
`recordFiling`, the audit payloads, and the DTO mappers were read line by line;
there is no runtime evidence for them.

## 6. Limits / not verified

- **Migration not applied and Prisma client not generated.** `@prisma/client` is
  not installed in this workspace, so `this.prisma.filingRecord` and the new
  `Assessment` columns are untyped here and no API/e2e request was executed.
  Before running: `pnpm install`, `prisma migrate deploy`, `prisma generate`.
- **No DB, so no endpoint test.** `POST/GET filing-record` and
  `PATCH assessment/:id/follow-up` are verified at syntax level only; status
  codes, the `$transaction` and the FK `Restrict` behaviour need a database run.
- **Facts/documents can still change after filing.** Their services call
  `invalidateForChange`, which now no-ops with `frozen: true` and leaves the
  frozen snapshot intact; the live workspace rows are not blocked. The brief
  scoped direct 400s to approval, package generation and recalculation only.
- **`recordFiling` gates on approvals, not on status.** A workspace in
  `APPROVED` or `FILING_PACKAGE_READY` can file; `FILED` is not required first,
  and the status is not checked against `CALCULATED`.
- **Class 2 counts every ACTIVE member, including a `VIEWER`.** That is the
  pre-existing `approveReturn` rule (PROD-2); this change mirrors it rather than
  fixing it.
- **No assessment document link, no auto-finalisation, no reminder.** The
  assessment is still imported as JSON (no uploaded bulletin / `documentId`), and
  nothing sets `isFinal` when the window closes or emits an `ASSESSMENT_FOLLOW_UP`
  notification — API-4 owns delivery.
- **No rejection of a bulletin date before the filing date**, although the audit's
  acceptance list mentions it; the brief did not include it.
- **Web UI untouched**: `AssessmentView` does not yet render the new dates or the
  record-filing action.
- The `filing_records.workspaceId` plain index duplicates its unique index. Kept
  because the brief asks for both `@unique` and `@@index` on that column.
