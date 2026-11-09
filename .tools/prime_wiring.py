import io

def patch(path, anchor, addition, mode="before"):
    s = io.open(path, encoding="utf-8", newline="").read().replace("\r\n", "\n")
    assert s.count(anchor) == 1, (path, s.count(anchor))
    new = (addition + anchor) if mode == "before" else (anchor + addition)
    io.open(path, "w", encoding="utf-8", newline="").write(s.replace(anchor, new).replace("\n", "\r\n"))

patch("packages/contracts/src/questionnaire.ts",
      "  /** One securities row (capital income). */",
      """  /** Prime jeune salarié (Art. 115 n° 13d). */
  youngEmployeePrime?: number;
  youngEmployeePrimeEligible?: boolean;

""")

patch("packages/validation/src/questionnaire.schema.ts",
      "  securitiesGrossIncome: z.number().min(0).max(100_000_000).optional(),",
      """  youngEmployeePrime: z.number().min(0).max(1_000_000).optional(),
  youngEmployeePrimeEligible: z.boolean().optional(),
""")

patch("apps/api/src/modules/calculations/calculations.service.ts",
      "      relibiFinalElective: answers.relibiFinalElective ?? false,",
      """      youngEmployeePrime: answers.youngEmployeePrime,
      youngEmployeePrimeEligible: answers.youngEmployeePrimeEligible ?? false,
""")
print("ok")
