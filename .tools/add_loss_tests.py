import io

p = "packages/tax-engine/test/tax-engine.spec.ts"
s = io.open(p, encoding="utf-8", newline="").read()

marker = "  test('mortgage interest without the fixation year is refused, not granted without limit', () => {"
assert s.count(marker) == 1

added = (
    "  test('prior-year losses are capped at the income they can offset, the rest carries forward', () => {\r\n"
    "    const result = LuxembourgTaxEngine.calculate({\r\n"
    "      ...base,\r\n"
    "      priorYearLosses: 900_000,\r\n"
    "      facts: [\r\n"
    "        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 },\r\n"
    "        { id: 'f2', category: 'EMPLOYMENT_INCOME', fieldKey: 'socialSecurity', amount: 0 },\r\n"
    "      ],\r\n"
    "    });\r\n\r\n"
    "    close(result.taxableIncome, 0);\r\n"
    "    // Net income (60 000) less the 1 020 of ordinary deductions: that is all a loss can offset.\r\n"
    "    close(result.deductions.priorLosses, 58_980);\r\n"
    "    close(result.deductions.total, 60_000);\r\n"
    "    assert.ok(\r\n"
    "      result.warnings.some((w) => w.includes('stays in the Art. 114 carry-forward')),\r\n"
    "      JSON.stringify(result.warnings),\r\n"
    "    );\r\n"
    "  });\r\n\r\n"
    "  test('a loss smaller than the income is deducted in full without a warning', () => {\r\n"
    "    const result = LuxembourgTaxEngine.calculate({\r\n"
    "      ...base,\r\n"
    "      priorYearLosses: 5_000,\r\n"
    "      facts: [\r\n"
    "        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 },\r\n"
    "        { id: 'f2', category: 'EMPLOYMENT_INCOME', fieldKey: 'socialSecurity', amount: 0 },\r\n"
    "      ],\r\n"
    "    });\r\n\r\n"
    "    close(result.deductions.priorLosses, 5_000);\r\n"
    "    close(result.taxableIncome, 60_000 - 1_020 - 5_000);\r\n"
    "    assert.ok(\r\n"
    "      !result.warnings.some((w) => w.includes('carry-forward')),\r\n"
    "      'a fully absorbed loss must not warn',\r\n"
    "    );\r\n"
    "  });\r\n\r\n" + marker
)

s = s.replace(marker, added, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
