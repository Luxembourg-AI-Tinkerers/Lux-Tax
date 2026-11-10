import io

TRACKER = r"B:\B\tax-app\implementation-tracker.md"
raw = io.open(TRACKER, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

SECTION = """## 2026-11-10 — the mobile bundle builds (gap 3's last element)

**`cd apps/mobile && npm run build` exits 0**: iOS 957 modules, Android 954, both written as Hermes
bytecode (~2.5 MB each) under `dist/`, which is git-ignored. The app's own screens, `src/lib`, the
workspace packages and the Expo runtime are all in the bundle — the first real React Native build in
this project.

### Correcting the record

Two earlier conclusions were wrong and are retracted here:

- **"expo@52 is truncated on this registry."** It is not. Registry metadata, a direct download whose
  SHA-1 matches the advertised `shasum`, and jsDelivr's independent mirror all agree on **295 files**
  with the same contents. `npm pack` returning a small archive was correct.
- **"expo imports `../lib/statuses`, which it does not ship."** It does not import it; the published
  file is 50 self-contained lines, identical in a fresh Python extraction and on disk.

### The real blocker

`browserslist`'s nested `caniuse-lite` had been copied incompletely — **611 files, no
`package.json`, no `dist/lib/`** — so its own `dist/unpacker/feature.js` could not load
`../lib/statuses` and the Babel transform worker died before Metro transformed anything. Metro names
whichever file it was transforming when the worker failed, which is why the error pointed at
`expo/src/errors/ExpoErrorManager.native.ts`, then `@babel/runtime/helpers/interopRequireDefault.js`,
then `expo-router/entry.js` on three consecutive runs. Three symptoms, one broken dependency.

A second instance: `@react-navigation/elements` shipped **14 of its 29** assets, missing
`close-icon.png` and `search-icon.png` that its own `index.js` imports.

Both repaired by extracting the published tarballs with Python's `tarfile` — a different extractor
from npm, which was the one thing worth changing: `caniuse-lite` now has 841 files including
`dist/lib/statuses.js`, and the navigation package has all 29 assets.

### Repository defects fixed

| Defect | Fix |
|---|---|
| `apps/mobile` absent from `pnpm-workspace.yaml`, so no install ever resolved it | added |
| `@luxtax/*` declared as bare `"*"`, which pnpm 11 does not link (default `link-workspace-packages=false`); it looked for `@luxtax/config` on the registry | `workspace:*` |
| No lockfile importer for the app → `--frozen-lockfile` would fail | regenerated; `pnpm install --frozen-lockfile` passes |
| `metro.config.js` watched `node_modules` again, which empties Metro's file map when that path is a junction (`Cannot read properties of undefined (reading 'get')`) | watch `packages/` only |
| No `assets/`, `babel.config.js`, `metro.config.js`; `@babel/runtime` and `expo-asset` undeclared | added in this pass |

### The pnpm shim on this machine is a no-op

`pnpm -v` prints nothing and exits 0: the installed `pnpm.ps1` calls `node_modules/pnpm/pnpm` without
a file extension. Every earlier "pnpm install never finishes" observation measured a command that
never ran. Invoked properly (`node …/pnpm/bin/pnpm.mjs`) it reports **11.18.0** and resolves the
mobile graph (1347 packages) before stalling on tarball fetches — the sandbox destroys its outbound
connections (`UND_ERR_DESTROYED`), and `--offline` cannot help because the store never held the
mobile dependencies.

**Verification.** 826 unit tests (159 suites, 81 files), 67 API e2e (8 suites), three typechecks at
0, `next build` six routes, `npm run build` in `apps/mobile` green for both platforms.

---

"""

marker = "## 2026-11-10 — the three policy items, closed"
assert t.count(marker) == 1, "anchor"
t = t.replace(marker, SECTION + marker, 1)

# The old "accepted limitation" rows are no longer true.
old_row = "| **Mobile on a device — ACCEPTED LIMITATION.**"
count = t.count(old_row)
print("mobile limitation rows:", count)

new_row = (
    "| **Mobile on a device — BUILDS.** `cd apps/mobile && npm run build` bundles iOS (957 modules) and "
    "Android (954) to Hermes bytecode; the earlier blocker was a truncated `caniuse-lite` copy, not the "
    "expo package. A device/simulator run still needs hardware this machine does not have. |"
)
lines = t.split("\n")
replaced = 0
for index, line in enumerate(lines):
    if line.startswith(old_row):
        lines[index] = new_row
        replaced += 1
t = "\n".join(lines)
print("rows replaced:", replaced)

io.open(TRACKER, "w", encoding="utf-8", newline=nl).write(t)
print("tracker updated")
