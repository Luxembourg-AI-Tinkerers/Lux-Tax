import io
p = "packages/tax-engine/src/engine.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:60])
    s = s.replace(old, new)

rep("""import { cimFor, resolvePerPersonCredits } from './credits';""",
"""import { cimFor, cissmForSalary, resolvePerPersonCredits } from './credits';""")

rep("""    const credits: CreditBreakdownDto = {
      startup: startupCredit,
      foreignTaxCredit: foreignTaxCreditComputed,""",
"""    const cissmAmount = round2(
      cissmForSalary(primaryIncome.grossSalary, pkg) + (spouseIncome ? cissmForSalary(spouseIncome.grossSalary, pkg) : 0),
    );
    if (cissmAmount > 0) {
      provenance.push({
        ruleCode: 'LIR-CISSM',
        description: 'Crédit d’impôt salaire social minimum: EUR 70/month for a monthly salary of 1 800–3 000, linear to 3 600',
        sourceFactIds: [],
        formula: 'annualised monthly credit (x12)',
        inputs: { primarySalary: primaryIncome.grossSalary },
        outputAmount: cissmAmount,
      });
    }

    const credits: CreditBreakdownDto = {
      startup: startupCredit,
      foreignTaxCredit: foreignTaxCreditComputed,
      cissm: cissmAmount,""")

rep("""    credits.total = round2(
      credits.startup +
        credits.foreignTaxCredit +""",
"""    credits.total = round2(
      credits.startup +
        credits.foreignTaxCredit +
        credits.cissm +""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
