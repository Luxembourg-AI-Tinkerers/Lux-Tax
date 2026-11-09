import io

p = "packages/validation/src/questionnaire.schema.ts"
s = io.open(p, encoding="utf-8", newline="").read()

old = "  notes: z.string().max(1000).optional(),\r\n});\r\n"
new = (
    "  notes: z.string().max(1000).optional(),\r\n"
    "}).superRefine((answers, ctx) => {\r\n"
    "  // Art. 105 habit_pers: the deduction depends on how many years have passed since the year the\r\n"
    "  // valeur locative was fixed (years 1-2 unlimited, 3-6 EUR 4 000, 7-11 EUR 3 000, 12+ EUR 2 000).\r\n"
    "  // Without that year the engine refuses the interest and warns, so the questionnaire must not\r\n"
    "  // accept the combination: a user would otherwise lose a deduction they are entitled to.\r\n"
    "  if (\r\n"
    "    answers.hasPrimaryResidenceMortgage &&\r\n"
    "    answers.mortgageBeforeDisposition !== true &&\r\n"
    "    answers.mortgageOccupancyYear === undefined\r\n"
    "  ) {\r\n"
    "    ctx.addIssue({\r\n"
    "      code: z.ZodIssueCode.custom,\r\n"
    "      path: ['mortgageOccupancyYear'],\r\n"
    "      message:\r\n"
    "        'The year the valeur locative was fixed is required when a mortgage on the primary ' +\r\n"
    "        'residence is declared: the Art. 105 schedule cannot be applied without it, so the ' +\r\n"
    "        'interest would not be deducted. Set mortgageBeforeDisposition instead for a home ' +\r\n"
    "        \"that is still under construction.\",\r\n"
    "    });\r\n"
    "  }\r\n"
    "});\r\n"
)
assert s.count(old) == 1
s = s.replace(old, new, 1)
io.open(p, "w", encoding="utf-8", newline="").write(s)
print("patched")
