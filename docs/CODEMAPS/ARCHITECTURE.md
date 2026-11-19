# Architecture codemap

**Last updated:** 2026-11-19
**Scope:** the whole repository — `apps/api`, `apps/web`, `apps/mobile`, `packages/*`.
**Source of truth:** the code. Every path, module, and route below was matched against the tree on the date above.

---

## 1. System context

Lux-Tax is a Luxembourg personal income tax workspace for one household. A
household has one workspace per tax year; documents become proposed facts,
confirmed facts become a deterministic calculation, the calculation becomes an
approved return version, and the return version becomes a filing package and a
filing record. Every material action is audited.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                                   Clients                                    │
│                                                                              │
│  Next.js 16 web (apps/web, :3000)        Expo 52 mobile (apps/mobile)        │
│  React 19, Tailwind 4                    React Native 0.76, Expo Router 4    │
│  tokens in localStorage                  tokens in SecureStore               │
│  camera scan (browser)                   camera + document picker            │
│  optimistic UI + reload-on-write         offline queue, app lock, push       │
└───────────────┬──────────────────────────────────────────┬───────────────────┘
                │ HTTPS/JSON + Bearer access token         │ HTTPS/JSON
                ▼                                          ▼
┌──────────────────────────────────────────────────────────────────────────────┐
│                       NestJS 12 on Fastify 5 — apps/api :3001                │
│                                                                              │
│  Perimeter:  @fastify/helmet · Permissions-Policy · CORS allowlist           │
│              RateLimitGuard (APP_GUARD; on unless RATE_LIMIT_ENABLED=false)  │
│              JwtAuthGuard → HouseholdGuard → @Roles → PlatformAdminGuard     │
│                                                                              │
│  Modules:    auth · users · households · workspaces · audit · documents      │
│              facts · questionnaire · calculations · filing · freelance       │
│              notifications · admin                                           │
│                                                                              │
│  Cross-cut:  AllExceptionsFilter · hash-chained audit · return approvals     │
└───────┬──────────────────────────┬───────────────────────┬───────────────────┘
        │ Prisma 7 + pg            │ child_process         │ HTTPS
        ▼                          ▼                       ▼
┌──────────────────┐      ┌────────────────────┐   ┌───────────────────────────┐
│ PostgreSQL 15+   │      │ Tesseract CLI      │   │ SMTP relay                │
│ 28 models        │      │ (optional)         │   │ Expo Push API             │
│ 23 migrations    │      │ local OCR only     │   │ Vision-model endpoints    │
│ audit trigger    │      └────────────────────┘   │ (all optional)            │
└──────────────────┘                               └───────────────────────────┘

Local filesystem: upload directory (document bytes) + tmp/notifications/*.jsonl
```

PostgreSQL is the only **required** external service. Every other arrow in the
diagram degrades to a documented local state when unconfigured.

---

## 2. Runtime topology

| Process | Entry point | Port | State | Notes |
|---|---|---|---|---|
| API | `apps/api/src/main.ts` | `3001` (`PORT`) | PostgreSQL + upload directory | NestJS 12, Fastify 5, Prisma 7 |
| Web | `apps/web/src/app/layout.tsx` | `3000` | Browser localStorage | Next.js 16 App Router, all interactive pages are client components |
| Mobile | `apps/mobile/app/_layout.tsx` | Metro `8081` | SecureStore + AsyncStorage queue | Expo 52 / React Native 0.76 |
| Notification outbox | inside the API | — | `notification_deliveries` rows | Disabled unless `NOTIFICATION_OUTBOX_ENABLED=true` |
| Reminder sweep | inside the API | — | `assessments` rows | Disabled unless `NOTIFICATION_REMINDERS_ENABLED=true` |

There is no separate worker process, no Redis queue, and no external scheduler.

---

## 3. Layer and dependency rules

```
apps/web ─┐                         ┌─ @luxtax/api-client ─┐
          ├─ @luxtax/contracts ─────┤                      ├─ HTTP ─► apps/api
apps/mobile ┘  @luxtax/validation   └─ @luxtax/design-tokens
                                          ▲
apps/api ─────────────────────────────────┘
   │
   ├─ @luxtax/contracts     DTOs and enums at every boundary
   ├─ @luxtax/validation    Zod schemas at every runtime boundary
   └─ @luxtax/tax-engine    pure calculation, no I/O
```

Rules the tree follows today:

1. **`tax-engine` never imports an app or a third-party runtime library.** Its only
   dependency is `@luxtax/contracts` — shared DTO types and the `TaxClass` enum.
2. **A law figure lives in `packages/tax-engine/src/rules/*.ts`**, never in a
   controller, component, or service.
3. **A DTO is defined once** in `packages/contracts`. A client that needs a new
   field adds it there and updates the API response in the same change.
4. **A payload schema is defined once** in `packages/validation` and used by the
   API and any client that validates the same shape.
5. **The web and mobile apps do not talk to the database.** They use
   `LuxTaxApiClient` and the HTTP contract.
6. **`apps/api` imports packages, never the reverse.**

---

## 4. Application components

### 4.1 API modules

| # | Module | Route base | One-line responsibility |
|---|---|---|---|
| 1 | Auth | `/api/auth` | Register, Argon2id login, JWT refresh rotation, sessions, e-mail verification, TOTP MFA, logout |
| 2 | Users | `/api/users` | Profile, session list, GDPR export, irreversible erasure |
| 3 | Households | `/api/households` | Tenancy root, invitations, membership and roles |
| 4 | Workspaces | `/api/households/:id/workspaces` | One workspace per tax year, readiness score |
| 5 | Audit | `/api/households/:id/activity` | Append-only hash-chained ledger, filtered feed, viewer redaction |
| 6 | Documents | `/api/workspaces/:id/documents` | Upload guard, PDF text, OCR, vision extraction, visibility, re-extraction |
| 7 | Facts | `/api/workspaces/:id/facts` | Proposals → confirmed facts, inclusion and visibility rules |
| 8 | Questionnaire | `/api/workspaces/:id` | Tax profile answers, derived readiness, task resolution |
| 9 | Calculations | `/api/workspaces/:id` | Build engine params, calculate, snapshot, compare assessment modes |
| 10 | Filing | `/api/workspaces/:id` | Approvals, Form 100, package hash, annex PDF, filing record, assessment, rollover |
| 11 | Freelance | `/api/workspaces/:id/freelance` | Business profiles, revenue/expense metrics, demo dataset |
| 12 | Notifications | `/api/workspaces/:id/notifications` | In-app list, preferences, devices, outbox, reminders |
| 13 | Admin | `/api/admin` | Rule metadata, model registry, routing, probes, evaluations, audit |
| 14 | Prisma | — (global) | Pooled `PrismaClient` via `@prisma/adapter-pg` |

`ReturnApprovalsModule` (under `modules/filing/`) is a separate module so
documents, facts, questionnaire, calculations and freelance can invalidate
approvals without importing the entire filing surface.

### 4.2 Shared packages

| Package | Purpose | Runtime deps |
|---|---|---|
| `@luxtax/tax-engine` | Deterministic tax calculation with immutable 2025 / 2026 / 2028-preview rule packages | `@luxtax/contracts` |
| `@luxtax/contracts` | DTOs, enums, Form 100 and admin types | none |
| `@luxtax/validation` | Zod 4 schemas for every mutating payload | `zod` |
| `@luxtax/api-client` | Typed HTTP client with bearer token, single-flight refresh, blob download | `@luxtax/contracts` |
| `@luxtax/design-tokens` | Colour, typography, EN/FR/DE tax terminology | none |
| `@luxtax/config` | Shared `tsconfig.base.json` | none |

### 4.3 Client applications

| App | Shape | State model |
|---|---|---|
| `apps/web` | Six routes: `/`, `/login`, `/register`, `/invite/[token]`, `/[householdId]/dashboard`, Next.js `_not-found`. The dashboard is a nine-tab state machine. | `AuthProvider` + module-level `LuxTaxApiClient`; `localStorage` tokens |
| `apps/mobile` | Expo Router: entry, login, six tabs (activity hidden from the bar). | SecureStore tokens, offline FIFO queue, app-lock state machine |

See [frontend.md](frontend.md) for the route, view and library inventory.

---

## 5. Request lifecycle

```
HTTP request
  │
  ├─ Fastify body parser            limit 15 MiB (base64 of a 10 MiB upload)
  ├─ helmet                         CSP lockdown, HSTS 180d, frame deny, no-referrer
  ├─ Permissions-Policy hook        all sensor/payment features disabled
  ├─ CORS                           FRONTEND_URL + CORS_ORIGINS, credentials
  ├─ RateLimitGuard (APP_GUARD)     per-IP bucket every request;
  │                                 per-IP+email bucket on login/register/refresh
  ├─ JwtAuthGuard                   Bearer → JwtStrategy → req.user
  ├─ HouseholdGuard                 path household/workspace → ACTIVE membership
  │                                 + @Roles(PRIMARY_FILER | CO_FILER)
  ├─ PlatformAdminGuard             /api/admin only: ADMIN_EMAILS + verified e-mail
  ├─ Controller                     Zod safeParse → service
  ├─ Service                        Prisma + audit + notifications + tax engine
  └─ AllExceptionsFilter            safe 4xx text; generic 5xx; DB errors never exposed
```

Two details that are easy to break:

- `HouseholdGuard` resolves the household from **path parameters only** — never
  from the body. Services may trust the id but must still scope every query by
  `householdId`/`workspaceId`.
- The global rate limiter runs **before** authentication, so its per-user bucket
  is inert there; credential endpoints are protected by the IP+email bucket.

---

## 6. Domain model and ownership

```
User ──1:1── PersonProfile
User ──*── Session
User ──*── HouseholdMembership *──1 Household
User ──*── HouseholdInvitation (invitedBy) *──1 Household
Household ──*── Dependant
Household ──*── TaxYearWorkspace          (one per household per year)
Household ──*── AuditEvent
Household ──*── Notification / NotificationPreference

TaxYearWorkspace ──*── Document ──*── DocumentExtraction
Document ──*── ExtractedFact ──0..1── ConfirmedFact
TaxYearWorkspace ──*── ConfirmedFact *──1 User (owner)
TaxYearWorkspace ──1:1── TaxProfile
TaxYearWorkspace ──*── MissingInformationItem
TaxYearWorkspace ──*── CalculationSnapshot
TaxYearWorkspace ──*── ReturnVersion ──*── ReturnApproval *──1 User
ReturnVersion ──1:1── FilingPackage
ReturnVersion ──1:0..1── FilingRecord
TaxYearWorkspace ──0..1── FilingRecord
TaxYearWorkspace ──*── Assessment
TaxYearWorkspace ──*── FreelanceBusinessProfile *──1 User
```

The tenancy chain is **User → Household → TaxYearWorkspace → everything**. The
full schema, enums, indexes and migration list are in [database.md](database.md).

---

## 7. Core flows

### 7.1 Authentication and tenancy

```
POST /api/auth/register
  → validate email/password → Argon2id hash → User + PersonProfile
  → issue e-mail verification token (SHA-256 stored) → send via e-mail transport
  → AuthResponseDto { user, tokens }

POST /api/auth/login
  → verify Argon2id → if MFA enabled require TOTP/recovery code
  → Session { refreshTokenHash, familyId, IP, user agent, expiry }
  → access token 15 min + rotating refresh token

Protected request
  → JwtAuthGuard → HouseholdGuard (ACTIVE membership) → @Roles
  → PlatformAdminGuard only on /api/admin
```

### 7.2 Document → fact

```
POST /documents (base64, ≤10 MiB decoded)
  → upload-guard: MIME allowlist, magic-byte sniff, safe extension, path resolution
  → bytes written under the upload directory; SHA-256 recorded
  → readDocumentText:
       PDF   → native text layer (zlib/ObjStm/CMap)  → TEXT_LAYER
       text  → PLAIN_TEXT
       image → NONE
  → if no text and a vision route exists → model chain (20 s each, data-class gate)
  → if still no text and OCR configured → Tesseract (image, or page images from PDF)
  → deterministic certificate parser + vision/OCR parser
  → DocumentExtraction + ExtractedFact proposals
  → status EXTRACTED | NEEDS_OCR | FAILED

POST /facts/confirm | /facts/confirm-bulk
  → the only path that creates a ConfirmedFact
  → owner, category, inclusion, visibility
  → invalidate standing approvals
```

### 7.3 Calculation

```
Questionnaire answers ─┐
Confirmed facts ───────┼─→ CalculationsService
Household members ─────┤      ├─ class-resolution (tax class, assessment mode, Art. 119 n° 3)
Workspace tax year ────┘      ├─ fact aggregation by owner and category
                              ├─ TaxCalculationParams
                              └─ LuxembourgTaxEngine.calculate(params)
                                     ├─ immutable RulePackage for the year
                                     ├─ income categories (employment, pension,
                                     │   capital ledger, rental register, foreign
                                     │   treaty relief, freelance profit, gains)
                                     ├─ deductions (frais, travel, mortgage, 111,
                                     │   111bis, savings housing, LRCP, donations,
                                     │   extraordinary, AEP, AMVP, prior losses)
                                     ├─ credits (CIS/CIP/CII/CO2, CISSM, CIM,
                                     │   child relief, foreign ordinary credit)
                                     ├─ scale + solidarity + rounding
                                     └─ provenance[], warnings[], unsupported[]

POST /calculate
  → CalculationSnapshot (append-only, SHA-256 of canonical JSON)
  → workspace.estimatedTaxBalance + calculationResult
  → TAX_CALCULATED audit event
  → invalidate standing approvals

GET /scenario-comparison
  → collective / individual-pure / individual-reallocation
  → never persisted, never invalidates
```

### 7.4 Approval → filing package → filing record

```
POST /approve
  → requiredApprovers = active filer members of a Class 2 return, else 1
  → ReturnVersion frozen when every required approver has approved

Any material write (document, fact, questionnaire, calculation, freelance)
  → ReturnApprovalsService.invalidateForChange
  → approvals superseded (never deleted), APPROVAL_INVALIDATED emitted

POST /filing-package
  → Form 100 page/sheet/case map + spouse columns
  → unsupported certificate codes preserved
  → annex evidence + SHA-256 package hash + append-only evidence history

GET /filing-package/annexes.pdf
  → dependency-free PDF assembled from annex descriptors

POST /filing-record
  → one record per workspace; freezes the matching return version
  → route MYGUICHET_MANUAL | PAPER | OTHER
```

### 7.5 Assessment → rollover

```
POST /assessment (bulletin import)
  → variance against declared figures
  → objection deadline = bulletin + 3 months; follow-up = +30 days (unless supplied)
  → unique (workspaceId, taxYear): a second import is an amendment

PATCH /assessment/:id/follow-up → corrected dates
POST /rollover → next year's workspace; profile/dependants copied, figures re-confirmed
```

### 7.6 Notifications

```
Material event
  → NotificationsService writes the in-app Notification first (optional dedupeKey)
  → NotificationOutboxService.enqueue creates one NotificationDelivery per channel
  → poller claims PENDING → SENDING, calls EmailAdapter / PushAdapter
  → SENT | retry with 1 min → 5 min → 25 min → 1 h | FAILED | SKIPPED

Deadline sweep
  → open assessments with objection deadline inside 30 days
  → one DEADLINE_REMINDER per assessment per day (dedupeKey)
```

### 7.7 Audit

```
Every material service action
  → AuditService.logEvent
  → previous hash for the household + canonical JSON → SHA-256
  → AuditEvent row (actor may be null for a failed login)
  → database trigger rejects UPDATE/DELETE unless the purge role opts in
```

---

## 8. Cross-cutting invariants

1. **The tax engine is pure.** No I/O, no ambient time, no mutation of `params`.
2. **A rule package is immutable.** A correction is a new package version, never
   an edit that would change a historical result.
3. **Facts are proposals until confirmed.** Extraction cannot write a return
   figure directly.
4. **Every material write invalidates approvals.** New write paths must call
   `ReturnApprovalsService.invalidateForChange`.
5. **Audit events are append-only.** Physical deletion requires the
   `luxtax_audit_purge` role and `SET LOCAL luxtax.allow_audit_purge = 'on'`.
6. **Household isolation is enforced twice.** Guard-level membership plus
   query-level household/workspace filters.
7. **Secrets fail closed.** `JWT_ACCESS_SECRET` and `DATABASE_URL` have no
   defaults; `ADMIN_EMAILS` unset means no platform administrators.
8. **Unsupported input is reported, not guessed.** The engine returns
   `warnings[]` / `unsupported[]`; do not replace that with a silent zero.
9. **No document content leaves the machine by default.** Vision models are
   opt-in per route and limited by data class; OCR is local.
10. **The filed snapshot cannot change.** Recording a filing freezes the return
    version; a correction is a new version.

---

## 9. Build, test, and run

| Concern | Command | Evidence |
|---|---|---|
| Install | `pnpm install` | workspace + `apps/mobile` included |
| Type checks | `pnpm run typecheck` | builds contracts, validation, design-tokens, api-client, tax-engine |
| All builds | `pnpm run build` | turbo across apps and packages |
| API dev | `pnpm --filter @luxtax/api dev` | Nest watch on `:3001` |
| Web dev | `pnpm --filter @luxtax/web dev` | Next on `:3000` |
| Mobile | `pnpm --filter @luxtax/mobile start` | Expo / Metro |
| DB migrate | `pnpm --filter @luxtax/api prisma:migrate` | 23 migrations |
| Seed | `pnpm seed` | demo accounts and workspace |
| DB drift | `npx prisma migrate diff --from-config-datasource --to-schema apps/api/prisma/schema.prisma --exit-code` | must exit 0 |
| Engine tests | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/*.spec.ts` | 214 / 214 |
| API tests | same pattern, `apps/api/test/*.spec.ts` | 449 collected, 2 skip without Tesseract |
| Web tests | `--tsconfig tsconfig.render.json --test apps/web/test/*.spec.ts` | 80 collected; 10 harness failures |
| Mobile tests | `--tsconfig tsconfig.test.json --test apps/mobile/test/*.spec.ts` | 134 / 134 |

---

## 10. Deliberate non-architecture

| Not present | Why |
|---|---|
| Redis / external queue | The outbox is PostgreSQL-backed; `ioredis` is installed but unused |
| Object storage (S3) | Uploads are local files behind a path-traversal guard |
| Government API (MyGuichet/ACD) | Filing is a generated package plus a manual record |
| Payment / billing | Out of scope for a tax workspace |
| Vendor OCR / model SDK | The contract is plain HTTPS; Tesseract is a host binary |
| Server-side rendering of dashboard data | The current web build is intentionally client-fetched |

---

## Related

- [Module map](MODULES.md) — every package and API module, exports and dependencies
- [File map](FILES.md) — directory structure and file purposes
- [Backend](backend.md) — module details, guards, configuration
- [Database](database.md) — models, enums, migrations, invariants
- [Frontend](frontend.md) — web routes, dashboard tabs, mobile screens
- [Integrations](integrations.md) — PostgreSQL, SMTP, Expo push, vision models, Tesseract
- [Workers](workers.md) — outbox and reminder loops
- [API reference](../api.md) — every route and payload
