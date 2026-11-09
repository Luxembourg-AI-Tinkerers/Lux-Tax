import io

p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep(
"""## Phase 26 — MOB-8: deep-link parsing treated as untrusted input""",
"""## Phase 27 — MOB-9: app-lock policy (thresholds, re-auth, fallback)

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

## Phase 26 — MOB-8: deep-link parsing treated as untrusted input""")

rep(
"""| 2026-11-09 | Phase 26 — MOB-8 deep links | ✅ **336 / 336 pass, 0 fail** (15 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |""",
"""| 2026-11-09 | Phase 26 — MOB-8 deep links | ✅ **336 / 336 pass, 0 fail** (15 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |
| 2026-11-09 | Phase 27 — MOB-9 app-lock policy | ✅ **353 / 353 pass, 0 fail** (17 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
