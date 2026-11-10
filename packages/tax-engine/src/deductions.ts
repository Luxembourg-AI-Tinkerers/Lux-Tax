import type { RulePackage } from './rules/types';
import { fromCents, mulRate, sumCents, toCents } from './money';

export type AssessmentMode = 'COLLECTIVE' | 'INDIVIDUAL_PURE' | 'INDIVIDUAL_REALLOCATION';

export interface PersonIncome {
  /** Gross salary (Art. 95), before social contributions. */
  grossSalary: number;
  /** Deductible social contributions withheld on the salary. */
  socialContributions: number;
  /** Gross pension / rente (Art. 96). */
  grossPension: number;
  /** Net capital income (Art. 97). */
  capitalIncome: number;
  /** Net rental income (Art. 98), may be negative. */
  rentalIncome: number;
  /** Foreign net income included for the rate (Art. 134bis / treaties). */
  foreignIncome: number;
  /** Net independent profit (Art. 14 / 91), may be negative. */
  independentProfit: number;
  /** Actual frais d'obtention, if higher than the forfait. */
  actualFraisObtention: number;
  /** Unités d'éloignement (Art. 105bis). */
  travelUnits: number;
  /** Reduced working capacity 0–1, or undefined. */
  invalidityRate?: number;
}

export interface DeductionContext {
  pkg: RulePackage;
  taxClass: 'CLASS_1' | 'CLASS_1A' | 'CLASS_2';
  assessmentMode: AssessmentMode;
  primary: PersonIncome;
  spouse?: PersonIncome;
  /** Number of children with a modération d'impôt (drives plafond multipliers). */
  childrenWithModeration: number;
  /** Art. 111 a+b insurance + consumer-loan interest declared. */
  art111Declared: number;
  /** Art. 111bis / 111ter premiums declared (household total). */
  art111bisDeclared: number;
  /** Number of souscripteurs for the 111bis cap (1 or 2). */
  art111bisContributors: number;
  /** Épargne-logement contributions declared. */
  savingsHousingDeclared: number;
  /** Age of the younger adult subscriber on 1 January, if any. */
  savingsHousingSubscriberAge?: number;
  /** LRCP personal contributions (Art. 110 n° 3). */
  lrcpDeclared: number;
  /** Owner-occupier mortgage interest declared. */
  mortgageInterest: number;
  /** Year the valeur locative was fixed; undefined = not owner-occupied. */
  mortgageFixationYear?: number;
  /** True when the home is not yet at the owner's disposal (construction). */
  mortgageBeforeDisposition?: boolean;
  /** Donations (Art. 112). */
  donationsDeclared: number;
  /** Childcare + household help + dependency care (Art. 127). */
  extraordinaryChargesDeclared: number;
  /** Both spouses have professional income and are SS-affiliated (Art. 129b al. 2 a). */
  bothSpousesProfessional: boolean;
  /** One spouse independent, the other registered as conjoint-aidant (al. 2 b). */
  conjointAidant: boolean;
  /** The other spouse has been retired for < 3 years (al. 2 c, on request). */
  spouseRetiredUnder3Years: boolean;
  /** Prior-year losses carried forward (Art. 114). */
  priorYearLosses: number;
  /**
   * The year's net income, i.e. the most a prior-year loss can actually offset. A loss
   * larger than this is carried forward, not deducted: deducting the full declared amount
   * would let `totalDeductions` exceed the income it is deducted from.
   */
  availableIncomeForLosses?: number;
  /** AMVP eligibility (Art. 129g, 2026 only). */
  amvpEligible: boolean;
  /** Assurance solde restant dû: single premium (Art. 111 al. 3/4 majoration). */
  asrdPrimeUnique: number;
  asrdSubscriberAge?: number;
  asrdChildren: number;
  /** Net income used to cap donations (total revenus nets). */
  netIncomeForDonationCap: number;
}

export interface DeductionsBreakdown {
  /** Art. 105/107 frais d'obtention (salary + pension + capital forfaits). */
  fraisObtentionDeduction: number;
  /** Art. 105bis déplacement. */
  travelDeduction: number;
  /** Owner-occupier interest, frais d'obtention of the valeur locative. */
  mortgageInterestDeduction: number;
  /** Art. 111 €672 envelope. */
  art111Deduction: number;
  /** Art. 111 al. 3/4: ASRD single-premium majoration (outside the €672 envelope). */
  asrdDeduction: number;
  /** Art. 111bis / 111ter. */
  art111bisDeduction: number;
  /** Épargne-logement. */
  savingsHousingDeduction: number;
  /** Art. 110 n° 3 LRCP. */
  lrcpDeduction: number;
  /** Art. 109 n° 3 donations (additive to the FDS). */
  donationsDeduction: number;
  /** FDS applied (480 / 960). */
  specialExpensesForfait: number;
  /** Art. 109–113 total = max(FDS, covered) + LRCP + donations. */
  specialExpensesDeduction: number;
  /** Art. 127 charges extraordinaires forfait. */
  extraordinaryChargesDeduction: number;
  /** Art. 129b AEP. */
  aepDeduction: number;
  /** Art. 129g AMVP (2026+). */
  amvpDeduction: number;
  /** Art. 114 prior losses. */
  priorLossesDeduction: number;
  totalDeductions: number;
}

const clampPositive = (value: number): number => (Number.isFinite(value) && value > 0 ? value : 0);

/**
 * Art. 111bis cap multiplier: 1 or 2 souscripteurs, but a second souscripteur
 * must be a second assessed person. A stale couple answer (2) on a spouse-less
 * filer cannot double the single filer's cap.
 */
export function resolveArt111bisContributors(
  declared: number | undefined,
  assessedPersons: number,
): number {
  return Math.min(Math.max(1, Math.floor(declared || 1)), Math.max(1, assessedPersons));
}

/** Art. 107: invalidity forfaits replace (not add to) the normal forfait. */
function salaryForfaitFor(person: PersonIncome, pkg: RulePackage): number {
  const { fraisObtention: fo } = pkg;
  if (person.invalidityRate === undefined) {
    return fo.salaryForfait;
  }
  const rate = Math.min(Math.max(person.invalidityRate, 0), 1);
  if (rate <= 0) return fo.salaryForfait;
  const match = fo.invalidity.find((band) => rate <= band.maxRate);
  return match ? match.forfait : fo.salaryForfait;
}

/** Art. 105bis: €99 per unit, first 4 ignored, capped at 26 units / €2,574. */
function travelFor(person: PersonIncome, pkg: RulePackage): number {
  const units = Math.min(
    Math.max(Math.floor(person.travelUnits || 0) - pkg.travel.freeUnits, 0),
    pkg.travel.maxUnits - pkg.travel.freeUnits,
  );
  return Math.min(units * pkg.travel.perUnit, pkg.travel.cap);
}

/**
 * ACD habit_pers schedule from AY 2024, counted from the year the valeur
 * locative was fixed: years 1–2 unlimited, 3–6 €4,000, 7–11 €3,000, 12+ €2,000.
 * Before libre disposition the interest is fully deductible.
 */
function mortgageCap(
  interest: number,
  fixationYear: number | undefined,
  taxYear: number,
  beforeDisposition: boolean,
  pkg: RulePackage,
): number {
  if (interest <= 0) return 0;
  // Construction before libre disposition: the interest is fully deductible.
  if (beforeDisposition) return interest;
  // The ACD schedule counts from the year the valeur locative was fixed. Without that year
  // the band cannot be determined, so the deduction is refused (0) rather than granted
  // without limit: an unlimited owner-occupier interest would wipe out any taxable income,
  // which is the over-deduction this engine must never produce. engine.ts warns.
  if (fixationYear === undefined) return 0;
  const years = taxYear - fixationYear + 1;
  if (years <= pkg.mortgage.fullDeductionYears) return interest;
  if (years <= 6) return Math.min(interest, pkg.mortgage.band4000);
  if (years <= 11) return Math.min(interest, pkg.mortgage.band3000);
  return Math.min(interest, pkg.mortgage.band2000);
}

export function calculateDeductions(ctx: DeductionContext): DeductionsBreakdown {
  const { pkg } = ctx;
  // The couple's plafond multiplier and the doubled forfait need a second
  // person: a spouse-less Class 2 filer (Art. 119 n° 3 window) is assessed alone.
  const isCollective =
    ctx.taxClass === 'CLASS_2' && Boolean(ctx.spouse) && ctx.assessmentMode !== 'INDIVIDUAL_PURE';

  /** 1 + collectif + enfants modérés — the legal plafond multiplier. */
  const multiplier = 1 + (isCollective ? 1 : 0) + Math.max(0, ctx.childrenWithModeration);

  const people: PersonIncome[] = ctx.spouse ? [ctx.primary, ctx.spouse] : [ctx.primary];

  // --- Art. 105/107 frais d'obtention -------------------------------------
  let fraisObtention = 0;
  let travel = 0;
  for (const person of people) {
    if (person.grossSalary > 0) {
      const forfait = salaryForfaitFor(person, pkg);
      fraisObtention += Math.max(forfait, clampPositive(person.actualFraisObtention));
      travel += travelFor(person, pkg);
    }
    if (person.grossPension > 0) {
      fraisObtention += pkg.fraisObtention.pensionForfait;
    }
    if (person.capitalIncome > 0) {
      fraisObtention += pkg.fraisObtention.capitalForfait;
    }
  }

  // --- Owner-occupier interest (Art. 98 n° 5 / Art. 105) ------------------
  const mortgagePerPerson = mortgageCap(
    ctx.mortgageInterest,
    ctx.mortgageFixationYear,
    pkg.taxYear,
    Boolean(ctx.mortgageBeforeDisposition),
    pkg,
  );
  const mortgageInterestDeduction = Math.min(
    mortgagePerPerson * multiplier,
    clampPositive(ctx.mortgageInterest),
  );

  // --- Dépenses spéciales -------------------------------------------------
  const art111Deduction = Math.min(
    clampPositive(ctx.art111Declared),
    pkg.specialExpenses.art111CapPerPerson * multiplier,
  );

  // A second souscripteur must be a second assessed person: a stale couple
  // answer cannot double a single filer's cap.
  const contributors = resolveArt111bisContributors(
    ctx.art111bisContributors,
    people.length,
  );
  const art111bisDeduction = Math.min(
    clampPositive(ctx.art111bisDeclared),
    pkg.art111bisCapPerPerson * contributors,
  );

  // ASRD single premium: base majoration 6 000 + 1 200 per child, plus 8 % of
  // that majoration per year of age above 30 (max 160 %).
  const asrdBase = pkg.asrd.baseCap + pkg.asrd.perChild * Math.max(0, ctx.asrdChildren);
  const ageYears = ctx.asrdSubscriberAge !== undefined ? Math.max(0, ctx.asrdSubscriberAge - pkg.asrd.ageThreshold) : 0;
  const asrdSurmajoration = Math.min(pkg.asrd.surmajorationMax, pkg.asrd.surmajorationPerYear * ageYears);
  const asrdCap = asrdBase * (1 + asrdSurmajoration);
  const asrdDeduction = Math.min(clampPositive(ctx.asrdPrimeUnique), asrdCap);

  const savingsHousingCap =
    (ctx.savingsHousingSubscriberAge !== undefined &&
    ctx.savingsHousingSubscriberAge <= pkg.specialExpenses.savingsHousingYoungMaxAge
      ? pkg.specialExpenses.savingsHousingYoung
      : pkg.specialExpenses.savingsHousingStandard) * multiplier;
  const savingsHousingDeduction = Math.min(
    clampPositive(ctx.savingsHousingDeclared),
    savingsHousingCap,
  );

  const lrcpDeduction = Math.min(clampPositive(ctx.lrcpDeclared), pkg.specialExpenses.lrcpCap);

  const coveredByForfait =
    art111Deduction + asrdDeduction + art111bisDeduction + savingsHousingDeduction;
  const specialExpensesForfait =
    isCollective && (ctx.primary.grossSalary > 0 || ctx.primary.independentProfit !== 0) &&
    ctx.spouse &&
    (ctx.spouse.grossSalary > 0 || ctx.spouse.independentProfit !== 0)
      ? pkg.specialExpenses.forfaitCouple
      : pkg.specialExpenses.forfaitSingle;

  const donationsDeduction =
    ctx.donationsDeclared >= pkg.donations.minimum
      ? Math.min(
          clampPositive(ctx.donationsDeclared),
          clampPositive(ctx.netIncomeForDonationCap) * pkg.donations.maxShareOfNetIncome,
          pkg.donations.maxAbsolute,
        )
      : 0;

  const specialExpensesDeduction =
    Math.max(specialExpensesForfait, coveredByForfait) + lrcpDeduction + donationsDeduction;

  // --- Charges extraordinaires (Art. 127) --------------------------------
  const extraordinaryChargesDeduction =
    ctx.childrenWithModeration > 0 || ctx.extraordinaryChargesDeclared > 0
      ? Math.min(clampPositive(ctx.extraordinaryChargesDeclared), pkg.extraordinaryCharges.forfait)
      : 0;

  // --- Art. 129b AEP ------------------------------------------------------
  let aep = 0;
  const aepRoute =
    ctx.bothSpousesProfessional ||
    ctx.conjointAidant ||
    ctx.spouseRetiredUnder3Years ||
    false;

  if (ctx.spouse && aepRoute) {
    const base = ctx.assessmentMode === 'INDIVIDUAL_PURE' ? pkg.aep.individualPure : pkg.aep.collective;

    // Art. 129b al. 3: the allowance cannot exceed the net of the taxpayer's own
    // professional income, nor the net the other spouse would have realised.
    // A professional LOSS caps the AEP at zero for that spouse; a spouse with no
    // professional income at all (conjoint-aidant route) does not cap it.
    const professionalNet = (person: PersonIncome): number =>
      Math.max(0, person.grossSalary - person.socialContributions) + person.independentProfit;

    const hasProfessionalActivity = (person: PersonIncome): boolean =>
      person.grossSalary > 0 || person.independentProfit !== 0;

    const activeNets = [ctx.primary, ctx.spouse]
      .filter(hasProfessionalActivity)
      .map(professionalNet);

    const lowerNet = activeNets.length > 0 ? Math.min(...activeNets) : 0;

    aep = Math.max(0, Math.min(base, lowerNet));
  }

  // --- Art. 129g AMVP (2026+) --------------------------------------------
  const amvpDeduction = ctx.amvpEligible && pkg.amvp ? pkg.amvp.cap : 0;

  // Art. 114: a carried-forward loss is set off against this year's income; the part that
  // does not fit stays in the carry-forward and must never be reported as deducted.
  const deductionsBeforeLosses = fromCents(
    sumCents(
      toCents(fraisObtention),
      toCents(travel),
      toCents(mortgageInterestDeduction),
      toCents(specialExpensesDeduction),
      toCents(extraordinaryChargesDeduction),
      toCents(aep),
      toCents(amvpDeduction),
    ),
  );
  const lossCapacity = Math.max(
    0,
    (ctx.availableIncomeForLosses ?? Number.POSITIVE_INFINITY) - deductionsBeforeLosses,
  );
  const priorLossesDeduction = Math.min(clampPositive(ctx.priorYearLosses), lossCapacity);

  // All money is summed in integer cents, then converted once at the boundary.
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
  );

  return {
    fraisObtentionDeduction: round2(fraisObtention),
    travelDeduction: round2(travel),
    mortgageInterestDeduction: round2(mortgageInterestDeduction),
    art111Deduction: round2(art111Deduction),
    asrdDeduction: round2(asrdDeduction),
    art111bisDeduction: round2(art111bisDeduction),
    savingsHousingDeduction: round2(savingsHousingDeduction),
    lrcpDeduction: round2(lrcpDeduction),
    donationsDeduction: round2(donationsDeduction),
    specialExpensesForfait,
    specialExpensesDeduction: round2(specialExpensesDeduction),
    extraordinaryChargesDeduction: round2(extraordinaryChargesDeduction),
    aepDeduction: round2(aep),
    amvpDeduction: round2(amvpDeduction),
    priorLossesDeduction: round2(priorLossesDeduction),
    totalDeductions: round2(totalDeductions),
  };
}

export function round2(value: number): number {
  // One rounding rule for the whole engine: snap through integer cents.
  // `Math.round((v + EPSILON) * 100) / 100` disagreed with `toCents` on exact
  // halves (1.005 → 1.01 here, 1.00 through the cents helpers), so the same
  // figure could land a cent apart depending on which path produced it.
  return fromCents(toCents(value));
}
