/**
 * Immutable, versioned tax-year rule package.
 *
 * Every figure in this package must be traceable to the LIR / ACD / Mémorial for
 * the stated tax year. A package is never edited in place: a correction ships as a
 * new package version so that historical calculations stay reproducible.
 */

export interface TaxBracket {
  readonly lower: number;
  readonly upper: number;
  readonly rate: number;
}

export interface Class1aRules {
  /** Art. 120bis: reduction pivot (79 380 €). */
  readonly pivot: number;
  /** Art. 120bis: divisor applied to (pivot − R) below the pivot. */
  readonly divisor: number;
  /** Marginal-rate caps applied to the Class 1a cote, by R band. */
  readonly marginalCaps: readonly { readonly from: number; readonly to: number; readonly rate: number }[];
}

export interface SolidarityRules {
  readonly standardRate: number;
  readonly highRate: number;
  readonly thresholdClass1: number;
  readonly thresholdClass2: number;
}

export interface FraisObtentionRules {
  readonly salaryForfait: number;
  readonly pensionForfait: number;
  readonly capitalForfait: number;
  readonly salaryMonthly: number;
  readonly pensionMonthly: number;
  readonly capitalMonthly: number;
  /** Art. 107 al. 1: increased forfaits by reduced working capacity. */
  readonly invalidity: readonly { readonly maxRate: number; readonly forfait: number }[];
  readonly blindnessForfait: number;
}

export interface TravelRules {
  /** Art. 105bis: € per unité d'éloignement. */
  readonly perUnit: number;
  /** First N units are not taken into account. */
  readonly freeUnits: number;
  /** Maximum number of units. */
  readonly maxUnits: number;
  /** Hard cap (maxUnits × perUnit). */
  readonly cap: number;
}

export interface SpecialExpenseRules {
  readonly forfaitSingle: number;
  readonly forfaitCouple: number;
  /** Art. 111 a+b + Art. 109 n° 1a shared envelope, per qualifying person. */
  readonly art111CapPerPerson: number;
  /** Art. 110 n° 3: personal LRCP contributions. */
  readonly lrcpCap: number;
  /** Art. 111 al. 1 c / al. 5: épargne-logement. */
  readonly savingsHousingYoung: number;
  readonly savingsHousingStandard: number;
  readonly savingsHousingYoungMaxAge: number;
}

export interface DonationRules {
  readonly minimum: number;
  readonly maxShareOfNetIncome: number;
  readonly maxAbsolute: number;
  /** Art. 109 n° 3: excess may be reported for N following years. */
  readonly reportYears: number;
}

export interface AepRules {
  /** Art. 129b al. 1: jointly taxed spouses. */
  readonly collective: number;
  /** Art. 129b al. 1: individual pure assessment, per spouse. */
  readonly individualPure: number;
  readonly monthly: number;
  readonly individualPureMonthly: number;
}

export interface ExtraordinaryChargeRules {
  /** Art. 127 forfait: garde d'enfants / domesticité / soins. */
  readonly forfait: number;
  readonly monthlyCap: number;
  /** Child must be under this age on 1 January (unless handicapped). */
  readonly childMaxAge: number;
}

export interface MortgageRules {
  /** Years since fixation of the valeur locative. */
  readonly fullDeductionYears: number;
  readonly band4000: number;
  readonly band3000: number;
  readonly band2000: number;
}

export interface CisRules {
  readonly floor: number;
  readonly buildUpEnd: number;
  readonly plateauEnd: number;
  readonly zeroFrom: number;
  readonly base: number;
  readonly minimum: number;
  readonly buildUpSlope: number;
  readonly phaseOutSlope: number;
}

export interface CipRules extends CisRules {
  /** Pension below this amount gets no CIP. */
  readonly pensionFloor: number;
  /** Flat amount on the band just above the pension floor. */
  readonly lowBandEnd: number;
  readonly lowBandAmount: number;
}

export interface CiiRules extends CisRules {
  /** CII is €300 even below the floor, provided a bénéfice exists. */
  readonly subFloorAmount: number;
}

export interface CiCo2Rules {
  readonly salarie: number;
  readonly pension: number;
  readonly independant: number;
  readonly slope: number;
  readonly zeroFrom: number;
}

export interface CimRules {
  readonly maximum: number;
  readonly fullAmountUntil: number;
  readonly zeroFrom: number;
  readonly phaseOutSlope: number;
  readonly minimum: number;
  /** Allocations above this reduce the CIM by `reductionRate`. */
  readonly allocationThreshold: number;
  readonly reductionRate: number;
}

/**
 * Child tax relief (Art. 122 dégrèvement, Art. 123bis bonification).
 *
 * Both are non-refundable: they are imputed only up to the tax still due and
 * never produce a refund on their own.
 */
export interface ChildReliefRules {
  /** Art. 122 / 123bis: maximum relief per child and per year. */
  readonly amountPerChild: number;
  /** Art. 123bis: RIA from which the bonification is phased out (≤ 5 children). */
  readonly bonificationPhaseOutFrom: number;
  /** Art. 123bis: RIA from which the bonification is nil (≤ 5 children). */
  readonly bonificationZeroFrom: number;
  /** Art. 123bis: children (modération + bonification) that lift the income cap. */
  readonly capLiftedFromChildren: number;
}

export interface RentalAmortisationRules {
  /** 4 % for up to N buildings completed less than 5 years ago. */
  readonly recentRate: number;
  readonly recentMaxBuildings: number;
  readonly rateUnder30: number;
  readonly rate30to60: number;
  readonly rateOver60: number;
  /** Rate applied to a durable energy-renovation investment. */
  readonly energyRenovationRate: number;
}

/**
 * Crédit d'impôt conjoncture (CIC).
 *
 * Piecewise-linear monthly table: each band gives the monthly gross salary
 * range and the linear formula `slope x (salary − from) + offset`, in euros per
 * month. The table is data, not code, so a newly published table is a package
 * change rather than an engine change.
 */
export interface CicRules {
  readonly bands: readonly {
    readonly from: number;
    readonly to: number;
    readonly slope: number;
    readonly offset: number;
  }[];
  /** Last band used above the highest `to` (flat monthly amount). */
  readonly topUpTo?: number;
  readonly topAmount?: number;
}

export interface CissmRules {
  /** Monthly salary band where the credit is granted. */
  readonly monthlyFloor: number;
  readonly monthlyFlatUntil: number;
  readonly monthlyZeroFrom: number;
  /** Flat monthly credit inside the band. */
  readonly monthlyAmount: number;
}

export interface AmvpRules {
  readonly cap: number;
  readonly monthly: number;
}

export interface AsrdRules {
  /** Majoration de base for a single premium (assurance solde restant dû). */
  readonly baseCap: number;
  /** Extra majoration per child with modération. */
  readonly perChild: number;
  /** Surmajoration: 8 % of the majoration per year of age above the threshold. */
  readonly surmajorationPerYear: number;
  readonly surmajorationMax: number;
  readonly ageThreshold: number;
}

export interface PlusValueRules {
  /** Movable property: speculation window in months (Art. 99bis). */
  readonly movableHoldingMonths: number;
  /** Annual speculative profit below this is exempt. */
  readonly speculationFloor: number;
  /** Substantial participation threshold (Art. 100). */
  readonly substantialParticipation: number;
  readonly participationLookbackYears: number;
  /** Real estate: speculation window in years (Art. 99bis). */
  readonly realEstateHoldingYears: number;
  /** Art. 130 al. 4 abattement on 99ter / 100 / 101 gains. */
  readonly abattementSingle: number;
  readonly abattementJoint: number;
}

export interface StartupCreditRules {
  readonly rate: number;
  readonly maxInvestment: number;
}

/**
 * A measure that is known but not yet in force. It records the legal source and
 * the exact data change that activates it, so publication is a package edit and
 * nothing else.
 */
/**
 * Prime jeune salarié (Art. 115 n° 13d L.I.R., in force from AY 2025).
 *
 * 75 % of the prime is exempt, capped by an annual amount that steps down with
 * the gross salary. The exemption is lost on a change of employer, so eligibility
 * is an explicit input rather than something inferred.
 */
export interface YoungEmployeePrimeRules {
  readonly exemptRate: number;
  /** Annual exemptible cap, by gross salary band (first match wins). */
  readonly bands: readonly { readonly maxSalary: number; readonly cap: number }[];
}

export interface PendingMeasure {
  readonly id: string;
  readonly status: 'NOT_IN_FORCE' | 'IN_FORCE';
  /** Where the measure comes from (projet de loi, newsletter, Mémorial). */
  readonly source: string;
  /** The one-line change that activates it in this package. */
  readonly activation: string;
}

export interface RulePackage {
  readonly taxYear: number;
  readonly version: string;
  readonly sourceRef: string;
  readonly scale: readonly TaxBracket[];
  readonly class1a: Class1aRules;
  readonly solidarity: SolidarityRules;
  readonly fraisObtention: FraisObtentionRules;
  readonly travel: TravelRules;
  readonly specialExpenses: SpecialExpenseRules;
  readonly donations: DonationRules;
  readonly aep: AepRules;
  readonly extraordinaryCharges: ExtraordinaryChargeRules;
  readonly mortgage: MortgageRules;
  readonly cis: CisRules;
  readonly cip: CipRules;
  readonly cii: CiiRules;
  readonly ciCo2: CiCo2Rules;
  readonly cim: CimRules;
  /** Art. 122 / 123bis child relief parameters. */
  readonly childRelief: ChildReliefRules;
  readonly amvp?: AmvpRules;
  /** Art. 111bis / 111ter cap per souscripteur (shared between both). */
  readonly art111bisCapPerPerson: number;
  /** Capital income tranche exemptée, Art. 115 n° 15 (doubled when collective). */
  readonly capitalTrancheExemptee: number;
  /** CCSS pension contribution rate for independents (informational). */
  readonly ccssPensionRate: number;
  /** TVA franchise threshold (informational, not a PIT figure). */
  readonly tvaFranchise: number;
  readonly asrd: AsrdRules;
  readonly plusValues: PlusValueRules;
  readonly startupCredit: StartupCreditRules;
  readonly cissm: CissmRules;
  readonly youngEmployeePrime: YoungEmployeePrimeRules;
  /**
   * Present only when the CIC table has been published for that tax year.
   * Absent = the credit does not exist / is not yet in force.
   */
  readonly cic?: CicRules;
  readonly rentalAmortisation: RentalAmortisationRules;
  /** True for the 2028 single-class ("classe U") package. */
  readonly singleClass?: boolean;
  /**
   * Structural hook for the 2028 transition of couples already taxed
   * collectively. `method: 'NONE'` means the parameters are not yet published
   * and no blend is applied.
   */
  readonly classUTransition?: { readonly years: number; readonly method: 'NONE' | 'PHASE_IN' };
  /** Measures known but awaiting publication / entry into force. */
  readonly pendingMeasures?: readonly PendingMeasure[];
}
