import io

p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

# --- 1. The JSX layer was never type-checked; state that in Phase 31 and point to 32.
old31 = "**Verification:** **395 / 395 tests** (384 + 11 renderer tests), `tsc -p tsconfig.test.json` exit 0,\n**55 files** syntax `ok`."
new31 = "**Verification (as originally recorded):** 395 / 395 tests, `tsc -p tsconfig.test.json` exit 0.\n**Correction — see Phase 32:** that `tsc` run did **not** cover these files. `apps/mobile/**` is absent\nfrom `tsconfig.test.json`, so the renderer spec and both components were outside type checking; the\nshim also lived inside `.tools/node_modules`, where `npm install` prunes it."
assert s.count(old31) == 1
s = s.replace(old31, new31, 1)

old_shim = "`react-native` is provided by a **primitive shim** in `.tools/node_modules` that maps"
new_shim = "`react-native` is provided by a **primitive shim** (`.tools/rn-shim`, reached through a tsconfig\npath mapping — see Phase 32 for why it is not in `node_modules`) that maps"
assert s.count(old_shim) == 1
s = s.replace(old_shim, new_shim, 1)

# --- 2. New phase.
anchor = "## Phase 31 — the renderers are mounted, not just transpiled"
assert s.count(anchor) == 1

phase = """## Phase 32 — the JSX layer enters type checking (and a shim that survives installs)

**Two defects found by auditing Phase 31 instead of trusting it.**

**1. The renderer tests were never type-checked.** `tsconfig.test.json` lists `apps/mobile` files
individually and never included `src/components/*.tsx`, `test/render.spec.ts` or a `jsx` setting.
The `tsc` exit 0 reported in Phase 31 was therefore **true and irrelevant** to those files — the
compiler had not opened them. A new `tsconfig.render.json` (extends the test config, adds
`"jsx": "react-jsx"`, includes the two components, their two policy modules and the renderer spec)
immediately produced three real errors, one of them substantive:

```
apps/mobile/test/render.spec.ts(220,9): error TS2769
  Type '{ kind: "SIGN_IN"; }' is not assignable to type 'AuthPrompt | undefined'.
    Property 'reason' is missing ... required in type '{ kind: "SIGN_IN"; reason: "TOO_MANY_FAILURES" }'
```

The discarded-session test had been passing at runtime while asserting an **impossible** prompt: the
component only branches on `prompt.kind`, so a `SIGN_IN` without its `reason` rendered fine. The
fixture is now `{ kind: 'SIGN_IN', reason: 'TOO_MANY_FAILURES' }`, and the test additionally pins the
rendered `Sign in again` heading rather than counting buttons alone. `react-native` needed types for
this to work at all — `.tools/types/react-native.d.ts` declares the five primitives and
`StyleSheet` for the shim only, and is included by `tsconfig.render.json` alone.

**2. The shim was inside `node_modules`, so an install deleted it.** Installing `@types/react`
pruned `.tools/node_modules/react-native` as an extraneous package and the renderer suite failed with
`Cannot find module 'react-native'` — a green suite turning red because of an unrelated install. The
shim now lives in `.tools/rn-shim/index.js` and is wired through `tsconfig.test.json`:

```json
"paths": { "react-native": [".tools/rn-shim/index.js"] }
```

`tsx` resolves tsconfig paths at runtime, so the renderer tests keep working and no future install
can remove the file. The tracker line in Phase 30/31 that placed the shim in `node_modules` was
corrected rather than left to rot.

**Verification:** **395 / 395 tests**, `tsc -p tsconfig.test.json` **exit 0**,
`tsc -p tsconfig.render.json` **exit 0** (new — the JSX layer is now genuinely type-checked),
**55 files** syntax `ok`.

## Phase 31 — the renderers are mounted, not just transpiled"""

s = s.replace(anchor, phase, 1)

# --- 3. Header lines.
s = s.replace(
    "> - **Implemented and tested:** Phases 0–31 — tax engine, filing package + annex PDFs, eight",
    "> - **Implemented and tested:** Phases 0–32 — tax engine, filing package + annex PDFs, eight",
    1,
)
s = s.replace(
    ">   Evidence: **395 / 395 tests**, `tsc` exit 0, 55 files syntax `ok`.",
    ">   Evidence: **395 / 395 tests**, `tsc -p tsconfig.test.json` exit 0,\n"
    ">   `tsc -p tsconfig.render.json` exit 0 (JSX layer type-checked), 55 files syntax `ok`.",
    1,
)
s = s.replace(
    "**Last updated:** 2026-11-09 · Phases 0–31 implemented · **395 tests passing** across **28 spec files** · "
    "**8 Prisma migrations applied to PostgreSQL 18.4, `migrate diff` empty (zero drift)** · "
    "`tsc -p tsconfig.test.json` exit 0 · 55 files syntax `ok` ·",
    "**Last updated:** 2026-11-09 · Phases 0–32 implemented · **395 tests passing** across **28 spec files** · "
    "**8 Prisma migrations applied to PostgreSQL 18.4, `migrate diff` empty (zero drift)** · "
    "`tsc -p tsconfig.test.json` and `tsc -p tsconfig.render.json` both exit 0 · 55 files syntax `ok` ·",
    1,
)

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
