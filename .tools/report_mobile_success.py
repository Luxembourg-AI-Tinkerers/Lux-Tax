import io

NEW = '''### Resolved: the mobile bundle builds

**`cd apps/mobile && npm run build` exits 0 and produces both bundles.**

```
iOS     Bundled  957 modules  ->  dist/_expo/static/js/ios/entry-*.hbc      2.5 MB
Android Bundled  954 modules  ->  dist/_expo/static/js/android/entry-*.hbc  2.5 MB
Exported: dist
```

That is a real React Native bundle from this app's own screens, `src/lib`, the workspace packages
and the Expo runtime — the first one in this project. `dist/` is git-ignored.

### The earlier conclusion was wrong, and this is the correction

Two things in the previous report were mistaken:

1. **"`expo@52` is truncated on this registry."** It is not. Verified three ways: the registry's
   metadata, a direct `urllib` download whose SHA-1 matches the advertised `shasum`
   (`b73982…`), and jsDelivr's independent mirror of the public registry — all agree on **295 files**
   and the same contents. `npm pack` producing a small archive was correct behaviour, not a defect.
2. **"`expo` imports `../lib/statuses`, which it does not ship."** It does not import it. The
   published `src/errors/ExpoErrorManager.native.ts` is 50 self-contained lines, identical in a fresh
   Python extraction and on disk. The `../lib/statuses` string does not occur anywhere in the package.

### The actual blocker

`browserslist`'s nested `caniuse-lite` had been copied incompletely: **611 files, no `package.json`,
and no `dist/lib/`**. `caniuse-lite/dist/unpacker/feature.js` starts with
`const statuses = require('../lib/statuses')`, so the Babel transform worker died before Metro had
transformed anything.

Metro reports such a failure against whichever file it was transforming at that moment, which is why
the message named `expo/src/errors/ExpoErrorManager.native.ts`, then
`@babel/runtime/helpers/interopRequireDefault.js`, then `expo-router/entry.js` across three runs. I
read those as three separate package defects; they were one broken dependency, reported from three
places.

A second, smaller instance of the same thing: `@react-navigation/elements` had **14 of its 29**
assets, missing `close-icon.png` and `search-icon.png`, which its own `index.js` imports.

Both were repaired by downloading the published tarball and extracting it with Python's `tarfile` —
a different extractor from npm, as suspected might matter: `caniuse-lite` now has 841 files
including `dist/lib/statuses.js`, and `@react-navigation/elements` has all 29 assets.

### What was wrong in the repository, and is now fixed

| Defect | Fix |
|---|---|
| `apps/mobile` was absent from `pnpm-workspace.yaml`, so no install ever tried to resolve it | added to the workspace |
| Its `@luxtax/*` dependencies used a bare `"*"`, which pnpm 11 does not link to a workspace package (`link-workspace-packages` defaults to false) — it went to the registry for `@luxtax/config` | `workspace:*` throughout |
| The lockfile had no importer for the app, so `--frozen-lockfile` would have failed for everyone | regenerated; `pnpm install --frozen-lockfile` now passes |
| `metro.config.js` watched `node_modules` a second time, which makes Metro build an empty file map when that folder is a junction (`Cannot read properties of undefined (reading 'get')`) | watch `packages/` only |
| No `assets/`, no `babel.config.js`, no `metro.config.js`, `@babel/runtime` and `expo-asset` undeclared | added earlier in this pass |

### On pnpm itself

The verifier was right to ask. Two findings:

- **The `pnpm` shim on this machine is a no-op.** `pnpm -v` prints nothing and exits 0; the installed
  `pnpm.ps1` invokes `node_modules/pnpm/pnpm` without a file extension. Every earlier "pnpm install
  never finishes" observation was measuring a command that never ran. The real entry point,
  `node …/pnpm/bin/pnpm.mjs`, reports **11.18.0** and works.
- With it, `pnpm install --filter @luxtax/mobile...` resolves the graph (**1347 packages**) and then
  stalls adding them: the sandbox destroys its outbound connections (`UND_ERR_DESTROYED`), and
  `--offline` cannot help because the store never contained the mobile dependencies. Retrying with
  `--network-concurrency=1` got further (resolved + 575 linked) but stalled before creating the tree.

So the bundle was produced with npm, in the same out-of-tree sandbox pattern the web and API use, and
the repository defects that prevented a clean install are fixed so that a healthy machine can do it in
one command.

'''

p = r"B:\B\tax-app\build-verification-2026-11-10.md"
raw = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in raw else "\n"
t = raw.replace("\r\n", "\n")

start = t.find("### The published tarball is a stub")
end = t.find("## 3. Also closed this pass")
assert start != -1 and end > start, (start, end)

t = t[:start] + NEW + t[end:]

io.open(p, "w", encoding="utf-8", newline=nl).write(t)
print("build report: mobile section replaced with the successful build")
