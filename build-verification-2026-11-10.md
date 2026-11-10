# Build verification — 10 November 2026

**Instruction:** run a production build of `apps/web` and an Expo/Metro bundle for `apps/mobile`,
fix what they surface, close the open checklist item.

---

## 1. `apps/web` — production build: **green**

```
next build   (NODE_ENV=production, NEXT_PUBLIC_API_URL=http://localhost:3001)
✓ Compiled successfully
✓ Generating static pages (5/5)
Route (app)
┌ ○ /
├ ○ /_not-found
├ ƒ /[householdId]/dashboard
├ ƒ /invite/[token]
├ ○ /login
└ ○ /register
exit=0        BUILD_ID 6ZD8uFg_EMiGCLT8KGH_f
```

Nothing to fix — the earlier passes had already closed the defects the build exposed (the
`Content-Type` on bodyless POSTs, the stale-state reads, the money formatter). This run is the
evidence that it still builds from the current tree.

## 2. `apps/mobile` — Metro bundle: **green** (both platforms)

The app had never been bundled. Running it surfaced defects that no test could have caught, because
the app had no build at all:

| # | Defect | Effect before the fix | Fix |
|---|---|---|---|
| 1 | `app.json` referenced `./assets/icon.png`, `./assets/splash-icon.png`, `./assets/adaptive-icon.png` — **the `assets/` directory did not exist** | every Expo command aborts on config validation | three 1024² PNGs generated and committed |
| 2 | **No `babel.config.js`** | Metro has no transform for `.tsx`/JSX in this app | added with `babel-preset-expo` |
| 3 | **No `metro.config.js`**, although the app imports `@luxtax/*` from outside its root | `Unable to resolve module @luxtax/contracts` — every screen fails | added a monorepo config (`watchFolders` for `packages/` only, `LUXTAX_PACKAGES_DIR` override for out-of-tree builds) |
| 4 | **`@babel/runtime` not declared** | `Unable to resolve module @babel/runtime/helpers/interopRequireDefault` — Metro's own prelude | added to `dependencies` |
| 5 | **`expo-asset` not declared** | `The required package expo-asset cannot be found` — `@expo/metro-config` needs it before bundling | added to `dependencies` |

A `build` script was also added so the bundle is reproducible:
`expo export --platform ios --platform android --output-dir dist`.

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

## 3. Also closed this pass

**DS 1553 (EUR 3,200 vs EUR 3,700) — resolved, not a defect.** The e2e report had recorded it as
"one of the two is wrong". Checked against the persisted snapshot of the e2e workspace and a fresh
engine run: 1553 carries the expenses covered by the statutory minimum (1503 Art. 111bis = 3,200),
Art. 112 donations are *additional by law* and sit on case 1611 (500), LRCP 1609 is 0 — so
3,200 + 0 + 500 = 3,700 and the package reconciles to the engine exactly. Folding the donation into
1553 would have double-counted it. Pinned by four new tests in
`apps/api/test/form100-case-map.spec.ts`, which also assert that a forfait above the covered total
is emitted as an INSTRUCTION rather than silently overwriting the case.

**Mobile on a device — accepted limitation**, as recorded in the tracker and in the e2e report's
"Not covered" table.

**PROD-2 closed at the e2e level.** The code review's H6 (the call site the first fix missed) is
resolved: all three service call sites use `requiredApproverIds`, and a new
`apps/api/test/viewer-approver.e2e-spec.ts` drives a Class 2 household containing a VIEWER through
calculate → approve → **file (201)**. Reverting the helper to the pre-fix expression makes 3 of its
6 tests fail, so the guard is real rather than assumed.

## 4. Checklist

The outstanding "final suite + typechecks + tracker + report" item is closed: **826 unit tests**,
**67 API e2e** (8 suites, rebuilt `luxtax_e2e`, 19 migrations), three typechecks at 0, `next build`
green on six routes, and **`apps/mobile` bundling for iOS and Android**. Tracker updated with this
section, with the DS resolution and with the mobile build.
