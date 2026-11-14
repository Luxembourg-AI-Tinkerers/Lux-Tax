# Lux-Tax implementation tracker

## 2026-11-10 — a “?” beside every option that needs one

Sixty-three plain-language explainers now sit next to the options a taxpayer
cannot be expected to decode: tax class, the Art. 111 and 111bis envelopes, CIM,
ASRD, travel units, marginal versus effective rate, the four document-visibility
states, the approval gate, the data classes in the admin console. The record is
[`docs/help-affordances.md`](docs/help-affordances.md).

Behaviour follows what people expect from modern products: hover or keyboard
focus opens the bubble, click pins it for touch, Escape closes it. It renders in
a portal with fixed positioning, so a table's scroll container cannot clip it, and
it flips above the trigger near the bottom of the screen.

Two details cost a pass of their own. A tip inside a wrapping `<label>` renamed
the checkbox (“Employment income About: Employment income”) — the tips now sit
after the label, which shrank to `inline-flex w-fit` so they stay on the same
line. And the test harness compiles JSX with the classic transform, so the
component imports React like every other one in `apps/web`.

**Verification.** `apps/web/test/help-tip.spec.ts` — 9 tests (placement geometry;
no unused copy, no `?` without copy, no paragraph-sized tooltip, and a floor on
where the help appears). `tsc --noEmit` exit 0, `next build` green, and a real
browser pass at 440 px: 25 affordances on the questionnaire, correct copy on
open, `aria-expanded`/`aria-describedby` set, bubble inside the viewport, Escape
closes, and clicking a tip does not toggle its checkbox.

---

## 2026-11-10 — document automation: upload → text layer → figures

The pipeline could calculate a return precisely and could not read the documents
the return is made of: extraction ran `buffer.toString('utf-8')` over the uploaded
bytes and keyword-matched the result, so a real PDF (FlateDecode streams) produced
noise and a photograph produced nothing at all — silently, because "no facts found"
and "no deductible amounts" looked identical.

Phases DA-1 … DA-8 close that gap; the record, the measurements and the explicit
backlog are in [`docs/document-automation.md`](docs/document-automation.md).

| Phase | Delivered |
|---|---|
| DA-1 | Dependency-free PDF text layer (`node:zlib` + `/ToUnicode` CMaps + `/ObjStm`), 20-page Form 100 and 359-page LIR read correctly |
| DA-2 | One entry point (`readDocumentText`) with `TEXT_LAYER` / `EMBEDDED_TEXT` / `PLAIN_TEXT` / `NONE`; `DocumentStatus.NEEDS_OCR`, `extractionSource`, `ocrRequired` |
| DA-3 | Vision models behind a validated contract: field allowlist, amount normalisation, fallback chain, per-call data-class check |
| DA-4 | `TRAINING_INVOICE`, `MEDICAL_INVOICE`, `RECEIPT` — a dental bill is no longer a childcare invoice |
| DA-5 | `POST …/facts/confirm-bulk` (each fact still audited individually) + *Confirm all* in the vault |
| DA-6 | `POST …/documents/:id/reextract`, audited as `DOCUMENT_REEXTRACTED` |
| DA-7 | `Needs OCR` chip and *Re-scan* action in the document vault |
| DA-8 | 420 / 420 unit tests, `next build` green, 22 migrations with zero drift |
| DA-9 | In-process OCR: `OcrEngine` port + Tesseract CLI adapter (`OCR_TESSERACT_PATH`, `--psm 6 -l fra`); a photographed receipt now yields figures with no model registered |
| DA-10 | Scanned PDFs: page images are pulled out of the file (JPEG passthrough, Flate → PNG) and sent through the same OCR port; a scan-to-PDF now yields figures too |

Also cleared: `audit_events.actorId` kept an `ON DELETE RESTRICT` foreign key after
it became nullable, so `migrate diff` reported a difference on every run.

**Not done, on purpose:** bundling Tesseract with the app, rasterising a *vector*
page that has neither text nor an image, table-aware extraction, and a
questionnaire task type for `NEEDS_OCR`. Each is listed with what it needs in the
backlog.

**The HTTP e2e still cannot run on this machine** — `@nestjs/testing` is ESM-only and
the Jest 29 configuration has no transform for `node_modules`. Two substitutes were
run instead: `apps/api/test/document-pipeline.spec.ts` (real PDF bytes → text layer →
typed figures) and a live HTTP pass against the built API and a migrated database —
register → household → workspace → upload a 41 KB PNG of a receipt → **3 figures,
`extractionSource: OCR`** — with a real Tesseract 5.4.0 process.

---

## 2026-11-10 — dependency security: 71 vulnerable copies → 5

GitHub reported **28 Dependabot vulnerabilities** on the default branch (4 critical, 7 high,
10 moderate, 7 low) after the review closure. A lockfile audit found **71 vulnerable copies
across 19 packages** — Dependabot counts a package once, the audit counts every installed copy.

`next` 16.3.5 → **16.4.6**, `postcss` → **8.5.32**, `zod` 3.25 → **4.6.7**, `fastify` →
**5.12.8**, plus 14 pinned transitive copies (`tar`, `@xmldom/xmldom`, `image-size`, `uuid` ×2,
`handlebars`, `mysql2`, `deepmerge-ts`, `fast-uri` ×2, `qs`, `ip-address`, `sharp`,
`source-map-js`, `fastify@5.12.5`). Every critical and high is gone; what remains is `glob`
10/13 and `minimatch` 9/10 (pinned by expo and `@fastify/static`) and `deepmerge` (the advisory
names 4.3.2 as patched, but that version is not published).

**Verification.** 826 / 826 unit tests, three typechecks at 0, `next build` green on six routes
with Next 16.4.6, `pnpm audit` → 3 (the documented residuals). The mobile bundle could **not**
be re-verified: Metro 0.81 follows pnpm's store symlink and then cannot resolve the next bare
import, and the app's hand-built flat `node_modules` is what made it bundle before. Full record
and reasons: [`docs/dependency-security.md`](docs/dependency-security.md).

**Two defects the rebuild surfaced,** both fixed: the dashboard activity feed called
`event.actorId.substring()` on an optional value (`USER_LOGIN_FAILED` has no actor), and
`apps/web` inherited `declaration: true` from the shared tsconfig, which fails the build
(`TS2742`) once types resolve through the store.

**GOAL STATUS: `PARKED`** — 2026-11-09
R6 (2026 CIC bands) and R7 (épargne-logement age limit) are **deferred to the backlog**, not queued as
the current task. They need the Mémorial publication of projet de loi 8775, which does not exist yet:
`impotsdirects.public.lu/fr/legislation/legi26.html` still ends at the *loi du 16 juillet 2026*
(Mémorial A N° 360) and `chd.lu/fr/dossier/8775` still shows *22.06.2026 — Déposé*.
Everything else is implemented and evidenced (**826 unit tests across 81 spec files, 67 API e2e
tests across 8 suites, 19 migrations, zero drift** — re-measured 2026-11-10). The web app now
also **builds and runs**: `next build` produces six routes and a real browser pass covers
register → facts → calculate → approve → package → assessment → invite (see the site-e2e section). The daily-watch task this tracker recorded
(`861a3eef-273d-470c-a1de-475e4448138b`) is **no longer present** in the scheduler: `schedule_task
list` returns only an unrelated, disabled school-library follow-up. Nothing will therefore report
the publication of 8775; re-creating the watch is a separate, explicit step.

**Goal:** implement the Luxembourg resident-tax findings into the app, incrementally and in phases.

**Status legend:** ✅ done · 🟡 partial · ⬜ todo · ⛔ blocked by the environment (not by scope)

**Last updated:** 2026-11-09 (ninth pass) · Phases 0–44 implemented · **563 tests passing** across **46 spec files** · **8 Prisma migrations applied to PostgreSQL 18.4, `migrate diff` empty (zero drift)** · `tsc -p tsconfig.test.json` and `tsc -p tsconfig.render.json` both exit 0 · 68 files syntax `ok` · **API e2e and a React Native build are NOT run** in this environment (mobile renderers are mounted through a `react-native` primitive shim — see Phase 32) · **R6/R7 blocked on projet de loi 8775** · gap check: `gap-check-2026-11-08.md`

> **Status at 2026-11-09 (end of the current run)**
>
> - **Implemented and tested:** Phases 0–44 — tax engine, filing package + annex PDFs, eight
>   Prisma migrations applied with zero drift, API hardening, mobile policy layers.
>   Evidence: **513 / 513 tests**, `tsc -p tsconfig.test.json` exit 0,
>   `tsc -p tsconfig.render.json` exit 0 (JSX layer type-checked), 68 files syntax `ok`.
> - **Mounted in tests, not on a device:** the two mobile renderers (`OfflineBanner`,
>   `AppLockScreen`) are now mounted with React 18 through a `react-native` primitive shim
>   (Phase 31), so their props, branches and rendered text are proven. Layout, styling,
>   gestures and the biometric sensor are **not** — there is no NativeModule and no build here,
>   and the Phase 22–24 screen wiring remains transpile-only.
> - **Blocked on an external document (not on code):** **R6** (2026 CIC monthly bands) and **R7**
>   (épargne-logement age limit). Projet de loi 8775 is unpublished — the ACD list
>   `legi26.html` still ends at the *loi du 16 juillet 2026* (Mémorial A N° 360) and
>   `chd.lu/fr/dossier/8775` still shows only *22.06.2026 — Déposé*, re-verified on 2026-11-09.
>   Both are gated in the rule package, and as of Phase 30 the gate is **executable**:
>   `cicForMonthlySalary()` returns `NOT_IN_FORCE` instead of a silent `0`, and
>   `checkPendingConsistency()` / `assertPendingConsistency()` reject a package that declares a
>   measure in force without its data (or carries data for a measure not in force). An 11-test spec
>   exercises the full four-edit activation against a *synthetic* clone, so the runbook is proven
>   without publishing a figure that does not exist. No number has been invented to close them.
>
> **Recommendation: close this run as `externally blocked`.** Every other item is implemented and
> evidenced. R6/R7 cannot move until the Mémorial publishes projet de loi 8775; the daily watch
> (`861a3eef-273d-470c-a1de-475e4448138b`, 08:00 Europe/Luxembourg, read-only) reports that morning,
> and activation is the four documented edits — `cic.bands`, `savingsHousingYoungMaxAge: 200`,
> both `pendingMeasures` → `IN_FORCE`, then the suite. Re-checked again at the end of this run:
> `legi26.html` still ends at the *loi du 16 juillet 2026*, unchanged.
>
> **Requirements source:**
- `luxembourg-tax-resident-gap-analysis.md` — audit + P0/P1 plan
- `docs/luxembourg-resident-tax-optimisation-checklist-2025-2026.md` — legal levers
- `research/mixed-professional-income-2025-2026.md` — salarié + indépendant
- `research/class2-vs-art3ter-2025-2026.md` — couples
- `docs/lir-118-121-bareme-2025-2026.md` — scale + Art. 120bis
- `lux-deductions-2025-2026-research.md` — FO/DS/CE
- `research-filing-2025-2026.md` — Form 100

---

### The API actually runs — and the first e2e run found four defects

The ninth pass recorded the API as unrunnable here. It was worse than that: the API **did not
compile**, and the reason the suite had never caught it was that `tsc -p tsconfig.api.json` was
dismissed as "107 pre-existing errors from missing packages".

| # | Defect | Fix |
|---|---|---|
| Prisma 7 | `schema.prisma` still carried `url = env("DATABASE_URL")`. Prisma 7 rejects it outright — `prisma generate` failed, so there was no client and the API could never boot. | The URL lives in `apps/api/prisma.config.ts`, where Prisma 7 requires it. `prisma generate` now succeeds. |
| Outbox | `NotificationOutboxService`'s `store` getter returned an object literal whose methods used `this.prisma`; inside a literal `this` is the literal, so every delivery attempt threw before touching the database. | The client is captured before the literal. Typed `enqueue` channels as `DeliveryChannel`. |
| Rate limit | `request.raw?.res?.setHeader` does not exist on Fastify's `IncomingMessage` and did not typecheck. | Resolved through the reply object. |
| PROD-2 helper | `requiredApproverCount` took `string` while `taxClass` is nullable. | Accepts `string \| null \| undefined`. |

With those four fixed, `tsc -p apps/api/tsconfig.json` exits 0 for the first time.

**The run.** A fresh database `luxtax_e2e` received all **13 migrations**; the API was built with
`tsc` and started on port 3011. A live HTTP pass exercised register → login → household →
calculate → approve → filing package → return-versions → scenario comparison → notifications →
device registration:

- **16 / 16 live checks** passed, including `calculate` (engine), the stored result's
  `deductions.specialExpensesCovered`, the CIM split, `approve` and package generation.
- **6 / 6 jest e2e suites, 53 / 53 tests** passed (59 / 59 across 7 suites after the PROD-2 spec).

Two further defects surfaced only because the suite finally ran:

| # | Defect | Fix |
|---|---|---|
| API-10 vs cleanup | The append-only trigger rejects every DELETE on `audit_events`, so a household delete — which cascades into audit rows — could never succeed. Every suite reported a failure in `afterAll`, and a second run then collided on the fixed test e-mails. | The trigger now honours a **session flag** (`luxtax.allow_audit_purge = 'on'`) that only a `SET LOCAL` inside the test transaction sets. Production stays deny-by-default. `apps/api/test/support/audit-purge.ts` is the only caller. |
| Freelance e2e | The suite asserted `taxableIncome = 14 540` (the €960 couple forfait) while its fixture never declared a tax class: the engine correctly applied the €480 single-filer forfait. | The expectation is corrected to 15 020, with a comment that Class 2 must be declared explicitly — the engine never infers marriage from a second member. |

The e2e harness itself also needed the jest globals typed (`types: ["node", "jest"]` in
`jest-e2e.json`); without them ts-jest failed to compile every spec.

## 2026-11-10 — the mobile bundle builds (gap 3's last element)

**`cd apps/mobile && npm run build` exits 0**: iOS 957 modules, Android 954, both written as Hermes
bytecode (~2.5 MB each) under `dist/`, which is git-ignored. The app's own screens, `src/lib`, the
workspace packages and the Expo runtime are all in the bundle — the first real React Native build in
this project.

### Correcting the record

Two earlier conclusions were wrong and are retracted here:

- **"expo@52 is truncated on this registry."** It is not. Registry metadata, a direct download whose
  SHA-1 matches the advertised `shasum`, and jsDelivr's independent mirror all agree on **295 files**
  with the same contents. `npm pack` returning a small archive was correct.
- **"expo imports `../lib/statuses`, which it does not ship."** It does not import it; the published
  file is 50 self-contained lines, identical in a fresh Python extraction and on disk.

### The real blocker

`browserslist`'s nested `caniuse-lite` had been copied incompletely — **611 files, no
`package.json`, no `dist/lib/`** — so its own `dist/unpacker/feature.js` could not load
`../lib/statuses` and the Babel transform worker died before Metro transformed anything. Metro names
whichever file it was transforming when the worker failed, which is why the error pointed at
`expo/src/errors/ExpoErrorManager.native.ts`, then `@babel/runtime/helpers/interopRequireDefault.js`,
then `expo-router/entry.js` on three consecutive runs. Three symptoms, one broken dependency.

A second instance: `@react-navigation/elements` shipped **14 of its 29** assets, missing
`close-icon.png` and `search-icon.png` that its own `index.js` imports.

Both repaired by extracting the published tarballs with Python's `tarfile` — a different extractor
from npm, which was the one thing worth changing: `caniuse-lite` now has 841 files including
`dist/lib/statuses.js`, and the navigation package has all 29 assets.

### Repository defects fixed

| Defect | Fix |
|---|---|
| `apps/mobile` absent from `pnpm-workspace.yaml`, so no install ever resolved it | added |
| `@luxtax/*` declared as bare `"*"`, which pnpm 11 does not link (default `link-workspace-packages=false`); it looked for `@luxtax/config` on the registry | `workspace:*` |
| No lockfile importer for the app → `--frozen-lockfile` would fail | regenerated; `pnpm install --frozen-lockfile` passes |
| `metro.config.js` watched `node_modules` again, which empties Metro's file map when that path is a junction (`Cannot read properties of undefined (reading 'get')`) | watch `packages/` only |
| No `assets/`, `babel.config.js`, `metro.config.js`; `@babel/runtime` and `expo-asset` undeclared | added in this pass |

### The pnpm shim on this machine is a no-op

`pnpm -v` prints nothing and exits 0: the installed `pnpm.ps1` calls `node_modules/pnpm/pnpm` without
a file extension. Every earlier "pnpm install never finishes" observation measured a command that
never ran. Invoked properly (`node …/pnpm/bin/pnpm.mjs`) it reports **11.18.0** and resolves the
mobile graph (1347 packages) before stalling on tarball fetches — the sandbox destroys its outbound
connections (`UND_ERR_DESTROYED`), and `--offline` cannot help because the store never held the
mobile dependencies.

**Verification.** 826 unit tests (159 suites, 81 files), 67 API e2e (8 suites), three typechecks at
0, `next build` six routes, `npm run build` in `apps/mobile` green for both platforms.

---

## 2026-11-10 — the three policy items, closed

The review-closure pass recorded three findings as deliberately open. All three are now closed, with
the decision written next to the code.

### L3 — a rejected login is an audit event

`USER_LOGIN_FAILED` (new enum value + migration `20261110160000_login_failed_audit`) is emitted on
every refusal: wrong password, inactive account, failed second factor, **and an address that matches
no account**. The last one matters most — it is what an enumeration or credential-stuffing run
produces, and it was the only case that used to leave no trace at all.

`audit_events.actorId` became nullable for it. That is the honest model: with no account there is no
actor, and dropping those rows would delete the signal. Existing rows keep their actor and their
hashes — the canonical payload hashes the id when present and `null` when absent, so the chain
verifies unchanged.

The emitter never records the submitted secret (asserted by an e2e that greps the whole row for it)
and never turns a refusal into a 500: an audit failure is logged and the caller still gets its 401.

### L6 — proxy trust is configuration, and the default is "do not trust"

`X-Forwarded-For` is client-controlled. The auth controller used to read it directly
(`req.ip || req.headers['x-forwarded-for']`), which let any caller write an arbitrary address into the
audit trail and reset the per-IP rate-limit bucket at will. That read is gone.

`TRUST_PROXY` now builds Fastify's `trustProxy` (`apps/api/src/config/proxy-trust.ts`):

| Value | Meaning |
|---|---|
| unset / `false` | the socket address is the client address; the header is never consulted |
| `1` … `n` | trust the last *n* hops (compiled to Fastify's hop predicate) |
| `10.0.0.0/8,...` | trust the header only when the peer is in a listed network |
| `true` | trust unconditionally — only correct when nothing but the proxy can reach the API |

An unreadable value falls back to **no trust**: a typo in a deployment variable must not silently
enable the header. `proxy-trust.spec.ts` (6 tests) pins that, including the case where a bare word
was being accepted as a network list — the test caught it and the parser now validates every entry.

### M10 — retention, erasure and export

| Right | Endpoint |
|---|---|
| See where I am signed in | `GET /api/users/me/sessions` |
| Get a copy of my data | `GET /api/users/me/export` |
| Erase my account | `DELETE /api/users/me` |

`Session.ipAddress`/`userAgent` were declared but never written, so the list would have been empty of
anything a user could recognise; they are now recorded at issue. Export returns one JSON document
(profile, memberships, workspaces, the facts the user owns, their document metadata, filing records,
their own audit events, sessions) and is itself audited.

Erasure anonymises the identity in place — address replaced by `deleted-<uuid>@deleted.invalid`,
password hash destroyed, verification and MFA state cleared, `tokenVersion` bumped, profile names
blanked — deletes sessions, push registrations and memberships, and renames a sole household to
"Deleted household".

**What it deliberately does not do:** delete the household, its workspaces or the audit trail. The
append-only trigger rejects the `UPDATE` a cascade would need, so a household with any audit history
cannot be deleted at all — a constraint the database enforces, not a preference. A filed return is
also a tax record with its own retention. And a shared household blocks erasure with **409** while
another active member depends on the owner: erasing them would leave a co-filer unable to administer
or file.

Retention of derived data: the raw text a model read from a document (`DocumentExtraction.extractedText`
and `rawJson`) is cleared as soon as every fact of that document is confirmed, and expired sessions are
deleted as the next one is issued. Policy, including the parts that remain manual, is in
`docs/data-retention.md`.

Implementation note: `document_extractions.extractedText` had to become nullable
(`20261110161000_retention_and_lifecycle`), which also carries the two lifecycle events.

**Verification.** `account-lifecycle.e2e-spec.ts` — 8 e2e tests (failed login ×3 paths, spoofed
header ignored, session list, export, erasure refusal, erasure effects). `proxy-trust.spec.ts` — 6
unit tests. The receipt-scanning e2e now asserts the snippet is cleared after confirmation.
**826 unit / 159 suites / 81 files; 67 API e2e / 8 suites; three typechecks at 0.**

---

## 2026-11-10 — PROD-2: closed in code, and now enforced by the build

**Status: RESOLVED.** The code review's H6 finding is closed. All three approval gates in
`apps/api/src/modules/filing/filing.service.ts` compute the required approvers through the single
helper `requiredApproverIds`:

| Gate | Line | Call |
|---|---|---|
| `approveReturn` | 190 | `requiredApproverIds(workspace.household.members)` |
| `recordFiling` | **1222** | `requiredApproverIds(workspace.household.members)` |
| history builder | 1543 | `requiredApproverIds(workspace.household.members)` |

No other approver computation remains in `apps/api/src`. The compiled artifact agrees: the three
matching lines in `apps/api/dist/.../filing.service.js` call the helper too, so the running server is
not on a stale build.

**Why the finding stayed open in the record.** The review captured the defect with its original line
number (1205) and a code quote; the fix moved the line to 1222, and the review body kept reading in
the present tense. Both are corrected: the review now shows an explicit BEFORE/AFTER pair and leads
with RESOLVED.

**Two guards, each mutation-checked by reverting that exact line:**

1. `apps/api/test/prod2-source-invariant.spec.ts` — **4 tests, new.** Asserts the helper is called
   exactly three times in `filing.service.ts`, that no gate rebuilds the list from household members,
   that the helper filters `VIEWER` and nothing else (a widened exclusion would silently lower the
   approval bar for a joint return), and that no other module in `apps/api/src` maps
   `household.members` into approvers. Reverting the `recordFiling` line fails **3 of the 4**.
2. `apps/api/test/viewer-approver.e2e-spec.ts` — **6 tests.** Builds a Class 2 household of two
   filers plus a VIEWER through the public API: the viewer gets **403** on approve, both filers reach
   `APPROVED`, and the return **files (201)**. Reverting the same line fails **3 of the 6**, with the
   predicted 400 "Every required household member must approve the return before it is filed".

**Verification after the change:** **820** unit tests (158 suites, 80 files), **59 / 59 API e2e**
(7 suites, rebuilt `luxtax_e2e`, 17 migrations), `tsc -p tsconfig.test.json` 0,
`tsc -p apps/api/tsconfig.json` 0.

**Observation, not a change (Low).** `questionnaire.service.ts:211` accepts `MARRIED` when
`household.members.length >= 2`, which a VIEWER satisfies. The engine then treats the return as
Class 2 without an assessed spouse (`selectFilerMembers` only considers filer roles, and
`class2WithoutSpouse` is reserved for widow(er)/divorced), which is a coherent outcome rather than a
crash — so this is a copy/validation nicety, not the PROD-2 defect, and changing it would need a
product decision on what a viewer is allowed to unlock.

## 2026-11-10 — build verification: web green, mobile unbundleable here

`next build` produces the six routes and exits 0 (`BUILD_ID 6ZD8uFg_EMiGCLT8KGH_f`); nothing new to
fix. The mobile app had never been bundled, and the attempt exposed **five real defects**, all fixed:

1. `app.json` referenced three images that **did not exist** (no `assets/` at all) — any Expo command
   aborted on config validation.
2. **No `babel.config.js`** — Metro had no transform for `.tsx`.
3. **No `metro.config.js`**, although the app imports `@luxtax/*` from outside its root — every screen
   failed with "Unable to resolve module @luxtax/contracts".
4. **`@babel/runtime` was not declared** — Metro's own prelude failed to resolve its helpers.
5. **`expo-asset` was not declared** — `@expo/metro-config` needs it before bundling.

With those fixed, Metro resolves **772 modules** of the real app (screens, `src/lib`, the workspace
packages through symlinks) and then dies inside `expo` itself:
`src/errors/ExpoErrorManager.native.ts: Cannot find module '../lib/statuses'`.

That is an environment defect: `expo@52` ships TypeScript sources only (`main: src/Expo.ts`,
`build/` contains **0** `.js` modules), and every install of it obtainable here is truncated —
83 source modules with an empty `src/lib`, reproduced by two independent installs of two different
major versions, after which `npm install` into the tree aborts with `Invalid Version`.
`npm cache verify` found and cleared 69 corrupt entries (128 MB), which is how `react-native`
eventually installed at all.

`apps/mobile/package.json` gained a `build` script (`expo export … --output-dir dist`) so the bundle
is one command on a machine with a working install. Details:
`build-verification-2026-11-10.md`.

---

## 2026-11-10 — review closure: 21 security + 19 code findings

Every finding from `security-review-2026-11-10.md` and `code-review-2026-11-10.md` is closed except
three recorded product decisions (retention/erasure, the failed-login audit event, proxy trust). The
detail is in `review-closure-2026-11-10.md`; this is the summary.

**Criticals, both re-exploited to prove they are gone.** An allowlisted address registered without
proof is now refused (`/api/admin/audit` → 403, was 200 with 105 rows across 12 households), and the
process refuses to boot without `JWT_ACCESS_SECRET` instead of signing with a literal.

**Highs.** The private-fact leak is closed in one predicate (snapshot, engine and package now agree);
rate limiting is on by default with a per-address credential bucket (401×5 then 429); e-mail
verification is real and gates both admin and invitation acceptance; helmet is registered (6/6
headers); `@Roles` covers the three viewer-writable routes; the activity feed is redacted for
non-filers; MFA is wired end to end (enrol/activate/disable, sealed seed, recovery codes, replay
guard); refresh tokens gained families with reuse detection and `tokenVersion` makes logout
immediate.

**Engine.** A pension withholding is no longer taxed as income; a standalone qualifying dividend is
no longer untaxed; the Art. 115 tranche reaches the base; CIS/CIP tie-break is strict; future-dated
years are refused with a warning; one rounding rule remains.

**Data.** Assessments are unique per (workspace, tax year); the audit chain takes a per-household
advisory lock so it cannot fork; `filing-record` no longer counts VIEWERs; the phantom
`matriculeEncrypted` column is gone.

**Verification.** 826 unit tests, 67 API e2e (8 suites), three typechecks at 0, `next build` green, 17
migrations. The probe `tmp/verify-hardening.cjs` re-runs the security exploits on demand.

---

## 2026-11-10 — full site e2e: the browser found what the API tests could not

The API e2e of the previous pass runs through `app.inject`, which sends no preflight, no `Origin`
and never exercises the client bundle. The web app had never been built, so its first real run in a
browser was also its first run at all. It found **seven defects**, five of them user-blocking.

### Fixed

| # | Defect | Why it mattered | Fix |
|---|---|---|---|
| S1 | **CORS preflight answered `GET,HEAD,POST` only.** | Every `PUT` / `PATCH` / `DELETE` from the browser died as *“Failed to fetch”*: saving the questionnaire, editing or deleting a fact, changing a document's visibility, saving a freelance profile, saving notification preferences. The whole editing surface of the app was unusable. | Explicit methods + allowed headers in `main.ts`. |
| S2 | **The API client always declared `Content-Type: application/json`**, even on bodyless POSTs. | Fastify rejected `POST /calculate`, `/approve`, `/read-all`, `/rollover` with *“Body cannot be empty when content-type is set to 'application/json'”* — the first tax calculation from the UI was impossible. | The header is only sent when a body exists (`packages/api-client`). |
| S3 | **The extractor typed a salary certificate as a childcare invoice** and produced `trainingCourseExpense €76,800`. | Confirming it would have booked a €76,800 *deduction* from a salary certificate — a large understatement of tax. Root cause: the training branch matched the substring `'certif'`, inside “**certif**icat”. | The trigger is gone; the salary branch matches on de-accented text. |
| S4 | **Codes 105 and 141 were silently dropped** from the app's own sample. | The withholding regex required “retenue d'imp**ô**t” with a circumflex; the sample says “impot”. Two of the four certificate lines were lost. | Certificate lines are parsed by **code** (`101`, `103`, `105`, `141`), accepting both `101. …` and `Code 101 - …`, which is accent-, wording- and language-independent. |
| S5 | **Accepting an invitation ignored the invited address, and overwrote the member's role.** | A `PRIMARY_FILER` who opened a `CO_FILER` invitation was **demoted to CO_FILER** (observed in the database), and any signed-in user holding a link could join the household. | The accepting account must match the invited e-mail (403 otherwise); an existing membership keeps its role; a revoked invitation is refused. |
| S6 | The objection deadline and follow-up date stayed blank after importing a bulletin. | The panel told the user the dates came from the API, and showed empty fields. | The import handler fills both states from the response, as the initial load already did. |
| S7 | “Return version approved successfully! **Both spouses can now review.**” on a single-filer return. | Wrong copy for the common case. | The spouse clause is only appended when the household has more than one active member. |

### Verified in a real browser, against the real API and PostgreSQL

| Step | Result |
|---|---|
| `next build` (first ever) | 6 routes, exit 0 |
| Register → dashboard | ✅ |
| Sign out → sign in | ✅ |
| Quick Load 2025 demo facts | 6 facts, gross salary €75,000 |
| Calculate | taxable €61,385, marginal 39 %, effective 20.2 %, refund €389.63, 6 rules |
| Approve return | ✅ liability €12,410.37 |
| Generate filing package | 10 Form 100 boxes, SHA-256 checksum |
| Questionnaire save (PUT) | ✅ after S1 |
| Upload sample certificate | SALARY CERTIFICATE, **4** figures (101/103/105/141) after S3+S4 |
| Confirm a figure | 4 → 3 pending |
| Import ACD bulletin | **variance €0.00 — exact match** |
| Record filing on an invalidated return | correctly refused (400) and shown to the user |
| Admin console as a normal user | API 403, shell renders |
| Invitation page | renders inviter/role/expiry; wrong-account accept → **403** after S5 |

### Found, reported, **not** changed

| Item | Why it is left alone |
|---|---|
| Demo facts omit `mortgageFixationYear`, so the demo's own €3,500 mortgage interest is refused (with a warning). | The engine's Phase 38 guard is right; the demo dataset needs the missing field. Deciding the demo's legal inputs is a product call. |
| **DS 1553 = EUR 3,200 against an engine line of EUR 3,700** — **RESOLVED, not a defect.** 1553 carries the expenses covered by the statutory minimum (1503 Art. 111bis = 3,200); Art. 112 donations are additional and sit on 1611 (500); LRCP 1609 is 0, so 3,200 + 0 + 500 = 3,700 and the package reconciles to the engine. Folding the donation into 1553 would double-count it. Pinned by `apps/api/test/form100-case-map.spec.ts`. |
| The admin shell shows “● HEALTHY” and zero counters for a non-admin. | The API correctly returns 403; the shell should say “administrator access required”. |
| After a material change invalidates the approval, the Assessment tab still offers “record filing”. | The failure and its message are correct; the tab simply does not say “re-approve first”. |
| The two web render specs fail whenever `apps/web/node_modules` exists. | They need React 18 (`react-test-renderer` 18 in `.tools`) while the app is React 19. A harness fragility that a normal `pnpm install` would expose; it is not a product regression (620/620 pass with the folder absent). |

**Verification.** `next build` exit 0 · **620 / 620** unit tests · **53 / 53** API e2e tests ·
`tsc -p tsconfig.test.json` and `tsc -p tsconfig.render.json` exit 0 · 13 migrations, zero drift.

**Environment note.** `pnpm install` still links at roughly ten packages per minute here and never
finishes; the app was therefore run through a flat junction farm (`tmp/flat`) over the already
populated pnpm store. That changes how the suite was executed, not what it proves.

---

---

## 2026-11-09 — tenth pass: the recorded residuals, closed

The ninth pass left six items "recorded, not changed". This pass changes five of them and adds the
verification the earlier passes could not produce.

| # | Delivered | Evidence |
|---|---|---|
| PROD-2 | **A VIEWER no longer counts as a required approver.** The write-role guard forbids a VIEWER from approving, so a Class 2 household that invited one could never reach APPROVED: the gate waited for an approval the API answered with 403. `requiredApproverIds` / `requiredApproverCount` are pure helpers in `return-version-history.ts`; **all three** service call sites use them (`approveReturn`, `recordFiling`, the history builder), and `getLatestReturnVersion` no longer counts every active member. | `apps/api/test/return-version-history.spec.ts` — 7 unit tests; `apps/api/test/viewer-approver.e2e-spec.ts` — 6 e2e tests over the public API (see the 2026-11-10 PROD-2 section) |
| Imputation order | **The non-refundable child relief is now imputed before the refundable CIM.** Art. 122 / 123bis bite only on the tax still due, while Art. 154ter al. 2 pays the CIM excess out — imputing the refundable credit first extinguished the tax the relief had to reduce and destroyed up to EUR 922.50 per child. The order is now: non-refundable credits → child relief → CIM. On the reference household (Class 1a, EUR 40,000, one moderated child) the dégrèvement goes from 0 to 749.96 and the refund from 2,754.04 to 3,504. The household is never worse off, and a second test pins that the CIM refund grows by exactly the relief. | `packages/tax-engine/src/engine.ts`; `packages/tax-engine/test/tax-engine.spec.ts` — 1 test rewritten, 1 added |
| Form 100F — Art. 14 vs 91 | **A filer carrying both natures no longer has them netted together.** The accumulator was keyed by owner only, so one Art. 91 fact turned the whole group liberal and dragged the commercial profit onto sheet I. It is now keyed by owner **and** nature, and each nature gets its own line and its own correct label. | `apps/api/src/modules/filing/filing.service.ts` |
| Form 100F — foreign nature | **Exempt foreign income names the sheet it belongs on.** `foreignNatureSheet` maps `foreignSalary` → S, `foreignPension` → P, `foreignCapital` → CM, `foreignRental` → L; an unknown or absent key returns `null` and the package falls back to the generic "S/P/CM/L" sentence instead of guessing. The credit stays on RD 1081/1082 either way. | `apps/api/src/modules/filing/form100-case-map.ts`; `apps/api/test/form100-case-map.spec.ts` — 3 new tests |
| Legacy snapshots | **A stored result from an earlier model version is reconstructed, not discarded.** `normalizeStoredCalculation` rebuilds `deductions.specialExpensesCovered` from its four components and the CIM split from the cote and the non-refundable credits — the only two fields the numbers determine. A stored split whose halves do not add up to the credit is recomputed rather than displayed. A snapshot with no breakdowns at all stays `legacy: true` and the calculator keeps offering a recalculation. | `apps/api/src/modules/calculations/calculation-snapshot.ts`; `apps/api/test/calculation-snapshot.spec.ts` — 15 tests |
| SMTP | **A real SMTP client, not a JSONL placeholder.** Dependency-free (`net`/`tls`): implicit TLS on 465, STARTTLS on 587, `AUTH PLAIN` / `AUTH LOGIN`, dot-stuffing, CRLF framing, base64 UTF-8 body, RFC 2047 subject, a per-command timeout, and a `X-LuxTax-Notification-Id` correlation header. `SMTP_HOST` selects it; unset keeps the local sink. Proven against an in-process SMTP server that speaks the protocol and records the command sequence. | `apps/api/src/modules/notifications/adapters/smtp-email.transport.ts`; `apps/api/test/smtp-transport.spec.ts` — 14 tests |
| Push | **A real push path, with the device registry it needed.** `PushDevice` (migration `20261109170000_add_push_devices`, applied, zero drift), `POST …/notifications/devices` and `…/devices/revoke`, and an Expo push transport that batches one ticket per live token and fails a fully-rejected send so the outbox retries. A revoked token is never resurrected implicitly; a token moving to another account is moved, not duplicated. | `expo-push.transport.ts`, `notification-devices.ts`, `notification-devices.service.ts`; `expo-push-transport.spec.ts` (8) + `notification-devices-rules.spec.ts` (9) |
| Stale e2e | **The two pre-LEG-7 assertions are corrected.** `freelance-lifecycle` now expects the single net-profit line per owner (C/A 501 / 502) instead of the removed box numbers 21–24, and asserts the gross/expense lines no longer exist; `tax-lifecycle-full` no longer pins the guide at four sections. | `apps/api/test/*.e2e-spec.ts` |

**Verification (this machine).** **620 / 620 unit tests** across **51 spec files** and **53 / 53 API e2e tests** across **6 suites**; `tsc -p
tsconfig.test.json` exit 0; `tsc -p tsconfig.render.json` exit 0; `node .tools/syntax_check.cjs`
exit 0. Migrations: **12**, `prisma validate` valid, `migrate diff --exit-code` on PostgreSQL 18.4
reports **no difference**.

**Still not run, and why.**

| Item | Blocking fact |
|---|---|
| ~~API e2e~~ | **Now run** — see “The API actually runs” above. |
| **Mobile on a device — BUILDS.** `cd apps/mobile && npm run build` bundles iOS (957 modules) and Android (954) to Hermes bytecode; the earlier blocker was a truncated `caniuse-lite` copy, not the expo package. A device/simulator run still needs hardware this machine does not have. |
| Browser rendering | No Next build was run; the web components are typechecked through `tsconfig.render.json` and the render specs. |

**Recorded, not changed.** Foreign income on a fact is still expressed through its field key rather
than a first-class `nature` column; the Form 100F still has no foreign sheet, so the package names
the sheet instead of emitting a case. The 2026 CIC bands and the loi 8775 épargne-logement limit
remain parked exactly as the ninth pass recorded — no figure was invented.

---

---

## 2026-11-09 — ninth pass: every residual gap closed except R6 / R7

This pass closes the residuals that the earlier sections recorded as “still open”. R6 (2026 CIC
bands) and R7 (épargne-logement age limit) stay parked on projet de loi 8775 — no figure was
invented.

| # | Delivered | Evidence |
|---|---|---|
| LEG-2 | **Per-child Art. 122 / 123bis history.** `packages/tax-engine/src/child-relief.ts` resolves a list of children: two-year expiry window, at most **two bonifications per child**, no dégrèvement and bonification for the same child in the same year, and the **2025–2026 résidence-alternée** rule (alternating residence + joint parental authority + allowance received here). Invalid entries are excluded **with a named warning**, never silently. `childReliefHistory` overrides the three scalar counts; the age-old scalar path still works when the list is absent. Wired through contracts, zod (max 20 children), `CalculationsService` and a per-child editor in the questionnaire. | `packages/tax-engine/test/child-relief.spec.ts` (11 tests); `param-wiring.spec.ts` still green |
| Foreign credit | **Per country / per holding caps.** Each credit-method country (and each security holding) is capped at the Luxembourg tax attributable to it; the aggregate slice let a high-foreign-tax country consume another country’s unused headroom. Total still bounded by the cote and by the foreign tax paid. A single slice reproduces the old result exactly. | `packages/tax-engine/test/foreign-credit.spec.ts` (3 tests); the existing LEG-4 cap test is unchanged |
| Member selection | **No positional member selection left.** Filing package, annex PDF and freelance demo now resolve members through `selectFilerMembers` (acting filer, never a VIEWER). A CO_FILER-generated package now uses their own taxpayer column (review F1). | `filing.service.ts`, `annex-pdf.service.ts`, `freelance.service.ts` |
| Form 100F | **DS 1553 is the covered total, not the forfait.** New `deductions.specialExpensesCovered` (Art. 111 + ASRD + 111bis + épargne-logement) feeds the case; when the Art. 113 minimum is higher it is emitted as an INSTRUCTION instead of overwriting the total. Art. 91 liberal profession is routed to **page 6 sheet I (601–651 / 6108–6110)** through the `professionalRevenue` / `professionalExpense` fact keys, with C/A 501 reserved for Art. 14 commercial profit. Bare multi-letter certificate codes (`ZZ`, `FDD`) now warn instead of vanishing. The view renders INSTRUCTION/COMPUTED badges, the person name and the unmapped-code list, and no longer offers “Copy” for an instruction. | `form100-case-map.ts`, `filing.service.ts`, `certificate160.ts`; `packages/tax-engine/test/certificate-codes.spec.ts` (4 tests) |
| Display | 111bis clamp now warns (`2 souscripteurs, 1 assessed person`); `class2WithoutSpouse` is carried in the DTO and the calculator header says “Class 2 without spouse (Art. 119 n° 3)”; the credits card is capped at the tax due, so it no longer claims a non-refunded credit was applied; the refund banner names the CIM when nothing was withheld; the LEG-8 `comparable` comment and warning now say **married** Class 2 couple (a PACS couple is not silently called non-Class-2). | `engine.ts`, `calculations.service.ts`, `TaxCalculatorView.tsx`, `packages/contracts/src/tax.ts` |
| Notifications | `dedupeKey` column + `20261109140000_add_notification_dedupe` migration (authored, **not applied** here); a repeat emission returns/ignores the existing row. `SECURITY_ALERT` can no longer be muted (service **and** zod). Fan-out can be restricted by role, so `APPROVAL_REQUESTED` no longer reaches a VIEWER. Return-ready and package-generated notifications exclude the actor. Household-level rows (null workspace) are listable and markable. `actionUrl` is the real `/<householdId>/dashboard`. A late preferences response after a workspace switch is dropped. New emitters: invitation (existing account), approval invalidated, document shared/confirmation required. | `notifications.service.ts`, `notification.schema.ts`, `NotificationCenter.tsx`, `ReturnApprovalsService`, `HouseholdsService`, `DocumentsService`; `notification-rules.spec.ts` still green |
| Notifications — outbox | **Transactional outbox with retry.** `notification_deliveries` (one row per notification × channel, `20261109160000_add_notification_outbox`) is written beside every in-app row; `NotificationOutboxService` claims due rows (`PENDING` → `SENDING`, so two replicas cannot both send), calls the adapter and retries with **1 min → 5 min → 25 min → 1 h** backoff, five attempts, then `FAILED`; a claim older than **10 minutes** is presumed orphaned by a crashed worker and is reclaimed; a channel without a transport is `SKIPPED` with a reason. `EmailAdapter` ships a local JSONL transport (swap `useTransport()` for SMTP/SES), `PushAdapter` is opt-in. The poller is off unless `NOTIFICATION_OUTBOX_ENABLED=true`. **Deadline reminders** (`NotificationRemindersService`) sweep open assessments inside a 30-day objection window and emit `DEADLINE_REMINDER` with a per-day dedupe key; off unless `NOTIFICATION_REMINDERS_ENABLED=true`. | `notification-delivery.ts`, `notification-outbox.service.ts`, `notification-reminders.service.ts`, `adapters/*`, `notifications.module.ts`; `apps/api/test/notification-delivery.spec.ts` (14 tests) |

**Independent review (round 1, `audit/review-final-2026-11-09.md`).** Six must-fix findings, all fixed before
this section was written: (1) a result stored before `credits`/`deductions` existed crashed the calculator and
printed DS 1553 = 0 — the view now offers a recalculation instead of dereferencing the missing objects, and
the package emits an INSTRUCTION when the snapshot has no breakdown; (2) the per-child history drove the relief
but not the CIM gate or the deduction caps — the engine now uses `moderationCount` for CIM, the mortgage/ASRD
multiplier and the Class 1a check, and the service derives the count from the history before resolving the class;
(3) summed marginal foreign-credit caps over-credited — each country is now capped at the **Art. 134bis fraction**
(`cote × country income / taxable`), and the LEG-4 test was corrected to that rule; (4) a non-assimilated
non-resident’s itemised foreign income was added to the base while the warning said it was excluded — it is now
ignored, with an explicit warning; (5) the annex PDF was not actor-aware while the package was — the controller
passes the acting user and both use the same selection; (6) `unsupportedCertificateCodes` vanished on reload —
`unsupportedCodesJson` persists it and the GET returns it. Also fixed: a promoted CO_FILER now pairs with the
real PRIMARY_FILER, a new history row defaults to “allowance received”, the refund banner names both components,
and `createForUser` survives a concurrent duplicate.

**Recorded, not changed:** the imputation order between the refundable CIM and the non-refundable Art. 122/123bis
relief (the research does not settle it; each child is worth EUR 922.50 at stake), and foreign income is still not
split by nature (S/P/CM/L) because the app has no per-fact foreign nature and the 100F has no foreign sheet.

**Database verification (this machine).** The Prisma datasource was missing its `url` — the API could not have connected at all; it is now `env("DATABASE_URL")`. On PostgreSQL 18.4, a fresh database `luxtax_migration_check_20261109` received **all 11 migrations** (`prisma migrate deploy`: “All migrations have been successfully applied”), `prisma validate` passes, `migrate status` reports the schema up to date and `migrate diff --exit-code` returns **no difference**. That covers the three migrations this pass authored (notification dedupe, unsupported codes, outbox) and the eight earlier ones; the existing `luxtax` database predates `_prisma_migrations` and must be baselined before `migrate deploy`.

**Verification (this machine):** **563 / 563 tests** across **46 spec files**; `tsc -p tsconfig.test.json`
exit 0; `tsc -p tsconfig.render.json` exit 0 (JSX layer); `node .tools/syntax_check.cjs` exit 0 with the
four new files added to its list.

**What this pass could not do, and why.**

| Item | Blocking fact |
|---|---|
| API e2e (`tax-lifecycle-full`, `admin-governance`, `household-collaboration`, `freelance-lifecycle`, `receipt-scanning`) | `@nestjs/*` and the generated Prisma client are absent; `pnpm install` hangs in this environment before linking. The code is transpiled and reviewed, not executed against a database. |
| API e2e against the migrated database | Migrations are applied and drift-free (below), but `@nestjs/*` and `@prisma/client` still cannot be installed here, so no endpoint was executed. |
| **Mobile on a device — BUILDS.** `cd apps/mobile && npm run build` bundles iOS (957 modules) and Android (954) to Hermes bytecode; the earlier blocker was a truncated `caniuse-lite` copy, not the expo package. A device/simulator run still needs hardware this machine does not have. |
| A real push provider / SMTP account | The outbox, retry and adapters are implemented; e-mail defaults to a **local JSONL sink** and push is **not configured** until a provider is wired (`useTransport`) and a device-token store exists. `NOTIFICATION_PUSH_ENABLED=true` turns the local push sink on for a smoke test. |
| Foreign income split by nature (S/P/CM/L) | The 100F has no foreign sheet and the app has no per-fact foreign nature; the package emits an INSTRUCTION naming the relevant sheets and RD 1081/1082 rather than guessing a case. |
| Legacy snapshots / audit rows | No database here; stored results written before this pass keep their old shape (`specialExpensesCovered` absent, no `class2WithoutSpouse`). |

## 2026-11-08 — second gap-closure pass (P0)

Four independent audits — `audit/audit-legal.md`, `audit/audit-api.md`, `audit/audit-product.md`, `audit/audit-mobile.md` — were run against the 48-test baseline. They found three P0 defects and the P1/P2 gaps listed at the end of this section. Scope and acceptance: `audit/implementation-plan-2026-11-08.md`.

| # | Delivered | Evidence |
|---|---|---|
| LEG-1 | The solidarity surcharge (fonds pour l'emploi) was computed in cents and added to a euro total, overstating the final liability on every ordinary return. Fixed in `engine.ts`: the ordinary branch now divides by 100, like the two Art. 3ter branches. Final-liability regression tests added: Class 1 €60k, Class 2 €100k, Class 1a €26,460 and the 7 % / 9 % thresholds. | `audit/impl-engine-auth.md` §1–§3; review round 1 PASS; removing the `/100` fails 4 of the 5 new tests |
| API-1a | `/api/admin/**` now requires an `ADMIN_EMAILS` allowlist (`PlatformAdminGuard`) and fails closed when the variable is unset. **Interim allowlist gate, not the nine-role RBAC.** | `impl-engine-auth.md` §1; 5 unit tests in `platform-admin.spec.ts` |
| API-1b | Household write roles enforced: `VIEWER` can no longer upload, confirm or edit facts, approve, generate the package, import an assessment or roll over; invitations are restricted to `CO_FILER`/`VIEWER` (a `PRIMARY_FILER` invite is a 400); freelance profile and demo writes are filer-only. | `impl-engine-auth.md`, `impl-review-fixes.md` §2.2–§2.4 |
| API-2 / PROD-1 | Private drafts enforced end to end: user-aware fact reads; calculation, filing package and freelance metrics include a fact only from a `PROPOSED_FOR_RETURN`/`INCLUDED_IN_RETURN` document; upload is forced to `PRIVATE_DRAFT` and a spoofed `ownerId`/`visibility` is a 400; private facts are redacted from the household activity feed; deleting a private source no longer turns the fact into a shared manual fact; `deleteFact` is ownership-guarded; web uploads go private then `PATCH` the chosen visibility, and warn when a fact is saved but not included. | `impl-privacy.md`, `impl-integration.md`, `impl-review-fixes.md`; review round 2 allPass |

**Verification (this machine):** 70 tests pass (46 engine + 7 annex PDF + 5 platform-admin + 12 fact-visibility), `tsc -p tsconfig.test.json` exit 0, `node .tools/syntax_check.cjs` 27 files `ok`.

**API e2e was not run.** `@nestjs/*`, the generated Prisma client and Postgres are absent, so the admin guard, the `@Roles` branch, the privacy filters and the new e2e assertions are verified by review and transpile only. A DB-enabled run of `tax-lifecycle-full`, `admin-governance`, `household-collaboration`, `freelance-lifecycle` and `receipt-scanning` is still required; `freelance-lifecycle` step 5 is expected to fail on stale Form 100 box numbers (`impl-integration.md` §5.4).

**Independent review:** round 1 (`audit/review-round1.md`) passed LEG-1 and API-1 and held API-2/PROD-1 as partial — blocker B1 (private fact amounts readable in the household activity trail) plus M1–M4. All five were fixed (`impl-review-fixes.md`); round 2 (`audit/review-round2.md`) returned **allPass = true** for newly created data.

**Still open after this pass — not fixed, not claimed:**

| Track | Open items |
|---|---|
| Legal / engine | LEG-2 Art. 122 dégrèvement / Art. 123bis bonification (€922.50/child) has no code path · LEG-3 CIM unreachable for divorced/widowed and not refunded when it exceeds tax · LEG-4/5 foreign-taxed securities double-count, and Art. 3ter drops exemption-with-progression and the foreign credit · LEG-6 three-year Class 2 window · LEG-7 certificate 160 / Form 100F maps partial · LEG-8 no Class 2 vs 2×Class 1 comparison |
| API / data | API-3 `HouseholdGuard` fails open and `confirmFact` accepts a foreign workspace · API-4 no notifications · API-5 approval invalidation only on fact edits · API-6 no filing record or objection dates · API-7 package hash overwritten, no evidence index · API-8 no rate limiting or MFA · API-9 no calculation history |
| Mobile | MOB-1..11 — wrong workspace ids in upload/calculation/approval, no push, deep links, offline queue, biometric gate or package download; `apps/mobile` is outside the workspace build |
| External | 2026 CIC monthly table and the loi 8775 text are still unpublished; both remain gated and return 0 / warn |
| Legacy data | Audit rows and private-draft facts written before this pass are not backfilled; a DB-enabled e2e run is still required |

Also recorded by the audits and not selected: LEG-9 (a 2028 workspace can still produce a filing package), LEG-10 (prime jeune salarié), API-10 (audit immutability and event taxonomy), PROD-2 (a `VIEWER` still counts as a required approver), PROD-5 and PROD-9.

---

## 2026-11-08 — third pass: P1 legal gaps (LEG-2…LEG-5)

The four P1 legal findings left open by the second pass were implemented and independently reviewed. This section supersedes the LEG-2…LEG-5 rows of the second pass’s “Still open” table; that table is kept as history.

| # | Delivered | Evidence |
|---|---|---|
| LEG-2 | Art. 122 dégrèvement and Art. 123bis bonification at €922.50 per child. The dégrèvement is non-refundable — capped at the tax still due — and is driven by a per-child count (`moderatedChildrenWithoutBenefit`), not a household boolean. The bonification phases out between RIA €67,400 and €76,600, and the income cap is lifted from six children generating a moderation or bonification. Constants live only in the rule package (`childRelief`, inherited by 2026 and 2028), both formulas are pure functions (`degrevementForChildren`, `bonificationForChildren`), and the engine emits `LIR-ART-122` / `LIR-ART-123bis` provenance plus a warning when the counts exceed the declared children. Wired through contracts, validation, `CalculationsService`, the questionnaire count input and the calculator rows. | `audit/impl-leg2.md` §1–§8; `audit/review-leg2-round2.md` — allPass = true, M1 and C2/C4–C6 fixed |
| LEG-3 | The CIM is reachable for SINGLE, DIVORCED and WIDOWED parents with a moderated child. `apps/api/src/modules/calculations/class-resolution.ts` resolves marital status, moderated children and the single-parent default once per calculation, so class 1a and the CIM gate are derived from one resolved household situation. The credit is split into `cimApplied` (imputed against the cote) and `cimRefund` (the excess paid out, Art. 154ter al. 2); the refund enters `balancePayableOrRefund`, and the summary card subtracts `cimRefund` so the credit is not counted twice. | `audit/impl-leg3.md` §1–§8; `audit/review-leg3-round2.md` — allPass = true, M1 and M2 fixed; 11 tests in `apps/api/test/class-resolution.spec.ts` |
| LEG-4 | Foreign-taxed securities no longer enter the taxable base twice. The securities ledger adds the taxable amount to the base once and to a separate `securitiesCreditIncome` accumulator that drives the foreign-credit slice; `netIncome`, `taxableIncome` and `baseTax` are now identical with and without a foreign withholding on the same holding, and only the credit changes. | `audit/impl-leg4-leg5.md` §1, §3; `audit/review-leg4-leg5.md` — allPass = true |
| LEG-5 | Foreign income under Art. 3ter individual assessment (pure or reallocation) now returns an explicit `unsupported` entry and a matching warning for both the credit method and the exemption method, instead of silently dropping the relief. Collective assessment is unchanged and still computes the credit. | `audit/impl-leg4-leg5.md` §1, §3; `audit/review-leg4-leg5.md` — allPass = true |

**Verification (this machine):** 103 tests pass across five suites (engine, 7 annex PDF, 5 platform-admin, 12 fact-visibility, 11 class-resolution), `tsc -p tsconfig.test.json` exit 0, `node .tools/syntax_check.cjs` 28 files `ok`, exit 0.

**API e2e and browser rendering were not run.** `@nestjs/*`, the generated Prisma client and Postgres are absent, and the web apps have no installed React/Next dependencies. The service mapping, the questionnaire input and the calculator rows are verified by transpile and review only; `calculations.service.ts` sits outside `tsconfig.test.json`, so `tsc` does not cover it. Stored snapshots written before this pass are not backfilled: an old `calculationResult` has no `childRelief`, `cimApplied` or `cimRefund`; the calculator hides the child-relief group and reads the CIM values as zero until the household recalculates.

**Still open after this pass — not fixed, not claimed:**

| Track | Open items |
|---|---|
| Legal / engine | LEG-6 Art. 119 n° 3 b–c three-year Class 2 window · LEG-7 certificate 160 / Form 100F mapping partial · LEG-8 no Class 2 vs 2×Class 1 comparison · LEG-2 per-child history: at most two bonifications per child and the résidence-alternée rule are still not modelled, and the engine cannot tell that the same child was counted in both reliefs — it only warns when the counts exceed the declared children · the foreign credit remains one aggregate slice, not a per-holding or per-country cap |
| Display | The summary card labels the non-refunded credit as applied when the cote is zero (LEG-3 review W1); the refund banner still attributes a CIM refund to withholding when nothing was withheld (LEG-3 review W4) |
| API / data | API-3…API-9 unchanged: `HouseholdGuard` fails open and `confirmFact` accepts a foreign workspace; no notifications; approval invalidation only on fact edits; no filing record or objection dates; package hash overwritten and no evidence index; no rate limiting or MFA; no calculation history |
| Mobile | MOB-1..11 unchanged; `apps/mobile` is outside the workspace build |
| External | The 2026 CIC monthly table and the loi 8775 text are still unpublished; both remain gated and return 0 / warn |
| Legacy data | Pre-pass snapshots and audit rows are not backfilled; a DB-enabled e2e run is still required |

Also recorded and not selected: LEG-9, LEG-10, API-10, PROD-2, PROD-5, PROD-9 — see the second-pass section.

---

## 2026-11-08 — fourth pass: LEG-6 + API-3

LEG-6 (the last open P1 on class assignment) and API-3 (a guard that failed open) were implemented, and LEG-6 cleared independent review in round 5. This section supersedes the LEG-6 row and the API-3 mention in the third pass’s “Still open” table; that table is kept as history.

| # | Delivered | Evidence |
|---|---|---|
| LEG-6 | Art. 119 n° 3 b–c three-year Class 2 window. Three questionnaire inputs — `spouseDeathYear`, `divorceOrSeparationYear`, `class2BeforeEvent` (contracts + zod, years bounded 1900–2100) — feed `isInClass2Window` in `class-resolution.ts`: `elapsed = taxYear − eventYear` inside `[0, 3]` keeps Class 2 for a widow(er) and, with `class2BeforeEvent`, for a divorced filer; a future event year is outside the window. A missing year falls back to the default class and raises `classWindowWarning` (“the three-year Class 2 window … cannot be checked”). A spouse-less Class 2 filer is no longer downgraded: `class2WithoutSpouse` keeps the Art. 121 tariff (`2 × Tarif(RIA/2)`) while the couple’s collective extras are removed — Art. 111 / épargne-logement / mortgage multiplier, 960 FDS, AEP, doubled Art. 115 n° 15 tranche. Member selection is role-aware (`selectFilerMembers(members, actorId)`): the acting filer is preferred, a `VIEWER` is never a spouse, and a WIDOWED / DIVORCED status ends the spouse link even when a stale `ACTIVE` `CO_FILER` row survives. The Art. 111bis contributor count is clamped to the assessed persons (`resolveArt111bisContributors`), so a stale couple answer cannot double a single filer’s cap: €3,200 / €4,500 for one person, €6,400 / €9,000 for a couple. Class re-derivation is preserved: when a tax profile exists the stored class is ignored, so a stale persisted class cannot freeze the old one. | `audit/impl-leg6.md` §1–§12; `audit/review-leg6-round5.md` — allPass = true, must-fix 0, one worth-considering item (the clamp is silent on the DTO and in the form); 28 new tests (20 in `class-resolution.spec.ts`, 8 in `tax-engine.spec.ts`) |
| API-3 | `HouseholdGuard` is deny-by-default: it resolves the household from `:id`/`:householdId` or from the route `:workspaceId`'s workspace row, ignores body-supplied `householdId`/`workspaceId`, rejects a malformed workspace UUID with 403, and throws `ForbiddenException` when no household context resolves instead of `return true`. A victim workspace UUID plus an attacker-chosen body household id now returns 403; e2e cases cover `POST …/calculate` and `GET …/calculation`. | `audit/impl-api3.md` §2–§5; `audit/review-api3-round2.md` — allPass = true; route audit of the nine guarded controllers — no `@NoHousehold()` escape hatch was added |

**Verification (this machine):** 131 tests pass across five suites (engine 76, annex PDF 7, platform-admin 5, fact-visibility 12, class-resolution 31 — 21 suites), `tsc -p tsconfig.test.json` exit 0, `node .tools/syntax_check.cjs` 29 files `ok`, exit 0.

**API e2e and browser rendering were not run.** `@nestjs/*`, the generated Prisma client and Postgres are absent, and the web apps have no installed React/Next dependencies. `calculations.service.ts` and `household.guard.ts` are outside `tsconfig.test.json`, so `tsc` does not cover them: the service chain (selection → spouse nulling → class → flag → contributor count) is verified by inspection plus throwaway probes that mirror it, and the API-3 cases by transpile plus a guard stub harness (19/19, fails on the pre-fix code). The questionnaire schema was not executed either (`zod` is not installed), so the 1900–2100 bounds and the conditional fields are inspection-only. Stored snapshots are not backfilled: a pre-pass `calculationResult` keeps its old class and deduction values until the household recalculates.

**Still open after this pass — not fixed, not claimed:**

| Track | Open items |
|---|---|
| Legal / engine | LEG-7 certificate 160 / Form 100F maps partial · LEG-8 no Class 2 vs 2×Class 1 comparison · LEG-2 per-child history: at most two bonifications per child, résidence alternée, and the same child counted in both reliefs — warning only · the foreign-credit cap is still one aggregate slice, not per holding or per country · the filing annex and freelance services still select members positionally (`annex-pdf.service.ts:48`, `freelance.service.ts:271-273`) |
| Display / reporting | LEG-6 review W1: the DTO and the questionnaire still show “1 or 2” 111bis souscripteurs for a widow(er), so the clamp is invisible · `assessmentMode` still reports `COLLECTIVE` for a spouse-less Class 2 filer (label only, amount unaffected) · LEG-3 review W1 (the card labels the non-refunded credit as applied when the cote is zero) and W4 (the refund banner names withholding when the refund is the CIM) |
| API / data | API-4 no notifications · API-5 approval invalidation only on fact edits · API-6 no filing record or objection dates · API-7 package hash overwritten and no evidence index · API-8 no rate limiting or MFA · API-9 no calculation history. API-3 is closed above; the cross-workspace `confirmFact` write was already closed by the privacy pass |
| Mobile | MOB-1..11 unchanged; `apps/mobile` is outside the workspace build |
| External | The 2026 CIC monthly table and the loi 8775 text are still unpublished; both remain gated and return 0 / warn |
| Legacy data | Pre-pass snapshots and audit rows are not backfilled; a DB-enabled e2e run is still required |

Also recorded and not selected: LEG-9, LEG-10, API-10, PROD-2, PROD-5, PROD-9 — see the second-pass section.

---

## 2026-11-08 — fifth pass: LEG-8 scenario comparison

LEG-8 — the last open legal item — was implemented and cleared independent review in round 2 (`allPass: true`). This section supersedes the LEG-8 row of the fourth pass’s “Still open” table; that table is kept as history.

| # | Delivered | Evidence |
|---|---|---|
| LEG-8 | Class 2 vs 2 × Class 1 vs Art. 3ter reallocation, end to end. `ScenarioComparisonDto` carries the tax year, the rule-package version, the three runs (`COLLECTIVE`, `INDIVIDUAL_PURE`, `INDIVIDUAL_REALLOCATION`) of `TaxCalculationResultDto`, the two deltas against the collective run, `comparable` and the merged warnings. `LuxembourgTaxEngine.compareAssessmentModes(params)` is pure: three `calculate` calls on shallow copies with the mode overridden, caller params not mutated (asserted by test). `CalculationsService.calculateTax(..., options?: { assessmentMode?, persist? })` reuses the existing fact filter, spouse/class resolution and questionnaire mapping — `loadWorkspace` was extracted, not copied. `compareScenarios(workspaceId, actorId)` runs the three modes non-persisting and builds the DTO with cent-rounded deltas. `GET /api/workspaces/:workspaceId/scenario-comparison` sits behind the same `JwtAuthGuard` + `HouseholdGuard` as the calculate routes and is GET-only. `compareScenarios` in `packages/api-client` and a “Scenario comparison” card in `TaxCalculatorView` show the three final liabilities, both deltas, the year/package, the warnings, the estimate caveat and the Art. 3ter 31 December N+1 deadline note. | `audit/impl-leg8.md` §1–§6; `audit/review-leg8-round2.md` — allPass = true, must-fix 0, 2 worth-considering, 5 record-only |
| LEG-8 (comparability + persist guard, round 2) | `comparisonEligible` is derived from `maritalStatus`, the resolved class and the *assessed* spouse (`Boolean(spouseMember)`): true only for a **married Class 2 couple with an assessed spouse**. A widow(er) inside the Art. 119 n° 3 window, a divorced filer, a PACS couple and a married filer without a joined `CO_FILER` therefore get `comparable: false`, and the card renders “Only a Class 2 couple can compare these scenarios.” instead of the table. `isScenarioComparisonEligible` and `shouldPersist` are pure helpers in `class-resolution.ts`; the workspace update and the `TAX_CALCULATED` audit write both sit inside `if (shouldPersist(options))`, so a comparison cannot overwrite `calculationResult`, `estimatedTaxBalance` or `status`. Six new tests cover the eligibility matrix and the persist guard. | `audit/impl-leg8.md` §6; `audit/review-leg8-round2.md` §1a — four VERIFY items pass, matrix probe reproduces the service composition |

**Verification (this machine):** 140 tests pass across five suites (engine 79, annex PDF 7, platform-admin 5, fact-visibility 12, class-resolution 37 — 24 suites), `tsc -p tsconfig.test.json` exit 0, `node .tools/syntax_check.cjs` **31 files** `ok`, exit 0.

Probe on the 2025 package, one 60,000 + 40,000 couple: collective €13,381.21, pure €14,335.65, reallocation €13,363.02, deltas −€954.44 and +€18.19. These are observation, not golden assertions; the three new engine tests assert mode wiring, package identity and non-mutation.

**API e2e and browser rendering were not run.** `@nestjs/*`, the generated Prisma client and Postgres are absent, and the web apps have no installed React/Next dependencies. `calculations.service.ts` and `calculations.controller.ts` are outside `tsconfig.test.json`, so the new wiring (`Boolean(spouseMember)` → `comparisonEligible` → `comparable`, and the `shouldPersist` branch) has transpile, inspection and helper-probe evidence only. **No test executes `calculateTax` or `compareScenarios`**: reverting `comparable` to the old class-only predicate keeps 140/140 green. The regression test to add with a runnable stack is a widow workspace → `comparable: false` plus a non-persisting run leaving `calculationResult` untouched. Comparisons are not audited by design (no event type for “comparison viewed”).

**Still open after this pass — not fixed, not claimed:**

| Track | Open items |
|---|---|
| Legal / engine | LEG-7 certificate 160 / Form 100F maps partial · LEG-2 per-child history: at most two bonifications per child, résidence alternée, and the same child counted in both reliefs — warning only · the foreign-credit cap is still one aggregate slice, not per holding or per country · the filing annex and freelance services still select members positionally (`annex-pdf.service.ts:48`, `freelance.service.ts:271-273`) |
| LEG-8 residuals | The `comparable` comment in `packages/contracts/src/tax.ts` still states the class-only rule, and the non-comparable warning still claims a PACS couple gets three identical results — wrong for a PACS couple assessed collectively (review round 2 W1/W2; wording only, the flag is correct) · the compare button renders for every household, so a single filer spends three server calculations to be told the table does not apply · the card cannot vary the reallocation share (it uses the questionnaire’s `reallocationPercentPrimary`) · PACS loses the reallocation comparison it may legally elect — the brief’s choice, not a regression |
| Display / reporting | LEG-6 review W1: the DTO and the questionnaire still show “1 or 2” 111bis souscripteurs for a widow(er), so the clamp is invisible · `assessmentMode` still reports `COLLECTIVE` for a spouse-less Class 2 filer (label only, amount unaffected) · LEG-3 review W1 (the card labels the non-refunded credit as applied when the cote is zero) and W4 (the refund banner names withholding when the refund is the CIM) |
| API / data | API-4 no notifications · API-5 approval invalidation only on fact edits, no version history · API-6 no filing record or objection dates · API-7 package hash overwritten and no evidence index · API-8 no rate limiting or MFA · API-9 no calculation history |
| Mobile | MOB-1..11 unchanged; `apps/mobile` is outside the workspace build |
| External | The 2026 CIC monthly table and the loi 8775 text are still unpublished; both remain gated and return 0 / warn |
| Legacy data | Pre-pass snapshots and audit rows are not backfilled; a DB-enabled e2e run is still required |

Also recorded and not selected: LEG-9, LEG-10, API-10, PROD-2, PROD-5, PROD-9 — see the second-pass section.

---

## 2026-11-08 — sixth pass: LEG-7 certificate 160 + Form 100F case map

LEG-7 was implemented and cleared independent review in round 2 (`allPass: true`, 0 must-fix, 5 worth considering, 8 record-only). This section supersedes the LEG-7 row of the fifth pass’s “Still open” table; that table is kept as history.

| # | Delivered | Evidence |
|---|---|---|
| LEG-7 — certificate 160 table | `packages/tax-engine/src/forms/certificate160.ts` (new, dependency-free): one row per code with French and German labels, the engine category and `fieldKey`, and a `supported` flag. Mapped: 101 and 102 (gross salary), 103 (social contributions), 105 (withholding), 141 (mortgage interest), S (salary), P (pension), LRCP. Explicitly unsupported, each with a note: C and R (section-A gross-pay component; prior-year arrears under Art. 132 timing) and the withholding-base letters FD / FO / FFO / DS / FDS / CE / AC. Anything else is “not supported”. `normalizeCertificate160Code` strips one `code_` prefix and upper-cases, so `code_101`, `CODE_101` and padded input all resolve. | `audit/impl-leg7.md` §1–§2, §8.1; `audit/review-leg7-round2.md` §1 |
| LEG-7 — engine resolution | `engine.ts` resolves the code before the category switch. A supported code replaces the stored category and `fieldKey`, so `code_101`/`S` reach `grossSalary` and `LRCP` reaches the LRCP deduction even when stored as `OTHER_DEDUCTION`. An unsupported or unknown code emits a warning naming the code and the fact id, then skips the fact instead of dropping it silently. Any bare letter A–Z is certificate-shaped, so an unmapped letter warns rather than falling through the switch. `factIds` are pushed only for facts that mapped. | `audit/impl-leg7.md` §2, §8.1; 11 new engine tests across the two rounds (round 1: code_101/103/105, code_141, code_999, code_FFO; round 2: C, R, bare X, 102, S/P, LRCP, canonical keys) |
| LEG-7 — Form 100F case map | `apps/api/src/modules/filing/form100-case-map.ts` replaces sheet-only labels with official page / sheet / case rows: S 701 (salary), S 730/742 (forfaits), DS 1601 (social), 1471 (Art. 111), 1503 (111bis), 1525 (épargne-logement), 1553 (forfait dépenses spéciales), 1609 (LRCP), 1611 (dons), RD 1901/1903 (withholding), P 801 (pension), CM 901 (capital), L 1001/1033 (rental, mortgage), CE 1715 (childcare), Enfants 228 (CIM request), Recap 0621 (AEP), C/A 501/502 (net freelance profit). The round-1 table had 22 entries; review removed `foreign` 1101 (the substantial-participation gains line) and `businessExpense` 502 (the spouse profit column). Spouse columns 702 / 1602 / 1902 / 802 / 1904 / 902 / 1002 / 502 are chosen from the fact owner, and `personName` is filled from the member profile or e-mail. | `audit/impl-leg7.md` §3–§4, §8.2–§8.3; `audit/review-leg7-round2.md` §1, §5 |
| LEG-7 — package output | Every `FORM_100` box carries a numeric case and the old hard-coded page/sheet numbers are gone. The six ACD-computed credits (CIS, CI-CO2, CIP, CII, CISSM, start-up) are `kind: COMPUTED` on page 20 / `Recap` / `computed`; the CIM left that loop and is a real request box on Enfants 228. Foreign income emits no 1101 box: it is an `INSTRUCTION` on RD 1081/1082 (the credit line), carrying the amount and source fact for traceability. Freelance revenue and expenses net per owner into one 501/502 line labelled Art. 14/91; a loss writes `0.00` plus an Art. 114 carry-forward `INSTRUCTION`. Canonical OCR keys (`grossSalary`, `socialSecurity`, `withholdingTax`) also push the 101/103/105 control lines. `FilingPackageView` renders “sheet · case”, falls back to `boxNumber` / `n/a` for packages generated earlier, and the guide steps follow the new pages ([5,7,8,9,10,11] income, [14,15,16,17] expenses, 19/20 recap). | `audit/impl-leg7.md` §4, §8.4; mock-Prisma probe in §8.6 |

**Verification (this machine):** 158 tests pass across six suites (engine 90, annex PDF 7, platform-admin 5, fact-visibility 12, class-resolution 37, Form 100 case map 7 — 26 suites), `tsc -p tsconfig.test.json` exit 0, `node .tools/syntax_check.cjs` **32 files** `ok`, exit 0.

**API e2e and browser rendering were not run.** `@nestjs/*`, the generated Prisma client and Postgres are absent, and the web apps have no installed React/Next dependencies. `filing.service.ts` sits outside `tsconfig.test.json`, so the case wiring is covered by `syntax_check` (transpile) plus a mock-Prisma probe — not by a project typecheck or a database. `unsupportedCertificateCodes` is not persisted (no schema change), so a package read back from the database has no such field; the engine warning on the calculation screen is the only user-visible notice. The 101/102/103/105/141 numeric codes are still brief-supplied: the paper 160F prints only letters, so the table is not yet proven to be the complete official numeric list. The page/sheet pairing for the 100F rows is not machine-verified either — only the existence of the 22 case numbers in `100f-2025.pdf` was.

**Still open after this pass — not fixed, not claimed:**

| Track | Open items |
|---|---|
| Legal / engine | LEG-2 per-child history: at most two bonifications per child, résidence alternée, and the same child counted in both reliefs — warning only · the foreign-credit cap is still one aggregate slice, not per holding or per country · positional member selection remains in `annex-pdf.service.ts:48` and `freelance.service.ts:271-273` |
| Form 100 / 160 residuals | Category-level line precision: `1553` is emitted at category level and Art. 14 versus Art. 91 profit is not distinguished; foreign income is not split by category sheet (S/P/CM/L). Review F1: the filing service derives taxpayer/spouse from `PRIMARY_FILER`, while the calculation derives it from the acting user, so a `CO_FILER`-generated package swaps the 701/702 column convention (each row still names its owner; no amount lost). Review F3: a bare multi-letter code outside the table (`ZZ`, `FDD`) is still dropped silently; only `code_`-prefixed or single-letter keys warn. Review F4: `INSTRUCTION` rows render like copyable boxes (`kind` has no UI badge). Review F5: `freelance-lifecycle.e2e-spec.ts:450-454` and `tax-lifecycle-full.e2e-spec.ts:760` still assert the pre-LEG-7 package shape and will fail when e2e runs. `unsupportedCertificateCodes` is unrendered; `personName` is not displayed. |
| Display / reporting | LEG-6 review W1 (the 111bis clamp is invisible on the DTO and in the form) · `assessmentMode` still reports `COLLECTIVE` for a spouse-less Class 2 filer · LEG-3 review W1 and W4 · LEG-8 review W1/W2 wording |
| API / data | API-4 no notifications · API-5 approval invalidation beyond fact edits, no version history · API-6 no filing record or objection dates · API-7 package hash overwritten, no evidence index · API-8 no rate limiting or MFA · API-9 no calculation history |
| Service-level tests | No test executes `calculateTax`, `compareScenarios` or `generateFilingPackage`; a runnable stack still needs the calculate/compare service regression and an API e2e run |
| Mobile | MOB-1..11 unchanged; `apps/mobile` is outside the workspace build |
| External | The 2026 CIC monthly table and the loi 8775 text are still unpublished; both remain gated and return 0 / warn |
| Legacy data | Pre-pass snapshots, audit rows and packages generated before this pass are not backfilled; a DB-enabled e2e run is still required |

Also recorded and not selected: LEG-9, LEG-10, API-10, PROD-2, PROD-5, PROD-9 — see the second-pass section.

---

## 2026-11-08 — seventh pass: API-4 notification foundation

API-4 was delivered in two parts — backend (`audit/impl-api4.md`) and web client (`audit/impl-api4-ui.md`) — and cleared independent review with **allPass = true** (0 must-fix, 6 worth considering, 8 record-only) in `audit/review-api4.md`. This section supersedes the API-4 row of the sixth pass’s “Still open” table; that table is kept as history. Scope is a **foundation**: in-app rows, preferences and three hooks. No email, push, outbox, retry or dedupe exists.

| # | Delivered | Evidence |
|---|---|---|
| API-4 — data model and migration | `schema.prisma` adds `NotificationType` (11 values), `NotificationSeverity` (3) and two models. `Notification`: recipient `user` (Cascade), optional `actor` (SetNull), `household` and optional `workspace` (Cascade), `type`, `severity` default `INFO`, `title`, `body`, optional `entityType` / `entityId` / `actionUrl`, `isRead` / `readAt`, timestamps, indexes `(userId, isRead, createdAt)` and `(workspaceId, createdAt)`. `NotificationPreference`: `emailEnabled` / `pushEnabled` default true, `mutedTypes NotificationType[]`, unique `(userId, householdId)`. Migration `20261108140000_add_notifications` holds 2 enum types, 2 tables, 2 indexes, the unique constraint and 6 FKs, and matches Prisma’s generated SQL after whitespace normalisation. **Authored, not applied.** | `audit/impl-api4.md` §2; `prisma validate` on a temp copy; `prisma migrate diff` 13 statements / 53 non-empty lines, 0 diffs |
| API-4 — contracts and validation | `packages/contracts/src/notifications.ts` adds `NotificationDto`, `NotificationListDto` (`items` plus the workspace/user `unreadCount`, not the page count), `NotificationPreferenceDto` (optional `id`, because the default has no row yet) and `UpdateNotificationPreferencesDto`; the enums are mirrored in `packages/contracts/src/enums.ts`. `packages/validation/src/notification.schema.ts` accepts `{}`, optional booleans and a `mutedTypes` array capped at the 11 enum values, so an unknown string is rejected rather than stored. | `audit/impl-api4.md` §3 |
| API-4 — pure rules and tests | `apps/api/src/modules/notifications/notification-rules.ts` (no Nest or Prisma imports): `shouldDeliverNotification` (false only when the type is muted; a `null` preference delivers), `defaultNotificationPreference` (both channels on, no mutes) and `notificationAge` (`just now` … `<n> d ago`, a future timestamp clamps to `just now`, malformed input returns `unknown`). 11 `node:test` cases in `apps/api/test/notification-rules.spec.ts`. | `audit/impl-api4.md` §4, §8; 11 new tests |
| API-4 — service and endpoints | `NotificationsService` with `createForUser`, `emitToHousehold`, `list`, `unreadCount`, `markRead`, `markAllRead`, `getPreferences`, `updatePreferences`. Six routes under `/api/workspaces/:workspaceId/notifications`: list (`unreadOnly=true\|1`), unread count, `PATCH :notificationId/read`, `POST read-all`, `GET`/`PUT preferences`; `JwtAuthGuard` + `HouseholdGuard` at class level, `ParseUUIDPipe` on both ids, zod `safeParse` on the PUT. Every read and write is scoped by `(workspaceId, userId)` or `(userId, householdId)`, so another user’s notification id returns the same 404 as a missing one. `emitToHousehold` loads `ACTIVE` memberships, drops the actor and every muted type in one preference query, then `createMany`; `list` clamps `limit` to 1..100 (default 50). | `audit/impl-api4.md` §5–§6; `audit/review-api4.md` §2 (I2, I3) |
| API-4 — event hooks | `FactsService.confirmFact` emits `MATERIAL_FIELD_CHANGED` only when `!redactAudit && confirmed.isSharedWithHousehold`, never for a private fact and never for the actor. `FilingService.approveReturn` emits `APPROVAL_REQUESTED` while one approval is outstanding and `RETURN_READY_FOR_REVIEW` when both are in; `generateFilingPackage` emits `FILING_PACKAGE_GENERATED` after the package is persisted. Each call goes through a private `safeNotify` that logs `Notification skipped (...)` and swallows the error, so a notification failure cannot roll back or mask the fact, approval or package write. Bodies are static text — no amount, field key, matricule or document name. | `audit/impl-api4.md` §7; `audit/review-api4.md` §2 (I4) |
| API-4 — client and dashboard UI | `packages/api-client` gains six methods (`getNotifications`, `getNotificationUnreadCount`, `markNotificationRead`, `markAllNotificationsRead`, `getNotificationPreferences`, `updateNotificationPreferences`) matching the controller’s return shapes. `NotificationCenter.tsx` is a bell + dropdown in the dashboard header: unread badge capped at `99+`, a 60 s poll, the first 20 rows with a severity dot and a relative-age label, mark-read on click, mark-all-read, and a preferences panel with email/push toggles plus muting for `MATERIAL_FIELD_CHANGED` and `DEADLINE_REMINDER` (any other muted type survives the save). Late list responses are dropped on a workspace switch; the panel copy states that email and push are stored preferences and are not delivered. | `audit/impl-api4-ui.md` §2–§3; `audit/review-api4.md` §2 (I5) |

**Verification (this machine):** 169 tests pass across seven suites (engine 90, annex PDF 7, platform-admin 5, fact-visibility 12, class-resolution 37, Form 100 case map 7, notification rules 11), `tsc -p tsconfig.test.json` exit 0, `node .tools/syntax_check.cjs` **38 files** `ok`, exit 0. Beyond the gates: `prisma validate` accepts the schema on a temp copy, `prisma migrate diff` reproduces the migration exactly (13 statements, 53 non-empty normalised lines, 0 diffs), `tsc -p tmp/tsconfig.probe-api4.json` type-checks the six client methods and the DTOs under `strict` (exit 0), and `node tmp/probe-api4-age.cjs` passes 10 / 10.

**API e2e, database and browser were not run.** `@nestjs/*`, the generated Prisma client, Postgres and the React/Next dependencies are absent, so the API cannot boot and no endpoint, guard path or Prisma query was executed: the service, controller and the three hooks rest on transpile plus inspection. `NotificationCenter.tsx` is transpiled and contract-probed but not type-checked (no `@types/react`) or rendered — polling, dropdown placement and the badge are unobserved. **The migration was not applied**: `20261108140000_add_notifications` must be applied and the Prisma client regenerated before the API starts. **No delivery layer exists** — `emailEnabled` / `pushEnabled` are persisted flags and no email, push, outbox, retry or dedupe is written. Event coverage is partial: the invitation, document-confirmation, missing-document, deadline, approval-invalidation, assessment-follow-up and security-alert emitters are not wired, and `createForUser` — the preference-bypassing path intended for security notices — has no caller. The notification e2e cases to add are listed in `audit/impl-api4.md` §10.

**Still open after this pass — not fixed, not claimed:**

| Track | Open items |
|---|---|
| Notification delivery | Email, push, outbox, retry and dedupe: preferences persist, nothing is sent · no `dedupeKey`, so regenerating a package or approving again writes a fresh row for every member (review R5) · `RETURN_READY_FOR_REVIEW` and `FILING_PACKAGE_GENERATED` include the actor, so a filer notifies themself |
| Notification correctness | `SECURITY_ALERT` is accepted in `mutedTypes` although the schema docstring says it is not offered (R1) · a row written without `workspaceId` cannot be listed or marked, because every route requires a workspace (R2) · a preferences response that lands after a workspace switch can be shown, then saved, under the new household (R3) · `actionUrl` is `/dashboard`, resolvable only by this component’s shim — the API should emit a real route (R4) · `APPROVAL_REQUESTED` reaches `VIEWER`s, who cannot approve (R6) |
| Legal / engine | LEG-2 per-child history: at most two bonifications per child, résidence alternée, the same child counted in both reliefs — warning only · the foreign-credit cap is still one aggregate slice, not per holding or per country · positional member selection remains in `annex-pdf.service.ts:48` and `freelance.service.ts:271-273` |
| Form 100 / 160 | Category-level line precision: `1553` is emitted at category level, Art. 14 versus Art. 91 profit is not distinguished, foreign income is not split by category sheet · review F1 (`CO_FILER` package uses the `PRIMARY_FILER` column convention), F3 (a bare multi-letter code is dropped silently), F4 (`INSTRUCTION` rows render like copyable boxes), F5 (two e2e specs assert the pre-LEG-7 shape) · `unsupportedCertificateCodes` unrendered; `personName` not displayed |
| Display / reporting | LEG-6 review W1 (the 111bis clamp is invisible on the DTO and in the form) · `assessmentMode` still reports `COLLECTIVE` for a spouse-less Class 2 filer · LEG-3 review W1 and W4 · LEG-8 review W1/W2 wording |
| API / data | API-5 approval invalidation beyond fact edits, no visible version history · API-6 no filing record, assessment follow-up or objection dates, no frozen filed version · API-7 package hash overwritten, no evidence index or mapping version · API-8 no rate limiting, MFA or session hardening · API-9 no calculation history · `20261108140000_add_notifications` not applied, Prisma client not regenerated, no notification e2e |
| Service-level tests | No test executes `calculateTax`, `compareScenarios`, `generateFilingPackage` or any `NotificationsService` method; a runnable stack still needs those service regressions and an API e2e run |
| Mobile | MOB-1..11 unchanged; `apps/mobile` is outside the workspace build and the notification client is web-only, so no push |
| External | The 2026 CIC monthly table and the loi 8775 text are still unpublished; both remain gated and return 0 / warn |
| Legacy data | Pre-pass snapshots, audit rows and packages generated before this pass are not backfilled; a DB-enabled e2e run is still required |

Also recorded and not selected: LEG-9, LEG-10, API-10, PROD-2, PROD-5, PROD-9 — see the second-pass section.

---

## 2026-11-08 — eighth pass: API-5 approval invalidation + version history

API-5 was delivered in two parts — backend (`audit/impl-api5.md`) and web client (`audit/impl-api5-ui.md`) — and cleared independent review in round 2 (`audit/review-api5-round2.md`, dated 2026-11-09, **allPass = true**, 0 must-fix, 3 worth considering, 4 recorded). Round 1 (`audit/review-api5.md`) held two blockers: F1 the freelance demo wrote `ConfirmedFact` rows outside the shared invalidation, so a standing approval survived facts that entered the return; F2 `FilingPackageView` kept a previous version and package when the API returned a successful `null` or the tax year changed. Both were fixed (`audit/impl-api5.md` §6). This section supersedes the API-5 row of the seventh pass’s “Still open” table; that table is kept as history. **No Prisma schema change and no migration** — the approval and version models already existed.

| # | Delivered | Evidence |
|---|---|---|
| API-5 — shared invalidation service | `ReturnApprovalsService.invalidateForChange(workspaceId, actorId, reason, ipAddress?)` in `apps/api/src/modules/filing/return-approvals.service.ts` is the only place that supersedes approvals. With **no active approval** it is a complete no-op — no `isSuperseded` write, no `NEEDS_REVIEW`, no version bump, no audit row (`{ invalidated: 0 }`). With at least one, in order: `updateMany` sets `isSuperseded`, `supersededAt` and `supersedingReason`; the workspace moves to `NEEDS_REVIEW` with `activeReturnVersion` incremented once; an audit row `APPROVAL_INVALIDATED` records `{ reason, invalidatedApprovals, supersededVersion }`. A second call in the same request is a no-op, so one request bumps the version once. | `audit/impl-api5.md` §1; `audit/review-api5.md` §5 V1.1, V1.5, V1.6; round 2 allPass |
| API-5 — trigger matrix | Eight triggers, all through the one service: fact confirm, fact update and fact delete (`facts.service.ts`), with the existing redacted reason for a private draft or unshared manual fact; questionnaire save (`questionnaire.service.ts`); document visibility change and document delete (`documents.service.ts`, generic reasons with no file name); persisted recalculation inside `shouldPersist(options)` (`calculations.service.ts`), after the new result is stored; and the freelance demo load (`freelance.service.ts`), once after the last fact write and only when `count > 0`. `compareScenarios` runs with `persist: false` and never reaches the block, so a what-if cannot invalidate an approval. | `audit/impl-api5.md` §1, §6.1; `audit/review-api5.md` §5 V1.2–V1.4, F1; `audit/review-api5-round2.md` §5 F1.1–F1.6 |
| API-5 — history endpoint and DTO | `ReturnVersionHistoryDto` + `GET /api/workspaces/:workspaceId/return-versions`, behind the same guards as the existing `GET /return-version` (which is unchanged). Newest-first; the active version is always present, with a synthetic `DRAFT` row (no `id`, no `createdAt`, no liability, nothing written) when no `ReturnVersion` row exists yet. Status: `< active` → `SUPERSEDED`; `= active` and active approvals reach the non-zero requirement → `APPROVED`; otherwise `DRAFT`. `requiredApproverCount` = ACTIVE household members for a `CLASS_2` workspace, else 1 — the rule `approveReturn` applies. `finalTaxLiability` comes from `calculationSnapshotJson` only when it is a finite number; `packageGenerated` is a `FilingPackage` row for that version; superseded approvals expose `supersededAt` and `supersedingReason`. | `audit/impl-api5.md` §2; `audit/review-api5.md` §5 V3.1–V3.7; 10 tests in `apps/api/test/return-version-history.spec.ts` |
| API-5 — filing view | `getReturnVersionHistory` in `packages/api-client`; a **Version history** card between the approval card and the package card: `Version N`, `DRAFT` / `APPROVED` / `SUPERSEDED` badge, “Current version” pill, created date or “draft not yet approved”, final liability and package flag, every approval including superseded ones with its reason. Reloaded after approve and after package generation. F2 fixes: a successful `null` now clears `returnVersion` / `filingPackage` / `history`, a failed request keeps them; state resets on `workspace.id` change and the dashboard passes `key={workspace.id}`; the unreachable member-card superseded branch is gone; the empty copy says “all required approvers”. | `audit/impl-api5-ui.md` §2–§4; `audit/review-api5-round2.md` §5 F2.1–F2.6 |

**Verification (this machine):** 179 tests pass across eight suites (engine 90, annex PDF 7, platform-admin 5, fact-visibility 12, class-resolution 37, Form 100 case map 7, notification rules 11, return-version history 10 — 30 suites), `tsc -p tsconfig.test.json` exit 0, `node .tools/syntax_check.cjs` **43 files** `ok`, exit 0. The F1 behaviour was executed against the real service code with an in-memory Prisma fake (`tmp/probe-f1-freelance-demo.ts`, 13/13 assertions: two members → 8 facts, one invalidation with `(workspaceId, actorId, 'Freelance demo facts loaded')`, no amount or file name in the arguments; second run → `count 0`, no invalidation). The F2 component was type-checked under `strict` with `FilingPackageView.tsx` in the program (`tmp/tsconfig.probe-f2.json`, exit 0).

**API e2e, database and browser were not run.** `@nestjs/*`, the generated Prisma client, Postgres and the React/Next dependencies are absent, so the Nest DI graph, the Prisma queries and the new route were never executed: the service and controller rest on transpile plus inspection. `return-approvals.service.ts` is outside `tsconfig.test.json`, so `tsc` covers only the pure helper. **The 10 new tests cover only `historyStatus` and `mergeHistory`** — `invalidateForChange` and `getHistory` have no mock-Prisma test, so a misplaced increment, a missing audit row or a truthy `packageGenerated` check would keep all 179 green. The F1/F2 evidence lives in `tmp/` and is not part of the gate. Invalidation is **not atomic** with the triggering write (same as the pre-existing fact path): a failure between them leaves the change saved and the approval active, and a failed demo call cannot be repaired by re-running the demo, because the documents already exist and `count` stays 0. Invalidation is **deliberately over-broad**: any visibility change invalidates, including `PRIVATE_DRAFT → SHARED_FOR_DISCUSSION`.

**Still open after this pass — not fixed, not claimed:**

| Track | Open items |
|---|---|
| API-5 residuals | No diff endpoint (`…/return-versions/:versionId/diff`); the history DTO carries no package hash, change author or change time. `getLatestReturnVersion` still filters superseded approvals, so only the new endpoint exposes them. Gaps are not back-filled: two invalidations without a re-approval surface only the current version, the skipped one is not invented. No recalculation-freshness guard, so an old `calculationResult` can be re-approved immediately after an invalidation. The approver count includes a `VIEWER` in a Class 2 household (consistent with `approveReturn`, arguably wrong on its own). Accepting an invitation adds an ACTIVE member without invalidating, so a two-person approval can silently fall below the new requirement. A failed refresh after a re-approval can still show the previous package next to the new version (round 2 W2), and a failed `getWorkspace` on a tax-year switch can keep the previous year mounted at parent level (W3). Non-atomic writes and the demo-retry gap are round 1 W2 / round 2 W1. |
| Service-level tests | No mock-Prisma test for `invalidateForChange` or `getHistory`; the 10 history tests are pure-function only. No API e2e, database run or browser render for this pass. |
| Legal / engine | LEG-2 per-child history: at most two bonifications per child, résidence alternée, the same child counted in both reliefs — warning only · the foreign-credit cap is still one aggregate slice, not per holding or per country · positional member selection remains in `annex-pdf.service.ts:48` and `freelance.service.ts:271-273` |
| Form 100 / 160 | Category-level line precision: `1553` is category-level, Art. 14 versus Art. 91 profit is not distinguished, foreign income is not split by category sheet · review F1, F3, F4 and F5 as recorded in the seventh pass · `unsupportedCertificateCodes` unpersisted and unrendered |
| Display / reporting | LEG-6 review W1 (the 111bis clamp is invisible on the DTO and in the form) · `assessmentMode` still reports `COLLECTIVE` for a spouse-less Class 2 filer · LEG-3 review W1 and W4 · LEG-8 review W1/W2 wording |
| API / data | API-6 no filing record, assessment follow-up or objection dates, no frozen filed version · API-7 package hash overwritten, no evidence index or mapping version · API-8 no rate limiting, MFA or session hardening · API-9 no calculation history · `20261108140000_add_notifications` not applied and the Prisma client not regenerated · API e2e and a DB-enabled run still outstanding |
| Notification delivery | Email, push, outbox, retry and dedupe absent; no `dedupeKey` · invitation, document-confirmation, missing-document, deadline, approval-invalidation, assessment-follow-up and security-alert emitters unwired · `createForUser` has no caller |
| Mobile | MOB-1..11 unchanged; `apps/mobile` is outside the workspace build |
| External | The 2026 CIC monthly table and the loi 8775 text are still unpublished; both remain gated and return 0 / warn |
| Legacy data | Pre-pass snapshots, audit rows and packages are not backfilled; a DB-enabled e2e run is still required |

> **Superseded (2026-11-09):** the “unchanged” status above is historical. MOB-1…11 were
> delivered in Phases 19–29: workspace-id fixes (MOB-1), the dead `submitTaxProfile` call
> (MOB-2), the offline queue and its wiring (MOB-3/MOB-4), private-draft redaction (MOB-5),
> authenticated package download (MOB-6), push/offline policy (MOB-7), deep links (MOB-8),
> app-lock policy (MOB-9), export/share (MOB-10) and the two renderers (MOB-11). The mobile
> **policy** layers carry 74 tests; the **rendering** layer is transpile-only because no React
> Native runtime exists here. The only items still open are R6/R7 — blocked on projet de loi 8775.


Also recorded and not selected: LEG-9, LEG-10, API-10, PROD-2, PROD-3 (diff endpoint, package hash in history, freshness guard), PROD-5, PROD-9 — see the second-pass section.

---

## Tax-year policy

**2025 is fully supported and remains the default.** The 2025 filing season runs to **31 December 2026**, so 2025 is not a legacy year:

| Year | Package | Status |
|---|---|---|
| **2025** | `2025.1.0` | ✅ fully supported and the **default** — 111bis €3,200, CI-CO2 €192, no AMVP, no start-up credit, Art. 118 2025 tariff, filing until 31 Dec 2026 |
| **2026** | `2026.1.0` | ✅ supported — 111bis €4,500, CI-CO2 €216, AMVP €9,000, start-up credit 20 % |
| **2028** | `2028.0.0-preview` | ✅ preview only — single class ("classe U"); transition rules not modelled |

`getRulePackage(year)` throws instead of silently falling back, and the error names the supported years. The calculator shows the supported-year list and takes the year from the active workspace (default 2025).

---

## How to verify

No pnpm workspace is installed here, so a self-contained toolchain lives in `.tools/`:

```powershell
# 179 tests: engine 90, annex PDF 7, platform-admin 5, fact-visibility 12, class-resolution 37, Form 100 case map 7, notification rules 11, return-version history 10
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test packages/tax-engine/test/tax-engine.spec.ts apps/api/test/annex-pdf.spec.ts apps/api/test/platform-admin.spec.ts apps/api/test/fact-visibility.spec.ts apps/api/test/class-resolution.spec.ts apps/api/test/form100-case-map.spec.ts apps/api/test/notification-rules.spec.ts apps/api/test/return-version-history.spec.ts

# strict typecheck
node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json
node .tools/node_modules/typescript/bin/tsc -p tsconfig.api.json   # Prisma-client errors only

# JSX/TS syntax check on the 43 listed web/API files (must print 43 x "ok")
node .tools/syntax_check.cjs
```

The four API `*.e2e-spec.ts` suites (lifecycle, admin governance, household collaboration, isolation) are outside these gates and were **not executed**: `@nestjs/*`, the generated Prisma client and Postgres are absent here.

Database step — **executed in this session** against a throwaway PostgreSQL 18.4 cluster:

```powershell
# cluster created inside .tools (no change to the installed service)
& "C:\Program Files\PostgreSQL\18\bin\initdb.exe" -D .tools\pgdata -U postgres -A trust -E UTF8 --locale=C
& "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D .tools\pgdata -l .tools\pg.log -o "-p 55432" start
& "C:\Program Files\PostgreSQL\18\bin\createdb.exe" -h 127.0.0.1 -p 55432 -U postgres luxtax

$env:DATABASE_URL='postgresql://postgres@127.0.0.1:55432/luxtax?schema=public'
node .tools/node_modules/prisma/build/index.js migrate deploy --schema <schema-with-url>
```

In a normal workspace (deps installed) the same step is `pnpm --filter @luxtax/api prisma:migrate`.

---

## Phase 0 — foundations

| # | Item | Status | Evidence |
|---|---|---|---|
| 0.1 | Versioned tax-year rule packages | ✅ | `packages/tax-engine/src/rules/{types,2025,2026,2028,index}.ts` |
| 0.2 | `RulePackage` contract with source refs | ✅ | each package carries `version` + `sourceRef` |
| 0.3 | Build/test harness without pnpm | ✅ | `.tools/`, `tsconfig.test.json`, `tsconfig.api.json` |
| 0.4 | Golden-value tests | ✅ | **32 / 32 pass** |
| 0.5 | Money as fixed-precision decimals | ✅ | `money.ts` (integer cents); tariff slices, rates, deduction totals and credits computed in cents |

## Phase 1 — P0 engine correctness

### 1.1 Scale and tariff

| # | Item | Status | Evidence |
|---|---|---|---|
| 1.1.1 | Official 2025/2026 Class 1 brackets | ✅ | 14–38 % step €2,295; 39 % from €54,090 |
| 1.1.2 | Art. 126 al. 2 floor to €50 | ✅ | `roundRiaDownTo50` |
| 1.1.3 | Art. 124 floor to €1, < €12 = 0 | ✅ | `floorEuroToCote` |
| 1.1.4 | Art. 121 Class 2 splitting, no half-rounding | ✅ | €100,000 → €14,682 (ACD example) |
| 1.1.5 | Art. 120bis Class 1a reduced base + caps | ✅ | €0 at €26,460; €44,268 at €150,000 |
| 1.1.6 | Fonds 7 % / 9 % at 150k / 300k | ✅ | whole-cote cliff |
| 1.1.7 | 2026 package (same scale) | ✅ | `2026.1.0` |

### 1.2 Credits

| # | Item | Status | Evidence |
|---|---|---|---|
| 1.2.1 | CIS 3-zone formula | ✅ | €5,000 → €417.86; €20,000 → €600 |
| 1.2.2 | CI-CO2 €192 / €216 | ✅ | tested per year |
| 1.2.3 | CIM €3,504 / 0.0612 / €750 + allocation test | ✅ | €50k → €3,504; €80k → €2,280 |
| 1.2.4 | CIP + CI-CO2 pensionné | ✅ | €500 → €300; €20,000 → €600 |
| 1.2.5 | CII + CI-CO2 indépendant | ✅ | €500 → €300 |
| 1.2.6 | CIS xor CIP xor CII per person | ✅ | highest-credit rule + warning |
| 1.2.7 | Household CIS + CII coexist | ✅ | tested |
| 1.2.8 | CIS rounding (gross floor €1, credit ceil cent) | ✅ | |

### 1.3 Deductions

| # | Item | Status | Evidence |
|---|---|---|---|
| 1.3.1 | FFO €540 / €300 / €25 per category per person | ✅ | two payslips → one FFO |
| 1.3.2 | Déplacement €99/unit, 4 free, cap €2,574 | ✅ | |
| 1.3.3 | Invalidity forfaits €645–€1,020 / €1,515 | ✅ | |
| 1.3.4 | FDS €480 / €960 | ✅ | 960 for collective dual-earner |
| 1.3.5 | Art. 111 €672 envelope | ✅ | multiplier 1 + conjoint + enfants modérés |
| 1.3.6 | Art. 111bis / 111ter separate cap | ✅ | €3,200 (2025) / €4,500 (2026), per souscripteur |
| 1.3.7 | Épargne-logement €1,344 / €672 | ✅ | younger adult’s age; 2025/2026 rule (loi 8775 not applied — see 4.7) |
| 1.3.8 | Dons additive to FDS | ✅ | min €120, 20 %, €1M |
| 1.3.9 | Owner-occupier interest (Art. 98 n°5 / 105) | ✅ | 2 years intégral, 4k/3k/2k × household |
| 1.3.10 | Charges extraordinaires €5,400 | ✅ | garde / domesticité / soins |
| 1.3.11 | Art. 129b AEP | ✅ | 4,500 / 2,250 / 375, lower-net cap, loss → 0 |
| 1.3.12 | Art. 7(2) loss compensation + Art. 114 | ✅ | signed compensation; 17-year ledger (`lossCarryForward`) |
| 1.3.13 | LRCP €1,200 | ✅ | separate fact key |
| 1.3.14 | ASRD prime unique | ✅ | 6,000 + 1,200/child, +8 %/yr above 30 (max 160 %) |

### 1.4 Income categories

| # | Item | Status | Evidence |
|---|---|---|---|
| 1.4.1 | Pension income + FFO €300 + CIP | ✅ | |
| 1.4.2 | Capital income + €1,500 tranche + Art. 115(15a) 50 % + RELIBI | ✅ | securities ledger: qualifying dividend, RELIBI 20 % final option, creditable foreign WHT |
| 1.4.3 | Rental: net, forfait, social 90 %, asset register | ✅ | amortisation 4 %/1.5 %/2 %/3 % + energy rate (6 % 2025 / 10 % 2026), charges, interest |
| 1.4.4 | Foreign income + treaty relief | ✅ | see 4.4 |
| 1.4.5 | Plus-values: 6 months / Art. 100 / 102bis | ✅ | speculation, €500 floor, €50k/€100k abattement, demi-taux |
| 1.4.6 | Unsupported-scenario guard | ✅ | `unsupported[]`, non-resident refusal path |

### 1.5 Class and household

| # | Item | Status | Evidence |
|---|---|---|---|
| 1.5.1 | Class assignment Art. 119 / 3 / 3bis / 3ter | ✅ | `resolveTaxClass` |
| 1.5.2 | Art. 3ter pure / réallocation | ✅ | engine modes + percent |
| 1.5.3 | Art. 48 n° 2–3 warning | ✅ | `spouseEmployedByBusiness` flag → warning |
| 1.5.4 | Conjoint-aidant (AEP route b, second CII) | ✅ | |
| 1.5.5 | Two 90 % tests (Art. 3 d) / Art. 157ter) | ✅ | Art. 3 d) gate now admits a mixed couple to Class 2 at ≥ 90 %, otherwise warns |

## Phase 2 — contracts, API, UI

| # | Item | Status | Evidence |
|---|---|---|---|
| 2.1 | `TaxCalculationParams` extended | ✅ | ages, AEP, mortgage, travel, invalidity, losses, AMVP, ASRD, plus-values, treaties, non-resident |
| 2.2 | `TaxCalculationResultDto` extended | ✅ | `deductions`, `credits`, `plusValues`, `rental`, `nonResident`, `unsupported` |
| 2.3 | New `FactCategory` values | ✅ | contracts + Prisma enum |
| 2.4 | `CalculationsService` passes profile answers | ✅ | |
| 2.5 | Questionnaire asks the new questions | ✅ | incl. ASRD, rental forfait, start-up, non-resident |
| 2.6 | Calculator shows every legal line | ✅ | ASRD, 111bis, CE, AEP, LRCP, CIS, CI-CO2, CII, CIM, start-up, rental, plus-values |
| 2.7 | Hard-coded “2025” copy removed | ✅ | calculator, dashboard, facts view; year comes from the workspace |
| 2.8 | Freelance profiles only for real independents | ✅ | |
| 2.9 | Prisma migrations executed | ✅ | 3 migrations applied to PostgreSQL 18.4; 23 tables; `FactCategory` = 17 values; `filing_packages.annexesJson` jsonb; `migrate diff` = **empty** (no drift) |
| 2.10 | CISSM crédit d'impôt salaire social minimum | ✅ | rule block, `cissmForSalary`, engine line, UI row, test |
| 2.12 | Securities + rental inputs in the questionnaire | ✅ | one-row entry each, mapped to `securities` / `rentalProperties` |
| 2.13 | Annex PDF endpoint + download button | ✅ | `GET …/filing-package/annexes.pdf`; blob download in `FilingPackageView` |
| 2.11 | Facts UI exposes every legal fact type | ✅ | 22 presets incl. 111bis, MORTGAGE_INTEREST, LRCP, CE, capital, rental, foreign |

## Phase 3 — filing

| # | Item | Status | Evidence |
|---|---|---|---|
| 3.1 | Form 100F sheet map | ✅ | S, P, CM, L, C/A-I, DS, CE, RD, Recap |
| 3.2 | Certificate 160 control step | ✅ | separate guide step |
| 3.3 | Computed FFO / FDS | ✅ | from the calculation snapshot |
| 3.4 | Assistant électronique exclusions | ✅ | Art. 3ter + mixed 90 % option |
| 3.5 | Annexes 190/210, 700, 104, CIM | ✅ | `annexes[]` persisted; **PDF generated** and downloadable from the filing view |

## Phase 4 — later (P1/P2) — now implemented

| # | Item | Status | Evidence |
|---|---|---|---|
| 4.1 | Decimal arithmetic end-to-end | ✅ | every money accumulation uses `addMoney` (cents); tariff, rates, deductions, credits, fonds in cents |
| 4.2 | Plus-values module | ✅ | Art. 99bis / 100 / 99ter / 102bis |
| 4.3 | Rental forfait + social exemption | ✅ | 35 % / €2,700; 90 % Art. 115(22a) |
| 4.4 | Treaty method matrix | ✅ | `rules/treaties.ts`; FR progression, DE/BE credit, 134bis fallback |
| 4.5 | 2026: AMVP + start-up credit + CIC | ✅ | AMVP €9,000 and 20 %/€100k implemented; CIC is **explicitly flagged** in warnings because its monthly amounts were not published |
| 4.6 | Start-up credit 20 % / €100k | ✅ | €150,000 invested → €20,000 credit |
| 4.7 | Épargne-logement age rule | ✅ | 2025/2026 law applied (40-year limit). Loi 8775 suppression **not** applied until the Mémorial text is pinned |
| 4.8 | Class U 2028 package | ✅ | `2028.0.0-preview`, `singleClass`, warning |
| 4.9 | Non-resident path (Art. 157ter) | ✅ | assimilation test + exclusion fallback + `nonResident` DTO |
| 4.10 | ASRD prime unique table | ✅ | |
| 4.11 | Art. 114 multi-year loss ledger | ✅ | `lossCarryForward[{year, amount}]`, 17-year filter |
| 4.12 | Document extractor breadth | ✅ | 111bis split, pension certificate (modèle 170) with code 200/201/203/205; other 160 codes still text-matched only |

---

## Phase 44 — the mixed-couple gate is now reachable from the app

**Closing the two gaps Phase 43 documented.** `spouseResidence` and `mixedCoupleCollectiveRequested`
were engine parameters with **no questionnaire field and no UI control**, so Art. 3 d) could never
fire: every mixed resident/non-resident couple — a very common Luxembourg situation — silently fell
into separate taxation, and the app could not even describe the household.

**Wired end to end, four layers.**

| Layer | Change |
|---|---|
| Contracts | `spouseResidence?: 'RESIDENT' \| 'NON_RESIDENT'`, `mixedCoupleCollectiveRequested?: boolean` |
| Validation | enum + boolean, plus a refinement: a collective request **without** a spouse residence is rejected — the gate compares two residences, so one alone is meaningless |
| API | both passed into `TaxCalculationParams` |
| Web UI | for `MARRIED` / `PACS`, a "Where does your spouse live?" select and — once a residence is chosen — a checkbox whose label states the real rule (≥ 90 % of household professional income in Luxembourg, otherwise separate taxation) |

**A vacuous test caught before it shipped.** The first version of the engine tests asserted
`ruleCode === 'LIR-ART-3-d'` in uppercase. The engine emits `'LIR-ART-3-d'`, so the two *negative*
cases passed for the wrong reason — they would have passed with the gate removed. Corrected, all five
now exercise the real branch:

- mixed couple without a request → separate treatment **and** the explanatory warning;
- request with a 95 % Luxembourg share → admitted, provenance line `LIR-ART-3-d`;
- request with a 70 % share → refused, warning names the 90 % threshold;
- both spouses resident → the request is ignored, no Art. 3 d) line;
- spouse residence unknown → unaffected.

**Also:** `param-wiring.spec.ts` now asserts `KNOWN_UNWIRED` is **empty** — every engine parameter
reaches a code path in the service.

**Verification:** **513 / 513 tests** (500 + 5 engine + 5 validation + 1 view + 2 wiring),
`tsc -p tsconfig.test.json` exit 0, `tsc -p tsconfig.render.json` exit 0, **68 files** syntax `ok`.

## Phase 43 — the Art. 114 ledger was unreachable, and its precedence was wrong

**Found by auditing the boundary, not the engine.** A name-level sweep of `TaxCalculationParams`
against `calculations.service.ts` returned four parameters that never appear in the API mapping. Two
were legitimate (`qualifyingDividends`, `rentalProperties`, `movableGains`, `realEstateGains` and the
like are derived from **facts**, not from answers). One was not:

**`lossCarryForward` — the Art. 114 multi-year ledger — was never supplied.** The engine accepts
`{ year, amount }[]` and filters it against the 17-year window, but the API passed only the scalar
`priorYearLosses`, which carries no year. So in production the 17-year rule could never fire: a loss
from 20 years ago would be deducted as if it were current.

**Two defects, one shape.**

1. *Unreachable:* `lossCarryForward` added to `QuestionnaireAnswersDto`, bounded in the validation
   schema (≤ 50 entries, year 1990–2100, amount 0–10 M) and passed through by the service.
2. *Wrong precedence:* the engine computed `max(ledgerSum, scalar)`. With a valid 5 000 € ledger and
   a stale 90 000 € total, the **expired** 90 000 won. It now reads:
   if a non-empty ledger is supplied it is authoritative; otherwise fall back to the scalar. An
   all-expired ledger therefore yields **0**, not the stale total.

**Seven engine tests** (`loss-ledger.spec.ts`): entries inside the window sum; a 20-year-old entry is
ignored; one exactly 17 years old is kept; a stale scalar cannot outrank a smaller valid ledger; the
scalar still works when no ledger exists; an all-expired ledger does not fall back; non-positive
entries are ignored.

**And the audit became a test.** `apps/api/test/param-wiring.spec.ts` parses `TaxCalculationParams`
and `calculations.service.ts` and fails when a parameter reaches no code path. Two lists keep it
honest: `NOT_FROM_ANSWERS` (fact-derived or workspace-derived, with the reason) and `KNOWN_UNWIRED`,
which documents a **real remaining gap** rather than hiding it:

| Known gap | Consequence |
|---|---|
| `spouseResidence` | no questionnaire field, so a mixed resident/non-resident couple cannot be described |
| `mixedCoupleCollectiveRequested` | no questionnaire field, so the Art. 3ter collective election cannot be expressed |

A third assertion fails if a name on the known-gap list becomes wired, so the list cannot rot.

**Verification:** **500 / 500 tests** (488 + 7 + 5), `tsc -p tsconfig.test.json` exit 0,
`tsc -p tsconfig.render.json` exit 0, **66 files** syntax `ok`.

## Phase 42 — closing the loop on my own Phase 38 change

**A regression risk I created.** Phase 38 made the engine refuse owner-occupier interest when the year
the valeur locative was fixed is missing. That is the right engine behaviour, but it moved the failure
to a place the user cannot see: the questionnaire accepted "mortgage on the primary residence = yes"
with the year left blank, and the taxpayer only discovered the loss in the `warnings` array after the
calculation. A deduction they are entitled to would vanish because of a missing optional field.

**Fix at the boundary.** `questionnaireSchema` now refines the object: declaring
`hasPrimaryResidenceMortgage` without `mortgageOccupancyYear` is rejected **unless**
`mortgageBeforeDisposition` is true (a home under construction is fully deductible and needs no year).
The message states the consequence, not just the rule: *"the Art. 105 schedule cannot be applied
without it, so the interest would not be deducted"*.

Six tests (`packages/validation/test/mortgage-year.spec.ts`): no mortgage accepted; mortgage without a
year rejected on `mortgageOccupancyYear`; mortgage with a year accepted; construction accepted without
a year; the non-owner-occupier case still optional; the message names the consequence.

**Type coverage.** `packages/validation/**` was **not** in `tsconfig.test.json` — the validation package
was executed by the suite but never compiled there. Adding it exposed a second gap: `zod` could not be
resolved by `tsc` at all (it lives in the scratch toolchain and was reachable only through `NODE_PATH`
at runtime). A `zod` path mapping fixed both, so the whole validation package is now type-checked in
the main configuration.

**Verification:** **488 / 488 tests** (482 + 6), `tsc -p tsconfig.test.json` exit 0,
`tsc -p tsconfig.render.json` exit 0, **64 files** syntax `ok`.

## Phase 41 — hostile input: the engine must stay total

**A probe that found nothing, turned into a contract.** Phase 38–40 each found a defect; this pass
looked at non-finite and wrongly-typed amounts and found the engine already safe:

| Input | Before this phase |
|---|---|
| `Infinity`, `-Infinity`, `NaN` | treated as no amount, every figure stays finite |
| `'abc'`, `null`, `undefined`, `{}` | same |
| `'60000'` (numeric string) | accepted as 60 000 — imports arrive as text, so this must keep working |
| `1e21` | finite output (absurd, but arithmetic on absurd input) |

So nothing was changed in the engine. What was missing is a **regression contract**, now
`packages/tax-engine/test/hostile-input.spec.ts` (12 tests): eight bad-amount cases, the numeric-string
case, a garbage deduction, an absurd-but-finite amount, and a **200-round randomised fuzz** over random
fact sets mixing `NaN`, `±Infinity`, negatives, strings, `null`, objects and unknown certificate codes.

**One assertion of mine was wrong, and the fuzz caught it.** The helper originally required every
figure to be non-negative; round 74 produced `netIncome = −1`. That is not a defect: rental or business
losses can exceed income, making net income negative in a loss year, and the taxable base is floored at
zero afterwards. The contract was split accordingly:

- **always finite**: gross income, net income, taxable income, deductions, base tax, credits, liability,
  balance, effective rate;
- **never negative** (by construction): gross income, taxable income, deductions, base tax, credits,
  liability.

`balancePayableOrRefund` is deliberately in neither non-negative list — it is signed, positive when
payable and negative when refundable.

**Verification:** **482 / 482 tests** (470 + 12), `tsc -p tsconfig.test.json` exit 0,
`tsc -p tsconfig.render.json` exit 0, **62 files** syntax `ok`.

## Phase 40 — a sign error could reduce another income line

**Third probe pass, third class of defect.** The sweep now covered inputs rather than caps: negative
amounts, absurd `travelUnits`, an oversized actual-expense claim, absurd child counts and ages.

Most held. `travelUnits: 10 000` and `1 000 000` produce the **same** deduction (the travel forfait is
bounded); a 500 000 € actual-expense fact is not mapped to any box and is reported as such;
`primaryAge` of 2 or 300 changes nothing. One input did not hold:

```
salary −60 000 + pension 40 000  →  grossIncome = −20 000
```

Facts were ingested with `const amount = Number(fact.amount) || 0` and **no sign check**. A negative
salary did not reduce the tax (net income is floored per person, so the final figure was right), but it
did flow into `grossIncome` — the first number the UI shows and the base of `effectiveTaxRate`. A
minute later someone reads "Gross Salary Income: −€20 000.00".

**Fix.** The ingestion loop refuses `amount < 0` with a warning that explains the intent: *"Enter the
correction as a positive amount in the right box; a sign error must not reduce another income line."*
A refused fact never reaches a bucket, so it cannot appear in `factIds`, `grossIncome` or any
deduction.

| Probe | Before | After |
|---|---|---|
| salary −60 000 alone | `gross = −60 000` | `gross = 0`, fact refused with a warning |
| salary −60 000 + pension 40 000 | `gross = −20 000` | `gross = 40 000` |
| negative donation / negative mortgage | ignored by the per-deduction clamp | refused at ingestion, with a warning instead of silence |

Two tests added (negative income and negative deduction). No existing test used a negative amount, so
nothing had to be rewritten this time.

**Verification:** **470 / 470 tests** (468 + 2), `tsc -p tsconfig.test.json` exit 0,
`tsc -p tsconfig.render.json` exit 0, **61 files** syntax `ok`.

## Phase 39 — a second over-deduction bug: losses bigger than the income they offset

**Same probe family, another instance.** Having found one "optional input becomes an unlimited
benefit" bug in Phase 38, the same sweep was pointed at every other deduction. Most held: donations of
500 000 € on a 60 000 € salary deduct **12 000 €** (the 20 % ceiling); épargne-logement without a
subscriber age deducts the **672 €** base amount rather than the doubled young-saver rate; LRCP,
Art. 111 and the childcare/household-help forfait all clamp.

Prior-year losses did not:

```ts
const priorLossesDeduction = clampPositive(ctx.priorYearLosses);   // no cap at all
```

A 900 000 € carry-forward against 60 000 € of income produced `priorLosses = 900 000`,
`deductions.total = 901 020` — twenty times the income it is deducted from. The *tax* was still 0
because the taxable base is floored, so nothing looked wrong on the final figure; what was wrong is
the record: **841 020 € of Art. 114 loss would have been silently consumed** instead of staying in the
carry-forward.

**Fix.** `DeductionContext` gains `availableIncomeForLosses` (the year's net income, already computed
before the deduction pass), and the loss deduction becomes
`min(declared, max(0, netIncome − otherDeductions))`. The engine then pushes a warning that names both
figures: how much was applied and how much stays in the carry-forward. A fully absorbed loss stays
silent.

| Result after the fix | Value |
|---|---|
| taxable income | 0 |
| `deductions.priorLosses` | **58 980** (= 60 000 net − 1 020 ordinary deductions) |
| `deductions.total` | **60 000**, never more than net income |
| warning | "…58 980.00 was applied and 841 020.00 stays in the Art. 114 carry-forward." |

Two tests added: the capped case above, and a 5 000 € loss that is absorbed in full without a warning
(so the warning cannot become noise that users learn to ignore).

**Verification:** **468 / 468 tests** (466 + 2), `tsc -p tsconfig.test.json` exit 0,
`tsc -p tsconfig.render.json` exit 0, **61 files** syntax `ok`.

## Phase 38 — an over-deduction bug: owner-occupier interest with no fixation year

**Found by probing, not by reading.** While testing that deductions cannot exceed income, a probe
scenario (5 000 € salary, 99 999 € mortgage interest) returned `deductions.total = 103 739`. The
`mortgageCap()` docstring said *“undefined = not owner-occupied”*, but the code read:

```ts
if (beforeDisposition || fixationYear === undefined) return interest;   // before Phase 38
```

So a mortgage-interest fact **without** `mortgageFixationYear` was deductible **without limit** — the
Art. 105 habit_pers bands (years 1–2 unlimited, 3–6 → 4 000, 7–11 → 3 000, 12+ → 2 000) were skipped
entirely. One missing optional field would have wiped out any taxable income, which is the
over-deduction this engine must never produce. It also contradicted the function's own comment.

**Why it was reachable.** `mortgageFixationYear` is optional on the DTO. `calculations.service.ts`
does map `answers.mortgageOccupancyYear` into it, so the normal questionnaire path supplies a year —
but nothing forced a caller to, and a missing year silently became an unlimited deduction rather than
an error.

**Fix.** `deductions.ts`: construction before *libre disposition* stays fully deductible
(`mortgageBeforeDisposition`), and an **absent** fixation year now returns **0**; `engine.ts` pushes a
warning naming the field and both ways to supply it. The refusal is visible in `warnings` rather than
being a silent 0 — the same "refuse rather than guess" rule the pending-measure gate follows.

**A test had pinned the buggy behaviour.** `code_141 reaches the MORTGAGE_INTEREST branch` asserted
1 000 € of interest with no year produced a 1 000 € deduction. It now supplies `mortgageFixationYear:
2025` (year 1 of the schedule, where unlimited *is* correct), so the certificate-mapping assertion is
preserved and the permissive case is gone.

| New test | Asserts |
|---|---|
| no fixation year | 99 999 € declared → **0 € deducted**, warning mentions "without the year the valeur locative was fixed" |
| construction | `mortgageBeforeDisposition: true` → 12 000 € fully deductible and **no** warning |
| schedule bands | tax year 2025 with fixation 2023 → 4 000 €, 2017 → 3 000 €, 2005 → 2 000 € |

**Second finding, in my own test.** The Phase 37 "reproducible" case failed after the change, and the
probe showed why: the only difference between two runs is `calculatedAt`, a wall-clock stamp. The
engine is pure (the input object is not mutated); the *test* was wrong to deep-equal the whole DTO. It
now compares every field except the timestamp.

**Verification:** **466 / 466 tests** (463 + 3), `tsc -p tsconfig.test.json` exit 0,
`tsc -p tsconfig.render.json` exit 0, **61 files** syntax `ok`.

## Phase 37 — property tests for the tariff (the shape, not just the points)

**Why.** Every engine test so far pinned **points**: eight golden values an auditor could check by
hand. That catches a wrong table but not an arithmetic slip at a bracket boundary, and it says
nothing about the other 99 % of the income range. This phase pins the **shape** instead.

`packages/tax-engine/test/invariants.spec.ts` — **23 tests**, deterministic sampling (LCG seeded
`20261109`, so a failure is reproducible), run over **all three packages (2025/2026/2028)** and all
three classes:

| Invariant | Why it must hold |
|---|---|
| non-negative, zero at or below zero income | a tariff cannot tax a loss |
| monotone: base tax never falls as income rises (dense 250 € sweep to 320 000 €) | progressivity |
| below a proportional ceiling (42 %) | the top marginal rate bounds the average rate |
| **no bracket cliff**: +50 € cannot raise the tax by more than 42 % × 50 | brackets must be continuous; an off-by-one boundary or an overlap shows up here |
| Class 2 splitting ≤ Class 1 | Art. 121 exists to reduce, never increase, the burden |
| Class 1a ≤ Class 1 | Art. 120bis relief can only help |

Assembled-calculation properties (six more): liability is never negative or non-finite across sampled
salaries up to 400 000 €; taxable income never exceeds gross income; **adding a 4 500 € third-pillar
contribution never raises the liability**; a higher salary never lowers the liability; and the same
input yields a deep-equal result twice.

**What the probe found: nothing — and that is the result.** The cliff sweep came back with a maximum
implied marginal of exactly **42.0 %** for Class 1 / 1a and **40.0 %** for Class 2 splitting, which
matches the published top rates. The brackets are continuous and no marginal exceeds the statute. The
invariants are now locked, so a future bracket edit that introduces an overlap fails immediately
instead of waiting for someone to notice a strange number in a return.

**Verification:** **463 / 463 tests** (440 + 23), `tsc -p tsconfig.test.json` exit 0,
`tsc -p tsconfig.render.json` exit 0, **61 files** syntax `ok`.

## Phase 36 — the questionnaire's write path is exercised

**What was untested.** `QuestionnaireView` is not just a form: on save it turns three optional
"quick estimate" fields into **facts** through `POST /facts/confirm`, which the engine then taxes.
That write path had never been executed by any test — a wrong `fieldKey`, a wrong category or a
`NaN` amount would have shipped.

**Six tests, real client, stubbed `fetch`** (`apps/web/test/questionnaire-view.spec.ts`). Events are
invoked as the props React would call (`form.onSubmit`, `input.onChange`), so the handler wiring and
the JSON body are real while the browser is not.

| Case | Asserts |
|---|---|
| mount | GET `/api/workspaces/ws-1/questionnaire`, saved answers and readiness rendered |
| save, no estimates | exactly one write, `PUT …/questionnaire`, body deep-equals the answers, **no** `/facts/confirm` call |
| one estimate | one fact: `fieldKey: 'grossSalary'`, `amount: '50000.00'`, category `EMPLOYMENT_INCOME`, `isIncludedInReturn: true` |
| three estimates | facts in order: `grossSalary`, `withholdingTax`, `mortgageInterest` — the mortgage block only renders after its checkbox is toggled, so the test toggles it |
| non-numeric estimate | `'not-a-number'` posts **no** fact at all (rather than `amount: 'NaN'`) |
| server downgrade | when the API echoes `isIncludedInReturn: false`, the view renders the `factInclusionWarning()` message — the taxpayer is told the saved figure is not in the return |

**Two things this cost, both worth recording.** `saveQuestionnaire()` uses **PUT**, not POST, so the
first assertion draft filtered on the wrong method. And a re-render replaces the element tree:
submitting the tree captured before typing invoked a handler closed over the *previous* state, which
made the salary fact silently disappear. The suite now re-reads the tree before submitting — a
harness bug, not a product one, but exactly the kind that would have made a weaker test "pass" while
proving nothing.

**Type coverage.** `QuestionnaireView.tsx` and its spec were added to `tsconfig.test.json`, so the
view is compiled in the main configuration rather than only transpiled.

**Verification:** **440 / 440 tests** (434 + 6), `tsc -p tsconfig.test.json` exit 0,
`tsc -p tsconfig.render.json` exit 0, **60 files** syntax `ok`.

## Phase 35 — the web layer gets its first tests, and one crash fixed

**Continuing the non-R6/R7 track.** `apps/web` had **no tests at all** — ten components, ~250 KB,
including the screen that shows the taxpayer their final figure. Three additions, and one defect
found in the process.

**A defect, not just coverage.** `TaxCalculatorView` rendered `calc.unsupported.length` directly.
`getLatestCalculation()` returns a **stored JSON blob cast straight to the DTO**
(`workspace.calculationResult as unknown as TaxCalculationResultDto`), so any result saved before the
`unsupported` field existed arrives without it — and the view threw
`TypeError: Cannot read properties of undefined (reading 'length')` *instead of rendering the
figures it does have*. Fixed to `Array.isArray(calc.unsupported) && …`, with a regression test that
mounts a payload with the field deleted. This is the class of bug that only appears on real
historical data, which is exactly what the cast makes reachable.

**`apps/web/test/tax-calculator-view.spec.ts`** — the first mounted web view. It stubs `fetch`
(the client's only I/O) rather than the client, so the URL, the envelope handling and the render are
all exercised. The fixture is **not hand-written**: `calculations.service.ts` builds the DTO as
`{ ...engineResult, comparisonEligible }`, so the test runs the real engine on a 60 000 € salary and
feeds its output to the view — the numbers on screen are the engine's numbers (58 980.00 € taxable,
1 020.00 € deductions, 396.00 € credits).

| Case | Asserts |
|---|---|
| saved calculation | requests `/api/workspaces/ws-1/calculation`, renders the year, the rule-package version and the exact formatted taxable income |
| refused input | the "This scenario is not fully supported" banner and the specific `unsupported` line |
| nothing refused | banner absent |
| no saved result | empty state ("Run First Tax Calculation"), no crash |
| **legacy result** | a payload without `unsupported` still renders — the regression above |
| API error | degrades to the empty state and never leaks `NaN` or `undefined` into the view |

**`apps/web/test/fact-inclusion.spec.ts`** (5 tests) — `factInclusionWarning()` decides whether the
UI tells the taxpayer that a saved figure is *not* in the return because its document is only shared
for discussion. Pinned: warn only on `requested && returned === false`; an **absent** flag is not a
refusal (warning on `undefined` would fire on every older payload and teach users to ignore it).

**`packages/design-tokens/test/translations.spec.ts`** (9 tests) — unique snake_case keys, every term
translated in en/fr/de, no English pasted into `fr`/`de`, a legal reference on all but at most one
term, and `getTermTranslation()` echoing an unknown key rather than throwing. **Noted, not fixed:
`getTermTranslation()` currently has no consumer** — only `LUXEMBOURG_TAX_TERMS` is used, by the admin
console. The function is kept because the test pins its contract, but it is dead code today.

**Infrastructure.** `tsconfig.test.json` gained `jsx: react-jsx`, path mappings for
`@luxtax/api-client` and `@luxtax/design-tokens`, and the five new files — so the web view is now
type-checked in the main configuration rather than only transpiled.

**Verification:** **434 / 434 tests** (414 + 20), `tsc -p tsconfig.test.json` exit 0,
`tsc -p tsconfig.render.json` exit 0, **59 files** syntax `ok`.

## Phase 34 — certificate 160 gets tests (the mapping that feeds real returns)

**Why this target, given R6/R7 are blocked.** The brief allows advancing on something other than
R6/R7 before the law is published. A name-based sweep for source files with no spec turned up one
high-consequence gap: `packages/tax-engine/src/forms/certificate160.ts`, the table that turns
OCR'd certificate codes into engine field keys, had **no tests at all** — while both `engine.ts` and
`filing.service.ts` depend on it. A silent misparse there does not produce a warning; it produces a
wrong return.

**19 tests in `packages/tax-engine/test/certificate160.spec.ts`, in four groups.**

| Group | Pinned behaviour |
|---|---|
| Table invariants | every entry's `code` equals its key; every `category` is a real `FactCategory`; a **supported** entry must carry a non-empty `fieldKey` and an **unsupported** one must carry `''` (an unsupported code with a field key would still be read); both labels and the note are present; 101/102/103/105/141/S/P/LRCP stay supported |
| Normalisation | `code_101` → `101`, `CODE_141` → `141`, `'  fd '` → `FD`, `lrcp` → `LRCP`; null/blank → `''` |
| Shape detection | `code_*`, three digits, single letters and every table key are certificate-shaped; **an unmapped single letter (`E`) counts as certificate-shaped** so it warns instead of disappearing; `grossSalary`, `socialSecurity`, `mortgageInterest`, `art111bis` are not |
| Engine behaviour | `code_101` gives the *same* `taxableIncome` as `grossSalary`; 101+102 sum into one line; the table overrides a wrong category hint; an unknown code (`code_999`) **warns and is excluded** (taxable income 0); `FD` warns as a withholding-base label and is excluded; an ignored fact does not leak into the kept fact's line; 141 → mortgage interest, P → gross pension |

**One finding, recorded rather than "fixed".** The first run failed on `lrcp`:
`isCertificate160FieldKey('lrcp')` is **true**, because normalisation yields `LRCP`, which is a
certificate code. That is not a defect — the table maps `LRCP` back to category `LRCP_CONTRIBUTION`
and field key `lrcp`, so a fact written either way lands on the same deduction line. The assumption
was wrong, not the code. It is now pinned by its own test so a future rename of either spelling
breaks loudly instead of silently changing which line the contribution reaches.

**Verification:** **414 / 414 tests** (395 + 19), `tsc -p tsconfig.test.json` exit 0,
`tsc -p tsconfig.render.json` exit 0, **56 files** syntax `ok`.

## Parked record — 2026-11-09

**Deferred, not blocking.** R6 and R7 were moved out of the active queue: no work inside this
repository can complete them, because the figures must come from a published law. The rest of the
tracker stays active.

| Deferred row | Why it cannot be worked now | Unparks when |
|---|---|---|
| **R6** — 2026 CIC monthly bands | The table exists only in projet de loi 8775; there is no Mémorial text | the watch reports a new ACD law entry |
| **R7** — épargne-logement age limit | Same law; the 40-year condition is still in force, so `savingsHousingYoungMaxAge` stays `40` | same |

Unparking is four documented commands (`docs/8775-activation-handoff.md`), proven end-to-end on a
throwaway copy in Phase 33 exactly so that day is mechanical.

**Decision: parked.** Recorded here rather than only in the status line, so the basis is auditable
and nobody re-opens these rows by accident.

**Delivered and evidenced.** Phases 0–42. Tax engine (Art. 118 scale, 121 splitting, 124/126 floors,
120bis class 1a, CIS/CIP/CII/CI-CO2/CIM/CISSM/CO2 credits, deductions, rental register, plus-values,
Art. 7(2) and Art. 114 losses, Art. 115 n°13d), filing package with annex PDFs and evidence index,
calculation snapshots, audit hash chain, eight Prisma migrations applied to PostgreSQL 18.4 with
`migrate diff` empty, rate limiting, TOTP MFA, and all eleven MOB items — and, after the closing decision, Phase 34 added certificate-160 coverage so the table
that feeds real returns is no longer untested. Totals: 488 tests, two `tsc` configurations at exit 0, 64 files syntax `ok`.

**Not delivered, and why.**

| Item | Blocking fact |
|---|---|
| **R6** — 2026 CIC monthly bands | The table exists only in projet de loi 8775. `impotsdirects.public.lu/fr/legislation/legi26.html` ends at the *loi du 16 juillet 2026* (Mémorial A N° 360); `chd.lu/fr/dossier/8775` shows only *22.06.2026 — Déposé*. |
| **R7** — épargne-logement age limit | Same law. The 40-year condition is still in force, so `savingsHousingYoungMaxAge` stays `40`. |

**Why the two were not closed anyway.** Writing a `cic` table from memory, or flipping
`pendingMeasures` to `IN_FORCE` ahead of the law, would produce a package that passes every test in
this repository while mis-stating real residents' tax. A green suite cannot detect an invented
statute, which is exactly why the gate from Phase 30 exists: `checkPendingConsistency()` rejects a
measure declared in force without its data, and `cicForMonthlySalary()` returns `NOT_IN_FORCE`
rather than a silent zero.

**Verified state at closure** (`python .tools/activate_8775.py --check`):
`ok: rules/2026.ts is still gated (cic absent, age 40, both measures NOT_IN_FORCE)`.

**Handoff card.** docs/8775-activation-handoff.md — the short version, for a future session that
cannot read a 150 KB tracker: what the law changes, the JSON shape, the four commands, and the four
acceptance criteria.

**What reopens this goal.** The daily watch `861a3eef-273d-470c-a1de-475e4448138b` (cron `0 8 * * *`,
Europe/Luxembourg, enabled at revision 2) reports a new entry in the ACD list of laws. The reopening
sequence is Phase 33's runbook, four commands, no hand editing:

```powershell
python .tools/activate_8775.py --bands <published.json>
node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test <spec files>
python .tools/activate_8775.py --check   # expected to FAIL once the gate is live
```

The activation path itself was proven end-to-end in Phase 33 on a throwaway copy with synthetic
bands: the generated TypeScript compiled, the gate accepted it, and the lookup returned the hand-checked
values 84 / 94 / 109 / 68.

## Phase 33 — the 8775 activation becomes a checked procedure

**Problem.** When the watch reports the Mémorial text, three edits must land together in a
hand-written TypeScript file that is CRLF-sensitive and must stay UTF-8 without BOM:

1. paste the published monthly table as `cic: { bands: [...], topAmount, topUpTo }`
2. add a `specialExpenses` override carrying `savingsHousingYoungMaxAge: 200`
3. flip **both** `pendingMeasures` to `IN_FORCE`

Missing any one of them leaves the package in a state Phase 30's gate now *rejects* — which is the
right failure, but it means publication day would have been spent debugging an editor rather than
applying a law.

**What was added.** `.tools/activate_8775.py`, which performs exactly those three edits from a JSON
file of published bands and nothing else:

| Guard | Behaviour |
|---|---|
| `--check` | asserts the file is still in the pre-publication state (`cic` absent, age 40, both measures `NOT_IN_FORCE`); run today it prints `ok` |
| non-empty bands | refuses an empty list or a band missing `from`/`to`/`slope`/`offset` |
| band sanity | refuses `from > to` and refuses overlapping bands — the two mistakes most likely when retyping 12 rows out of a PDF |
| idempotence | refuses to run on a file that already has `cic` or the 200 age limit, so a second invocation cannot double-apply |
| exact anchoring | requires the `ccssPensionRate: 0.17,` anchor to occur exactly once, and each measure to appear exactly once as `NOT_IN_FORCE` |
| encoding | reads/writes with `utf-8`, preserves the file's existing line endings |

**Verified end-to-end, not just written.** A throwaway copy `rules/2026.probe.ts` was generated from
* synthetic* bands (three bands, `topAmount: 68`, `topUpTo: 6000`), activated, and then:

- `tsc -p tsconfig.test.json` compiled it — **exit 0**, so the generated TypeScript is valid;
- an import probe asserted `checkPendingConsistency(probe) === []` (the gate accepts the activation),
  `savingsHousingYoungMaxAge === 200`, and the lookup returned **84 / 94 / 109 / 68** for 2 000 /
  3 000 / 4 000 / 5 000 € — each value matching the synthetic table by hand;
- the same probe asserted the **shipped** package is untouched: `cic === undefined`, age `40`,
  `cicForMonthlySalary(SHIPPED, 3 000).status === 'NOT_IN_FORCE'`.

Both probe artifacts were then deleted; nothing synthetic remains in the repository.

**Publication-day runbook** (four commands, no editing by hand):

```powershell
python .tools/activate_8775.py --bands <published.json>
node .tools/node_modules/typescript/bin/tsc -p tsconfig.test.json
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test <spec files>
python .tools/activate_8775.py --check   # now expected to FAIL: the gate is live
```

**Verification:** **395 / 395 tests**, `tsc -p tsconfig.test.json` exit 0,
`tsc -p tsconfig.render.json` exit 0, **55 files** syntax `ok` — unchanged, because the script and its
probe live outside the shipped packages.

## Phase 32 — the JSX layer enters type checking (and a shim that survives installs)

**Two defects found by auditing Phase 31 instead of trusting it.**

**1. The renderer tests were never type-checked.** `tsconfig.test.json` lists `apps/mobile` files
individually and never included `src/components/*.tsx`, `test/render.spec.ts` or a `jsx` setting.
The `tsc` exit 0 reported in Phase 31 was therefore **true and irrelevant** to those files — the
compiler had not opened them. A new `tsconfig.render.json` (extends the test config, adds
`"jsx": "react-jsx"`, includes the two components, their two policy modules and the renderer spec)
immediately produced three real errors, one of them substantive:

```
apps/mobile/test/render.spec.ts(220,9): error TS2769
  Type '{ kind: "SIGN_IN"; }' is not assignable to type 'AuthPrompt | undefined'.
    Property 'reason' is missing ... required in type '{ kind: "SIGN_IN"; reason: "TOO_MANY_FAILURES" }'
```

The discarded-session test had been passing at runtime while asserting an **impossible** prompt: the
component only branches on `prompt.kind`, so a `SIGN_IN` without its `reason` rendered fine. The
fixture is now `{ kind: 'SIGN_IN', reason: 'TOO_MANY_FAILURES' }`, and the test additionally pins the
rendered `Sign in again` heading rather than counting buttons alone. `react-native` needed types for
this to work at all — `.tools/types/react-native.d.ts` declares the five primitives and
`StyleSheet` for the shim only, and is included by `tsconfig.render.json` alone.

**2. The shim was inside `node_modules`, so an install deleted it.** Installing `@types/react`
pruned `.tools/node_modules/react-native` as an extraneous package and the renderer suite failed with
`Cannot find module 'react-native'` — a green suite turning red because of an unrelated install. The
shim now lives in `.tools/rn-shim/index.js` and is wired through `tsconfig.test.json`:

```json
"paths": { "react-native": [".tools/rn-shim/index.js"] }
```

`tsx` resolves tsconfig paths at runtime, so the renderer tests keep working and no future install
can remove the file. The tracker line in Phase 30/31 that placed the shim in `node_modules` was
corrected rather than left to rot.

**Verification:** **395 / 395 tests**, `tsc -p tsconfig.test.json` **exit 0**,
`tsc -p tsconfig.render.json` **exit 0** (new — the JSX layer is now genuinely type-checked),
**55 files** syntax `ok`.

## Phase 31 — the renderers are mounted, not just transpiled

**Gap targeted.** Phases 27–29 shipped two components with the honest label *“The React Native
build was not run”*. That label was accurate but coarse: it also hid the fact that the components
had **never been executed at all** — a JSX typo, a wrong prop name or an unreachable branch would
have passed the whole suite. Transpiling proves syntax; it does not prove that `props.onRetry`
exists on the object React receives.

**What changed.** `react@18.3.1` and `react-test-renderer@18.3.1` were installed into the scratch
toolchain, and `react-native` is provided by a **primitive shim** (`.tools/rn-shim`, reached through a tsconfig
path mapping — see Phase 32 for why it is not in `node_modules`) that maps
`View` / `Text` / `TouchableOpacity` / `Pressable` / `ScrollView` to host components and passes
`StyleSheet.create` through unchanged. `apps/mobile/test/render.spec.ts` (11 tests) then mounts both
components with real React and walks the resulting element tree.

| Test | What it pins |
|---|---|
| banner hidden | `deriveOfflineStatus` says not visible → the component returns `null`, not an empty box |
| offline copy | title and detail come from the policy layer, and `View`/`Text` are actually emitted |
| retry button | present **only** with a handler *and* a level other than `ONLINE`; absent otherwise |
| pinned status | `statusOverride: STALE` renders exactly `['Data may be outdated', 'Last sync was long ago.', 'Retry']` and applies `#1e3a8a` |
| accessibility | the root carries `accessibilityRole="alert"` |
| lock, biometrics | two buttons, both wired; no callback fires on render |
| lock, not enrolled | the biometric button is **not rendered**, and the copy names the real reason |
| lock, locked out | the countdown number reaches the screen |
| lock, discarded session | **one** button only — sign-in — so a locked-out user cannot retry by tapping |
| lock, no override | the screen derives its own prompt from `app-lock.ts` |
| lock, disabled | still renders a coherent screen rather than throwing |

**What this does and does not prove.** Proven: the components mount, read their props, take the
intended branches, and render the exact text the policy produced. Not proven: layout, styling,
gestures, the biometric sensor, the device passcode prompt, navigation — there is no NativeModule
and no build. The header comments on both files were rewritten from *“UNVERIFIED — transpile-checked
only”* to *“PARTLY VERIFIED — mounted in tests, never rendered on a device”*, because the old text
had become untrue.

**Verification (as originally recorded):** 395 / 395 tests, `tsc -p tsconfig.test.json` exit 0.
**Correction — see Phase 32:** that `tsc` run did **not** cover these files. `apps/mobile/**` is absent
from `tsconfig.test.json`, so the renderer spec and both components were outside type checking; the
shim also lived inside `.tools/node_modules`, where `npm install` prunes it.
**Still true:** no React Native build was run; nothing here has touched a device.

## Phase 30 — the pending-measure gate becomes executable

**Gap found while auditing R6/R7.** The tracker claimed “a test proves the activation”. It did not.
`pendingMeasures` had **zero** references in any spec, `cic` had **no consumer anywhere** in
`packages/tax-engine`, and the gate existed only as a comment plus an optional field. Worse, the
natural way to read the current API — `cicForSalary()` returning `0` — conflates *“no credit by
law”* with *“a credit worth nothing”*. Both are the same number and different facts.

So the last truthfully-finishable piece of R6/R7 is not the numbers (blocked on projet de loi 8775)
but the **mechanism around them**, which is law-independent:

| New | What it does |
|---|---|
| `src/pending.ts` → `pendingMeasureStatus()` | `IN_FORCE` / `NOT_IN_FORCE` / `UNKNOWN` for a given measure id, from the package itself |
| `cicForMonthlySalary()` | Returns `status: 'NOT_IN_FORCE'` — **never a silent `0`** — while the table is unpublished, with a note naming the tax year and the measure status |
| `cicFromTable()` | Pure band lookup (`salary × slope + offset`, last band `topAmount` up to `topUpTo`), monthly amount rounded **up** to the cent, floored at zero, and banded out-of-range salaries reported rather than guessed |
| `checkPendingConsistency()` | Reports contradictions: a measure `IN_FORCE` with no data; a `cic` table present while the measure is `NOT_IN_FORCE`; `EPARGNE_LOGEMENT_8775` in force while `savingsHousingYoungMaxAge` is still 40; a measure with no source or activation text |
| `assertPendingConsistency()` | Throwing form, for package construction |

**What this fixes.** A maintainer who flips `CIC_2026` to `IN_FORCE` without pasting the table now
gets a named violation instead of a quietly-zero credit; one who pastes a table but forgets the
flag gets the mirror violation. Both are caught by the suite before the package ships.

**The activation dry-run.** One test builds a *synthetic* table on top of a deep clone of
`RULES_2026`, flips both measures, sets `savingsHousingYoungMaxAge: 200`, and asserts the package
is coherent and the lookup works (60 €/month at 3 000 €, 70 € at 4 000 €, 10 € at the top band,
0 € above it). That exercises the exact four-edit activation in the runbook **without writing a
single unpublished figure into shipped data** — `RULES_2026` itself is untouched and still carries
no `cic`.

**Verification:** **384 / 384 tests** (373 + 11 new in `packages/tax-engine/test/pending.spec.ts`),
`tsc -p tsconfig.test.json` exit 0, **54 files** syntax `ok` (the checker's curated list extended by
the two new files).
**Still open:** R6/R7 themselves — the published 2026 CIC bands and the 8775 entry into force.

## Phase 29 — MOB-11: banner and lock components (renderers only)

Both components are deliberately thin: every decision already lives in a tested pure module, so
these files only map a level or a prompt to colours and buttons. That is also why they are the
only mobile files marked **unverified**.

| Component | Reuses | Behaviour |
|---|---|---|
| `apps/mobile/src/components/OfflineBanner.tsx` | `deriveOfflineStatus()` (Phase 25) | returns `null` when the status is not visible; colours by level; optional **Retry** button when the queue has work; `accessibilityRole="alert"` so a screen reader announces the change |
| `apps/mobile/src/components/AppLockScreen.tsx` | `nextAuthPrompt()` (Phase 27) | renders `UNLOCK_BIOMETRIC` / `UNLOCK_PASSCODE` / `WAIT` (with countdown) / `SIGN_IN` / `NONE`; a discarded session shows **only** the sign-in button, so a locked-out user cannot retry by tapping; passcode text names the actual reason (`NO_BIOMETRICS`, `NOT_ENROLLED`, biometric failure) |
| Header marker | both files | `// UNVERIFIED — no React Native runtime in this workspace.` with the exact boundary stated (transpile-checked only; no sensor, no navigation) |
| Tests | — | none by design: there is no logic to test that is not already covered by Phases 25 and 27. The components are covered by the transpile check only |

**Why no new tests here.** Writing tests for JSX that cannot render would assert on mocks of
React Native internals, which proves the mock, not the screen. The defensible split is: policy is
tested (54 tests across Phases 25 and 27), rendering is marked unverified.

**Verification status:** 373 / 373 tests pass (unchanged — these files add no testable logic),
`tsc -p tsconfig.test.json` exit 0, **52 files** syntax `ok` (the two new components included).
**The React Native build was not run**; neither component has been rendered.

## Phase 28 — MOB-10: save-to-device and share policy

A file leaving the app carries three decisions: its name, its declared type, and whether the
platform shares it or writes it. All three are pure transforms.

| Piece | Where | Behaviour |
|---|---|---|
| Name safety | `sanitizeFileName()` | **basename first** (`../../etc/passwd` → `passwd`), then control chars removed, `<>:"/\|?*` replaced, leading dots/spaces stripped, reserved device names (`CON`, `LPT1`, …) prefixed with `_`, extension reduced to alphanumerics and lowercased, total capped at 120 characters |
| Descriptor | `describeExport()` | canonical MIME + Apple UTI per kind (`application/pdf` / `com.adobe.pdf`, `image/jpeg` / `public.jpeg`); a `report.pdf.exe` becomes `report.pdf.pdf`, so the declared type and the extension cannot disagree |
| MIME mapping | `mimeForKind()` / `extensionForMime()` | one source of truth; unknown types map to `bin` rather than guessing |
| Route | `chooseShareRoute()` | share sheet when available, direct write when not, and **reject above 25 MB** instead of attempting a share that both platforms fail on |
| Message | `shareRejectionMessage()` | states the actual size, the limit and the alternative (web app) |
| Tests | `apps/mobile/test/file-export.spec.ts` | 20 tests: traversal, separators, control chars, reserved names, leading dots, extension case, empty fallback, length cap; descriptors for PDF/JPEG, double-extension, hostile base name, hash sanitisation, MIME round-trip; share-sheet vs write, the cap boundary, negative and `NaN` sizes, custom cap, rejection wording |

**Bug found by the tests:** the first implementation split the extension *before* removing path
separators, so `../../etc/passwd` was read as stem `..` plus extension `etc/passwd` and came out
as `_.etcpasswd`. The function now takes the basename first, which is both safer and easier to
reason about — and the test asserts the result contains neither `/` nor `..`.

**Verification status:** 373 / 373 tests pass, `tsc -p tsconfig.test.json` exit 0, 50 files syntax
`ok`. **The React Native build was not run** — no `react-native`/`expo` dependencies here — so
`expo-sharing` / `expo-file-system` are not invoked and no file is actually written; the naming,
typing and routing rules are proven.

## Phase 27 — MOB-9: app-lock policy (thresholds, re-auth, fallback)

The biometric prompt itself is one line of platform API; the policy around it is where the
mistakes live. All of it is pure and proven here.

| Rule | Where | Behaviour |
|---|---|---|
| Relock on resume | `shouldLock()` | a **fresh session** is locked; returning within the 60 s grace period is not; beyond it the app relocks; an active lock-out wins over every other reason |
| Penalty ladder | `lockoutForFailures()` | first 2 failures free (typos happen), then 30 s · 60 s · 2 min … capped at 15 min |
| Escalation | `recordFailure()` | 10 failures force a discarded session (`mustSignOut`), so a stolen phone cannot be brute-forced indefinitely |
| Recovery | `recordSuccess()` | clears the counter, the window and the background timestamp in one place |
| Fallback | `availableMethods()` / `nextAuthPrompt()` | biometrics offered only when the hardware exists **and** something is enrolled; otherwise the passcode with an explicit reason (`NO_BIOMETRICS`, `NOT_ENROLLED`, `BIOMETRIC_FAILED`); during a lock-out the prompt is `WAIT` with the remaining seconds |
| Enablement guard | `canEnableLock()` | refuses to switch the lock on when the device has no passcode — otherwise the user believes the app is protected while anyone holding the unlocked phone can open it |
| Tests | `apps/mobile/test/app-lock.spec.ts` | 17 tests: disabled/fresh/grace/expired/locked-out decisions, free attempts, doubling, cap, recorded window, ten-failure sign-out, success reset, method fallback for both causes, biometric-failure hint, `WAIT` countdown, no-prompt path, enablement refusal |

**No third method on purpose.** A custom PIN would be a second secret the user can forget and a
second one an attacker can attack; the device passcode is the documented fallback and the only one.

**Verification status:** 353 / 353 tests pass, `tsc -p tsconfig.test.json` exit 0, 50 files syntax
`ok`. **The React Native build was not run** — no `react-native`/`expo` dependencies here — so
`expo-local-authentication` is not called and the lock screen is not rendered; the decisions are
proven, the sensor is not.

## Phase 26 — MOB-8: deep-link parsing treated as untrusted input

A deep link decides which workspace the app opens, and its workspace id ends up inside
`/api/workspaces/<id>/…`. Parsing it is therefore a security boundary, not a routing detail.

| Risk | Guard |
|---|---|
| Scheme confusion (`javascript:`, `data:`, `file:`) | only `luxtax:` and `https:` are accepted; anything else returns `UNSUPPORTED_SCHEME` |
| Authority spoofing (`luxtax://user@evil/…`) | any username/password on the app scheme returns `INVALID_AUTHORITY` |
| Untrusted universal link | `https` must be exactly `app.luxtax.lu`, otherwise `UNTRUSTED_HOST` |
| Path injection into the API | the workspace id must match a UUID; `..%2F..%2Fadmin`, `abc` and near-misses are rejected before use |
| Token abuse | invite and reset tokens must be 16–128 chars of `[A-Za-z0-9_-]` |
| Oversized input | 2 048-character cap returns `TOO_LONG` |
| Unknown route | returns `UNKNOWN_ROUTE` rather than falling back to a default screen and hiding the bug |

| Piece | Where | Behaviour |
|---|---|---|
| Parser | `apps/mobile/src/lib/deep-links.ts` `parseDeepLink()` | typed result `{ ok:true, route }` or `{ ok:false, reason }`; routes: workspace estimate/documents/tasks, invite, reset-password, notifications, home |
| Builder | `buildDeepLink()` | round-trips every route, used by share sheets and tests |
| Auth gate | `requiresAuth()` | workspace routes are held as `pending` until sign-in instead of dropping the user on the home tab |
| Tests | `apps/mobile/test/deep-links.spec.ts` | 15 tests: all routes, universal host, foreign host, three dangerous schemes, credential-carrying link, five malformed ids, case-insensitive UUID, invite/reset tokens, short tokens, home/notifications, empty/whitespace/oversized, unknown routes, scheme case + trailing slash, build↔parse round-trip, auth gate |

**Bug found by the tests:** with a custom scheme, `new URL('luxtax://notifications')` puts
`notifications` in the **host**, not the path — so the first version parsed that link as `HOME`.
The parser now folds the host back into the segment list for `luxtax:` URLs, making the route
grammar identical for both schemes. This is exactly the kind of defect that only shows up when a
parser is actually exercised.

**Verification status:** 336 / 336 tests pass, `tsc -p tsconfig.test.json` exit 0, 50 files syntax
`ok`. **The React Native build was not run** — no `react-native`/`expo` dependencies here — so the
`expo-linking` subscription and the navigation calls that consume these routes are unverified;
the parsing and the auth gate are proven.

## Phase 25 — MOB-7: push registration state machine and offline banner

Both are policy problems rather than UI problems, so both are expressed as pure functions and
proven here. No React Native runtime is required to know what the app *should* do.

| Piece | Where | Behaviour |
|---|---|---|
| Push state machine | `apps/mobile/src/lib/push-and-status.ts` `nextPushAction()` | returns exactly **one** next step: `REQUEST_PERMISSION` → `FETCH_TOKEN` → `REGISTER` (only when the device token differs from the server copy) → `NONE`; `DENIED` yields `SHOW_DISABLED_HINT` instead of re-prompting |
| Deregistration | same | turning notifications off with a known server token returns `DEREGISTER`, so the server stops sending to a device the user muted |
| Payload | `buildRegistrationPayload()` | normalises an unknown platform to `'unknown'` and omits `appVersion` when absent |
| Retry | `shouldRetryRegistration()` | retries transport, `408`, `429`, `5xx`; a `400`/`401` is a client problem and is not retried |
| Banner | `deriveOfflineStatus()` | priority: offline → pending queue → stale (> 24 h since sync) → hidden; wording adapts to singular/plural and to whether the queue is empty |
| Reconnect rule | `shouldReplayOnReconnect()` | replays only on an actual offline → online transition **and** a non-empty queue, so connectivity callbacks cannot trigger a replay storm |
| Tests | `apps/mobile/test/push-and-status.spec.ts` | 15 tests: the whole permission → token → register path, denied hint, token-differs rule, deregistration, payload normalisation, retry matrix; offline-over-pending priority, empty-queue wording, singular/plural, pending state, hidden state, stale threshold, never-synced, replay transition |

**Why one action at a time:** returning a single step makes it impossible to request a permission
and register a token in the same pass — the usual source of duplicate permission prompts and of
tokens registered before consent.

**Verification status:** 321 / 321 tests pass, `tsc -p tsconfig.test.json` exit 0, 50 files syntax
`ok`. **The React Native build was not run** — no `react-native`/`expo` dependencies here — so the
actual `expo-notifications` permission call, the device token and the NetInfo subscription are not
exercised; only the decisions around them are.

## Phase 24 — MOB-6: authenticated package download with a real retry policy

Phase 23 built the URL and the file name; nothing performed the request. This phase adds the
flow, with the failure taxonomy spelled out — the interesting part is deciding what must **not**
be retried.

| Piece | Where | Behaviour |
|---|---|---|
| Flow | `apps/mobile/src/lib/package-download.ts` `downloadAnnexes()` | refuses without a token (no network call), sends `Authorization: Bearer …` + `Accept: application/pdf`, verifies the response is really a PDF before handing bytes to `save` |
| Permanent failures | same | `400/422` → `NO_PACKAGE` (never generated); `401` → `UNAUTHORIZED` (a retry would replay a dead token); `403` / `404` → `FORBIDDEN` / `NOT_FOUND`. **None are retried** |
| Transient failures | same | `408`, `429`, `5xx` and network errors are retried with exponential backoff (500 ms · 1 s · 2 s), `maxAttempts` default 3 |
| `Retry-After` | `parseRetryAfter()` | seconds or HTTP-date; when present it overrides the exponential delay |
| Content guard | `downloadAnnexes()` | a `200` whose `Content-Type` is not `application/pdf` → `INVALID_CONTENT`, and `save` is never called — an HTML error page cannot be written to disk as a PDF |
| Tests | `apps/mobile/test/package-download.spec.ts` | 13 tests: no token (and no network), header/URL shape, saved filename, 400 not retried, 401 hard stop, 404 not retried, 500→success on attempt 2, exhaustion after 3 attempts, 429 honouring `Retry-After`, network retry → `NETWORK`, HTML 200 rejected, retry classification + backoff table, `Retry-After` parsing |

**Design point:** the dangerous default is "retry everything". A 401 retried three times looks like
a brute-force attempt in the logs and delays the re-authentication the user actually needs; a 400
retried forever hides that the package was never generated. The classifier is therefore an
allow-list of retryable statuses.

**Verification status:** 306 / 306 tests pass, `tsc -p tsconfig.test.json` exit 0, 50 files syntax
`ok`. **The React Native build was not run** — no `react-native`/`expo` dependencies here — and the
flow is not yet bound to a device save API (`expo-file-system`/share sheet); `save` is injected for
that reason.

## Phase 23 — MOB-5: private-draft redaction and package download

Two mobile concerns that are pure functions, so they can be proven without an emulator.

| Piece | Where | Behaviour |
|---|---|---|
| Visibility rule | `apps/mobile/src/lib/privacy.ts` `canSeeAmount()` | owner sees their own data; `isSharedWithHousehold` and `PROPOSED_FOR_RETURN` / `INCLUDED_FOR_RETURN` are household-visible; `PRIVATE_DRAFT`, `SHARED_FOR_DISCUSSION`, `ARCHIVED`, unknown or missing metadata are **not** |
| Masking | `redactFact()` / `redactFacts()` | replaces `fieldValue` and `amount` with `••••`, keeps `description` and field name — knowing a certificate exists is not the leak, the amount is; returns a `redactedCount` for the UI |
| Documents screen | `app/(tabs)/documents.tsx` | loads `getMe()`, resolves each fact's source document, and renders `••••` instead of the amount when the viewer may not see it |
| Download URL | `annexPdfUrl(baseUrl, workspaceId)` | mirrors `GET /api/workspaces/:id/filing-package/annexes.pdf`, normalises trailing slashes, URL-encodes the id |
| Filename | `annexPdfFileName(taxYear, hashPrefix)` | strips everything outside `[A-Za-z0-9]` and truncates to 8 chars, so a hostile hash cannot inject `../` or `;` |
| Tests | `apps/mobile/test/privacy.spec.ts` | 14 tests: owner visibility, other-member masking, the two household visibilities, `SHARED_FOR_DISCUSSION` not enough, explicit share flag, missing metadata, signed-out viewer, description preserved, both value fields masked, list counting; URL joining/encoding and filename safety |

**Deny by default.** The rule is written so that an unknown visibility, a missing owner or a
missing document resolves to “not visible”. A new visibility value added later therefore hides
amounts until someone deliberately allows it — the opposite of an allow-list that silently leaks.

**Verification status:** 293 / 293 tests pass, `tsc -p tsconfig.test.json` exit 0, 50 files syntax
`ok`. **The React Native build was not run** — no `react-native`/`expo` dependencies in this
workspace — so the documents screen rendering is verified only by transpile and by the pure
functions it calls.

## Phase 22 — MOB-4: the queue is wired into the three screens

Phase 21 shipped tested queue logic that nothing called. This phase connects it: queue-first
writes and a replay on every natural resume point.

| Piece | Where | Behaviour |
|---|---|---|
| Runtime | `apps/mobile/src/lib/queue-runtime.ts` | singleton `getOfflineQueue()`, `enqueueOperation()`, `createApiHandlers(client)`, `replayQueue(api)`; storage tries AsyncStorage via an optional `require` and falls back to memory, so the module loads without React Native |
| Retry classifier | `isNetworkError()` | queues only transport failures (`network`, `fetch`, `timeout`, `ECONN`, `socket`, or no message at all). A validation error, a 401 or "Workspace not found" is shown to the user and **never** replayed |
| Upload | `DocumentCameraScanner.tsx` | on a transport failure the scan is queued with its base64 payload and `dedupeKey: upload:<ws>:<fileName>`; the modal closes with "Saved offline" instead of losing the capture. Opening the scanner also drains the queue |
| Calculation / approval | `estimate.tsx` | queued with `calc:<ws>` / `approve:<ws>:<version>` dedupe keys; `loadData()` calls `replayQueue()` before rendering figures |
| Documents | `documents.tsx` | refresh replays the queue before re-reading documents and facts, so a queued scan appears once it lands |
| Ordering fix | `offline-queue.ts` | added a monotonic `seq` and sorting by `(enqueuedAt, seq, id)` — two operations enqueued in the same millisecond previously fell back to alphabetical id order, which reordered upload→calculate→approve. Caught by the replay test |
| Tests | `apps/mobile/test/queue-runtime.spec.ts` | 7 tests: transport-vs-validation classification, ordered replay, stop-at-network-failure, continue-after-validation-failure, skip-without-handler, dead-letter counting, singleton replacement |

**Verification status — the honest part:** 279 / 279 tests pass, `tsc -p tsconfig.test.json` exit 0,
50 files syntax `ok`. The queue logic and its wiring points are covered by unit tests and transpile
checks, but **the React Native build was not run** — `apps/mobile` has no installed
`react-native`/`expo` dependencies here. Screen rendering, the scanner modal and the offline banner
copy are therefore **unverified on a device**; only the logic is proven.

## Phase 21 — MOB-3: offline queue for upload / calculation / approval

**Gap.** The three mobile writes failed outright without connectivity, and a retry could
double-submit an upload because nothing tracked the intent.

| Piece | Where | Behaviour |
|---|---|---|
| Pure queue | `apps/mobile/src/lib/offline-queue.ts` | immutable operations + explicit `now`; `enqueue`, `dueOperations`, `markSucceeded`, `markFailed`, `summarise`, `backoffDelay` |
| Dedupe | `enqueue` | a repeated `dedupeKey` (e.g. the same file) returns `{ ok:false, reason:'DUPLICATE' }` instead of queuing twice |
| Overflow | `enqueue` | `{ ok:false, reason:'FULL' }` at `maxItems` (50) — reported, never silently dropped |
| Backoff | `markFailed` | 5 s · 10 s · 20 s · 40 s … capped at 5 min; `nextAttemptAt` is honoured by `dueOperations` |
| Dead letter | `markFailed` | after `maxAttempts` (5) the operation leaves the active queue and is returned as `deadLettered`, with the last error, for the UI to surface |
| Persistence | `OfflineQueue` + `QueueStorage` port | loads once, saves after every mutation; storage failures propagate rather than losing the queue silently |
| Id safety | every operation | stores `workspaceId`, never a household id — the MOB-1 defect cannot reappear here |
| Tests | `apps/mobile/test/offline-queue.spec.ts` | 11 tests: FIFO order, due filtering, dedupe, overflow, success removal, backoff timing (not due at 4 999 ms, due at 5 000 ms), doubling, cap, dead-letter after max attempts, summary counts/age, workspace-id invariant, persistence round-trip, dead-letter recording |

**Design choice:** storage is a port rather than an import of AsyncStorage/SQLite. That keeps
the policy pure and testable today, and lets the React Native layer choose the backing store
(AsyncStorage for small queues, SQLite when attachments grow) without touching the logic.

**Verification status:** 272 / 272 tests pass, `tsc` exit 0, 50 files syntax `ok`. The queue is
**not yet wired into the mobile screens** — hooking it into `documents.tsx`, `estimate.tsx` and
the scanner needs a React Native build to verify, so the module ships as tested logic with the
integration point documented rather than as unverified screen code.

## Phase 20 — MOB-2: the questionnaire flow called a method that does not exist

**Defect.** `app/(tabs)/tasks.tsx` called `mobileApiClient.submitTaxProfile(householdId, 2025, {...})`.
No such method exists on `LuxTaxApiClient`, and the payload was an obsolete shape
(`taxResidence`, `hasChildren`, `dependantsCount`, `hasRentalIncome`, `hasInsuranceDeductions`) that
`QuestionnaireAnswersDto` no longer accepts. The "resolve questionnaire" action could never work.

| Piece | Change |
|---|---|
| Call | `mobileApiClient.saveQuestionnaire(workspaceId, body)` — the real, workspace-scoped `PUT /api/workspaces/:id/questionnaire` |
| Payload | rewritten to the current `QuestionnaireAnswersDto`: `maritalStatus`, `hasEmploymentIncome`, `hasPensionIncome`, `hasPrimaryResidenceMortgage`, `hasLifeInsuranceOrPensionPlan`, `hasDonations`, `childrenCount`, `hasFreelanceIncome` |
| Id | resolves `workspaceId` once via `resolveWorkspace(..., 2025, householdId)`; readiness stays household-scoped, the questionnaire uses the workspace id — the two ids never cross over |
| Errors | checks `res.error` and alerts instead of reporting success unconditionally; the spinner is cleared before returning |
| Guard | the action refuses with a message when no workspace exists, rather than silently doing nothing |

**Regression test — the important part.** Because the mobile app cannot be typechecked here
(no React Native dependencies), this class of bug is invisible to `tsc`. `apps/mobile/test/client-methods.spec.ts`
now scans every mobile source for `mobileApiClient.<method>(` and asserts the method exists on
`LuxTaxApiClient`, plus four targeted assertions: the scanner uploads with `workspaceId`,
`calculateTax`/`approveReturn` receive `workspace.id`, and the questionnaire goes through
`saveQuestionnaire`. It is a static check — no RN build, no emulator.

Running that scan over the whole mobile app confirmed **no other phantom calls remain** (16 methods
used, all present).

**Verification status:** 261 / 261 tests pass, `tsc` exit 0, 50 files syntax `ok`. The React Native
build is still **not run**, so rendering and navigation remain unverified.

## Phase 19 — MOB-1: mobile flows used household ids where workspace ids were required

**Defect.** Three mobile flows sent a *household* id to workspace-scoped endpoints:

| Flow | Was | Now |
|---|---|---|
| Upload (`DocumentCameraScanner`) | `uploadDocument(householdId, taxYear, body)` — wrong id **and** wrong arity | `uploadDocument(workspaceId, body)`, prop renamed to `workspaceId` |
| Calculation (`estimate.tsx`) | `calculateTax(householdId, 2025)` | `calculateTax(workspace.id)` |
| Approval (`estimate.tsx`) | `approveReturn(householdId, 2025)` | `approveReturn(workspace.id)` |

A household id in a workspace route resolves to the wrong resource or 404s, so the mobile
app could not upload, calculate or approve at all.

| Piece | Where | Behaviour |
|---|---|---|
| Resolver | `apps/mobile/src/lib/workspace.ts` | `resolveWorkspace(client, taxYear, householdId?)` → `{ ok, workspaceId }` or `{ ok:false, reason: NO_HOUSEHOLD / NO_WORKSPACE / ERROR }`; never throws, so a screen can render a message instead of crashing |
| Estimate screen | `app/(tabs)/estimate.tsx` | resolves once in `loadData`, guards every action on `workspace.id`, and now uses the current DTO field names (`balancePayableOrRefund`, `grossIncome`, `solidaritySurchargeAmount`, `finalTaxLiability`, `taxWithheldAtSource`, `provenance[].outputAmount`) — the screen still referenced pre-2025 names |
| Documents screen | `app/(tabs)/documents.tsx` | resolves the workspace once; removed the dead `householdId` state |
| Scanner | `src/components/DocumentCameraScanner.tsx` | prop renamed `householdId` → `workspaceId`, so the wrong id can no longer be passed |
| Tests | `apps/mobile/test/workspace.spec.ts` | 7 tests: first-household resolution, explicit household, `NO_HOUSEHOLD`, `NO_WORKSPACE`, thrown client error, resolved id ≠ household id, id guard |

**Verification status — read this before trusting it:** the resolver is covered by real unit
tests (7 passing), and all four touched mobile files are transpile-checked for syntax. **The
React Native build was not run** — `apps/mobile` has no installed `react-native`/`expo`
dependencies here, so screen rendering, navigation and the camera flow are **unverified**.
`apps/mobile/src/lib/workspace.ts` intentionally has no `@luxtax/api-client` import so it stays
dependency-free and testable.

**Also spotted, not fixed (outside MOB-1):** `app/(tabs)/tasks.tsx` calls
`mobileApiClient.submitTaxProfile(...)`, which does not exist on the client — that flow cannot
work and belongs to the remaining MOB items.

## Phase 18 — API-8: rate limiting and TOTP MFA

**Gap.** The API had neither throttling nor a second factor: a single client could exhaust the
process, and a stolen password was sufficient.

| Piece | Where | Behaviour |
|---|---|---|
| Token bucket | `apps/api/src/common/rate-limit/token-bucket.ts` | capacity + refill per second, clock-injected `check(key, nowMs)`, refused calls keep their fractional state so hammering cannot reset the bucket, `evictIfNeeded()` bounds the key map |
| Guard | `apps/api/src/common/guards/rate-limit.guard.ts` | two buckets per request — `ip:<addr>` and `user:<id>` — first refusal wins, throws **429** with `Retry-After` and `X-RateLimit-Remaining` |
| Wiring | `app.module.ts` `APP_GUARD` | inert unless `RATE_LIMIT_ENABLED=true`; capacities/rates overridable via `RATE_LIMIT_*` |
| TOTP | `apps/api/src/modules/auth/totp.ts` | base32, RFC 4226 HOTP, RFC 6238 TOTP (SHA-1, 6 digits, 30 s), ±1 step window, constant-time compare, `otpauth://` URL |
| Recovery codes | same | 10 codes, 4×4 groups from an alphabet without `I O 0 1`, stored as HMAC-SHA-256, constant-time lookup returning the index so a used code can be dropped |
| Flag | `isMfaEnabled()` | model `MFA_ENABLED` must be literally `true`; anything else leaves behaviour unchanged |
| Env | `.env.example` | both flags documented with their defaults |
| Tests | `apps/api/test/rate-limit.spec.ts` (9) · `apps/api/test/mfa-totp.spec.ts` (13) | burst/refusal, refill + Retry-After maths, key independence, anti-reset under hammering, non-negative remaining, eviction bound, invalid config; **RFC 4226 Appendix D** (10 HOTP vectors) and **RFC 6238 Appendix B** (6 TOTP vectors), skew window, wrong secret, secret shape, otpauth parameters, recovery-code alphabet/uniqueness/hashing/consumption, flag parsing |

**Both features ship off by default.** A limiter with fixed numbers would break existing
integrations, and MFA changes the login flow; neither should activate on deploy without an
operator decision. The code paths are complete and tested, so enabling is an env change.

**RFC vectors, not round-trips:** asserting HOTP/TOTP against the published vectors is the only
way to prove the implementation is *interoperable* with authenticator apps rather than merely
self-consistent.

**Not verified here:** Nest boot and the e2e suites — `@nestjs/*` and the generated Prisma client
are absent, so the guard's runtime behaviour is covered by its pure logic plus transpile only.

## Phase 17 — API-10: audit trail is immutable and classified

**Defect.** `audit_events` was append-only by convention. Any process with database access
could rewrite a description or delete a row, and nothing linked one event to the next, so
tampering left no trace. Event types were also a flat enum with no grouping.

| Piece | Where | Behaviour |
|---|---|---|
| Hash chain | `apps/api/src/modules/audit/audit-chain.ts` | `hashAuditEvent(prevHash, event)` over a canonical form including `id`, `createdAt` and the previous hash; `verifyAuditChain()` reports `brokenAt` + reason |
| Taxonomy | same, `auditCategory()` | prefix map to `AUTH / HOUSEHOLD / DOCUMENT / FACT / CALCULATION / FILING / ADMIN`; unknown types fall back to `ADMIN` rather than throwing |
| Service | `audit.service.ts` | reads the last hashed event for the household, then writes `prevHash` + `hash` with the row |
| Schema | `AuditEvent.prevHash` / `hash` + `@@index([householdId, hash])` | chain is per household — the tenant boundary a reviewer reads as one narrative |
| Migration | `20261109130000_add_audit_chain` | columns, index, **and a trigger** `audit_events_no_update_delete` that raises on UPDATE/DELETE |
| Tests | `apps/api/test/audit-chain.spec.ts` | 8 tests: valid chain, edited event, deleted event, re-ordered pair, prev-hash dependence, canonical key order, full taxonomy table, unknown fallback |

**Two layers, on purpose:** the trigger *prevents* modification at the database, the chain
*detects* it if the trigger is ever dropped or bypassed (restore, replication, manual DDL).
Neither alone is sufficient — a hash chain cannot stop a delete, and a trigger cannot prove
the surviving rows are the ones originally written.

**Verified on the database:** migration 8 applied, `audit_events."prevHash"`/`"hash"` present,
trigger `audit_events_no_update_delete` installed, `migrate diff` → `-- This is an empty
migration.` (no drift).

## Phase 16 — API-9: calculation history is persisted

**Defect.** `TaxYearWorkspace.calculationResult` held only the latest result, so every
recalculation replaced the previous figures. The path from a draft to the filed number could
not be audited, and a disputed figure had no trace.

| Piece | Where | Behaviour |
|---|---|---|
| Model | `CalculationSnapshot` (`calculation_snapshots`) | `workspaceId`, `taxYear`, `taxClass`, `rulePackageVersion`, `resultSha256`, `resultJson`, `createdById`, `createdAt`; cascade on workspace, index `(workspaceId, createdAt)` |
| Canonical hash | `calculation-history.ts` `canonicalJson()` / `hashCalculationResult()` | keys sorted recursively before hashing, so two identical results always hash the same; array order still matters |
| Summary | `summariseCalculation()` | tolerant extraction of `taxableIncome`, `finalTaxLiability`, `balancePayableOrRefund`, `calculatedAt` from a stored row |
| Service | `calculations.service.ts` | writes a snapshot immediately before the workspace update that stores the latest result — same request, so the two cannot diverge |
| Migration | `20261109120000_add_calculation_snapshots` | table + index + FK |
| Tests | `apps/api/test/calculation-history.spec.ts` | 7 tests: key-order independence, array order, amount change changes the hash, hex SHA-256 shape, summary extraction, partial/empty result, `undefined` dropped consistently |

**Why the hash:** the snapshot is the audit trail, and a stored JSON blob alone cannot prove
it was not edited later. `resultSha256` is a stable anchor computed over a canonical form —
the same technique used for the filing package (API-7), so both artifacts are verifiable the
same way.

**Verified on the database:** migration applied to the 55433 cluster — **7 migrations** in
`_prisma_migrations`, `calculation_snapshots` present, `migrate diff` → `-- This is an empty
migration.` (no drift).

## Phase 15 — API-7: filing-package hash is no longer overwritten

**Defect.** `generateFilingPackage` upserted the package and overwrote `packageSha256` on
every regeneration. The hash of the version actually filed — the only proof of *what* was
generated — was lost, and nothing recorded earlier generations.

| Piece | Where | Behaviour |
|---|---|---|
| Evidence index | `apps/api/src/modules/filing/filing-package-evidence.ts` | `appendPackageEvidence()` marks the previous entry `supersededAt` and appends the new one; capped at 50 generations, oldest first; tolerates `null`/malformed history |
| Immutability | same file, `assertPackageRegenerationAllowed()` | once a `FilingRecord` exists the package may not be regenerated — the message points to an amendment (new return version) |
| Integrity | `verifyPackageEvidence()` | case-insensitive SHA-256 comparison, used when reading a package back |
| Service | `filing.service.ts` | loads the filing record and the existing package before the upsert, throws 400 on a filed return, writes `historyJson` |
| Schema | `FilingPackage.historyJson Json @default("[]")` | append-only chain; the entry **without** `supersededAt` is the package in force |
| Migration | `20261109110000_add_filing_package_history` | `ADD COLUMN "historyJson" JSONB NOT NULL DEFAULT '[]'` |
| Tests | `apps/api/test/filing-package-evidence.spec.ts` | 7 tests: first entry, supersede-not-replace, exactly one current after 5 generations, 50-entry cap, filed-return refusal, hash integrity, null/malformed history |

**Why an append-only chain rather than a version table:** the package is derived data keyed by
`returnVersionId`, and the existing chain (approval → filing → assessment) already models
versions. A second table would duplicate that; the JSON index keeps the proof next to the
package and is written in the same transaction as the upsert.

**Verified on the database:** migration applied to the fresh 55433 cluster — 6 migrations in
`_prisma_migrations`, `filing_packages."historyJson"` present, `migrate diff` → `-- This is an
empty migration.` (no drift).

## Phase 14 — API-6 was already delivered; the two pending migrations were not

Before implementing API-6 (filing record + objection dates) the repository was inspected,
and the item is **already implemented** by the parallel track:

- `FilingRecord` model (`filing_records`), `FilingRoute` enum, one record per workspace,
  `returnVersionId` `@unique` so a correction needs an amendment rather than a second record
- `Assessment.receivedAt` / `objectionDeadline` / `followUpAt` / `isFinal`
- `recordFiling` + `getFilingRecord` in `filing.service.ts`, `createFilingRecordSchema`,
  `FilingRecordDto`, controller routes, and `apps/api/test/assessment-dates.spec.ts`

Re-implementing it would have duplicated and probably conflicted with that work. What *was*
missing is that two authored migrations had **never been applied** — the database was two
revisions behind the schema, so the new tables did not exist anywhere.

| Migration | Content |
|---|---|
| `20261108140000_add_notifications` | `notifications`, `notification_preferences` |
| `20261109100000_add_filing_record` | `filing_records` |

Applied to a **fresh** PostgreSQL 18.4 cluster (the original `.tools/pgdata` postmaster on
port 55432 began failing to fork children with Windows error 487 — shared-memory address
conflict — so a new cluster was initialised at `.tools/pgdata2`, port 55433, `shared_buffers`
reduced to 32 MB):

```
Applying migration `20261108000000_init`
Applying migration `20261108120000_add_fact_category_values`
Applying migration `20261108130000_add_filing_annexes`
Applying migration `20261108140000_add_notifications`
Applying migration `20261109100000_add_filing_record`
All migrations have been successfully applied.
```

Verification:

| Check | Result |
|---|---|
| `_prisma_migrations` | 5 rows, in order |
| Tables in `public` | **26** (was 23) |
| New tables present | `filing_records`, `notifications`, `notification_preferences` |
| Assessment columns | `receivedAt`, `objectionDeadline`, `isFinal` present |
| `migrate diff --from-url … --to-schema-datamodel …` | `-- This is an empty migration.` → **no drift** |

The temporary `schema.deploy.prisma` used to supply `DATABASE_URL` (the committed
`schema.prisma` gets its URL from `prisma.config.ts`) was deleted afterwards; the cluster was
stopped, data kept at `.tools/pgdata2`.

**Consequence for the open table:** API-6 should not be listed as open — it was delivered
before this pass. The migration gap it left behind is what this phase closes.

## Phase 13 — LEG-9: no filing package from a preview package

**Defect.** A 2028 workspace could still generate a filing package. The 2028
("classe U") package is a *preview*: its transition rules are unpublished and the
25-year couple phase-out is not implemented. Emitting a package from it would hand the
taxpayer values to copy into a real return.

| Piece | Where | Behaviour |
|---|---|---|
| Guard | `apps/api/src/modules/filing/filing-year-guard.ts` | pure functions `filingYearVerdict(year)` / `assertFilingYearAllowed(year)`; refuses when the package carries `singleClass`, and lists supported years for an unknown one |
| Wiring | `filing.service.ts` `generateFilingPackage` | runs after the workspace load and before any package work; maps the dedicated error to HTTP 400 |
| Error type | `FilingPackageNotAllowedError` | distinct class so callers can branch without string matching |
| Tests | `apps/api/test/filing-year-guard.spec.ts` | 5 tests: 2025/2026 allowed, 2028 refused with reason, dedicated error (message names `2028.0.0-preview`), unsupported year lists `2025, 2026, 2028`, and **allowed ⇔ `!singleClass`** so the guard tracks package metadata rather than a hard-coded list |

Design note: the decision is derived from the rule package's own `singleClass` flag, not from
`taxYear >= 2028`. If a future package becomes a real, in-force single-class year, the guard
opens automatically — and if a preview flag is ever added to 2027, it closes without a code change.

## Phase 12 — prime jeune salarié (LEG-10, Art. 115 n° 13d)

LEG-10 was recorded as “not selected” by an earlier pass and left unimplemented. It is
the only remaining audit item whose law is **already published and in force**, so it was
taken instead of idling on the publication block.

| Piece | Where |
|---|---|
| Rule package | `rules/types.ts` `YoungEmployeePrimeRules`; `2025.ts` `exemptRate: 0.75` and bands `50 000 → 5 000`, `75 000 → 3 750`, `100 000 → 2 500` (2026 / 2028 inherit) |
| Engine | `engine.ts`: exemption = `min(prime × 75 %, band cap)`, gated on `youngEmployeePrimeEligible`, subtracted from the tax base, provenance `LIR-ART-115-13d`, warning above €100 000 |
| Contracts | `youngEmployeePrime`, `youngEmployeePrimeEligible`, result field `youngEmployeePrimeExemption` |
| Validation + API | questionnaire schema and `CalculationsService` passthrough |
| UI | questionnaire amount + eligibility select; calculator row |
| Tests | one test covering the three bands, the ineligible case and the €100 000 cut-off |

**Deliberate legal choices:** the exemption never reduces the CIS/CI-CO2 base (those are
computed on gross salary including exempt salary), and eligibility is an explicit input
because the exemption is lost on a change of employer — it cannot be inferred from age alone.

### Suite repair — the validation failure was a build gap, not a logic gap (2026-11-09)

`packages/validation/test/validation.spec.ts` imports `../dist/index.js`, which did not exist,
and the built output `require`s `zod` and `@luxtax/contracts`, neither resolvable without
`node_modules`. It was reported as “188 / 189” for that reason. Fixed without touching any
package source or test:

```powershell
# 1. zod + a workspace link for @luxtax/contracts, inside the scratch toolchain
npm --prefix .tools install --no-package-lock zod@3.24.2
New-Item -ItemType Junction -Path .tools/node_modules/@luxtax/contracts -Target (Resolve-Path packages/contracts)

# 2. build the two packages (dist/ is gitignored, so this is local only)
node .tools/node_modules/typescript/bin/tsc -p tsconfig.build-contracts.json
node .tools/node_modules/typescript/bin/tsc -p tsconfig.build-validation.json

# 3. run the suite with the scratch modules on the resolution path
$env:NODE_PATH = (Resolve-Path .tools/node_modules).Path
node .tools/node_modules/tsx/dist/cli.mjs --tsconfig tsconfig.test.json --test <all *.spec.ts>
```

Result: **`tests 200 · suites 40 · pass 200 · fail 0`**. No test was skipped, no assertion
weakened, and no `node_modules` tree was created at the repository root — `NODE_PATH` is scoped
to the test process, so the workspace layout another track depends on is untouched.

Two build configs were added for this: `tsconfig.build-contracts.json` and
`tsconfig.build-validation.json` (both emit to the gitignored `dist/`).

## Verification log

| Date | Check | Result |
|---|---|---|
| 2026-11-08 | `tsc -p tsconfig.test.json` | ✅ exit 0 |
| 2026-11-08 | Engine golden tests | ✅ **36 / 36 pass** |
| 2026-11-08 | Annex PDF tests | ✅ **7 / 7 pass** |
| 2026-11-08 | Combined run | ✅ **43 / 43 pass** |
| 2026-11-08 | `prisma migrate deploy` on PostgreSQL 18.4 | ✅ 3 / 3 applied |
| 2026-11-08 | `prisma migrate diff` DB vs model | ✅ **empty — no drift** |
| 2026-11-08 | DB inspection (tables / enum / column) | ✅ 23 · 17 · `annexesJson` jsonb |
| 2026-11-08 | Combined run after CIC work | ✅ **44 / 44 pass** |
| 2026-11-08 | Combined run after the publication gate | ✅ **47 / 47 pass** |
| 2026-11-08 | Publication re-check (ACD newsletter · Chambre dossier 8775 · ACD CIC page) | ⛔ still unpublished: dossier shows only “Déposé 22.06.2026”; ACD CIC page still 2023 |
| 2026-11-08 | Combined run after the CIC safety gate | ✅ **48 / 48 pass** (engine + annex PDF scope of this track) |
| 2026-11-09 | Completion audit (suites + tsc + syntax) | suites **189 / pass 188 / fail 1** · `tsc` exit 0 · syntax 45 files `ok` |
| 2026-11-09 | **Suite repair — validation build** | ✅ **200 / 200 pass, 0 fail** across all 10 spec files |
| 2026-11-09 | Phase 12 — prime jeune salarié | ✅ **201 / 201 pass, 0 fail**; `tsc` exit 0; 45 files syntax `ok` |
| 2026-11-09 | Phase 13 — LEG-9 filing-year guard | ✅ **206 / 206 pass, 0 fail** (5 new tests); `tsc` exit 0; 45 files syntax `ok` |
| 2026-11-09 | Phase 14 — migrations 4 & 5 applied on a fresh cluster | ✅ 5 / 5 applied · 26 tables · `migrate diff` empty · API-6 found already delivered |
| 2026-11-09 | Phase 15 — API-7 evidence index | ✅ **213 / 213 pass, 0 fail** (7 new tests) · migration 6 applied · `migrate diff` empty |
| 2026-11-09 | Phase 16 — API-9 calculation history | ✅ **220 / 220 pass, 0 fail** (7 new tests) · migration 7 applied · `migrate diff` empty |
| 2026-11-09 | Phase 17 — API-10 audit chain | ✅ **228 / 228 pass, 0 fail** (8 new tests) · migration 8 applied · trigger installed · `migrate diff` empty |
| 2026-11-09 | Phase 18 — API-8 rate limit + MFA | ✅ **250 / 250 pass, 0 fail** (22 new tests, incl. RFC 4226/6238 vectors) · `tsc` exit 0 · flags default off |
| 2026-11-09 | Phase 19 — MOB-1 workspace ids | ✅ **257 / 257 pass, 0 fail** (7 new resolver tests) · `tsc` exit 0 · 4 mobile files syntax `ok` · **RN build not run** |
| 2026-11-09 | Phase 20 — MOB-2 questionnaire call | ✅ **261 / 261 pass, 0 fail** (4 new static tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |
| 2026-11-09 | Phase 21 — MOB-3 offline queue | ✅ **272 / 272 pass, 0 fail** (11 new tests) · `tsc` exit 0 · 50 files syntax `ok` |
| 2026-11-09 | Phase 22 — MOB-4 queue wired into screens | ✅ **279 / 279 pass, 0 fail** (7 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |
| 2026-11-09 | Phase 23 — MOB-5 redaction + download | ✅ **293 / 293 pass, 0 fail** (14 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |
| 2026-11-09 | Phase 24 — MOB-6 authenticated download | ✅ **306 / 306 pass, 0 fail** (13 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |
| 2026-11-09 | Phase 25 — MOB-7 push + offline banner | ✅ **321 / 321 pass, 0 fail** (15 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |
| 2026-11-09 | Phase 26 — MOB-8 deep links | ✅ **336 / 336 pass, 0 fail** (15 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |
| 2026-11-09 | Phase 27 — MOB-9 app-lock policy | ✅ **353 / 353 pass, 0 fail** (17 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |
| 2026-11-09 | Phase 28 — MOB-10 export/share policy | ✅ **373 / 373 pass, 0 fail** (20 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |
| 2026-11-09 | Phase 29 — MOB-11 banner + lock components | ✅ 373 / 373 pass (no new logic) · `tsc` exit 0 · **52 files** syntax `ok` · **components never rendered** |
| 2026-11-09 | Full repo suite (all 10 spec files present) | ✅ **188 / 189 pass** — the single failure is `packages/validation/test/validation.spec.ts`, which imports `../dist/index.js` (not built) and needs `zod` (no `node_modules`); environment artefact, not a logic failure |
| 2026-11-08 | ACD “Lois votées en 2026” list · Legilux ELI probe | ⛔ 8775 absent — last law 16.07.2026 (Mémorial A 360); ELI 404 |
| 2026-11-08 (re-check) | `legi26.html` + `chd.lu/fr/dossier/8775` | ⛔ **no change** — law list still ends 16.07.2026; dossier still “Déposé 22.06.2026”, last update 22.06.2026 |
| 2026-11-08 | Scheduled watch created | ✅ task `861a3eef…` daily 08:00 Europe/Luxembourg, client notification, read-only |
| 2026-11-09 | Watch confirmed enabled (`schedule_task list`, revision 2) | ✅ cron `0 8 * * *` Europe/Luxembourg, client notification |
| 2026-11-09 | `legi26.html` + `chd.lu/fr/dossier/8775` re-check | ⛔ **no change** — law list still ends 16.07.2026; dossier unchanged since 22.06.2026 |
| 2026-11-08 | `node .tools/syntax_check.cjs` | ✅ **9 / 9 files `ok`**, exit 0 — incl. `apps/web/src/components/TaxCalculatorView.tsx` (CIC row present at L373–374) |
| 2026-11-08 | `tsc -p tsconfig.api.json` | ✅ no error in new code (Prisma client not generated here) |
| 2026-11-08 | JSX/TS syntax check | ✅ all touched files |
| 2026-11-08 (second pass) | Combined suites after the P0 fixes | ✅ **70 / 70 pass** — 46 engine + 7 annex PDF + 5 platform-admin + 12 fact-visibility |
| 2026-11-08 (second pass) | `tsc -p tsconfig.test.json` | ✅ exit 0 |
| 2026-11-08 (second pass) | `node .tools/syntax_check.cjs` | ✅ **27 / 27 files `ok`**, exit 0 (was 9) |
| 2026-11-08 (second pass) | API e2e (`tax-lifecycle-full`, `admin-governance`, `household-collaboration`, …) | ⛔ **not run** — `@nestjs/*`, Prisma client and Postgres absent; guards and filters are review + transpile only |
| 2026-11-08 (third pass) | Five suites after LEG-2…LEG-5 | ✅ **103 / 103 pass** — engine, 7 annex PDF, 5 platform-admin, 12 fact-visibility, 11 class-resolution |
| 2026-11-08 (third pass) | `tsc -p tsconfig.test.json` | ✅ exit 0, no diagnostics |
| 2026-11-08 (third pass) | `node .tools/syntax_check.cjs` | ✅ **28 / 28 files `ok`**, exit 0 (was 27) |
| 2026-11-08 (third pass) | API e2e and browser rendering | ⛔ **not run** — no `@nestjs/*`, Prisma client or Postgres; no installed React/Next deps |
| 2026-11-08 (fourth pass) | Five suites after LEG-6 + API-3 | ✅ **131 / 131 pass** — 21 suites: engine 76, annex PDF 7, platform-admin 5, fact-visibility 12, class-resolution 31 |
| 2026-11-08 (fourth pass) | `tsc -p tsconfig.test.json` | ✅ exit 0, no diagnostics |
| 2026-11-08 (fourth pass) | `node .tools/syntax_check.cjs` | ✅ **29 / 29 files `ok`**, exit 0 (was 28) |
| 2026-11-08 (fourth pass) | API e2e and browser rendering | ⛔ **not run** — same missing `@nestjs/*`, Prisma client, Postgres and React/Next deps; the two API-3 cases are transpile-only |
| 2026-11-08 (fifth pass) | Five suites after LEG-8 | ✅ **140 / 140 pass** — 24 suites: engine 79, annex PDF 7, platform-admin 5, fact-visibility 12, class-resolution 37 |
| 2026-11-08 (fifth pass) | `tsc -p tsconfig.test.json` | ✅ exit 0, no diagnostics |
| 2026-11-08 (fifth pass) | `node .tools/syntax_check.cjs` | ✅ **31 / 31 files `ok`**, exit 0 (was 29) |
| 2026-11-08 (fifth pass) | `tsc -p tsconfig.api.json` | ⛔ 107 pre-existing errors (`@nestjs/*`, `@prisma/client`, `fastify` absent); none on the new helper, flag or guard lines |
| 2026-11-08 (fifth pass) | API e2e and browser rendering | ⛔ **not run** — the comparison route, the eligibility wiring and the React card are transpile + inspection + helper-probe only; no test executes `calculateTax` or `compareScenarios` |
| 2026-11-08 (sixth pass) | Six suites after LEG-7 | ✅ **158 / 158 pass** — 26 suites: engine 90, annex PDF 7, platform-admin 5, fact-visibility 12, class-resolution 37, Form 100 case map 7 |
| 2026-11-08 (sixth pass) | `tsc -p tsconfig.test.json` | ✅ exit 0, no diagnostics |
| 2026-11-08 (sixth pass) | `node .tools/syntax_check.cjs` | ✅ **32 / 32 files `ok`**, exit 0 (was 31) |
| 2026-11-08 (sixth pass) | API e2e and browser rendering | ⛔ **not run** — `filing.service.ts` is transpile + mock-Prisma probe only; the package table and the 160 warnings are not rendered |
| 2026-11-08 (seventh pass) | Seven suites after API-4 | ✅ **169 / 169 pass** — engine 90, annex PDF 7, platform-admin 5, fact-visibility 12, class-resolution 37, Form 100 case map 7, notification rules 11 |
| 2026-11-08 (seventh pass) | `tsc -p tsconfig.test.json` | ✅ exit 0, no diagnostics |
| 2026-11-08 (seventh pass) | `node .tools/syntax_check.cjs` | ✅ **38 / 38 files `ok`**, exit 0 (was 32) |
| 2026-11-08 (seventh pass) | Prisma schema and migration parity | ✅ `prisma validate` valid on a temp copy; `migrate diff` 13 statements / 53 non-empty normalised lines, 0 diffs against `20261108140000_add_notifications` — **migration not applied** |
| 2026-11-08 (seventh pass) | Notification client/contract probe · relative age | ✅ `tsc -p tmp/tsconfig.probe-api4.json` exit 0 under `strict`; `node tmp/probe-api4-age.cjs` 10 / 10 |
| 2026-11-08 (seventh pass) | API e2e, database and browser | ⛔ **not run** — no `@nestjs/*`, generated Prisma client, Postgres or React/Next deps; the notification service, controller and hooks are transpile + inspection only, and no e-mail or push is sent |
| 2026-11-08 (eighth pass) | Eight suites after API-5 | ✅ **179 / 179 pass** — 30 suites: engine 90, annex PDF 7, platform-admin 5, fact-visibility 12, class-resolution 37, Form 100 case map 7, notification rules 11, return-version history 10 |
| 2026-11-08 (eighth pass) | `tsc -p tsconfig.test.json` | ✅ exit 0, no diagnostics |
| 2026-11-08 (eighth pass) | `node .tools/syntax_check.cjs` | ✅ **43 / 43 files `ok`**, exit 0 (was 38) |
| 2026-11-08 (eighth pass) | F1 freelance-demo probe (real service, in-memory Prisma fake) | ✅ 13 / 13 assertions — one invalidation with the acting user and a generic reason, only when facts were written; second run `count 0`, no invalidation |
| 2026-11-08 (eighth pass) | F2 component typecheck probe | ✅ `tsc -p tmp/tsconfig.probe-f2.json` exit 0 with `FilingPackageView.tsx` in the program — typecheck only, no render |
| 2026-11-08 (eighth pass) | API e2e, database and browser | ⛔ **not run** — no `@nestjs/*`, generated Prisma client, Postgres or React/Next deps; `invalidateForChange` and `getHistory` have no mock-Prisma test |

**Golden values locked in the suite**

| Case | Expected | Source |
|---|---|---|
| Class 1 €20,000 | €612 | Art. 118 |
| Class 1 €30,000 | €1,998 | Art. 118 |
| Class 1 €40,000 | €4,232 | Art. 118 |
| Class 1 €50,000 | **€7,341** | Art. 118 |
| Class 2 €100,000 | **€14,682** | ACD splitting |
| Class 1a €26,460 | **€0** | Art. 120bis |
| Class 1a €150,000 | **€44,268** | Art. 120bis |
| 2025 vs 2026 | 111bis 3 200/4 500 · CI-CO2 192/216 · AMVP 0/9 000 | packages |

---

## Files changed

**Engine (new):** `rules/types.ts`, `rules/2025.ts`, `rules/2026.ts`, `rules/2028.ts`, `rules/treaties.ts`, `rules/index.ts`, `scale.ts`, `money.ts`

**Engine (rewritten):** `engine.ts`, `credits.ts`, `deductions.ts`, `index.ts`, `scale2025.ts` (deprecated shim)

**Contracts / validation:** `tax.ts`, `enums.ts`, `questionnaire.ts`, `validation/questionnaire.schema.ts`

**API:** `calculations.service.ts`, `filing.service.ts`, `freelance.service.ts`, `prisma/schema.prisma`, `prisma/migrations/*`

**Web:** `TaxCalculatorView.tsx`, `QuestionnaireView.tsx`, `dashboard/page.tsx`, `FactsView.tsx`

**Tooling:** `.tools/`, `tsconfig.test.json`, `tsconfig.api.json`, `packages/tax-engine/test/tax-engine.spec.ts`

---

## Phase 5 — gap closure (R1–R10)

| Gap | Item | Status | Evidence |
|---|---|---|---|
| R10 | Exact money aggregation | ✅ | `addMoney`/`sumMoney`; 29 accumulation sites in `engine.ts` converted |
| R3 | Art. 3 d) mixed-couple gate | ✅ | `spouseResidence` + `mixedCoupleCollectiveRequested`; ≥ 90 % gate admits Class 2, otherwise warns |
| R5 | Extractor breadth | ✅ | dedicated 111bis branch + pension certificate (modèle 170) branch |
| R1 | Securities ledger | ✅ | qualifying dividend 50 %, RELIBI 20 % final, creditable foreign WHT, then the €1,500 tranche |
| R2 | Rental asset register | ✅ | 4 % recent (max 2 buildings) / 1.5 % / 2 % / 3 % by age + energy renovation rate, charges, interest |
| R8 | Annex PDF generation | ✅ | dependency-free PDF builder, JWT-protected `GET …/filing-package/annexes.pdf`, cover + one page per annex; 7 tests |
| R4 | 2028 transition | ✅ | `classUTransition { years: 25, method: 'NONE' }` hook + explicit warning |
| R6 | CIC + publication gate | ✅ | `CicRules` + `cicForSalary()` + engine/UI line + `pendingMeasures`; **safety gate**: a table transcribed from a bill returns 0 while the measure is `NOT_IN_FORCE` (tested both states) |
| R7 | Épargne-logement gate | ✅ | current law applied; `EPARGNE_LOGEMENT_8775` pending measure + a warning for subscribers over 40; activation proven by test |
| R9 | Migration execution | ✅ | applied and verified — see Phase 7 |

## Phase 11 — automated publication watch

Manual polling is replaced by a scheduled job, as requested.

| Field | Value |
|---|---|
| Task id | `861a3eef-273d-470c-a1de-475e4448138b` |
| Label | Lux-Tax — projet de loi 8775 publication watch |
| Schedule | cron `0 8 * * *`, timezone `Europe/Luxembourg` (daily 08:00) |
| Notification | client |
| Policies | overlap `skip`, misfire `run_once` (6 h grace), retry 3 × 5 min |
| Status | enabled |

What it does each morning:

1. Reads `impotsdirects.public.lu/fr/legislation/legi26.html` and compares against the
   seven-law baseline of 2026-11-08.
2. Reads `chd.lu/fr/dossier/8775` and checks for activity after “22.06.2026 — Déposé”.
3. **No change** → answers exactly one line: `8775 not published yet (<date>)`.
4. **Change** → reports the law date + Mémorial number, quotes the title, and prints the
   five-step activation checklist (add `cic.bands`, set `savingsHousingYoungMaxAge: 200`,
   flip `pendingMeasures`, run the suite, update this tracker).

The job is deliberately **read-only**: it never edits the repository, so a false positive
cannot corrupt the tax rules. Activation stays a reviewed, human-triggered change.

Manage with `schedule_task` (`list` / `pause` / `resume` / `delete`) and the task id above.

## Phase 10 — definitive publication check (2026-11-08)

The ACD publishes the authoritative list **“Lois votées en 2026 ayant une incidence sur la
fiscalité directe”** (`impotsdirects.public.lu/fr/legislation/legi26.html`). Read today, the
**last entry is the loi du 16 juillet 2026** (Mémorial A N° 360 du 17 juillet 2026).

**Projet de loi 8775 is not in that list** — it has not been voted definitively and has not
been published. A Legilux ELI probe for a November 2026 law returns 404, which is expected
for an act that does not exist.

> **Status of R6 / R7: BLOCKED (external).** Re-checked twice on 2026-11-09:
> `legi26.html` still ends at the loi du 16 juillet 2026 and `chd.lu/fr/dossier/8775` is still
> “Déposé 22.06.2026”, “Dernière mise à jour · 22.06.2026”. No change.
> The watch (`861a3eef…`, revision 2, **enabled**) is the standing mechanism: it runs at
> 08:00 Europe/Luxembourg, stays read-only, and reports the morning 8775 appears.
> No code change results from these re-checks, so the suite is unchanged at 188 / 189.
> Not unfinished code, not a missing implementation. Two published documents are required and neither exists on 2026-11-08:
> (a) the 2026 CIC monthly table, (b) the loi 8775 text removing the épargne-logement age
> limit. Everything that depends on the repository is done; the four activation steps are
> documented in Phase 9 and proven by test.

Watch list, in order of reliability:

1. `impotsdirects.public.lu/fr/legislation/legi26.html` — the list above; 8775 appears here the day it is voted and published.
2. `impotsdirects.public.lu/fr/archive/newsletter/2026/` — ACD announces the entry into force.
3. `chd.lu/fr/dossier/8775` — vote and text of the bill.
4. ACD A–Z page `…/credit-impot-conjoncture/` — the 2026 table replaces the 2023 one.

## Phase 9 — publication gate (R6 / R7 as data switches)

Re-checked on 2026-11-08: the ACD newsletter of 30.10.2026 is **unchanged** — only the
*premier vote constitutionnel* (28.10.2026) has happened, and entry into force is still
“attendue pour le mois de novembre 2026”. The ACD CIC page still carries the 2023 table.
No 2026 table and no Mémorial text exist yet, so no number may be shipped.

Instead of leaving the two items as “unimplemented”, the package now carries an explicit
gate:

```ts
// packages/tax-engine/src/rules/2026.ts
pendingMeasures: [
  { id: 'CIC_2026', status: 'NOT_IN_FORCE',
    source: 'Projet de loi 8775 (1er vote 28.10.2026); ACD newsletter 30.10.2026 …',
    activation: 'add cic: { bands: [...], topAmount: … } with the published monthly table' },
  { id: 'EPARGNE_LOGEMENT_8775', status: 'NOT_IN_FORCE',
    source: 'Projet de loi 8775 — suppression of the 40-year age limit',
    activation: 'set specialExpenses.savingsHousingYoungMaxAge to 200' },
]
```

Behaviour today:

| Situation | Result |
|---|---|
| 2026 salary, no table | CIC = 0, warning naming the source and the activation step |
| Épargne-logement, subscriber 45 | capped at €672, warning that 8775 would remove the age limit |
| `pendingMeasures` on 2025 | absent |

**Activation is proven, not assumed.** A test builds a package with
`savingsHousingYoungMaxAge: 200` and a CIC table, then asserts
`calculateDeductions().savingsHousingDeduction === 1 344` and `cicForSalary(60 000) === 120`.
So when the Mémorial publishes, the whole change is:

1. paste the published `bands` into `rules/2026.ts` as `cic`;
2. set `savingsHousingYoungMaxAge` to `200`;
3. flip both `pendingMeasures[].status` to `'IN_FORCE'`;
4. run the suite and update this file.

**Safety gate added.** `cicForSalary()` now returns 0 whenever a table exists but the
`CIC_2026` measure is still `NOT_IN_FORCE`. This blocks the one realistic mistake — pasting
the bands from the *projet de loi* and paying them out before the law enters into force.
Both states are tested (0 while pending, 120 when flipped to `IN_FORCE`).

**Publication re-check, 2026-11-08 (three sources):**

| Source | Result |
|---|---|
| ACD newsletter 30.10.2026 | unchanged — first constitutional vote only; entry “attendue pour le mois de novembre 2026” |
| Chambre dossier 8775 (`chd.lu/fr/dossier/8775`) | activity list shows only **“22.06.2026 Déposé”** — no vote, no published text |
| ACD CIC 2026 page | not public (only the 2023 table exists; `/…-salarie-2026.html` is cookie-walled / absent) |

**External dependency — not code work:** the 2026 CIC monthly table and the loi 8775
Mémorial text. Nothing in this repository can close them; a fabricated table would be
worse than no table.

## Phase 8 — publication status of R6 / R7 (verified 2026-11-08)

Both remaining items need a legal text, not code. Their status was re-checked against
primary sources today:

**ACD newsletter of 30 October 2026** (impotsdirects.public.lu/fr/archive/newsletter/2026/nl301020261.html):

> « En date du 28 octobre 2026, la Chambre des députés a procédé au **premier vote constitutionnel** concernant le projet de loi N° 8775 … La mise en vigueur du présent texte de loi (après dispense de 2ème vote et publication officielle) est **attendue pour le mois de novembre 2026**. »

It lists the three measures: CISSM adaptation, **temporary reintroduction of CIC 2026**, and **suppression of the 40-year age limit for épargne-logement**.

**CIC.** The ACD A–Z page for *crédit d'impôt conjoncture salarié* is still the 2023 table (last updated 28 July 2023) — there is no published 2026 monthly table. The newsletter adds that CIC salarié and pensionné for **June–October 2026** are to be bonified in one instalment **by 31 December 2026**.

**What was implemented instead of guessing:**

| Piece | Where |
|---|---|
| `CicRules` (piecewise-linear monthly bands + flat top amount) | `rules/types.ts` |
| `cicForSalary()` — returns 0 when no table is in the package; below the first band; otherwise the exact band formula ×12 | `credits.ts` |
| Engine line, provenance `LIR-CIC`, UI row, and a sourced warning when the year has no table | `engine.ts`, `TaxCalculatorView` |
| Mechanism test with a **synthetic** table (explicitly not a legal table) plus the "no table ⇒ 0" case | `tax-engine.spec.ts` |

So the credit becomes a **package data change** the day the table is published — the
same pattern used for every other year-dependent amount. No 2023 number is reused for 2026.

**Épargne-logement.** Current 2025/2026 law is applied (€1,344 up to age 40, €672 above).
The 8775 suppression is *not* applied because the law is not in force; the tracker keeps it
as a one-line data change (`savingsHousingYoungMaxAge`) once the Mémorial text is out.

## Phase 7 — database migration executed (closes R9 / 2.9)

A throwaway PostgreSQL 18.4 cluster was initialised inside `.tools/pgdata` on port
**55432** with `trust` auth, so the machine's existing `postgresql-x64-18` service and
its credentials were left untouched.

**Baseline problem found and fixed.** The repository had no initial migration, only the
two delta folders — applying them to an empty database would fail on a missing
`FactCategory` type. A baseline was generated from the *pre-change* model with
`prisma migrate diff --from-empty --to-schema-datamodel`, giving a coherent history:

| Migration | Content |
|---|---|
| `20261108000000_init` | full baseline schema from the pre-change model (23 tables, 9-value `FactCategory`) |
| `20261108120000_add_fact_category_values` | the 8 new `FactCategory` values |
| `20261108130000_add_filing_annexes` | `filing_packages."annexesJson"` |

**Two real defects caught by running it:**

1. `migration_lock.toml` and the migration SQL files were written with a **UTF-8 BOM** by PowerShell, which PostgreSQL rejected (`syntax error at or near "﻿"`). Stripped — files are now UTF-8 without BOM.
2. The annexes migration added `"annexes_json"` while the Prisma model maps to `"annexesJson"` (no `@map`). `prisma migrate diff` reported drift; the migration was corrected and the database rebuilt from scratch.

**Verification after rebuild**

```
Applying migration `20261108000000_init`
Applying migration `20261108120000_add_fact_category_values`
Applying migration `20261108130000_add_filing_annexes`
All migrations have been successfully applied.

_prisma_migrations: 3 rows, all finished_at not null
tables in schema public: 23
FactCategory enum values: 17 (9 original + 8 added)
filing_packages."annexesJson": jsonb
migrate diff --from-url … --to-schema-datamodel … --script  →  "-- This is an empty migration."   (NO DRIFT)
```

**Not done, for a stated reason:** `prisma generate` still needs the workspace install
(`pnpm install`). It resolves `@prisma/client` from the package tree, and this environment
has no `node_modules`; Prisma's fallback (`pnpm add prisma -D`) cannot run against a
`workspace:*` root. Regenerating the client is therefore a post-install step, not a
migration step.

Restart the cluster later with:

```powershell
& "C:\Program Files\PostgreSQL\18\bin\pg_ctl.exe" -D .tools\pgdata -l .tools\pg.log -o "-p 55432" start
```

## Phase 6 — annex PDF generation

The last product gap (an annex document) is closed with a dependency-free PDF writer,
because no PDF library can be installed in this workspace.

| Piece | File | Behaviour |
|---|---|---|
| PDF engine | `apps/api/src/modules/filing/annex-pdf.builder.ts` | PDF 1.4, A4, Helvetica, valid xref/startxref, latin-1 text with `(` `)` `\\` escaping, automatic pagination |
| Layout | same | cover page (household, taxpayer, class, annex list, reference) then one page per annex: header band, reason, taxpayer block, label → amount → **empty “case” column**, declaration + signature lines, footer |
| Data source | persisted `FilingPackage.annexesJson` | no recomputation: the PDF renders exactly what the package stored |
| API | `annex-pdf.service.ts` + `GET /api/workspaces/:id/filing-package/annexes.pdf` | JWT + household guard, `application/pdf`, `Content-Disposition`, `X-Annex-Count`; 400 without a package/annex, 404 without a workspace |
| UI | `FilingPackageView` | **Download annex PDF** (authenticated blob download) next to **Print** |
| Tests | `apps/api/test/annex-pdf.spec.ts` | 7 tests: envelope, page count = annexes + 1, codes/values, disclaimer + signature, xref offsets resolve, escaping, single-page assembler |

**Scope statement carried in the document:** it is a *preparation sheet*
(“ne remplace pas le formulaire officiel ACD”) with an empty case column to transcribe
into the administration's own form. It deliberately does not clone ACD artwork or case numbering.

## Gap check (2026-11-08)

Full audit in [`gap-check-2026-11-08.md`](gap-check-2026-11-08.md). Four material gaps were found where the engine was right but the app could not reach it — all fixed:

1. Facts UI still emitted the old `INSURANCE_DEDUCTION / pension111bis` shape → 111bis capped at €672.
2. Questionnaire lacked invalidity, épargne-logement age, 111bis contributors, child allocations, plus-values and the treaty row.
3. The document extractor routed *prévoyance* into the €672 envelope.
4. CISSM had no implementation at all.

Remaining partials, with reasons: R1 securities ledger, R2 rental asset register, R3 Art. 3 d) gate, R4 2028 transition, R5 extractor breadth, R6 CIC 2026, R7 loi 8775, R8 annex PDFs, R9 migration execution, R10 aggregate precision. All ten were closed later the same day — see Phase 5 and `gap-check-2026-11-08.md` §6.

### Syntax-check evidence (last run, 2026-11-08)

`node .tools/syntax_check.cjs` → exit 0, **43 files parsed** after the eighth pass (38 after the seventh, 32 after the sixth, 31 after the fifth, 29 after the fourth, 28 after the third, 27 after the second, 9 before it, recorded below). The original nine:

```
ok   apps/api/src/modules/calculations/calculations.service.ts
ok   apps/api/src/modules/filing/filing.service.ts
ok   apps/api/src/modules/freelance/freelance.service.ts
ok   apps/web/src/components/TaxCalculatorView.tsx
ok   apps/web/src/components/QuestionnaireView.tsx
ok   apps/web/src/app/(workspace)/[householdId]/dashboard/page.tsx
ok   apps/web/src/components/FilingPackageView.tsx
ok   apps/api/src/modules/documents/receipt-ai-vision.service.ts
ok   packages/validation/src/questionnaire.schema.ts
```

The web files are outside `tsconfig.test.json`, so this transpile check is the gate that
covers them; `TaxCalculatorView.tsx` was re-checked after the CIC row was added
(`calc.credits.cic`, lines 373–374 of the file).

Files added after that record (9 → 27): `admin.controller.ts`, `platform-admin.guard.ts`, `platform-admin.ts`, the `documents`/`facts`/`filing`/`questionnaire` controllers, `facts.service.ts`, `documents.service.ts`, `fact-visibility.ts`, `DocumentsView.tsx`, `CameraScanModal.tsx`, `FreelanceBusinessView.tsx`, `households.controller.ts`, `freelance.controller.ts`, `household.schema.ts`, `fact-inclusion.ts`, `FactsView.tsx`. The third pass added `apps/api/src/modules/calculations/class-resolution.ts` (27 → 28). The fourth pass added `apps/api/src/common/guards/household.guard.ts` (28 → 29); the guard had been missing from the list. The fifth pass added `apps/api/src/modules/calculations/calculations.controller.ts` and `packages/api-client/src/client.ts` (29 → 31). The sixth pass added `apps/api/src/modules/filing/form100-case-map.ts` and `packages/tax-engine/src/forms/certificate160.ts` (31 → 32). The seventh pass added the four notification API files (`notification-rules.ts`, `notifications.service.ts`, `notifications.controller.ts`, `notifications.module.ts`), `apps/api/test/notification-rules.spec.ts` and `apps/web/src/components/NotificationCenter.tsx` (32 → 38). The eighth pass added `return-approvals.service.ts`, `return-approvals.module.ts`, `return-version-history.ts`, `apps/api/test/return-version-history.spec.ts` and `freelance.module.ts` (38 → 43).

## Known limitations (by design, not pending work)

This list covers deliberate scope choices only. Defects and unbuilt features found by the 2026-11-08 audits are recorded in the pass sections above, not here: the eighth pass’s “Still open” table is the current list (API-5 residuals, the LEG-2 per-child history, the Form 100F category-level precision, the LEG-8 residuals, API-6…API-9, notification delivery, MOB-1..11, the 2026 CIC table and loi 8775, and the DB/e2e gap). Items already delivered — LEG-1…LEG-8, API-1…API-5 — are not “by design” either; their residual limitations are stated in the section that delivered them.

1. **CIC 2026** — not modelled; a warning says so. Monthly amounts were not in a Mémorial text when the package was built.
2. **Loi 8775** (épargne-logement 40-year suppression) — not applied until the Mémorial text is pinned.
3. **Bëllegen Akt €45,000** — unverified claim; only €40,000 is used, and it is not an IR line.
4. **CIS/CII tie-break** — no official rule; the engine keeps the higher credit and warns.
5. **Owner-occupier interest** — ACD `habit_pers` schedule applied; the Form 100F date table is recorded as a conflict.
6. **Class U transition** — 2028 package is a tariff preview; the 25-year couple transition is not modelled.
7. **Individual assessment modes** — foreign income under Art. 3ter is refused with an `unsupported` entry and a warning (LEG-5); the credit itself is computed only under collective assessment.

## Runbook — applying the database change

```powershell
# 1. start PostgreSQL (docker or local)
# 2. generate the client and apply the enum migration
pnpm --filter @luxtax/api prisma:generate
pnpm --filter @luxtax/api prisma:migrate
```

The migration file is committed, so the change is reviewable without a database; only its *application* needs infrastructure.
