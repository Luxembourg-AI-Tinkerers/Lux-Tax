import io

p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep(
"""## Phase 23 — MOB-5: private-draft redaction and package download""",
"""## Phase 24 — MOB-6: authenticated package download with a real retry policy

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

## Phase 23 — MOB-5: private-draft redaction and package download""")

rep(
"""| 2026-11-09 | Phase 23 — MOB-5 redaction + download | ✅ **293 / 293 pass, 0 fail** (14 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |""",
"""| 2026-11-09 | Phase 23 — MOB-5 redaction + download | ✅ **293 / 293 pass, 0 fail** (14 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |
| 2026-11-09 | Phase 24 — MOB-6 authenticated download | ✅ **306 / 306 pass, 0 fail** (13 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
