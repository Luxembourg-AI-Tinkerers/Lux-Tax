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
[![Tests](https://img.shields.io/badge/tests-620%2B%20passing-brightgreen.svg)](#testing--quality-assurance)

A secure, collaborative personal income tax workspace for individuals and joint-filing households subject to Luxembourg Personal Income Tax (*Impôt sur le revenu des personnes physiques* - IRPP / *Administration des contributions directes* - ACD). 

Available as a responsive **Next.js 16** web application, a **NestJS 12** backend API with PostgreSQL and Prisma 7, and native **Expo 52 / React Native** iOS and Android mobile clients.

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
- [Document Automation & OCR Pipeline (DA-1 – DA-10)](#document-automation--ocr-pipeline-da-1--da-10)
- [Contextual Tax Help Affordances](#contextual-tax-help-affordances)
- [Luxembourg Tax Law Alignment (LIR)](#luxembourg-tax-law-alignment-lir)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Security, Privacy & Governance](#security-privacy--governance)
- [API Overview](#api-overview)
- [Project Documentation](#project-documentation)
- [License](#license)

---

## Core Principles

1. **Household-First Collaboration:** Spouses maintain separate authentication and accounts, collaborating inside a single joint-filing workspace with granular document sharing (private draft, shared for discussion, proposed for return, included in return) and mutual approval gates.
2. **Deterministic, Zero-Drift Tax Calculations:** Calculations are 100% pure TypeScript with zero external runtime dependencies (`@luxtax/tax-engine`). AI assists exclusively with extraction and classification; statutory Luxembourg tax law is executed deterministically without probabilistic arithmetic drift.
3. **Evidence-Linked Provenance:** Every declared tax fact links directly to its source document, page, OCR confidence, and immutable audit trail.
4. **Human-in-the-Loop Validation:** All extracted figures remain proposals until explicitly confirmed by the taxpayer—individually or via one-click batch confirmation (`POST /facts/confirm-batch`).
5. **Two-Tier Document Reading Pipeline:** 
   - **Tier 1 (Native PDF Stream Reader):** In-process, zero-dependency PDF text stream decoder handling object streams (`/ObjStm`), FlateDecode decompression, and CMap `/ToUnicode` font mapping.
   - **Tier 2 (In-Process OCR Engine):** Local Tesseract OCR for smartphone captures and scanned PDFs, with honest document states (`NEEDS_OCR`) when external engines are not configured.
6. **In-Context Legal Clarity:** 63 accessible help affordances across all 9 primary screens explain complex statutory terms (ASRD, CIM, CIP, CIS, Art. 111/111bis, Travel units) with exact legal citations.

---

## Key Features

- **Joint-Household & Single Filer Workspaces:** Full support for Tax Class 1 (single), Class 1a (single with children, widows, filers aged 65+), and Class 2 (married couples / civil partnerships with income splitting via *quotient conjugal*).
- **Two-Tier Document Automation (DA-1 – DA-10):**
  - Pure TypeScript PDF text layer extractor reading form field coordinates and text streams without native binary dependencies.
  - In-process Tesseract OCR engine for photos and image scans.
  - Document status lifecycle: `UPLOADED` &rarr; `PROCESSING` &rarr; `EXTRACTED` &rarr; `CONFIRMED` (or `NEEDS_OCR` / `FAILED`).
  - Batch confirmation and re-extraction (`POST /documents/:id/re-extract`) upon model or engine updates.
- **Freelance & Independent Professions (Art. 14 & 91 LIR):** Comprehensive revenue tracking, client invoicing, deductible business expense categorization, profit-and-loss calculation, and multi-currency support.
- **Real-Time Tax Engine & Breakdown:** Progressive bracket computation (0% to 42%), solidarity fund surcharge (*contribution au fonds pour l'emploi* at 7% or 9%), flat acquisition expenses (*frais d'obtention de base*), special expenses (*dépenses spéciales*), child moderations, and tax credits (CIS, CIM, CIP).
- **Official Form 100 Package Generator:** Prepares official *Modèle 100* (*Déclaration d'impôt sur le revenu*) summaries with box code mappings (codes 101, 103, 105, 141, 702, 1553, 1601), missing-document checklists, and SHA-256 integrity-verified export packages.
- **Tax Assessment Reconciliation:** Import official tax assessment notices (*bulletin d'impôt*), compute variance against declared figures, and monitor statutory objection deadlines (3-month window under § 228 AO).
- **Mobile Camera & Offline Capture:** Native Expo/React Native mobile client with document scanner, offline action queues, push notifications, and biometric app lock.
- **Admin Governance Console:** Model registry, dynamic task routing rules, URL security enforcement, encrypted API credentials (AES-256-GCM), and audit log inspection.
- **Trilingual Glossaries & Design Tokens:** Complete design token system with bilingual/trilingual tax dictionary covering English, French (*Français*), and German (*Deutsch*).

---

## Monorepo Architecture

The workspace is organized as a monorepo powered by [pnpm workspaces](https://pnpm.io/workspaces) and [Turborepo](https://turbo.build/repo):

```
.
├── apps/
│   ├── api/             # NestJS 12 + Fastify backend API with Prisma 7, PostgreSQL, and Redis
│   ├── web/             # Next.js 16 (App Router) + React 19 + Tailwind CSS v4 web application
│   └── mobile/          # Expo SDK 52 / React Native 0.76 mobile application (iOS & Android)
│
├── packages/
│   ├── tax-engine/      # Pure, deterministic Luxembourg tax calculation engine (zero dependencies)
│   ├── contracts/       # Shared TypeScript DTOs, domain models, and API interfaces
│   ├── validation/      # Shared Zod validation schemas for all runtime payloads and tax rules
│   ├── api-client/      # Isomorphic, type-safe HTTP API client with auth interceptors
│   ├── design-tokens/   # Design tokens, color system, and trilingual tax translations (EN/FR/DE)
│   └── config/          # Shared ESLint, Prettier, and TypeScript configurations
│
├── docs/                # Comprehensive technical design specifications and legal analyses
└── package.json         # Workspace root scripts and devDependencies
```

### Applications

| Application | Directory | Framework / Stack | Port |
|-------------|-----------|-------------------|------|
| **API** | `apps/api` | NestJS 12, Fastify, Prisma 7, PostgreSQL, Redis, Argon2, Tesseract OCR | `3001` |
| **Web** | `apps/web` | Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS v4, Lucide | `3000` |
| **Mobile** | `apps/mobile` | Expo SDK 52, React Native 0.76, Expo Router v4, Expo Camera, SecureStore | Metro (`8081`) |

### Shared Packages

| Package | Directory | Purpose |
|---------|-----------|---------|
| `@luxtax/tax-engine` | `packages/tax-engine` | Pure mathematical tax calculation according to LIR statutory rules |
| `@luxtax/contracts` | `packages/contracts` | Shared TypeScript interfaces, DTOs, audit events, and domain enums |
| `@luxtax/validation` | `packages/validation` | Zod runtime schemas ensuring validation across API, Web, and Mobile |
| `@luxtax/api-client` | `packages/api-client` | Type-safe isomorphic HTTP client with automatic auth token management |
| `@luxtax/design-tokens` | `packages/design-tokens` | Design tokens, typography, and trilingual tax dictionary (EN/FR/DE) |
| `@luxtax/config` | `packages/config` | Shared TypeScript, Prettier, and linting configurations |

### Directory Structure

```
tax-app/
├── apps/
│   ├── api/
│   │   ├── prisma/                # Prisma schema, migrations, and seed scripts
│   │   ├── src/
│   │   │   ├── config/            # Runtime configuration, CORS origins, proxy trust
│   │   │   └── modules/
│   │   │       ├── admin/         # Model registry, routing rules, URL security
│   │   │       ├── audit/         # Immutable audit ledger with actor redaction
│   │   │       ├── auth/          # JWT, Argon2id, email verification, TOTP MFA
│   │   │       ├── calculations/  # Calculation snapshots, class resolution
│   │   │       ├── documents/     # Ingestion, PDF text reader, OCR engine, vision
│   │   │       ├── facts/         # Tax fact CRUD, categories, visibility states
│   │   │       ├── filing/        # Form 100 mapping, checklists, package export
│   │   │       ├── freelance/     # Business revenues, expenses, P&L statements
│   │   │       ├── households/    # Household tenancy, invitations, roles
│   │   │       ├── notifications/ # Push (Expo), Email (SMTP/JSONL), reminders
│   │   │       ├── questionnaire/ # Tax profile questionnaire
│   │   │       ├── users/         # Profile management, GDPR export and erasure
│   │   │       └── workspaces/    # Tax year workspaces (2025, 2026)
│   │   └── test/                  # 59+ Jest E2E & integration test suites
│   ├── web/
│   │   ├── src/
│   │   │   ├── app/               # Next.js App Router (auth, workspace dashboard, invite)
│   │   │   ├── components/        # 11 core UI views (Calculator, Documents, Admin, etc.)
│   │   │   └── lib/               # API client instance, HelpTip copy, formatters
│   │   └── test/                  # React testing suites and view unit tests
│   └── mobile/
│       ├── app/                   # Expo Router tabs (dashboard, documents, estimate, tasks)
│       ├── src/lib/               # Offline queue, biometric lock, push notifications
│       └── test/                  # Client and offline sync unit tests
├── packages/                      # 6 shared workspace packages
└── docs/                          # Specialized documentation (DA pipeline, help tips, LIR scale)
```

---

## Tech Stack

- **Runtimes & Tooling:** Node.js `>=20.0.0`, pnpm `>=11.18.0`, Turborepo `2.11.2`, TypeScript `5.8.2`
- **Backend:** NestJS 12, Fastify 5, Prisma ORM 7, PostgreSQL, Redis (`ioredis`), Passport JWT, Argon2id
- **Frontend:** Next.js 16 (App Router), React 19, Tailwind CSS v4, Lucide React
- **Mobile:** Expo SDK 52, React Native 0.76, Expo Router 4, Expo SecureStore, Expo Camera
- **Document & OCR Processing:** Native zero-dependency PDF text stream reader (`pdf-text.ts`), Tesseract OCR CLI (`fra` language pack)
- **Security:** Argon2id password hashing, RFC 6238 TOTP MFA, AES-256-GCM model key cipher, rate limiting, tenant-isolated Prisma queries
- **Testing:** Jest, Node.js Native Test Runner (`node --test`), Supertest

---

## Prerequisites

- **Node.js:** `v20.0.0` or higher (`v22` / `v26` supported)
- **pnpm:** `v11.18.0` or higher (`corepack enable pnpm` or standalone `pnpm`)
- **PostgreSQL:** `v15` or higher running locally or in Docker
- **Redis:** `v7` or higher running locally or in Docker
- **(Optional) Tesseract OCR:** Required only for local in-process OCR of photos/scans (e.g. `tesseract.exe` with French `fra` training data). Unconfigured systems will gracefully store documents in `NEEDS_OCR` status.

---

## Quick Start

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/Pen-Tester-ORG/Lux-Tax.git
cd Lux-Tax

# Install all monorepo dependencies
pnpm install
```

### 2. Environment Configuration

Copy the example environment configuration file:

```bash
cp .env.example .env
```

Ensure your `.env` contains the required database, Redis, and secret keys:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/luxtax?schema=public"
REDIS_URL="redis://localhost:6380"
JWT_ACCESS_SECRET="dev_luxembourg_tax_jwt_access_secret_32chars_min_2026"
JWT_REFRESH_SECRET="dev_luxembourg_tax_jwt_refresh_secret_32chars_min_2026"
PORT=3001
FRONTEND_URL="http://localhost:3000"
NODE_ENV="development"

# Platform Administration (comma-separated allowlist for admin console access)
ADMIN_EMAILS="operator@luxtax.example,admin@luxtax.lu"

# Model key encryption cipher (32 bytes hex: openssl rand -hex 32)
MODEL_KEY_ENCRYPTION_KEY="0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"

# Optional: Local Tesseract OCR (omit or leave empty if not installed)
# OCR_TESSERACT_PATH="C:\\Program Files\\Tesseract-OCR\\tesseract.exe"
# OCR_LANGUAGES="fra"
# OCR_PSM=6
```

### 3. Database Migration and Prisma Setup

Generate the Prisma Client and apply migrations to your PostgreSQL database:

```bash
# Generate Prisma Client
pnpm --filter @luxtax/api prisma:generate

# Apply database migrations
pnpm --filter @luxtax/api prisma:migrate
```

### 4. Seed Database with Test Accounts

Seed the database with pre-configured platform administrators, standard taxpayers, and demo households:

```bash
pnpm seed
# or: npm --prefix apps/api run seed
```

### 5. Run Development Servers

Start all applications (API, Web, Mobile) concurrently with Turborepo:

```bash
pnpm dev
```

Alternatively, launch services individually:

```bash
# Start backend API (http://localhost:3001)
pnpm --filter @luxtax/api dev

# Start web client (http://localhost:3000)
pnpm --filter @luxtax/web dev

# Start mobile development server (Metro bundler)
pnpm --filter @luxtax/mobile start
```

---

## Default Seed Credentials

The seed script (`apps/api/prisma/seed.ts`) populates the database with verified test accounts:

| Role | Email | Password | Access / Purpose |
|------|-------|----------|------------------|
| **Platform Administrator** | `operator@luxtax.example` | `AdminPassword123!` | Full Admin Console & Model Governance access (allowlisted) |
| **System Administrator** | `admin@luxtax.lu` | `AdminPassword123!` | Administrator account with dedicated Admin Household |
| **Standard Taxpayer** | `user@luxtax.lu` | `Password123!` | Primary Filer in `dupont-household` (Tax Year 2025) |
| **E2E Demo Taxpayer** | `camille.site.20261110a@example.lu` | `Password123!` | Pre-populated salary certificate & 6 confirmed facts |

---

## Document Automation & OCR Pipeline (DA-1 – DA-10)

The document ingestion pipeline eliminates manual data entry while maintaining complete mathematical auditability:

```mermaid
flowchart TD
    A["Uploaded Document<br/>(PDF or Image)"] --> B{"Document Type?"}
    
    B -->|"PDF with Text Layer"| C["Tier 1: Native Stream Reader<br/>(pdf-text.ts)"]
    B -->|"Scanned PDF or Image"| D{"Tesseract Available?"}
    
    D -->|"Yes"| E["Tier 2: In-Process OCR<br/>(ocr-engine.ts)"]
    D -->|"No"| F["Status: NEEDS_OCR<br/>(Honest Fallback)"]
    
    C --> G["Field & Code Extraction<br/>(Codes 101, 103, 105, 141, etc.)"]
    E --> G
    
    G --> H["Extracted Facts (Proposals)<br/>Status: EXTRACTED"]
    H --> I{"User Action"}
    I -->|"Batch Confirm"| J["POST /facts/confirm-batch<br/>All facts confirmed in 1 click"]
    I -->|"Single Confirm"| K["POST /facts/:id/confirm<br/>Individual verification"]
    
    J --> L["Tax Return Engine<br/>Figures entered into return"]
    K --> L
```

### Pipeline Highlights

1. **Native PDF Text Stream Extraction (DA-1):** Zero external libraries. Directly decodes PDF object streams (`/ObjStm`), FlateDecode compressed streams, and `/ToUnicode` font maps. Tested on real 359-page LIR statutory texts and 20-page official Form 100 PDFs.
2. **Honest Ingestion States (DA-2):** Images uploaded without an OCR engine configured are saved with `status: NEEDS_OCR` and clear explanations, preventing silent failures.
3. **Validated Extraction Contract (DA-3):** Strict field normalization (`normalizeAmount` handles both French `1.234,56` and English `1,234.56` formats).
4. **Resilient Document Classification (DA-4):** Extracts official certificate codes (`101`, `103`, `105`, `141`) directly from de-accented strings.
5. **One-Click Batch Confirmation (DA-5):** `POST /facts/confirm-batch` allows taxpayers to approve all extracted facts from a document in a single atomic transaction.
6. **Document Re-Extraction (DA-6):** `POST /documents/:id/re-extract` re-reads stored documents whenever OCR models or language packs are activated.

> [!NOTE]
> For in-depth architectural and benchmark details, consult [`docs/document-automation.md`](docs/document-automation.md).

---

## Contextual Tax Help Affordances

Luxembourg tax forms contain dense, specialized nomenclature. Lux-Tax provides **63 accessible in-context help affordances** across all 9 primary screens:

- **What it does:** Small interactive **?** icons render contextual explanations in floating portals clamped to the viewport without clipping or layout shifts.
- **Rules followed:**
  1. *Explains the consequence, not the label:* Explains what selecting an option changes mathematically.
  2. *Strict legal citations:* Quotes specific articles (e.g., `(Art. 111bis)`, `(Art. 119 n° 3)`).
  3. *Zero invented figures:* All monetary thresholds are tied directly to engine constants.
- **Accessibility:** Accessible `<button>` elements with `aria-label`, `aria-expanded`, and keyboard navigation support (`Escape` to close).

> [!NOTE]
> For the complete copy catalog and component implementation, see [`docs/help-affordances.md`](docs/help-affordances.md).

---

## Luxembourg Tax Law Alignment (LIR)

The `@luxtax/tax-engine` package contains a pure, deterministic implementation of the Luxembourg *Loi de l'impôt sur le revenu* (LIR):

| Article | Legal Scope | Engine Implementation |
|---------|-------------|-----------------------|
| **Art. 14 & 91 LIR** | Independent & Freelance Profit | Net profit computation (*bénéfice net d'exploitation / professions libérales*) |
| **Art. 102 LIR** | Acquisition Costs (*Frais d'obtention*) | Statutory minimum flat deduction of €540/year per employed spouse |
| **Art. 105 LIR** | Mortgage Interest Deductions | Primary residence ceiling scaled by occupation period (€4,000 / €3,000 / €2,000) |
| **Art. 109 & 111 LIR** | Special Expenses (*Dépenses spéciales*) | Standard flat allowance (€480 single / €960 married) plus deductible insurance |
| **Art. 111bis LIR** | Private Pension Schemes | Supplementary pension deductions up to €3,200/year per spouse |
| **Art. 111ter LIR** | Home Savings Plans (*Bausparen*) | Housing savings contributions scaled by age and household size |
| **Art. 118 – 121 LIR** | Progressive Tax Scale & Splitting | 23 tax brackets (0% to 42%) + Class 2 income splitting (*quotient conjugal*) |
| **Solidarity Fund** | Employment Fund Surcharge | 7% surcharge (or 9% for taxable income exceeding €150,000 Class 1 / €300,000 Class 2) |
| **Art. 127 LIR** | Extraordinary Charges | Medical, disability, and childcare relief exceeding statutory retention thresholds |
| **Tax Credits** | Salaried, Pensioner & Single-Parent | CIS (up to €600), CIP (pensioner credit), CIM (single parent credit up to €2,505) |

---

## Testing & Quality Assurance

The codebase adheres to strict Test-Driven Development (TDD) with over 620 passing unit, integration, and E2E tests:

```bash
# Run all workspace test suites
pnpm test

# Run tax engine mathematical verification tests
pnpm --filter @luxtax/tax-engine test

# Run validation schema tests
pnpm --filter @luxtax/validation test

# Run API E2E & integration test suites (PostgreSQL + Redis required)
pnpm --filter @luxtax/api test:e2e

# Perform static type checking across all workspace packages
pnpm run typecheck

# Verify Next.js web application production build
pnpm --filter @luxtax/web build

# Verify Expo / React Native mobile bundle export (iOS and Android)
pnpm --filter @luxtax/mobile build
```

---

## Security, Privacy & Governance

- **Argon2id Password Hashing:** Memory-hard password hashing with strict length and character complexity requirements.
- **Tenant Isolation:** Household boundaries are strictly isolated at the Prisma ORM layer; cross-household data access attempts return 403 Forbidden.
- **Multi-Factor Authentication (MFA):** Native RFC 6238 TOTP support (`POST /api/auth/mfa/enrol` and `/mfa/activate`).
- **Encrypted Model Credentials:** Third-party model API keys are encrypted at rest using AES-256-GCM (`MODEL_KEY_ENCRYPTION_KEY`).
- **Outbound URL Security:** Admin model endpoints are filtered to prevent Server-Side Request Forgery (SSRF) against private/internal subnets.
- **Rate Limiting:** IP and authenticated user token-bucket rate limiters configured via Fastify.
- **Immutable Audit Trail:** Every authentication, document upload, fact modification, calculation run, and approval generates a tamper-evident audit log with client IP and actor ID.
- **GDPR Rights:** Complete personal data export (`GET /api/user/export`) and irreversible account erasure (`POST /api/user/erase`). See [`docs/data-retention.md`](docs/data-retention.md).

---

## API Overview

The backend API exposes RESTful endpoints structured across modular domains:

| Route Group | Base Path | Key Capabilities |
|-------------|-----------|------------------|
| **Auth** | `/api/auth` | Register, login, refresh tokens, verify email, enrol/activate TOTP MFA |
| **Households** | `/api/households` | Create household, invite co-filers, manage memberships, transfer roles |
| **Workspaces** | `/api/workspaces` | Tax year workspace state (2025, 2026), status transitions |
| **Documents** | `/api/documents` | Upload PDF/images, trigger re-extraction, toggle document visibility |
| **Facts** | `/api/facts` | Create/update tax facts, batch confirm extracted proposals |
| **Taxes** | `/api/taxes` | Execute LIR calculation, inspect provenance, approve return, invalidate |
| **Filing** | `/api/filing` | Form 100 case mappings, missing documents checklist, export package |
| **Freelance** | `/api/freelance` | Invoices, categorized business expenses, P&L generation |
| **Admin** | `/api/admin` | Model registry, task routing rules, connection probing, audit logs |
| **User** | `/api/user` | User profile, GDPR data export (`/export`), account erasure (`/erase`) |

---

## Project Documentation

For specialized technical designs, legal citations, and audit reports, refer to the documentation in `docs/` and the project root:

- [`docs/document-automation.md`](docs/document-automation.md) — Specification and test results for Phases DA-1 through DA-10 of the document extraction pipeline.
- [`docs/help-affordances.md`](docs/help-affordances.md) — Design system and legal citations for all 63 in-context HelpTip affordances.
- [`docs/lir-118-121-bareme-2025-2026.md`](docs/lir-118-121-bareme-2025-2026.md) — Mathematical reference for the 2025/2026 Luxembourg progressive tax scale.
- [`docs/luxembourg-resident-tax-optimisation-checklist-2025-2026.md`](docs/luxembourg-resident-tax-optimisation-checklist-2025-2026.md) — Comprehensive deduction and tax optimization checklist for Luxembourg residents.
- [`docs/dependency-security.md`](docs/dependency-security.md) — Security audit trail, dependency overrides, and CVE remediation.
- [`docs/data-retention.md`](docs/data-retention.md) — GDPR data retention policies, erasure workflows, and legal audit trail rules.
- [`luxembourg-personal-tax-app-plan.md`](luxembourg-personal-tax-app-plan.md) — Master product specification and technical roadmap.

---

## License

This project is licensed under the [MIT License](LICENSE).
