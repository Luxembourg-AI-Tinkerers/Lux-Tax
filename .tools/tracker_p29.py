import io

p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep(
"""## Phase 28 — MOB-10: save-to-device and share policy""",
"""## Phase 29 — MOB-11: banner and lock components (renderers only)

Both components are deliberately thin: every decision already lives in a tested pure module, so
these files only map a level or a prompt to colours and buttons. That is also why they are the
only mobile files marked **unverified**.

| Component | Reuses | Behaviour |
|---|---|---|
| `apps/mobile/src/components/OfflineBanner.tsx` | `deriveOfflineStatus()` (Phase 25) | returns `null` when the status is not visible; colours by level; optional **Retry** button when the queue has work; `accessibilityRole="alert"` so a screen reader announces the change |
| `apps/mobile/src/components/AppLockScreen.tsx` | `nextAuthPrompt()` (Phase 27) | renders `UNLOCK_BIOMETRIC` / `UNLOCK_PASSCODE` / `WAIT` (with countdown) / `SIGN_IN` / `NONE`; a discarded session shows **only** the sign-in button, so a locked-out user cannot retry by tapping; passcode text names the actual reason (`NO_BIOMETRICS`, `NOT_ENROLLED`, biometric failure) |
| Header marker | both files | `// UNVERIFIED — no React Native runtime in this workspace.` with the exact boundary stated (transpile-checked only; no sensor, no navigation) |
| Tests | — | none by design: there is no logic to test that is not already covered by Phases 25 and 27. The components are covered by the transpile check only |

**Why no new tests here.** Writing tests for JSX that cannot render would assert on mocks of
React Native internals, which proves the mock, not the screen. The defensible split is: policy is
tested (54 tests across Phases 25 and 27), rendering is marked unverified.

**Verification status:** 373 / 373 tests pass (unchanged — these files add no testable logic),
`tsc -p tsconfig.test.json` exit 0, **52 files** syntax `ok` (the two new components included).
**The React Native build was not run**; neither component has been rendered.

## Phase 28 — MOB-10: save-to-device and share policy""")

rep(
"""| 2026-11-09 | Phase 28 — MOB-10 export/share policy | ✅ **373 / 373 pass, 0 fail** (20 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |""",
"""| 2026-11-09 | Phase 28 — MOB-10 export/share policy | ✅ **373 / 373 pass, 0 fail** (20 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |
| 2026-11-09 | Phase 29 — MOB-11 banner + lock components | ✅ 373 / 373 pass (no new logic) · `tsc` exit 0 · **52 files** syntax `ok` · **components never rendered** |""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
