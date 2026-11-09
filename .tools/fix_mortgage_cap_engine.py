import io

p = "packages/tax-engine/src/engine.ts"
t = io.open(p, encoding="utf-8", newline="").read()

call_marker = "    const d = calculateDeductions(deductionContext);"
assert t.count(call_marker) == 1

block = (
    "    if (\r\n"
    "      mortgageInterest > 0 &&\r\n"
    "      params.mortgageFixationYear === undefined &&\r\n"
    "      !params.mortgageBeforeDisposition\r\n"
    "    ) {\r\n"
    "      warnings.push(\r\n"
    "        'Mortgage interest was declared without the year the valeur locative was fixed. The ' +\r\n"
    "          'Art. 105 habit_pers schedule cannot be applied without it, so the deduction was ' +\r\n"
    "          'refused (0) instead of being granted without limit. Supply mortgageFixationYear ' +\r\n"
    "          '(or mortgageBeforeDisposition for a home still under construction).',\r\n"
    "      );\r\n"
    "    }\r\n\r\n"
)

t = t.replace(call_marker, block + call_marker, 1)
io.open(p, "w", encoding="utf-8", newline="").write(t)
print("engine patched")
