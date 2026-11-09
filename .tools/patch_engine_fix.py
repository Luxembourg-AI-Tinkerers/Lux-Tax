import io
p = "packages/tax-engine/src/engine.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""    let taxCote: number;
    let solidarityAmount: number;
    let taxableForRate: number;""",
"""    let taxCote: number;
    let solidarityAmount: number;
    let taxableForRate: number;
    /** Part of the cote coming from Art. 100 / 99ter gains at the demi-taux. */
    let extraordinaryTaxComputed = 0;""")

rep("""      const primaryCote = floorEuroToCote(baseTax(primaryTaxable + speculationGain, 'CLASS_1', pkg));
      const spouseCote = floorEuroToCote(baseTax(spouseTaxable, 'CLASS_1', pkg));

      taxCote = round2(primaryCote + spouseCote);""",
"""      const primaryBase = floorEuroToCote(baseTax(primaryTaxable + speculationGain, 'CLASS_1', pkg));
      let extraTax = 0;
      if (extraordinaryGain > 0) {
        const withExtra = floorEuroToCote(
          baseTax(primaryTaxable + speculationGain + extraordinaryGain, 'CLASS_1', pkg),
        );
        extraTax = round2(Math.max(0, withExtra - primaryBase) / 2);
      }
      extraordinaryTaxComputed = extraTax;
      const primaryCote = round2(primaryBase + extraTax);
      const spouseCote = floorEuroToCote(baseTax(spouseTaxable, 'CLASS_1', pkg));

      taxCote = round2(primaryCote + spouseCote);""")

rep("""      taxableForRate = round2(primaryTaxable + spouseTaxable);
      void extraordinaryGain;""",
"""      taxableForRate = round2(primaryTaxable + spouseTaxable);""")

rep("""      const primaryCote = floorEuroToCote(baseTax(primaryTaxable, 'CLASS_1', pkg));
      const spouseCote = floorEuroToCote(baseTax(spouseTaxable, 'CLASS_1', pkg));

      taxCote = round2(primaryCote + spouseCote);
      solidarityAmount = round2(
        mulRate(toCents(primaryCote), fondsRateFor(primaryTaxable)) / 100 +
          mulRate(toCents(spouseCote), fondsRateFor(spouseTaxable)) / 100,
      );
      taxableForRate = ordinaryTaxable;""",
"""      const primaryBase = floorEuroToCote(baseTax(primaryTaxable, 'CLASS_1', pkg));
      let extraTax = 0;
      if (extraordinaryGain > 0) {
        const withExtra = floorEuroToCote(baseTax(primaryTaxable + extraordinaryGain, 'CLASS_1', pkg));
        extraTax = round2(Math.max(0, withExtra - primaryBase) / 2);
      }
      extraordinaryTaxComputed = extraTax;
      const primaryCote = round2(primaryBase + extraTax);
      const spouseCote = floorEuroToCote(baseTax(spouseTaxable, 'CLASS_1', pkg));

      taxCote = round2(primaryCote + spouseCote);
      solidarityAmount = round2(
        mulRate(toCents(primaryCote), fondsRateFor(primaryTaxable)) / 100 +
          mulRate(toCents(spouseCote), fondsRateFor(spouseTaxable)) / 100,
      );
      taxableForRate = ordinaryTaxable;""")

rep("""        extraordinaryTax = round2(Math.max(0, withExtra - ordinaryCote) / 2);
      }

      taxCote = round2(ordinaryCote + extraordinaryTax);""",
"""        extraordinaryTax = round2(Math.max(0, withExtra - ordinaryCote) / 2);
      }
      extraordinaryTaxComputed = extraordinaryTax;

      taxCote = round2(ordinaryCote + extraordinaryTax);""")

rep("""        taxableExtraordinary: extraordinaryGain,
        tax:
          extraordinaryGain > 0 && assessmentMode === 'COLLECTIVE'
            ? round2(0)
            : 0,
      },""",
"""        taxableExtraordinary: extraordinaryGain,
        tax: extraordinaryTaxComputed,
      },""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
