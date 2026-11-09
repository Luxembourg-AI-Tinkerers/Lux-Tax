import io

# syntax list
p = ".tools/syntax_check.cjs"
s = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in s else "\n"
target = '  "packages/tax-engine/test/hostile-input.spec.ts",'
assert s.count(target) == 1
s = s.replace(
    target,
    target + nl
    + '  "packages/validation/src/questionnaire.schema.ts",' + nl
    + '  "packages/validation/test/mortgage-year.spec.ts",',
)
io.open(p, "w", encoding="utf-8", newline="").write(s)

# tracker
p2 = "implementation-tracker.md"
t = io.open(p2, encoding="utf-8", newline="").read().replace("\r\n", "\n")
anchor = "## Phase 41 — hostile input: the engine must stay total"
assert t.count(anchor) == 1

phase = """## Phase 42 — closing the loop on my own Phase 38 change

**A regression risk I created.** Phase 38 made the engine refuse owner-occupier interest when the year
the valeur locative was fixed is missing. That is the right engine behaviour, but it moved the failure
to a place the user cannot see: the questionnaire accepted "mortgage on the primary residence = yes"
with the year left blank, and the taxpayer only discovered the loss in the `warnings` array after the
calculation. A deduction they are entitled to would vanish because of a missing optional field.

**Fix at the boundary.** `questionnaireSchema` now refines the object: declaring
`hasPrimaryResidenceMortgage` without `mortgageOccupancyYear` is rejected **unless**
`mortgageBeforeDisposition` is true (a home under construction is fully deductible and needs no year).
The message states the consequence, not just the rule: *"the Art. 105 schedule cannot be applied
without it, so the interest would not be deducted"*.

Six tests (`packages/validation/test/mortgage-year.spec.ts`): no mortgage accepted; mortgage without a
year rejected on `mortgageOccupancyYear`; mortgage with a year accepted; construction accepted without
a year; the non-owner-occupier case still optional; the message names the consequence.

**Type coverage.** `packages/validation/**` was **not** in `tsconfig.test.json` — the validation package
was executed by the suite but never compiled there. Adding it exposed a second gap: `zod` could not be
resolved by `tsc` at all (it lives in the scratch toolchain and was reachable only through `NODE_PATH`
at runtime). A `zod` path mapping fixed both, so the whole validation package is now type-checked in
the main configuration.

**Verification:** **488 / 488 tests** (482 + 6), `tsc -p tsconfig.test.json` exit 0,
`tsc -p tsconfig.render.json` exit 0, **64 files** syntax `ok`.

## Phase 41 — hostile input: the engine must stay total"""

t = t.replace(anchor, phase, 1)
t = t.replace(
    "> - **Implemented and tested:** Phases 0–41 — tax engine, filing package + annex PDFs, eight",
    "> - **Implemented and tested:** Phases 0–42 — tax engine, filing package + annex PDFs, eight",
    1,
)
t = t.replace(">   Evidence: **482 / 482 tests**,", ">   Evidence: **488 / 488 tests**,", 1)
t = t.replace("62 files syntax `ok`.", "64 files syntax `ok`.", 1)
t = t.replace(
    "**Last updated:** 2026-11-09 · Phases 0–41 implemented · **482 tests passing** across **35 spec files**",
    "**Last updated:** 2026-11-09 · Phases 0–42 implemented · **488 tests passing** across **36 spec files**",
    1,
)
t = t.replace(
    "· 62 files syntax `ok` · **API e2e and a React Native build are NOT run**",
    "· 64 files syntax `ok` · **API e2e and a React Native build are NOT run**",
    1,
)
t = t.replace(
    "Totals: 482 tests, two `tsc` configurations at exit 0, 62 files syntax `ok`.",
    "Totals: 488 tests, two `tsc` configurations at exit 0, 64 files syntax `ok`.",
    1,
)

io.open(p2, "w", encoding="utf-8", newline="").write(t.replace("\n", "\r\n"))
print("ok")
