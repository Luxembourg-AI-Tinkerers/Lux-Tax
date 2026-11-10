# Security review — 10 November 2026

**Target:** `B:\B\tax-app` — a multi-tenant Luxembourg personal-tax workspace.
**Method:** six specialist reviews (authentication, authorization, injection/file handling, data
protection, transport/web/dependencies, threat-model prioritisation), then **live exploitation on
localhost** to confirm what mattered. Every "exploited" claim below was executed against the running
API and PostgreSQL; the numbers are real responses, not reasoning.

**Threat model.** Assets: household tax data (income, children, documents, tax figures) and account
identity. Attackers: an unauthenticated internet user; a low-privilege member (`VIEWER`); a member of
one household attacking another; a malicious uploader; someone holding a leaked log or backup.

**Scope limits.** No mobile build, no TLS/network layer (not in the repo), no git-history mining.
Probes created throwaway accounts in the disposable `luxtax_site` database.

---

## Verdict

**Two Criticals, both exploited end-to-end.** A stranger can become platform administrator and read
every household's tax figures, and — with one environment variable unset — forge a token for any
account. Both are configuration-independent code defects, not operational mistakes.

The tenant isolation itself is genuinely strong: 16 cross-tenant endpoints and every entity-level
IDOR attempt returned 403/404, with no data. The failures are at the *edges* of that model —
bootstrapping trust (admin allowlist, e-mail verification) and the two places that read facts
without honouring the privacy flag.

| Severity | Count |
|---|---|
| Critical | 2 |
| High | 8 |
| Medium | 12 |
| Low | 6 |

---

# Critical

## C1. Anyone can become platform administrator, and then read every household's tax data
`common/guards/platform-admin.guard.ts:23` · `auth.service.ts:65-95` · `admin.service.ts:901-906`

Authorisation is `ADMIN_EMAILS.includes(request.user.email)`. That e-mail comes from the `users` row,
which `POST /api/auth/register` fills straight from the request body — and **no e-mail verification
exists anywhere** (`isEmailVerified` is never written `true`; there is no verification route, no
mailer, no token). So any address in the allowlist that has not signed up yet belongs to whoever
registers it first.

**Exploited.** With `ADMIN_EMAILS=operator@luxtax.example`:

```
POST /api/auth/register  {"email":"operator@luxtax.example", …}
  → 201   isEmailVerified = false          ← nobody proved they own it
GET /api/admin/audit?limit=500            → 200
  → 105 rows · 12 distinct households · 13 distinct e-mails
  → "Calculated 2025 tax (CLASS_1/COLLECTIVE) … balance = 21523.05 EUR"
  → "Imported official ACD tax assessment for 2025: difference = 11800 EUR"
```

`getAdminAudit` runs `auditEvent.findMany()` with **no household filter** and an **unclamped limit**,
and the read writes no audit row — so the enumeration is silent and complete. The same session also
unlocks `POST /api/admin/models/test` (see M1) and the model-route registry.

**Fix.** Require a verified e-mail before any allowlist match, and make verification real (signed
token by mail). Until then, treat `ADMIN_EMAILS` as a bootstrap-only mechanism: refuse admin to an
account whose `isEmailVerified` is false, clamp the audit limit, and write an audit row for every
admin read of the cross-tenant feed.

## C2. The JWT signing key falls back to a literal committed in the repository
`jwt.strategy.ts:18` · `auth.service.ts:36` · `auth.module.ts:15`

All three read `process.env.JWT_ACCESS_SECRET || 'dev_luxembourg_tax_jwt_access_secret_32chars_min_2026'`.
There is no boot-time config validation, so a deployment that forgets the variable starts normally
and signs HS256 with a public constant.

**Exploited.** A second instance started *without* `JWT_ACCESS_SECRET`, then a token signed with that
literal for a known user id:

```
GET /api/households   → 200  [{"id":"24bdd81f-…","name":"Schmit Site E2E Household", …}]
GET /api/users/me     → 200  {"id":"f476f8a6-…","email":"camille.site.…","firstName":"Camille"}
```

Full account takeover of any account whose UUID is known or guessable from a leaked id, with no
password and no token theft. (With the variable set — as on the primary instance — the same forged
token correctly returns 401, so this is strictly a fail-open default.)

**Fix.** Delete the literal, validate configuration at boot, and refuse to start without a ≥32-byte
secret. Pin `algorithms: ['HS256']` while there.

---

# High

## H1. A fact marked "not shared with the household" leaks through the return snapshot
`facts.service.ts:247-272` · `filing.service.ts:65-78, 167` · `filing.controller.ts:122`

`GET /facts` correctly hides a manual fact whose `isSharedWithHousehold` is false. But the return
snapshot is selected on `isIncludedInReturn` alone — a private manual fact defaults to `true` there —
and `GET /return-version` hands `factsSnapshot` to **any active member**.

**Exploited.** A hypothetical-but-ordinary `isSharedWithHousehold:false` salary fact of €84,000,
confirmed and included:

```
GET /facts as a VIEWER          → the 84 000 fact is absent  (redaction works)
GET /return-version as a VIEWER → 200, factsSnapshot[0].amount = "84000", fieldKey = "grossSalary"
```

The owner's explicit privacy choice is honoured in one reader and ignored in another. The same flag
already redacts the audit trail and blocks cross-member edits, so three subsystems disagree.

**Fix.** Apply the same predicate to `CONFIRMED_FACT_IN_RETURN_WHERE` — or, cleaner, make
`isSharedWithHousehold:false` force `isIncludedInReturn:false` and say so in the UI.

## H2. No rate limiting anywhere, and each login attempt costs 64 MiB
`rate-limit.guard.ts:28,54,65` · `app.module.ts:39` · `auth.service.ts:75-79`

`RATE_LIMIT_ENABLED` is off unless set, *and* the per-user bucket can never fire because the guard is
registered as `APP_GUARD` and therefore runs before `JwtAuthGuard`, when `request.user` is undefined.
Only the IP bucket would apply — and it is disabled.

**Exploited.** 25 consecutive failed logins for one address: **25 × 401, no throttle, no delay, no
lockout**. Every attempt still runs argon2id at m=64 MiB, t=3, so ~16 concurrent requests pin ~1 GB
of RAM — an unauthenticated memory/CPU exhaustion lever as well as a guessing oracle.

**Fix.** Enable a login-specific limit by default (per IP *and* per account), move the user bucket
behind authentication, and add a lockout/backoff with a failed-login audit event.

## H3. There is no e-mail verification, so invitation security is self-asserted
`auth.service.ts:65-95` · `households.service.ts:292`

Invitations are bound to an address, and acceptance compares the signed-in user's e-mail with the
invited one. Because any address can be registered without proof, and a squatted address can never be
reclaimed (registration then returns 409 forever), the binding proves nothing about mailbox
ownership.

**Attack.** The inviter sends a link to `spouse@…`; whoever registers that address first and holds
the link becomes a `CO_FILER` — able to read the household's documents, confirm facts, approve and
file. This is also the first step of C1.

**Fix.** E-mail verification is the missing primitive behind both this and C1. Until it exists, at
least require the inviter to re-enter the invited address on acceptance (a weak but non-zero check)
and surface "unverified account" prominently.

## H4. No security headers at all — `@fastify/helmet` is installed and never imported
`main.ts:22-28` · `apps/api/package.json:24`

**Verified on a live response:** no `Content-Security-Policy`, `X-Content-Type-Options`,
`X-Frame-Options`, `Strict-Transport-Security`, `Referrer-Policy` or `Permissions-Policy`. Three
security packages are dead dependencies: `@fastify/helmet`, `@fastify/rate-limit`, `@fastify/static`.

Consequence: the app is framable (clickjacking on approve/file buttons), MIME-sniffable, and has no
CSP as a second line of defence if an XSS ever lands. HSTS is absent, so a first-visit downgrade is
possible at the edge.

**Fix.** Register `@fastify/helmet` with a CSP for the API's JSON surface and HSTS; delete the two
other unused packages or wire them.

## H5. A `VIEWER` can recalculate the return and silently invalidate both approvals
`calculations.controller.ts:21`

`POST /calculate` has no `@Roles`, and `HouseholdGuard` enforces roles only when the decorator is
present. `calculateTax` then overwrites `calculationResult`, changes the status and calls
`invalidateForChange`.

**Exploited.** A `VIEWER` membership in the household: `POST /api/workspaces/{ws}/calculate → 201`,
while `approve`/`questionnaire`/`filing-package`/fact edits correctly returned 403. A read-only
colleague can destroy the state a couple spent the evening approving. Two further writes are equally
open: `POST /households/:id/workspaces` (mint a tax year) and `POST …/tasks/:id/resolve` (silence a
BLOCKER readiness task).

**Fix.** `@Roles(PRIMARY_FILER, CO_FILER)` on all three.

## H6. The household activity feed leaks members' e-mail, IP address and private file names
`audit.controller.ts:14-32` · `audit.service.ts:84-91`

The route has no `@Roles`, and the DTO carries `actorEmail`, `ipAddress` and `userAgent`.
`documents.service.ts:184-189, 407` writes the **original file name** into the event description, so a
`VIEWER` learns that `certificat_salaire_Pierre_2025.pdf` exists even though `GET /documents` will not
show them the document.

**Fix.** Redact `actorEmail`/`ipAddress`/`userAgent` for non-filers, omit private document names, and
consider a coarser view for `VIEWER`.

## H7. MFA is advertised and does not exist
`auth/totp.ts` (imported by nothing) · `MFA_ENABLED` (referenced only by a test)

`totp.ts` is complete, tested and **unreachable**: no secret column on `User`, no enrolment route, no
challenge in `login`, and `isMfaEnabled` is never called. `.env.example` documents `MFA_ENABLED`, so
an operator can reasonably believe MFA is available. Combined with H2 (no throttling) and the
`localStorage` tokens, there is no second factor and no lockout.

**Fix.** Either wire it (column, enrol/verify routes, login challenge, recovery codes, replay counter)
or remove the module and the env var so nobody plans around a control that isn't there.

## H8. A stolen refresh token survives logout, and theft is undetectable
`auth.service.ts:172-222` · `auth-context.tsx:54`

Three compounding defects:

1. **No reuse detection / family revocation** — the presented token is revoked and a new one issued;
   a replayed revoked token merely 401s. `Session` has no `parentId`, so a stolen token that is used
   first silently wins while the victim's rotation fails.
2. **Logout never reaches the server in a deployed build** — `auth-context.tsx:54` posts to a literal
   `http://localhost:3001/api/auth/logout` while every other call uses `NEXT_PUBLIC_API_URL`, and the
   `catch` swallows the failure. The session row stays `revokedAt = null` for its full 7 days.
3. **Access tokens cannot be revoked** — the JWT strategy checks `isActive` but never the session, so
   a logged-out token works until it expires (≤15 min).

**Fix.** Send logout to the configured base URL; add token families with rotation-on-reuse detection;
store `jti` and consult a denylist (or a session version) on verify.

---

# Medium

| # | Finding | Evidence |
|---|---|---|
| M1 | **SSRF with credential egress via the admin model probe.** `POST /api/admin/models/test` fetches a caller-supplied `endpointUrl` with no allowlist, no private-IP block and default redirect following; `localhost` is explicitly treated as a normal OpenAI endpoint. With a `modelId`, the **stored API key** is loaded and sent to that URL — so an admin who may not read a key can ship it to their own host. Requires an admin (C1 makes that cheap). | `admin.service.ts:594-660` |
| M2 | **Registered model credentials are stored in plaintext.** `ModelDefinition.apiKey String?` is written raw and masked only in DTOs, so a database backup yields working third-party credentials. | `schema.prisma:650`; `admin.service.ts:395,489` |
| M3 | **The declared data-class guard is decorative.** `permittedDataClass`/`maxDataClass`/`hostingRegion` are never read; the vision branch checks only `capabilities.includes('VISION')`. A model registered as `PUBLIC`/`SYNTHETIC` still receives full salary certificates — the entire document, base64, on every upload. | `receipt-ai-vision.service.ts:62,150-170` |
| M4 | **The audit trail is wipeable by the application's own DB role.** The purge guard accepts a DELETE when the session sets `luxtax.allow_audit_purge='on'`; custom GUCs are settable by any role, so no table ownership is needed. Nothing detects it — `verifyAuditChain` is referenced only by its tests — and auth events are unchained anyway (`prevHash = null` because they carry no `householdId`), so login history can be erased without leaving a break. | `migrations/20261109180000_audit_purge_guard`; `audit-chain.ts:117`; `audit.service.ts:31-38` |
| M5 | **`matriculeEncrypted` is a phantom column.** Declared and migrated, referenced by zero lines of code; there is no cipher anywhere in the API. The name asserts AES-grade protection that does not exist, and the 13-digit matricule the filing needs has no typed home (it can only live in a plain-text fact or a free-text description). | `schema.prisma:218`; grep: 0 references |
| M6 | **Error internals leak outside `NODE_ENV=production`.** The filter returns the raw message for every 5xx unless `NODE_ENV === 'production'`, and `.env.example` ships `development`. Prisma messages carry the failing statement; the `$executeRawUnsafe` paths can include PostgreSQL detail with key values. Prisma query logging (`['query',…]`) also prints bound values — e-mails, amounts, token hashes — in development. | `http-exception.filter.ts:37-45`; `prisma.service.ts:18` |
| M7 | **Malformed household id → 500.** Only the `workspaceId` branch of the guard validates the UUID, so `GET /api/households/not-a-uuid` reaches Prisma and returns 500 (the workspace equivalent correctly returns 403). Verified live. No leak in production, but it logs an error per request and contradicts the guard's own comment. | `household.guard.ts:39-46` |
| M8 | **`ownerId` is accepted from the request body** without a household-membership check (`confirmFact`, `updateFact`, and the freelance profile upsert). A filer can attribute a fact to any UUID — which the Form 100 maps to the spouse column — or persist a profile whose join later returns another tenant's e-mail. `uploadDocument` does this check correctly. | `facts.service.ts:261,402`; `freelance.service.ts:142` |
| M9 | **Invitation re-activation grants the previous role, and the audit log states the new one.** After my earlier fix, the upsert updates `status` only — so a removed `CO_FILER` re-invited as `VIEWER` returns as `CO_FILER`, while the event says "joined as VIEWER". Escalation relative to intent, and a trail that contradicts reality. | `households.service.ts:301-317, 332` |
| M10 | **No retention, erasure or export.** No account- or household-deletion route, no data export. Audit rows — with IP and user agent — are append-only forever; `DocumentExtraction.extractedText` keeps 300 characters of every document after confirmation; `Session.ipAddress`/`userAgent` are never written, so users cannot review their own sessions either. | `users.controller.ts`; `schema.prisma:180-181,390` |
| M11 | **Uploads: no size cap and client-declared MIME.** `fileContentBase64` is unbounded in the schema and taken at face value; only Fastify's implicit 1 MiB body limit stands between a `CO_FILER` and a memory spike, and the whole buffer is base64-encoded *again* for the AI call. The declared `mimeType` is never sniffed. | `document.schema.ts:3-20`; `documents.service.ts:90` |
| M12 | **Enumeration oracles.** `register` returns 409 for an existing address (a one-shot oracle). `login` uses one message for both cases but **skips `argon2.verify` when the user does not exist**, so a repeatable timing oracle distinguishes real accounts — and the expensive path is the one an attacker wants to trigger anyway (H2). | `auth.service.ts:71-73,134-140` |

---

# Low

- **Logout is overloaded:** `POST /api/auth/logout` with `{}` revokes *every* session of the caller, so
  anyone holding a stolen access token can force-logout the victim everywhere; a body-less request
  throws → 500. (`auth.controller.ts:70-72`; `auth.service.ts:217-222`)
- **Password policy** accepts `password1`: 8 characters, one letter, one digit, no blocklist, no breach
  check, and no reset flow. (`auth.schema.ts:6-11`)
- **Failed logins are not audited** — `AuditEventType` has no failure member, so H2 and M12 are
  invisible after the fact.
- **JWT algorithm not pinned** (`algorithms` absent). Not exploitable with a symmetric secret; matters
  if this ever becomes a PEM key.
- **Invitation metadata is unauthenticated:** `GET /api/households/invitations/:token/details` exposes
  the household name, invited address and inviter to anyone holding the link (32-byte tokens make
  guessing infeasible; forwarding is the residual risk).
- **No proxy trust configured:** behind a load balancer every client shares the proxy IP, so the one
  limiter that could work would throttle all tenants together.

---

# Verified clean

Worth recording, because a security review that only lists failures misdirects the next engineer:

- **Tenant isolation.** Attacker token against 16 victim endpoints (household, workspaces, facts,
  questionnaire, calculation, assessment, return versions, filing package, annex PDF, documents,
  notifications, freelance profiles, audit trail, plus three writes) → **403 on all 16**; anonymous → 401.
  Entity-level IDOR — a victim `documentId` / `assessmentId` / `factId` under the attacker's own
  workspace path → **404**, and the victim's document kept its visibility and the assessment its
  `isFinal:false` afterwards.
- **CORS is pinned**, not reflected: `https://evil.example`, `null` and `localhost:3000.evil.example`
  all receive `access-control-allow-origin: http://localhost:3000`.
- **`alg: none` is rejected** (401), and a token signed with the fallback literal is rejected when the
  real secret is configured.
- **Upload path traversal is neutralised**: `../../../../escaped.txt` is stored as
  `2d711642b726_escaped.txt` inside the workspace directory; nothing escaped `uploads/`. Uploads must
  start `PRIVATE_DRAFT`, and duplicate content is rejected by hash.
- **No SQL injection**: every `$queryRawUnsafe`/`$executeRawUnsafe` uses `$n` binds; only constant DDL
  is interpolated.
- **No XSS sink in the web app**: no `dangerouslySetInnerHTML`, `document.write`, `eval` or
  API-derived `href`/`src`.
- **Auth primitives**: argon2id (m=64 MiB, t=3), 320-bit opaque refresh tokens stored only as SHA-256,
  `isActive` re-read per request, and admin authorisation reading the database e-mail rather than the
  token claim (a stale claim cannot escalate).
- **No privilege escalation via membership**: no endpoint removes a member or changes a role;
  invitations are `PRIMARY_FILER`-only, capped at `CO_FILER`/`VIEWER`, single-use, and cannot demote a
  filer.
- **PDF text escaping** blocks content-stream injection (`\`, `(`, `)`, CR/LF handled).

---

# Remediation order

1. **C2** — one line: delete the fallback, fail fast at boot. Removes an account-takeover primitive
   outright.
2. **C1 + H3** — e-mail verification. It is the single primitive behind both the admin takeover and
   the invitation bypass; everything else in this list is smaller.
3. **H1** — one predicate in one query: stop private facts reaching the return snapshot.
4. **H2, H5** — throttling by default, and `@Roles` on the three viewer-writable routes.
5. **H4, H6, H7, H8** — headers, feed redaction, decide MFA (wire or delete), session revocation.
6. **M1–M3** — the admin/model surface is the remaining place where one compromised operator becomes
   many compromised tenants.

Two of these (C1, H1) deserve a regression test written from the exploit above, because the current
suite passes on both.
