import io

# ---------- FactsView: full legal fact list + fixed demo facts
p = "apps/web/src/components/FactsView.tsx"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

old_head = s[s.index("const PRESET_FIELDS = ["):s.index("];", s.index("const PRESET_FIELDS = ["))+2]
new_head = """const PRESET_FIELDS = [
  { category: FactCategory.EMPLOYMENT_INCOME, fieldKey: 'grossSalary', label: 'Gross salary — Art. 95 (certificat 160 code 101)' },
  { category: FactCategory.EMPLOYMENT_INCOME, fieldKey: 'socialSecurity', label: 'Social contributions — code 103' },
  { category: FactCategory.EMPLOYMENT_INCOME, fieldKey: 'withholdingTax', label: 'Tax withheld at source — code 105' },
  { category: FactCategory.EMPLOYMENT_INCOME, fieldKey: 'fraisObtention', label: 'Actual professional expenses — Art. 105 (if above €540)' },
  { category: FactCategory.PENSION_INCOME, fieldKey: 'grossPension', label: 'Pension / rente — Art. 96' },
  { category: FactCategory.PENSION_INCOME, fieldKey: 'withholdingTax', label: 'Withholding on pension' },
  { category: FactCategory.FREELANCE_INCOME, fieldKey: 'freelanceRevenue', label: 'Independent revenue — Art. 14 / 91' },
  { category: FactCategory.BUSINESS_EXPENSE, fieldKey: 'businessExpense', label: 'Deductible business expense — Art. 14 / 91' },
  { category: FactCategory.CAPITAL_INCOME, fieldKey: 'capitalIncome', label: 'Capital income — interest, non-qualifying dividends (Art. 97)' },
  { category: FactCategory.CAPITAL_INCOME, fieldKey: 'qualifyingDividend', label: 'Qualifying dividend — 50 % exempt (Art. 115 n° 15a)' },
  { category: FactCategory.CAPITAL_INCOME, fieldKey: 'withholdingTax', label: 'Withholding on capital income (15 % / RELIBI)' },
  { category: FactCategory.RENTAL_INCOME, fieldKey: 'grossRent', label: 'Gross rent received — Art. 98' },
  { category: FactCategory.RENTAL_INCOME, fieldKey: 'rentalCharges', label: 'Rental charges paid — Art. 98' },
  { category: FactCategory.FOREIGN_INCOME, fieldKey: 'foreignIncome', label: 'Foreign income — Art. 2 / treaties' },
  { category: FactCategory.MORTGAGE_INTEREST, fieldKey: 'mortgageInterest', label: 'Owner-occupier interest — Art. 98 n° 5 / 105' },
  { category: FactCategory.INSURANCE_DEDUCTION, fieldKey: 'insurance111', label: 'Insurance / consumer interest — Art. 111 (€672 envelope)' },
  { category: FactCategory.PENSION_SAVINGS_111BIS, fieldKey: 'art111bis', label: 'Prévoyance-vieillesse — Art. 111bis (€3,200 / €4,500)' },
  { category: FactCategory.SAVINGS_HOUSING, fieldKey: 'savingsHousing', label: 'Épargne-logement — Art. 111 al. 5' },
  { category: FactCategory.LRCP_CONTRIBUTION, fieldKey: 'lrcp', label: 'LRCP personal contribution — Art. 110 n° 3 (€1,200)' },
  { category: FactCategory.DONATION_DEDUCTION, fieldKey: 'donations', label: 'Donations — Art. 112 (additive to the forfait)' },
  { category: FactCategory.CHILDCARE_EXPENSE, fieldKey: 'childcare', label: 'Childcare — Art. 127 (forfait €5,400)' },
  { category: FactCategory.HOUSEHOLD_HELP_EXPENSE, fieldKey: 'householdHelp', label: 'Household help — Art. 127' },
];"""
assert s.count(old_head) == 1
s = s.replace(old_head, new_head)

s = s.replace("""      { category: FactCategory.MORTGAGE_DEDUCTION, fieldKey: 'mortgageInterest', amount: '3500.00', description: 'BCEE Mortgage Debit Interest (Habitation personnelle)' },""",
"""      { category: FactCategory.MORTGAGE_INTEREST, fieldKey: 'mortgageInterest', amount: '3500.00', description: 'BCEE Mortgage Debit Interest (Habitation personnelle)' },""")

s = s.replace("""      { category: FactCategory.INSURANCE_DEDUCTION, fieldKey: 'pension111bis', amount: '3200.00', description: 'Foyer Prévoyance-Vieillesse Private Pension Contract' },""",
"""      { category: FactCategory.PENSION_SAVINGS_111BIS, fieldKey: 'art111bis', amount: '3200.00', description: 'Foyer Prévoyance-Vieillesse Private Pension Contract' },""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("facts view ok")
