import io
p = "apps/api/prisma/schema.prisma"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

old = """enum FactCategory {
  EMPLOYMENT_INCOME
  FREELANCE_INCOME
  BUSINESS_EXPENSE
  PENSION_INCOME
  MORTGAGE_DEDUCTION
  INSURANCE_DEDUCTION
  DONATION_DEDUCTION
  CHILDCARE_EXPENSE
  OTHER_DEDUCTION
}"""

new = """enum FactCategory {
  EMPLOYMENT_INCOME
  FREELANCE_INCOME
  BUSINESS_EXPENSE
  PENSION_INCOME
  CAPITAL_INCOME
  RENTAL_INCOME
  FOREIGN_INCOME
  MORTGAGE_DEDUCTION
  MORTGAGE_INTEREST
  INSURANCE_DEDUCTION
  PENSION_SAVINGS_111BIS
  SAVINGS_HOUSING
  LRCP_CONTRIBUTION
  DONATION_DEDUCTION
  CHILDCARE_EXPENSE
  HOUSEHOLD_HELP_EXPENSE
  OTHER_DEDUCTION
}"""

assert s.count(old) == 1
out = s.replace(old, new).replace("\n", "\r\n")
io.open(p, "w", encoding="utf-8", newline="").write(out)
print("prisma enum updated")
