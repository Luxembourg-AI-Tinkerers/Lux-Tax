# Database codemap

**Last updated:** 2026-11-19
**Engine:** PostgreSQL 15+ (verified on 18.4)
**ORM:** Prisma 7.10 with `@prisma/adapter-pg` and `pg`
**Schema:** `apps/api/prisma/schema.prisma`
**Connection:** `apps/api/prisma.config.ts` reads `DATABASE_URL`. The Prisma 7 CLI rejects a `url` in the datasource block.
**Migrations:** 23 committed under `apps/api/prisma/migrations/`

---

## Entity-relationship overview

```
User 1─1 PersonProfile
User 1─* Session
User 1─* HouseholdMembership *─1 Household
User 1─* HouseholdInvitation (inviter)  *─1 Household
Household 1─* Dependant
Household 1─* TaxYearWorkspace
Household 1─* AuditEvent
Household 1─* Notification
Household 1─* NotificationPreference *─1 User

TaxYearWorkspace 1─* Document 1─* DocumentExtraction
Document 1─* ExtractedFact 1─0..1 ConfirmedFact
TaxYearWorkspace 1─* ConfirmedFact *─1 User (owner)
TaxYearWorkspace 1─1 TaxProfile
TaxYearWorkspace 1─* MissingInformationItem
TaxYearWorkspace 1─* CalculationSnapshot
TaxYearWorkspace 1─* ReturnVersion 1─* ReturnApproval *─1 User
ReturnVersion 1─1 FilingPackage
ReturnVersion 1─0..1 FilingRecord
TaxYearWorkspace 1─0..1 FilingRecord
TaxYearWorkspace 1─* Assessment
TaxYearWorkspace 1─* FreelanceBusinessProfile *─1 User

Notification 1─* NotificationDelivery
User 1─* PushDevice
User 1─* NotificationPreference *─1 Household

CustomAiModel (standalone registry)
CustomAiRoute  (standalone task routing, string model ids)
```

---

## Enums

| Enum | Values | Notes |
|---|---|---|
| `HouseholdRole` | `PRIMARY_FILER`, `CO_FILER`, `VIEWER` | Invitations may only grant `CO_FILER` or `VIEWER` |
| `MembershipStatus` | `PENDING_INVITATION`, `ACTIVE`, `REMOVED` | Guards only accept `ACTIVE` |
| `WorkspaceStatus` | `DRAFT`, `COLLECTING`, `NEEDS_REVIEW`, `READY_TO_CALCULATE`, `CALCULATED`, `HOUSEHOLD_REVIEW`, `APPROVED`, `FILING_PACKAGE_READY`, `FILED`, `ASSESSED`, `CLOSED` | Material changes can move a workspace back to `NEEDS_REVIEW` |
| `AuditEventType` | 24 values, including `USER_LOGIN_FAILED`, `DOCUMENT_REEXTRACTED`, `APPROVAL_INVALIDATED`, `USER_DATA_EXPORTED`, `USER_ACCOUNT_ERASED` | Append-only |
| `TaxResidence` | `RESIDENT`, `NON_RESIDENT` | Drives Art. 157ter handling |
| `TaxClass` | `CLASS_1`, `CLASS_1A`, `CLASS_2` | Effective class can differ from the stored value after `class-resolution.ts` |
| `FilingRoute` | `MYGUICHET_MANUAL`, `PAPER`, `OTHER` | |
| `DocumentVisibility` | `PRIVATE_DRAFT`, `SHARED_FOR_DISCUSSION`, `PROPOSED_FOR_RETURN`, `INCLUDED_IN_RETURN`, `ARCHIVED` | Drives what a co-filer may see/include |
| `DocumentType` | 17 values: salary/pension/mortgage/insurance/donation certificates, childcare, training, medical, receipt, assessment, freelance invoice, business expense, P&L, VAT, advance, contract, unknown | DA-4 added the three that stop mislabelling |
| `DocumentStatus` | `UPLOADED`, `PROCESSING`, `EXTRACTED`, `FAILED`, `CONFIRMED`, `NEEDS_OCR` | `NEEDS_OCR` is a truthful state, not an error |
| `ExtractionSource` | `TEXT_LAYER`, `EMBEDDED_TEXT`, `PLAIN_TEXT`, `VISION`, `OCR`, `NONE` | Recorded per document |
| `FactCategory` | 17 values: employment, freelance, business expense, pension, capital, rental, foreign, mortgage×2, insurance, 111bis, savings housing, LRCP, donation, childcare, household help, other | Engine switch handles each explicitly |
| `TaskSeverity` | `BLOCKER`, `WARNING`, `INFO` | |
| `TaskType` | 7 missing/unconfirmed/approval tasks | |
| `NotificationType` | 11 values | `SECURITY_ALERT` cannot be muted |
| `NotificationSeverity` | `INFO`, `WARNING`, `CRITICAL` | |
| `NotificationChannel` | `EMAIL`, `PUSH` | |
| `NotificationDeliveryStatus` | `PENDING`, `SENDING`, `SENT`, `FAILED`, `SKIPPED` | Outbox state machine |

---

## Models

| Table | Key columns | Constraints / indexes | Purpose |
|---|---|---|---|
| `users` | `email` unique, `passwordHash`, `tokenVersion`, `mfaSecret`, `mfaEnabled`, `mfaRecoveryCodes[]`, `isActive` | unique email | Account and credential root |
| `sessions` | `userId`, `refreshTokenHash`, `familyId`, `expiresAt`, `revokedAt`, `ipAddress`, `userAgent` | `userId`, `familyId` indexes | Refresh rotation; a reused token revokes the family |
| `person_profiles` | `userId` unique, names, DOB, `taxResidence` | unique userId | Display/profile data |
| `households` | `name`, `slug` unique, `createdById` | unique slug | Tenancy root |
| `household_memberships` | `householdId`, `userId`, `role`, `status` | unique `(householdId,userId)` | Membership and role |
| `household_invitations` | `invitedEmail`, `invitedRole`, `tokenHash` unique, `expiresAt`, `acceptedAt`, `revokedAt` | `householdId`, `invitedEmail` indexes | Invitation lifecycle |
| `dependants` | `householdId`, names, DOB, `relationshipType` | household index | Dependant roster |
| `calculation_snapshots` | `workspaceId`, `taxYear`, `taxClass`, `rulePackageVersion`, `resultSha256`, `resultJson`, `createdById` | `(workspaceId, createdAt)` | Append-only calculation history |
| `tax_year_workspaces` | `householdId`, `taxYear`, `status`, `completionScore`, `activeReturnVersion`, `residenceStatus`, `taxClass?`, `estimatedTaxBalance`, `calculationResult` | unique `(householdId,taxYear)` | One workspace per household per year |
| `documents` | `workspaceId`, `uploaderId`, `ownerId?`, `fileName`, `mimeType`, `fileSize`, `sha256Hash`, `storagePath`, `documentType`, `status`, `visibility`, `pageCount`, `extractionSource`, `ocrRequired` | workspace, uploader, hash indexes | Vault entry |
| `document_extractions` | `documentId`, `extractedText?`, `confidence`, `rawJson` | document index | Provenance; text cleared once all facts confirmed |
| `extracted_facts` | `documentId`, `workspaceId`, `ownerId?`, `fieldName`, `fieldValue`, `confidence`, `sourcePage`, `sourceSnippet`, `isConfirmed` | workspace/document indexes | Proposals |
| `confirmed_facts` | `workspaceId`, `ownerId?`, `category`, `fieldKey`, `amount`, `currency`, `taxYear`, `sourceDocumentId?`, `extractedFactId?` unique, `isSharedWithHousehold`, `isIncludedInReturn` | workspace/owner indexes | Return inputs |
| `tax_profiles` | `workspaceId` unique, `maritalStatus`, `answersJson` | unique workspace | Questionnaire answers |
| `missing_information_items` | `workspaceId`, `taskType`, `severity`, `title`, `description`, `isResolved`, `assignedToUserId?` | workspace index | Readiness tasks |
| `return_versions` | `workspaceId`, `versionNumber`, `isFrozen`, `factsSnapshotJson`, `calculationSnapshotJson`, `generatedPackageHash` | unique `(workspaceId,versionNumber)` | Frozen return versions |
| `return_approvals` | `returnVersionId`, `userId`, `approvedAt`, `isSuperseded`, `supersededAt`, `supersedingReason` | unique `(returnVersionId,userId)` | Approval gate |
| `filing_packages` | `returnVersionId` unique, `taxYear`, `taxClass`, `form100BoxesJson`, `annexesJson`, `myGuichetGuideJson`, `unsupportedCodesJson`, `packageSha256`, `historyJson` | unique returnVersion | Generated package + evidence history |
| `filing_records` | `workspaceId` unique, `returnVersionId` unique, `filedAt`, `route`, `confirmationReference`, `notes`, `createdById` | unique both | One filing declaration per workspace; corrections need a new version |
| `assessments` | `workspaceId`, `taxYear`, `bulletinDate`, `assessedTaxableIncome`, `assessedTaxDue`, `differenceWithDeclared`, `discrepanciesJson`, `receivedAt`, `objectionDeadline`, `followUpAt`, `isFinal` | unique `(workspaceId,taxYear)` | One notice per year; a second import is an amendment |
| `audit_events` | `householdId?`, `workspaceId?`, `actorId?`, `actorEmail?`, `eventType`, `entityType`, `entityId`, `previousValue`, `newValue`, `description`, `ipAddress`, `userAgent`, `prevHash`, `hash` | `(householdId,createdAt)`, `(householdId,hash)`, actor | Hash-chained ledger |
| `freelance_business_profiles` | `workspaceId`, `ownerId`, `businessName`, `activityType`, `taxIdOrVat`, `accountingType` | unique `(workspaceId,ownerId)` | One profile per owner per year |
| `custom_ai_models` | `id`, `displayName`, `providerType`, `modelIdentifier`, `endpointUrl`, `apiKey`, `capabilities`, `permittedDataClass`, `hostingRegion`, `status`, `healthy`, `latencyMs`, `lastTestedAt` | PK string | Encrypted model registry |
| `custom_ai_routes` | `id`, `taskName` unique, `primaryModelId`, `fallbackModelIds`, `promptVersion`, `outputSchemaVersion`, `timeoutMs`, `maxDataClass`, `activeRolloutPercentage` | unique task | Task → model chain |
| `notifications` | `householdId`, `workspaceId?`, `userId`, `dedupeKey?`, `actorId?`, `type`, `severity`, `title`, `body`, `entityType`, `entityId`, `actionUrl`, `isRead`, `readAt` | unique `(userId,dedupeKey)`, `(userId,isRead,createdAt)`, `(workspaceId,createdAt)` | In-app notification |
| `notification_deliveries` | `notificationId`, `channel`, `status`, `attempts`, `nextAttemptAt`, `lastError`, `sentAt` | unique `(notificationId,channel)`, `(status,nextAttemptAt)` | Transactional outbox |
| `notification_preferences` | `userId`, `householdId`, `emailEnabled`, `pushEnabled`, `mutedTypes` | unique `(userId,householdId)` | Per-household preferences |
| `push_devices` | `userId`, `token` unique, `platform`, `revokedAt` | `(userId,revokedAt)` | Per-install Expo tokens |

---

## Migrations (chronological)

| Migration | What it adds |
|---|---|
| `20261108000000_init` | Core users, households, workspaces, documents, facts, audit |
| `20261108120000_add_fact_category_values` | Additional `FactCategory` values |
| `20261108130000_add_filing_annexes` | Annex metadata |
| `20261108140000_add_notifications` | In-app notifications |
| `20261109100000_add_filing_record` | Filing declaration |
| `20261109110000_add_filing_package_history` | Package evidence history |
| `20261109120000_add_calculation_snapshots` | Append-only calculations |
| `20261109130000_add_audit_chain` | `prevHash` / `hash` |
| `20261109140000_add_notification_dedupe` | `dedupeKey` unique |
| `20261109150000_add_unsupported_codes` | Persisted unmapped certificate codes |
| `20261109160000_add_notification_outbox` | `notification_deliveries` |
| `20261109170000_add_push_devices` | `push_devices` |
| `20261109180000_audit_purge_guard` | Trigger that rejects update/delete |
| `20261110100000_audit_purge_role` | `luxtax_audit_purge` role + transaction opt-in |
| `20261110120000_auth_hardening` | `tokenVersion`, session fields, login failure support |
| `20261110123000_add_mfa` | `mfaSecret`, `mfaEnabled`, recovery codes |
| `20261110140000_assessment_uniqueness` | Unique `(workspaceId,taxYear)` |
| `20261110160000_login_failed_audit` | Nullable actor for failed logins |
| `20261110161000_retention_and_lifecycle` | Retention fields/indexes |
| `20261110190000_document_ocr_state` | `NEEDS_OCR`, `ExtractionSource`, `ocrRequired` |
| `20261110191000_audit_actor_fk_set_null` | Actor FK `ON DELETE SET NULL` (drift cleared) |
| `20261110192000_document_reextracted_event` | `DOCUMENT_REEXTRACTED` event |
| `20261110200000_extraction_source_ocr` | `OCR` extraction source |

**Drift rule:** after `prisma migrate deploy` on an empty database, `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` must exit 0. The audit actor FK migration exists because a nullable FK kept `ON DELETE RESTRICT`, producing permanent diff noise.

---

## Invariants enforced by the database

1. **One workspace per household per year** — `@@unique([householdId, taxYear])`.
2. **One membership per user per household** — `@@unique([householdId, userId])`.
3. **One confirmed fact per extracted fact** — `extractedFactId @unique` and `onDelete: SetNull`, so re-extraction cannot duplicate a confirmed figure.
4. **One filing record per workspace and version** — both columns unique; a correction is a new return version, not a second row.
5. **One assessment per workspace per year** — a second import is rejected at the database, not only by the service.
6. **One delivery per notification and channel** — `@@unique([notificationId, channel])`.
7. **One preference row per user per household** — `@@unique([userId, householdId])`.
8. **Audit events are immutable** — a trigger rejects `UPDATE`/`DELETE` unless the session holds `luxtax_audit_purge` and has run `SET LOCAL luxtax.allow_audit_purge = 'on'`.
9. **Audit chain continuity** — `prevHash` points at the previous event's `hash` for the same household. `audit-chain.spec.ts` verifies the chain.
10. **Money is `Decimal(12,2)` or a stored JSON snapshot** — engine arithmetic is integer cents; the database stores exact decimals.

---

## Data lifecycle

| Data | Created by | Deleted / nulled by |
|---|---|---|
| Sessions | Login/refresh | Expiry cleanup, logout, password reset, erasure |
| `DocumentExtraction.extractedText` | Upload/extraction | Nulled when every fact of the document is confirmed (data minimisation) |
| `ExtractedFact` | Extraction | Replaced by re-extraction when unconfirmed; `SetNull` link if confirmed |
| `ConfirmedFact` | Confirmation | Explicit delete; source document link `SetNull` |
| `CalculationSnapshot` | Each persisted calculation | Workspace cascade |
| `ReturnVersion` / `ReturnApproval` | Approval | Workspace cascade; approvals superseded, never deleted |
| `FilingPackage` | Package generation | Workspace cascade; evidence history is append-only |
| `FilingRecord` | Filing | Workspace cascade; return version `Restrict` |
| `Assessment` | Import | Workspace cascade |
| `AuditEvent` | Every material action | Only the purge mechanism; household/workspace FKs `SetNull` |
| `NotificationDelivery` | Notification enqueue | Notification cascade |
| `PushDevice` | Device registration | Revocation sets `revokedAt`; user cascade deletes |

---

## Query patterns to preserve

- Every workspace-scoped query must include `workspaceId` (and therefore a household the caller belongs to). Do not fetch by id alone and check afterwards.
- Fact visibility is applied in `fact-visibility-query.ts`, not ad hoc in controllers.
- The calculation service loads only confirmed, included facts visible to the acting user.
- `HouseholdGuard` already validated the workspace/household pair; services can trust the id but must still scope by household.
- Aggregations that span a household (readiness, activity) filter by `householdId`.

---

## Related

- [Backend](backend.md)
- [API reference](../api.md)
- [Data retention](../data-retention.md)
- [Workers](workers.md)
