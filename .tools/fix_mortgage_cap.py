import io

# 1) deductions.ts: an unknown fixation year must refuse the deduction, not uncap it.
p = "packages/tax-engine/src/deductions.ts"
s = io.open(p, encoding="utf-8", newline="").read()
old = (
    "  if (interest <= 0) return 0;\r\n"
    "  if (beforeDisposition || fixationYear === undefined) return interest;\r\n"
)
new = (
    "  if (interest <= 0) return 0;\r\n"
    "  // Construction before libre disposition: the interest is fully deductible.\r\n"
    "  if (beforeDisposition) return interest;\r\n"
    "  // The ACD schedule counts from the year the valeur locative was fixed. Without that year\r\n"
    "  // the band cannot be determined, so the deduction is refused (0) rather than granted\r\n"
    "  // without limit: an unlimited owner-occupier interest would wipe out any taxable income,\r\n"
    "  // which is the over-deduction this engine must never produce. engine.ts warns.\r\n"
    "  if (fixationYear === undefined) return 0;\r\n"
)
assert s.count(old) == 1
s = s.replace(old, new, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s)

# 2) engine.ts: warn about the refused deduction.
p2 = "packages/tax-engine/src/engine.ts"
t = io.open(p2, encoding="utf-8", newline="").read()
anchor = (
    "      mortgageInterest,\r\n"
    "      mortgageFixationYear: params.mortgageFixationYear,\r\n"
)
assert t.count(anchor) == 1
warning_block = (
    "      mortgageInterest,\r\n"
    "      mortgageFixationYear: params.mortgageFixationYear,\r\n"
)

# Insert the warning just before the deduction context is built.
before_marker = "      lrcpDeclared: lrcp,\r\n      mortgageInterest,\r\n"
assert t.count(before_marker) == 1
t = t.replace(
    before_marker,
    "      lrcpDeclared: lrcp,\r\n"
    "      mortgageInterest,\r\n",
    1,
)

# Place the warning right before `const deductions =` (search for the call).
call_marker = "    const deductions = calculateDeductions({"
assert t.count(call_marker) == 1
t = t.replace(
    call_marker,
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
    + call_marker,
    1,
)

io.open(p2, "w", encoding="utf-8", newline="").write(t)
print("patched both")
