# Backend codemap

**Last updated:** 2026-11-19
**Entry points:** `apps/api/src/main.ts`, `apps/api/src/app.module.ts`
**Framework:** NestJS 12 on Fastify 5, Prisma 7 (`@prisma/adapter-pg`), PostgreSQL
**Port:** `3001` (`PORT`)
**API reference:** [../api.md](../api.md)

---

## Boot sequence

```
main.ts
  ├─ import './config/load-env'          # loads nearest .env (cwd → 3 parents)
  ├─ FastifyAdapter
  │    ├─ bodyLimit 15 MiB               # base64 of a 10 MiB upload
  │    ├─ trustProxy = resolveTrustProxy(TRUST_PROXY)
  │    └─ logger only in development
  ├─ AppModule
  │    └─ AuthModule import-time assertRuntimeConfig()
  │         requires JWT_ACCESS_SECRET (≥32, not the committed example)
  │         requires DATABASE_URL
  │         production also validates https FRONTEND_URL/CORS_ORIGINS
  ├─ helmet (CSP lockdown, HSTS 180d, frame deny, no-referrer)
  ├─ Permissions-Policy hook
  ├─ CORS (FRONTEND_URL / CORS_ORIGINS, credentials, all methods)
  ├─ AllExceptionsFilter
  └─ listen 0.0.0.0:PORT
```

`loadEnvironment` is imported before any module, because `auth.module.ts` reads configuration at import time. On Node < 20.12 the shell must supply the variables.

---

## Request lifecycle

```
Fastify request
  → @fastify/helmet headers
  → CORS
  → APP_GUARD RateLimitGuard (IP bucket; credential bucket on login/register/refresh)
  → JwtAuthGuard (per controller)
      → Bearer token → JwtStrategy → req.user { id, email, ... }
  → HouseholdGuard (household/workspace routes)
      → loads membership, attaches req.householdMembership
      → 403 for non-members, removed members, or a foreign workspace id
  → @Roles(PRIMARY_FILER | CO_FILER) on writes
  → PlatformAdminGuard on /api/admin
      → ADMIN_EMAILS allowlist (fail closed) + verified e-mail
  → controller: Zod safeParse → service
  → service: Prisma + audit + notifications + tax engine
  → AllExceptionsFilter
```

`HouseholdGuard` is the only place that resolves a workspace's household. A controller must not re-implement that lookup with a client-supplied id.

---

## Modules

| Module | Controller base | Service responsibilities | Depends on |
|---|---|---|---|
| **Auth** | `/api/auth` | Registration, Argon2id hashing, login, refresh rotation, sessions, e-mail verification, TOTP MFA, logout | `AuditModule` |
| **Users** | `/api/users` | Profile, session list, GDPR export, irreversible erasure | `AuditModule` |
| **Households** | `/api/households` | Create/list/get household, invitations, membership, roles | `AuditModule`, `NotificationsModule` |
| **Workspaces** | `/api/households/:id/workspaces` | Create by year, get, list, readiness scoring | `AuditModule` |
| **Audit** | `/api/households/:id/activity` | Append-only hash-chained ledger, filtered feed, role-based redaction | Prisma |
| **Documents** | `/api/workspaces/:workspaceId/documents` | Upload guard, text/PDF/OCR/vision extraction, visibility, re-extraction, deletion | `AuditModule`, `AdminModule`, `ReturnApprovalsModule`, `NotificationsModule` |
| **Facts** | `/api/workspaces/:workspaceId/facts` | List, confirm one/bulk, update, delete, visibility/inclusion rules | `AuditModule`, `NotificationsModule`, `ReturnApprovalsModule` |
| **Questionnaire** | `/api/workspaces/:workspaceId` | Load/save profile, derive readiness and tasks, resolve tasks | `ReturnApprovalsModule` |
| **Calculations** | `/api/workspaces/:workspaceId` | Build `TaxCalculationParams`, call the engine, persist snapshot, compare modes | `AuditModule`, `ReturnApprovalsModule`, `@luxtax/tax-engine` |
| **Filing** | `/api/workspaces/:workspaceId` | Approval, Form 100 mapping, package + SHA-256, annexes PDF, filing record, assessment, rollover, version history | `AuditModule`, `NotificationsModule`, `ReturnApprovalsModule` |
| **Freelance** | `/api/workspaces/:workspaceId/freelance` | Business profiles, per-owner metrics, demo dataset | `AuditModule`, `ReturnApprovalsModule` |
| **Notifications** | `/api/workspaces/:workspaceId/notifications` | In-app notifications, preferences, devices, outbox, reminder sweep | Prisma |
| **Admin** | `/api/admin` | Overview, rule/form metadata, model registry, routes, connection test, audit | `AuthModule` |

`ReturnApprovalsModule` is a separate module (not the filing module) so documents, facts, questionnaire, calculations, and freelance can invalidate approvals without importing the whole filing surface.

---

## Module details

### Auth

Files: `auth.controller.ts`, `auth.service.ts`, `jwt.strategy.ts`, `secret-box.ts`, `totp.ts`, `email-verification.ts`.

- Argon2id with memory 64 MiB, time cost 3.
- Password policy: 8–128 characters, at least one letter and one digit, common-password denylist.
- Access token 15 min; refresh token rotation on `POST /refresh`.
- `Session` records IP and user agent so a user can spot an unfamiliar sign-in.
- TOTP seed sealed with a key derived from `JWT_ACCESS_SECRET` via HKDF with a distinct info label; recovery codes stored hashed.
- Failed logins (including an invalid second factor) are audited (`USER_LOGIN_FAILED`); a missing code returns `MFA_REQUIRED` and is not counted as a failure.
- Email verification token stored as SHA-256; link base is `FRONTEND_URL`.

### Audit

Files: `audit.service.ts`, `audit-chain.ts`, `audit-redaction.ts`.

- Each event carries `previousHash`/`hash`; the chain is verified by `audit-chain.ts` and its spec.
- `USER_LOGIN_FAILED` deliberately has no actor.
- Viewers see the feed but not actor e-mail/IP/user-agent or private-draft names.
- Database triggers reject `UPDATE`/`DELETE` unless the purge role and transaction opt-in are present.

### Documents

Files: `documents.controller.ts`, `documents.service.ts`, `upload-guard.ts`, `text/document-text.ts`, `text/pdf-text.ts`, `text/pdf-images.ts`, `ocr/ocr-engine.ts`, `extraction/vision-contract.ts`, `receipt-ai-vision.service.ts`.

Pipeline:

```
upload (base64)
  → upload-guard: MIME allowlist, 10 MiB decoded cap, safe extension
  → store bytes under the upload directory
  → readDocumentText(buffer, mime):
       PDF  → pdf-text.ts (TEXT_LAYER) or NONE
       text → PLAIN_TEXT
       image→ NONE (needs OCR)
  → if NONE and a vision route exists → call models in order (20 s timeout)
  → if still NONE and OCR_TESSERACT_PATH exists:
       image → Tesseract
       PDF   → pdf-images.ts (largest image per page) → Tesseract
  → parse fields:
       deterministic certificate codes 101/102/103/105/141/S/P/LRCP
       vision answer through parseVisionExtraction
       OCR text through the same parser
  → DocumentExtraction { source, modelUsed, reason, rawJson }
  → ExtractedFact proposals
  → Document.status EXTRACTED | NEEDS_OCR | FAILED
```

Guards that matter:

- Confirmed facts are never replaced by re-extraction; the link is `onDelete: SetNull`.
- The stored path is resolved inside the upload directory before any read.
- Pages capped at 10 and pixels at 60 M.
- Unsupported image encodings are skipped, not fed to OCR.
- `OCR_TESSERACT_PATH` missing/nonexistent → `NOT_CONFIGURED` before spawning.

### Facts

Files: `facts.service.ts`, `fact-visibility.ts`, `fact-visibility-query.ts`, `fact-snapshot.ts`, `household-owner.ts`, `@luxtax/contracts/fact-category.ts`.

- Category resolution is shared server/client (`factCategoryForFieldName`).
- `confirmFact` is the only path that creates a `ConfirmedFact`; bulk calls it per id.
- Every confirm/update/delete invalidates approvals through `ReturnApprovalsService`.
- Visibility: `PRIVATE_DRAFT`, `SHARED_FOR_DISCUSSION`, `PROPOSED_FOR_RETURN`, `INCLUDED_IN_RETURN`, `ARCHIVED`.
- Only `isIncludedInReturn` facts feed the engine.
- `fact-snapshot.ts` freezes the facts used by a calculation.

### Calculations

Files: `calculations.service.ts`, `calculation-history.ts`, `calculation-snapshot.ts`, `class-resolution.ts`.

- `class-resolution.ts` derives the effective class from marital status, ages, child counts, death/divorce years, and the Art. 119 n° 3 window. Components and engine share one resolved household situation.
- `calculateTax` loads confirmed included facts + questionnaire, builds `TaxCalculationParams`, calls `LuxembourgTaxEngine.calculate`, persists a `CalculationSnapshot`, updates `estimatedTaxBalance`, invalidates approvals, writes `TAX_CALCULATED`.
- `getLatestCalculation` returns the persisted DTO.
- `compareScenarios` calls `compareAssessmentModes` and **never persists** or invalidates.

### Filing

Files: `filing.service.ts`, `form100-case-map.ts`, `form100-fact-lines.ts`, `annex-pdf.service.ts`, `annex-pdf.builder.ts`, `filing-package-evidence.ts`, `filing-year-guard.ts`, `assessment-dates.ts`, `return-approvals.service.ts`, `return-version-history.ts`.

- Form 100 map emits page/sheet/case rows with spouse columns and `personName`.
- Package checksum is SHA-256 over the generated evidence.
- Annex PDF builder is dependency-free; `annex-pdf.spec.ts` covers structure.
- Approvals: `requiredApprovers` = active filer members of a Class 2 return, else 1; a `VIEWER` never counts. `invalidateForChange` supersedes all active approvals in one pass.
- Assessment import derives the objection deadline (+3 months) and follow-up (+30 days) unless supplied.
- Rollover copies profile/dependants to the next year's workspace; figures still require confirmation.

### Freelance

Files: `freelance.service.ts`.

- Profiles are per owner per workspace (`FreelanceBusinessProfile`).
- Metrics aggregate invoices/expenses into revenue, categorised expenses, and net profit.
- Demo load writes sample revenue/expenses and invalidates approvals.

### Notifications

Files: `notifications.service.ts`, `notification-outbox.service.ts`, `notification-outbox.ts`, `notification-delivery.ts`, `notification-devices.service.ts`, `notification-reminders.service.ts`, `notification-rules.ts`, adapters under `adapters/`.

- In-app notification is written first; delivery rows are enqueued beside it.
- Preferences are per user per household; `SECURITY_ALERT` cannot be muted.
- `NotificationOutboxService` polls only when `NOTIFICATION_OUTBOX_ENABLED=true`.
- `NotificationRemindersService` polls only when `NOTIFICATION_REMINDERS_ENABLED=true`.
- Adapters: SMTP (`nodemailer`-free custom transport on `node:net`/`tls`) with JSONL sink fallback; Expo Push HTTP transport with sink fallback.
- See [workers](workers.md) and [integrations](integrations.md).

### Admin

Files: `admin.service.ts`, `model-key-cipher.ts`, `outbound-url-policy.ts`, `data-class-policy.ts`, `platform-admin.ts` (common).

- Model API keys encrypted AES-256-GCM with `MODEL_KEY_ENCRYPTION_KEY`; never returned in plaintext.
- `outbound-url-policy.ts` blocks non-https (except explicit localhost in development), loopback, link-local, private ranges, and metadata endpoints.
- `data-class-policy.ts` enforces the route's `maxDataClass` at call time.
- Built-in model catalog is returned; custom models may override endpoints and keys.
- Overview/tax-rules metadata is derived from the engine: `activeTaxYears` = non-preview packages (`[2025, 2026]`: 2025's window is still open, 2026 is in force for its own tax year); tax-rules summarises every package and marks 2028 `DRAFT`. Per-year constants are never back-applied (111bis €3,200 → €4,500, renovation 6% → 10% from 2026).
- Connection probe performs a minimal request and reports latency/status without leaking the key.

---

## Data flow: calculation inputs

```
Questionnaire answers ─┐
Confirmed facts ───────┼─→ CalculationsService
Household members ─────┤      ├─ class-resolution → taxClass/assessmentMode
Workspace tax year ────┘      ├─ fact aggregation by owner/category
                              ├─ TaxCalculationParams
                              └─ LuxembourgTaxEngine.calculate
                                     ├─ rule package (2025/2026/2028)
                                     ├─ income categories
                                     ├─ deductions
                                     ├─ scale + solidarity
                                     ├─ credits + child relief
                                     └─ provenance/warnings/unsupported
```

A fact that is private to a spouse is only included when the query allows the acting user to see it; the engine never receives a fact the caller cannot read.

---

## Configuration

| Variable | Required | Default | Effect |
|---|---|---|---|
| `DATABASE_URL` | yes | — | Prisma connection |
| `JWT_ACCESS_SECRET` | yes | — | JWT signing and MFA seed derivation; ≥32 chars; committed example rejected |
| `PORT` | no | `3001` | Listen port |
| `FRONTEND_URL` | production | `http://localhost:3000` | Verification link base, default CORS origin |
| `CORS_ORIGINS` | no | `FRONTEND_URL` | Extra allowed browser origins |
| `ADMIN_EMAILS` | no | empty (fail closed) | Platform admin allowlist |
| `RATE_LIMIT_*` | no | 60/1 IP, 120/2 user | Token buckets |
| `TRUST_PROXY` | no | off | Hop count or CIDR list for `X-Forwarded-For` |
| `EXPOSE_ERROR_DETAILS` | no | `false` | Re-enable 5xx text (never DB errors) |
| `PRISMA_LOG_QUERIES` | no | `false` | Log bound parameters |
| `MODEL_KEY_ENCRYPTION_KEY` | for custom models | — | 32-byte hex AES-256-GCM key |
| `SMTP_*`, `NOTIFICATION_EMAIL_SINK` | no | JSONL sink | E-mail transport |
| `NOTIFICATION_OUTBOX_ENABLED` | no | `false` | Start delivery poller |
| `NOTIFICATION_PUSH_ENABLED`, `EXPO_*` | no | `false` | Expo push |
| `NOTIFICATION_REMINDERS_ENABLED` | no | `false` | Deadline sweep |
| `OCR_TESSERACT_PATH`, `OCR_LANGUAGES`, `OCR_PSM` | no | — / `fra` / `6` | Local OCR |
| `REDIS_URL` | no | — | **Accepted but unused** |

---

## External dependencies

- `@nestjs/*` 12, `fastify` 5, `@fastify/helmet`, `@fastify/rate-limit` (installed but not registered; the active limiter is the in-process guard)
- `@prisma/client` 7, `@prisma/adapter-pg`, `pg`
- `argon2`, `passport`, `passport-jwt`, `@nestjs/jwt`
- `ioredis` (unused), `rxjs`, `reflect-metadata`
- `@luxtax/contracts`, `@luxtax/tax-engine`, `@luxtax/validation` (workspace)

No native PDF library, no OCR npm package, no model SDK: PDF parsing uses `node:zlib`; OCR shells out to a host-installed Tesseract; vision calls use `fetch`.

---

## Tests

| File group | Covers |
|---|---|
| `auth-hardening.spec.ts`, `mfa-totp.spec.ts`, `platform-admin.spec.ts`, `rate-limit.spec.ts`, `proxy-trust.spec.ts`, `security-headers.spec.ts` | Auth and perimeter |
| `document-text.spec.ts`, `pdf-text.spec.ts`, `pdf-images.spec.ts`, `ocr-engine.spec.ts`, `ocr-pipeline.spec.ts`, `vision-contract.spec.ts`, `document-pipeline.spec.ts`, `document-upload-guard.spec.ts` | Document pipeline |
| `fact-visibility.spec.ts`, `fact-return-snapshot.spec.ts`, `param-wiring.spec.ts` | Facts and calculation inputs |
| `calculation-history.spec.ts`, `calculation-snapshot.spec.ts`, `class-resolution.spec.ts` | Calculation persistence and class logic |
| `form100-case-map.spec.ts`, `form100-fact-lines.spec.ts`, `filing-package-evidence.spec.ts`, `filing-year-guard.spec.ts`, `return-version-history.spec.ts`, `annex-pdf.spec.ts`, `assessment-dates.spec.ts` | Filing |
| `notification-*.spec.ts`, `smtp-transport.spec.ts`, `expo-push-transport.spec.ts` | Notifications |
| `admin-*.spec.ts` | Admin governance |
| `*.e2e-spec.ts` | HTTP journeys (Jest; see README limitation) |

---

## Related

- [API reference](../api.md)
- [Database](database.md)
- [Integrations](integrations.md)
- [Workers](workers.md)
- [Document automation](../document-automation.md)
- [Data retention](../data-retention.md)
