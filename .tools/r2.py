import io
p = "packages/tax-engine/src/engine.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

old = """    const primaryRental = computeRental(primary);
    const spouseRental = spouse ? computeRental(spouse) : { net: 0, forfait: false, exemption: 0 };"""
new = """    // ------------------------------------------- rental asset register (Art. 98)
    let registerRental: { net: number; forfait: boolean; exemption: number } | null = null;
    if (params.rentalProperties && params.rentalProperties.length > 0) {
      const rules = pkg.rentalAmortisation;
      let net = 0;
      let amortisationTotal = 0;
      let recentBuildings = 0;

      for (const building of params.rentalProperties) {
        if (!Number.isFinite(building.grossRent) || building.grossRent <= 0) continue;

        const charges = building.charges ?? 0;
        let amortisation = 0;

        if (building.purchasePrice && building.completionYear) {
          const age = taxYear - building.completionYear;
          const landShare = Math.min(Math.max(building.landSharePercent ?? 20, 0), 100) / 100;
          const base = building.purchasePrice * (1 - landShare);

          let rate: number;
          if (age < 5 && recentBuildings < rules.recentMaxBuildings) {
            rate = rules.recentRate;
            recentBuildings += 1;
          } else if (age < 30) {
            rate = rules.rateUnder30;
          } else if (age <= 60) {
            rate = rules.rate30to60;
          } else {
            rate = rules.rateOver60;
          }
          amortisation = addMoney(amortisation, round2(base * rate));
        }

        if (building.energyRenovationAmount && building.energyRenovationAmount > 0) {
          amortisation = addMoney(
            amortisation,
            round2(building.energyRenovationAmount * rules.energyRenovationRate),
          );
        }

        amortisationTotal = addMoney(amortisationTotal, amortisation);
        net = addMoney(net, round2(building.grossRent - charges - amortisation - (building.interest ?? 0)));
      }

      let exemption = 0;
      if (params.rentalSocial && net > 0) {
        exemption = round2(net * 0.9);
        net = round2(net - exemption);
      }

      registerRental = { net: round2(net), forfait: false, exemption };

      provenance.push({
        ruleCode: 'LIR-ART-98-AMORT',
        description:
          'Rental asset register: amortisation 4 % (recent, max two buildings) / 1.5 % / 2 % / 3 % by age, plus the energy-renovation rate, then charges and interest',
        sourceFactIds: [],
        formula: 'net = SUM(grossRent − charges − amortisation − interest)',
        inputs: {
          buildings: params.rentalProperties.length,
          amortisationTotal,
          energyRate: rules.energyRenovationRate,
        },
        outputAmount: round2(net),
      });
    }

    const primaryRental = registerRental ?? computeRental(primary);
    const spouseRental = spouse ? computeRental(spouse) : { net: 0, forfait: false, exemption: 0 };"""
assert s.count(old) == 1
io.open(p, "w", encoding="utf-8", newline="").write(s.replace(old, new).replace("\n", "\r\n"))
print("ok")
