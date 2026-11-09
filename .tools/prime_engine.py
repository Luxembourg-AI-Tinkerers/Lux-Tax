import io

# 3) contracts: params + result
p = "packages/contracts/src/tax.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")
s = s.replace("""  /** Art. 3 d): a mixed resident/non-resident couple""",
"""  /**
   * Prime jeune salarié (Art. 115 n° 13d): amount of the prime received and
   * whether the legal conditions are met (under 30 on 1 January, first CDI with a
   * Luxembourg employer, first prime less than 5 years ago).
   */
  youngEmployeePrime?: number;
  youngEmployeePrimeEligible?: boolean;

  /** Art. 3 d): a mixed resident/non-resident couple""")

s = s.replace("""  grossIncome: number;
  netIncome: number;""",
"""  grossIncome: number;
  /** Exempt share of the prime jeune salarié (Art. 115 n° 13d), included in grossIncome. */
  youngEmployeePrimeExemption: number;
  netIncome: number;""")
io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))

# 4) engine: compute and apply
p2 = "packages/tax-engine/src/engine.ts"
raw2 = io.open(p2, encoding="utf-8", newline="").read()
s2 = raw2.replace("\r\n", "\n")

def rep(old, new):
    global s2
    assert s2.count(old) == 1, (s2.count(old), old[:70])
    s2 = s2.replace(old, new)

rep("""    const primaryNet = netOf(primaryIncome);
    const spouseNet = spouseIncome ? netOf(spouseIncome) : 0;
    // Credit-method foreign income is part of the base; exemption-method income is not.
    const netIncome = round2(primaryNet + spouseNet + creditForeignIncome);""",
"""    const primaryNet = netOf(primaryIncome);
    const spouseNet = spouseIncome ? netOf(spouseIncome) : 0;

    // Prime jeune salarié (Art. 115 n° 13d): 75 % exempt, capped by salary band.
    // The exemption is lost on a change of employer, so it is gated on an explicit
    // eligibility flag rather than inferred.
    let primeExemption = 0;
    const primeAmount = Math.max(0, params.youngEmployeePrime ?? 0);
    if (primeAmount > 0 && params.youngEmployeePrimeEligible) {
      const rules = pkg.youngEmployeePrime;
      const band = rules.bands.find((b) => primaryIncome.grossSalary <= b.maxSalary);
      const cap = band ? band.cap : 0;
      primeExemption = round2(Math.min(primeAmount * rules.exemptRate, cap));
      if (primeExemption > 0) {
        provenance.push({
          ruleCode: 'LIR-ART-115-13d',
          description:
            'Prime jeune salarié: 75 % of the prime exempt, capped by the gross-salary band (5 000 / 3 750 / 2 500)',
          sourceFactIds: [],
          formula: 'min(prime × 75 %, band cap)',
          inputs: { prime: primeAmount, grossSalary: primaryIncome.grossSalary, cap },
          outputAmount: primeExemption,
        });
      } else if (primaryIncome.grossSalary > 100_000) {
        warnings.push(
          'Prime jeune salarié: no exemption above EUR 100 000 of gross salary (Art. 115 n° 13d).',
        );
      }
    }

    // Credit-method foreign income is part of the base; exemption-method income is not.
    const netIncome = round2(primaryNet + spouseNet + creditForeignIncome - primeExemption);""")

rep("""      grossIncome: round2(""",
"""      youngEmployeePrimeExemption: primeExemption,
      grossIncome: round2(""")

io.open(p2, "w", encoding="utf-8", newline="").write(s2.replace("\n", "\r\n"))
print("ok")
