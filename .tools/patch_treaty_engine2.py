import io
p = "packages/tax-engine/src/engine.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""    /** Part of the cote coming from Art. 100 / 99ter gains at the demi-taux. */
    let extraordinaryTaxComputed = 0;""",
"""    /** Part of the cote coming from Art. 100 / 99ter gains at the demi-taux. */
    let extraordinaryTaxComputed = 0;
    /** Foreign tax credited against the Luxembourg cote. */
    let foreignTaxCreditComputed = 0;""")

rep("""      const ordinaryCote = floorEuroToCote(baseTax(ordinaryTaxable + speculationGain, effectiveClass, pkg));

      // Extraordinary income (Art. 100 / 99ter): demi-taux global.""",
"""      const baseForCote = round2(ordinaryTaxable + speculationGain);
      let ordinaryCote = floorEuroToCote(baseTax(baseForCote, effectiveClass, pkg));

      // Exemption with progression: the exempt income raises the rate applied to
      // the Luxembourg base, but is not itself taxed.
      if (exemptForeignIncome > 0) {
        const withExempt = floorEuroToCote(baseTax(baseForCote + exemptForeignIncome, effectiveClass, pkg));
        const denominator = baseForCote + exemptForeignIncome;
        ordinaryCote = denominator > 0 ? round2((withExempt * baseForCote) / denominator) : 0;
      }

      // Ordinary credit: foreign tax credited up to the LU tax on that income.
      if (creditForeignIncome > 0 && foreignTaxPaid > 0) {
        const withoutForeign = floorEuroToCote(
          baseTax(Math.max(0, baseForCote - creditForeignIncome), effectiveClass, pkg),
        );
        const luTaxOnForeign = Math.max(0, ordinaryCote - withoutForeign);
        foreignTaxCreditComputed = round2(Math.min(foreignTaxPaid, luTaxOnForeign));
      }

      // Extraordinary income (Art. 100 / 99ter): demi-taux global.""")

rep("""    const credits: CreditBreakdownDto = {
      startup: startupCredit,""",
"""    if (foreignTaxPaid > 0 && foreignTaxCreditComputed === 0 && assessmentMode !== 'COLLECTIVE') {
      warnings.push(
        'Foreign tax credit is only computed under collective assessment; individual assessment modes ignore it.',
      );
    }

    const credits: CreditBreakdownDto = {
      startup: startupCredit,
      foreignTaxCredit: foreignTaxCreditComputed,""")

rep("""    credits.total = round2(
      credits.startup +
        credits.cis +""",
"""    credits.total = round2(
      credits.startup +
        credits.foreignTaxCredit +
        credits.cis +""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
