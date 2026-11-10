import io

section = """## 2026-11-10 — build verification: web green, mobile unbundleable here

`next build` produces the six routes and exits 0 (`BUILD_ID 6ZD8uFg_EMiGCLT8KGH_f`); nothing new to
fix. The mobile app had never been bundled, and the attempt exposed **five real defects**, all fixed:

1. `app.json` referenced three images that **did not exist** (no `assets/` at all) — any Expo command
   aborted on config validation.
2. **No `babel.config.js`** — Metro had no transform for `.tsx`.
3. **No `metro.config.js`**, although the app imports `@luxtax/*` from outside its root — every screen
   failed with "Unable to resolve module @luxtax/contracts".
4. **`@babel/runtime` was not declared** — Metro's own prelude failed to resolve its helpers.
5. **`expo-asset` was not declared** — `@expo/metro-config` needs it before bundling.

With those fixed, Metro resolves **772 modules** of the real app (screens, `src/lib`, the workspace
packages through symlinks) and then dies inside `expo` itself:
`src/errors/ExpoErrorManager.native.ts: Cannot find module '../lib/statuses'`.

That is an environment defect: `expo@52` ships TypeScript sources only (`main: src/Expo.ts`,
`build/` contains **0** `.js` modules), and every install of it obtainable here is truncated —
83 source modules with an empty `src/lib`, reproduced by two independent installs of two different
major versions, after which `npm install` into the tree aborts with `Invalid Version`.
`npm cache verify` found and cleared 69 corrupt entries (128 MB), which is how `react-native`
eventually installed at all.

`apps/mobile/package.json` gained a `build` script (`expo export … --output-dir dist`) so the bundle
is one command on a machine with a working install. Details:
`build-verification-2026-11-10.md`.

---

"""

p = r"B:\B\tax-app\implementation-tracker.md"
raw = io.open(p, encoding="utf-8-sig", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
s = raw.replace("\r\n", "\n")

marker = "## 2026-11-10 — review closure: 21 security + 19 code findings"
assert s.count(marker) == 1, s.count(marker)

s = s.replace(marker, section + marker, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", nl))
print("tracker updated")
