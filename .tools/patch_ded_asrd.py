import io
p = "packages/tax-engine/src/deductions.ts"
raw = io.open(p, encoding="utf-8", newline="").read()
s = raw.replace("\r\n", "\n")

def rep(old, new):
    global s
    assert s.count(old) == 1, (s.count(old), old[:70])
    s = s.replace(old, new)

rep("""import type { RulePackage } from './rules/types';""",
    """import type { RulePackage } from './rules/types';
import { fromCents, mulRate, sumCents, toCents } from './money';""")

rep("""  /** AMVP eligibility (Art. 129g, 2026 only). */
  amvpEligible: boolean;""",
    """  /** AMVP eligibility (Art. 129g, 2026 only). */
  amvpEligible: boolean;
  /** Assurance solde restant dû: single premium (Art. 111 al. 3/4 majoration). */
  asrdPrimeUnique: number;
  asrdSubscriberAge?: number;
  asrdChildren: number;""")

rep("""  /** Art. 111 €672 envelope. */
  art111Deduction: number;""",
    """  /** Art. 111 €672 envelope. */
  art111Deduction: number;
  /** Art. 111 al. 3/4: ASRD single-premium majoration (outside the €672 envelope). */
  asrdDeduction: number;""")

rep("""  const savingsHousingCap =""",
    """  // ASRD single premium: base majoration 6 000 + 1 200 per child, plus 8 % of
  // that majoration per year of age above 30 (max 160 %).
  const asrdBase = pkg.asrd.baseCap + pkg.asrd.perChild * Math.max(0, ctx.asrdChildren);
  const ageYears = ctx.asrdSubscriberAge !== undefined ? Math.max(0, ctx.asrdSubscriberAge - pkg.asrd.ageThreshold) : 0;
  const asrdSurmajoration = Math.min(pkg.asrd.surmajorationMax, pkg.asrd.surmajorationPerYear * ageYears);
  const asrdCap = asrdBase * (1 + asrdSurmajoration);
  const asrdDeduction = Math.min(clampPositive(ctx.asrdPrimeUnique), asrdCap);

  const savingsHousingCap =""")

rep("""  const coveredByForfait = art111Deduction + art111bisDeduction + savingsHousingDeduction;""",
    """  const coveredByForfait =
    art111Deduction + asrdDeduction + art111bisDeduction + savingsHousingDeduction;""")

rep("""  const totalDeductions =
    fraisObtention +
    travel +
    mortgageInterestDeduction +
    specialExpensesDeduction +
    extraordinaryChargesDeduction +
    aep +
    amvpDeduction +
    priorLossesDeduction;""",
    """  // All money is summed in integer cents, then converted once at the boundary.
  const totalDeductions = fromCents(
    sumCents(
      toCents(fraisObtention),
      toCents(travel),
      toCents(mortgageInterestDeduction),
      toCents(specialExpensesDeduction),
      toCents(extraordinaryChargesDeduction),
      toCents(aep),
      toCents(amvpDeduction),
      toCents(priorLossesDeduction),
    ),
  );""")

rep("""    art111Deduction: round2(art111Deduction),
    art111bisDeduction: round2(art111bisDeduction),""",
    """    art111Deduction: round2(art111Deduction),
    asrdDeduction: round2(asrdDeduction),
    art111bisDeduction: round2(art111bisDeduction),""")

io.open(p, "w", encoding="utf-8", newline="").write(s.replace("\n", "\r\n"))
print("ok")
