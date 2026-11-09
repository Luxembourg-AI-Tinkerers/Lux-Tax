import io, re
p = "packages/tax-engine/src/engine.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

s = s.replace("""import { fromCents, mulRate, sumCents, toCents } from './money';""",
"""import { addMoney, fromCents, mulRate, sumCents, toCents } from './money';""")

# exact two-decimal accumulation for every money field
pattern = re.compile(r"(\b(?:bucket\.[a-zA-Z]+|art111bis|art111|savingsHousing|lrcp|donations|extraordinaryCharges|mortgageInterest|speculationGain|article100Gain|article99terGain|exemptForeignIncome|creditForeignIncome|foreignTaxPaid)) \+= (amount|profit|item\.amount|item\.foreignTax);")
s, n = pattern.subn(lambda m: f"{m.group(1)} = addMoney({m.group(1)}, {m.group(2)});", s)

# prior losses: sum in cents
s = s.replace("""    const priorLossesFromLedger = lossEntries.reduce((total, entry) => total + entry.amount, 0);""",
"""    const priorLossesFromLedger = fromCents(
      sumCents(...lossEntries.map((entry) => toCents(entry.amount))),
    );""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("replacements:", n)
