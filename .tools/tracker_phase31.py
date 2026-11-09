import io

p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

anchor = "## Phase 30 — the pending-measure gate becomes executable"
assert s.count(anchor) == 1

phase = """## Phase 31 — the renderers are mounted, not just transpiled

**Gap targeted.** Phases 27–29 shipped two components with the honest label *“The React Native
build was not run”*. That label was accurate but coarse: it also hid the fact that the components
had **never been executed at all** — a JSX typo, a wrong prop name or an unreachable branch would
have passed the whole suite. Transpiling proves syntax; it does not prove that `props.onRetry`
exists on the object React receives.

**What changed.** `react@18.3.1` and `react-test-renderer@18.3.1` were installed into the scratch
toolchain, and `react-native` is provided by a **primitive shim** in `.tools/node_modules` that maps
`View` / `Text` / `TouchableOpacity` / `Pressable` / `ScrollView` to host components and passes
`StyleSheet.create` through unchanged. `apps/mobile/test/render.spec.ts` (11 tests) then mounts both
components with real React and walks the resulting element tree.

| Test | What it pins |
|---|---|
| banner hidden | `deriveOfflineStatus` says not visible → the component returns `null`, not an empty box |
| offline copy | title and detail come from the policy layer, and `View`/`Text` are actually emitted |
| retry button | present **only** with a handler *and* a level other than `ONLINE`; absent otherwise |
| pinned status | `statusOverride: STALE` renders exactly `['Data may be outdated', 'Last sync was long ago.', 'Retry']` and applies `#1e3a8a` |
| accessibility | the root carries `accessibilityRole="alert"` |
| lock, biometrics | two buttons, both wired; no callback fires on render |
| lock, not enrolled | the biometric button is **not rendered**, and the copy names the real reason |
| lock, locked out | the countdown number reaches the screen |
| lock, discarded session | **one** button only — sign-in — so a locked-out user cannot retry by tapping |
| lock, no override | the screen derives its own prompt from `app-lock.ts` |
| lock, disabled | still renders a coherent screen rather than throwing |

**What this does and does not prove.** Proven: the components mount, read their props, take the
intended branches, and render the exact text the policy produced. Not proven: layout, styling,
gestures, the biometric sensor, the device passcode prompt, navigation — there is no NativeModule
and no build. The header comments on both files were rewritten from *“UNVERIFIED — transpile-checked
only”* to *“PARTLY VERIFIED — mounted in tests, never rendered on a device”*, because the old text
had become untrue.

**Verification:** **395 / 395 tests** (384 + 11 renderer tests), `tsc -p tsconfig.test.json` exit 0,
**55 files** syntax `ok`.
**Still true:** no React Native build was run; nothing here has touched a device.

## Phase 30 — the pending-measure gate becomes executable"""

s = s.replace(anchor, phase, 1)

# Header status box + evidence counts
s = s.replace(
    "> - **Implemented and tested:** Phases 0–30 — tax engine, filing package + annex PDFs, eight",
    "> - **Implemented and tested:** Phases 0–31 — tax engine, filing package + annex PDFs, eight",
    1,
)
s = s.replace(
    ">   Evidence: **384 / 384 tests**, `tsc` exit 0, 54 files syntax `ok`.",
    ">   Evidence: **395 / 395 tests**, `tsc` exit 0, 55 files syntax `ok`.",
    1,
)
s = s.replace(
    "Everything else is implemented and evidenced (384 tests, 8 migrations, zero drift).",
    "Everything else is implemented and evidenced (395 tests, 8 migrations, zero drift).",
    1,
)
s = s.replace(
    "> - **Written but unverified:** the two mobile renderers (`OfflineBanner`, `AppLockScreen`) and the\n"
    ">   screen wiring in Phases 22–24 — no React Native runtime exists in this workspace, so nothing\n"
    ">   here can be rendered or exercised on a device.",
    "> - **Mounted in tests, not on a device:** the two mobile renderers (`OfflineBanner`,\n"
    ">   `AppLockScreen`) are now mounted with React 18 through a `react-native` primitive shim\n"
    ">   (Phase 31), so their props, branches and rendered text are proven. Layout, styling,\n"
    ">   gestures and the biometric sensor are **not** — there is no NativeModule and no build here,\n"
    ">   and the Phase 22–24 screen wiring remains transpile-only.",
    1,
)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
