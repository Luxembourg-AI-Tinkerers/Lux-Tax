import io

p = "packages/tax-engine/src/deductions.ts"
s = io.open(p, encoding="utf-8", newline="").read()

anchor = "  /** Prior-year losses carried forward (Art. 114). */\r\n  priorYearLosses: number;\r\n"
assert s.count(anchor) == 1, s.count(anchor)
s = s.replace(
    anchor,
    anchor
    + "  /**\r\n"
      "   * The year's net income, i.e. the most a prior-year loss can actually offset. A loss\r\n"
      "   * larger than this is carried forward, not deducted: deducting the full declared amount\r\n"
      "   * would let `totalDeductions` exceed the income it is deducted from.\r\n"
      "   */\r\n"
      "  availableIncomeForLosses?: number;\r\n",
    1,
)

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
assert s.count(old) == 1, s.count(old)
s = s.replace(old, new, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("deductions patched")
