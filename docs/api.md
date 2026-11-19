# API reference

**Last updated:** 2026-11-19
**Base URL:** `http://localhost:3001` (development)
**Content type:** `application/json` unless noted. The annex PDF endpoint returns `application/pdf`.

This reference is generated from the controllers in `apps/api/src/modules/**/*.controller.ts` and the Zod schemas in `packages/validation/src`. When the two disagree, the code wins; update this file in the same change.

Related: [backend codemap](CODEMAPS/backend.md) · [database codemap](CODEMAPS/database.md) · [README](../README.md)

---

## Conventions

### Authentication

Every route marked **Auth** requires:

```http
Authorization: Bearer <accessToken>
```

Access tokens live 15 minutes. Refresh with `POST /api/auth/refresh`; the response rotates both tokens. `POST /api/auth/logout` revokes the presented refresh token.

### Household scoping

Routes under `/api/workspaces/:workspaceId/...` are protected by `JwtAuthGuard` **and** `HouseholdGuard`. The guard resolves the workspace's household and verifies the caller is an `ACTIVE` member. A workspace id belonging to another household returns **403**, not 404.

Routes under `/api/households/:id/...` likewise resolve membership from `:id`.

### Roles

`PRIMARY_FILER` and `CO_FILER` may write. `VIEWER` is read-only. A write attempted by a viewer returns **403**.

### Error shape

```json
{
  "statusCode": 400,
  "timestamp": "2026-11-19T09:00:00.000Z",
  "path": "/api/auth/register",
  "message": "Password must be at least 8 characters long"
}
```

- 4xx messages are safe to display.
- 5xx messages are generic (`An unexpected error occurred. Please try again later.`) unless `EXPOSE_ERROR_DETAILS=true`; database errors are never exposed.
- `429` adds `retryAfter` (seconds) and `Retry-After`.

### Rate limits

Enabled by default. Buckets: per-IP (all routes), per-IP + submitted e-mail (login, register, refresh: 5 attempts, slow refill). A per-user bucket exists in the guard but is **not currently applied** after authentication; the global guard runs before `JwtAuthGuard`, so `request.user` is undefined there. Disable only for controlled load tests with `RATE_LIMIT_ENABLED=false`.

---

## Auth — `/api/auth`

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| POST | `/register` | public | `registerSchema` | `AuthResponseDto` |
| POST | `/login` | public | `loginSchema` + optional `totpCode` | `AuthResponseDto` |
| POST | `/refresh` | public | `{ refreshToken }` | `AuthResponseDto` |
| POST | `/verify-email` | public | `{ token }` (≥16 chars) | `{ verified: true }` |
| POST | `/resend-verification` | bearer | — | `{ sent: boolean }` |
| POST | `/mfa/enrol` | bearer | — | `{ secret, otpauthUrl }` (seed returned once) |
| POST | `/mfa/activate` | bearer | `{ code }` | `{ recoveryCodes }` (ten, returned once) |
| POST | `/mfa/disable` | bearer | `{ code }` (TOTP or recovery code) | MFA disabled |
| POST | `/logout` | bearer | `{ refreshToken? }` | `204 No Content` |

`registerSchema`: `email`, `password` (8–128 chars, letter + digit, common-password denylist), optional `firstName`, optional `lastName`.
`loginSchema`: `email`, `password`. When the account has MFA active, a valid `totpCode` (or recovery code, where accepted by the service) is required; an invalid code returns **401** and records a failed login.

`AuthResponseDto` carries `user` and `tokens { accessToken, refreshToken }`.

**Behaviour notes**
- Registration always normalises the e-mail to lower case.
- `verify-email` is public because the token is the credential; the link base is `FRONTEND_URL`.
- MFA is per account; there is no deployment-wide switch. The seed is sealed with a key derived from `JWT_ACCESS_SECRET`.
- Credential endpoints are throttled per IP + e-mail even when the general limiter is on.

---

## Users — `/api/users`

| Method | Path | Auth | Body | Response |
|---|---|---|---|---|
| GET | `/me` | bearer | — | `UserDto` |
| PATCH | `/me/profile` | bearer | `{ firstName?, lastName? }` | `UserDto` |
| GET | `/me/sessions` | bearer | — | last 50 sessions with IP, user agent, expiry, active flag |
| GET | `/me/export` | bearer | — | one JSON document (profile, memberships, workspaces, owned facts, document metadata, filing records, actor audit events, sessions) |
| DELETE | `/me` | bearer | — | erasure result |

**Account erasure** anonymises the identity, destroys the credential, deletes sessions and push registrations, removes memberships, and renames a household the user was alone in. It does **not** delete the audit trail, workspaces, or filed returns. If the caller is the last `PRIMARY_FILER` and active members remain, the route returns **409**; transfer ownership first is not implemented. Both export and erasure write audit events (`USER_DATA_EXPORTED`, `USER_ACCOUNT_ERASED`).

---

## Households — `/api/households`

| Method | Path | Auth / role | Body | Response |
|---|---|---|---|---|
| POST | `/` | bearer | `{ name }` (2–100 chars) | `HouseholdDto` |
| GET | `/` | bearer | — | `HouseholdDto[]` (the caller's households) |
| GET | `/:id` | member | — | `HouseholdDto` |
| POST | `/:id/invitations` | `PRIMARY_FILER` | `{ email, role }` | invitation + token |
| GET | `/invitations/:token/details` | public | — | `InvitationDetailsDto` |
| POST | `/invitations/accept` | bearer | `{ token }` | `HouseholdDto` |

**Invitations**
- `role` may only be `CO_FILER` or `VIEWER`; inviting a `PRIMARY_FILER` is rejected.
- Accepting requires the signed-in account's e-mail to match the invited address (**403** otherwise).
- An existing membership keeps its role; a revoked or expired invitation is refused.
- `InvitationDetailsDto` exposes the inviter, intended role, and expiry to the invitation page.

---

## Workspaces — `/api/households/:id/workspaces`

| Method | Path | Auth / role | Body | Response |
|---|---|---|---|---|
| GET | `/` | member | — | `TaxYearWorkspaceDto[]` |
| GET | `/:year` | member | — | `TaxYearWorkspaceDto` |
| POST | `/` | filer | `{ taxYear, residenceStatus?, taxClass? }` | `TaxYearWorkspaceDto` |
| GET | `/:year/readiness` | member | — | `WorkspaceReadinessDto` |

`initWorkspaceSchema` accepts tax years **2020–2035**; the engine itself only has rule packages for **2025, 2026, and 2028**, and `getRulePackage` refuses any other year rather than falling back.

`WorkspaceReadinessDto` reports overall and per-member percentages, critical warnings, missing documents, unconfirmed facts, and `canCalculate` / `canApprove`.

---

## Activity — `/api/households/:id/activity`

| Method | Path | Auth | Query | Response |
|---|---|---|---|---|
| GET | `/` | member | `workspaceId?`, `eventType?`, `limit?`, `offset?` | `AuditEventDto[]` |

Every active member can read the feed. Only `PRIMARY_FILER` / `CO_FILER` see the actor's e-mail, IP, user agent, and private-draft names; viewers receive redacted actor fields. Default page size is 50 where the service applies a default; pass `limit`/`offset` explicitly.

---

## Documents — `/api/workspaces/:workspaceId/documents`

| Method | Path | Role | Body | Response |
|---|---|---|---|---|
| POST | `/` | filer | `uploadDocumentSchema` | `DocumentDto` |
| GET | `/` | member | — | `DocumentDto[]` (visibility-filtered) |
| PATCH | `/:documentId/visibility` | filer | `{ visibility }` | `DocumentDto` |
| POST | `/:documentId/reextract` | filer | — | `DocumentDto` |
| DELETE | `/:documentId` | filer | — | `{ success: true }` |

`uploadDocumentSchema`: `fileName` (≤255), `fileContentBase64`, `mimeType` in `application/pdf`, `image/jpeg`, `image/png`, `image/webp`, `text/plain`; optional `ownerId`, `documentType`; `visibility` defaults to `PRIVATE_DRAFT`. Uploads **must** be `PRIVATE_DRAFT`; a non-private state is rejected and visibility is changed after upload. Maximum decoded upload size is **10 MiB**; the request body limit is 15 MiB to admit base64 overhead.

`visibility` values: `PRIVATE_DRAFT`, `SHARED_FOR_DISCUSSION`, `PROPOSED_FOR_RETURN`, `INCLUDED_IN_RETURN`, `ARCHIVED`.

`DocumentDto` includes `status` (`UPLOADED` / `PROCESSING` / `EXTRACTED` / `CONFIRMED` / `NEEDS_OCR` / `FAILED`), `extractionSource` (`TEXT_LAYER` / `EMBEDDED_TEXT` / `PLAIN_TEXT` / `VISION` / `OCR` / `NONE`), `ocrRequired`, `pageCount`, and `extractedFactsCount`. The current upload is synchronous: it creates the row as `EXTRACTED` or `NEEDS_OCR` (or `FAILED` on a reader error); `UPLOADED` and `PROCESSING` are retained for a future queue.

**Re-extraction** is audited as `DOCUMENT_REEXTRACTED`. Confirmed facts are not re-offered or deleted; only unconfirmed candidates are replaced. The stored path is resolved inside the upload directory before reading.

---

## Facts — `/api/workspaces/:workspaceId/facts`

| Method | Path | Role | Body | Response |
|---|---|---|---|---|
| GET | `/` | member | — | `{ extractedFacts, confirmedFacts }` |
| POST | `/confirm` | filer | `confirmFactSchema` | `ConfirmedFactDto` |
| POST | `/confirm-bulk` | filer | `confirmFactsBulkSchema` | `{ confirmed, skipped }` |
| PATCH | `/:factId` | filer | `updateFactSchema` | `ConfirmedFactDto` |
| DELETE | `/:factId` | filer | — | `{ success: true }` |

`confirmFactSchema`: optional `extractedFactId`, optional `ownerId`, `category` (`FactCategory`), `fieldKey` (1–100), `amount` (decimal string, up to 2 places), `currency` (3 chars, default `EUR`), `isSharedWithHousehold` (default true), `isIncludedInReturn` (default true), optional `description` (≤500).

`confirmFactsBulkSchema`: `extractedFactIds` (1–50 UUIDs), `isSharedWithHousehold`, `isIncludedInReturn`.

Bulk confirmation is atomic per fact and reuses the single-confirm path, so audit, approval invalidation, privacy checks, and retention triggers are identical. Already-confirmed, foreign-workspace, or unreadable ids appear in `skipped[]` with a `reason`; a retry is not blocked by its own history.

---

## Questionnaire — `/api/workspaces/:workspaceId`

| Method | Path | Role | Body | Response |
|---|---|---|---|---|
| GET | `/questionnaire` | member | — | `{ answers, readiness }` |
| PUT | `/questionnaire` | filer | `questionnaireSchema` | `{ answers, readiness }` |
| POST | `/tasks/:taskId/resolve` | filer | — | `{ success: true }` |

The questionnaire drives class assignment, plafond multipliers, the AEP route, the CIM gate, travel units, prior losses, the mixed-couple gate, and more. Important fields:

- `maritalStatus`: `SINGLE` / `MARRIED` / `PACS` / `DIVORCED` / `WIDOWED`
- `taxYear` (2020–2035) — dated answers may not be later than it
- `mortgageOccupancyYear` — the year the **valeur locative was fixed**, not the move-in year
- `childrenWithModeration`, `moderatedChildrenWithoutBenefit`, `childrenWithBonification`
- `childReliefHistory[]` — when supplied, overrides the scalar child counts and enforces the lifetime/alternating-residence rules
- `assessmentMode`, `reallocationPercentPrimary`
- `travelUnitsPrimary` / `travelUnitsSpouse`
- `savingsHousingSubscriberAge`, `art111bisContributors`
- `priorYearLosses` and `lossCarryForward[]`
- `spouseResidence`, `mixedCoupleCollectiveRequested`

Saving the questionnaire invalidates standing approvals (`APPROVAL_INVALIDATED`) because it can change the computed return.

---

## Calculations — `/api/workspaces/:workspaceId`

| Method | Path | Role | Body | Response |
|---|---|---|---|---|
| POST | `/calculate` | filer | — | `TaxCalculationResultDto` (persisted + audited `TAX_CALCULATED`) |
| GET | `/calculation` | member | — | `TaxCalculationResultDto \| null` |
| GET | `/scenario-comparison` | member | — | `ScenarioComparisonDto` |

`POST /calculate` reads confirmed, included facts and the questionnaire, runs the immutable rule package for the workspace year, persists a calculation snapshot, and updates the workspace estimate. It invalidates active approvals because the figure changed.

`GET /scenario-comparison` is **non-persisting**. It returns the three assessment modes (`COLLECTIVE`, `INDIVIDUAL_PURE`, `INDIVIDUAL_REALLOCATION`), each final liability, both deltas against collective, the rule-package version, merged warnings/unsupported notes, and `comparisonEligible` / `comparable`. Only a Class 2 couple with an assessed spouse is offered a meaningful comparison; other households receive identical collective results.

---

## Filing — `/api/workspaces/:workspaceId`

| Method | Path | Role | Body | Response |
|---|---|---|---|---|
| POST | `/approve` | filer | — | `ReturnVersionDto` |
| POST | `/filing-package` | filer | — | `FilingPackageDto` |
| POST | `/filing-record` | filer | `createFilingRecordSchema` | `FilingRecordDto` |
| POST | `/assessment` | filer | `importAssessmentSchema` | `AssessmentDto` |
| PATCH | `/assessment/:assessmentId/follow-up` | filer | `updateAssessmentFollowUpSchema` | `AssessmentDto` |
| POST | `/rollover` | filer | — | `{ nextWorkspaceId, nextTaxYear }` |
| GET | `/return-version` | member | — | `ReturnVersionDto \| null` |
| GET | `/return-versions` | member | — | `ReturnVersionHistoryDto` |
| GET | `/filing-package` | member | — | `FilingPackageDto \| null` |
| GET | `/filing-record` | filer | — | `FilingRecordDto \| null` |
| GET | `/filing-package/annexes.pdf` | member | — | PDF attachment (`X-Annex-Count`) |
| GET | `/assessment` | member | — | `AssessmentDto \| null` |

`createFilingRecordSchema`: `filedAt` (YYYY-MM-DD), `route` (`MYGUICHET_MANUAL` / `PAPER` / `OTHER`), optional `confirmationReference` (≤120), optional `notes` (≤1000).

`importAssessmentSchema`: `taxYear` (2020–2030), `bulletinDate` (YYYY-MM-DD), `assessedTaxableIncome`, `assessedTaxDue` (decimal strings), optional `notes`, optional `objectionDeadline` and `followUpAt`; when omitted, the API derives the objection deadline at +3 months and the follow-up at +30 days.

**Approvals.** A joint return needs every required approver (active filer members of a Class 2 return; otherwise one). A `VIEWER` never counts as a required approver. Any material change — fact confirm/update/delete, questionnaire save, document visibility change, document delete, persisted recalculation, freelance demo load — supersedes active approvals, sets the workspace to `NEEDS_REVIEW`, increments `activeReturnVersion`, and writes `APPROVAL_INVALIDATED`. `GET /return-versions` returns every version with `DRAFT` / `APPROVED` / `SUPERSEDED`, approval reasons, liability, and package flag.

**Package.** `FilingPackageDto` includes Form 100 case rows, missing-document checklist, and a SHA-256 checksum over the generated content. The annex PDF is built from included documents and returned as an attachment.

---

## Freelance — `/api/workspaces/:workspaceId/freelance`

| Method | Path | Role | Body / query | Response |
|---|---|---|---|---|
| GET | `/profiles` | member | — | `FreelanceBusinessProfileDto[]` |
| PUT | `/profiles/:ownerId` | filer | `updateFreelanceProfileSchema` | `FreelanceBusinessProfileDto` |
| GET | `/metrics` | member | `?ownerId=` | `FreelanceMetricsDto` |
| POST | `/demo` | filer | — | `{ success, count }` |

`updateFreelanceProfileSchema`: `businessName` (1–200), `activityType` (1–200), optional `taxIdOrVat` (≤50), `accountingType` (`CASH_BASIS` default / `ACCRUAL`).

Metrics aggregate revenue, categorised expenses, and net profit; `ownerId` scopes them to one spouse. Demo data is for demonstration and invalidates approvals.

---

## Notifications — `/api/workspaces/:workspaceId/notifications`

| Method | Path | Role | Body / query | Response |
|---|---|---|---|---|
| GET | `/` | member | `?unreadOnly=true` | `NotificationListDto` |
| GET | `/unread-count` | member | — | `{ unreadCount }` |
| PATCH | `/:notificationId/read` | member | — | `{ success: true }` |
| POST | `/read-all` | member | — | `{ updated }` |
| GET | `/preferences` | member | — | `NotificationPreferenceDto` |
| PUT | `/preferences` | member | `updateNotificationPreferencesSchema` | `NotificationPreferenceDto` |
| POST | `/devices` | member | `{ token, platform }` | `{ registered: true }` |
| POST | `/devices/revoke` | member | `{ token }` | `{ revoked: true }` |

`updateNotificationPreferencesSchema`: optional `emailEnabled`, `pushEnabled`, `mutedTypes` (≤11). `SECURITY_ALERT` cannot be muted (schema-level rejection).

Device tokens must match `^[A-Za-z0-9\[\]_-]{20,200}$`; `platform` is `ios`, `android`, or `web`. Re-registering an existing token is idempotent and reactivates a revoked token.

Preferences are per user **within the household** resolved by `HouseholdGuard`. Notification types: `HOUSEHOLD_INVITATION`, `DOCUMENT_CONFIRMATION_REQUIRED`, `MATERIAL_FIELD_CHANGED`, `MISSING_DOCUMENT`, `DEADLINE_REMINDER`, `RETURN_READY_FOR_REVIEW`, `APPROVAL_REQUESTED`, `APPROVAL_INVALIDATED`, `FILING_PACKAGE_GENERATED`, `ASSESSMENT_FOLLOW_UP`, `SECURITY_ALERT`.

E-mail and push delivery are decoupled through the outbox. `NOTIFICATION_OUTBOX_ENABLED=true` starts the poller; without it, notifications remain in-app only. See [workers codemap](CODEMAPS/workers.md).

---

## Admin — `/api/admin`

Every route requires `JwtAuthGuard` **and** `PlatformAdminGuard`: the account's e-mail must be listed in `ADMIN_EMAILS` (comma-separated, fails closed when unset) **and** the address must be verified.

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/overview` | — | `AdminOverviewDto` |
| GET | `/tax-rules` | — | `TaxRulePackageDto[]` |
| GET | `/deadlines` | — | `TaxDeadlineDto[]` |
| GET | `/forms` | — | `FormMappingDto[]` |
| GET | `/models` | — | `ModelDefinitionDto[]` |
| POST | `/models` | `createModelSchema` | `ModelDefinitionDto` |
| PUT | `/models/:id` | `updateModelSchema` | `ModelDefinitionDto` |
| DELETE | `/models/:id` | — | `{ success, message }` |
| POST | `/models/test` | `testModelConnectionSchema` | `TestModelConnectionResultDto` |
| GET | `/model-routes` | — | `ModelRouteDto[]` |
| PUT | `/model-routes/:id` | `updateModelRouteSchema` | `ModelRouteDto` |
| GET | `/evaluations` | — | `EvaluationRunDto[]` |
| GET | `/audit` | `?limit&offset` | `AuditEventDto[]` |

Model credentials are encrypted with AES-256-GCM using `MODEL_KEY_ENCRYPTION_KEY` (32 bytes hex). Endpoint URLs must pass `outbound-url-policy.ts`, which blocks loopback, link-local, and private ranges. A model route's `maxDataClass` is re-checked at call time, not only at registration.

Admin metadata is derived from `@luxtax/tax-engine`, not hardcoded. `GET /admin/overview` lists every **filing-ready** package: `activeTaxYears: [2025, 2026]` — 2025 stays listed because its filing window has not closed, and 2026 is in force from tax year 2026. `GET /admin/tax-rules` returns one entry per shipped package with a SHA-256 checksum of the package itself: 2025 and 2026 are `ACTIVE`, while 2028 is `DRAFT` (`singleClass`, modelling-only). Tax-year constants such as the Art. 111bis cap (€3,200 in 2025, €4,500 from 2026) and the energy-renovation amortisation rate (6% → 10% in 2026) live in the per-year packages and are never back-applied to 2025.

---

## Health and startup

There is no dedicated health route. Successful startup logs `Nest application successfully started`; a missing required environment variable aborts the process with `Refusing to start: …` listing every problem at once. `configurationProblems()` requires `JWT_ACCESS_SECRET` (≥32 chars, not the committed example) and `DATABASE_URL`; production additionally requires an https `FRONTEND_URL` and https `CORS_ORIGINS` entries.
