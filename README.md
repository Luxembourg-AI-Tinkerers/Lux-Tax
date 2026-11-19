# Luxembourg Personal Tax Workspace (Lux-Tax)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![pnpm Version](https://img.shields.io/badge/pnpm-%3E%3D11.18.0-orange.svg)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Turborepo](https://img.shields.io/badge/Turborepo-v2-blueviolet.svg)](https://turbo.build/repo)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-12-ea2845.svg)](https://nestjs.com/)
[![Expo](https://img.shields.io/badge/Expo-v52-000020.svg)](https://expo.dev/)
[![Prisma](https://img.shields.io/badge/Prisma-7-2D3748.svg)](https://www.prisma.io/)
[![Tests](https://img.shields.io/badge/tests-920%20collected-brightgreen.svg)](#testing--quality-assurance)

A secure, collaborative personal income tax workspace for individuals and joint-filing households subject to Luxembourg Personal Income Tax (*Impôt sur le revenu des personnes physiques* — IRPP / *Administration des contributions directes* — ACD).

Available as a responsive **Next.js 16** web application, a **NestJS 12** backend API with PostgreSQL and Prisma 7, and native **Expo 52 / React Native 0.76** iOS and Android clients. The tax engine is a pure, deterministic TypeScript package with versioned rule sets for tax years **2025**, **2026**, and a **2028 single-class preview**.

---

## Table of Contents

- [Core Principles](#core-principles)
- [Key Features](#key-features)
- [Monorepo Architecture](#monorepo-architecture)
  - [Applications](#applications)
  - [Shared Packages](#shared-packages)
  - [Directory Structure](#directory-structure)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
  - [1. Clone and Install Dependencies](#1-clone-and-install-dependencies)
  - [2. Environment Configuration](#2-environment-configuration)
  - [3. Database Migration and Prisma Setup](#3-database-migration-and-prisma-setup)
  - [4. Seed Database with Test Accounts](#4-seed-database-with-test-accounts)
  - [5. Run Development Servers](#5-run-development-servers)
- [Default Seed Credentials](#default-seed-credentials)
- [Document Automation & OCR Pipeline](#document-automation--ocr-pipeline)
- [Contextual Tax Help Affordances](#contextual-tax-help-affordances)
- [Luxembourg Tax Law Alignment (LIR)](#luxembourg-tax-law-alignment-lir)
- [Assessment Modes and the Tax Engine](#assessment-modes-and-the-tax-engine)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Known Limitations](#known-limitations)
- [Security, Privacy & Governance](#security-privacy--governance)
- [API Overview](#api-overview)
- [Project Documentation](#project-documentation)
- [License](#license)

---

## Core Principles

1. **Household-First Collaboration:** Spouses maintain separate authentication and accounts, collaborating inside a single joint-filing workspace with granular document sharing (private draft, shared for discussion, proposed for return, included in return) and mutual approval gates.
2. **Deterministic, Zero-Drift Tax Calculations:** Calculations are 100% pure TypeScript with a single runtime dependency (`@luxtax/contracts`). AI assists exclusively with extraction and classification; statutory Luxembourg tax law is executed deterministically without probabilistic arithmetic.
3. **Evidence-Linked Provenance:** Every declared tax fact links directly to its source document, page, OCR confidence, and the immutable audit trail. Every computed line carries a `ruleCode`, formula, inputs, and output amount.
4. **Human-in-the-Loop Validation:** Extracted figures remain proposals until explicitly confirmed by the taxpayer — individually or with a bounded batch confirmation.
5. **Three-Tier Document Reading Pipeline:**
   - **Tier 1 — Native PDF stream reader:** in-process, zero-dependency decoder for object streams (`/ObjStm`), FlateDecode, and `/ToUnicode` CMaps.
   - **Tier 2 — Registered vision model:** provider-agnostic HTTP models behind a strict extraction contract and per-route data-class ceiling.
   - **Tier 3 — Local OCR:** in-process Tesseract for photos and scanned PDFs, with an honest `NEEDS_OCR` state when no engine is configured.
6. **In-Context Legal Clarity:** 63 accessible help affordances (56 unique copy entries) across all 9 primary screens explain statutory terms (ASRD, CIM, CIP, CIS, Art. 111/111bis, travel units) with exact legal citations.
7. **Versioned Tax Law, Never Edited In Place:** Each tax year is an immutable `RulePackage`. A correction ships as a new package version so historical calculations remain reproducible.

---

## Key Features

- **Joint-Household & Single-Filer Workspaces:** Tax Class 1 (single), Class 1a (single with children, widow(er)s, filers aged 65+), and Class 2 (married couples / civil partnerships) with *quotient conjugal* income splitting. Art. 119 n° 3 keeps Class 2 for the event year and three following years after a death or divorce.
- **Three Assessment Modes:** `COLLECTIVE` (Art. 3/3bis), `INDIVIDUAL_PURE` (Art. 3ter, 2 × Class 1), and `INDIVIDUAL_REALLOCATION` (Art. 3ter reallocation), comparable side-by-side without overwriting the saved return.
- **Rule Packages for 2025, 2026 and 2028:** The official 23-bracket Art. 118 scale (unchanged for 2025/2026), Art. 120bis Class 1a reduced base with marginal caps, Art. 124 cote rounding, Art. 126 €50 income rounding, and a 2028 single-class preview package.
- **Full Deduction Engine:** Frais d'obtention (€540 salary / €300 pension / €25 capital, invalidity forfaits, blindness), Art. 105bis travel units, the ACD owner-occupier interest schedule, Art. 111 €672 envelope plus ASRD single-premium majoration, Art. 111bis/111ter pension savings, épargne-logement with age-aware caps, LRCP, Art. 112 donations, Art. 127 extraordinary charges, Art. 129b AEP, Art. 129g AMVP (2026), and Art. 114 prior-year losses with a 17-year ledger.
- **Full Credit Engine:** CIS, CIP, CII and their CO2 components (non-cumulative per person), CISSM, CIM (refundable, with `cimApplied` / `cimRefund` split), the 2026 start-up investment credit, foreign tax ordinary credit per country/holding, and the 2026 CIC table behind a publication gate.
- **Child Relief (Art. 122 / 123bis):** €922.50 per child dégrèvement and bonification, including the two-bonification lifetime cap, the one-relief-per-child-per-year rule, the six-child income-cap lift, and the 2025–2026 *résidence alternée* transitional rule via a per-child history.
- **Income Coverage:** Salary, pension, capital (including a securities ledger with 50 % qualifying-dividend exemption, RELIBI final option, creditable foreign withholding), rental (35 % / €2,700 forfait, per-building amortisation register, Art. 115 n° 22a 90 % social-rental exemption), foreign income by treaty method (exemption-with-progression or ordinary credit), freelance profit (Art. 14/91), and plus-values (Art. 99bis / 99ter / 100 / 102bis).
- **Residence Handling:** Non-resident taxation with Art. 157ter assimilation tested explicitly, exemption-with-progression estimates, and the Art. 3 d) mixed-couple collective-assessment gate (≥ 90 % of household professional income in Luxembourg).
- **Official Form 100 Package Generator:** Page / sheet / case mappings (S 701, DS 1601, RD 1901, P 801, CM 901, L 1001, CE 1715, Enfants 228, Recap 0621 and spouse columns), missing-document checklists, annex PDF builder, and SHA-256 integrity-verified export packages.
- **Tax Assessment Reconciliation:** Import an official *bulletin d'impôt*, compute variance against the declared figures, derive the three-month objection deadline and a follow-up date, and track filing records.
- **Approval Workflow:** Every material change invalidates standing approvals (`APPROVAL_INVALIDATED`), and `GET /return-versions` exposes the full version history with superseded reasons.
- **Document Automation:** Native PDF text layer reader, validated vision-model contract, in-process Tesseract OCR, scanned-PDF page-image extraction (JPEG passthrough, Flate → PNG), batch confirmation, and audited re-extraction.
- **Notifications:** In-app notification centre plus a transactional outbox with SMTP e-mail and Expo push adapters, retry/backoff, stale-claim recovery, device registration, preferences, and deadline reminders.
- **Freelance & Independent Professions:** Business profiles, revenue and expense tracking, net profit calculation, per-owner metrics, and a demo dataset.
- **Admin Governance Console:** Model registry, dynamic task routing rules, model connectivity probing, encrypted API credentials (AES-256-GCM), outbound URL policy (SSRF protection), data-class policy, and audit inspection.
- **Mobile Capture:** Expo Router tabs for dashboard, documents, estimate, tasks, activity and account; camera capture, offline action queue, biometric app lock, push registration, and secure storage.
- **Trilingual Glossaries & Design Tokens:** Shared tokens and tax terminology in English, French, and German.

---

## Monorepo Architecture

The workspace is organized with [pnpm workspaces](https://pnpm.io/workspaces) and [Turborepo](https://turbo.build/repo):

```
.
├── apps/
│   ├── api/             # NestJS 12 + Fastify 5 API, Prisma 7, PostgreSQL
│   ├── web/             # Next.js 16 (App Router) + React 19 + Tailwind CSS v4
│   └── mobile/          # Expo SDK 52 / React Native 0.76 (iOS & Android)
│
├── packages/
│   ├── tax-engine/      # Pure, deterministic Luxembourg tax engine (2025/2026/2028 rules)
│   ├── contracts/       # Shared TypeScript DTOs, domain models, and API interfaces
│   ├── validation/      # Shared Zod 4 schemas for every runtime payload
│   ├── api-client/      # Isomorphic, type-safe HTTP client with auth + refresh
│   ├── design-tokens/   # Design tokens, colour system, trilingual translations
│   └── config/          # Shared TypeScript and build configuration
│
├── docs/                # Technical designs, legal analyses, codemaps, API reference
└── package.json         # Workspace root scripts
```

### Applications

| Application | Directory | Framework / Stack | Port |
|-------------|-----------|-------------------|------|
| **API** | `apps/api` | NestJS 12, Fastify 5, Prisma 7, PostgreSQL, Argon2id, Tesseract OCR | `3001` |
| **Web** | `apps/web` | Next.js 16 (App Router), React 19, Tailwind CSS v4, Lucide | `3000` |
| **Mobile** | `apps/mobile` | Expo SDK 52, React Native 0.76, Expo Router 4, SecureStore, Camera | Metro (`8081`) |

> **Redis is not required.** `ioredis` remains a dependency of the API package, but no module imports or connects to it. Rate limiting is an in-process token bucket; the notification outbox is PostgreSQL-backed. A `REDIS_URL` variable is accepted but unused.

### Shared Packages

| Package | Directory | Purpose |
|---------|-----------|---------|
| `@luxtax/tax-engine` | `packages/tax-engine` | Pure tax calculation: scale, deductions, credits, child relief, treaty relief, plus-values, provenance |
| `@luxtax/contracts` | `packages/contracts` | Shared TypeScript interfaces, DTOs, enums, audit event types, certificate 160 table |
| `@luxtax/validation` | `packages/validation` | Zod 4 runtime schemas shared by API, Web, and Mobile |
| `@luxtax/api-client` | `packages/api-client` | Typed HTTP client with bearer token, single-flight refresh, and blob download |
| `@luxtax/design-tokens` | `packages/design-tokens` | Design tokens, typography, and trilingual tax dictionary (EN/FR/DE) |
| `@luxtax/config` | `packages/config` | Shared TypeScript base configuration |

### Directory Structure

```
tax-app/
├── apps/
│   ├── api/
│   │   ├── prisma/                # Schema, 23 migrations, seed
│   │   ├── src/
│   │   │   ├── common/            # Guards, decorators, filters, rate limiter
│   │   │   ├── config/            # Env loading, CORS, proxy trust, runtime checks
│   │   │   └── modules/
│   │   │       ├── admin/         # Model registry, routing, URL policy, key cipher
│   │   │       ├── audit/         # Hash-chained audit ledger with actor redaction
│   │   │       ├── auth/          # JWT, Argon2id, e-mail verification, TOTP MFA
│   │   │       ├── calculations/  # Snapshots, class resolution, scenario comparison
│   │   │       ├── documents/     # Upload guard, PDF text/images, OCR, vision
│   │   │       ├── facts/         # Facts, categories, visibility, bulk confirmation
│   │   │       ├── filing/        # Form 100, approvals, versions, annex PDF
│   │   │       ├── freelance/     # Business profiles, metrics, demo data
│   │   │       ├── households/    # Tenancy, invitations, roles
│   │   │       ├── notifications/ # In-app, outbox, SMTP, Expo push, reminders
│   │   │       ├── questionnaire/ # Tax profile and task resolution
│   │   │       ├── users/         # Profile, sessions, GDPR export and erasure
│   │   │       └── workspaces/    # Tax years, readiness
│   │   └── test/                  # 44 API unit/integration spec files + e2e suites
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/               # Auth, invite, and workspace dashboard routes
│   │   │   ├── components/        # 12 view/modal/help components
│   │   │   └── lib/               # API client, auth context, help copy, money
│   │   └── test/                  # Web unit and render specs
│   └── mobile/
│       ├── app/                   # Expo Router auth and six tab screens
│       ├── src/                   # Offline queue, app lock, push, deep links
│       └── test/                  # Mobile policy and client specs
├── packages/                      # 6 shared workspace packages
└── docs/                          # Codemaps, API reference, legal and design notes
```

---

## Tech Stack

- **Runtimes & Tooling:** Node.js `>=20`, pnpm `>=11.18.0`, Turborepo `2.11`, TypeScript `5.8.2`
- **Backend:** NestJS 12, Fastify 5, Prisma ORM 7 (`@prisma/adapter-pg`), PostgreSQL, Passport JWT, Argon2id, Zod 4
- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS v4, Lucide React
- **Mobile:** Expo SDK 52, React Native 0.76, React 18.3, Expo Router 4, SecureStore, Camera, Document Picker
- **Document Processing:** Native zero-dependency PDF text reader (`node:zlib`), page-image extractor, Tesseract CLI adapter (`fra` by default), optional vision model endpoint
- **Notifications:** PostgreSQL transactional outbox, SMTP transport with JSONL sink fallback, Expo Push API
- **Security:** Argon2id, RFC 6238 TOTP MFA with recovery codes, AES-256-GCM model key encryption, hash-chained audit trail, token-bucket rate limiting, strict CORS/CSP/HSTS
- **Testing:** Node.js test runner through `tsx`, Jest + Supertest for API e2e, React test renderer for web/mobile

---

## Prerequisites

- **Node.js:** `v20.0.0` or higher (Node 22 and 26 are exercised)
- **pnpm:** `v11.18.0` or higher (`corepack enable pnpm` or a standalone install)
- **PostgreSQL:** `v15` or higher, running locally or in Docker
- **(Optional) Tesseract OCR:** required only for local OCR of photos and scans. Unconfigured systems store documents as `NEEDS_OCR` rather than failing silently.
- **(Optional) SMTP server and Expo push credentials:** only for real notification delivery. Without them, e-mail is written to a local JSONL sink and push is disabled.

---

## Quick Start

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/Pen-Tester-ORG/Lux-Tax.git
cd Lux-Tax

# Install every workspace package, including apps/mobile
pnpm install
```

### 2. Environment Configuration

```bash
cp .env.example .env
```

The API refuses to start unless the required variables are present. `.env.example` is the source of truth; the minimum is:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/luxtax?schema=public"

# Required. At least 32 characters, and never the example value committed to
# the repository. Generate with: openssl rand -hex 32
JWT_ACCESS_SECRET=

PORT=3001
FRONTEND_URL="http://localhost:3000"
NODE_ENV="development"
```

Useful optional settings:

```env
# Browser origins allowed to call the API (comma-separated).
# Defaults to FRONTEND_URL. Every entry must be https in production.
CORS_ORIGINS=

# Platform administration: comma-separated allowlist. Fails closed when unset.
# The account must also have a verified e-mail address.
ADMIN_EMAILS="operator@luxtax.example"

# Rate limiting (on by default; disable only for a controlled load test)
RATE_LIMIT_ENABLED=true
RATE_LIMIT_IP_CAPACITY=60
RATE_LIMIT_IP_REFILL=1
RATE_LIMIT_USER_CAPACITY=120
RATE_LIMIT_USER_REFILL=2

# Only when a reverse proxy genuinely fronts the API (a hop count or CIDR).
# TRUST_PROXY=1

# Encrypts third-party model API keys at rest (AES-256-GCM). 32 bytes hex.
MODEL_KEY_ENCRYPTION_KEY=

# Notification outbox (off unless enabled)
NOTIFICATION_OUTBOX_ENABLED=false
NOTIFICATION_REMINDERS_ENABLED=false

# SMTP_HOST unset -> e-mail goes to tmp/notifications/email.jsonl
SMTP_HOST=
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=
SMTP_PASS=
SMTP_FROM=

# Expo push (a device registers itself through the API)
NOTIFICATION_PUSH_ENABLED=false
EXPO_ACCESS_TOKEN=

# Local OCR (omit if Tesseract is not installed)
# OCR_TESSERACT_PATH="C:\\Program Files\\Tesseract-OCR\\tesseract.exe"
# OCR_LANGUAGES=fra
# OCR_PSM=6
```

> `JWT_REFRESH_SECRET` is not used by the current API. Refresh tokens are issued and rotated using the same signing configuration; do not invent a second secret for it.

### 3. Database Migration and Prisma Setup

```bash
# Generate the Prisma client
pnpm --filter @luxtax/api prisma:generate

# Apply the 23 committed migrations
pnpm --filter @luxtax/api prisma:migrate
```

The datasource URL is read by `apps/api/prisma.config.ts` via `DATABASE_URL`. `prisma migrate diff --from-config-datasource --to-schema prisma/schema.prisma --exit-code` must report **no difference** on a migrated database.

### 4. Seed Database with Test Accounts

```bash
pnpm seed
# or: npm --prefix apps/api run seed
```

The seed is idempotent: it upserts the three standard accounts and creates a 2025 workspace for each. It does **not** create the optional site-e2e demo account, and it does not add anyone to `ADMIN_EMAILS` (that is an environment decision).

### 5. Run Development Servers

```bash
# All applications through Turborepo
pnpm dev

# Or individually
pnpm --filter @luxtax/api dev     # http://localhost:3001
pnpm --filter @luxtax/web dev     # http://localhost:3000
pnpm --filter @luxtax/mobile start
```

---

## Default Seed Credentials

The seed script (`apps/api/prisma/seed.ts`) creates the following accounts:

| Role | Email | Password | Access / Purpose |
|------|-------|----------|------------------|
| **Platform Administrator** | `operator@luxtax.example` | `AdminPassword123!` | Admin console access **only when listed in `ADMIN_EMAILS`**; the guard fails closed when the allowlist is unset |
| **System Administrator** | `admin@luxtax.lu` | `AdminPassword123!` | Standard account with its own household; also needs `ADMIN_EMAILS` for the console |
| **Standard Taxpayer** | `user@luxtax.lu` | `Password123!` | Primary filer in `dupont-household` (Tax Year 2025) |
| **E2E Demo Taxpayer** (optional) | `camille.site.20261110a@example.lu` | `Password123!` | Only updated **if it already exists**; created by the site e2e, not by the seed |

All three standard accounts are seeded as e-mail-verified. The API still enforces MFA per account when the user enrols.

---

## Document Automation & OCR Pipeline

The ingestion pipeline removes manual data entry while preserving mathematical auditability:

```mermaid
flowchart TD
    A["Uploaded Document<br/>(PDF, image or text)"] --> B{"File kind?"}

    B -->|"PDF with text layer"| C["Tier 1: Native stream reader<br/>pdf-text.ts"]
    B -->|"Image or scanned PDF"| D{"Vision model<br/>registered?"}
    B -->|"Plain text"| E["PLAIN_TEXT source"]

    D -->|"Yes"| F["Tier 2: Validated vision contract<br/>vision-contract.ts"]
    D -->|"No"| G{"Tesseract<br/>configured?"}

    G -->|"Yes"| H["Tier 3: Local OCR<br/>ocr-engine.ts + pdf-images.ts"]
    G -->|"No"| I["Status: NEEDS_OCR<br/>explicit, not silent"]

    C --> J["Field & code extraction<br/>(101, 103, 105, 141, …)"]
    E --> J
    F --> J
    H --> J

    J --> K["Extracted facts (proposals)<br/>status: EXTRACTED"]
    K --> L{"User action"}
    L -->|"Confirm all"| M["POST .../facts/confirm-bulk<br/>max 50 ids, skipped ids reported"]
    L -->|"Confirm one"| N["POST .../facts/confirm"]
    M --> O["Tax engine and Form 100"]
    N --> O
```

### Pipeline Highlights

1. **Native PDF text extraction:** Zero external libraries. Decodes object streams (`/ObjStm`), FlateDecode streams, `/ToUnicode` CMaps, Identity-H two-byte codes, and WinAnsi/Latin-1 fallback. Measured on a 20-page Form 100 and the 359-page LIR.
2. **Scanned PDFs reach OCR:** `pdf-images.ts` walks the page tree and returns the largest image per page. `/DCTDecode` JPEGs pass through untouched; `/FlateDecode` images are inflated and wrapped in a minimal PNG. Unsafe formats (predictors, JPEG 2000, CCITT, CMYK, 1-bit) are skipped, and pages/pixels are capped.
3. **Validated vision contract:** Field allowlist, amount normalisation for `1.234,56` and `1,234.56`, rejection of prose and unknown fields with a report, primary → fallback model chain, and a per-call `maxDataClass` check.
4. **Honest states:** an upload is processed synchronously and lands as `EXTRACTED` or `NEEDS_OCR` (or `FAILED` if the reader throws); confirming its figures moves it to `CONFIRMED`. `Document.extractionSource` records `TEXT_LAYER`, `EMBEDDED_TEXT`, `PLAIN_TEXT`, `VISION`, `OCR`, or `NONE`. The enum retains `UPLOADED` and `PROCESSING` for a future asynchronous queue, but the current pipeline does not persist an intermediate state.
5. **One-click batch confirmation:** `POST /api/workspaces/:workspaceId/facts/confirm-bulk` confirms up to 50 proposals atomically per fact, preserving the audit row, approval invalidation, visibility checks, and retention trigger. Already-confirmed, foreign-workspace, and unreadable ids return a per-id reason.
6. **Audited re-extraction:** `POST /api/workspaces/:workspaceId/documents/:documentId/reextract` re-reads a stored file after an engine or model change. Confirmed figures are never replaced; the event is recorded as `DOCUMENT_REEXTRACTED`.

> For architecture, benchmark evidence, and the explicit backlog, see [`docs/document-automation.md`](docs/document-automation.md).

---

## Contextual Tax Help Affordances

Luxembourg tax forms contain dense, specialised nomenclature. Lux-Tax provides **63 help affordances** across **9 primary screens**, backed by **56 unique copy entries**:

- **What it does:** a small **?** button opens a contextual explanation in a floating portal clamped to the viewport.
- **Rules the copy follows:**
  1. *Explain the consequence, not the label* — what changes if the option is selected.
  2. *Cite the law where it is legal* — e.g. `(Art. 111bis)`, `(Art. 119 n° 3)`.
  3. *Never invent a figure* — thresholds come from the engine rule package or a cited source.
- **Accessibility:** real `<button>` elements with `aria-label`, `aria-expanded`, and `aria-describedby`; keyboard focus opens the tip, `Escape` closes it, and a tip beside a checkbox never toggles the checkbox.
- **Inventory guard:** `apps/web/test/help-tip.spec.ts` fails on unused copy, a `?` without copy, paragraph-sized copy, or a screen losing its help entirely.

> For the copy catalogue and placement rules, see [`docs/help-affordances.md`](docs/help-affordances.md).

---

## Luxembourg Tax Law Alignment (LIR)

The `@luxtax/tax-engine` package implements the Luxembourg *Loi de l'impôt sur le revenu* as immutable rule packages. The table below is a map, not an exhaustive list:

| Article | Legal scope | Engine implementation |
|---------|-------------|-----------------------|
| **Art. 3 / 3bis / 3ter** | Collective and individual assessment | `COLLECTIVE`, `INDIVIDUAL_PURE`, `INDIVIDUAL_REALLOCATION`; pure comparison |
| **Art. 3 d)** | Mixed resident/non-resident couples | Collective only when ≥ 90 % of household professional income is Luxembourg-source |
| **Art. 7 al. 2** | Loss compensation | Category losses keep their sign across the year's net income |
| **Art. 13 / 134bis** | Foreign income relief | Exemption-with-progression or per-country/per-holding ordinary credit |
| **Art. 14 & 91** | Independent and freelance profit | Revenue minus business expenses; negative profit compensated |
| **Art. 98** | Rental income | 35 % / €2,700 forfait; per-building amortisation register; charges and interest |
| **Art. 99bis / 99ter / 100 / 102bis** | Plus-values | 6-month movable speculation, 5-year real-estate window, substantial participation, principal-residence exemption, Art. 130 al. 4 abattement, demi-taux |
| **Art. 102 / 105** | Owner-occupier interest | ACD schedule from valeur-locative fixation: years 1–2 unlimited, 3–6 €4,000, 7–11 €3,000, 12+ €2,000, × (1 + spouse + moderated children) |
| **Art. 105bis** | Travel units | €99 per unit, first 4 ignored, 26-unit / €2,574 cap |
| **Art. 107** | Frais d'obtention | €540 salary / €300 pension / €25 capital; invalidity forfaits €645–€1,020; blindness €1,515 |
| **Art. 109–113** | Special expenses | €480 / €960 forfait; Art. 111 €672 envelope; additive LRCP and Art. 112 donations (20 % / €1,000,000 cap) |
| **Art. 111bis / 111ter** | Pension savings | €3,200 per souscripteur (2025) / €4,500 (2026), clamped to assessed persons |
| **Épargne-logement** | Home savings | €1,344 (age ≤ 40) / €672 standard, × household multiplier |
| **ASRD** | Mortgage-protection single premium | €6,000 + €1,200 per child, + 8 % per year above 30 (max 160 %) |
| **Art. 114** | Prior-year losses | Ledger by year of origin, 17-year window, capped at available income |
| **Art. 115 n° 13d** | Prime jeune salarié | 75 % exempt, capped by salary band (€5,000 / €3,750 / €2,500, zero above €100,000) |
| **Art. 115 n° 15 / 15a / 22a** | Capital and rental reliefs | €1,500 capital tranche (doubled collectively), 50 % qualifying-dividend exemption, 90 % social-rental exemption |
| **Art. 118–121, 124, 126** | Scale and classes | 23 official brackets (0–42 %), Class 1a Art. 120bis reduced base with marginal caps, Class 2 `2 × Tarif(RIA/2)`, income floored to €50, cote floored to the euro, cotes < €12 nil |
| **Solidarity (fonds pour l'emploi)** | Surcharge | 7 %, or 9 % above €150,000 (Class 1/1a) / €300,000 (Class 2), applied to the whole cote |
| **Art. 122 / 123bis** | Child relief | €922.50 dégrèvement and bonification, phase-out €67,400–€76,600, six-child cap lift, lifetime and résidence-alternée rules |
| **Art. 127** | Extraordinary charges | €5,400 forfait / €450 monthly cap; child under 14 on 1 January |
| **Art. 129b** | AEP | €4,500 collective / €2,250 individual pure, capped by the lower professional net |
| **Art. 129g** | AMVP | €9,000 / €750 monthly, 2026 package only |
| **Art. 152ter / 154ter / 154quater / 154quinquies** | Credits | CIS / CIP / CII + CO2, non-cumulative per person; CIM refundable; CISSM |
| **Art. 157ter** | Non-resident assimilation | ≥ 90 % worldwide income in Luxembourg, or foreign net < €13,000 |
| **2026 start-up credit** | Equity investment | 20 % of a capped €100,000 annual investment (2026 package) |

### Pending measures

Projet de loi **8775** (2026 CIC table and removal of the épargne-logement age limit) is **not published**. Both measures are represented in the 2026 package as `NOT_IN_FORCE`; the engine emits an explicit warning rather than a silent zero, and `checkPendingConsistency()` rejects a package that declares a measure in force without its data. Activation is documented in [`docs/8775-activation-handoff.md`](docs/8775-activation-handoff.md).

> The historical audit that found the original scale and Class 1a defects in the pre-rebuild engine is preserved in [`docs/lir-118-121-bareme-2025-2026.md`](docs/lir-118-121-bareme-2025-2026.md). Its resolution status is recorded at the top of that file; the current implementation is in `rules/2025.ts`, `scale.ts`, and `engine.ts`.

---

## Assessment Modes and the Tax Engine

`LuxembourgTaxEngine.calculate(params)` is a pure function of its input and the immutable rule package for `params.taxYear`. It returns a complete `TaxCalculationResultDto`:

- `grossIncome`, `netIncome`, `totalDeductions`, `deductions` (every line)
- `taxableIncome`, `baseTax`, `solidaritySurchargeRate`, `solidaritySurchargeAmount`
- `credits` (CIS, CIP, CII, CO2, CISSM, CIC, CIM split, start-up, foreign tax)
- `childRelief` (dégrèvement, bonification, eligibility, phase-out flag)
- `finalTaxLiability`, `taxWithheldAtSource`, `balancePayableOrRefund`
- `effectiveTaxRate`, `marginalRate`
- `freelanceIncomeBreakdown`, `plusValues`, `rental`, `nonResident`
- `provenance[]` (rule code, description, formula, inputs, output), `warnings[]`, `unsupported[]`

The engine never throws on hostile input; it reports and skips non-finite values, negative amounts, future-dated years, unsupported certificate codes, and unmodelled constructs. `compareAssessmentModes(params)` runs the three legal assessment modes on shallow copies and never mutates the caller.

---

## Testing & Quality Assurance

Measured on 2026-11-19 in this workspace:

| Suite | Command | Result |
|-------|---------|--------|
| Tax engine | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/*.spec.ts` | **214 / 214** |
| Validation | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/validation/test/*.spec.ts` | **34 / 34** |
| Design tokens & translations | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/design-tokens/test/*.spec.ts` | **9 / 9** |
| API unit/integration (`apps/api/test/*.spec.ts`) | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test apps/api/test/*.spec.ts` | **449 collected, 447 pass, 2 skipped** without Tesseract (the two real-binary tests state why they skip) |
| Mobile | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test apps/mobile/test/*.spec.ts` | **134 / 134** |
| Web | `node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.render.json --test apps/web/test/*.spec.ts` | **80 collected, 70 pass, 10 fail** — the pre-existing React 18 (`react-test-renderer`) / React 19 (`apps/web`) harness mismatch, not a product defect |

The root scripts:

```bash
# Engine + validation + API e2e, via the package scripts
pnpm test

# Reliable TypeScript runner for the package suites in this workspace
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json \
  --test packages/tax-engine/test/*.spec.ts
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json \
  --test packages/validation/test/*.spec.ts
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json \
  --test packages/design-tokens/test/*.spec.ts

# API unit/integration and e2e
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json \
  --test apps/api/test/*.spec.ts
pnpm --filter @luxtax/api test:e2e     # PostgreSQL required

# Type checking (contracts, validation, design-tokens, api-client, tax-engine)
pnpm run typecheck

# Production builds
pnpm --filter @luxtax/web build
pnpm --filter @luxtax/mobile build
```

> The package-local `node --test test/*.spec.ts` scripts rely on TypeScript import resolution that Node 26 does not provide for extensionless `.ts` imports. Use the `tsx` invocation above to reproduce the counts in this README; the package scripts remain the canonical entry point in a toolchain that supplies a loader.

**Jest e2e note.** The HTTP e2e suites (`apps/api/test/*.e2e-spec.ts`) use Jest 29 with NestJS 12. On Node 24+ the current configuration aborts before the first test because `@nestjs/testing` is ESM-only and `transformIgnorePatterns` has no transform for `node_modules`. The in-process specs cover the same seams; the e2e suites run in an environment whose Jest configuration supports it.

---

## Known Limitations

Documented rather than hidden:

- **Web render suite harness:** ten tests fail when `apps/web/node_modules` exists because `.tools` ships React 18's test renderer while the app uses React 19. With that folder absent the same specs pass. This is a harness fix, not a UI bug.
- **Jest HTTP e2e:** see the note above.
- **Pending law 8775:** the 2026 CIC table and épargne-logement age-limit removal are explicitly `NOT_IN_FORCE`.
- **Not modelled / partial:** donations report over two years, CIM pro-rata by months, full treaty progression for non-residents without assimilation, Form 100 category-level splitting (1553, Art. 14 vs 91, foreign income by sheet), and per-child display of the applied relief.
- **Mobile on hardware:** the bundle builds, but no device or biometric sensor has been exercised in this environment.
- **Real notification delivery:** SMTP and push are implemented and tested against real sockets/servers, but no production mailbox or handset was available.
- **Browser coverage:** Chromium only; Firefox and Safari are unverified.

---

## Security, Privacy & Governance

- **Argon2id password hashing** with complexity rules and a common-password denylist; failed logins are audited (`USER_LOGIN_FAILED`) and credential endpoints are throttled per IP + submitted e-mail. There is no account-lockout state; the limiter is the brute-force control.
- **JWT sessions:** 15-minute access tokens, rotated refresh tokens, per-session IP/user-agent records, logout revocation.
- **TOTP MFA:** `POST /api/auth/mfa/enrol`, `/mfa/activate`, `/mfa/disable`; seeds sealed with a key derived from `JWT_ACCESS_SECRET`; recovery codes.
- **Tenant isolation:** household boundaries enforced at the guard and Prisma-query layers; cross-household access returns 403.
- **Rate limiting:** in-process token bucket. The per-IP bucket covers every route; login, register, and refresh additionally use a per-IP + submitted-e-mail bucket (5 attempts, slow refill) so password guessing against one account is throttled. A per-user bucket is implemented in the guard but is not currently applied after authentication, because the global guard runs before `JwtAuthGuard`.
- **Proxy trust:** `X-Forwarded-For` is ignored unless `TRUST_PROXY` is configured; audit and rate-limit keys use the resolved socket address by default.
- **Security headers:** Helmet CSP lockdown, HSTS, `X-Frame-Options: DENY`, `Referrer-Policy: no-referrer`, `Permissions-Policy` lockdown, CORS pinned to `FRONTEND_URL`/`CORS_ORIGINS`.
- **Encrypted model credentials:** AES-256-GCM with `MODEL_KEY_ENCRYPTION_KEY`; endpoint URLs pass an outbound policy that blocks private/internal subnets.
- **Audit trail:** append-only, hash-chained events for authentication, documents, facts, calculations, approvals, packages, filings, assessments, export, and erasure. Actor details are redacted for viewers. Physical deletion requires the `luxtax_audit_purge` role plus a per-transaction opt-in.
- **GDPR rights:**
  - `GET /api/users/me/sessions` — where the account is signed in.
  - `GET /api/users/me/export` — machine-readable export (`USER_DATA_EXPORTED`).
  - `DELETE /api/users/me` — irreversible account erasure (`USER_ACCOUNT_ERASED`); a shared household with remaining members returns 409.
  - See [`docs/data-retention.md`](docs/data-retention.md).

---

## API Overview

All routes are JSON over HTTP. Authenticated routes require `Authorization: Bearer <accessToken>`. Workspace-scoped routes resolve the household through `HouseholdGuard`, so a caller cannot address another household's workspace.

| Route group | Base path | Key capabilities |
|-------------|-----------|------------------|
| **Auth** | `/api/auth` | Register, login (optional `totpCode`), refresh, verify e-mail, resend verification, MFA enrol/activate/disable, logout |
| **Users** | `/api/users` | `me`, profile update, sessions, GDPR export, account erasure |
| **Households** | `/api/households` | Create/list/get, invite a `CO_FILER` or `VIEWER`, invitation details, accept |
| **Workspaces** | `/api/households/:id/workspaces` | List, get by year, initialise, readiness |
| **Activity** | `/api/households/:id/activity` | Filtered, paginated audit feed with role-based redaction |
| **Documents** | `/api/workspaces/:workspaceId/documents` | Upload, list, change visibility, re-extract, delete |
| **Facts** | `/api/workspaces/:workspaceId/facts` | List, confirm one, confirm up to 50, update, delete |
| **Questionnaire** | `/api/workspaces/:workspaceId` | Get/save profile, resolve tasks |
| **Calculations** | `/api/workspaces/:workspaceId` | Calculate, latest calculation, scenario comparison |
| **Filing** | `/api/workspaces/:workspaceId` | Approve, package, annex PDF, filing record, assessment import/follow-up, rollover, return-version history |
| **Freelance** | `/api/workspaces/:workspaceId/freelance` | Profiles, metrics, demo data |
| **Notifications** | `/api/workspaces/:workspaceId/notifications` | List, unread count, mark read/all, preferences, register/revoke push device |
| **Admin** | `/api/admin` | Overview, tax rules, deadlines, forms, models, model routes, connection test, evaluations, audit |

For request bodies, response shapes, roles, and error behaviour, see [`docs/api.md`](docs/api.md) and the [backend codemap](docs/CODEMAPS/backend.md).

---

## Project Documentation

- [`docs/CODEMAPS/INDEX.md`](docs/CODEMAPS/INDEX.md) — architecture index and reading order.
- [`docs/api.md`](docs/api.md) — endpoint reference generated from the controllers and validation schemas.
- [`docs/CODEMAPS/backend.md`](docs/CODEMAPS/backend.md) — API module map, guards, data flow.
- [`docs/CODEMAPS/frontend.md`](docs/CODEMAPS/frontend.md) — web and mobile screens, state, and shared libraries.
- [`docs/CODEMAPS/database.md`](docs/CODEMAPS/database.md) — Prisma models, enums, migrations, and invariants.
- [`docs/CODEMAPS/integrations.md`](docs/CODEMAPS/integrations.md) — SMTP, Expo push, vision models, Tesseract, PostgreSQL.
- [`docs/CODEMAPS/workers.md`](docs/CODEMAPS/workers.md) — notification outbox and reminder sweeps.
- [`docs/document-automation.md`](docs/document-automation.md) — document pipeline phases DA-1 … DA-10, measurements, backlog.
- [`docs/help-affordances.md`](docs/help-affordances.md) — help copy rules, inventory, and placement.
- [`docs/lir-118-121-bareme-2025-2026.md`](docs/lir-118-121-bareme-2025-2026.md) — Art. 118–121 audit, now marked resolved.
- [`docs/luxembourg-resident-tax-optimisation-checklist-2025-2026.md`](docs/luxembourg-resident-tax-optimisation-checklist-2025-2026.md) — legal checklist and engine coverage matrix.
- [`docs/data-retention.md`](docs/data-retention.md) — GDPR retention and erasure policy.
- [`docs/dependency-security.md`](docs/dependency-security.md) — dependency advisories, overrides, and residual risk.
- [`docs/8775-activation-handoff.md`](docs/8775-activation-handoff.md) — the four-step activation runbook for pending law.
- [`implementation-tracker.md`](implementation-tracker.md) — chronological implementation log (historical record; current state is this README and the codemaps).

---

## License

This project is licensed under the [MIT License](LICENSE).
