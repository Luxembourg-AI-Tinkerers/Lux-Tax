import { TaxClass, TaxResidence } from './enums';

export interface TaxCalculationFactInput {
  id: string;
  ownerId?: string | null;
  category: string;
  fieldKey: string;
  amount: number;
  sourceDocumentId?: string | null;
}

/** Art. 3 / 3bis collective taxation, or Art. 3ter individual assessment. */
export type AssessmentMode = 'COLLECTIVE' | 'INDIVIDUAL_PURE' | 'INDIVIDUAL_REALLOCATION';

/**
 * Per-child relief history (Art. 122 / 123bis).
 *
 * The scalar counts cannot express the two lifetime rules: a child generates
 * at most two bonifications, and a child cannot generate a dégrèvement and a
 * bonification in the same year. When this list is supplied it is authoritative
 * and the scalar counts are ignored.
 */
export interface ChildReliefHistoryEntry {
  /** Free label or child id, used only in warnings. */
  childId?: string;
  /** The child still generates the Art. 122 modération this year. */
  moderationThisYear?: boolean;
  /** A family allowance / CEDIES / SNJ payment was received for this child. */
  benefitReceived?: boolean;
  /** Year in which the child's moderation right ended (Art. 123bis). */
  moderationEndYear?: number;
  /** Bonifications already granted for this child over its lifetime (0–2). */
  bonificationsGranted?: number;
  /** Child lives alternately with both parents (Art. 123bis al. 1a). */
  residenceAlternee?: boolean;
  /** Both parents jointly exercise parental authority (Art. 123bis al. 1a). */
  jointParentalAuthority?: boolean;
  /** This household receives the family allowance for the child (al. 1a). */
  familyAllowanceReceived?: boolean;
  /** Child belongs to this household; false means outside the household. */
  inHousehold?: boolean;
}

export interface TaxCalculationParams {
  taxYear: number;
  taxClass: TaxClass;
  residence: TaxResidence;
  facts: TaxCalculationFactInput[];
  primaryUserId: string;
  spouseUserId?: string | null;
  dependantsCount?: number;

  // --- household / profile inputs (all optional, engine applies defaults) ---

  /** Defaults from taxClass: CLASS_2 → COLLECTIVE, otherwise ignored. */
  assessmentMode?: AssessmentMode;
  /**
   * A widowed/divorced filer keeping Class 2 under Art. 119 n° 3 has no spouse in
   * the workspace; apply the Class 2 tariff without the couple's collective extras.
   */
  class2WithoutSpouse?: boolean;
  /** Share of the joint RIA attributed to the primary filer under Art. 3ter al. 3 (default 50). */
  reallocationPercentPrimary?: number;
  /** Ages on 1 January of the tax year. */
  primaryAge?: number;
  spouseAge?: number;
  /** Number of children with a modération d'impôt (drives plafond multipliers). */
  childrenWithModeration?: number;
  /** True when both parents share the same home as the child (blocks CIM). */
  bothParentsSameHome?: boolean;
  /** Allocations paid for the child, for the CIM reduction (Art. 154ter). */
  childAllocations?: number;
  /**
   * Simple all-or-nothing fallback for the Art. 122 gate: true (the default)
   * when a family allowance (CAE / Zukunftskeess), a CEDIES study aid or an SNJ
   * volunteer-aid payment was received for the moderated children. Kept for
   * backward compatibility; `moderatedChildrenWithoutBenefit` takes precedence
   * when it is provided, because the law tests the condition per child.
   */
  childBenefitReceived?: boolean;
  /**
   * Moderated children for whom no family allowance / CEDIES / SNJ was paid; each
   * generates the EUR 922.50 Art. 122 dégrèvement.
   */
  moderatedChildrenWithoutBenefit?: number;
  /**
   * Children whose moderation right expired at the end of one of the two years
   * preceding the tax year (studies finished, …), for the Art. 123bis
   * bonification. A child cannot generate a dégrèvement and a bonification in
   * the same year.
   */
  childrenWithBonification?: number;
  /**
   * Per-child history; when present it overrides `childrenWithModeration`,
   * `moderatedChildrenWithoutBenefit` and `childrenWithBonification` so the
   * two-bonification lifetime cap and the résidence-alternée rule can apply.
   */
  childReliefHistory?: ChildReliefHistoryEntry[];

  /** Art. 129b al. 2 a): both spouses have professional income and are SS-affiliated. */
  bothSpousesProfessional?: boolean;
  /** Art. 129b al. 2 b): one spouse is registered as conjoint-aidant. */
  conjointAidant?: boolean;
  /** Art. 129b al. 2 c): the other spouse retired less than 3 years ago. */
  spouseRetiredUnder3Years?: boolean;

  /** Year the valeur locative was fixed (owner-occupied home). */
  mortgageFixationYear?: number;
  /** True while the home is not yet at the owner's disposal (construction). */
  mortgageBeforeDisposition?: boolean;

  /** Unités d'éloignement per person (Art. 105bis). */
  travelUnitsPrimary?: number;
  travelUnitsSpouse?: number;
  /** Reduced working capacity 0–1 per person, for the invalidity forfaits. */
  invalidityRatePrimary?: number;
  invalidityRateSpouse?: number;

  /** Number of 111bis/111ter souscripteurs (1 or 2). */
  art111bisContributors?: number;
  /** Age of the younger adult épargne-logement subscriber on 1 January. */
  savingsHousingSubscriberAge?: number;

  /** Art. 114: prior-year losses carried forward. */
  priorYearLosses?: number;
  /** Art. 129g AMVP eligibility (2026+). */
  amvpEligible?: boolean;
  /** True when the taxpayer is a single parent (CIM gate). */
  isSingleParent?: boolean;
  /** Art. 48 n° 3: the spouse draws a salary from the household business. */
  spouseEmployedByBusiness?: boolean;

  /**
   * Prime jeune salarié (Art. 115 n° 13d): amount of the prime received and
   * whether the legal conditions are met (under 30 on 1 January, first CDI with a
   * Luxembourg employer, first prime less than 5 years ago).
   */
  youngEmployeePrime?: number;
  youngEmployeePrimeEligible?: boolean;

  /** Art. 114 loss stock, per year of origin (17-year clock, oldest first). */
  lossCarryForward?: Array<{ year: number; amount: number }>;

  /** Plus-values on movable property (Art. 99bis / 100). */
  movableGains?: Array<{
    proceeds: number;
    cost: number;
    holdingMonths: number;
    participationPercent: number;
  }>;
  /** Plus-values on real estate (Art. 99bis / 99ter / 102bis). */
  realEstateGains?: Array<{
    proceeds: number;
    cost: number;
    holdingYears: number;
    isPrincipalResidence: boolean;
  }>;

  /** Rental: allow the 35 % / EUR 2 700 forfait (private patrimoine, >= 15 years). */
  rentalForfaitEligible?: boolean;
  /** Rental: social-management exemption (Art. 115 n° 22a, 90 %). */
  rentalSocial?: boolean;

  /** Rental asset register: amortisation and interest are computed per building. */
  rentalProperties?: Array<{
    label?: string;
    grossRent: number;
    charges?: number;
    purchasePrice?: number;
    completionYear?: number;
    landSharePercent?: number;
    energyRenovationAmount?: number;
    interest?: number;
  }>;

  /** Qualifying dividends eligible for the 50 % exemption (Art. 115 n° 15a). */
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
  relibiFinalElective?: boolean;

  /** Assurance solde restant dû: single premium and subscriber profile. */
  asrdPrimeUnique?: number;
  asrdSubscriberAge?: number;
  asrdChildren?: number;

  /** Credit for resident investors in eligible start-ups (2026+). */
  startupInvestment?: number;

  /** Foreign income by treaty partner, for the relief method. */
  foreignIncomeItems?: Array<{
    country: string;
    amount: number;
    foreignTax: number;
    /** Overrides the default method for that country. */
    method?: 'EXEMPTION_PROGRESSION' | 'CREDIT';
  }>;

  /** Residence of the spouse, for the Art. 3 d) mixed-couple gate. */
  spouseResidence?: 'RESIDENT' | 'NON_RESIDENT';
  /** Both spouses ask for collective assessment under Art. 3 d). */
  mixedCoupleCollectiveRequested?: boolean;

  /** Art. 157ter / Art. 3 d): non-resident assimilation inputs. */
  nonResidentAssimilation?: boolean;
  worldwideIncome?: number;
  luxembourgProfessionalIncome?: number;
  householdProfessionalIncome?: number;
  foreignNetIncome?: number;
}

export interface CalculationLineItemProvenance {
  ruleCode: string;
  description: string;
  sourceFactIds: string[];
  ownerId?: string | null;
  formula: string;
  inputs: Record<string, number | string>;
  outputAmount: number;
}

export interface FreelanceIncomeBreakdownDto {
  primaryGrossRevenue: number;
  primaryBusinessExpenses: number;
  primaryNetProfit: number;
  spouseGrossRevenue: number;
  spouseBusinessExpenses: number;
  spouseNetProfit: number;
  totalFreelanceNetProfit: number;
}

export interface DeductionBreakdownDto {
  fraisObtention: number;
  travel: number;
  mortgageInterest: number;
  art111: number;
  /** ASRD single-premium majoration (outside the EUR 672 envelope). */
  asrd: number;
  art111bis: number;
  savingsHousing: number;
  lrcp: number;
  donations: number;
  specialExpensesForfait: number;
  /**
   * Sum of the DS lines covered by the Art. 113 minimum forfait (cases 1301–1552):
   * Art. 111 + ASRD + 111bis + épargne-logement. Box 1553 is this total, not the
   * forfait itself. Absent on snapshots stored before it was exposed.
   */
  specialExpensesCovered?: number;
  specialExpensesTotal: number;
  extraordinaryCharges: number;
  aep: number;
  amvp: number;
  priorLosses: number;
  total: number;
}

export interface CreditBreakdownDto {
  /** Credit for resident investors in eligible start-ups (2026+). */
  startup: number;
  /** Foreign tax credited under the treaty / Art. 134bis. */
  foreignTaxCredit: number;
  /** Crédit d'impôt salaire social minimum. */
  cissm: number;
  /** Crédit d'impôt conjoncture (0 while no table is published for the year). */
  cic: number;
  cis: number;
  ciCo2Salary: number;
  cip: number;
  ciCo2Pension: number;
  cii: number;
  ciCo2Independant: number;
  cim: number;
  /** Part of the CIM actually imputed against the tax due (Art. 154ter). */
  cimApplied: number;
  /**
   * Excess of the CIM over the tax due, paid back to the taxpayer: the CIM is
   * refundable under Art. 154ter al. 2. It increases a refund and never reduces
   * an amount still payable.
   */
  cimRefund: number;
  total: number;
}

/** Art. 122 dégrèvement / Art. 123bis bonification — non-refundable child relief. */
export interface ChildReliefBreakdownDto {
  /** Art. 122: EUR 922.50 per moderated child when no CAE / CEDIES / SNJ was paid. */
  degrevement: number;
  /** Art. 123bis: EUR 922.50 per child whose moderation right expired, after phase-out. */
  bonification: number;
  /** degrevement + bonification, capped at the tax still due. */
  total: number;
  /** Moderated children for whom no CAE / CEDIES / SNJ was paid (Art. 122 gate). */
  eligibleChildren: number;
  /** Children that generated a bonification. */
  bonificationChildren: number;
  /**
   * True when the 67,400–76,600 RIA band reduced the per-child bonification (false when
   * the six-child cap lift applies or the amount is cut only by the remaining tax due).
   */
  bonificationPhaseOut: boolean;
}

export interface TaxCalculationResultDto {
  taxYear: number;
  taxClass: TaxClass;
  /** Rule-package version used, for reproducibility. */
  rulePackageVersion: string;
  assessmentMode: AssessmentMode;
  /**
   * Class 2 tariff applied without a spouse in the workspace (Art. 119 n° 3
   * window). `assessmentMode` still reads COLLECTIVE because the tariff comes
   * from Art. 121, but no spouse is assessed — the UI says so explicitly.
   * Absent on results stored before this flag.
   */
  class2WithoutSpouse?: boolean;

  /**
   * True only for a married Class 2 couple whose spouse is assessed jointly —
   * the only household with three legally distinct scenarios. Computed by the
   * API from the resolved status, class and spouse selection, not by the pure
   * engine; absent on results stored before LEG-8.
   */
  comparisonEligible?: boolean;

  grossIncome: number;
  /** Exempt share of the prime jeune salarié (Art. 115 n° 13d), included in grossIncome. */
  youngEmployeePrimeExemption: number;
  netIncome: number;
  totalDeductions: number;
  deductions: DeductionBreakdownDto;
  taxableIncome: number;

  baseTax: number;
  solidaritySurchargeRate: number;
  solidaritySurchargeAmount: number;
  totalTaxBeforeCredits: number;

  credits: CreditBreakdownDto;
  /**
   * Statutory sum of all credits, including the full CIM (Art. 154ter). Not the
   * amount applied against the tax: subtract `credits.cimRefund` for the part
   * actually credited, since the excess CIM is paid out separately.
   */
  totalTaxCredits: number;
  /** Art. 122 / 123bis child relief, imputed after the credits (non-refundable). */
  childRelief: ChildReliefBreakdownDto;
  finalTaxLiability: number;

  taxWithheldAtSource: number;
  balancePayableOrRefund: number; // Positive = Due, Negative = Refund

  effectiveTaxRate: number;
  marginalRate: number;

  freelanceIncomeBreakdown?: FreelanceIncomeBreakdownDto;
  /** Plus-values detail (all amounts excluding the final tax). */
  plusValues?: {
    speculation: number;
    article100: number;
    article99ter: number;
    abattement: number;
    taxableExtraordinary: number;
    tax: number;
  };
  /** Rental detail. */
  rental?: {
    gross: number;
    charges: number;
    net: number;
    forfaitApplied: boolean;
    socialExemption: number;
  };
  /** Non-resident assimilation outcome. */
  nonResident?: {
    assimilationGranted: boolean;
    worldwideShare: number;
    professionalShareInLuxembourg: number;
    /** 'RESIDENT_RULES' | 'EXEMPTION_WITH_PROGRESSION' | 'NOT_SUPPORTED' */
    method: string;
  };
  provenance: CalculationLineItemProvenance[];
  warnings: string[];
  /** Inputs the engine could not legally evaluate. */
  unsupported: string[];
  calculatedAt: string;
}

/**
 * One action, three legal assessment modes on the same household facts:
 * collective Class 2 (Art. 3 / 3bis), 2× Class 1 (Art. 3ter pure) and the
 * Art. 3ter reallocation of the joint taxable base.
 *
 * A comparison run is never persisted and never changes the active election:
 * it is an estimate, not a filing choice.
 */
export interface ScenarioComparisonDto {
  taxYear: number;
  /** Rule package shared by all three runs, for reproducibility. */
  rulePackageVersion: string;
  collective: TaxCalculationResultDto;
  individualPure: TaxCalculationResultDto;
  individualReallocation: TaxCalculationResultDto;
  /** collective.finalTaxLiability - individualPure.finalTaxLiability */
  deltaCollectiveVsIndividual: number;
  /** collective.finalTaxLiability - individualReallocation.finalTaxLiability */
  deltaCollectiveVsReallocation: number;
  /**
   * True only for a **married** Class 2 couple with an assessed spouse, the only
   * household with three legally distinct scenarios. The three results are
   * returned either way: a PACS couple assessed collectively, a widow(er) or a
   * divorced filer keeping Class 2, and a married filer without a joined
   * CO_FILER all receive three collective runs that are not comparable.
   */
  comparable: boolean;
  warnings: string[];
}
