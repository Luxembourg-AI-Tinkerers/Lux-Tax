import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""## Phase 20 — MOB-2: the questionnaire flow called a method that does not exist""",
"""## Phase 21 — MOB-3: offline queue for upload / calculation / approval

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

## Phase 20 — MOB-2: the questionnaire flow called a method that does not exist""")

rep("""| 2026-11-09 | Phase 20 — MOB-2 questionnaire call | ✅ **261 / 261 pass, 0 fail** (4 new static tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |""",
"""| 2026-11-09 | Phase 20 — MOB-2 questionnaire call | ✅ **261 / 261 pass, 0 fail** (4 new static tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |
| 2026-11-09 | Phase 21 — MOB-3 offline queue | ✅ **272 / 272 pass, 0 fail** (11 new tests) · `tsc` exit 0 · 50 files syntax `ok` · screens not wired (RN build unavailable) |""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
