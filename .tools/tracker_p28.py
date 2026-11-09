import io

p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep(
"""## Phase 27 — MOB-9: app-lock policy (thresholds, re-auth, fallback)""",
"""## Phase 28 — MOB-10: save-to-device and share policy

A file leaving the app carries three decisions: its name, its declared type, and whether the
platform shares it or writes it. All three are pure transforms.

| Piece | Where | Behaviour |
|---|---|---|
| Name safety | `sanitizeFileName()` | **basename first** (`../../etc/passwd` → `passwd`), then control chars removed, `<>:"/\\|?*` replaced, leading dots/spaces stripped, reserved device names (`CON`, `LPT1`, …) prefixed with `_`, extension reduced to alphanumerics and lowercased, total capped at 120 characters |
| Descriptor | `describeExport()` | canonical MIME + Apple UTI per kind (`application/pdf` / `com.adobe.pdf`, `image/jpeg` / `public.jpeg`); a `report.pdf.exe` becomes `report.pdf.pdf`, so the declared type and the extension cannot disagree |
| MIME mapping | `mimeForKind()` / `extensionForMime()` | one source of truth; unknown types map to `bin` rather than guessing |
| Route | `chooseShareRoute()` | share sheet when available, direct write when not, and **reject above 25 MB** instead of attempting a share that both platforms fail on |
| Message | `shareRejectionMessage()` | states the actual size, the limit and the alternative (web app) |
| Tests | `apps/mobile/test/file-export.spec.ts` | 20 tests: traversal, separators, control chars, reserved names, leading dots, extension case, empty fallback, length cap; descriptors for PDF/JPEG, double-extension, hostile base name, hash sanitisation, MIME round-trip; share-sheet vs write, the cap boundary, negative and `NaN` sizes, custom cap, rejection wording |

**Bug found by the tests:** the first implementation split the extension *before* removing path
separators, so `../../etc/passwd` was read as stem `..` plus extension `etc/passwd` and came out
as `_.etcpasswd`. The function now takes the basename first, which is both safer and easier to
reason about — and the test asserts the result contains neither `/` nor `..`.

**Verification status:** 373 / 373 tests pass, `tsc -p tsconfig.test.json` exit 0, 50 files syntax
`ok`. **The React Native build was not run** — no `react-native`/`expo` dependencies here — so
`expo-sharing` / `expo-file-system` are not invoked and no file is actually written; the naming,
typing and routing rules are proven.

## Phase 27 — MOB-9: app-lock policy (thresholds, re-auth, fallback)""")

rep(
"""| 2026-11-09 | Phase 27 — MOB-9 app-lock policy | ✅ **353 / 353 pass, 0 fail** (17 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |""",
"""| 2026-11-09 | Phase 27 — MOB-9 app-lock policy | ✅ **353 / 353 pass, 0 fail** (17 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |
| 2026-11-09 | Phase 28 — MOB-10 export/share policy | ✅ **373 / 373 pass, 0 fail** (20 new tests) · `tsc` exit 0 · 50 files syntax `ok` · **RN build not run** |""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
