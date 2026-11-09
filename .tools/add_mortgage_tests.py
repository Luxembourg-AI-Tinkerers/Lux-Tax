import io

p = "packages/tax-engine/test/tax-engine.spec.ts"
s = io.open(p, encoding="utf-8", newline="").read()

# 1) The certificate-mapping test asserted the old uncapped behaviour: inside year 1 of the
#    schedule the interest is still fully deductible, so pin the year instead of the silence.
old = (
    "  test('code_141 reaches the MORTGAGE_INTEREST branch', () => {\r\n"
    "    const result = LuxembourgTaxEngine.calculate({\r\n"
    "      ...base,\r\n"
    "      facts: ["
)
new = (
    "  test('code_141 reaches the MORTGAGE_INTEREST branch', () => {\r\n"
    "    const result = LuxembourgTaxEngine.calculate({\r\n"
    "      ...base,\r\n"
    "      // Year 1 of the valeur-locative schedule: the interest is fully deductible.\r\n"
    "      mortgageFixationYear: 2025,\r\n"
    "      facts: ["
)
assert s.count(old) == 1
s = s.replace(old, new, 1)

# 2) New tests appended to the same describe block that holds the certificate cases.
marker = "  test('an unknown code_999 warns \"not supported\" and changes neither income nor deductions', () => {"
assert s.count(marker) == 1

added = (
    "  test('mortgage interest without the fixation year is refused, not granted without limit', () => {\r\n"
    "    const result = LuxembourgTaxEngine.calculate({\r\n"
    "      ...base,\r\n"
    "      facts: [\r\n"
    "        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 },\r\n"
    "        { id: 'f2', category: 'MORTGAGE_INTEREST', fieldKey: 'code_141', amount: 99_999 },\r\n"
    "      ],\r\n"
    "    });\r\n\r\n"
    "    close(result.deductions.mortgageInterest, 0);\r\n"
    "    assert.ok(\r\n"
    "      result.warnings.some((w) => w.includes('without the year the valeur locative was fixed')),\r\n"
    "      JSON.stringify(result.warnings),\r\n"
    "    );\r\n"
    "  });\r\n\r\n"
    "  test('interest stays fully deductible for a home still under construction', () => {\r\n"
    "    const result = LuxembourgTaxEngine.calculate({\r\n"
    "      ...base,\r\n"
    "      mortgageBeforeDisposition: true,\r\n"
    "      facts: [\r\n"
    "        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 },\r\n"
    "        { id: 'f2', category: 'MORTGAGE_INTEREST', fieldKey: 'code_141', amount: 12_000 },\r\n"
    "      ],\r\n"
    "    });\r\n\r\n"
    "    close(result.deductions.mortgageInterest, 12_000);\r\n"
    "    assert.ok(\r\n"
    "      !result.warnings.some((w) => w.includes('valeur locative was fixed')),\r\n"
    "      'a construction loan must not warn about a missing fixation year',\r\n"
    "    );\r\n"
    "  });\r\n\r\n"
    "  test('the habit_pers schedule caps years 3-6, 7-11 and 12+ respectively', () => {\r\n"
    "    const capAt = (fixationYear: number): number =>\r\n"
    "      LuxembourgTaxEngine.calculate({\r\n"
    "        ...base,\r\n"
    "        mortgageFixationYear: fixationYear,\r\n"
    "        facts: [\r\n"
    "          { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 80_000 },\r\n"
    "          { id: 'f2', category: 'MORTGAGE_INTEREST', fieldKey: 'code_141', amount: 9_000 },\r\n"
    "        ],\r\n"
    "      }).deductions.mortgageInterest;\r\n\r\n"
    "    // taxYear 2025: 2023 = year 3 (4 000), 2017 = year 9 (3 000), 2005 = year 21 (2 000).\r\n"
    "    close(capAt(2023), 4_000);\r\n"
    "    close(capAt(2017), 3_000);\r\n"
    "    close(capAt(2005), 2_000);\r\n"
    "  });\r\n\r\n" + marker
)
s = s.replace(marker, added, 1)

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok")
