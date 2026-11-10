import io

p = r"B:\B\tax-app\packages\tax-engine\src\engine.ts"
s = io.open(p, encoding="utf-8-sig", newline="").read()
orig = s

# --- 1. Replace the early CIM block with the ordering rationale only ---------
old_cim = """    // Art. 154ter al. 2: the CIM is the only refundable credit here. It is
    // imputed on the tax still due after the other credits, and the excess is
    // paid back to the taxpayer instead of being lost. Every other credit is
    // non-refundable, so the two groups cannot be summed into one subtraction.
    const nonRefundableCredits = round2(credits.total - credits.cim);
    const taxAfterNonRefundable = Math.max(0, round2(totalTaxBeforeCredits - nonRefundableCredits));
    const cimApplied = Math.min(credits.cim, taxAfterNonRefundable);
    const cimRefund = round2(Math.max(0, credits.cim - cimApplied));
    credits.cimApplied = round2(cimApplied);
    credits.cimRefund = cimRefund;

    if (cimRefund > 0) {
      provenance.push({
        ruleCode: 'LIR-ART-154ter-refund',
        description: 'CIM refundable portion paid out (Art. 154ter al. 2)',
        sourceFactIds: [],
        formula: 'max(0, CIM - min(CIM, tax after non-refundable credits))',
        inputs: { cim: credits.cim, cimApplied, cimRefund, taxAfterNonRefundable },
        outputAmount: cimRefund,
      });
    }
""".replace("\n", "\r\n")

new_cim = """    // Order of imputation: non-refundable credits, then the child relief, then
    // the refundable CIM.
    //
    // Art. 122 / 123bis are non-refundable and bite only on the tax still due;
    // Art. 154ter al. 2 makes the CIM refundable, so its excess is paid out and
    // imputing it last costs the household nothing. Imputing the CIM first would
    // extinguish the very tax the child relief has to reduce and silently
    // destroy up to EUR 922.50 per child — an entitlement the law grants. A
    // refundable credit is the one that can wait.
    const nonRefundableCredits = round2(credits.total - credits.cim);
    const taxAfterNonRefundable = Math.max(0, round2(totalTaxBeforeCredits - nonRefundableCredits));
""".replace("\n", "\r\n")

assert s.count(old_cim) == 1, ("cim block", s.count(old_cim))
s = s.replace(old_cim, new_cim)

# --- 2. The child relief now starts from the tax after non-refundable credits
old_base = """    const taxAfterCredits = Math.max(0, round2(taxAfterNonRefundable - cimApplied));
""".replace("\n", "\r\n")
new_base = """    const taxBeforeChildRelief = taxAfterNonRefundable;
""".replace("\n", "\r\n")
assert s.count(old_base) == 1, ("base", s.count(old_base))
s = s.replace(old_base, new_base)

s = s.replace("degrevementForChildren(degrevementChildren, taxAfterCredits, pkg.childRelief)",
              "degrevementForChildren(degrevementChildren, taxBeforeChildRelief, pkg.childRelief)")
s = s.replace("const remainingAfterDegrevement = Math.max(0, round2(taxAfterCredits - degrevement));",
              "const remainingAfterDegrevement = Math.max(0, round2(taxBeforeChildRelief - degrevement));")
s = s.replace("          taxAfterCredits,\r\n        },\r\n        outputAmount: degrevement,",
              "          taxBeforeChildRelief,\r\n        },\r\n        outputAmount: degrevement,")

# --- 3. Insert the CIM imputation after the child relief, before the balance --
anchor = """    // --------------------------------------------------------------- balance
    const finalTaxLiability = Math.max(0, round2(taxAfterCredits - childReliefTotal));
""".replace("\n", "\r\n")

insert = """    // Art. 154ter al. 2: the CIM is the only refundable credit here. It is
    // imputed on the tax the non-refundable reliefs left, and the excess is paid
    // back to the taxpayer instead of being lost.
    const taxAfterChildRelief = Math.max(0, round2(taxBeforeChildRelief - childReliefTotal));
    const cimApplied = Math.min(credits.cim, taxAfterChildRelief);
    const cimRefund = round2(Math.max(0, credits.cim - cimApplied));
    credits.cimApplied = round2(cimApplied);
    credits.cimRefund = cimRefund;

    if (cimRefund > 0) {
      provenance.push({
        ruleCode: 'LIR-ART-154ter-refund',
        description: 'CIM refundable portion paid out (Art. 154ter al. 2)',
        sourceFactIds: [],
        formula: 'max(0, CIM - min(CIM, tax after non-refundable credits and child relief))',
        inputs: { cim: credits.cim, cimApplied, cimRefund, taxAfterChildRelief },
        outputAmount: cimRefund,
      });
    }

    // --------------------------------------------------------------- balance
    const finalTaxLiability = Math.max(0, round2(taxAfterChildRelief - cimApplied));
""".replace("\n", "\r\n")

assert s.count(anchor) == 1, ("anchor", s.count(anchor))
s = s.replace(anchor, insert)

assert "taxAfterCredits" not in s, "stale reference remains"

io.open(p, "w", encoding="utf-8", newline="").write(s)
print("ok, changed", len(orig), "->", len(s))
