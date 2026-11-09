import io

p = "packages/tax-engine/test/tax-engine.spec.ts"
s = io.open(p, encoding="utf-8", newline="").read()

marker = "  test('prior-year losses are capped at the income they can offset, the rest carries forward', () => {"
assert s.count(marker) == 1

added = (
    "  test('a negative amount is refused instead of netting against other income', () => {\r\n"
    "    const result = LuxembourgTaxEngine.calculate({\r\n"
    "      ...base,\r\n"
    "      facts: [\r\n"
    "        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: -60_000 },\r\n"
    "        { id: 'f2', category: 'PENSION_INCOME', fieldKey: 'grossPension', amount: 40_000 },\r\n"
    "      ],\r\n"
    "    });\r\n\r\n"
    "    // The pension alone: gross income must never be reduced (or made negative) by a sign error.\r\n"
    "    close(result.grossIncome, 40_000);\r\n"
    "    close(result.netIncome, 40_000);\r\n"
    "    assert.ok(\r\n"
    "      result.warnings.some((w) => w.includes('has a negative amount (-60000) and was ignored')),\r\n"
    "      JSON.stringify(result.warnings),\r\n"
    "    );\r\n"
    "  });\r\n\r\n"
    "  test('a negative deduction is refused too', () => {\r\n"
    "    const result = LuxembourgTaxEngine.calculate({\r\n"
    "      ...base,\r\n"
    "      facts: [\r\n"
    "        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 },\r\n"
    "        {\r\n"
    "          id: 'f2',\r\n"
    "          category: 'DONATION_DEDUCTION',\r\n"
    "          fieldKey: 'donations',\r\n"
    "          amount: -50_000,\r\n"
    "        },\r\n"
    "      ],\r\n"
    "    });\r\n\r\n"
    "    close(result.deductions.donations, 0);\r\n"
    "    assert.ok(\r\n"
    "      result.warnings.some((w) => w.includes('has a negative amount')),\r\n"
    "      JSON.stringify(result.warnings),\r\n"
    "    );\r\n"
    "  });\r\n\r\n" + marker
)

s = s.replace(marker, added, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
