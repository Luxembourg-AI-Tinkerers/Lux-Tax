import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""## Phase 17 — API-10: audit trail is immutable and classified""",
"""## Phase 18 — API-8: rate limiting and TOTP MFA

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

## Phase 17 — API-10: audit trail is immutable and classified""")

rep("""| 2026-11-09 | Phase 17 — API-10 audit chain | ✅ **228 / 228 pass, 0 fail** (8 new tests) · migration 8 applied · trigger installed · `migrate diff` empty |""",
"""| 2026-11-09 | Phase 17 — API-10 audit chain | ✅ **228 / 228 pass, 0 fail** (8 new tests) · migration 8 applied · trigger installed · `migrate diff` empty |
| 2026-11-09 | Phase 18 — API-8 rate limit + MFA | ✅ **250 / 250 pass, 0 fail** (22 new tests, incl. RFC 4226/6238 vectors) · `tsc` exit 0 · flags default off |""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
