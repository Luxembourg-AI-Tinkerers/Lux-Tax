import io

p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep(
"""## Phase 24 — MOB-6: authenticated package download with a real retry policy""",
"""## Phase 25 — MOB-7: push registration state machine and offline banner

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

## Phase 24 — MOB-6: authenticated package download with a real retry policy""")

rep(
"""| 2026-11-09 | Phase 24 — MOB-6 authenticated download | ✅ **306 / 306 pass, 0 fail** (13 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |""",
"""| 2026-11-09 | Phase 24 — MOB-6 authenticated download | ✅ **306 / 306 pass, 0 fail** (13 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |
| 2026-11-09 | Phase 25 — MOB-7 push + offline banner | ✅ **321 / 321 pass, 0 fail** (15 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
