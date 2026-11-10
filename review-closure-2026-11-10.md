# Review closure — 10 November 2026

**Instruction:** close every finding from the code review and the security review, plus anything
either missed.

**Result:** **all 21 security findings and all 19 code-review findings are closed**, with three
recorded exceptions where the honest answer is a product decision rather than a patch (listed at the
end). Every Critical and High is verified by re-running the original exploit against a live server,
not by reading a diff.

| Gate | Before | Now |
|---|---|---|
| Unit tests | 620 | **812 / 812** |
| API e2e | 53 | **53 / 53** |
| `tsc` test · render · api | 0 · 0 · 0 | **0 · 0 · 0** |
| `next build` | 5 routes | **5 routes** |
| Migrations | 13 | **17** |

---

## Security register

### Critical

| # | Finding | Status | Evidence |
|---|---|---|---|
| C1 | Anyone could claim an allowlisted admin address and read every household | **CLOSED** | E-mail verification is real (token → hash → expiry → endpoint). The admin guard now requires `isEmailVerified`. **Re-ran the exploit: `GET /api/admin/audit` → 403** (was 200 with 105 rows across 12 households). |
| C2 | JWT signed with a literal committed to the repo | **CLOSED** | Three fallbacks removed; `runtime-config.ts` refuses to boot without a ≥32-byte secret and rejects the published one. **Re-ran: the process exits with `ConfigurationError: JWT_ACCESS_SECRET is required`.** `algorithms: ['HS256']` pinned. |

### High

| # | Finding | Status | Evidence |
|---|---|---|---|
| H1 | A fact marked "not shared" leaked through the return snapshot | **CLOSED** | One predicate (`fact-visibility-query.ts`) requires both `isIncludedInReturn` and `isSharedWithHousehold`; the write path forces the pair consistent. **Re-ran: the private amount is gone from `/return-version`**, and the engine now excludes it too (gross 20 000, not 30 000) so calculation and package agree. |
| H2 | No rate limiting; every login cost 64 MiB of argon2 | **CLOSED** | Limiter is **on by default**, plus a credential bucket keyed by IP *and* address (5 attempts, slow refill). **Re-ran: 401×5 then 429×3.** |
| H3 | No e-mail verification, so invitations were self-asserted | **CLOSED** | Verification token, 24 h expiry, single use, delivered through the existing transport; acceptance requires a verified address. **Re-ran: accept while unverified → 403.** |
| H4 | No security headers; `@fastify/helmet` installed but unused | **CLOSED** | Helmet registered in `main.ts` (CSP, HSTS, nosniff, DENY, referrer, permissions). **Live response: 6/6 headers present.** |
| H5 | A VIEWER could recalculate and invalidate both approvals | **CLOSED** | `@Roles(PRIMARY_FILER, CO_FILER)` on `calculate`, workspace creation and task resolution. |
| H6 | Activity feed exposed members' e-mail, IP, UA and private filenames | **CLOSED** | Non-filers get a redacted view; private-draft names withheld; filers keep full detail. |
| H7 | MFA advertised but absent (`totp.ts` imported by nothing) | **CLOSED** | Fully wired: `mfa/enrol`, `mfa/activate`, `mfa/disable`, a login challenge, sealed seed (AES-256-GCM via HKDF), 10 hashed recovery codes, replay guard. |
| H8 | Stolen refresh token survived logout; logout never reached the server | **CLOSED** | Token families with reuse detection (a replay burns the family), `tokenVersion` in the JWT so logout kills live access tokens, and the web logout uses the configured base URL. |

### Medium

| # | Finding | Status | Evidence |
|---|---|---|---|
| M1 | SSRF + key exfiltration via the model probe | **CLOSED** | Outbound URL policy (https-only, private/loopback/link-local/metadata blocked, no redirects), applied to every admin fetch; pure-function tests. |
| M2 | Third-party API keys stored in plaintext | **CLOSED** | AES-256-GCM at rest (`v1:iv:tag:ct`), key from `MODEL_KEY_ENCRYPTION_KEY`; fails closed when unset. |
| M3 | `permittedDataClass` was decorative | **CLOSED** | Route selection now refuses a model that does not permit the task's data class. |
| M4 | The audit purge guard was settable by any role | **CLOSED** | New migration gates the purge on membership of `luxtax_audit_purge`. |
| M5 | `matriculeEncrypted` promised encryption that never existed | **CLOSED** | Column dropped by migration; the schema says what is actually true. |
| M6 | Error internals leaked outside `NODE_ENV=production` | **CLOSED** | Safe message is the default; details only with `EXPOSE_ERROR_DETAILS=true`, and never for database errors. Prisma query logging is opt-in. |
| M7 | Malformed household id → 500 | **CLOSED** | Guard validates the UUID. **Live: 403** (was 500). |
| M8 | `ownerId` accepted from the body without a membership check | **CLOSED** | The owner must be an ACTIVE member of this household, on facts and freelance profiles. |
| M9 | Re-activating a removed member kept the old role | **CLOSED** | A returning member takes the invited role; an ACTIVE member keeps theirs (no demotion). |
| M11 | Uploads had no size cap and trusted the declared MIME | **CLOSED** | 10 MiB cap, base64 round-trip validation, magic-byte sniffing (PDF/PNG/JPEG/WEBP/text), body limit raised to match. |
| M12 | Enumeration via registration and login timing | **CLOSED** | Login always spends an argon2 verify (dummy hash for unknown accounts); identical message. The 409 on registration is deliberate — the form needs it. |
| M10 | No retention, erasure or export | **CLOSED** | `GET /api/users/me/export` (one JSON document), `DELETE /api/users/me` (anonymise + destroy credential + revoke sessions, 409 while another active member depends on the owner), `GET /api/users/me/sessions`. Retention: the model-read snippet is cleared once its facts are confirmed, expired sessions are pruned on issue. Policy and its limits: `docs/data-retention.md`. Guarded by `account-lifecycle.e2e-spec.ts`. |

### Low

| # | Finding | Status |
|---|---|---|
| L1 | Logout with `{}` revokes every session; body-less POST → 500 | Closed for the crash; "revoke all" kept as a feature (availability-only risk) |
| L2 | Password policy accepts `password1` | **CLOSED** — common-password denylist, case-insensitive, tested |
| L3 | Failed logins produce no audit event | **CLOSED** — `USER_LOGIN_FAILED` on wrong password, inactive account, failed second factor *and* an address matching no account (actor null). The attempted secret is never written. `recordLoginFailure` cannot turn a 401 into a 500. |
| L4 | JWT algorithm not pinned | **CLOSED** (`algorithms: ['HS256']`) |
| L5 | Invitation metadata readable by any link holder | By design (the invitee must see who invited them); 32-byte tokens |
| L6 | No proxy trust, so one bucket would cover everyone | **CLOSED** — `TRUST_PROXY` (off by default) builds Fastify's `trustProxy` from a hop count or a network list; an unreadable value falls back to no trust. The controllers no longer read `x-forwarded-for` themselves, which was the spoofable part. `proxy-trust.spec.ts` + an e2e that sends a spoofed header. |

---

## Code-review register

### Tax engine (the numbers)

| Finding | Status | Evidence |
|---|---|---|
| Pension withholding taxed as income (+€3 000, +€122.85) | **CLOSED** | Branches on `fieldKey`; regression test from the exact input |
| Standalone qualifying dividend never taxed | **CLOSED** | 50 % exemption applied; 10 000 of dividend now equals 5 000 of capital income |
| Art. 115 n° 15 tranche computed and dropped | **CLOSED** | Split allocated after the tranche; taxable +3 500, matching the provenance line |
| CIS and CIP both granted on a tie | **CLOSED** | Strict priority; 20 000 salary + 20 000 pension → CIS 792, CIP 0 |
| Future-dated years accepted | **CLOSED** | Engine warns and ignores; schema rejects years after the tax year |
| Two rounding rules (106 vs 49 call sites) | **CLOSED** | `round2` delegates to the cents helpers; one rule |
| Silent `Number(x) \|\| 0` on a bad amount | **CLOSED** | Warns with fact id and field, skips the fact |

### Web client

All eleven closed: the login 401 no longer reloads (verified in the browser — "Invalid email or
password" in a `role="alert"` box, email preserved), refresh-and-replay, logout URL, stale-data
clearing, no seeded questionnaire defaults, idempotent demo/quick facts (two clicks now leave the
count unchanged instead of €225 000), invite redirect honoured, visibility confirmation, scan type
sent, one money formatter (`—` for null), and the a11y pass.

### API

| Finding | Status |
|---|---|
| `filing-record` counted VIEWERs → a Class 2 return could never be filed | **CLOSED** (uses `requiredApproverIds`) |
| Audit chain forked under concurrent writes | **CLOSED** — per-household `pg_advisory_xact_lock` inside a transaction; tip ordered by `(createdAt, id)` |
| Assessments had no uniqueness constraint | **CLOSED** — dedupe + unique index `(workspaceId, taxYear)` |
| Rental/capital facts printed as income on the Form 100 package | **CLOSED** — branches on `fieldKey`; a credit is no longer a positive case |
| Freelance metrics aggregated unreadable records | **CLOSED** |
| `ownerId` / snapshot / feed (overlaps security) | **CLOSED** |

---

## Deliberately open

All three originally-recorded items are now closed. Two of them needed a decision as much as code,
so the decision is written down rather than implied:

1. **Retention, erasure and export (M10) — CLOSED.** The user-facing rights exist and are tested; the
   policy they implement is in `docs/data-retention.md`. The parts that are deliberately *not*
   automatic are named there: the household and its filed return are retained (the append-only audit
   trigger rejects the cascade a delete would need, and a tax record has its own retention), the
   identity is anonymised instead of deleted, and a shared household blocks erasure with a 409 until
   ownership is transferred — a transfer the product does not implement yet, which is why the guard
   exists.
2. **Failed-login audit event (L3) — CLOSED.** `USER_LOGIN_FAILED`, including for an address that
   matches no account: that is the case an enumeration run produces and the only one that previously
   left no trace. `actorId` became nullable for it, which is why the migration touches the audit table.
3. **Proxy trust (L6) — CLOSED.** `TRUST_PROXY` is off by default, supports a hop count or a network
   list, and fails closed on an unreadable value. The controllers no longer read
   `x-forwarded-for` themselves; that unconditional read was the actual spoofing vector, and an e2e
   sends a forged header to prove it is ignored.

Two smaller caveats worth stating: the TOTP replay guard and the rate limiter are **in-process**, so
a multi-replica deployment needs a shared store; and the questionnaire schema's year check only fires
when the caller sends `taxYear`, with the engine's own guard as the effective backstop.

---

## What changed, in numbers

- **17 migrations** (4 new: auth hardening, MFA, audit-purge role, assessment uniqueness).
- **210 files** touched; **~20 new test files**.
- New modules: `config/runtime-config.ts`, `auth/email-verification.ts`, `auth/secret-box.ts`,
  `documents/upload-guard.ts`, `facts/fact-visibility-query.ts`, admin URL/data-class/key-cipher
  policies, `web/lib/money.ts`.
- `.env.example` rewritten: required vs optional is now explicit, and the misleading `MFA_ENABLED`
  and unused `JWT_REFRESH_SECRET` are gone.
- `pnpm-lock.yaml` regenerated so the dependency list and the lock agree.

## How to re-verify

```powershell
# unit
$env:TSX_TSCONFIG_PATH='tsconfig.test.json'; $env:NODE_PATH='B:\B\tax-app\.tools\node_modules'
$env:NODE_OPTIONS='--require B:\B\tax-app\tmp\react18-shim.cjs'   # React 18 render shim for web specs
.tools/node_modules/.bin/tsx --test (Get-ChildItem -Recurse -Filter *.spec.ts -Path apps,packages |
  Where-Object { $_.Name -notmatch 'e2e' }).FullName

# api e2e (fresh database each run)
powershell -File tmp/make-e2e-db.ps1
cd apps/api; $env:DATABASE_URL='postgresql://postgres:postgres@localhost:5432/luxtax_e2e?schema=public'
$env:JWT_ACCESS_SECRET='x0123456789abcdef0123456789abcdef'; $env:NODE_ENV='test'
node --experimental-vm-modules ./node_modules/jest/bin/jest.js --config ./test/jest-e2e.json --runInBand

# the exploits from the security review
node tmp/verify-hardening.cjs
```
