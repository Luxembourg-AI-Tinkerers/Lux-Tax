import io
p = "packages/tax-engine/src/engine.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:60])
    s = s.replace(old, new)

rep("""import { cimFor, cissmForSalary, resolvePerPersonCredits } from './credits';""",
"""import { cicForSalary, cimFor, cissmForSalary, resolvePerPersonCredits } from './credits';""")

rep("""    const credits: CreditBreakdownDto = {
      startup: startupCredit,
      foreignTaxCredit: foreignTaxCreditComputed,
      cissm: cissmAmount,""",
"""    const cicAmount = round2(
      cicForSalary(primaryIncome.grossSalary, pkg) +
        (spouseIncome ? cicForSalary(spouseIncome.grossSalary, pkg) : 0),
    );
    if (cicAmount > 0) {
      provenance.push({
        ruleCode: 'LIR-CIC',
        description: 'Crédit d’impôt conjoncture: published monthly table, annualised (x12)',
        sourceFactIds: [],
        formula: 'SUM(piecewise-linear monthly band) x 12',
        inputs: { primarySalary: primaryIncome.grossSalary },
        outputAmount: cicAmount,
      });
    }

    const credits: CreditBreakdownDto = {
      startup: startupCredit,
      foreignTaxCredit: foreignTaxCreditComputed,
      cissm: cissmAmount,
      cic: cicAmount,""")

rep("""    credits.total = round2(
      credits.startup +
        credits.foreignTaxCredit +
        credits.cissm +""",
"""    credits.total = round2(
      credits.startup +
        credits.foreignTaxCredit +
        credits.cissm +
        credits.cic +""")

# replace the 2026 warning with a precise, sourced statement
rep("""    if (taxYear === 2026) {
      warnings.push(
        'The 2026 crédit d’impôt conjoncture (1 June – 31 December 2026) is not modelled: its monthly amounts were not published in a Mémorial text at the time this rule package was built. The withholding simulation may therefore be conservative.',
      );
    }""",
"""    if (taxYear === 2026 && !pkg.cic) {
      warnings.push(
        'CIC 2026: projet de loi 8775 (first constitutional vote 28.10.2026) reintroduces the crédit d’impôt conjoncture for June–October 2026, bonified by 31.12.2026. The monthly table is not yet published and the law is not in force, so no CIC is computed (ACD newsletter 30.10.2026).',
      );
    }""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
