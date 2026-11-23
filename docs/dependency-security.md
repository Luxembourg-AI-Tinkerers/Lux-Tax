# Dependency security — the Dependabot register

**Why this file exists.** GitHub reported **28 vulnerabilities on the default branch**
(4 critical, 7 high, 10 moderate, 7 low) after the review closure. Those numbers are per
advisory, and Dependabot counts a package once; the lockfile audit below counts every
*installed copy*, so it is larger by construction. This pass fixes what can be fixed without
breaking a framework, and records what cannot with the reason and an exit condition.

**How the list was produced.** `node .tools/audit_vulns.mjs` parses `pnpm-lock.yaml`, asks the
npm advisory bulk endpoint about every resolved `name@version`, and matches the returned
`vulnerable_versions` ranges with a small semver implementation (no dependency). It reports
each vulnerable *copy*, direct or transitive, so the fix target is a version, not a guess.
`pnpm audit` is the cross-check.

---

## 1. Upgraded, because a patched version exists

Direct dependencies:

| Package | Was | Now | Advisories cleared |
|---|---|---|---|
| `next` | 16.3.5 | **16.4.6** | 3 critical, 6 moderate, 1 low (`<=16.4.0` ranges) |
| `postcss` | 8.4.49 / 8.5.23 / 8.5.28 | **8.5.32** | 4 high, 1 moderate (`<=8.5.22`) |
| `zod` | 3.25.76 | **4.6.7** | 1 high (`<4.6.6`) |
| `fastify` | 5.12.5 | **5.12.8** | 1 low (`<5.12.6`) |

Transitive copies, pinned through `overrides` in `pnpm-workspace.yaml` (each key names the
exact vulnerable copy, so a parent that genuinely needs another major keeps its own):

| Package | Was | Now | Why the jump is safe here |
|---|---|---|---|
| `tar` | 6.2.1 | 7.5.22 | build-time only (`@expo/cli`, `cacache`); API used is `create`/`extract` |
| `@xmldom/xmldom` | 0.7.13 | 0.9.12 | `@expo/plist` DOM parsing; the `DOMParser` surface is unchanged |
| `image-size` | 1.2.1 | 2.1.0 | `metro` asset sizing; same default export and return shape |
| `uuid` | 7.0.3 / 8.3.2 | 11.1.1 | `@expo/bunyan`, `@expo/rudder-sdk-node`, `xcode` — `v4()` only |
| `handlebars` | 4.7.9 | 4.7.10 | `ts-jest` template rendering |
| `mysql2` | 3.15.3 | 3.24.6 | Prisma CLI driver, unused by this schema (PostgreSQL) |
| `deepmerge-ts` | 7.1.5 | 8.0.2 | `@prisma/config`; the exported merge function is the same |
| `fast-uri` | 3.1.8 / 4.2.1 | 3.1.9 / 4.2.3 | patch inside each major (`ajv`, `fast-json-stringify`) |
| `qs` | 6.16.0 | 6.17.1 | `superagent` (test client) |
| `ip-address` | 10.7.2 | 10.7.6 | `@fastify/rate-limit` |
| `sharp` | 0.35.4 | 0.35.5 | `next` image optimisation, patch release |
| `source-map-js` | 1.2.1 | 1.2.2 | `postcss`, patch release |

`zod` is the only **major** on the direct list. The code uses `z.object/string/number/boolean/
array/enum/nativeEnum/literal/optional/default/nullable/refine/superRefine` — all still present
in v4 — and `error.issues` (v3 and v4 both expose it); the 20 controller call sites that read
`error.errors` were moved to `error.issues` in this pass. `.email()` and `.nativeEnum()` remain,
deprecated but functional.

## 2. Resolved on 2026-11-23 (previously open + `.tools` + `effect`)

All **8** remaining GitHub Dependabot alerts (#30–#33, #74–#77) are cleared:

| Package | Where | Resolution | Advisories cleared |
|---|---|---|---|
| `effect` | `pnpm-lock.yaml` | Overridden `3.20.0` → **`3.22.5`** in `pnpm-workspace.yaml` (`@prisma/config@7.10.0` pinned `3.20.0` exact) | 1 high (`GHSA-7589-6fvf-x4pw`) |
| `glob` | `pnpm-lock.yaml` | `@fastify/static` overridden `10.1.4` → **`10.1.12`**, `rimraf` updated to **`6.1.4`**, `sucrase` overridden to **`3.35.1`**, and `glob@10.5.0` overridden to **`14.0.6`** | 1 moderate (`GHSA-3g3m-2fjr-6pw4`) |
| `minimatch` | `pnpm-lock.yaml` | `@nestjs/cli` updated to **`12.0.15`** (`minimatch@11.0.9`) and `glob@14.0.6` pulls `minimatch@11.0.9` natively | 1 moderate (`GHSA-g3hv-75wg-m249`) |
| `deepmerge` | `pnpm-lock.yaml` | `4.3.1` remains (`jest-config`, `@expo/config`); no active advisory in npm bulk DB or Dependabot | — |
| `zod`, `tsx`/`esbuild`, `prisma` | `.tools/package.json` | Updated `zod` to **`^4.6.7`** (aligned with `@luxtax/validation`) and `tsx` to **`^4.23.15`** (`esbuild@0.28.2`), and removed obsolete `prisma@^6.16.2` (`effect@3.16.12`, `deepmerge-ts@7.1.5`) | 3 high, 1 medium (`#30–#33`, `#76`) |

## 3. Re-checking

```powershell
node .tools/audit_vulns.mjs                 # per-copy report from the lockfile
node .tools/audit_vulns.mjs --json tmp/a.json
pnpm audit --audit-level=low                # override .npmrc audit=false with npm_config_audit=true
npm audit --prefix .tools
```

## 4. What the upgrade surfaced

Two defects that the old, flat `node_modules` had been hiding. Both are fixed here, and both
were found by re-running the real build rather than the type checker:

| Defect | Why it appeared now | Fix |
|---|---|---|
| The dashboard activity feed called `event.actorId.substring(0, 8)` unconditionally. `actorId` is optional, and `USER_LOGIN_FAILED` events deliberately have none — the first such row would have crashed the household dashboard. | `next build` typechecks the app; the previous build artefact predated the nullable-actor change. | `event.actorId?.slice(0, 8) \|\| 'system'`, with a comment naming the event that has no actor. |
| `apps/web` inherited `"declaration": true` from `@luxtax/config/tsconfig.base.json`, so TypeScript had to *name* every inferred component type. With pnpm's isolated layout that name resolved to a store path (`TS2742`), and the app would not build. | A Next page/layout is never emitted as a declaration; the flag only made sense for the library packages. | `"declaration": false, "declarationMap": false` in `apps/web/tsconfig.json`. |

## 5. Verification

| Gate | Result |
|---|---|
| `node .tools/audit_vulns.mjs` | **0 vulnerabilities across 0 packages** (2026-11-23) |
| `pnpm audit --audit-level=low` (`npm_config_audit=true`) | **No known vulnerabilities found** |
| `npm audit --prefix .tools` | **0 vulnerabilities** |
| `pnpm --filter @luxtax/api prisma:generate` | **Generated Prisma Client v7.10.0, exit 0** |
| Typechecks (`tsc -b`, `tsconfig.test/web/render/api`, `apps/api`, `apps/web`) | **0 errors** (`apps/mobile` full `tsc` retains pre-existing tab-screen errors outside `tsconfig.render.json`) |
| Unit suites (`tax-engine`, `validation`, `design-tokens`, `mobile`, `web`, `api`) | **924 collected — 922 pass, 2 skipped without Tesseract** (214 + 34 + 9 + 134 + 84 + 449) |
| `apps/api` build (`rimraf` + `nest build`) & `next build` (Next 16.4.6) | **Exit 0, 6 web routes** |

**Mobile.** The earlier note in this section said the bundle could not be re-verified because Metro followed pnpm's store symlink. That was corrected in `build-verification-2026-11-10.md`: the real blocker was a truncated `caniuse-lite` copy inside `browserslist`, plus missing `babel.config.js`, `@babel/runtime` and `expo-asset`. With those fixed, `apps/mobile` bundles for **iOS (957 modules, 2.5 MB Hermes)** and **Android (954 modules, 2.5 MB)** — `npm run build` exits 0. The bundle was produced with npm in an out-of-tree sandbox because a full pnpm install for the mobile app could not complete in that environment; the overrides that land in the mobile tree (`tar`, `image-size`, `uuid`, `@xmldom/xmldom`) are build-time tooling. On-device execution is still unverified (no hardware).
