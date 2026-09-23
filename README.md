# Luxembourg Personal Tax Workspace (Lux-Tax)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js Version](https://img.shields.io/badge/node-%3E%3D20.0.0-brightgreen.svg)](https://nodejs.org/)
[![pnpm Version](https://img.shields.io/badge/pnpm-%3E%3D11.18.0-orange.svg)](https://pnpm.io/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.8-blue.svg)](https://www.typescriptlang.org/)
[![Turborepo](https://img.shields.io/badge/Turborepo-v2-blueviolet.svg)](https://turbo.build/repo)
[![Next.js](https://img.shields.io/badge/Next.js-16-black.svg)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-12-ea2845.svg)](https://nestjs.com/)
[![Expo](https://img.shields.io/badge/Expo-v52-000020.svg)](https://expo.dev/)

A secure, collaborative personal income tax workspace for individuals and joint-filer households in Luxembourg (*Administration des contributions directes* - ACD). Available as a responsive web application and native iOS/Android mobile clients.

---

## Table of Contents

- [Core Principles](#core-principles)
- [Key Features](#key-features)
- [Monorepo Architecture](#monorepo-architecture)
  - [Applications](#applications)
  - [Shared Packages](#shared-packages)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Quick Start](#quick-start)
  - [1. Clone and Install Dependencies](#1-clone-and-install-dependencies)
  - [2. Environment Configuration](#2-environment-configuration)
  - [3. Database Migration and Seeding](#3-database-migration-and-seeding)
  - [4. Running the Development Environment](#4-running-the-development-environment)
- [Testing & Quality Assurance](#testing--quality-assurance)
- [Luxembourg Tax Law Alignment (LIR)](#luxembourg-tax-law-alignment-lir)
- [Security & Governance](#security--governance)
- [Project Documentation](#project-documentation)
- [License](#license)

---

## Core Principles

1. **Household-First:** Spouses maintain separate authentication and accounts, collaborating inside a single joint-filing workspace with granular document sharing and mutual approval gates.
2. **Evidence-Linked:** Every declared tax fact links directly to its source document, page, OCR confidence, and audit history.
3. **Deterministic Tax Calculations:** AI assists with extraction and classification; pure, rigorously tested TypeScript calculation engines execute Luxembourg tax law without probabilistic drift.
4. **Human-in-the-Loop:** All extracted facts require explicit taxpayer confirmation before impacting tax calculations or return generation.
5. **Model-Independent AI:** Administrative controls allow dynamic model routing, prompt customization, and connectivity probing for vision and text OCR models.

---

## Key Features

- **Joint-Household & Single Filer Workspaces:** Full support for Tax Class 1 (single), Class 1a (single with children/widowed), and Class 2 (married joint return with income splitting).
- **AI Receipt & Document Vision Scanner:** Automated classification and OCR extraction for salary certificates (*certificat de rémunération*), mortgage interest certificates, private pensions (Art 111bis), childcare/housekeeper expenses, and freelance receipts.
- **Mobile Camera Capture:** Native Expo/React Native camera scanner with real-time border detection, document cropping, and direct backend ingestion.
- **Freelance & Self-Employment (Art 14 & 91 LIR):** Comprehensive revenue tracking, client invoicing, categorised business expense deductions, profit-and-loss calculation, and multi-currency handling.
- **Auditable Calculation Breakdown:** Real-time progressive bracket computation, solidarity fund surcharge (7% or 9%), flat employment expense deductions (*frais d'obtention*), special expenses (*dépenses spéciales*), and detailed provenance trails for every single euro.
- **Filing Package Generator:** Preparation of official Form 100 (*Déclaration d'impôt sur le revenu*) summaries, missing-document checklists, and evidence zip archives ready for manual review or MyGuichet submission.
- **Admin Governance Console:** Live AI model connectivity probes, task routing rules, statutory tax filing deadline trackers, and audit log exploration.
- **Multilingual Support:** Trilingual tax glossary and design tokens covering English, French (*Français*), and German (*Deutsch*).

---

## Monorepo Architecture

This workspace is managed using [pnpm workspaces](https://pnpm.io/workspaces) and [Turborepo](https://turbo.build/repo):

```
.
├── apps/
│   ├── api/             # NestJS 12 + Fastify backend API with Prisma ORM and PostgreSQL
│   ├── web/             # Next.js 16 + React 19 + Tailwind CSS v4 web application
│   └── mobile/          # Expo 52 / React Native 0.76 mobile application (iOS & Android)
│
├── packages/
│   ├── tax-engine/      # Pure, deterministic Luxembourg tax calculation engine (zero dependencies)
│   ├── contracts/       # Shared TypeScript types, DTOs, domain models, and API interfaces
│   ├── validation/      # Shared Zod validation schemas for all inputs and tax rules
│   ├── api-client/      # Type-safe isomorphic HTTP API client (Axios/Fetch wrapper)
│   ├── design-tokens/   # Design tokens, color palettes, and multilingual tax dictionary
│   └── config/          # Shared ESLint, Prettier, and TypeScript configurations
│
└── package.json         # Workspace root scripts and devDependencies
```

### Applications

| Application | Path | Framework / Stack | Port |
|-------------|------|-------------------|------|
| **API** | `apps/api` | NestJS 12, Fastify, Prisma 7, PostgreSQL, Redis, Argon2 | `3001` |
| **Web** | `apps/web` | Next.js 16 (App Router), React 19, Tailwind CSS v4, Lucide | `3000` |
| **Mobile** | `apps/mobile` | Expo 52, React Native 0.76, Expo Router 4, SecureStore | Metro |

### Shared Packages

| Package | Path | Purpose |
|---------|------|---------|
| `@luxtax/tax-engine` | `packages/tax-engine` | Pure mathematical tax calculation according to LIR rules |
| `@luxtax/contracts` | `packages/contracts` | TypeScript interfaces, DTOs, and domain enums |
| `@luxtax/validation` | `packages/validation` | Zod schemas ensuring runtime data validation across all apps |
| `@luxtax/api-client` | `packages/api-client` | Type-safe REST client for consuming API endpoints |
| `@luxtax/design-tokens` | `packages/design-tokens` | Colors, typography, spacing, and trilingual translations (EN/FR/DE) |

---

## Tech Stack

- **Runtimes & Tooling:** Node.js `>=20.0.0`, pnpm `11.18.0`, Turborepo `2.11.2`, TypeScript `5.8.2`
- **Backend:** NestJS, Fastify, Prisma ORM, PostgreSQL, Redis (`ioredis`), Passport JWT, Argon2
- **Frontend:** Next.js 16 (App Router, Turbopack), React 19, Tailwind CSS v4, Lucide React
- **Mobile:** Expo SDK 52, React Native, Expo Router, Expo Camera & Secure Store
- **Testing:** Jest, Node.js Native Test Runner (`node --test`), Supertest

---

## Prerequisites

- **Node.js:** `v20.0.0` or higher
- **pnpm:** `v11.18.0` or higher (`corepack enable pnpm`)
- **PostgreSQL:** `v15` or higher running locally or in Docker
- **Redis:** `v7` or higher running locally or in Docker

---

## Quick Start

### 1. Clone and Install Dependencies

```bash
git clone https://github.com/Pen-Tester-ORG/Lux-Tax.git
cd Lux-Tax

# Install monorepo dependencies
pnpm install
```

### 2. Environment Configuration

Copy the example environment configuration:

```bash
cp .env.example .env
```

Ensure your `.env` contains:

```env
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/luxtax?schema=public"
REDIS_URL="redis://localhost:6380"
JWT_ACCESS_SECRET="dev_luxembourg_tax_jwt_access_secret_32chars_min_2026"
JWT_REFRESH_SECRET="dev_luxembourg_tax_jwt_refresh_secret_32chars_min_2026"
PORT=3001
FRONTEND_URL="http://localhost:3000"
NODE_ENV="development"
```

### 3. Database Migration and Seeding

Run Prisma migrations to set up the PostgreSQL schema:

```bash
# Generate Prisma Client
pnpm --filter @luxtax/api prisma:generate

# Apply migrations
pnpm --filter @luxtax/api prisma:migrate
```

### 4. Running the Development Environment

Start all applications and packages concurrently with Turborepo:

```bash
pnpm dev
```

Or start components individually:

```bash
# Start backend API (http://localhost:3001)
pnpm --filter @luxtax/api dev

# Start web client (http://localhost:3000)
pnpm --filter @luxtax/web dev

# Start mobile development server
pnpm --filter @luxtax/mobile start
```

---

## Testing & Quality Assurance

The codebase enforces strict test-driven development (TDD) and type safety standards:

```bash
# Run all workspace test suites
pnpm test

# Run tax engine unit tests with 100% calculation verification
pnpm --filter @luxtax/tax-engine test

# Run validation schema tests
pnpm --filter @luxtax/validation test

# Run comprehensive end-to-end API lifecycle test suites
pnpm --filter @luxtax/api test:e2e

# Perform static type checking across all packages
pnpm run typecheck

# Production build test for web application
pnpm --filter @luxtax/web build
```

---

## Luxembourg Tax Law Alignment (LIR)

The tax engine implements the provisions of the Luxembourg *Loi de l'impôt sur le revenu* (LIR):

- **Art. 14 & 91 LIR:** Net profit determination for independent and freelance activities (*bénéfice net d'exploitation / professions libérales*).
- **Art. 102 LIR:** Minimum flat deduction for employment acquisition expenses (*frais d'obtention de base*: €540/year per employed spouse).
- **Art. 105 LIR:** Mortgage interest deduction on owner-occupied primary residences scaled by occupation year.
- **Art. 109 & 111 LIR:** Special expenses (*dépenses spéciales*) standard flat allowance (€480 for single, €960 for married joint filing).
- **Art. 111bis LIR:** Private pension scheme contributions (*régime complémentaire de pension*).
- **Art. 118 - 121 LIR:** Progressive income tax scale from 0% to 42% across brackets, with Class 2 splitting method (*quotient conjugal*) and solidarity surcharge (*contribution au fonds pour l'emploi*).

---

## Security & Governance

- **Zero Hardcoded Credentials:** All secrets are externalized to environment variables and validated at runtime.
- **Password Security:** Password hashing via memory-hard Argon2id with strict length and complexity policies.
- **Multi-Tenant Household Isolation:** Enforced at the Prisma ORM layer ensuring no cross-household data leakage.
- **Audit Logging:** Every user action, fact confirmation, tax calculation, and document upload records an immutable audit event with actor, timestamp, and IP address.
- **Privacy Controls:** Taxpayers can mark uploaded receipts and documents as private drafts before sharing them with a co-filing spouse.

---

## Project Documentation

Detailed product plans, legal references, and technical specifications are available in:
- [`luxembourg-personal-tax-app-plan.md`](./luxembourg-personal-tax-app-plan.md) — Comprehensive product and technical specification.

---

## License

This project is licensed under the [MIT License](LICENSE).
