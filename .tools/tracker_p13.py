import io
p = "implementation-tracker.md"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""## Phase 12 — prime jeune salarié (LEG-10, Art. 115 n° 13d)""",
"""## Phase 13 — LEG-9: no filing package from a preview package

**Defect.** A 2028 workspace could still generate a filing package. The 2028
("classe U") package is a *preview*: its transition rules are unpublished and the
25-year couple phase-out is not implemented. Emitting a package from it would hand the
taxpayer values to copy into a real return.

| Piece | Where | Behaviour |
|---|---|---|
| Guard | `apps/api/src/modules/filing/filing-year-guard.ts` | pure functions `filingYearVerdict(year)` / `assertFilingYearAllowed(year)`; refuses when the package carries `singleClass`, and lists supported years for an unknown one |
| Wiring | `filing.service.ts` `generateFilingPackage` | runs after the workspace load and before any package work; maps the dedicated error to HTTP 400 |
| Error type | `FilingPackageNotAllowedError` | distinct class so callers can branch without string matching |
| Tests | `apps/api/test/filing-year-guard.spec.ts` | 5 tests: 2025/2026 allowed, 2028 refused with reason, dedicated error (message names `2028.0.0-preview`), unsupported year lists `2025, 2026, 2028`, and **allowed ⇔ `!singleClass`** so the guard tracks package metadata rather than a hard-coded list |

Design note: the decision is derived from the rule package's own `singleClass` flag, not from
`taxYear >= 2028`. If a future package becomes a real, in-force single-class year, the guard
opens automatically — and if a preview flag is ever added to 2027, it closes without a code change.

## Phase 12 — prime jeune salarié (LEG-10, Art. 115 n° 13d)""")

rep("""| 2026-11-09 | Phase 12 — prime jeune salarié | ✅ **201 / 201 pass, 0 fail**; `tsc` exit 0; 45 files syntax `ok` |""",
"""| 2026-11-09 | Phase 12 — prime jeune salarié | ✅ **201 / 201 pass, 0 fail**; `tsc` exit 0; 45 files syntax `ok` |
| 2026-11-09 | Phase 13 — LEG-9 filing-year guard | ✅ **206 / 206 pass, 0 fail** (5 new tests); `tsc` exit 0; 45 files syntax `ok` |""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
