# Module codemap

**Last updated:** 2026-11-19
**Scope:** every importable module in `packages/*`, every NestJS module in
`apps/api/src/modules`, and the shared infrastructure under
`apps/api/src/common` and `apps/api/src/config`.
**Source of truth:** the code. Exports below were read from the module files on
the date above.

Related: [Architecture](ARCHITECTURE.md) · [File map](FILES.md) · [Backend](backend.md) · [API reference](../api.md)

---

## 1. Shared packages

### 1.1 `@luxtax/tax-engine`

**Purpose:** pure, deterministic Luxembourg personal income tax calculation.
No I/O, no ambient time, no mutation of the caller's params.

**Location:** `packages/tax-engine/src/`

**Key files**

| File | Purpose |
|---|---|
| `engine.ts` | `LuxembourgTaxEngine.calculate` and `.compareAssessmentModes` |
| `scale.ts` | Art. 118 progressive scale, Class 1a, rounding helpers |
| `scale2025.ts` | 2025 scale convenience exports (legacy surface) |
| `deductions.ts` | Art. 105bis travel, 105 mortgage schedule, 111/111bis, 112, 127, 129b, 129g, 114 |
| `credits.ts` | CIS, CIP, CII, CO2, CISSM, CIM, child dégrèvement/bonification, foreign credit |
| `child-relief.ts` | Per-child history, two-bonification cap, résidence alternée transition |
| `money.ts` | Integer-cent arithmetic and safe accumulation |
| `pending.ts` | Pending-law gates, CIC table lookup, package consistency checks |
| `forms/certificate160.ts` | Certificate 160 code → engine category/field table |
| `rules/types.ts` | `RulePackage` and every sub-rule interface |
| `rules/2025.ts`, `2026.ts`, `2028.ts` | Immutable packages (`2025.1.0`, `2026.1.0`, `2028.0.0-preview`) |
| `rules/index.ts` | `getRulePackage`, `isSupportedTaxYear`, `SUPPORTED_TAX_YEARS` |
| `rules/treaties.ts` | Country → exemption-with-progression or ordinary credit |

**Exports (principal)**

| Export | Kind | Description |
|---|---|---|
| `LuxembourgTaxEngine` | class | `calculate(params)`, `compareAssessmentModes(params)` |
| `getRulePackage(year)` | function | Throws rather than fall back to another year |
| `isSupportedTaxYear(year)` | function | `true` for 2025 / 2026 / 2028 |
| `SUPPORTED_TAX_YEARS` | const | `[2025, 2026, 2028]` |
| `RULES_2025`, `RULES_2026`, `RULES_2028` | const | Immutable packages |
| `calculateDeductions(ctx)` | function | Deduction breakdown |
| `resolveArt111bisContributors` | function | Clamps contributors to assessed persons |
| `resolvePerPersonCredits`, `cimFor`, `cisForSalary`, `cicForSalary`, `cissmForSalary`, `bonificationForChildren`, `degrevementForChildren` | functions | Credit and child-relief primitives |
| `treatyMethodFor(country)` | function | Treaty relief method |
| `lookupCertificate160Code`, `normalizeCertificate160Code`, `isCertificate160FieldKey` | functions | Certificate table |
| `pendingMeasureStatus`, `cicFromTable`, `checkPendingConsistency` | functions | Pending-law gates |
| `toCents`, `fromCents`, `addMoney`, `mulRate`, `sumCents` | functions | Money helpers |

**Dependencies:** `@luxtax/contracts` (DTO types plus the `TaxClass` enum). No third-party runtime package.

**Usage**

```typescript
import { LuxembourgTaxEngine, getRulePackage } from '@luxtax/tax-engine';

const result = LuxembourgTaxEngine.calculate(params);
const yearRules = getRulePackage(2026);
```

**Tests:** `packages/tax-engine/test/*.spec.ts` — 11 files, 214 assertions.

---

### 1.2 `@luxtax/contracts`

**Purpose:** the single source of shared types, DTOs and enums across API, web,
mobile and engine.

**Location:** `packages/contracts/src/`

**Key files and exports**

| File | Main exports |
|---|---|
| `enums.ts` | `HouseholdRole`, `MembershipStatus`, `WorkspaceStatus`, `DocumentVisibility`, `DocumentType`, `DocumentStatus`, `FactCategory`, `TaxClass`, `TaxResidence`, `FilingRoute`, `TaskType`, `TaskSeverity`, `NotificationType`, `NotificationSeverity`, `AuditEventType` |
| `auth.ts` | `UserDto`, `AuthTokensDto`, `AuthResponseDto`, `RegisterRequestDto`, `LoginRequestDto`, `RefreshTokenRequestDto` |
| `household.ts` | `HouseholdDto`, `HouseholdMemberDto`, `HouseholdInvitationDto`, `CreateHouseholdDto`, `InviteMemberDto`, `AcceptInvitationDto`, `InvitationDetailsDto` |
| `workspace.ts` | `TaxYearWorkspaceDto`, `InitWorkspaceDto`, `WorkspaceReadinessDto` |
| `audit.ts` | `AuditEventDto`, `AuditFilterDto` |
| `documents.ts` | `DocumentDto`, `UploadDocumentRequestDto`, `DocumentExtractionDto` |
| `facts.ts` | `ExtractedFactDto`, `ConfirmedFactDto`, `ConfirmFactRequestDto`, `ConfirmFactsBulkRequestDto`, `UpdateFactRequestDto` |
| `fact-category.ts` | `factCategoryForFieldName` (client/server shared category resolution) |
| `tax.ts` | `TaxCalculationParams`, `TaxCalculationFactInput`, `TaxCalculationResultDto`, `AssessmentMode`, `DeductionBreakdownDto`, `CreditBreakdownDto`, `ChildReliefBreakdownDto`, `CalculationLineItemProvenance`, `ScenarioComparisonDto` |
| `filing.ts` | `ReturnApprovalDto`, `ReturnVersionDto`, `ReturnVersionHistoryDto`, `Form100BoxMapping`, `MyGuichetStepGuide`, `AnnexRequestDto`, `FilingPackageDto`, `FilingRecordDto`, `AssessmentDto`, `CreateFilingRecordDto`, `UpdateAssessmentFollowUpDto` |
| `questionnaire.ts` | `QuestionnaireAnswersDto`, `MissingInformationTaskDto`, `ReadinessDetailsDto`, `AssessmentModeDto` |
| `admin.ts` | `TaxRulePackageDto`, `FormMappingDto`, `ModelDefinitionDto`, `ModelRouteDto`, `EvaluationRunDto`, `AdminOverviewDto`, `TaxDeadlineDto` and create/update/test request types |
| `freelance.ts` | `FreelanceBusinessProfileDto`, `UpdateFreelanceProfileDto`, `FreelanceMetricsDto` |
| `notifications.ts` | `NotificationDto`, `NotificationListDto`, `NotificationPreferenceDto`, `UpdateNotificationPreferencesDto` |

**Dependencies:** none.

**Usage**

```typescript
import { DocumentVisibility, type ConfirmedFactDto } from '@luxtax/contracts';
```

---

### 1.3 `@luxtax/validation`

**Purpose:** Zod 4 runtime schemas shared by the API and the clients. One schema
per mutating payload, so the API never invents a second validation shape.

**Location:** `packages/validation/src/`

| File | Schemas (inferred types) |
|---|---|
| `auth.schema.ts` | `registerSchema`, `loginSchema`, `refreshTokenSchema` |
| `household.schema.ts` | `createHouseholdSchema`, `inviteMemberSchema`, `acceptInvitationSchema` |
| `workspace.schema.ts` | `initWorkspaceSchema` |
| `document.schema.ts` | `uploadDocumentSchema` |
| `fact.schema.ts` | `confirmFactSchema`, `updateFactSchema`, `confirmFactsBulkSchema` |
| `questionnaire.schema.ts` | `questionnaireSchema` (the full tax profile) |
| `filing.schema.ts` | `approveReturnSchema`, `importAssessmentSchema`, `createFilingRecordSchema`, `updateAssessmentFollowUpSchema` |
| `admin.schema.ts` | `createModelSchema`, `updateModelSchema`, `testModelConnectionSchema`, `updateModelRouteSchema` |
| `freelance.schema.ts` | `updateFreelanceProfileSchema` |
| `notification.schema.ts` | `updateNotificationPreferencesSchema` |

**Dependencies:** `zod` 4.

**Usage**

```typescript
import { loginSchema, type LoginInput } from '@luxtax/validation';

const parsed = loginSchema.safeParse(body);
if (!parsed.success) throw new BadRequestException(parsed.error.issues[0]?.message);
```

**Tests:** `packages/validation/test/*.spec.ts` — 5 files, 34 cases (password
policy, mortgage year, mixed couple, future year, base schemas).

---

### 1.4 `@luxtax/api-client`

**Purpose:** the only HTTP client used by web and mobile. One class, configurable
token getter and refresh callback.

**Location:** `packages/api-client/src/client.ts`

**Constructor**

```typescript
new LuxTaxApiClient({
  baseUrl,
  getAccessToken?: () => string | null | Promise<string | null>,
  refreshAccessToken?: () => Promise<string | null>,
  onUnauthorized?: () => void,
});
```

**Methods by domain**

- Auth: `register`, `login`, `refreshToken`, `getMe`
- Households: `getHouseholds`, `getHousehold`, `createHousehold`, `inviteMember`, `getInvitationDetails`, `acceptInvitation`
- Workspaces: `getWorkspaces`, `getWorkspace`, `initWorkspace`, `getWorkspaceReadiness`
- Documents: `getDocuments`, `uploadDocument`, `updateDocumentVisibility`, `reextractDocument`, `deleteDocument`
- Facts: `getFacts`, `confirmFact`, `confirmFactsBulk`, `updateFact`, `deleteFact`
- Questionnaire: `getQuestionnaire`, `saveQuestionnaire`, `resolveTask`
- Calculations: `calculateTax`, `getCalculation`, `compareScenarios`
- Filing/assessment: `approveReturn`, `generateFilingPackage`, `importAssessment`, `rolloverToNextYear`, `getReturnVersion`, `getReturnVersionHistory`, `getFilingPackage`, `getAssessment`, `recordFiling`, `getFilingRecord`, `updateAssessmentFollowUp`
- Freelance: `getFreelanceProfiles`, `updateFreelanceProfile`, `getFreelanceMetrics`, `loadFreelanceDemo`
- Audit: `getAuditActivity`
- Notifications: `getNotifications`, `getNotificationUnreadCount`, `markNotificationRead`, `markAllNotificationsRead`, `getNotificationPreferences`, `updateNotificationPreferences`
- Admin: `getAdminOverview`, `getAdminTaxRules`, `getAdminDeadlines`, `getAdminForms`, `getAdminModels`, `createAdminModel`, `updateAdminModel`, `deleteAdminModel`, `testAdminModel`, `getAdminModelRoutes`, `updateAdminModelRoute`, `getAdminEvaluations`, `getAdminAudit`

**Behaviour**

- Returns `{ data?, error?, status }`; never throws on an HTTP error.
- Renews the access token **once** on a 401 and replays the request.
- Never attempts renewal for `/api/auth/*` (the refresh call itself).
- Sends `Content-Type: application/json` only when a body exists.
- Web adds `downloadAnnexPdf`; mobile adds blob download helpers.

**Dependencies:** `@luxtax/contracts`.

**Usage**

```typescript
import { LuxTaxApiClient } from '@luxtax/api-client';

const api = new LuxTaxApiClient({ baseUrl: 'http://localhost:3001' });
const { data, error } = await api.getWorkspaces(householdId);
```

---

### 1.5 `@luxtax/design-tokens`

**Purpose:** shared visual tokens and the trilingual tax glossary.

**Location:** `packages/design-tokens/src/`

| File | Exports |
|---|---|
| `tokens.ts` | `colors` (primary, neutral, status, household roles), `typography` |
| `translations.ts` | `SupportedLanguage` (`en` / `fr` / `de`), `TaxTermTranslation`, `LUXEMBOURG_TAX_TERMS`, `getTermTranslation(key, lang)` |

**Dependencies:** none.

**Usage**

```typescript
import { colors, getTermTranslation } from '@luxtax/design-tokens';

const label = getTermTranslation('asrd', 'fr');
```

**Tests:** `packages/design-tokens/test/translations.spec.ts` — 9 cases.

---

### 1.6 `@luxtax/config`

**Purpose:** shared TypeScript base configuration. No runtime code.

**Location:** `packages/config/tsconfig.base.json`

**Usage:** every app/package `tsconfig.json` extends this base.

---

## 2. API infrastructure

### 2.1 `PrismaModule` / `PrismaService`

**Location:** `apps/api/src/prisma/`

- `PrismaService` extends `PrismaClient`, builds a `pg.Pool` and a `PrismaPg`
  adapter, connects on init, disconnects on destroy.
- `PrismaModule` is global: every module injects the same pooled client.

### 2.2 Common guards and decorators

| Module | File | Responsibility |
|---|---|---|
| `JwtAuthGuard` | `common/guards/jwt-auth.guard.ts` | Passport JWT; populates `request.user` |
| `JwtStrategy` | `modules/auth/jwt.strategy.ts` | Validates payload, loads the user, checks `tokenVersion` |
| `HouseholdGuard` | `common/guards/household.guard.ts` | Resolves household from path params, requires `ACTIVE` membership, enforces `@Roles` |
| `PlatformAdminGuard` | `common/guards/platform-admin.guard.ts` | `ADMIN_EMAILS` allowlist + verified e-mail; fails closed |
| `RateLimitGuard` | `common/guards/rate-limit.guard.ts` | Global token-bucket guard; on by default |
| `@Roles(...)` | `common/decorators/roles.decorator.ts` | Metadata consumed by `HouseholdGuard` |
| `@CurrentUser(...)` | `common/decorators/current-user.decorator.ts` | Param decorator over `request.user` |
| `AllExceptionsFilter` | `common/filters/http-exception.filter.ts` | Safe 4xx/5xx envelope; never leaks database errors |

### 2.3 Rate limiting

**Files:** `common/guards/rate-limit.guard.ts`, `common/rate-limit/token-bucket.ts`

- `TokenBucketLimiter` — dependency-free, clock-injected, max 10 000 keys with
  least-recently-updated eviction.
- Defaults: IP `60` burst / `1` per second; user `120` / `2`.
- Credential bucket: `5` attempts per IP + submitted e-mail, `1/60` per second.
- Enabled unless `RATE_LIMIT_ENABLED=false`.
- Adds `X-RateLimit-Remaining` and, on 429, `Retry-After`.

### 2.4 Configuration

| File | Responsibility |
|---|---|
| `config/load-env.ts` | `loadEnvironment()` searches cwd → 3 parents for `.env`; imported first in `main.ts` |
| `config/runtime-config.ts` | `configurationProblems`, `assertRuntimeConfig`, `jwtAccessSecret`; hard-fails on missing/weak/committed secrets |
| `config/cors-origins.ts` | `allowedCorsOrigins()` — `CORS_ORIGINS` else `FRONTEND_URL` else localhost; strips trailing slashes |
| `config/proxy-trust.ts` | `resolveTrustProxy()` — false / true / hop count / CIDR list; unreadable falls back to no trust |

---

## 3. API modules

Every module lives under `apps/api/src/modules/<name>/`. The table lists the
controller base and the services the module exports.

### 3.1 `AuthModule` — `/api/auth`

**Key files:** `auth.controller.ts`, `auth.service.ts`, `auth.module.ts`,
`jwt.strategy.ts`, `secret-box.ts`, `totp.ts`, `email-verification.ts`.

**Service surface:** `register`, `login`, `refresh`, `logout`, `verifyEmail`,
`resendVerification`, `enrolMfa`, `activateMfa`, `disableMfa`.

**Dependencies:** `AuditModule`, `PrismaModule`, `@luxtax/validation`.

**Notes:** Argon2id (64 MiB, t=3); 15-minute access token; rotating refresh
token with family revocation; TOTP seed sealed with HKDF-derived key; recovery
codes hashed; `assertRuntimeConfig()` at import time.

---

### 3.2 `UsersModule` — `/api/users`

**Key files:** `users.controller.ts`, `users.service.ts`, `users.module.ts`.

**Service surface:** `findById`, `updateProfile`, `listSessions`,
`exportUserData`, `eraseAccount`.

**Notes:** export writes `USER_DATA_EXPORTED`; erasure anonymises, destroys the
credential, revokes sessions/devices, and writes `USER_ACCOUNT_ERASED`. It does
not delete the audit trail, workspaces, or filed returns.

---

### 3.3 `HouseholdsModule` — `/api/households`

**Key files:** `households.controller.ts`, `households.service.ts`, `households.module.ts`.

**Service surface:** `createHousehold`, `getHouseholdsForUser`,
`getHouseholdById`, `inviteMember`, `getInvitationDetails`, `acceptInvitation`.

**Dependencies:** `AuditModule`, `NotificationsModule`.

**Notes:** invitation token is stored as SHA-256; roles limited to `CO_FILER` /
`VIEWER`; acceptance requires the signed-in e-mail to match.

---

### 3.4 `WorkspacesModule` — `/api/households/:id/workspaces`

**Key files:** `workspaces.controller.ts`, `workspaces.service.ts`, `workspaces.module.ts`.

**Service surface:** `getWorkspacesForHousehold`, `getWorkspaceByYear`,
`initWorkspace`, `getReadiness`.

**Notes:** unique `(householdId, taxYear)`; readiness is derived, not stored as a
score alone.

---

### 3.5 `AuditModule` — `/api/households/:id/activity`

**Key files:** `audit.service.ts`, `audit-chain.ts`, `audit-redaction.ts`, `audit.controller.ts`, `audit.module.ts`.

**Service surface:** `logEvent` (alias `log`), `getHouseholdActivity`.

**Exports:** `canonicalJson`, `hashAuditEvent`, `verifyAuditChain`,
`auditCategory`, `redactAuditEventForViewer`, `REDACTED_DOCUMENT_DESCRIPTION`.

**Notes:** hash chain per household; failed login has no actor; viewers lose
actor e-mail/IP/user-agent and private-draft names.

---

### 3.6 `DocumentsModule` — `/api/workspaces/:workspaceId/documents`

**Key files:** `documents.controller.ts`, `documents.service.ts`, `documents.module.ts`,
`upload-guard.ts`, `receipt-ai-vision.service.ts`,
`text/document-text.ts`, `text/pdf-text.ts`, `text/pdf-images.ts`,
`ocr/ocr-engine.ts`, `extraction/vision-contract.ts`.

**Service surface:** `uploadDocument`, `getDocumentsForWorkspace`,
`reextractDocument`, `updateVisibility`, `deleteDocument`.

**Dependencies:** `AuditModule`, `AdminModule`, `ReturnApprovalsModule`,
`NotificationsModule`.

**Notable exports**

| Export | Purpose |
|---|---|
| `MAX_UPLOAD_BYTES` / `MAX_UPLOAD_MIB` | 10 MiB decoded cap |
| `decodeBase64Upload`, `sniffMimeType`, `assertDeclaredMimeMatches` | Upload guard |
| `readDocumentText`, `findEmbeddedText` | Tier 1 text reader |
| `extractPdfPageImages`, `encodePng` | Scanned PDF → page images |
| `TesseractCliOcrEngine`, `resolveTesseractPath`, `normaliseOcrText` | Local OCR adapter |
| `buildVisionPrompt`, `parseVisionExtraction`, `normalizeAmount`, `resolveVisionChain`, `modelMaySeeDataClass` | Vision contract |
| `ReceiptAiVisionService` | Pipeline orchestrator |

---

### 3.7 `FactsModule` — `/api/workspaces/:workspaceId/facts`

**Key files:** `facts.controller.ts`, `facts.service.ts`, `fact-visibility.ts`,
`fact-visibility-query.ts`, `fact-snapshot.ts`, `household-owner.ts`, `facts.module.ts`.

**Service surface:** `getFactsForWorkspace`, `confirmFact`, `confirmFactsBulk`,
`updateFact`, `deleteFact`.

**Dependencies:** `AuditModule`, `NotificationsModule`, `ReturnApprovalsModule`.

**Visibility surface:** `canReadDocument`, `isSharedForDiscussion`,
`shouldRedactFactAudit`, `canIncludeInReturn`, `canStoreInReturn`,
`HOUSEHOLD_VISIBLE_DOCUMENT_STATES`, `householdVisibleConfirmedFactWhere`,
`CONFIRMED_FACT_IN_RETURN_WHERE`, `stripUnsharedSnapshotFacts`.

---

### 3.8 `QuestionnaireModule` — `/api/workspaces/:workspaceId`

**Key files:** `questionnaire.controller.ts`, `questionnaire.service.ts`, `questionnaire.module.ts`.

**Service surface:** `getProfileAndTasks`, `saveProfile`, `resolveTask`.

**Routes:** `GET /questionnaire`, `PUT /questionnaire`,
`POST /tasks/:taskId/resolve`.

**Notes:** missing-information tasks are regenerated on save; profile answers
feed `class-resolution.ts` and the engine params.

---

### 3.9 `CalculationsModule` — `/api/workspaces/:workspaceId`

**Key files:** `calculations.controller.ts`, `calculations.service.ts`,
`calculations.module.ts`, `class-resolution.ts`, `calculation-history.ts`,
`calculation-snapshot.ts`.

**Service surface:** `calculateTax`, `compareScenarios`, `getLatestCalculation`.

**Dependencies:** `AuditModule`, `ReturnApprovalsModule`, `@luxtax/tax-engine`.

**Class-resolution exports:** `deriveTaxClass`, `deriveIsSingleParent`,
`classWindowWarning`, `selectFilerMembers`, `spouseEndsAtEvent`,
`isScenarioComparisonEligible`, `shouldPersist`, `FilerMemberInput`, `FilerMembers`.

**Calculation-history exports:** `canonicalJson`, `hashCalculationResult`,
`summariseCalculation`, `isSameCalculation`.

**Notes:** `calculateTax` persists a snapshot and invalidates approvals;
`compareScenarios` does neither.

---

### 3.10 `FilingModule` + `ReturnApprovalsModule` — `/api/workspaces/:workspaceId`

**Key files:** `filing.controller.ts`, `filing.service.ts`, `filing.module.ts`,
`return-approvals.service.ts`, `return-approvals.module.ts`,
`return-version-history.ts`, `form100-case-map.ts`, `form100-fact-lines.ts`,
`filing-package-evidence.ts`, `filing-year-guard.ts`, `annex-pdf.service.ts`,
`annex-pdf.builder.ts`, `assessment-dates.ts`.

**Service surface:** `approveReturn`, `generateFilingPackage`, `recordFiling`,
`getFilingRecord`, `updateAssessmentFollowUp`, `importAssessment`,
`rollOverToNextYear`, `getLatestReturnVersion`, `getLatestFilingPackage`,
`getLatestAssessment`.

**ReturnApprovalsModule surface:** `invalidateForChange`, `getHistory`.

**Other exports**

| Export | Purpose |
|---|---|
| `requiredApproverIds`, `requiredApproverCount`, `historyStatus`, `mergeHistory` | Approval math and version history |
| `FORM100_CASES`, `FORM100_INSTRUCTIONS`, `RECAP`, `foreignNatureSheet`, `foreignSheetPointer`, `Form100CaseRef` | Form map |
| `factAmountRole`, `RD_WITHHOLDING_CREDIT`, `RENTAL_CHARGES_DEDUCTION` | Fact → line mapping |
| `appendPackageEvidence`, `currentPackageEvidence`, `verifyPackageEvidence`, `assertPackageRegenerationAllowed` | Package evidence |
| `filingYearVerdict`, `assertFilingYearAllowed`, `FilingPackageNotAllowedError` | Filing-year gate |
| `buildAnnexPdf`, `assemblePdf`, `AnnexPdfMeta` | Dependency-free annex PDF |
| `addMonthsUtc`, `defaultAssessmentFollowUp`, `isObjectionOpen` | Assessment dates |

**Dependencies:** `AuditModule`, `NotificationsModule`, `ReturnApprovalsModule`,
`@luxtax/tax-engine`.

---

### 3.11 `FreelanceModule` — `/api/workspaces/:workspaceId/freelance`

**Key files:** `freelance.controller.ts`, `freelance.service.ts`, `freelance.module.ts`.

**Service surface:** `getProfiles`, `updateProfile`, `getMetrics`, `loadDemoData`.

**Dependencies:** `AuditModule`, `ReturnApprovalsModule`.

**Notes:** one profile per owner per workspace; metrics aggregate confirmed
freelance facts into revenue, categorised expenses and net profit; demo load
invalidates approvals.

---

### 3.12 `NotificationsModule` — `/api/workspaces/:workspaceId/notifications`

**Key files:** `notifications.controller.ts`, `notifications.service.ts`,
`notifications.module.ts`, `notification-outbox.service.ts`,
`notification-outbox.ts`, `notification-delivery.ts`,
`notification-devices.service.ts`, `notification-devices.ts`,
`notification-reminders.service.ts`, `notification-rules.ts`,
`adapters/*.ts`.

**Service surface:** `createForUser`, `emitToHousehold`, `list`, `unreadCount`,
`markRead`, `markAllRead`, `getPreferences`, `updatePreferences`.

**Outbox surface:** `enqueue`, `dispatchDue`, `stats`, `runOutboxPass`,
`OutboxStore`, `MAX_DELIVERY_ATTEMPTS`, `backoffDelayMs`, `nextAttemptAt`,
`staleClaimCutoff`, `channelsForNotification`.

**Devices surface:** `register`, `revoke`, `revokeAll`, `resolveTokens`,
`enablePush`, `isValidPushToken`, `normalizePlatform`, `selectLiveTokens`.

**Exports from the module:** `NotificationsService`,
`NotificationOutboxService`, `NotificationDevicesService`.

**Notes:** Expo transport is wired at module init regardless of
`NOTIFICATION_PUSH_ENABLED`; a user with no device yields `SKIPPED`. Email uses
SMTP when `SMTP_HOST` is set, otherwise the local JSONL sink.

---

### 3.13 `AdminModule` — `/api/admin`

**Key files:** `admin.controller.ts`, `admin.service.ts`, `admin.module.ts`,
`model-key-cipher.ts`, `outbound-url-policy.ts`, `data-class-policy.ts`.

**Service surface:** `getOverview`, `getTaxRules`, `getForms`, `getDeadlines`,
`getModels`, `createModel`, `updateModel`, `deleteModel`, `testModelConnection`,
`getModelRoutes`, `updateModelRoute`, `getEvaluations`, `getAdminAudit`.

**Governance exports**

| Export | Purpose |
|---|---|
| `encryptModelApiKey`, `decryptModelApiKey`, `parseModelKeyEncryptionKey`, `isEncryptedModelKey` | AES-256-GCM key handling |
| `evaluateEndpointUrl`, `isForbiddenIp`, `isLoopbackHost`, `normalizeHost`, `parseIpv4`, `expandIpv6` | SSRF policy |
| `MODEL_DATA_CLASSES`, `asModelDataClass`, `permitsDataClass`, `routeDataClassViolation`, `routeAssignmentViolations` | Data-class policy |

**Dependencies:** `AuthModule` (guards), `PrismaModule`.

**Notes:** every route requires `JwtAuthGuard` + `PlatformAdminGuard`; overview
and tax rules are derived from the engine; `2028` is marked `DRAFT` and excluded
from `activeTaxYears`.

---

## 4. Client modules

The web and mobile libraries are documented file-by-file in
[frontend.md](frontend.md). Their boundaries are:

| Layer | Web | Mobile |
|---|---|---|
| API access | `apps/web/src/lib/api.ts` (`apiClient`, token storage, annex download) | `apps/mobile/src/lib/api-client.ts` (`mobileApiClient`) |
| Auth/session | `auth-context.tsx`, `auth-redirect.ts` | `secure-storage.ts`, `app-lock.ts` |
| Offline | — | `offline-queue.ts`, `queue-runtime.ts`, `push-and-status.ts` |
| Domain helpers | `money.ts`, `document-visibility.ts`, `fact-dedup.ts`, `fact-inclusion.ts` | `workspace.ts`, `privacy.ts`, `deep-links.ts`, `file-export.ts`, `package-download.ts` |
| UI | 12 components under `apps/web/src/components` | 3 components under `apps/mobile/src/components` |

---

## 5. Dependency rules to preserve

1. `packages/tax-engine` may import `@luxtax/contracts` types and enums only.
2. `packages/contracts` and `packages/design-tokens` import nothing.
3. `packages/api-client` imports `@luxtax/contracts` only.
4. `apps/api` may import any `@luxtax/*` package.
5. `apps/web` / `apps/mobile` use `@luxtax/api-client`, `@luxtax/contracts`,
   `@luxtax/validation`, `@luxtax/design-tokens`; never `apps/api` internals.
6. A new API field is added to `packages/contracts` first, then the service,
   then the clients; a new payload shape is added to `packages/validation`.
7. Approval-affecting writes call `ReturnApprovalsService.invalidateForChange`.
8. Any new module must be registered in `apps/api/src/app.module.ts`; any new
   mobile screen must be registered in `apps/mobile/app/_layout.tsx` or a tab
   layout.

---

## Related

- [Architecture](ARCHITECTURE.md)
- [File map](FILES.md)
- [Backend](backend.md)
- [Frontend](frontend.md)
- [Database](database.md)
- [API reference](../api.md)
