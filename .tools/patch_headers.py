import io

# 1) syntax check list
p = ".tools/syntax_check.cjs"
s = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in s else "\n"
target = '  "packages/tax-engine/test/pending.spec.ts",'
assert s.count(target) == 1
s = s.replace(target, target + nl + '  "apps/mobile/test/render.spec.ts",')
io.open(p, "w", encoding="utf-8", newline="").write(s)

# 2) component headers: the old wording is now stale (they are mounted in tests).
headers = {
    "apps/mobile/src/components/OfflineBanner.tsx": (
        "// UNVERIFIED — no React Native runtime in this workspace.\n"
        "// This component is transpile-checked only; it has never been rendered on a device or\n"
        "// emulator. The decisions behind it are proven in `src/lib/push-and-status.ts` (Phase 25);\n"
        "// see implementation-tracker.md Phase 29 for the exact verification boundary.\n",
        "// PARTLY VERIFIED — mounted in tests, never rendered on a device.\n"
        "// `apps/mobile/test/render.spec.ts` mounts this component with React 18 and walks the\n"
        "// element tree, so props, branches and rendered text are proven (Phase 31). What is NOT\n"
        "// proven: layout, styling, gestures and accessibility bridging — `react-native` is a\n"
        "// primitive shim in `.tools/node_modules`, there is no NativeModule and no build.\n"
        "// The wording and priority come from `src/lib/push-and-status.ts` (Phase 25).\n",
    ),
    "apps/mobile/src/components/AppLockScreen.tsx": (
        "// UNVERIFIED — no React Native runtime in this workspace.\n"
        "// Transpile-checked only; no biometric sensor, no device passcode prompt, no navigation has\n"
        "// ever run against this file. The policy behind it is proven in `src/lib/app-lock.ts`\n"
        "// (Phase 27); see implementation-tracker.md Phase 29 for the verification boundary.\n",
        "// PARTLY VERIFIED — mounted in tests, never rendered on a device.\n"
        "// `apps/mobile/test/render.spec.ts` mounts this screen with React 18 and asserts which\n"
        "// buttons exist for each prompt (Phase 31), including that a discarded session shows\n"
        "// sign-in only. Not proven: the biometric sensor, the device passcode prompt, navigation,\n"
        "// layout and styling. The policy behind it is in `src/lib/app-lock.ts` (Phase 27).\n",
    ),
}

for path, (old, new) in headers.items():
    raw = io.open(path, encoding="utf-8", newline="").read()
    crlf = "\r\n" in raw
    text = raw.replace("\r\n", "\n")
    assert text.count(old) == 1, path
    text = text.replace(old, new, 1)
    if crlf:
        text = text.replace("\n", "\r\n")
    io.open(path, "w", encoding="utf-8", newline="").write(text)
    print("patched", path)
