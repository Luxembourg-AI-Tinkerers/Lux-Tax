import io
p = "packages/tax-engine/src/engine.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""import { fromCents, mulRate, sumCents, toCents } from './money';""",
"""import { fromCents, mulRate, sumCents, toCents } from './money';
import { treatyMethodFor } from './rules/treaties';""")

rep("""    const primaryRental = computeRental(primary);""",
"""    // ------------------------------------------------- treaty relief (Art. 13 / 134bis)
    const foreignItems = params.foreignIncomeItems ?? [];
    const hasForeignItems = foreignItems.length > 0;
    let exemptForeignIncome = 0;
    let creditForeignIncome = 0;
    let foreignTaxPaid = 0;
    const treatyBreakdown: Array<{ country: string; method: string; amount: number }> = [];

    if (hasForeignItems) {
      excludeForeignIncome = true; // the itemised breakdown replaces the generic facts
      for (const item of foreignItems) {
        const method = item.method ?? treatyMethodFor(item.country);
        treatyBreakdown.push({ country: item.country.toUpperCase(), method, amount: item.amount });
        if (method === 'EXEMPTION_PROGRESSION') {
          exemptForeignIncome += item.amount;
        } else {
          creditForeignIncome += item.amount;
          foreignTaxPaid += item.foreignTax;
        }
      }
      provenance.push({
        ruleCode: 'LIR-ART-13-134bis',
        description:
          'Foreign income relief by treaty method: exemption with progression (FR) or ordinary credit (DE/BE/others, Art. 134bis without a treaty)',
        sourceFactIds: [],
        formula: 'credit = min(foreignTax, LU tax attributable); exemption raises the rate only',
        inputs: {
          exemptForeignIncome,
          creditForeignIncome,
          foreignTaxPaid,
          methods: treatyBreakdown.map((t) => `${t.country}:${t.method}`).join(' '),
        },
        outputAmount: creditForeignIncome,
      });
    }

    const primaryRental = computeRental(primary);""")

rep("""    const primaryNet = netOf(primaryIncome);
    const spouseNet = spouseIncome ? netOf(spouseIncome) : 0;
    const netIncome = round2(primaryNet + spouseNet);""",
"""    const primaryNet = netOf(primaryIncome);
    const spouseNet = spouseIncome ? netOf(spouseIncome) : 0;
    // Credit-method foreign income is part of the base; exemption-method income is not.
    const netIncome = round2(primaryNet + spouseNet + creditForeignIncome);""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
