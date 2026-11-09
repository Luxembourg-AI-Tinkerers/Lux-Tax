import io
src = "apps/api/prisma/schema.prisma"
s = io.open(src, encoding="utf-8", newline="").read().replace("\r\n", "\n")

added = ["CAPITAL_INCOME","RENTAL_INCOME","FOREIGN_INCOME","MORTGAGE_INTEREST",
         "PENSION_SAVINGS_111BIS","SAVINGS_HOUSING","LRCP_CONTRIBUTION","HOUSEHOLD_HELP_EXPENSE"]
for value in added:
    line = f"  {value}\n"
    assert s.count(line) == 1, value
    s = s.replace(line, "")

annex = '  annexesJson        Json          @default("[]")\n'
assert s.count(annex) == 1
s = s.replace(annex, "")

io.open(".tools/schema-baseline.prisma", "w", encoding="utf-8", newline="\n").write(s)
print("baseline written")
