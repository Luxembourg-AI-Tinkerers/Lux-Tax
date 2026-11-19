# File map

**Last updated:** 2026-11-19
**Scope:** the repository as it exists on disk. Generated folders
(`node_modules`, `dist`, `.next`, `.turbo`, `.tmp-*`) are excluded.
**Source of truth:** the tree. Every path below was verified on the date above.

Related: [Architecture](ARCHITECTURE.md) · [Modules](MODULES.md) · [Backend](backend.md) · [Frontend](frontend.md)

---

## 1. Root

| Path | Purpose |
|---|---|
| `package.json` | Workspace scripts: `build`, `dev`, `lint`, `test`, `typecheck`, `format`, `seed` |
| `pnpm-workspace.yaml` | Workspaces `packages/*`, `apps/api`, `apps/web`, `apps/mobile`; dependency overrides |
| `pnpm-lock.yaml` | Single lockfile for every workspace |
| `turbo.json` | Turborepo task graph |
| `tsconfig.api.json` | API build/test project references |
| `tsconfig.build-contracts.json` | Contracts build |
| `tsconfig.build-validation.json` | Validation build |
| `tsconfig.packages.json` | Shared packages project |
| `tsconfig.render.json` | Mobile render-test transform (React 18 + react-native shim) |
| `tsconfig.web.json` | Web render/client suites (React 19 + `next/navigation` shim) |
| `tsconfig.test.json` | Node-test transform for `.tools` |
| `.env.example` | Every supported environment variable, with defaults and failure behaviour |
| `.npmrc` | pnpm settings |
| `README.md` | Product overview, setup, testing, documentation index |
| `LICENSE` | MIT |
| `.github/dependabot.yml` | Dependency update configuration |
| `apps/` | API, web and mobile applications |
| `packages/` | Six shared workspace packages |
| `docs/` | API reference, codemaps, legal/design notes |
| `audit/` | Dated audit evidence (historical) |
| `research/` | Legal/product research inputs (historical sources) |
| `workflows/` | `gap-closure.workflow.ts` — historical workflow definition |
| `uploads/` | Local document storage root used by the API |
| `tmp/` | Local scratch/output (notifications JSONL, fixtures) |
| `.tools/` | Historical one-off maintenance scripts and the pinned `tsx` runner; not application source |
| `extract_100.py`, `lir_arts.txt`, `lir2025.pdf`, `lir2026.pdf`, `100f-2025.pdf` | Legal source material used to build the rule packages |

Root-level Markdown reports (`implementation-tracker.md`, `gap-*.md`,
`*-review-*.md`, `site-e2e-*.md`, `build-verification-*.md`) are dated
historical evidence, not current status pages. The current set is
`docs/` plus `docs/CODEMAPS/`.

---

## 2. `apps/api` — NestJS 12 API

### 2.1 Entry and bootstrap

| File | Purpose |
|---|---|
| `src/main.ts` | Loads `.env`, creates Fastify adapter (15 MiB body limit, proxy trust), registers helmet + Permissions-Policy, enables CORS, installs the exception filter, listens on `0.0.0.0:PORT` |
| `src/app.module.ts` | Imports 14 modules; registers `RateLimitGuard` as `APP_GUARD` |
| `prisma/schema.prisma` | 28 models, all enums and indexes |
| `prisma/seed.ts` | Demo accounts, household, workspace, profiles |
| `prisma/migrations/` | 23 chronological migrations (see [database.md](database.md)) |
| `prisma.config.ts` | Prisma 7 CLI configuration (datasource URL) |
| `nest-cli.json`, `tsconfig.json` | Nest build configuration |
| `package.json` | Nest build, Jest unit/e2e, Prisma scripts, seed |
| `test/jest-e2e.json` | Jest e2e configuration |

App-level config: `nest-cli.json`, `tsconfig.json`.

### 2.2 `src/config/`

| File | Purpose |
|---|---|
| `load-env.ts` | Nearest-first `.env` loader, imported before any module |
| `runtime-config.ts` | Required-secret and production-URL checks; `ConfigurationError` |
| `cors-origins.ts` | `CORS_ORIGINS` / `FRONTEND_URL` parser |
| `proxy-trust.ts` | `TRUST_PROXY` parser (false / true / hops / CIDR) |

### 2.3 `src/common/`

| File | Purpose |
|---|---|
| `auth/platform-admin.ts` | `parseAdminEmails`, `isPlatformAdminEmail` |
| `decorators/current-user.decorator.ts` | `@CurrentUser()` |
| `decorators/roles.decorator.ts` | `@Roles(...)` metadata |
| `filters/http-exception.filter.ts` | `AllExceptionsFilter`; safe 4xx/5xx, no DB details |
| `guards/household.guard.ts` | Household resolution + `ACTIVE` membership + roles |
| `guards/jwt-auth.guard.ts` | Passport JWT guard |
| `guards/platform-admin.guard.ts` | Admin allowlist + verified e-mail |
| `guards/rate-limit.guard.ts` | Global token-bucket guard, credential bucket |
| `rate-limit/token-bucket.ts` | `TokenBucketLimiter`, defaults, headers |

### 2.4 `src/modules/admin/`

| File | Purpose |
|---|---|
| `admin.controller.ts` | `/api/admin` routes: overview, tax-rules, deadlines, forms, models CRUD, test, model-routes, evaluations, audit |
| `admin.service.ts` | Engine-derived metadata, model registry, probing, route governance, seeding |
| `admin.module.ts` | Module wiring |
| `data-class-policy.ts` | Data-class order and route/model compatibility |
| `model-key-cipher.ts` | AES-256-GCM encryption of model API keys |
| `outbound-url-policy.ts` | SSRF policy: https, loopback/private/link-local/metadata denial |

### 2.5 `src/modules/audit/`

| File | Purpose |
|---|---|
| `audit.controller.ts` | `GET /api/households/:id/activity` |
| `audit.service.ts` | Append event, compute hash, read filtered activity |
| `audit-chain.ts` | Canonical JSON, event hash, chain verification, category mapping |
| `audit-redaction.ts` | Viewer-level redaction of actors and private drafts |
| `audit.module.ts` | Module wiring |

### 2.6 `src/modules/auth/`

| File | Purpose |
|---|---|
| `auth.controller.ts` | Register, login, refresh, verify, resend, MFA enrol/activate/disable, logout |
| `auth.service.ts` | Argon2id, token issue/rotation, sessions, MFA, verification |
| `jwt.strategy.ts` | Bearer validation and `tokenVersion` check |
| `secret-box.ts` | AES-256-GCM seal/open for the MFA seed |
| `totp.ts` | RFC 6238 TOTP, base32, recovery codes |
| `email-verification.ts` | Token issue/hash, link and message, email adapter |
| `auth.module.ts` | Import-time `assertRuntimeConfig()` and module wiring |

### 2.7 `src/modules/calculations/`

| File | Purpose |
|---|---|
| `calculations.controller.ts` | `POST /calculate`, `GET /calculation`, `GET /scenario-comparison` |
| `calculations.service.ts` | Build params, call engine, persist snapshot, invalidate approvals |
| `class-resolution.ts` | Effective class, single-parent, filer selection, Art. 119 n° 3 |
| `calculation-history.ts` | Canonical hash, summary, equality |
| `calculation-snapshot.ts` | Stored-result normalisation, special-expense coverage, CIM split |
| `calculations.module.ts` | Module wiring |

### 2.8 `src/modules/documents/`

| File | Purpose |
|---|---|
| `documents.controller.ts` | Upload, list, visibility, re-extract, delete |
| `documents.service.ts` | Storage, extraction orchestration, fact creation, retention |
| `upload-guard.ts` | Base64 decode, size cap, MIME sniff, extension allowlist |
| `receipt-ai-vision.service.ts` | Three-tier reading pipeline (text → vision → OCR) |
| `text/document-text.ts` | Dispatch by MIME; embedded-text fallback |
| `text/pdf-text.ts` | Dependency-free PDF text layer (`zlib`, ObjStm, CMap) |
| `text/pdf-images.ts` | Page-image extraction (DCT passthrough, Flate → PNG) |
| `ocr/ocr-engine.ts` | Tesseract CLI adapter, injectable runner, status enum |
| `extraction/vision-contract.ts` | Prompt, amount normalisation, JSON parsing, model chain, data class |
| `documents.module.ts` | Module wiring |

### 2.9 `src/modules/facts/`

| File | Purpose |
|---|---|
| `facts.controller.ts` | List, confirm, bulk confirm, update, delete |
| `facts.service.ts` | Confirmation, ownership, visibility, notifications, approval invalidation |
| `fact-visibility.ts` | Read/include/store policy by visibility |
| `fact-visibility-query.ts` | Prisma where-fragments for household-visible data |
| `fact-snapshot.ts` | Remove unshared facts from a frozen snapshot |
| `household-owner.ts` | Owner resolution for a household member |
| `facts.module.ts` | Module wiring |

### 2.10 `src/modules/filing/`

| File | Purpose |
|---|---|
| `filing.controller.ts` | Approve, package, filing record, assessment, follow-up, rollover, version reads, annex PDF |
| `filing.service.ts` | Approval, package, filing, assessment, rollover orchestration |
| `return-approvals.service.ts` | Required approvers, invalidation |
| `return-approvals.module.ts` | Separate module exported to other feature modules |
| `return-version-history.ts` | Approver math and merged version history |
| `form100-case-map.ts` | Form 100 pages/sheets/cases and instructions |
| `form100-fact-lines.ts` | Fact → Form 100 line role mapping |
| `filing-package-evidence.ts` | SHA-256 evidence history, regeneration gate |
| `filing-year-guard.ts` | Allowed filing years and error |
| `annex-pdf.service.ts` | Fetch annex data and build the PDF |
| `annex-pdf.builder.ts` | Dependency-free PDF assembly |
| `assessment-dates.ts` | Objection deadline and follow-up computation |
| `filing.module.ts` | Module wiring |

### 2.11 `src/modules/freelance/`

| File | Purpose |
|---|---|
| `freelance.controller.ts` | Profiles, metrics, demo |
| `freelance.service.ts` | Profile CRUD, revenue/expense aggregation, demo data |
| `freelance.module.ts` | Module wiring |

### 2.12 `src/modules/households/`

| File | Purpose |
|---|---|
| `households.controller.ts` | Create/list/get, invite, invitation details, accept |
| `households.service.ts` | Slug generation, invitation hashing, membership |
| `households.module.ts` | Module wiring |

### 2.13 `src/modules/notifications/`

| File | Purpose |
|---|---|
| `notifications.controller.ts` | List, unread count, mark read/all, preferences, device register/revoke |
| `notifications.service.ts` | In-app write first, preference resolution, enqueue deliveries |
| `notification-outbox.service.ts` | Prisma store, timer, `dispatchDue`, `stats`, `enqueue` |
| `notification-outbox.ts` | Pure `runOutboxPass`, `OutboxStore`, result shape |
| `notification-delivery.ts` | Constants, backoff, channel selection, stale claim, reminder window |
| `notification-devices.service.ts` | Device upsert/revoke, token resolution, Expo wiring |
| `notification-devices.ts` | Token validation, platform normalisation, live-token selection |
| `notification-reminders.service.ts` | Deadline sweep and per-day dedupe |
| `notification-rules.ts` | Preference defaults, delivery decision, age formatting |
| `adapters/delivery-adapter.ts` | `DeliveryAdapter` / `DeliveryPayload` contract |
| `adapters/email.adapter.ts` | `EmailAdapter`, local JSONL sink transport |
| `adapters/smtp-email.transport.ts` | RFC-compliant SMTP client, message builder, dot-stuffing |
| `adapters/push.adapter.ts` | `PushAdapter`, local push sink |
| `adapters/expo-push.transport.ts` | Expo Push HTTP transport, token validation |
| `notifications.module.ts` | Module wiring and exports |

### 2.14 `src/modules/questionnaire/`

| File | Purpose |
|---|---|
| `questionnaire.controller.ts` | Get/save profile, resolve task |
| `questionnaire.service.ts` | Persist answers, regenerate missing-information tasks |
| `questionnaire.module.ts` | Module wiring |

### 2.15 `src/modules/users/`

| File | Purpose |
|---|---|
| `users.controller.ts` | Me, profile, sessions, export, delete |
| `users.service.ts` | Profile update, session list, GDPR export, erasure |
| `users.module.ts` | Module wiring |

### 2.16 `src/modules/workspaces/`

| File | Purpose |
|---|---|
| `workspaces.controller.ts` | List, get by year, init, readiness |
| `workspaces.service.ts` | Workspace creation, DTO mapping, readiness |
| `workspaces.module.ts` | Module wiring |

### 2.17 `src/prisma/`

| File | Purpose |
|---|---|
| `prisma.service.ts` | Pooled Prisma client with `PrismaPg` adapter |
| `prisma.module.ts` | Global module |

### 2.18 Tests (`apps/api/test/`)

43 unit/integration files (plus 8 `.e2e-spec.ts` suites); 449 collected cases. Groups:

| Group | Files |
|---|---|
| Auth/perimeter | `auth-hardening`, `mfa-totp`, `platform-admin`, `rate-limit`, `proxy-trust`, `security-headers`, `error-filter`, `household-guard` |
| Tenant isolation | `cross-household-isolation.e2e-spec`, `household-collaboration.e2e-spec`, `viewer-approver.e2e-spec` |
| Documents | `document-upload-guard`, `document-text`, `document-pipeline`, `pdf-text`, `pdf-images`, `ocr-engine`, `ocr-pipeline`, `vision-contract`, `receipt-scanning.e2e-spec` |
| Facts/calculation | `fact-visibility`, `fact-return-snapshot`, `param-wiring`, `calculation-history`, `calculation-snapshot`, `class-resolution`, `prod2-source-invariant` |
| Filing | `form100-case-map`, `form100-fact-lines`, `filing-package-evidence`, `filing-year-guard`, `return-version-history`, `annex-pdf`, `assessment-dates`, `tax-lifecycle-full.e2e-spec` |
| Notifications | `notification-outbox`, `notification-delivery`, `notification-rules`, `notification-devices-rules`, `smtp-transport`, `expo-push-transport` |
| Admin | `admin-model-key-cipher`, `admin-outbound-url-policy`, `admin-route-data-class`, `admin-model-guards`, `admin-governance.e2e-spec` |
| Schema/lifecycle | `prisma-schema`, `account-lifecycle.e2e-spec`, `freelance-lifecycle.e2e-spec`, `audit-chain`, `audit-activity-redaction` |
| Helpers | `support/workspace-file.ts`, `support/verify-email.ts`, `support/pdf-fixture.ts`, `support/audit-purge.ts` |

Two OCR tests skip when Tesseract is not installed; they state why.

---

## 3. `apps/web` — Next.js 16 client

### 3.1 Routes (`src/app/`)

| File | Route |
|---|---|
| `layout.tsx` | Root layout and metadata |
| `page.tsx` | `/` — entry and session redirect |
| `globals.css` | Tailwind import and global styles |
| `(auth)/login/page.tsx` | `/login` |
| `(auth)/register/page.tsx` | `/register` |
| `invite/[token]/page.tsx` | `/invite/[token]` |
| `(workspace)/[householdId]/dashboard/page.tsx` | `/[householdId]/dashboard` — nine-tab workspace shell |

App-level config: `next.config.ts`, `postcss.config.mjs`, `tsconfig.json`,
`next-env.d.ts`.

### 3.2 Components (`src/components/`)

| File | Role |
|---|---|
| `AdminConsoleView.tsx` | Model registry, routes, probe, audits |
| `AssessmentView.tsx` | Bulletin import, variance, deadlines, rollover |
| `CameraScanModal.tsx` | Browser camera capture → base64 upload |
| `DocumentsView.tsx` | Vault, upload, visibility, confidence, re-scan, batch confirm |
| `FactsView.tsx` | Confirmed facts, inclusion toggle, edit/delete |
| `FilingPackageView.tsx` | Approval, package, annex, Form 100, history |
| `FreelanceBusinessView.tsx` | Profiles, P&L, demo |
| `HelpTip.tsx` | Accessible `?` trigger and portal bubble |
| `InviteModal.tsx` | Invite co-filer/viewer |
| `NotificationCenter.tsx` | Bell, unread count, list, mark read |
| `QuestionnaireView.tsx` | Full tax-profile form |
| `TaxCalculatorView.tsx` | Result, breakdown, provenance, scenarios |

### 3.3 Libraries (`src/lib/`)

| File | Purpose |
|---|---|
| `api.ts` | `API_BASE_URL`, token keys, storage helpers, `apiClient`, `LOGOUT_URL` |
| `auth-context.tsx` | `AuthProvider`, `useAuth` |
| `auth-redirect.ts` | Safe post-login redirect validation |
| `document-visibility.ts` | Visibility labels and transitions |
| `fact-dedup.ts` | `factKey`, `findFact`, `splitNewFacts` |
| `fact-inclusion.ts` | Inclusion warnings |
| `help-texts.ts` | 56 `HelpId` entries |
| `money.ts` | `formatEuro`, `NO_AMOUNT` |
| `tooltip-position.ts` | Viewport clamp/flip geometry |

### 3.4 Tests (`apps/web/test/`)

18 files, 80 collected cases: `api-client-auth`, `auth-pages`, `auth-redirect`,
`camera-scan-modal`, `dashboard-page`, `document-visibility`, `documents-view`,
`fact-dedup`, `fact-inclusion`, `facts-view`, `help-tip`, `invite-modal`,
`logout-url`, `logout`, `money`, `questionnaire-view`, `session-refresh`,
`tax-calculator-view`.

The render specs run under `tsconfig.web.json`: `react` and
`react-test-renderer` resolve to the app's React 19 install, `next/navigation`
maps to `test/support/next-navigation-shim.ts`, and `test/support/render-harness.ts`
sets the act environment. 80 / 80 pass.

---

## 4. `apps/mobile` — Expo 52 client

### 4.1 Routes (`app/`)

| File | Screen |
|---|---|
| `_layout.tsx` | Root router and providers |
| `index.tsx` | Entry / session bootstrap |
| `(auth)/login.tsx` | Login |
| `(tabs)/_layout.tsx` | Tab bar definition |
| `(tabs)/index.tsx` | Home / workspace summary |
| `(tabs)/documents.tsx` | Document vault and scan |
| `(tabs)/tasks.tsx` | Missing-information tasks |
| `(tabs)/estimate.tsx` | Calculation summary |
| `(tabs)/account.tsx` | Profile, preferences, app lock, sign-out |
| `(tabs)/activity.tsx` | Audit feed (hidden tab) |

App-level config: `app.json`, `babel.config.js`, `metro.config.js`,
`tsconfig.json`.

### 4.2 Libraries (`src/lib/`)

| File | Purpose |
|---|---|
| `api-client.ts` | `mobileApiClient` with SecureStore token getter |
| `secure-storage.ts` | SecureStore wrapper |
| `workspace.ts` | Household → workspace resolution and failure taxonomy |
| `offline-queue.ts` | Pure FIFO queue: dedupe, 50-item cap, 5 attempts, 5 s → 5 min backoff |
| `queue-runtime.ts` | Replay loop, handlers, storage adapter |
| `app-lock.ts` | Lock policy, failure lockout, auth prompts |
| `push-and-status.ts` | Push permission/action, registration payload, offline status |
| `deep-links.ts` | `luxtax://` and universal-link parsing/building |
| `privacy.ts` | Visibility redaction, base URL and annex filename helpers |
| `file-export.ts` | Safe file names, MIME, share route policy |
| `package-download.ts` | Retry/backoff and `Retry-After` handling |

### 4.3 Components (`src/components/`)

| File | Role |
|---|---|
| `AppLockScreen.tsx` | Lock gate with retry/unlock |
| `DocumentCameraScanner.tsx` | Expo Camera capture and upload |
| `OfflineBanner.tsx` | Online/pending/offline/stale banner |

### 4.4 Tests (`test/`)

11 files, 134 cases: `app-lock`, `client-methods`, `deep-links`, `file-export`,
`offline-queue`, `package-download`, `privacy`, `push-and-status`,
`queue-runtime`, `render`, `workspace`. Layout, gestures, camera and biometrics
are not verified on hardware.

---

## 5. `packages/`

### 5.1 `packages/tax-engine`

| File | Purpose |
|---|---|
| `src/index.ts` | Public barrel |
| `src/engine.ts` | `LuxembourgTaxEngine` |
| `src/scale.ts` | Scale, Class 1a, rounding, marginal rate |
| `src/scale2025.ts` | Legacy 2025 scale exports |
| `src/deductions.ts` | Deduction engine |
| `src/credits.ts` | Credit engine |
| `src/child-relief.ts` | Child history resolution |
| `src/money.ts` | Cent-safe money helpers |
| `src/pending.ts` | Pending-law gates and consistency |
| `src/rules/index.ts` | Package registry |
| `src/rules/2025.ts`, `2026.ts`, `2028.ts` | Year packages |
| `src/rules/types.ts` | `RulePackage` interfaces |
| `src/rules/treaties.ts` | Treaty methods |
| `src/forms/certificate160.ts` | Certificate 160 table |
| `test/*.spec.ts` | 11 files, 214 cases |

### 5.2 `packages/contracts`

`src/index.ts` re-exports: `enums`, `auth`, `household`, `workspace`, `audit`,
`documents`, `facts`, `fact-category`, `tax`, `filing`, `questionnaire`,
`admin`, `freelance`, `notifications`.

### 5.3 `packages/validation`

`src/index.ts` re-exports: `auth.schema`, `household.schema`,
`workspace.schema`, `document.schema`, `fact.schema`, `questionnaire.schema`,
`filing.schema`, `admin.schema`, `freelance.schema`, `notification.schema`.

`test/` — 5 files, 34 cases.

### 5.4 `packages/api-client`

| File | Purpose |
|---|---|
| `src/index.ts` | Barrel |
| `src/client.ts` | `LuxTaxApiClient`, `ApiClientConfig` |

### 5.5 `packages/design-tokens`

| File | Purpose |
|---|---|
| `src/index.ts` | Barrel |
| `src/tokens.ts` | `colors`, `typography` |
| `src/translations.ts` | EN/FR/DE glossary |
| `test/translations.spec.ts` | 9 cases |

### 5.6 `packages/config`

`tsconfig.base.json`, `package.json` — shared compiler configuration only.

---

## 6. `docs/`

| File | Status / purpose |
|---|---|
| `CODEMAPS/INDEX.md` | Codemap index and reading order |
| `CODEMAPS/ARCHITECTURE.md` | System context, layers, flows, invariants |
| `CODEMAPS/MODULES.md` | Package and API module catalogue with exports |
| `CODEMAPS/FILES.md` | This file |
| `CODEMAPS/backend.md` | API modules, guards, request lifecycle, configuration |
| `CODEMAPS/database.md` | Prisma models, enums, migrations, invariants |
| `CODEMAPS/frontend.md` | Web routes, dashboard tabs, mobile screens, shared state |
| `CODEMAPS/integrations.md` | PostgreSQL, SMTP, Expo push, vision models, Tesseract |
| `CODEMAPS/workers.md` | Outbox and reminder loops |
| `api.md` | Every HTTP route, body schema, role and response |
| `document-automation.md` | Document pipeline phases DA-1…DA-10 and measurements |
| `help-affordances.md` | Help copy inventory (63 placements / 56 entries) |
| `data-retention.md` | GDPR retention and erasure behaviour |
| `dependency-security.md` | Advisory overrides and residual risk |
| `lir-118-121-bareme-2025-2026.md` | Art. 118–121 audit (historical, resolved) |
| `luxembourg-resident-tax-optimisation-checklist-2025-2026.md` | Living legal checklist and coverage matrix |
| `8775-activation-handoff.md` | Runbook for the unpublished 8775 measures |

---

## 7. Where to look first

| Question | File |
|---|---|
| "How does a request travel through the API?" | `CODEMAPS/ARCHITECTURE.md` §5, `CODEMAPS/backend.md` |
| "Which module owns this behaviour?" | `CODEMAPS/MODULES.md` |
| "What does this exact file do?" | This file |
| "What is the schema for this table?" | `CODEMAPS/database.md` |
| "Which route and payload?" | `docs/api.md` |
| "How is a tax figure computed?" | `packages/tax-engine/src/engine.ts` + `rules/*.ts` |
| "How is a document read?" | `CODEMAPS/integrations.md` + `modules/documents/` |
| "What runs in the background?" | `CODEMAPS/workers.md` |
