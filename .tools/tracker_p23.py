import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""## Phase 22 — MOB-4: the queue is wired into the three screens""",
"""## Phase 23 — MOB-5: private-draft redaction and package download

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

## Phase 22 — MOB-4: the queue is wired into the three screens""")

rep("""| 2026-11-09 | Phase 22 — MOB-4 queue wired into screens | ✅ **279 / 279 pass, 0 fail** (7 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |""",
"""| 2026-11-09 | Phase 22 — MOB-4 queue wired into screens | ✅ **279 / 279 pass, 0 fail** (7 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |
| 2026-11-09 | Phase 23 — MOB-5 redaction + download | ✅ **293 / 293 pass, 0 fail** (14 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
