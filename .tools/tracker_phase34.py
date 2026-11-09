import io

# 1) syntax check list
p = ".tools/syntax_check.cjs"
s = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in s else "\n"
target = '  "apps/mobile/test/render.spec.ts",'
assert s.count(target) == 1
s = s.replace(target, target + nl + '  "packages/tax-engine/test/certificate160.spec.ts",')
io.open(p, "w", encoding="utf-8", newline="").write(s)

# 2) tracker
p2 = "implementation-tracker.md"
raw = io.open(p2, encoding="utf-8", newline="").read()
t = raw.replace("\r\n", "\n")

anchor = "## Closing record — 2026-11-09"
assert t.count(anchor) == 1

phase = """## Phase 34 — certificate 160 gets tests (the mapping that feeds real returns)

**Why this target, given R6/R7 are blocked.** The brief allows advancing on something other than
R6/R7 before the law is published. A name-based sweep for source files with no spec turned up one
high-consequence gap: `packages/tax-engine/src/forms/certificate160.ts`, the table that turns
OCR'd certificate codes into engine field keys, had **no tests at all** — while both `engine.ts` and
`filing.service.ts` depend on it. A silent misparse there does not produce a warning; it produces a
wrong return.

**19 tests in `packages/tax-engine/test/certificate160.spec.ts`, in four groups.**

| Group | Pinned behaviour |
|---|---|
| Table invariants | every entry's `code` equals its key; every `category` is a real `FactCategory`; a **supported** entry must carry a non-empty `fieldKey` and an **unsupported** one must carry `''` (an unsupported code with a field key would still be read); both labels and the note are present; 101/102/103/105/141/S/P/LRCP stay supported |
| Normalisation | `code_101` → `101`, `CODE_141` → `141`, `'  fd '` → `FD`, `lrcp` → `LRCP`; null/blank → `''` |
| Shape detection | `code_*`, three digits, single letters and every table key are certificate-shaped; **an unmapped single letter (`E`) counts as certificate-shaped** so it warns instead of disappearing; `grossSalary`, `socialSecurity`, `mortgageInterest`, `art111bis` are not |
| Engine behaviour | `code_101` gives the *same* `taxableIncome` as `grossSalary`; 101+102 sum into one line; the table overrides a wrong category hint; an unknown code (`code_999`) **warns and is excluded** (taxable income 0); `FD` warns as a withholding-base label and is excluded; an ignored fact does not leak into the kept fact's line; 141 → mortgage interest, P → gross pension |

**One finding, recorded rather than "fixed".** The first run failed on `lrcp`:
`isCertificate160FieldKey('lrcp')` is **true**, because normalisation yields `LRCP`, which is a
certificate code. That is not a defect — the table maps `LRCP` back to category `LRCP_CONTRIBUTION`
and field key `lrcp`, so a fact written either way lands on the same deduction line. The assumption
was wrong, not the code. It is now pinned by its own test so a future rename of either spelling
breaks loudly instead of silently changing which line the contribution reaches.

**Verification:** **414 / 414 tests** (395 + 19), `tsc -p tsconfig.test.json` exit 0,
`tsc -p tsconfig.render.json` exit 0, **56 files** syntax `ok`.

## Closing record — 2026-11-09"""

t = t.replace(anchor, phase, 1)
t = t.replace(
    "> - **Implemented and tested:** Phases 0–33 — tax engine, filing package + annex PDFs, eight",
    "> - **Implemented and tested:** Phases 0–34 — tax engine, filing package + annex PDFs, eight",
    1,
)
t = t.replace(
    ">   Evidence: **395 / 395 tests**, `tsc -p tsconfig.test.json` exit 0,",
    ">   Evidence: **414 / 414 tests**, `tsc -p tsconfig.test.json` exit 0,",
    1,
)
t = t.replace(
    ">   `tsc -p tsconfig.render.json` exit 0 (JSX layer type-checked), 55 files syntax `ok`.",
    ">   `tsc -p tsconfig.render.json` exit 0 (JSX layer type-checked), 56 files syntax `ok`.",
    1,
)
t = t.replace(
    "**Last updated:** 2026-11-09 · Phases 0–33 implemented · **395 tests passing** across **28 spec files**",
    "**Last updated:** 2026-11-09 · Phases 0–34 implemented · **414 tests passing** across **29 spec files**",
    1,
)
t = t.replace(
    "`tsc -p tsconfig.test.json` and `tsc -p tsconfig.render.json` both exit 0 · 55 files syntax `ok`",
    "`tsc -p tsconfig.test.json` and `tsc -p tsconfig.render.json` both exit 0 · 56 files syntax `ok`",
    1,
)
# The closing record enumerates delivered work; update its numbers too.
t = t.replace(
    "configurations at exit 0, 55 files syntax `ok`.",
    "configurations at exit 0, 56 files syntax `ok` — 414 tests.",
    1,
)
t = t.replace(
    "MOB items — 395 tests, two `tsc`",
    "MOB items — and, after the closing decision, Phase 34 added certificate-160 coverage so the table\nthat feeds real returns is no longer untested. Totals: 414 tests, two `tsc`",
    1,
)

io.open(p2, "w", encoding="utf-8", newline="").write(t.replace("\n", "\r\n"))
print("ok")
