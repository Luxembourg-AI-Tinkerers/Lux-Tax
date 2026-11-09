# Review — API-6: filing record, freeze, assessment follow-up dates

- Date: 2026-11-09
- Reviewer: independent read-only review
- Inputs: `audit/impl-api6.md`, `audit/impl-api6-ui.md`, `audit/audit-api.md` §API-6, `audit/audit-product.md` §PROD-6
- Baseline: the six VERIFY items in the task, plus the API-6/PROD-6 acceptance where the task does not narrow it.
- **allPass: false**

## 1. Conclusion

API-6 is close but not deliverable as-is. The Prisma model and the hand-written migration agree (enum, table, columns, indexes, FKs, cascade/restrict), and the migration is unapplied. The normal `recordFiling` path does require the active version and the required approvals, returns 400 for no version / no approval / rule not met / already filed, and commits the record + freeze + `FILED` in one transaction. The three freeze guards behave correctly in the sequential case, the assessment dates/defaults/DTO/endpoint are correct, the API-client URLs match, and the 188-test / tsc / syntax baseline is reproduced.

It is blocked by two issues: (1) `AssessmentView` carries workspace-scoped form state across a tax-year switch and never seeds it from the import response, so a new year's assessment can be displayed and saved with the previous year's objection/follow-up dates and `isFinal` — the stale-year blocker; (2) `recordFiling` and `invalidateForChange` use separate check-then-write queries, so a concurrent fact/questionnaire/document change can supersede a version that was just filed and move `activeReturnVersion` past it — the freeze blocker.

**Verification items**

| id | Item | Verdict | Evidence |
|---|---|---|---|
| V1 | Prisma `FilingRecord` fields/relations/uniques/indexes, `FilingRoute`, `Assessment` dates, audit enum values; migration SQL matches and is unapplied | **PASS** | `schema.prisma:53,55,69-73,517-535,537-559`; `migration.sql:7,12-13,16-54`; `prisma validate` on a temp copy: “The schema … is valid”; `prisma migrate diff --from-empty --to-schema-datamodel` produces the same `filing_records` DDL, unique/index names and FK actions; the `luxtax` database has no `_prisma_migrations` table and no `public.filing_records` relation, so the migration is unapplied. |
| V2 | `recordFiling`: active version + required approvals; 400 for no version/no approval/already filed; transaction record+freeze+FILED; audit `RETURN_FILED`; DTO `versionNumber`/`isFrozen`; no duplicate-record race | **PASS on the normal path; FAIL on the concurrency invariant (F2)** | `filing.service.ts:1018-1117` (guards at `:1050`, `:1055`, `:1068`; transaction `:1073-1094`; audit `:1095-1111`; DTO `:1113` and `:1464-1493`). The `$transaction` plus the two unique constraints prevent two records; the approval read is outside the transaction, which is F2. |
| V3 | Freeze: `approveReturn`/`generateFilingPackage` reject a frozen active version; `calculateTax` persist path rejects `FILED`; `invalidateForChange` frozen no-op; snapshot unaffected by later changes | **PASS sequentially; FAIL under concurrency (F2)** | `filing.service.ts:160-162`, `:322-324`; `calculations.service.ts:319-324`; `return-approvals.service.ts:67-73`. The `ReturnVersion` snapshots are JSON copies and the filing package is stored; later facts/questionnaires/documents do not rewrite them. `invalidateForChange` checks only the active version row and is not transactional. |
| V4 | `Assessment` `receivedAt`/`objectionDeadline`/`followUpAt`/`isFinal` persisted and returned; +3 months / +30 days defaults; workspace-scoped audited update; old rows do not crash; optional DTO fields | **PASS** | `schema.prisma:547-553`; `assessment-dates.ts:1-90`; `filing.service.ts:1241-1263` (import), `:1141-1190` (update), `:1445-1462` (mapper); `packages/contracts/src/filing.ts:175-193`; `assessment-dates.spec.ts` 9 cases pass. |
| V5 | UI: client URLs; `AssessmentView` loads the filing record, once-only form, route/reference/notes, frozen badge, follow-up edit, `isFinal`; state reset / no stale year; no dead controls; `FilingPackageView` FILED badge | **FAIL (F1)** | URLs at `packages/api-client/src/client.ts:443-469` match `filing.controller.ts:54-55,84-85,141-142`. The load/display/badge parts are present (`AssessmentView.tsx:66-85,210-380,520-600`; `FilingPackageView.tsx:238-252`). The workspace-scoped form state is not fully reset and not seeded after import: `AssessmentView.tsx:56-58,87-92,94-110`. |
| V6 | Regression: 188/188 tests, tsc 0, syntax 45/45, prior fixes unchanged | **PASS** | Nine spec files: tests 188, pass 188, fail 0; `tsc -p tsconfig.test.json` exit 0; `syntax_check.cjs` 45/45 entries, exit 0; both UI probes exit 0. The 45-file syntax sweep does **not** include `AssessmentView.tsx`; a separate `ts.transpileModule` on it and `FilingPackageView.tsx` reported `ok`. |

## 2. Must fix

### F2 — A filed version's approvals can be superseded and `activeReturnVersion` can move past it (freeze TOCTOU)

- **Severity:** blocker (filed version superseded / filing record without active approvals)
- **Location:** `apps/api/src/modules/filing/return-approvals.service.ts:67-107`; `apps/api/src/modules/filing/filing.service.ts:1037-1094`
- **Problem:** `invalidateForChange` reads the active version and checks `isFrozen` (`:67-73`), then in separate queries supersedes every active approval (`:88-95`) and sets `NEEDS_REVIEW` + increments `activeReturnVersion` (`:100-107`). There is no transaction or row lock. `recordFiling` likewise reads the version and its approvals (`:1037-1057`) and only later writes the record, freeze and `FILED` in a `$transaction` (`:1073-1094`). Under READ COMMITTED the two interleave:
  - T2 (fact/questionnaire/document change) reads `isFrozen=false`; T1 (`recordFiling`) freezes version N and sets `FILED`; T2 then supersedes N's approvals and increments `activeReturnVersion` to N+1 / sets `NEEDS_REVIEW`. Result: version N is frozen but no longer active, its approvals are superseded, and the workspace can leave `FILED` while a filing record points at N.
  - T1 reads N's approvals; T2 supersedes them; T1 commits a filing record for N. Result: a filing record whose version has no active approvals — the “filing record without required approvals” condition.
- **Impact:** the filed version can be made `SUPERSEDED` in the history, its approvals can be rewritten, and the status/active-version no longer point at the frozen version. A later `approveReturn` can then create and approve N+1 (because the active version row is absent/unfrozen), and `calculateTax` is allowed because the status is `NEEDS_REVIEW` rather than `FILED`. This directly violates “invalidateForChange … does not supersede/version-bump a filed version” and the freeze promise.
- **Evidence:** `return-approvals.service.ts:72-73` (`if (activeVersion?.isFrozen) return { invalidated: 0, frozen: true };`), `:88` (`returnApproval.updateMany`), `:104` (`activeReturnVersion: { increment: 1 }`); `filing.service.ts:1046-1048` (approvals read), `:1073-1094` (writes). This is a static interleaving, not runtime-observed: the local database has no migrated schema, so no concurrent request was executed. The absence of a transaction/lock around the read-check-write is visible in the code.
- **Fix direction:** serialize the filing and the invalidation on the same row — wrap the frozen check, approval supersede and workspace update in one transaction that locks the `return_versions`/`tax_year_workspaces` row (`SELECT … FOR UPDATE`) or use a conditional `updateMany` with a count check, and re-read `isFrozen` + the approvals inside the `recordFiling` transaction before creating the record. Abort/retry when the check loses.

### F1 — A tax-year switch leaves the previous year's follow-up dates, `isFinal` and filing text in the new year; the import response is never seeded

- **Severity:** blocker (stale UI showing another year's filing; wrong dates/flags can be persisted)
- **Location:** `apps/web/src/components/AssessmentView.tsx:51-58,66-85,87-92,94-110`; `apps/web/src/app/(workspace)/[householdId]/dashboard/page.tsx:69-71,442-444`
- **Problem:** the `workspace.id` effect resets only `assessment` and `filingRecord` (`:87-92`). `objectionDeadline`, `followUpAt`, `isFinal`, `confirmationReference` and `filingNotes` are workspace-scoped state but survive the switch. `handleImport` only calls `setAssessment(res.data)` (`:109`); it never seeds the follow-up fields from the response (the load at `:81-83` and the save at `:188-190` do). The dashboard also keeps the old `workspace` object until `getWorkspace(selectedYear)` resolves (`page.tsx:69-71`) and renders `<AssessmentView>` without `key={workspace.id}` (`:442-444`), unlike `FilingPackageView` (`:433-434`), so the old year's filing card is shown under the newly selected year during the request.
- **Impact:** (a) Switch from a year with an assessment to a new year, import its assessment: the follow-up card shows the old year's objection/follow-up dates and `isFinal`; clicking “Save follow-up dates” PATCHes the new assessment with them, overwriting the correct +3-month/+30-day defaults. (b) A first import in a session shows empty date inputs instead of the API's defaults, so the assessment view does not show the due dates until a reload. (c) The old year's confirmation reference/notes can be filed against the new year. (d) During the workspace fetch the old year's “Filed & frozen” card is visible under the new year selector; a submit from that card targets the old workspace id; an in-flight `loadAssessment` response from the old year can also overwrite the new year because there is no cancellation/id check. This is the task's “stale UI showing another year's filing” blocker.
- **Evidence:** `AssessmentView.tsx:87-92` (`setAssessment(null); setFilingRecord(null);` only); `:94-110` (`setAssessment(res.data)` only); `:56-58` (the follow-up state); `:81-83` and `:188-190` (the seed that the import path omits); `dashboard/page.tsx:69-71` (`setWorkspace` after the await) and `:442-444` (no key).
- **Fix direction:** reset every workspace-scoped field on `workspace.id` (`objectionDeadline`, `followUpAt`, `isFinal`, `confirmationReference`, `filingNotes`, and the import form's year-scoped values), seed the three follow-up fields from `res.data` in `handleImport` (same setters as `handleSaveFollowUp`), add `key={workspace.id}` to `AssessmentView`, and guard the dashboard's `workspace` by `selectedYear` (clear it before the fetch or render only when `workspace.taxYear === selectedYear`). Ignore/cancel a `loadAssessment` result whose `workspace.id` is no longer current.

## 3. Worth considering

### W1 — The filing tab does not reflect the frozen version in its badge or its actions
- **Location:** `apps/web/src/components/FilingPackageView.tsx:238-252` (badge), `:169-173` (Approve), `:384-388` (Generate); `packages/contracts/src/filing.ts:40` (`isFrozen` on the history item).
- **Problem:** the badge is `workspace.status === WorkspaceStatus.FILED` only. After `importAssessment` sets `ASSESSED` (`filing.service.ts:1263`), the badge and explanatory line disappear although the version remains frozen. The Approve and Generate buttons have no `returnVersion?.isFrozen`/filing-record guard; after filing they always return the 400 “Filed return is frozen; start an amendment instead”. `isFrozen` is carried on each history item but never rendered.
- **Suggestion:** base the frozen indicator and the two actions on `returnVersion?.isFrozen` (or the filing record), not only on `workspace.status`; disable/hide Approve/Generate for a frozen version and point to the amendment flow; optionally show a lock on the history row where `item.isFrozen`.

### W2 — A VIEWER sees editable filing and follow-up forms that always 403
- **Location:** `apps/web/src/components/AssessmentView.tsx:76-79` (filing GET error ignored), `:283-380` (filing form), `:520-600` (follow-up form); `apps/api/src/modules/filing/filing.controller.ts:84-85,141-142` (`@Roles(PRIMARY_FILER, CO_FILER)`).
- **Problem:** `getFilingRecord` is called for every member; a 403 leaves `filingRecord` null and the card offers “Record filing & freeze this version”; the follow-up editor is also editable. Both POST/PATCH return 403. The impl report discloses this, but the screen still presents dead controls to a read-only member.
- **Suggestion:** pass the member role or surface the read error; render a read-only state (or hide the forms) for `VIEWER`, and show the permission message instead of a form that cannot succeed.

### W3 — The lifecycle order is not enforced: `recordFiling` can run after `ASSESSED`, and `importAssessment` can run before `FILED` or with a bulletin before the filing date
- **Location:** `apps/api/src/modules/filing/filing.service.ts:1018-1094` (no status check in `recordFiling`), `:1193-1285` (no `FILED` requirement and no bulletin-vs-filing-date comparison in `importAssessment`).
- **Problem:** a workspace can import an assessment first (status `ASSESSED`) and then record a filing; `recordFiling` sets the status back to `FILED`, regressing the state machine. Conversely, a DRAFT/APPROVED workspace can import an assessment and jump to `ASSESSED`. The API-6 acceptance list explicitly asks to reject a bulletin date that precedes the filing date, and PROD-6 asks that assessment import happen after filing.
- **Suggestion:** guard `recordFiling` on `APPROVED`/`FILING_PACKAGE_READY` (or at least reject `ASSESSED`/`CLOSED` and keep the existing status), and compare `bulletinDate` with `filingRecord.filedAt` in `importAssessment`; require a filing record before moving to `ASSESSED`.

### W4 — The filing and follow-up audit events are outside the write transaction
- **Location:** `apps/api/src/modules/filing/filing.service.ts:1095-1111` (`RETURN_FILED`), `:1169-1189` (`ASSESSMENT_FOLLOW_UP_UPDATED`).
- **Problem:** if `auditService.logEvent` throws, the filing/date change is already committed but the request fails; a retry of the filing then gets “A filing record already exists”. The material change is left without its audit row.
- **Suggestion:** write the audit in the same transaction (pass a transaction client) or through an outbox; if the audit is non-transactional by design, catch and surface a retryable error without pretending the operation failed.

### W5 — A Class 2 household with a `VIEWER` can never reach `APPROVED`/`FILED`
- **Location:** `apps/api/src/modules/filing/filing.service.ts:74-84` (`requiredApprovalsMet`), `:1053-1056` (`recordFiling`); `apps/api/src/modules/filing/filing.controller.ts:27` (`@Roles(PRIMARY_FILER, CO_FILER)` on approve).
- **Problem:** the Class 2 rule requires every ACTIVE member's approval, including a `VIEWER`; the `VIEWER` cannot call `approveReturn` (403), so `requiredApprovalsMet` can never be true and `recordFiling` always returns 400. The impl report discloses this as a pre-existing PROD-2 rule.
- **Suggestion:** define the required approver set as `PRIMARY_FILER` + `CO_FILER` only (or store an explicit approver flag), so a read-only member neither blocks nor is counted.

### W6 — One `FilingRecord` per workspace blocks recording an amended filing, although the freeze error says “start an amendment”
- **Location:** `apps/api/prisma/schema.prisma:519` (`workspaceId @unique`), `apps/api/prisma/migrations/20261109100000_add_filing_record/migration.sql:32`; `apps/api/src/modules/filing/filing.service.ts:1068-1071` (existing check), `:160-162`/`:322-324` (amendment message).
- **Problem:** the freeze guards tell the user to start an amendment (a new `ReturnVersion`), but the `workspaceId` unique and the `existing` check mean a new version can never get its own `FilingRecord`. The model comment says “never a second record on the same one”, which the `returnVersionId` unique already enforces; the workspace unique is stricter.
- **Suggestion:** decide explicitly. If amended filings must be recorded, keep the 1:1 per `returnVersionId` (already unique) and track the current filing via a status/active flag or a separate submission table; otherwise document one-filing-per-workspace as the product rule and remove the “start an amendment” implication for filing records.

## 4. Only recorded

- `isObjectionOpen` is exported and tested but has no production caller (`assessment-dates.ts:73`; only `assessment-dates.spec.ts`), so the PROD-6 objection-open/reminder behavior is not wired.
- `filing_records.workspaceId` has both a unique index and a plain index (`schema.prisma:519,533`; `migration.sql:32,38`); the plain index is redundant.
- `impl-api6.md` says “10 new assessment-dates cases”; the spec has 9 (4 `addMonthsUtc` + 2 `defaultAssessmentFollowUp` + 3 `isObjectionOpen`). The 188 total is correct.
- `AssessmentView` still starts the bulletin date at a hardcoded `'2026-09-01'` (`AssessmentView.tsx:39`); for a later tax year the import form starts with a stale year (pre-existing, not introduced by API-6).
- `createFilingRecordSchema` accepts `2026-02-31` (regex only, `filing.schema.ts:28`); `new Date('2026-02-31')` normalizes to 2026-03-03 (`filing.service.ts:1078`), so the stored/DTO date can differ from the submitted one.
- `importAssessmentSchema` accepts a `taxYear` different from the workspace's (`filing.schema.ts:7-9`); `importAssessment` stores it (`filing.service.ts:1241-1245`), so the assessment row and workspace can disagree.
- `updateAssessmentFollowUpSchema` accepts `{}`; `updateAssessmentFollowUp` then writes a no-op audit row (`filing.service.ts:1157-1189`).
- A concurrent duplicate `recordFiling` passes the `existing` check (`:1068`) and hits the unique at `:1074`; Prisma `P2002` is not mapped, so the loser gets 500 rather than the documented 400 (data integrity holds).
- A failed `getAssessment` in `loadAssessment` is silent (`AssessmentView.tsx:78-84`); the user cannot distinguish “no assessment” from a failed read.

## 5. Review scope and not covered

**Checked against the task baseline:** the six VERIFY items, the API-6 acceptance in `audit/audit-api.md` and the PROD-6 acceptance in `audit/audit-product.md`; the implementation claims in `audit/impl-api6.md` and `audit/impl-api6-ui.md`.

**Read:** both implementation reports; `schema.prisma`; the new migration and the init/notification migrations; `filing.service.ts`, `filing.controller.ts`, `return-approvals.service.ts`, `return-approvals.module.ts`, `filing.module.ts`, `calculations.service.ts` and its module, `assessment-dates.ts`; `packages/contracts/src/{enums,filing,index}.ts`; `packages/validation/src/{filing.schema,index}.ts`; `packages/api-client/src/client.ts`; `AssessmentView.tsx`, `FilingPackageView.tsx`, `dashboard/page.tsx`; the module wiring for facts/documents/questionnaire/calculations.

**Executed (this review):**

- Nine spec files via `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test …` → `tests 188`, `pass 188`, `fail 0`.
- `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` → exit 0.
- `node .tools/syntax_check.cjs` → 45/45 `ok`, exit 0.
- `tsc -p tmp/tsconfig.probe-api6.json` and `tsc -p tmp/tsconfig.probe-api6-view.json` → exit 0 (the view probe uses React/JSX stubs, not real `@types/react`).
- `ts.transpileModule` on `AssessmentView.tsx` and `FilingPackageView.tsx` → `ok` (the 45-file sweep does not include `AssessmentView.tsx`).
- `prisma validate` on a temporary copy of the schema with a `url` added (BOM-free) → “The schema … is valid”.
- `prisma migrate diff --from-empty --to-schema-datamodel` on that copy → the generated `filing_records` DDL, unique/index names, FK actions and the four `assessments` columns match `migration.sql`.
- Read-only DB check against the app's default `postgresql://postgres@localhost:5432/luxtax`: `_prisma_migrations` does not exist (`P1014`) and `public.filing_records` does not exist (a `DO` block raising if it did completed without error). The migration is unapplied.

**Not covered / limits:**

- No `@prisma/client` and no `apps/api/node_modules`; the API cannot be started, so no endpoint request, no status-code observation, no `$transaction`/FK behavior, no audit-row inspection, no 403/400 runtime check.
- The project Postgres data directory has no `postmaster.pid` (cluster down); the reachable server has no migrated schema. The migration was not applied (correctly — review is read-only) and the SQL was compared statically/generated, not executed.
- No browser, no `next build`/`next dev`; no screenshot. The UI findings are code-level. The probes prove the code's own types, not real React prop validity.
- The 188 tests do not cover `recordFiling`, the freeze guards, the assessment persistence/update endpoint, or the UI. They cover the pure date helper and the prior features; the central new behaviour has no runtime test.
- F2 is a static interleaving inferred from the absence of a transaction/lock around the read-check-write; it was not reproduced on a running database.
- The 45-file syntax sweep excludes `AssessmentView.tsx`; it was transpiled separately (syntax only, no type check against real React typings).
- Prior fixes are unchanged as far as the 188-test suite and the two probes show; no runtime regression test of the web app was possible.

**Summary:** `allPass: false`. The model, migration, normal filing path, sequential freeze guards, assessment dates and regression baseline are sound. The two blockers are the stale-year `AssessmentView` state (wrong dates/flags can be written to a new year's assessment; the old filing card is visible under the new year) and the filing/invalidation TOCTOU (a filed version's approvals can be superseded and the active version moved past it). The remaining items are UX/state-machine hardening and observations, not reasons to reject the normal path.