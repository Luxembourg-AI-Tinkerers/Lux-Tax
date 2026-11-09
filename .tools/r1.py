import io

# contracts
p = "packages/contracts/src/tax.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
old = """  /** Qualifying dividends eligible for the 50 % exemption (Art. 115 n° 15a). */
  qualifyingDividends?: number;"""
new = """  /** Qualifying dividends eligible for the 50 % exemption (Art. 115 n° 15a). */
  qualifyingDividends?: number;

  /** Securities ledger: replaces the flat capital figures when provided. */
  securities?: Array<{
    label?: string;
    grossIncome: number;
    cost?: number;
    holdingMonths?: number;
    participationPercent?: number;
    /** Fully taxable LU / EU / DTT company dividend -> 50 % exemption. */
    qualifyingDividend?: boolean;
    /** Foreign withholding on this income, creditable. */
    foreignTax?: number;
    /** Luxembourg 20 % RELIBI withheld on interest. */
    relibiWithheld?: number;
  }>;
  /** Treat the 20 % RELIBI withholding as final (income excluded from the base). */
  relibiFinalElective?: boolean;"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))

# engine
p2 = "packages/tax-engine/src/engine.ts"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")

def rep(old, new):
    global s2
    assert s2.count(old) == 1, (s2.count(old), old[:70])
    s2 = s2.replace(old, new)

rep("""    const primaryCapital = capitalTaxableFor(primary);
    const spouseCapital = spouse ? capitalTaxableFor(spouse) : 0;""",
"""    // ------------------------------------------------- securities ledger
    let primaryCapital = capitalTaxableFor(primary);
    const spouseCapital = spouse ? capitalTaxableFor(spouse) : 0;

    if (params.securities && params.securities.length > 0) {
      primaryCapital = 0;
      let relibiFinalExcluded = 0;

      for (const holding of params.securities) {
        const gross = holding.grossIncome;
        if (!Number.isFinite(gross) || gross <= 0) continue;

        // 20 % RELIBI elected as final: the income does not enter the base.
        if (params.relibiFinalElective && (holding.relibiWithheld ?? 0) > 0) {
          relibiFinalExcluded = addMoney(relibiFinalExcluded, gross);
          continue;
        }

        const taxable = holding.qualifyingDividend ? gross * 0.5 : gross;
        primaryCapital = addMoney(primaryCapital, round2(taxable));

        // Foreign withholding on the same income is creditable (ordinary credit).
        if ((holding.foreignTax ?? 0) > 0) {
          creditForeignIncome = addMoney(creditForeignIncome, gross);
          foreignTaxPaid = addMoney(foreignTaxPaid, holding.foreignTax ?? 0);
        }
      }

      provenance.push({
        ruleCode: 'LIR-ART-97-115-15a-RELIBI',
        description:
          'Securities ledger: 50 % exemption on qualifying dividends, RELIBI 20 % final option, creditable foreign withholding, then the Art. 115 n° 15 tranche',
        sourceFactIds: [],
        formula: 'SUM(taxable per holding) − tranche; RELIBI-final holdings excluded',
        inputs: {
          holdings: params.securities.length,
          relibiFinalExcluded,
          relibiFinalElective: String(params.relibiFinalElective ?? false),
        },
        outputAmount: primaryCapital,
      });
    }""")

io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace("\n", "\r\n"))
print("ok")
