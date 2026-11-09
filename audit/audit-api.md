# API / Data / Security audit — Luxembourg personal tax workspace

Date: 2026-11-08
Scope: `apps/api` (NestJS/Fastify/Prisma), `packages/contracts`, `packages/validation`, `apps/api/test`.
Plan baseline: `luxembourg-personal-tax-app-plan.md` §6.3, §6.6, §7.5–7.9, §13, §14.5, §15, §17, §20.2, Phase 1.
Mode: read-only. This file is the only write.

---

## 0. Method and verification limits

**What was done.** Every one of the eight checks was traced from route → controller → service → Prisma model. No capability was accepted because a DTO or enum name exists; each was followed until either a query, a write, or an explicit absence.

**Hard limit on execution.** `.tools` provides TypeScript only. There is no `@prisma/client`, no `apps/api/node_modules`, and no Postgres in this environment (`Test-Path node_modules\@prisma\client` → False). Therefore the API could not be started, migrated, or exercised. All API findings are static-reading findings; every one is anchored to a line that can be re-read.

**Baseline checks run.**

| Check | Command | Result |
|---|---|---|
| Baseline typecheck | `node .tools\node_modules\typescript\bin\tsc -p tsconfig.test.json` | exit 0 |
| Typecheck scope | read of `tsconfig.test.json` | includes only `contracts`, `tax-engine`, `filing/annex-pdf.builder.ts`, `test/annex-pdf.spec.ts` |
| API typecheck scope | read of `tsconfig.api.json` | includes only `calculations/**`, `filing/**`, `freelance/**` of the API |
| Presence probes | `Select-String` over `apps`, `packages`, `contracts`, `validation` | see per-check counts |

The 48-test baseline (41 engine + 7 annex PDF) contains **no API test**. The six `*.e2e-spec.ts` files are outside both committed tsconfigs and require a live database, so "48 tests pass" says nothing about the behaviour audited below. This is itself a quality-gate finding (API-10).

---

## 1. Verdict table

| # | Check | Plan | Verdict | Strongest evidence |
|---|---|---|---|---|
| 1 | Notification persistence/delivery/preferences | 7.9, Phase 1 | **Missing** | no `Notification` model; zero matches in `apps`, `packages` |
| 2 | Scenario comparison | 7.6 | **Missing** | only `POST calculate` + `GET calculation`; no `Calculation` model |
| 3 | Document visibility / private-draft enforcement | 6.3 | **Incorrect** | `/facts` returns every fact to every member; calc keys on `isIncludedInReturn` only |
| 4 | Version history, package hash, evidence index, transfer guide | 7.7, 13 | **Partial** | guide real; history endpoint absent; hash overwritten; no evidence index |
| 5 | Assessment follow-up / objection dates | 7.8 | **Partial** | numeric comparison real; no dates, no filing record, `FILED` never set |
| 6 | Approval invalidation on material change | 6.6 | **Partial** | fires on fact CRUD only; questionnaire/doc changes bypass it |
| 7 | Audit immutability + cross-household isolation | 17, 20.2 | **Incorrect** | any user can read all-household audit; no DB immutability; 4 e2e routes |
| 8 | Rate limiting, MFA/passkeys, session hardening | 17.1, Phase 1 | **Missing / Partial** | deps declared but never registered; no MFA; 7-day refresh token in localStorage |

---

## 2. Findings

### API-1 — Any self-registered taxpayer has full platform-admin power, including a read of every household's audit log

- **Status:** incorrect
- **Priority:** P0
- **Plan:** §17.1 "Least-privilege role and object-level access"; §5.2 "Administrative role does not imply access to taxpayer documents"; §14.5 "APIs require object-level authorisation checks"; §17.5

**Evidence.**

`apps/api/src/modules/admin/admin.controller.ts:38-39` guards the whole admin surface with authentication only:

```ts
@Controller('api/admin')
@UseGuards(JwtAuthGuard)
```

No `HouseholdGuard`, no role decorator, no admin claim. There is no platform role anywhere in the data model — `apps/api/prisma/schema.prisma:9-19` defines only `HouseholdRole { PRIMARY_FILER, CO_FILER, VIEWER }`, and `apps/api/src/common/decorators/roles.decorator.ts` is never applied to a handler.

**Household roles are unenforced too.** A search for `@Roles(` finds only the definition (`roles.decorator.ts:5`) and the guard's reflective read (`household.guard.ts:59-60`) — not one controller applies it. So `VIEWER` can upload documents, confirm facts and approve a return exactly like a filer, contrary to §5.1 and §5.2. The role branch in the guard is dead code.

The consequence is not theoretical. Any account can call:

- `PUT api/admin/model-routes/:id` (`admin.controller.ts:130`) → repoint the extraction route to an attacker-controlled endpoint, so subsequent taxpayer documents are sent there;
- `POST/PUT/DELETE api/admin/models` (`admin.controller.ts:68,84,102`) → register or delete providers, changing `permittedDataClass`;
- `GET api/admin/audit` (`admin.controller.ts:153-163`) → the handler calls `getAdminAudit`, which is an unscoped query over the whole table (`apps/api/src/modules/admin/admin.service.ts:901-907`):

```ts
const events = await this.prisma.auditEvent.findMany({
  take: limit, skip: offset, orderBy: { createdAt: 'desc' },
});
```

The response includes `householdId`, `actorEmail`, `ipAddress` and `description` (`admin.service.ts:909-919`). Descriptions carry amounts, e.g. `Approvals invalidated due to material change: Fact updated: grossSalary changed from … to … EUR` (`apps/api/src/modules/facts/facts.service.ts:337`).

**The test suite encodes the vulnerability as expected behaviour.** `apps/api/test/admin-governance.e2e-spec.ts:26` registers an ordinary user, and the same token is then used for `GET /api/admin/overview` (`:53-60`), `GET /api/admin/audit` (`:164-171`), `POST /api/admin/models` (`:180-198`) and `DELETE /api/admin/models/:id` (`:273-293`). No test asserts 403 for a non-admin.

**Why it matters.** This is a cross-household confidentiality breach through the audit log and a remote data-exfiltration path through model routes — both reachable by anyone who can register. It also directly contradicts §5.2 and the §20.3 gate "known cross-household access vulnerability".

**Proposal.**
1. Add a platform role (`User.platformRole` or a `PlatformGrant` table with `role`, `scope`, `expiresAt`, `reasonCode`) per §5.1's nine roles.
2. Introduce `PlatformRoleGuard`; apply to every `api/admin/*` route; keep `JwtAuthGuard` too.
3. Scope `getAdminAudit` to nothing by default — require an explicit, time-bound, reason-coded grant for cross-household audit reads, and return redacted descriptions (`actorEmail`, `ipAddress` hidden without elevated access).
4. Split model administration from audit review into distinct roles (§5.1 separates "Model administrator" and "Security/compliance auditor").
5. Add negative tests: a plain taxpayer gets 403 on every admin route; an admin gets 200; a `VIEWER` gets 403 on upload, fact confirmation and approval.

**Acceptance.**
- `GET/POST/PUT/DELETE /api/admin/**` returns 403 for a freshly registered user, 200 only for the matching platform role.
- A `VIEWER` membership cannot upload, confirm a fact, or approve a return; each returns 403.
- `GET /api/admin/audit` as a plain user is impossible at the guard layer, not by response filtering.
- A test proves a model-route change by an unauthorised user is rejected and audited as a denied attempt.

---

### API-2 — Private drafts leak to the co-filer through `/facts`, and calculations consume them without any sharing or validation gate

- **Status:** incorrect
- **Priority:** P0
- **Plan:** §6.3 (visibility table and the "explain before a private document is used in a joint calculation" rule); §17.5 "Require explicit sharing before private drafts join a return"; §20.2 "Private document cannot influence a joint calculation before sharing"

**Evidence.**

The visibility table has five states (`apps/api/prisma/schema.prisma:67-73`) and `packages/contracts/src/enums.ts:27-32` exposes all five. Only the document list honours any of them:

`apps/api/src/modules/documents/documents.service.ts:189-196`
```ts
OR: [
  { uploaderId: currentUserId },
  { visibility: { in: [DocumentVisibility.SHARED_FOR_DISCUSSION, DocumentVisibility.INCLUDED_IN_RETURN] } },
],
```

That filter is the *only* visibility check in the codebase. Three concrete defects follow.

**(a) Facts are never filtered.** `apps/api/src/modules/facts/facts.service.ts:38-44`:
```ts
this.prisma.extractedFact.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } }),
…
this.prisma.confirmedFact.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' } }),
```
`getFactsForWorkspace(workspaceId)` takes no user id (`facts.service.ts:25`), and the controller passes only the workspace (`facts/facts.controller.ts:27-31`). Spouse B therefore reads every extracted field and `sourceSnippet` of Spouse A's `PRIVATE_DRAFT` document — the exact content the document list hides one endpoint earlier. `ConfirmedFact.isSharedWithHousehold` exists (`schema.prisma:377`) and is written (`facts.service.ts:129`), but is never read by any query.

**(b) Calculation ignores document visibility.** `apps/api/src/modules/calculations/calculations.service.ts:75-77`:
```ts
confirmedFacts: { where: { isIncludedInReturn: true } },
```
and `isIncludedInReturn` defaults to `true` on confirmation (`facts.service.ts:130`). Nothing links a document's visibility to whether its facts may enter a joint return. The `PROPOSED_FOR_RETURN` state — the plan's gate where "only after validation policy passes" — has **zero references outside the enum** (`Select-String` over `apps`, `packages`, `contracts`, `validation`: one hit, `contracts/src/enums.ts:30`).

**(c) The API lets the client set both the owner and the visibility at upload.** `documents.service.ts:93` (`ownerId: input.ownerId || uploaderId`) and `:102` (`visibility: input.visibility || PRIVATE_DRAFT`), with `ownerId` and `visibility` accepted straight from the body (`packages/validation/src/document.schema.ts:17-21`). A user can upload directly as `INCLUDED_IN_RETURN`, skipping the sharing prompt, or attribute the document to another user id.

**Worse than a no-op:** setting `PROPOSED_FOR_RETURN` removes the document from the spouse's list, because the filter at `documents.service.ts:194` does not include it — the opposite of the §6.3 table, where that state is visible to the spouse. `ARCHIVED` likewise becomes invisible to everyone including the uploader's spouse, though §6.3 says "according to prior sharing".

**What the e2e test actually proves.** `apps/api/test/tax-lifecycle-full.e2e-spec.ts:222-224` asserts the document list is empty for Spouse B. Then `:226-240` shares it only as `SHARED_FOR_DISCUSSION`, and `:244-300` confirms its facts against the same workspace. The plan says that state must not be used in calculation; the test never asserts a calculation excludes it, and the subsequent calculation includes it. So the test covers the list endpoint and leaves the actual invariant unverified.

**Proposal.**
1. Make fact reads owner-aware: for `PRIVATE_DRAFT` documents, return facts to the uploader/owner only; filter `extractedFacts` by joining `document.visibility`.
2. Gate confirmation and calculation on visibility: a fact may be `isIncludedInReturn` only if its source document is `PROPOSED_FOR_RETURN` (after a policy check) or `INCLUDED_IN_RETURN`; otherwise force `isIncludedInReturn = false` or reject.
3. Implement the transition rather than the enum value: `PRIVATE_DRAFT → SHARED_FOR_DISCUSSION → PROPOSED_FOR_RETURN → INCLUDED_IN_RETURN`, with an explicit acknowledgement event when a private document is promoted, and a `validationPassedAt`/`validationPolicyVersion` record.
4. Add `PROPOSED_FOR_RETURN` to the spouse-visible filter; decide `ARCHIVED` explicitly (store `sharedBeforeArchive`).
5. Stop accepting `visibility` and `ownerId` from the upload body; default to `PRIVATE_DRAFT` and self-ownership, and expose promotion as a separate, audited endpoint.

**Acceptance.**
- Spouse B receives zero facts (extracted and confirmed) for any `PRIVATE_DRAFT` document, through every read path.
- A calculation never includes a fact whose source document is `PRIVATE_DRAFT` or `SHARED_FOR_DISCUSSION`; a test asserts both the exclusion and the resulting taxable income.
- Promoting a document writes an audit event and, for a joint return, a visible acknowledgement to the other filer.
- Upload with `visibility=INCLUDED_IN_RETURN` or a foreign `ownerId` is rejected.

---

### API-3 — Cross-workspace write through `confirmFact`, and a fail-open household guard

- **Status:** incorrect
- **Priority:** P1
- **Plan:** §14.5 "Knowing a UUID must never be sufficient to access an object"; §15.2; §17.1 object-level access

**Evidence.**

`apps/api/src/modules/facts/facts.service.ts:100-116`:
```ts
if (input.extractedFactId) {
  const extracted = await this.prisma.extractedFact.findUnique({ where: { id: input.extractedFactId } });
  if (extracted) {
    sourceDocumentId = extracted.documentId;
    await this.prisma.extractedFact.update({ where: { id: input.extractedFactId }, data: { isConfirmed: true, … } });
  }
}
```
The only check is that the row exists — not that `extracted.workspaceId === workspaceId`. A member of household A who learns an extracted-fact UUID from household B can mark it confirmed in B's workspace and attach B's `documentId` to a `ConfirmedFact` created in A's workspace (`:118-131`). That is a cross-tenant write plus a reference to another tenant's document.

The guard compounds this. `apps/api/src/common/guards/household.guard.ts:30-44`:
```ts
if (!householdId && (request.params.workspaceId || request.body?.workspaceId)) {
  const ws = await this.prisma.taxYearWorkspace.findUnique({ where: { id: wsId }, select: { householdId: true } });
  if (ws) householdId = ws.householdId;
}
if (!householdId) {
  // If no household ID is in the route, skip check or fail safe
  return true;
}
```
It fails **open**: an unknown workspace id, a route without `:id`/`:workspaceId`, or a body without `householdId` passes the guard. Today most services then 404, but the pattern means any future route keyed only on `documentId`/`factId`/`assessmentId` is unauthenticated by default. It also means the guard is not a substitute for the object-level check that §14.5 demands.

**Proposal.**
1. In `confirmFact`, reject when `extracted.workspaceId !== workspaceId` (and when the extracted fact's document is private to another user — see API-2).
2. Change the guard to deny by default: if a household-scoped route cannot resolve a household, throw `ForbiddenException`, not `return true`. Add an explicit `@Public()`/`@NoHousehold()` decorator for the few routes that legitimately have no household.
3. Apply a shared `assertWorkspaceAccess(user, workspaceId)` helper in services so object-level checks do not depend on route shape.

**Acceptance.**
- Supplying another household's `extractedFactId` returns 404/403 and leaves the foreign row unmodified; covered by an e2e test.
- `HouseholdGuard` returns 403 when the workspace id is unknown; a unit test asserts no path returns `true` without a resolved membership.

---

### API-4 — Notifications do not exist: no persistence, no delivery, no preferences, no security alerts

- **Status:** missing
- **Priority:** P1
- **Plan:** §7.9 (11 event types; "Users must control ordinary email and push notifications"); Phase 1 "Add notification foundation"

**Evidence.**

- **No model.** `apps/api/prisma/schema.prisma` has no `Notification`, `NotificationPreference`, `NotificationChannel` or `DeliveryAttempt` model; the full model list is lines 136-593.
- **No module.** `apps/api/src/app.module.ts:18-31` registers 13 feature modules; none is notification-related. There is no `apps/api/src/modules/notification*` directory.
- **No code.** A literal search for `notification`/`Notification` across `apps`, `packages`, `contracts`, `validation` returns exactly one hit, and it is prose inside a deadline description: `apps/api/src/modules/admin/admin.service.ts:342` ("…within 3 months of notification"). `push`, `email` and `delivery` have no infrastructure either.
- **Closest artefact is a task table, not a notification.** `MissingInformationItem` (`schema.prisma:404-422`) has `taskType`, `severity`, `isResolved`, `assignedToUserId` — no channel, no sent-at, no read-at, no preference, no digest. It cannot represent "spouse changed a material field", "approval requested", "approval invalidated", "filing package generated", "assessment follow-up due", or "new device".
- **Security alerts are impossible even in principle.** `session.create` stores only `userId`, `refreshTokenHash`, `expiresAt` (`apps/api/src/modules/auth/auth.service.ts:46-52`); the `userAgent` and `ipAddress` columns exist in the model (`schema.prisma:163-164`) but are never written, so "new device" cannot be detected.
- **The deadline taxonomy is static data, not a scheduler.** `admin.service.ts:307-344` returns four hardcoded `TaxDeadlineDto` rows with fixed dates; nothing schedules or emits anything from them.

**Proposal.**
1. Add `Notification` (id, userId, householdId, workspaceId, type, payload, createdAt, readAt, dedupeKey) and `NotificationPreference` (userId, channel, category, enabled) with an explicit non-overridable set for security/legal notices per §7.9.
2. Add an outbox (`NotificationOutbox` or a job) so delivery is retryable and auditable; record `sentAt`, `failedAt`, `attempts`.
3. Emit from the existing domain points: invitation (`households.service.ts:176`), approval and invalidation (`filing.service.ts:130`, `facts.service.ts:334`), package generation (`filing.service.ts:493`), assessment import (`filing.service.ts:581`), deadline jobs.
4. Persist `userAgent`/`ipAddress` when creating a session so a new-device alert has data.
5. Notification payloads must be reference-only (ids + type), never amounts or document names — §17.1 mobile payload rule.

**Acceptance.**
- A spouse invitation, an approval request, an approval invalidation and a package generation each produce exactly one persisted notification for the correct recipients, and a preference-off user receives none on that channel.
- Security notices ignore user preferences and are still delivered.
- No notification payload contains an amount, a matricule, or a document name.

---

### API-5 — Approval invalidation is partial: only fact edits invalidate; questionnaire and sharing changes do not; stale calculations can be approved

- **Status:** partial
- **Priority:** P1
- **Plan:** §6.6 (1 new version, 2 supersede, 3 explain, 4 re-approve); §13.1 (`Approved → NeedsReview: Material change`); §20.3 "Broken approval invalidation" gate

**Evidence.**

The invalidation routine is real and correct in shape — `apps/api/src/modules/facts/facts.service.ts:294-341` finds active approvals, sets `isSuperseded`, `supersededAt`, `supersedingReason`, moves the workspace to `NEEDS_REVIEW`, increments `activeReturnVersion`, and writes an `APPROVAL_INVALIDATED` audit event. But it is invoked from exactly three places, all in the facts service: `:136` (confirm), `:210` (update), `:270` (delete).

Not invoked from:

- **Questionnaire changes.** `apps/api/src/modules/questionnaire/questionnaire.service.ts:56-86` upserts `TaxProfile` (marital status, children, assessment mode, mortgage flags, foreign income…) and never touches approvals. Marital status and children are the most material facts in the return; changing them after both spouses approved leaves both approvals valid.
- **Document sharing changes.** `documents.service.ts:228-280` changes visibility with no invalidation, although promoting a document into the return changes what the return contains.
- **Freelance profile/fact writes.** `apps/api/src/modules/freelance/freelance.service.ts` creates documents and confirmed facts (`:419`, `:452`) directly via Prisma, bypassing `FactsService` and therefore the invalidation call.

Two further defects inside the mechanism:

- **Stale calculation can be approved.** `filing.service.ts:31-75` snapshots `workspace.confirmedFacts` and `workspace.calculationResult` into a new `ReturnVersion` without any check that the calculation was produced from those facts. If a fact changes and the user does not press calculate, the new version pairs new facts with the old calculation, and both spouses can approve it.
- **Superseded approvals can be revived.** `filing.service.ts:77-96` upserts with `update: { isSuperseded: false, supersededAt: null, supersedingReason: null }`. Combined with `activeReturnVersion` increments happening only inside `invalidateApprovalsIfAny` (`facts.service.ts:322-328`), an approval row can be un-superseded in place, erasing the fact that it was ever invalidated.

**Proposal.**
1. Route every material mutation through one `invalidateApprovals(workspaceId, reason, actor)` service — questionnaire, document visibility promotion, freelance fact creation, assessment import.
2. Store a `factsFingerprint`/`calculationId` on `ReturnVersion` and refuse approval when the current facts/campaign fingerprint differs from the calculated one (`409 RECALCULATION_REQUIRED`).
3. Never mutate `isSuperseded` back to `false`; create a new approval row (the current unique `[returnVersionId, userId]` forces the upsert — relax it or version the approval).
4. Increment `activeReturnVersion` for every material change, not only when approvals already exist, so version numbers match history.

**Acceptance.**
- Changing marital status or children count after dual approval moves the workspace to `NEEDS_REVIEW` and marks both approvals superseded, with an audit event naming the field.
- Promoting a document to `INCLUDED_IN_RETURN` after approval does the same.
- Approving without recalculating after a fact change is rejected.
- A superseded approval can never become active again; history shows the supersession.

---

### API-6 — Assessment module has no filing record and no follow-up/objection dates; `FILED` is unreachable

- **Status:** partial
- **Priority:** P1
- **Plan:** §7.8 (record filing date and route; store submission confirmation; upload assessment; track follow-up and objection dates; freeze the filed return and assessment pair); §13.1 (`FilingPackageReady → Filed → Assessed`)

**Evidence.**

The comparison half is real: `apps/api/src/modules/filing/filing.service.ts:517-590` computes declared vs assessed income and tax, builds `AssessmentComparisonDiscrepancy[]`, persists an `Assessment`, and sets the workspace to `ASSESSED` (`:574`). The model (`schema.prisma:477-492`) holds `bulletinDate`, `assessedTaxableIncome`, `assessedTaxDue`, `differenceWithDeclared`, `discrepanciesJson`.

What is absent:

- **No follow-up or objection date.** `Select-String` for `objection` returns 0 hits across the repo; `Assessment` has no `followUpDueAt`, `objectionDeadline`, `objectionFiledAt`, or `professionalReviewRequestedAt`. §7.8's "track follow-up and objection dates" is not implemented anywhere except as a static deadline row (`admin.service.ts:337-344`).
- **No filing record.** There is no `SubmissionRecord` model and no `filedAt`, `filingRoute`, `confirmationReference`, or `confirmationDocumentId`. §7.8's first two bullets and the §15.1 `SubmissionRecord` entity are missing.
- **`FILED` is never set.** A search for `WorkspaceStatus.FILED` across `apps/api/src` returns 0 hits. The filing service writes `FILING_PACKAGE_READY` (`:486`) and `ASSESSED` (`:574`) but never `FILED`. The §13.1 transition `FilingPackageReady → Filed: User records submission` has no implementation, so the state machine jumps.
- **No freeze.** `ReturnVersion.isFrozen` (`schema.prisma:428`) is only ever read (`filing.service.ts:146`, `:703`); it is never set to `true`. Deleting documents, editing facts, or re-importing an assessment after filing remains possible at the API layer. §7.8 "Freeze the filed return and assessment pair" and §17.5 "Lock filed snapshots from deletion" are unmet.
- **Assessment is not linked to an uploaded document.** The import accepts JSON numbers only (`filing.service.ts:526-538`); there is no `documentId`, so the official bulletin cannot be evidenced from the assessment row.

**Proposal.**
1. Add `SubmissionRecord` (workspaceId, returnVersionId, filedAt, route enum, confirmationRef, confirmationDocumentId, recordedBy) and a `POST /returns/:id/submission` endpoint that moves the workspace to `FILED` and sets `isFrozen`.
2. Add `followUpDueAt` and `objectionDeadline` to `Assessment`, computed from `bulletinDate` under a versioned rule (do not hardcode a legal duration — reference the rule package), plus `objectionFiledAt` and `professionalReviewRequestedAt`.
3. Link `Assessment.documentId` to the uploaded bulletin and store the extraction run that produced the numbers.
4. Block fact/document mutation, recalculation and package regeneration for a frozen version; require an explicit amendment flow that creates a new version.
5. Emit a notification when a follow-up date approaches (see API-4).

**Acceptance.**
- After recording a submission, `GET /workspace` reports `FILED`, the return version is frozen, and a fact edit returns `409`.
- Importing an assessment produces non-null `followUpDueAt` and `objectionDeadline`, and rejects an assessment whose bulletin date precedes the filing date.
- The assessment row points at the uploaded bulletin document.

---

### API-7 — Filing package can be generated without full approval, its hash is overwritten on regeneration, and the evidence index and mapping version are absent

- **Status:** partial
- **Priority:** P1
- **Plan:** §7.7 ("Produce an evidence index"; "Record form template and mapping versions"; "Hash generated outputs"); §13.2 Level 1 ("Require final household approval")

**Evidence.**

**(a) No approval gate.** `filing.service.ts:182-193` checks only that a calculation and a return version exist:
```ts
if (!workspace || !workspace.calculationResult) throw new BadRequestException('Workspace does not have a calculated return');
…
if (!returnVersion) throw new BadRequestException('No return version found. Approve the return first.');
```
The message says "approve first", but the condition is existence, not approval. In a joint household where only Spouse A has approved, status is `HOUSEHOLD_REVIEW` (`:116-119`) and a package is still generated and the workspace is forced to `FILING_PACKAGE_READY` (`:484-487`). No check reads `returnVersion.approvals`.

**(b) The hash is not an integrity guarantee.** `filing.service.ts:463` computes `packageSha256` over the payload, then `:465-486` **upserts**:
```ts
update: { form100BoxesJson: …, annexesJson: …, myGuichetGuideJson: …, packageSha256 },
```
Regenerating the package for the same return version silently replaces the hash. `ReturnVersion.generatedPackageHash` (`schema.prisma:431`) — the field that would anchor the hash to the version — is never written anywhere (`Select-String`: one hit, the schema). There is also no `mappingVersion`/`formVersion` on `FilingPackage` (`schema.prisma:461-475`), so §7.7's "record form template and mapping versions" is unmet.

**(c) No evidence index.** `FilingPackageDto` (`packages/contracts/src/filing.ts:60-73`) has boxes, annexes, guide and hash — no ordered list of supporting documents with page references. The annex list does not assemble anything: every entry is `produced: false` (`filing.service.ts:326-378`), i.e. a data sheet rather than a generated annex/supporting bundle. §7.7's "Assemble supporting documents in a controlled order" and "Produce an evidence index" have no implementation.

**(d) The field-transfer guide is real** — `myGuichetGuide` is built with five sections and actual field values from the mapped boxes (`filing.service.ts:393-460`) — but it has no "fields the application could not complete" list; the closest signal is the per-annex boolean.

**(e) The admin form registry contradicts the filing mapper.** `admin.service.ts:287-305` returns a constant `FORM_100` mapping with `boxNumber: '101' = GROSS_SALARY_PRIMARY`, `'103' = SOCIAL_CONTRIBUTIONS`, `'105' = WITHHOLDING_TAX_PAID`. The filing service explicitly documents the opposite at `filing.service.ts:200-203`: "101/103/105 are modele 160 salary-certificate codes, not Form 100 cases". `/admin/forms` is therefore stale/wrong as a mapping registry, and since nothing consumes it, the "mapping version" is decorative.

**Proposal.**
1. Require `status === APPROVED` (or explicit approvals from all required filers for the exact version) before generation; return `409` otherwise.
2. Write `ReturnVersion.generatedPackageHash` at generation and make the package insert-only: a regeneration creates a new `ReturnVersion`, never an update of the existing package.
3. Add `formTemplateVersion`, `mappingVersion`, and `evidenceIndexJson` (ordered document id → annex → page → fields) to `FilingPackage`; generate the support bundle or mark the package incomplete.
4. Add `unmappedFields[]` to the package and surface it in the guide.
5. Delete or correct the `/admin/forms` constant so one mapping source of truth exists; have the generator read the registry and record its version.

**Acceptance.**
- Generating a package with one of two required approvals returns 409.
- Regenerating produces a new version with a new hash; the previous hash remains retrievable and unchanged.
- The package exposes an evidence index covering every supporting document, and a template/mapping version.
- `/admin/forms` and the generated boxes agree on the meaning of 101/103/105.

---

### API-8 — No rate limiting, no MFA/passkeys, weak session hardening — although Phase 1 requires all three

- **Status:** missing (rate limiting, MFA) / partial (sessions)
- **Priority:** P1
- **Plan:** §17.1 "MFA/passkey support", "Rate limiting and abuse controls", "Secrets manager rather than environment files"; Phase 1 "Implement identity, MFA/passkeys, and sessions"

**Evidence.**

- **Dependencies present, never used.** `apps/api/package.json:24-26` declares `@fastify/helmet`, `@fastify/rate-limit` and `@fastify/static`. `apps/api/src/main.ts:10-14` constructs the adapter with only a logger; a search for `helmet|rate-limit|RateLimit` across `apps/api/src` returns **0 hits**. Login and register (`auth.controller.ts:30-53`) are therefore unthrottled: unlimited password guessing, unlimited account creation, unlimited refresh attempts.
- **No MFA and no passkey.** `mfa`, `passkey`, `totp`, `webauthn` searches return 0 real hits (the `mfa` matches are the substring in `confirmFact`). `User` (`schema.prisma:136-158`) has `passwordHash` only — no second factor, no recovery codes, no credential table.
- **Hardcoded JWT fallback secret.** `apps/api/src/modules/auth/auth.service.ts:34-36` and `apps/api/src/modules/auth/jwt.strategy.ts:20-22`:
  ```ts
  secret: process.env.JWT_ACCESS_SECRET || 'dev_luxembourg_tax_jwt_access_secret_32chars_min_2026'
  ```
  A deployment that forgets the variable runs with a public secret; `.env.example` also defines `JWT_REFRESH_SECRET`, which no code reads. This contradicts §17.1's secrets-manager rule.
- **Session records are thin.** `auth.service.ts:46-52` stores no user agent, no IP, no device label, so sessions cannot be listed, recognised, or revoked per device. Refresh rotation is implemented (`:189-193`), which is good, but there is no reuse detection: a replayed rotated token simply fails, with no alert or family revocation.
- **Refresh token lives in `localStorage`.** `apps/web/src/lib/auth-context.tsx:45-46` stores both access and refresh tokens in `localStorage` with a 7-day refresh lifetime (`auth.service.ts:43-44`). Any XSS yields a 7-day credential. No `HttpOnly`/`Secure` cookie path exists.
- **No reauthentication for membership changes.** `households.service.ts:135-190` (invite) and `:230-285` (accept) never re-verify the password, contrary to §17.5 "Reauthenticate before adding or removing a spouse".
- **Invitation is not bound to the invited account.** `acceptInvitation` (`households.service.ts:230-285`) checks token, expiry and `acceptedAt`, but never compares `invitation.invitedEmail` with the accepting user's email. A forwarded token lets any account join, and the upsert re-activates a previously `REMOVED` membership.

**Proposal.**
1. Register `@fastify/helmet` and `@fastify/rate-limit` globally; add stricter per-route limits on `auth/login`, `auth/register`, `auth/refresh`, invitation acceptance, and document upload.
2. Add TOTP + WebAuthn/passkey: `UserMfaCredential` table, enrolment/verification endpoints, recovery codes, and an `mfaRequired` claim enforced at login.
3. Remove the fallback secret; fail fast when `JWT_ACCESS_SECRET` is absent (and either use or delete `JWT_REFRESH_SECRET`). Move secrets to a manager per §17.1.
4. Persist `userAgent`/`ipAddress` on session creation; add `GET/DELETE /api/auth/sessions`; add refresh-token reuse detection with family revocation.
5. Move refresh tokens to `HttpOnly; Secure; SameSite` cookies (or a BFF), shorten absolute lifetime, and add reauthentication for invite/accept/remove.
6. Bind invitation acceptance to `invitedEmail` (case-insensitive) and require an explicit re-activation flow for `REMOVED` members.

**Acceptance.**
- The 11th login attempt in a minute from one IP receives 429; a test covers it.
- A user without a second factor cannot reach a protected route once MFA is enabled for the account.
- Starting the API without `JWT_ACCESS_SECRET` exits non-zero.
- Session list shows device/IP; revoking one device invalidates only that session.
- Accepting an invitation with a different account email returns 403.

---

### API-9 — Scenario comparison and calculation history do not exist

- **Status:** missing
- **Priority:** P2
- **Plan:** §7.6 ("Comparison with previous calculation version"; "Joint/individual scenario comparison only where legally supported"); §15.1 `Calculation` entity; audit backlog P2

**Evidence.**

- **Two routes only.** `apps/api/src/modules/calculations/calculations.controller.ts:22-34` exposes `POST api/workspaces/:workspaceId/calculate` and `GET …/calculation`. There is no `/scenarios`, `/compare`, or variant parameter.
- **No scenario service.** A literal `scenario` search returns 2 hits, both test names in `packages/tax-engine/test/tax-engine.spec.ts:274,648`. No DTO, no validation schema, no table.
- **No calculation entity.** The plan's `Calculation` model (§15.1) does not exist in `schema.prisma`; calculations are a single mutable JSON column `TaxYearWorkspace.calculationResult` (`schema.prisma:274` region; read at `calculations.service.ts:88-95`). Each calculate overwrites the previous result, so "comparison with previous calculation version" has nothing to compare against at the API layer. Only an approved `ReturnVersion.calculationSnapshotJson` survives, and only one is reachable (API-10 / API-7).
- **What is real:** the estimate itself, with `rulePackageVersion` and `calculatedAt` (`packages/contracts/src/tax.ts:221,275`; engine `packages/tax-engine/src/engine.ts:1127,1178`), the breakdown, withholding and balance. §7.6's estimate bullets are largely met; the comparison and scenario bullets are not.

**Proposal.**
1. Add a `Calculation` table (id, workspaceId, version, factsFingerprint, rulePackageVersion, resultJson, createdAt, createdBy) and write one row per calculation; expose `GET /calculations` and `GET /calculations/:id`.
2. Add `POST /api/workspaces/:id/scenarios` accepting an overrides object (assessment mode, class, a named set of fact deltas), computing without persisting to the live workspace, returning both results plus a diff.
3. Restrict scenario types to those the engine marks supported; surface `unsupported` rather than inventing outcomes.
4. Show the diff in the estimate view with the rule-package versions of both sides.

**Acceptance.**
- Two sequential calculations are both retrievable and diffable.
- A joint/individual scenario returns two labelled results with the same rule-package version and an explicit list of differing inputs.
- An unsupported scenario returns a documented "not supported" result, not a number.

---

### API-10 — Audit is append-only by convention only, uses the wrong event types, swallows failures, and the e2e isolation suite covers 4 routes

- **Status:** partial
- **Priority:** P2
- **Plan:** §6.5 (event content), §17 "immutable audit", §17.4 (logging), §20.2 ("Rule-package update does not alter a filed historical calculation"; "Support agent cannot read a taxpayer PDF by default"), Phase 1 exit "Cross-household access tests pass"

**Evidence.**

**(a) Immutability is application-level only.** `AuditService` (`apps/api/src/modules/audit/audit.service.ts:27-64`) exposes create and read; no update or delete route exists. But the table has no database guard: `apps/api/prisma/migrations/20261108000000_init/migration.sql:318-335` creates `audit_events` with a primary key and nothing else — no trigger, no `REVOKE UPDATE, DELETE`, no hash chain, no `previousEventHash`. Anything with the DB role can rewrite history. The e2e suites themselves delete audit rows in cleanup (`apps/api/test/household-collaboration.e2e-spec.ts:40-45`; `cross-household-isolation.e2e-spec.ts:73-80`), which demonstrates the capability.

**(b) Tenant attribution is destructible.** `schema.prisma:511-512` sets `onDelete: SetNull` for `household` and `workspace`, mirrored by `migration.sql:581-584`. Deleting a household erases the tenant link from every historical event, so the audit trail can no longer answer "which household" — exactly the field §6.5 requires.

**(c) Event taxonomy is misused.** Admin model operations write audit rows directly, with unrelated types and no household:
`apps/api/src/modules/admin/admin.service.ts:406-413` → `eventType: AuditEventType.FACT_CREATED` for "Registered custom AI model";
`admin.service.ts:573-580` → `eventType: AuditEventType.DOCUMENT_DELETED` for "Deleted custom AI model".
Document visibility changes are logged as `FACT_UPDATED` (`documents.service.ts:257`), so a sharing change is indistinguishable from a fact edit.

**(d) Audit failure is non-fatal.** `admin.service.ts:405-406,572-573` wrap the audit write in `try { … } catch { console.warn(…) }`. A material admin action can succeed with no record. §6.5 and §17.4 assume material events are always recorded.

**(e) Event content is thinner than §6.5.** `AuditEvent` (`schema.prisma:494-517`) has actor, entity, old/new value, description, IP, user agent, timestamp. It lacks request/correlation id, source interface, model/prompt/schema version, reason/comment, and an explicit "approval invalidated" link. §6.5 lists all of them.

**(f) The e2e isolation suite is narrow.** `apps/api/test/cross-household-isolation.e2e-spec.ts:108-129` contains exactly four assertions: `GET /api/households/:id`, `GET /api/households/:id/workspaces/2025`, `POST /api/households/:id/invitations`, `GET /api/households/:id/activity`. It does **not** test documents, facts, calculations, filing packages, assessments, return versions, or the admin surface — and the admin surface is where the actual leak is (API-1). A second suite, `household-collaboration.e2e-spec.ts:96-221`, walks the happy path but asserts no denial. So the Phase 1 exit criterion "Cross-household access tests pass" is supported for four routes out of roughly thirty.

**(g) The tests are outside the green baseline.** `tsconfig.test.json` includes only `contracts`, `tax-engine`, `filing/annex-pdf.builder.ts` and `test/annex-pdf.spec.ts`; `tsconfig.api.json` includes only `calculations`, `filing`, `freelance`. None of the six e2e specs is typechecked or counted in the 48 passing tests, and they require a live Postgres.

**Proposal.**
1. Add a DB-level append-only guarantee: revoke `UPDATE`/`DELETE` on `audit_events` from the app role, or a trigger that raises on both; add `previousEventHash` + `eventHash` for tamper evidence.
2. Change `onDelete` to `Restrict` for `householdId`/`workspaceId`, or store a denormalised `householdRef` that survives deletion.
3. Add dedicated event types (`AI_MODEL_REGISTERED`, `AI_MODEL_DELETED`, `AI_ROUTE_UPDATED`, `DOCUMENT_VISIBILITY_CHANGED`) and forbid direct `prisma.auditEvent.create` outside `AuditService`.
4. Make audit writes transactional with the material change; a failure aborts the operation.
5. Add `requestId`, `source`, `modelVersion`/`promptVersion`, `reason` to the model and populate them (§6.5).
6. Expand the isolation suite to every workspace-scoped route, with a second household and a viewer-role user, and include it in CI (or document it as a manual gate).

**Acceptance.**
- `UPDATE audit_events` and `DELETE FROM audit_events` fail at the DB level.
- Deleting a household is blocked while audit rows reference it.
- A model registration appears as `AI_MODEL_REGISTERED` with a request id; a failed audit write rolls back the registration.
- An e2e test enumerates every route with a foreign household id and asserts 403/404.

---

## 3. What is real vs. constant vs. missing (module ledger)

| Module / capability | Verdict | Note |
|---|---|---|
| Auth (register/login/refresh/logout) | **Real** | argon2id, hashed refresh tokens, rotation (`auth.service.ts:75-79,189-193`); no MFA, no throttle |
| Sessions | **Real but thin** | table + rotation; no device metadata, no listing, no reuse detection |
| Households + invitations | **Real** | single-use token, 72 h expiry, hashed (`households.service.ts:156-172`); no email binding, no removal endpoint, no reauth |
| Workspaces | **Real** | CRUD + readiness; readiness counts are constants (below) |
| Documents | **Real, partial** | hashing, dedupe, local storage, AI extraction; no download endpoint at all, no signed URLs, no malware/type sniffing |
| Document visibility | **Partial / incorrect** | 3 of 5 states have behaviour; `PROPOSED_FOR_RETURN` and `ARCHIVED` are dead or inverted |
| Facts | **Real, incorrect scoping** | CRUD + audit + invalidation hook; reads unfiltered, foreign `extractedFactId` accepted |
| Questionnaire / missing-info engine | **Real, partial** | 4 of 9 §7.5 rules implemented (`questionnaire.service.ts:141-204`); no foreign-income, wrong-year, conflict, ownership-total, post-approval-change rules |
| Calculations | **Real** | deterministic engine, rule-package version, `calculatedAt`; no history, no scenarios |
| Approvals | **Real, partial** | per-version upsert, joint logic; no state guard, no role guard, stale calc accepted, revival bug |
| Filing package | **Real, partial** | sheet-level Form 100 mapping, annex list, MyGuichet guide, SHA-256; no approval gate, mutable hash, no evidence index, no mapping version |
| Assessments | **Real, partial** | numeric compare + discrepancies; no dates, no document link, no freeze |
| Audit | **Real, convention-only immutability** | append-only API, no DB guard, misused types, swallowed failures |
| Notifications | **Missing** | no model, module, preference, or delivery |
| Admin governance | **Mostly constants** | see below; the only real parts are the `custom_ai_*` tables and the test-connection probe |
| Rate limiting / MFA / passkeys | **Missing** | dependencies declared, never registered; no second factor |

### Modules that return constants

| Endpoint | Constant | Consequence |
|---|---|---|
| `GET /api/admin/overview` | `activeTaxYears: [2025]`, `activeRoutesCount` falls back to `5` (`admin.service.ts:248-251`) | dashboard reports invented capacity |
| `GET /api/admin/tax-rules` | one literal package `pkg-lux-2025-v1`, checksum over a hand-written JSON string (`admin.service.ts:257-285`) | not the engine's rule package; "immutable rule package" is a fiction |
| `GET /api/admin/forms` | literal `FORM_100` boxes 101/103/105 (`admin.service.ts:287-305`) | contradicts `filing.service.ts:200-203` |
| `GET /api/admin/deadlines` | four fixed dates (`admin.service.ts:307-344`) | no scheduler reads them |
| `GET /api/admin/evaluations` | literal evaluation runs (`admin.service.ts:860-…`) | "golden benchmark results" are fabricated |
| `GET /api/households/:id/workspaces/:year/readiness` | `criticalWarningsCount: 0`, `missingDocumentsCount: 0`, `unconfirmedFactsCount: 0` (`workspaces.service.ts:129-131`) | three of the five readiness signals are hardcoded zeros, although tasks and facts are available |
| `POST /api/workspaces/:id/freelance/demo` | seeds fake documents/facts as `INCLUDED_IN_RETURN` with `/tmp/...` paths (`freelance.service.ts:224-455`) | demo data can enter a real return and a real package |

---

## 4. Test coverage of the audited behaviour

| Plan §20.2 case | Covered? | Where |
|---|---|---|
| Spouse A invites B, both collaborate | Yes (happy path) | `household-collaboration.e2e-spec.ts:96-221` |
| Each spouse uploads private and shared documents | Partial — only A uploads | `tax-lifecycle-full.e2e-spec.ts:172-240` |
| Private document cannot influence a joint calculation before sharing | **No** — list visibility only; facts are not checked | `tax-lifecycle-full.e2e-spec.ts:222-224` |
| Spouse B sees who changed a field and its previous value | **No** — activity is read, but no previous-value assertion after a change by B | `household-collaboration.e2e-spec.ts:186-220` |
| Both approve the same return version | Yes | `tax-lifecycle-full.e2e-spec.ts:337-356` |
| Material change invalidates both approvals | Partial — fact edit only; asserts `APPROVAL_INVALIDATED` exists, not that both rows are superseded or the version changed | `tax-lifecycle-full.e2e-spec.ts:358-389` |
| Duplicate document does not double-count | Yes (upload rejected) | `tax-lifecycle-full.e2e-spec.ts:206-215` |
| Support agent cannot read a taxpayer PDF by default | **No** — no support role, no test | — |
| Cross-household isolation | Partial — 4 routes only | `cross-household-isolation.e2e-spec.ts:108-129` |
| Admin least privilege | **Inverted** — a plain user is used as admin | `admin-governance.e2e-spec.ts:26-60` |
| Rule-package update does not alter a filed historical calculation | **No** — no test, and no immutability guard | — |

---

## 5. Out-of-scope observations (recorded, not scored)

1. `apps/api/src/modules/users/users.service.ts` has no account export or deletion endpoint, so §17.2 access/export/deletion and the §20.2 export case have no implementation.
2. `HouseholdsService.createHousehold` hardcodes `taxYear: 2025` (`households.service.ts:58`); a new household cannot start in another year without a second workspace.
3. Documents have no read/download route at all (`documents.controller.ts` has POST/GET list/PATCH visibility/DELETE), so §17.1's "short-lived signed document URLs" has nothing to protect yet; uploads are base64 JSON with a client-declared MIME type (`document.schema.ts:6-16`) and no size cap or magic-byte check.
4. `POST /api/workspaces/:id/freelance/demo` is a demo seeder reachable in production by any member; it writes confirmed facts without the facts service, so no invalidation and no audit event per fact.
5. `GET /api/households/invitations/:token/details` is unauthenticated by design and returns household name, invited email and role to any holder of the token.

---

## 6. Checks run (reproducible)

```
# structure
Get-ChildItem -Recurse apps/api/src -Filter *.ts          # 49 files, module map
Select-String apps/api/prisma/schema.prisma '^(model|enum) '
Get-ChildItem apps/api/prisma/migrations -Recurse

# capability probes (counts)
notification|Notification  -> 1 hit, prose in admin.service.ts:342
scenario|Scenario          -> 2 hits, tax-engine test names only
throttl|rateLimit|helmet   -> 0 hits in apps/api/src
mfa|passkey|totp           -> 0 real hits (mfa matches "confirmFact")
objection                  -> 0 hits
evidenceIndex              -> 0 hits
isFrozen                   -> 4 hits, all reads
generatedPackageHash       -> 1 hit, schema only
WorkspaceStatus.FILED      -> 0 hits
PROPOSED_FOR_RETURN        -> 1 hit, enum only

# behaviour traces
documents.service.ts:89-104, 189-196, 228-280
facts.service.ts:25-46, 100-131, 294-341
calculations.service.ts:69-80
filing.service.ts:31-133, 164-196, 463-495, 517-590, 674-750
questionnaire.service.ts:56-86, 102-230
admin.controller.ts:38-39, 68-163
admin.service.ts:233-344, 348-440, 901-920
household.guard.ts:27-44
auth.service.ts:32-57, 189-193 ; jwt.strategy.ts:16-24

# tests
apps/api/test/*.e2e-spec.ts  (6 suites, assertions read in full)
```

**Verification status of each finding:** API-1, API-2, API-3, API-7, API-8, API-10 are confirmed by direct code reading of both the caller and the callee. API-4, API-5, API-6, API-9 are confirmed by absence — exhaustive literal searches over `apps`, `packages`, `contracts`, `validation`, plus the model list — which is weaker than a failing test but sufficient for a "missing" verdict. No finding depends on runtime behaviour that could not be read.
