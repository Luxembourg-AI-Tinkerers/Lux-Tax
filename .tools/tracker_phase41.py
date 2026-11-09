import io

# syntax list
p = ".tools/syntax_check.cjs"
s = io.open(p, encoding="utf-8", newline="").read()
nl = "\r\n" if "\r\n" in s else "\n"
target = '  "packages/tax-engine/test/invariants.spec.ts",'
assert s.count(target) == 1
s = s.replace(target, target + nl + '  "packages/tax-engine/test/hostile-input.spec.ts",')
io.open(p, "w", encoding="utf-8", newline="").write(s)

# tracker
p2 = "implementation-tracker.md"
t = io.open(p2, encoding="utf-8", newline="").read().replace("\r\n", "\n")
anchor = "## Phase 40 — a sign error could reduce another income line"
assert t.count(anchor) == 1

phase = """## Phase 41 — hostile input: the engine must stay total

**A probe that found nothing, turned into a contract.** Phase 38–40 each found a defect; this pass
looked at non-finite and wrongly-typed amounts and found the engine already safe:

| Input | Before this phase |
|---|---|
| `Infinity`, `-Infinity`, `NaN` | treated as no amount, every figure stays finite |
| `'abc'`, `null`, `undefined`, `{}` | same |
| `'60000'` (numeric string) | accepted as 60 000 — imports arrive as text, so this must keep working |
| `1e21` | finite output (absurd, but arithmetic on absurd input) |

So nothing was changed in the engine. What was missing is a **regression contract**, now
`packages/tax-engine/test/hostile-input.spec.ts` (12 tests): eight bad-amount cases, the numeric-string
case, a garbage deduction, an absurd-but-finite amount, and a **200-round randomised fuzz** over random
fact sets mixing `NaN`, `±Infinity`, negatives, strings, `null`, objects and unknown certificate codes.

**One assertion of mine was wrong, and the fuzz caught it.** The helper originally required every
figure to be non-negative; round 74 produced `netIncome = −1`. That is not a defect: rental or business
losses can exceed income, making net income negative in a loss year, and the taxable base is floored at
zero afterwards. The contract was split accordingly:

- **always finite**: gross income, net income, taxable income, deductions, base tax, credits, liability,
  balance, effective rate;
- **never negative** (by construction): gross income, taxable income, deductions, base tax, credits,
  liability.

`balancePayableOrRefund` is deliberately in neither non-negative list — it is signed, positive when
payable and negative when refundable.

**Verification:** **482 / 482 tests** (470 + 12), `tsc -p tsconfig.test.json` exit 0,
`tsc -p tsconfig.render.json` exit 0, **62 files** syntax `ok`.

## Phase 40 — a sign error could reduce another income line"""

t = t.replace(anchor, phase, 1)
t = t.replace(
    "> - **Implemented and tested:** Phases 0–40 — tax engine, filing package + annex PDFs, eight",
    "> - **Implemented and tested:** Phases 0–41 — tax engine, filing package + annex PDFs, eight",
    1,
)
t = t.replace(">   Evidence: **470 / 470 tests**,", ">   Evidence: **482 / 482 tests**,", 1)
t = t.replace("61 files syntax `ok`.", "62 files syntax `ok`.", 1)
t = t.replace(
    "**Last updated:** 2026-11-09 · Phases 0–40 implemented · **470 tests passing** across **34 spec files**",
    "**Last updated:** 2026-11-09 · Phases 0–41 implemented · **482 tests passing** across **35 spec files**",
    1,
)
t = t.replace(
    "· 61 files syntax `ok` · **API e2e and a React Native build are NOT run**",
    "· 62 files syntax `ok` · **API e2e and a React Native build are NOT run**",
    1,
)
t = t.replace(
    "Totals: 470 tests, two `tsc` configurations at exit 0, 61 files syntax `ok`.",
    "Totals: 482 tests, two `tsc` configurations at exit 0, 62 files syntax `ok`.",
    1,
)

io.open(p2, "w", encoding="utf-8", newline="").write(t.replace("\n", "\r\n"))
print("ok")
