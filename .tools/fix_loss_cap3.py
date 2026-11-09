import io

p = "packages/tax-engine/src/engine.ts"
t = io.open(p, encoding="utf-8", newline="").read()

ctx_anchor = "      priorYearLosses: priorLosses,\r\n"
assert t.count(ctx_anchor) == 1, t.count(ctx_anchor)
t = t.replace(
    ctx_anchor,
    "      priorYearLosses: priorLosses,\r\n"
    "      availableIncomeForLosses: netIncome,\r\n",
    1,
)

call_marker = "    const d = calculateDeductions(deductionContext);"
assert t.count(call_marker) == 1
t = t.replace(
    call_marker,
    "    if (priorLosses > d.priorLossesDeduction + 0.005) {\r\n"
    "      warnings.push(\r\n"
    "        `Prior-year losses of ${priorLosses.toFixed(2)} exceed what this year's income can ` +\r\n"
    "          `offset: ${d.priorLossesDeduction.toFixed(2)} was applied and ` +\r\n"
    "          `${(priorLosses - d.priorLossesDeduction).toFixed(2)} stays in the Art. 114 ` +\r\n"
    "          'carry-forward.',\r\n"
    "      );\r\n"
    "    }\r\n\r\n"
    + call_marker,
    1,
)
io.open(p, "w", encoding="utf-8", newline="").write(t)
print("engine patched")
