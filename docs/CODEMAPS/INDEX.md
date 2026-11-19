# Codemap index

**Last updated:** 2026-11-19
**Scope:** the whole repository (`apps/api`, `apps/web`, `apps/mobile`, `packages/*`).
**Source of truth:** the code. Every path and symbol below was verified against the tree on the date above.

---

## System at a glance

```
┌─────────────────────────────────────────────────────────────────────┐
│                            Clients                                  │
│  Next.js 16 web (apps/web)      Expo 52 mobile (apps/mobile)        │
│  localStorage tokens            SecureStore tokens, offline queue    │
└───────────────┬───────────────────────────┬─────────────────────────┘
                │ HTTPS/JSON                │ HTTPS/JSON
                ▼                           ▼
┌─────────────────────────────────────────────────────────────────────┐
│                     NestJS 12 + Fastify 5 API                       │
│                         apps/api :3001                              │
│                                                                     │
│  Guards: JwtAuth → Household → Roles → PlatformAdmin                │
│  Filters: AllExceptionsFilter (safe 4xx/5xx)                        │
│  Rate limit: in-process token bucket                                 │
│                                                                     │
│  auth · users · households · workspaces · activity · documents      │
│  facts · questionnaire · calculations · filing · freelance          │
│  notifications · admin                                               │
└───────┬───────────────────────┬──────────────────────┬──────────────┘
        │ Prisma 7 / pg         │ child_process        │ HTTP
        ▼                       ▼                      ▼
┌───────────────┐      ┌─────────────────┐    ┌─────────────────────┐
│ PostgreSQL    │      │ Tesseract CLI   │    │ Vision model        │
│ 23 migrations │      │ OCR (optional)  │    │ endpoints (optional)│
│ audit trigger │      │                 │    │ + SMTP + Expo push  │
└───────────────┘      └─────────────────┘    └─────────────────────┘

Shared packages:
  @luxtax/tax-engine  ← pure calculations (2025/2026/2028 packages)
  @luxtax/contracts   ← DTOs, enums, certificate 160 table
  @luxtax/validation  ← Zod 4 schemas
  @luxtax/api-client  ← typed HTTP client
  @luxtax/design-tokens ← tokens + EN/FR/DE terms
```

---

## Reading order

1. [Backend](backend.md) — modules, guards, request lifecycle, data flow.
2. [Database](database.md) — Prisma models, enums, migrations, audit invariants.
3. [Frontend](frontend.md) — web routes and views, mobile tabs, shared state.
4. [Integrations](integrations.md) — PostgreSQL, SMTP, Expo push, vision models, Tesseract.
5. [Workers](workers.md) — notification outbox and reminder sweeps.
6. [API reference](../api.md) — every route, body schema, role, and response.

---

## Workspace layout

| Path | Purpose | Entry point |
|---|---|---|
| `apps/api` | NestJS API | `src/main.ts` → `src/app.module.ts` |
| `apps/web` | Next.js App Router client | `src/app/layout.tsx`, `src/app/page.tsx` |
| `apps/mobile` | Expo Router client | `app/_layout.tsx`, `app/index.tsx` |
| `packages/tax-engine` | Deterministic tax calculations | `src/index.ts` → `src/engine.ts` |
| `packages/contracts` | Shared types | `src/index.ts` |
| `packages/validation` | Zod schemas | `src/index.ts` |
| `packages/api-client` | Typed HTTP client | `src/index.ts` → `src/client.ts` |
| `packages/design-tokens` | Tokens and translations | `src/index.ts` |
| `packages/config` | Shared tsconfig base | `tsconfig.base.json` |
| `apps/api/prisma` | Schema, migrations, seed | `schema.prisma`, `seed.ts` |

---

## Core flows

### Authentication and tenancy

```
POST /auth/register|login
  → AuthService validates, hashes/verifies Argon2id, checks MFA
  → Session row (IP, user agent, expiry)
  → AuthResponseDto { user, tokens }
  → client stores tokens (localStorage on web, SecureStore on mobile)

Protected request
  → JwtAuthGuard (Bearer → req.user)
  → HouseholdGuard (route household/workspace → active membership)
  → Roles (PRIMARY_FILER / CO_FILER may write; VIEWER read-only)
  → PlatformAdminGuard only on /api/admin (ADMIN_EMAILS + verified e-mail)
```

### Document → fact → calculation → filing

```
Upload (base64 JSON, ≤10 MiB decoded)
  → upload-guard (type/size/path)
  → document-text: PDF text layer? plain text? image?
  → vision contract (if a model route allows the data class)
  → local OCR via pdf-images + Tesseract (if configured)
  → DocumentExtraction + ExtractedFact proposals
  → user confirms one or up to 50 (bulk)
  → ConfirmedFact (owner, inclusion flag, visibility)
  → POST /calculate builds TaxCalculationParams, calls LuxembourgTaxEngine
  → CalculationSnapshot + workspace estimate + TAX_CALCULATED
  → approval (all required approvers)
  → filing package (Form 100 case map, checklist, SHA-256)
  → annex PDF + filing record
  → assessment import + variance + deadlines
```

---

## Documentation status

| Document | Status | Notes |
|---|---|---|
| `README.md` | **current** | Rebuilt from code on 2026-11-19 |
| `docs/api.md` | **current** | Generated from controllers + Zod schemas |
| `docs/CODEMAPS/*` | **current** | This set |
| `docs/document-automation.md` | **current** | Phases DA-1…DA-10 measured; route names match code |
| `docs/help-affordances.md` | **current** | 63 placements / 56 copy entries |
| `docs/data-retention.md` | **current** | Endpoints match `users.controller.ts` |
| `docs/dependency-security.md` | **current** | Overrides match `pnpm-workspace.yaml` |
| `docs/lir-118-121-bareme-2025-2026.md` | **historical + resolved** | Audit of the pre-rebuild scale; resolution banner at top |
| `docs/luxembourg-resident-tax-optimisation-checklist-2025-2026.md` | **living legal checklist** | Engine-coverage matrix §11; §11.6 corrects the stale flags |
| `docs/8775-activation-handoff.md` | **parked runbook** | Accurate while the law remains unpublished |
| `implementation-tracker.md` | **historical log** | Chronological; not a current status page |
| `gap-check-*.md`, `gap-closure-*.md`, `audit/*`, `review-*.md`, `*-review-*.md`, `site-e2e-*.md`, `build-verification-*.md` | **historical snapshots** | Dated evidence; superseded by this codemap set where they conflict |
| `luxembourg-personal-tax-app-plan.md`, `luxembourg-*-research.md`, `research/*` | **research inputs** | Legal/product source material, not implementation status |

---

## Commands that produce the evidence

```bash
# Type checks
pnpm run typecheck

# Tax engine (214 tests)
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json \
  --test packages/tax-engine/test/*.spec.ts

# Validation (34) and design tokens (9)
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json \
  --test packages/validation/test/*.spec.ts
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json \
  --test packages/design-tokens/test/*.spec.ts

# API unit/integration (449 collected; 2 real-OCR tests skip without Tesseract)
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json \
  --test apps/api/test/*.spec.ts

# Mobile (134) and web (80; 10 pre-existing render-harness failures)
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json \
  --test apps/mobile/test/*.spec.ts
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.render.json \
  --test apps/web/test/*.spec.ts

# Builds
pnpm --filter @luxtax/web build
pnpm --filter @luxtax/mobile build

# Database drift
pnpm --filter @luxtax/api prisma:migrate
npx prisma migrate diff --from-config-datasource \
  --to-schema apps/api/prisma/schema.prisma --exit-code
```

---

## Invariants worth knowing before editing

1. **The tax engine is pure.** No I/O, no `Date.now()` inside calculation logic, no mutation of `params`. All law figures live in `packages/tax-engine/src/rules/*.ts`, never in components.
2. **A rule package is immutable.** Corrections ship as a new version; historical results stay reproducible.
3. **Facts are proposals until confirmed.** Extraction cannot write a return figure directly.
4. **Every material write invalidates approvals.** If you add a write path that changes income, deductions, or the base, call `ReturnApprovalsService.invalidateForChange`.
5. **Audit events are append-only.** Physical deletion requires the `luxtax_audit_purge` role and `SET LOCAL luxtax.allow_audit_purge = 'on'`.
6. **Household isolation is enforced twice.** Guard-level membership plus query-level household filters. A new query must carry the household constraint.
7. **Secrets fail closed.** `JWT_ACCESS_SECRET` and `DATABASE_URL` have no defaults; `ADMIN_EMAILS` unset means no platform admins.
8. **Unsupported input is reported, not guessed.** The engine returns `warnings[]` / `unsupported[]`; do not replace that with a silent zero.
