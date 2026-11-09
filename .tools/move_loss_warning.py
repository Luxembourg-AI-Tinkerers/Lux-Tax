import io

p = "packages/tax-engine/src/engine.ts"
t = io.open(p, encoding="utf-8", newline="").read()

block = (
    "    if (priorLosses > d.priorLossesDeduction + 0.005) {\r\n"
    "      warnings.push(\r\n"
    "        `Prior-year losses of ${priorLosses.toFixed(2)} exceed what this year's income can ` +\r\n"
    "          `offset: ${d.priorLossesDeduction.toFixed(2)} was applied and ` +\r\n"
    "          `${(priorLosses - d.priorLossesDeduction).toFixed(2)} stays in the Art. 114 ` +\r\n"
    "          'carry-forward.',\r\n"
    "      );\r\n"
    "    }\r\n\r\n"
)
assert t.count(block) == 1, t.count(block)
t = t.replace(block, "", 1)

call = "    const d = calculateDeductions(deductionContext);\r\n"
assert t.count(call) == 1
t = t.replace(call, call + "\r\n" + block, 1)

io.open(p, "w", encoding="utf-8", newline="").write(t)
print("moved")
