import io

p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep(
"""## Phase 25 — MOB-7: push registration state machine and offline banner""",
"""## Phase 26 — MOB-8: deep-link parsing treated as untrusted input

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

## Phase 25 — MOB-7: push registration state machine and offline banner""")

rep(
"""| 2026-11-09 | Phase 25 — MOB-7 push + offline banner | ✅ **321 / 321 pass, 0 fail** (15 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |""",
"""| 2026-11-09 | Phase 25 — MOB-7 push + offline banner | ✅ **321 / 321 pass, 0 fail** (15 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |
| 2026-11-09 | Phase 26 — MOB-8 deep links | ✅ **336 / 336 pass, 0 fail** (15 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
