import io

# --- 1) DeductionContext gains the cap input. ------------------------------------------
p = "packages/tax-engine/src/deductions.ts"
s = io.open(p, encoding="utf-8", newline="").read()

anchor = "  /** Art. 114 prior losses. */\r\n  priorYearLosses: number;\r\n"
assert s.count(anchor) == 1, s.count(anchor)
s = s.replace(
    anchor,
    "  /** Art. 114 prior losses available for set-off. */\r\n"
    "  priorYearLosses: number;\r\n"
    "  /**\r\n"
    "   * The year's net income, i.e. the maximum a prior-year loss can actually offset. A loss\r\n"
    "   * larger than this is carried forward, not deducted: deducting the full declared amount\r\n"
    "   * would let `totalDeductions` exceed the income it is deducted from.\r\n"
    "   */\r\n"
    "  availableIncomeForLosses?: number;\r\n",
    1,
)

# --- 2) Cap the loss deduction at the available income. ---------------------------------
old = "  const priorLossesDeduction = clampPositive(ctx.priorYearLosses);\r\n"
new = (
    "  // Art. 114: a carried-forward loss is set off against this year's income; the part that\r\n"
    "  // does not fit stays in the carry-forward and must never be reported as deducted.\r\n"
    "  const deductionsBeforeLosses = fromCents(\r\n"
    "    sumCents(\r\n"
    "      toCents(fraisObtention),\r\n"
    "      toCents(travel),\r\n"
    "      toCents(mortgageInterestDeduction),\r\n"
    "      toCents(specialExpensesDeduction),\r\n"
    "      toCents(extraordinaryChargesDeduction),\r\n"
    "      toCents(aep),\r\n"
    "      toCents(amvpDeduction),\r\n"
    "    ),\r\n"
    "  );\r\n"
    "  const lossCapacity = Math.max(\r\n"
    "    0,\r\n"
    "    (ctx.availableIncomeForLosses ?? Number.POSITIVE_INFINITY) - deductionsBeforeLosses,\r\n"
    "  );\r\n"
    "  const priorLossesDeduction = Math.min(clampPositive(ctx.priorYearLosses), lossCapacity);\r\n"
)
assert s.count(old) == 1
s = s.replace(old, new, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s)

# --- 3) engine passes the capacity and warns about the carried-forward remainder. -------
p2 = "packages/tax-engine/src/engine.ts"
t = io.open(p2, encoding="utf-8", newline="").read()

ctx_anchor = "      priorYearLosses: priorLosses,\r\n"
assert t.count(ctx_anchor) == 1
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
    "        `Prior-year losses of ${priorLosses.toFixed(2)} exceed the income they can offset this ` +\r\n"
    "          `year: ${d.priorLossesDeduction.toFixed(2)} was applied and ` +\r\n"
    "          `${(priorLosses - d.priorLossesDeduction).toFixed(2)} remains in the Art. 114 ` +\r\n"
    "          'carry-forward.',\r\n"
    "      );\r\n"
    "    }\r\n\r\n"
    + call_marker,
    1,
)
io.open(p2, "w", encoding="utf-8", newline="").write(t)
print("ok")
