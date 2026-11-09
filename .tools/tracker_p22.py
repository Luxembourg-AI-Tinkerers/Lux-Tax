import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""## Phase 21 — MOB-3: offline queue for upload / calculation / approval""",
"""## Phase 22 — MOB-4: the queue is wired into the three screens

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

## Phase 21 — MOB-3: offline queue for upload / calculation / approval""")

rep("""| 2026-11-09 | Phase 21 — MOB-3 offline queue | ✅ **272 / 272 pass, 0 fail** (11 new tests) · `tsc` exit 0 · 50 files syntax `ok` · screens not wired (RN build unavailable) |""",
"""| 2026-11-09 | Phase 21 — MOB-3 offline queue | ✅ **272 / 272 pass, 0 fail** (11 new tests) · `tsc` exit 0 · 50 files syntax `ok` |
| 2026-11-09 | Phase 22 — MOB-4 queue wired into screens | ✅ **279 / 279 pass, 0 fail** (7 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
