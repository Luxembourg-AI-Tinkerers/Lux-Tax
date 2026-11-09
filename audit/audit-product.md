# Product / Web gap audit — Luxembourg personal-tax workspace

**Audit date:** 2026-11-08
**Repository:** `B:\B\tax-app` (branch `master`, base commit `cfba2c8`; audited with the working-tree changes present)
**Scope:** product and web gaps against `luxembourg-personal-tax-app-plan.md` §§ 6, 7.1–7.9, 8.1–8.12, 13.1–13.3 and Phase 3–6; the files named in the brief (`apps/web/src/app/(workspace)/[householdId]/dashboard/page.tsx`, every file under `apps/web/src/components`, `apps/web/src/lib/api.ts`, `packages/contracts/src/*.ts`, `packages/api-client/src/client.ts`) plus the API code needed to decide whether a feature is *backend-only*, *UI-only* or *absent end to end*.
**Out of scope:** mobile client (plan 8.4–8.13), admin console (plan 16), tax-engine arithmetic, legal values.
**Method:** static reading of current code and contracts. No browser run and no database was exercised, so the findings are code-level; runtime claims are limited to what the code makes unavoidable. Evidence tier is `T1` (current repo code), `T2` (plan as product intent), `T3` (README). No web sources were used.

---

## 1. Verdict summary

Of the eight requested checks:

| # | Check | Verdict | Finding(s) | Priority |
|---|---|---|---|---|
| 1 | Scenario comparison (Class 2 vs 2× Class 1, Art. 3ter) — plan 7.6 | **Missing** (engine primitives only) | PROD-7 | P2 |
| 2 | Notification centre + user notification preferences — plan 7.9 | **Missing end to end** | PROD-8 | P2 |
| 3 | Household member management + permission UI — plan 6 | **Partial / permissions unenforced** | PROD-2 | P1 |
| 4 | Document visibility states + sharing UI — plan 6.3 | **Incorrect** (privacy boundary not enforced) | PROD-1 | P0 |
| 5 | Version history, approval invalidation, hash, evidence index, field-transfer guide — plan 7.7 / 13 | **Partial** (hash + guide work; history + evidence index missing) | PROD-3, PROD-4 | P1 |
| 6 | Prior-year rollover + reconfirmation UI — plan 7.8 / Phase 6 | **Incorrect** (silent reuse) | PROD-5 | P1 |
| 7 | Assessment follow-up + objection dates — plan 7.8 | **Missing** (only manual import/compare exists) | PROD-6 | P1 |
| 8 | TODO / dead button / static-only view | **No TODO markers; five dead or unwired surfaces** | PROD-9, PROD-10 | P2 |

The most serious defect is **PROD-1**: a “private draft” is not a privacy boundary. A co-filer can read the extracted amounts of the other filer’s private-draft documents through the facts API, and a private draft’s figure can be confirmed into the joint return without the plan-6.3 warning or validation gate. The second most serious is **PROD-2**: a `VIEWER` can approve a return and is counted as a required approver, because `@Roles()` is never applied.

---

## 2. Findings

Each finding states the fact, the evidence (file:line, with a short quote), the evidence tier, the layer status (backend / API / UI), and a testable acceptance criterion.

### PROD-1 — “Private draft” is not enforced; private-document amounts leak to the co-filer and can enter the joint return

**Status:** `incorrect` · **Priority:** `P0` · **Confidence:** high (T1 code; T2 plan 6.3)
**Layer status:** backend stores 4 of the 5 states and filters the document list, but **facts are not filtered**; API has a visibility PATCH; web UI is inconsistent and one-way.

**Fact.**
Plan 6.3 defines five states and an explicit rule: private draft is *not* visible to the spouse and *not* used in calculation; “proposed for return” **is** visible to the spouse. The implementation breaks both sides of that contract:

1. `GET /workspaces/:id/documents` excludes `PROPOSED_FOR_RETURN` from the spouse’s result set, so a document proposed for the return becomes *less* visible than a merely shared one:
   ```ts
   // apps/api/src/modules/documents/documents.service.ts:189-195
   OR: [
     { uploaderId: currentUserId },
     { visibility: { in: [DocumentVisibility.SHARED_FOR_DISCUSSION, DocumentVisibility.INCLUDED_IN_RETURN] } },
   ],
   ```
2. `GET /workspaces/:id/facts` returns **every** extracted and confirmed fact in the workspace with no document-visibility or owner predicate:
   ```ts
   // apps/api/src/modules/facts/facts.service.ts:38-45
   this.prisma.extractedFact.findMany({ where: { workspaceId }, ... })
   this.prisma.confirmedFact.findMany({ where: { workspaceId }, ... })
   ```
   The web UI then renders every unconfirmed extracted fact, with amount and source snippet, in the “Extracted Figures Awaiting Your Confirmation” list (`apps/web/src/components/DocumentsView.tsx:297-330`). A spouse therefore sees the private draft’s amounts even though the document row is hidden.
3. Confirming a fact never checks the source document’s visibility, and defaults it into the return:
   ```ts
   // apps/api/src/modules/facts/facts.service.ts:118-130
   sourceDocumentId,
   isSharedWithHousehold: input.isSharedWithHousehold ?? true,
   isIncludedInReturn: input.isIncludedInReturn ?? true,
   ```
   The calculation then consumes all confirmed facts with `isIncludedInReturn` (`calculations.service.ts:75-77`, `:107-114`). The web confirm handler sends both flags as `true` unconditionally (`DocumentsView.tsx:193-194`). There is no plan-6.3 warning (“its relevant information and evidence will become visible to the co-filer”) and no validation-policy step.
4. The two upload surfaces disagree. The file picker hardcodes `SHARED_FOR_DISCUSSION` and offers no choice:
   ```tsx
   // apps/web/src/components/DocumentsView.tsx:62-67
   visibility: DocumentVisibility.SHARED_FOR_DISCUSSION,
   ```
   The camera modal defaults to `INCLUDED_IN_RETURN` before any validation and offers only three states:
   ```tsx
   // apps/web/src/components/CameraScanModal.tsx:24
   const [visibility, setVisibility] = useState<DocumentVisibility>(DocumentVisibility.INCLUDED_IN_RETURN);
   // :305-309 — “Include in Return”, “Share with Spouse”, “Private Draft”
   ```
5. The visibility button is a one-way ratchet, not a state machine:
   ```tsx
   // apps/web/src/components/DocumentsView.tsx:120-124
   const nextVis =
     doc.visibility === DocumentVisibility.PRIVATE_DRAFT
       ? DocumentVisibility.SHARED_FOR_DISCUSSION
       : DocumentVisibility.INCLUDED_IN_RETURN;
   ```
   `INCLUDED_IN_RETURN` can never go back; `ARCHIVED` and `PROPOSED_FOR_RETURN` are unreachable from any upload or toggle.
6. The visibility change is audited with the wrong event type (`FACT_UPDATED`), so the activity feed cannot answer “who shared this document?”:
   ```ts
   // apps/api/src/modules/documents/documents.service.ts:257
   eventType: AuditEventType.FACT_UPDATED,
   ```
7. README contradicts the code: “Taxpayers can mark uploaded receipts and documents as private drafts before sharing them with a co-filing spouse” (`README.md:234`). Through the local-file upload path they cannot.

**Evidence tier.** T1 for code; T2 for plan 6.3 (`luxembourg-personal-tax-app-plan.md:210-220`); T3 for README.

**Proposal.**
1. Add one server-side policy function `canSeeDocument(document, viewerId)` and use it in both document and fact queries; filter extracted and confirmed facts by the source document’s visibility and owner.
2. Reject `confirmFact` with `403` when the source document is a private draft owned by another user; require an explicit share/propose action first.
3. Replace the ratchet with an explicit five-state menu; allow downgrade and archive; require confirmation when leaving `INCLUDED_IN_RETURN`.
4. Default every upload to `PRIVATE_DRAFT` or require an explicit choice; make both upload surfaces use the same component.
5. Audit visibility changes as a dedicated event (e.g. `DOCUMENT_VISIBILITY_CHANGED`) and record previous/new state.
6. Implement the plan-6.3 pre-use notice before a private document’s value is used in a joint calculation.

**Acceptance.**
- A private draft uploaded by A does not appear in B’s `GET /documents`, `GET /facts` (extracted *and* confirmed), dashboard counts, or calculation payload.
- B receives `403` when confirming A’s private extracted fact.
- All five states are selectable from both upload surfaces; each transition is visible in the UI and audited with the correct event type.
- Before a private value enters a joint return, the UI shows the plan-6.3 visibility warning and records the acknowledgement.
- `README.md:234` is true or removed.

---

### PROD-2 — Household management is “invite only”; `VIEWER` is offered but has no permissions and is treated as a required approver

**Status:** `partial` · **Priority:** `P1` · **Confidence:** high (T1 code)
**Layer status:** backend has memberships, invitations and a `Dependant` model; **no member-management endpoints**; web has only an invite modal + two read-only cards; **role enforcement is absent**.

**Fact.**

1. The only member surface is the two cards on the dashboard, and they look only for `PRIMARY_FILER` and `CO_FILER`:
   ```tsx
   // apps/web/src/app/(workspace)/[householdId]/dashboard/page.tsx:104-105
   const primaryFiler = members.find((m) => m.role === HouseholdRole.PRIMARY_FILER);
   const coFiler = members.find((m) => m.role === HouseholdRole.CO_FILER);
   ```
   A `VIEWER` invited through the modal is invisible on the card; the page then shows “No spouse linked yet” and prompts another invitation (`page.tsx:278-300`).
2. The invite modal offers a “Viewer (Read-only)” role:
   ```tsx
   // apps/web/src/components/InviteModal.tsx:120
   <option value={HouseholdRole.VIEWER}>Viewer (Read-only)</option>
   ```
   But the guard’s role check only runs when a `@Roles()` decorator is present:
   ```ts
   // apps/api/src/common/guards/household.guard.ts:59-67
   // Role check if @Roles() decorator is applied
   const requiredRoles = this.reflector.getAllAndOverride<HouseholdRole[]>(ROLES_KEY, ...);
   if (requiredRoles && requiredRoles.length > 0) { ... }
   ```
   A repo-wide search for `@Roles(` finds **no application of the decorator** (only the comment). Every ACTIVE member can therefore edit/delete facts, upload documents (and delete their own), save the questionnaire, approve the return, generate the package and import the assessment.
3. For a Class 2 return the approval gate treats every ACTIVE member, including a `VIEWER`, as a required approver:
   ```ts
   // apps/api/src/modules/filing/filing.service.ts:108-119
   const requiredMemberIds = workspace.household.members.map((m) => m.userId);
   const bothApproved = isJointFiling
     ? requiredMemberIds.every((id) => approvedMemberIds.includes(id))
     : approvedMemberIds.includes(userId);
   ```
   The filing view renders one approval card per member, so the viewer is shown as “Pending Approval” and must click approve for the return to become APPROVED (`FilingPackageView.tsx:150-199`).
4. There is no endpoint or UI to change a role, remove a member, revoke/resend an invitation, or manage dependants. `households.controller.ts` exposes only create / list / get / invite / invitation-details / accept (`:32-79`). `HouseholdInvitation.revokedAt` exists in the schema (`schema.prisma:237`) but no code writes it; `MEMBER_REMOVED` exists in the audit enum but is never emitted (`enums.ts:42`). The `Dependant` model exists (`schema.prisma:248-261`) and is read by the engine (`calculations.service.ts:72, 123`), but no controller or screen can create a dependant; the questionnaire only stores a `childrenCount` number (`QuestionnaireView.tsx:1036-1049`).
5. There is no Household navigation item at all; the dashboard tabs are Overview, Documents, Freelance, Facts, Questionnaire, Calculator, Filing, Assessment, Admin (`page.tsx:159-169`), versus plan 8.1’s “Household — Members, dependants, ownership, invitations, and permissions”.

**Evidence tier.** T1; plan 6.1 (`:189-208`), 5.2 (`:172-183`), 8.1 (`:435-452`).

**Proposal.**
1. Add `PATCH /households/:id/members/:userId` (role), `DELETE /households/:id/members/:userId` (soft removal → `REMOVED`, audit `MEMBER_REMOVED`), `POST /households/:id/invitations/:invitationId/revoke`, and dependant CRUD.
2. Add a Household screen/tab listing members (role, status, joined), pending invitations (expiry, revoke/resend), dependants, and ownership.
3. Apply `@Roles(PRIMARY_FILER, CO_FILER)` to all write/approve/filing endpoints; `VIEWER` becomes read-only at the API, not just in the label.
4. Define the required approver set as the filing members (PRIMARY/CO), not every ACTIVE membership; reject a VIEWER approval with `403`.
5. Either remove the `VIEWER` role (it is not in plan 5.1) or document and enforce it.

**Acceptance.**
- A `VIEWER` gets `403` on fact, document, questionnaire, approval, package and assessment mutations; read endpoints still work.
- A Class 2 household with one PRIMARY, one CO_FILER and one VIEWER becomes APPROVED after the two filers approve; the viewer is not listed as an approver.
- Removing a member sets `REMOVED`, emits `MEMBER_REMOVED`, and blocks future access without changing filed snapshots.
- Pending invitations and their expiry are visible and revocable; dependants can be added/edited without accounts.
- The dashboard no longer says “No spouse linked” when a VIEWER is present.

---

### PROD-3 — Approvals are invalidated in the database but the user cannot see why; there is no version history, and profile changes do not invalidate at all

**Status:** `partial` · **Priority:** `P1` · **Confidence:** high (T1 code)
**Layer status:** backend creates return versions and invalidates approvals on fact changes; **API returns only the active version and strips superseded approvals**; web has no history, no diff, and a dead “superseded” branch.

**Fact.**

1. `GET /return-version` always queries the single `activeReturnVersion`; there is no list endpoint:
   ```ts
   // apps/api/src/modules/filing/filing.service.ts:687-693
   const returnVersion = await this.prisma.returnVersion.findFirst({
     where: { workspaceId, versionNumber: workspace.activeReturnVersion }, ...
   });
   const activeApprovals = returnVersion.approvals.filter((a) => !a.isSuperseded);
   ```
   The response maps only `activeApprovals` (`:706-715`), so `ReturnVersionDto.approvals` can never contain an item with `isSuperseded: true`. The UI branch that is supposed to explain an invalidation is unreachable:
   ```tsx
   // apps/web/src/components/FilingPackageView.tsx:197-200
   {approvalRecord?.isSuperseded && (
     <p ...>⚠ Approval superseded: {approvalRecord.supersedingReason || 'Fact modified'}</p>
   )}
   ```
2. The version number is never rendered anywhere in the web app (repo-wide search for `versionNumber` in `apps/web/src` returns no match), and the package view shows no “version N” or “created at”. After a material change, `activeReturnVersion` is incremented and the workspace set to `NEEDS_REVIEW`:
   ```ts
   // apps/api/src/modules/facts/facts.service.ts:322-327
   data: { status: WorkspaceStatus.NEEDS_REVIEW, activeReturnVersion: { increment: 1 } }
   ```
   No `ReturnVersion` row exists for the new number until someone approves (`filing.service.ts:56-73`). `getReturnVersion` therefore returns `null`, the filing package returns `null`, and the Filing tab silently loses both the version and the package with no “invalidated because …” message.
3. Invalidation covers only `ConfirmedFact` create/update/delete (`facts.service.ts:136, 210, 270`). Changes to questionnaire answers that feed the engine do **not** invalidate: `saveProfile` only upserts the profile and recomputes readiness (`questionnaire.service.ts:71-88`). That includes `assessmentMode`/`reallocationPercentPrimary` (Art. 3ter), ages, `childrenCount`, travel units, invalidity rates, etc.
4. Recalculation of an APPROVED workspace keeps it APPROVED:
   ```ts
   // apps/api/src/modules/calculations/calculations.service.ts:217-221
   status: workspace.status === DRAFT || COLLECTING || NEEDS_REVIEW
     ? WorkspaceStatus.CALCULATED
     : workspace.status,
   ```
   And approval only checks that *some* calculation exists, not that it postdates the material change:
   ```ts
   // apps/api/src/modules/filing/filing.service.ts:52-54
   if (!workspace.calculationResult) throw new BadRequestException('Tax must be calculated before approving the return');
   ```
   A spouse can therefore re-approve a return whose `calculationSnapshot` predates the change; the version snapshot (`factsSnapshotJson`, `calculationSnapshotJson`) can be internally inconsistent.
5. Plan 6.6 requires “create a new return version; mark previous approvals as superseded; explain what changed; require approval again” (`:266-277`). Only the first two happen; the explanation and the re-approval guard are missing.

**Proposal.**
1. Add `GET /workspaces/:id/return-versions` (all versions, all approvals including superseded) and `GET /workspaces/:id/return-versions/:versionId/diff`.
2. Stop filtering superseded approvals in `getLatestReturnVersion`; render version number, status, timestamps, superseded reason and approver.
3. Invalidate approvals on any material input change: facts, questionnaire answers that feed the engine, and document visibility changes for documents used in the return. Set `NEEDS_REVIEW` and increment the version in one transaction.
4. Before approval, require `calculation.calculatedAt > lastMaterialChangeAt` and the workspace status to be `HOUSEHOLD_REVIEW`; otherwise return `409` with the reason.
5. Render a plain-language “what changed” summary (field, previous value, new value, actor, time) from the audit events between versions.

**Acceptance.**
- After changing a material fact or an engine-feeding questionnaire answer, the Filing tab shows “Version N+1 — approvals invalidated because …”; the previous version remains visible read-only with its superseded approvals.
- Approve is disabled/409 until a calculation newer than the change exists.
- The history lists every version, its approvals (including superseded), package hash and timestamps.
- The superseded approval card renders its reason (the current dead branch becomes reachable).

---

### PROD-4 — Filing package can be generated and marked ready with one spouse’s approval; evidence index, mapping/template versions and incomplete-field list are absent

**Status:** `partial` · **Priority:** `P1` · **Confidence:** high (T1 code)
**Layer status:** backend generates boxes/annexes/guide/hash; **no approval gate, no evidence index, no version metadata**; web renders boxes/annexes/guide/hash only.

**Fact.**

1. `generateFilingPackage` only requires a calculated workspace and a return-version row; it never checks `bothSpousesApproved`:
   ```ts
   // apps/api/src/modules/filing/filing.service.ts:186-194
   const returnVersion = await prisma.returnVersion.findFirst({ where: { workspaceId, versionNumber: ... } });
   if (!returnVersion) throw new BadRequestException('No return version found. Approve the return first.');
   ```
   It then sets the workspace to `FILING_PACKAGE_READY` unconditionally (`:484-486`). A single spouse’s approval (in a Class 2 household) creates the version (`:56-73`) and is enough to generate a package and move the return to “ready to file”. The UI button is always enabled (`FilingPackageView.tsx:225`).
2. The package contract has form boxes, annexes, a guide and a hash, but **no evidence index, no template version, no mapping version and no incomplete-field list**:
   ```ts
   // packages/contracts/src/filing.ts:61-72
   export interface FilingPackageDto {
     id; returnVersionId; taxYear; taxClass; generatedAt;
     form100Boxes: Form100BoxMapping[];
     annexes: AnnexRequestDto[];
     myGuichetGuide: MyGuichetStepGuide[];
     packageSha256: string;
   }
   ```
   The view renders the hash (`FilingPackageView.tsx:233`), the box table (`:242`), the annex preparation sheets (`:286-330`) and the MyGuichet guide (`:286`); it never renders a document/evidence index or an “unmapped fields” section.
3. Plan 7.7 requires “Produce an evidence index” (`:394`), “Show fields the application could not complete” (`:396`) and “Record form template and mapping versions” (`:397`). None exists in the DTO, API or UI.
4. README claims “evidence zip archives” and “missing-document checklists” in the filing package (`README.md:55`). There is no zip/archive code in the repo (repo-wide search for `zip`/`archive` returns no implementation) and no evidence list in the package.
5. There is no final-review acknowledgement before download; the view downloads/prints directly (`FilingPackageView.tsx:296-312`).

**Proposal.**
1. Gate `POST /filing-package` on `bothSpousesApproved` for the active version (and return `409` with which filer is missing), or explicitly decide that Level-1 packages may be prepared before the second approval but must not be marked `FILING_PACKAGE_READY`.
2. Extend `FilingPackageDto` with `evidenceIndex: { documentId, fileName, sha256, page, factIds }[]`, `templateVersion`, `mappingVersion`, `incompleteFields: { form100Box, label, reason }[]`, and `rulePackageVersion`.
3. Build the evidence index from confirmed facts → `sourceDocumentId` → `Document.sha256Hash`, including documents used by annexes.
4. Add a final-review checklist/acknowledgement before download and audit it.
5. Remove or implement the README “evidence zip” claim.

**Acceptance.**
- One approval → `POST /filing-package` returns `409` “second approval required” (or the package cannot reach `FILING_PACKAGE_READY`).
- The package view lists every source document with its hash/page and every required field the app could not complete.
- The DTO records form template version, mapping version and rule package version.
- Download requires an explicit final-review acknowledgement.

---

### PROD-5 — Rollover silently reuses prior-year answers as current-year answers; “reconfirmation” is copy only

**Status:** `incorrect` · **Priority:** `P1` · **Confidence:** high (T1 code)
**Layer status:** backend copies the profile; UI has a button and a confirm dialog; **no reconfirmation state, no provenance, no review screen**.

**Fact.**

1. `rollOverToNextYear` copies `answersJson` verbatim into the new year’s `TaxProfile`:
   ```ts
   // apps/api/src/modules/filing/filing.service.ts:634-652
   await this.prisma.taxProfile.create({
     data: {
       workspaceId: nextWorkspace.id,
       maritalStatus: currentWorkspace.taxProfile.maritalStatus,
       answersJson: currentWorkspace.taxProfile.answersJson as any,
     },
   });
   ```
   There is no `sourceYear`, no `prefilledFromPriorYear`, no `isConfirmed` per answer, and no status transition. The next-year questionnaire reads those answers as if the user had answered them for the new year (`questionnaire.service.ts:40-53`), and the calculator uses them immediately (`calculations.service.ts:88-116`).
2. The UI claims the opposite:
   ```tsx
   // apps/web/src/components/AssessmentView.tsx:105
   Copy reusable household data, dependants, and employer details into the {workspace.taxYear + 1} workspace. All data requires reconfirmation.
   ```
   There is no reconfirmation screen or flag anywhere. The only confirmation is the browser `confirm()` before the API call (`:59`).
3. The copy also overstates what is copied: facts are **not** rolled over (the method never reads `confirmedFacts`), so “employer details” are not carried unless the employer was only a questionnaire answer. Dependants are household-level and therefore shared, not copied.
4. Phase 6’s exit criterion is explicit: “Prior-year data can be proposed without being silently reused” (`:1718`); Phase 3 requires “answer provenance and prior-year status” (`:1645`). Neither is implemented. `QuestionnaireAnswersDto` has no provenance fields (`packages/contracts/src/questionnaire.ts:6-115`).

**Proposal.**
1. Store rolled answers as proposals (a `sourceTaxYear` + `status: PROPOSED | CONFIRMED` per answer, or a separate proposal table). Do not feed unconfirmed proposals into the engine.
2. Show a “Carried from 2025 — confirm” state on each section and a one-click confirm per section; record actor/time and audit it.
3. Either copy facts/employer data (as the copy claims) or change the copy to what is actually copied.
4. Add a rollover summary screen: what will be carried, what will not, and what needs new evidence.

**Acceptance.**
- A new year’s questionnaire shows carried answers as “pre-filled, unconfirmed”; the calculator ignores them until confirmed.
- Reconfirmation is recorded with user/time and appears in the activity feed.
- No prior-year answer is treated as current-year confirmed without an explicit action.
- UI copy matches the actual rollover payload.

---

### PROD-6 — Post-filing module is a manual three-field form: no assessment upload/extraction, no filing record, no follow-up/objection dates, no freeze

**Status:** `partial` · **Priority:** `P1` · **Confidence:** high (T1 code)
**Layer status:** manual import + comparison exist; **no document upload/extraction, no filing record, no deadline tracking, no freeze**.

**Fact.**

1. The assessment screen asks for a date, assessed income and assessed tax, then POSTs JSON:
   ```tsx
   // apps/web/src/components/AssessmentView.tsx:122-181
   // three inputs: bulletinDate, assessedTaxableIncome, assessedTaxDue
   ```
   The validation schema accepts only those fields plus optional notes:
   ```ts
   // packages/validation/src/filing.schema.ts:7-13
   taxYear, bulletinDate, assessedTaxableIncome, assessedTaxDue, notes?
   ```
   There is no file input, no document upload, no extraction, no confirmation of extracted values. Plan 7.8’s first two bullets (“Upload official assessment”, “Extract assessed amounts”) are absent (`:406-407`); only “Compare declared and assessed values” is implemented.
2. There is no filing record: `TaxYearWorkspace` has no `filedAt`, `filingRoute`, `submissionReference` or confirmation document (`schema.prisma:264-292`). `FILED` exists in the enum but is never set anywhere in application code (only enum/schema/migration). On assessment import the service jumps straight to `ASSESSED`:
   ```ts
   // apps/api/src/modules/filing/filing.service.ts:572-575
   data: { status: WorkspaceStatus.ASSESSED }
   ```
   Plan 7.8 requires “Record filing date and route; Store submission confirmation” (`:404-405`), and plan 13.1 has a `Filed` state with “User records submission” (`:1020-1022`).
3. No follow-up/objection dates. `AssessmentDto` has `bulletinDate`, `assessedTaxableIncome`, `assessedTaxDue`, `differenceWithDeclared`, `discrepancies`, `createdAt` only (`packages/contracts/src/filing.ts:82-92`); the UI shows no follow-up date, objection deadline or task. Plan 7.8 requires “Track follow-up and objection dates” (`:410`) and Phase 6 “Add follow-up tasks and deadlines” (`:1710`).
4. No freeze. `ReturnVersion.isFrozen` exists and defaults to false (`schema.prisma:428`) but no code ever sets it true; `Assessment` has no frozen flag. Plan 7.8 requires “Freeze the filed return and assessment pair” (`:412`), Phase 6 “Freeze closed tax years” (`:1711`), exit “Filed and assessed records remain immutable and reproducible” (`:1719`).
5. The only deadline text is admin-global, not per assessment: `admin.service.ts:342` describes the three-month reclamation window in a seeded deadline list; it is not linked to a workspace or assessment and does not create a task/notification.

**Proposal.**
- Reuse the document pipeline: upload the bulletin, extract income/tax/date, require confirmation, store `sourceDocumentId` on `Assessment`.
- Add `FiledRecord` (filedAt, route, confirmation document, official reference) and a “Record filing” action that sets `FILED`; only then allow assessment import to move to `ASSESSED`.
- Add follow-up/objection date fields and rule-package-driven calculation; create tasks/notifications when due.
- On `ASSESSED`/`CLOSED`, set `isFrozen` on the return version + assessment and block edits; expose a read-only historical view.
- Render the dates and status in `AssessmentView`.

**Acceptance.**
- A user can upload a bulletin PDF, confirm the extracted income/tax, and see the comparison.
- Recording a filing stores date/route/confirmation and moves the workspace to `FILED`.
- The assessment view shows follow-up and objection due dates and creates reminders/tasks.
- A closed year cannot be edited; the filed version and assessment are immutable and reproducible.

---

### PROD-7 — No scenario comparison UI or API (Class 2 vs 2× Class 1, or previous calculation)

**Status:** `missing` · **Priority:** `P2` · **Confidence:** high (T1 code)
**Layer status:** engine accepts `taxClass`/`assessmentMode`; **no comparison endpoint, DTO or UI**; only one latest calculation is stored.

**Fact.**

1. The calculation controller exposes exactly two routes:
   ```ts
   // apps/api/src/modules/calculations/calculations.controller.ts:22-33
   @Post('calculate') ... calculateTax(...)
   @Get('calculation') ... getLatestCalculation(...)
   ```
   There is no `/scenarios`, `/compare` or array-shaped result.
2. `TaxCalculationResultDto` carries a single `assessmentMode` and a single `taxClass` (`packages/contracts/src/tax.ts:217-222`), and `getLatestCalculation` returns only `workspace.calculationResult` (`calculations.service.ts:249-259`). No calculation history table or snapshot list exists.
3. The web calculator prints the mode as text but has no comparison state:
   ```tsx
   // apps/web/src/components/TaxCalculatorView.tsx:303
   {calc.assessmentMode.replace('_', ' ')} · {calc.rulePackageVersion}
   ```
   The only “scenario” strings are the unsupported-scenario banner (`:79-82`).
4. The questionnaire offers a single global mode select:
   ```tsx
   // apps/web/src/components/QuestionnaireView.tsx:1004-1013
   <option value="COLLECTIVE">Collective (Class 2)</option>
   <option value="INDIVIDUAL_PURE">Individual, pure (Class 1 each)</option>
   <option value="INDIVIDUAL_REALLOCATION">Individual with reallocation</option>
   ```
   Changing it then re-calculating replaces the result; the user cannot see both outcomes.
5. Plan 7.6 requires “Comparison with previous calculation version” and “Joint/individual scenario comparison only where legally supported” (`:382-383`); Phase 4 lists “Add supported scenario comparison” (`:1670`). Neither is reachable.

**Proposal.**
- Add `POST /workspaces/:id/scenarios` accepting `{ scenarios: [{ key, taxClass, assessmentMode, reallocationPercentPrimary? }] }`, running the same engine with the same facts and returning `{ key, result, deltaVsBaseline }[]`; reject unsupported combinations with the engine’s `unsupported[]` reasons.
- Persist calculation snapshots (or at least hash + result JSON) so “previous calculation” is reproducible.
- Add a compare table/tabs in `TaxCalculatorView` for Class 2 vs 2× Class 1 and for current vs previous; label unsupported modes explicitly.

**Acceptance.**
- For a Class 2 household, the UI shows Class 2 vs 2× Class 1 (Art. 3ter) with taxable income, tax, credits, balance and delta.
- An unsupported combination is blocked with a reason, not approximated.
- The previous calculation can be selected and compared; both are reproducible from stored snapshots.

---

### PROD-8 — No notification centre and no notification preferences

**Status:** `missing` · **Priority:** `P2` · **Confidence:** high (T1 code)
**Layer status:** no model, no API, no UI. The only event surface is the 10-item audit feed.

**Fact.**

1. The schema has no `Notification` or `NotificationPreference` model; the model list ends with `CustomAiRoute` (`schema.prisma:539-574`). A repo-wide search for `notification` in `packages/contracts/src` and `packages/api-client/src` returns no domain type or method (the only web matches are the admin toast state, `AdminConsoleView.tsx:112-184`).
2. The dashboard calls the audit endpoint with `limit: 10` and renders it as “Immutable Household Activity Trail”:
   ```tsx
   // apps/web/src/app/(workspace)/[householdId]/dashboard/page.tsx:56
   apiClient.getAuditActivity(householdId, { limit: 10 }),
   // :370-390 — activity.map(...)
   ```
   This is an audit log, not a notification centre: no unread state, no per-user routing, no read/dismiss, no channels, no security alerts.
3. The nav has no Settings/privacy item (`page.tsx:159-169`), so there is no place to control ordinary email/push notifications.
4. Plan 7.9 enumerates 11 event types and requires “Users must control ordinary email and push notifications. Security notices and legally necessary service notices are handled separately.” (`:415-429`). None of the 11 is generated as a notification; approval-invalidated and assessment-follow-up events exist only as audit rows.

**Proposal.**
- Add `Notification` (recipient, type, payload, readAt, createdAt) and `NotificationPreference` (userId, channel, category, enabled) models.
- Add `GET /notifications`, `PATCH /notifications/:id/read`, `POST /notifications/read-all`, `GET/PATCH /users/me/notification-preferences`.
- Emit notifications at the 11 plan events: invitation, document confirmation, spouse material change, missing-document reminder, deadline, ready-for-review, approval requested, approval invalidated, package generated, assessment follow-up, security/new device.
- Add a header bell + notification centre and a Settings/privacy page; security/service notices are non-opt-out.
- On mobile, route push taps through the same notification IDs (out of scope here, but the API shape should support it).

**Acceptance.**
- Each of the 11 plan-7.9 events produces exactly one notification for the correct recipients.
- Users can opt out of ordinary email/push per category but not security/service notices.
- Unread count and mark-read persist; a notification deep-links to the relevant workspace object.
- A Settings page exists and reflects the stored preferences.

---

### PROD-9 — Dashboard fetches readiness but never renders it; a non-2025 household gets an empty workspace

**Status:** `partial` · **Priority:** `P2` · **Confidence:** high (T1 code)
**Layer status:** API returns `WorkspaceReadinessDto` (partly stubbed); web stores it and never uses it; year selection is hardcoded to 2025.

**Fact.**

1. `readiness` is fetched and stored:
   ```tsx
   // apps/web/src/app/(workspace)/[householdId]/dashboard/page.tsx:46
   const [readiness, setReadiness] = useState<WorkspaceReadinessDto | null>(null);
   // :71-73
   const readRes = await apiClient.getWorkspaceReadiness(householdId, selectedYear);
   if (readRes.data) setReadiness(readRes.data);
   ```
   A repo-wide grep finds no other `readiness` reference in the page. The overview renders `workspace.completionScore` instead (`:195-210`). Consequently, per-member readiness, `criticalWarningsCount`, `missingDocumentsCount`, `unconfirmedFactsCount`, `canCalculate`/`canApprove` and “items awaiting each spouse” are never shown, contrary to plan 8.2 (`:458-468`). The overview also lacks the filing deadline, approval states and the “one clear recommended next action” (`:458-468`).
2. The readiness endpoint is partly a stub: member readiness is the same overall score and three counts are hardcoded zero:
   ```ts
   // apps/api/src/modules/workspaces/workspaces.service.ts:119-133
   memberReadiness[member.userId] = workspace.completionScore;
   criticalWarningsCount: 0,
   missingDocumentsCount: 0,
   unconfirmedFactsCount: 0,
   ```
   Even if the UI rendered it, the numbers would be wrong.
3. The page initialises the year to 2025 and immediately fetches it, before looking at the workspace list:
   ```tsx
   // page.tsx:44
   const [selectedYear, setSelectedYear] = useState<number>(2025);
   // :68
   const wsRes = await apiClient.getWorkspace(householdId, selectedYear);
   ```
   If the household’s only workspace is 2026 (or 2024), `workspace` stays `null`; every data tab is guarded by `workspace &&` (`:398-440`), so the user sees an empty main area, while the header shows the hardcoded `selectedYear` because the selector is only rendered when `workspaces.length > 1` (`:123-136`).
4. The activity surface is only the last 10 events on the overview; there is no searchable Activity page required by plan 8.1 (`:449`).

**Proposal.**
- After `getWorkspaces`, select the requested year if present, else the newest available year; use `workspace.taxYear` for the header; show an explicit empty state with “create workspace”.
- Render the readiness payload: overall + per-member bars, critical warnings, missing documents, unconfirmed facts, canApprove, deadline, approval state, next action.
- Implement real counts in `getWorkspaceReadiness` from tasks/facts/documents instead of zeroes.
- Add an Activity tab/page with filters (actor, event type, date) backed by the existing audit API.

**Acceptance.**
- Dashboard shows readiness per member and correct counts from the DB (not 0).
- A household with only a 2026 workspace opens on 2026 and its tabs work.
- Deadline and approval state are visible without opening Filing.
- No fetched readiness field is unused; no hardcoded `selectedYear` in the request path.

---

### PROD-10 — Missing-information tasks are not assignable and have no comments; “assigned tasks” is unimplemented

**Status:** `partial` · **Priority:** `P2` · **Confidence:** high (T1 code)
**Layer status:** task generation and resolution exist; `assignedToUserId` is never set; no comments model/API/UI.

**Fact.**

1. The task DTO exposes `assignedToUserId` (`packages/contracts/src/questionnaire.ts:117-128`), and the model has the column (`schema.prisma:412`), but task creation never sets it:
   ```ts
   // apps/api/src/modules/questionnaire/questionnaire.service.ts:207-216
   await this.prisma.missingInformationItem.create({
     data: { workspaceId, taskType, severity, title, description, ... }
   });
   ```
   The mapping at `:256` returns `assignedToUserId: t.assignedToUserId`, which is always `null`.
2. The checklist UI offers one action per task, “Mark Resolved” (`QuestionnaireView.tsx:228-235`), and does not show an assignee or a comment thread. There is no comment model in the schema (`schema.prisma:404-422`), no comment endpoint, and no “my tasks / spouse’s tasks” filter.
3. Phase 3 explicitly requires “Add comments, assignments, and household activity feed” (`:1649`) and “Both spouses can see material changes and assigned tasks” (`:1658`). Only the audit feed exists; comments and assignments do not.

**Proposal.**
- Assign each generated task by rule: owner of the missing document/fact when known, otherwise the household; set `assignedToUserId`.
- Add a `TaskComment` model + `POST/GET /workspaces/:id/tasks/:taskId/comments`; render a thread and author/time.
- Add “My tasks” / “Spouse’s tasks” / “Household” filters and an assignee column; show overdue/age.
- Emit audit events for assignment and comment.

**Acceptance.**
- Every generated task has an assignee or an explicit “household” marker.
- Both spouses see tasks grouped by assignee; each can comment; resolving records actor/time.
- Assignment and comment events appear in the activity feed.
- A task’s assignee can be changed from the UI.

---

## 3. End-to-end matrix

| Capability | Backend | API client | Web UI | Verdict |
|---|---|---|---|---|
| Class 2 vs 2× Class 1 comparison | Engine accepts `taxClass` + `assessmentMode`; only one result stored | No scenario method | Single mode select; one result | **Missing** |
| Notification centre / preferences | No model | No method | No centre, no settings route | **Missing** |
| Household member management | Memberships, invitations, dependant model; no update/remove/revoke/dependant endpoints | Invite/get/accept only | Invite modal + two read-only cards | **Partial** |
| Permission enforcement | Guard supports `@Roles` but no route uses it | — | Viewer role offered, unenforced | **Incorrect** |
| Document visibility | 4 states stored; document list filter (excludes PROPOSED); facts unfiltered | Visibility PATCH | Upload hardcoded shared; one-way toggle; camera default included | **Incorrect** |
| Return version history | Rows exist; only active version queried | `getReturnVersion` only | No version number/history | **Partial** |
| Approval invalidation | Facts invalidate + increment version; questionnaire does not | No reason surfaced | Dead superseded branch; no what-changed | **Partial** |
| Package hash | SHA-256 computed | Returned | Displayed | **Works** |
| Field-transfer guide | MyGuichet steps generated | Returned | Rendered with copy buttons | **Works** |
| Evidence index | Not generated | Not in DTO | Not rendered | **Missing** |
| Mapping/template version | Not stored | Not in DTO | Not rendered | **Missing** |
| Rollover | Copies `answersJson` verbatim | `rolloverToNextYear` | Button + confirm; no reconfirmation | **Incorrect** |
| Assessment upload/extraction | Manual JSON only | `importAssessment(any)` | Three field form | **Missing** |
| Filing record / FILED | No fields; `FILED` never set | None | None | **Missing** |
| Follow-up/objection dates | No fields | None | None | **Missing** |
| Freeze filed/assessed pair | `isFrozen` never set | — | Not shown | **Missing** |
| Dashboard readiness | Endpoint returns stubbed counts | Fetched | Never rendered | **Partial** |
| Task assignment/comments | `assignedToUserId` never set; no comments | None | Mark resolved only | **Partial** |

---

## 4. Dead, unreachable or static-only UI

- **Unreachable branch:** `FilingPackageView.tsx:197-200` renders a superseded-approval warning, but `getLatestReturnVersion` strips superseded approvals at `filing.service.ts:693`; the branch can never be true.
- **Fetched but unused:** `WorkspaceReadinessDto` in `dashboard/page.tsx:46, 71-73`; the payload is never rendered.
- **Wrong-year dead end:** `dashboard/page.tsx:44, 68, 123-136`; a non-2025-only household gets `workspace = null` and empty tabs while the header shows 2025.
- **Silent failure:** the annex PDF download catches errors with `console.error` only (`FilingPackageView.tsx:298-303`); the user sees no failure message.
- **Print scope:** “Print” calls `window.print()` (`FilingPackageView.tsx:307-310`), printing the whole app shell rather than the package.
- **No TODO/FIXME/HACK/XXX** in `apps/web/src` (repo-wide grep). The gaps above are structural, not marked work.
- **Inconsistent default:** camera upload defaults to `INCLUDED_IN_RETURN` (`CameraScanModal.tsx:24`) while the file upload defaults to `SHARED_FOR_DISCUSSION` (`DocumentsView.tsx:65`); the plan’s privacy default is private draft.

**Doc-stale claims (README):**
- `README.md:55` — “evidence zip archives” and “missing-document checklists” in the filing package. No zip/archive code exists; the package DTO has no evidence list or checklist.
- `README.md:234` — “Taxpayers can mark uploaded receipts and documents as private drafts before sharing them”. The local-file upload path hardcodes shared and offers no private option; only the camera modal offers it.

---

## 5. Checks run

| Check | Command | Result |
|---|---|---|
| Typecheck (contracts + engine + tests) | `node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json` | exit 0 |
| JSX/TS syntax on touched API/UI files | `node .tools/syntax_check.cjs` | 9 files ok, exit 0 |
| Tax-engine suite | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts` | **41 pass, 0 fail** |
| Annex-PDF suite | `node .tools/node_modules/tsx/dist/cli.mjs --test apps/api/test/annex-pdf.spec.ts` | **7 pass, 0 fail** |
| Role enforcement | repo-wide grep for `@Roles(` | only a comment in `household.guard.ts:59`; no route applies it |
| Notifications | repo-wide grep for `notification` in `packages/contracts/src`, `packages/api-client/src`, schema model list | no domain model/method |
| Scenario comparison | repo-wide grep for `scenario` | only the “unsupported-scenario” banner in `TaxCalculatorView.tsx:79-82` |
| TODO markers | repo-wide grep for `TODO|FIXME|HACK|XXX` in `apps/web/src` | no matches |
| Evidence index / zip | repo-wide grep for `evidence`, `zip`, `archive` | no index or archive implementation; only UI copy |
| Lifecycle states | repo-wide grep for `FILED`, `isFrozen` | `FILED` only enum/schema; `isFrozen` only read, never written |

**Note on the engine command:** without `--tsconfig tsconfig.test.json`, `tsx` cannot resolve `@luxtax/contracts` and the suite fails at import. With the project tsconfig it passes 41/41, matching the stated baseline.

---

## 6. Out-of-scope observations (suggestions only)

These are recorded because they affect the same surfaces, but they were not scored as findings because the relevant plan sections are outside the requested read scope.

1. **Admin console is reachable by every taxpayer.** The dashboard shows an “Admin & Models” tab to all users (`dashboard/page.tsx:168`), and every `/api/admin/*` route is protected only by `JwtAuthGuard`, with no role check (`admin.controller.ts:38-40`). This is a product/security issue for plan 16, not a plan-7/8 gap.
2. **No admin/role model exists.** `HouseholdRole` is the only role enum; there is no platform administrator role. The admin API therefore cannot distinguish a taxpayer from an administrator.
3. **Mobile client not audited.** Plan 8.4–8.13 (native capture, secure storage, push routing, deep links, offline queue) was not inspected; no claim is made about it.
4. **No runtime UI test.** The audit is static; a browser run could reveal additional disabled-state or layout issues, but cannot change the absence findings.

---

## 7. Open questions / product decisions needed

1. **Is `VIEWER` an intended product role?** It is not in plan 5.1’s role table. If it is intended, it needs enforcement and a UI; if not, remove it from the invite modal and the enum.
2. **What is the intended `PROPOSED_FOR_RETURN` transition?** Plan 6.3 says “only after validation policy passes”, but the validation policy is not defined. The implementation should decide whether proposal is a filer action, an automatic step after fact confirmation, or both.
3. **Should a Level-1 filing package be generatable before both approvals?** The current code allows it and marks the workspace ready; plan 7.7/Phase 5 imply both spouses approve the same immutable version before the package is ready. This is a product decision, but the current state is inconsistent with the plan’s exit criteria.
4. **Is the evidence index expected inside a zip, a PDF, or the package JSON?** README says “evidence zip archives”; the code has none. Decide the artifact shape before implementing.
5. **Does “prior-year data proposed” mean per-answer proposals or a section-level confirmation?** Phase 6 says “prior-year data can be proposed without being silently reused”; the current `answersJson` copy cannot express either.

---

## 8. Bottom line

- **Do not ship the joint-household privacy story yet.** PROD-1 and PROD-2 are the two findings that can produce a wrong outcome for a real household: a private draft is readable by the co-filer, and a read-only viewer can approve a tax return.
- **The filing lifecycle is close but not trustworthy.** Hash and MyGuichet guide work; version history, the invalidation explanation, the evidence index and the two-approval gate do not.
- **Scenario comparison and notifications are genuinely absent**, not merely hidden; both need a data model/API before UI work.
- **Rollover is the highest-risk “looks done” feature**: the button works, the copy promises reconfirmation, and the code silently reuses last year’s answers in the current-year calculation.
