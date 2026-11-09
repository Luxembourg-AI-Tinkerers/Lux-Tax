import { TaskSeverity, TaskType } from './enums';
import type { ChildReliefHistoryEntry } from './tax';

export type AssessmentModeDto = 'COLLECTIVE' | 'INDIVIDUAL_PURE' | 'INDIVIDUAL_REALLOCATION';

export interface QuestionnaireAnswersDto {
  maritalStatus: 'SINGLE' | 'MARRIED' | 'PACS' | 'DIVORCED' | 'WIDOWED';
  hasEmploymentIncome: boolean;
  hasPensionIncome: boolean;
  hasPrimaryResidenceMortgage: boolean;
  /** Year the valeur locative was fixed (not a rolling "occupation year"). */
  mortgageOccupancyYear?: number;
  /** Home still under construction / not yet at the owner's disposal. */
  mortgageBeforeDisposition?: boolean;
  hasLifeInsuranceOrPensionPlan: boolean;
  /** Art. 111bis / 111ter third-pillar contract. */
  hasPensionSavingsContract?: boolean;
  /** Épargne-logement contract. */
  hasSavingsHousingContract?: boolean;
  hasDonations: boolean;
  hasFreelanceIncome?: boolean;
  childrenCount: number;
  /** Children generating a modération d'impôt. */
  childrenWithModeration?: number;

  /** Ages on 1 January of the tax year. */
  primaryAge?: number;
  spouseAge?: number;
  /**
   * Art. 119 n° 3 b: year in which the marriage ended by the death of the
   * spouse. With it the widow/widower stays in Class 2 for the year of death and
   * the three following years; without it the Class 1a default applies.
   */
  spouseDeathYear?: number;
  /**
   * Art. 119 n° 3 c: year of the divorce or of the legal/factual separation.
   * With `class2BeforeEvent` it opens the three-year Class 2 window.
   */
  divorceOrSeparationYear?: number;
  /**
   * Art. 119 n° 3 c: the filer was in Class 2 for at least five years before the
   * divorce/separation. Required for the three-year Class 2 window; when false
   * or absent the ordinary Class 1a / Class 1 rules apply.
   */
  class2BeforeEvent?: boolean;
  /** Art. 129b AEP route a. */
  spouseHasProfessionalIncome?: boolean;
  /** Art. 129b AEP route b. */
  spouseIsConjointAidant?: boolean;
  /** Art. 129b AEP route c. */
  spouseRetiredUnder3Years?: boolean;

  /** CIM gate: both parents in the child's home blocks the credit. */
  bothParentsSameHome?: boolean;
  isSingleParent?: boolean;
  childAllocations?: number;
  /**
   * Simple all-or-nothing fallback for the Art. 122 gate. Kept for API
   * compatibility; `moderatedChildrenWithoutBenefit` takes precedence when it is
   * provided.
   */
  childBenefitReceived?: boolean;
  /**
   * Moderated children for whom no family allowance / CEDIES / SNJ was paid; each
   * generates the EUR 922.50 Art. 122 dégrèvement.
   */
  moderatedChildrenWithoutBenefit?: number;
  /**
   * Children whose moderation right expired at the end of one of the two
   * preceding years (studies finished, …). Drives the Art. 123bis bonification.
   * A child cannot be counted both here and in `childrenWithModeration`.
   */
  childrenWithBonification?: number;
  /** Per-child history; overrides the three scalar child-relief fields above. */
  childReliefHistory?: ChildReliefHistoryEntry[];

  /** Art. 3ter election. */
  assessmentMode?: AssessmentModeDto;
  reallocationPercentPrimary?: number;

  /** Art. 105bis unités d'éloignement. */
  travelUnitsPrimary?: number;
  travelUnitsSpouse?: number;

  art111bisContributors?: number;
  savingsHousingSubscriberAge?: number;

  /** Art. 114 prior-year losses as a single total (legacy: no year, so no expiry check). */
  priorYearLosses?: number;
  /**
   * Art. 114 losses with the year each arose. Preferred over `priorYearLosses` when present:
   * the 17-year carry-forward window can only be enforced when the year is known.
   */
  lossCarryForward?: Array<{ year: number; amount: number }>;

  /**
   * Art. 3 d): residence of the spouse. A couple whose two members live in different countries is
   * a "mixed couple" and is taxed separately unless the conditions below are met.
   */
  spouseResidence?: 'RESIDENT' | 'NON_RESIDENT';
  /**
   * Art. 3 d): the mixed couple asks for collective assessment. Granted only when the resident
   * spouse realises at least 90 % of the household's professional income in Luxembourg.
   */
  mixedCoupleCollectiveRequested?: boolean;
  /** Art. 129g AMVP (2026+). */
  amvpEligible?: boolean;

  invalidityRatePrimary?: number;
  invalidityRateSpouse?: number;

  /** Art. 48 n° 3: the spouse draws a salary from the household business. */
  spouseEmployedByBusiness?: boolean;

  /** Rental: allow the 35 % / EUR 2 700 forfait. */
  rentalForfaitEligible?: boolean;
  /** Rental: social-management exemption (90 %). */
  rentalSocial?: boolean;

  /** ASRD single premium and subscriber profile. */
  asrdPrimeUnique?: number;
  asrdSubscriberAge?: number;
  asrdChildren?: number;

  /** Credit for resident investors in eligible start-ups (2026+). */
  startupInvestment?: number;

  /** One movable gain (Art. 99bis / 100) — simple single-row entry. */
  movableGainProceeds?: number;
  movableGainCost?: number;
  movableGainHoldingMonths?: number;
  movableGainParticipationPercent?: number;

  /** One real-estate gain (Art. 99bis / 99ter / 102bis). */
  realEstateGainProceeds?: number;
  realEstateGainCost?: number;
  realEstateGainHoldingYears?: number;
  realEstateGainPrincipalResidence?: boolean;

  /** Prime jeune salarié (Art. 115 n° 13d). */
  youngEmployeePrime?: number;
  youngEmployeePrimeEligible?: boolean;

  /** One securities row (capital income). */
  securitiesGrossIncome?: number;
  securitiesQualifying?: boolean;
  securitiesForeignTax?: number;
  securitiesRelibiWithheld?: number;
  relibiFinalElective?: boolean;

  /** One rental building (asset register). */
  rentalGrossRent?: number;
  rentalCharges?: number;
  rentalPurchasePrice?: number;
  rentalCompletionYear?: number;
  rentalEnergyRenovationAmount?: number;
  rentalInterest?: number;

  /** One foreign income row, for the treaty method. */
  foreignCountry?: string;
  foreignAmount?: number;
  foreignTax?: number;

  /** Non-resident assimilation inputs (Art. 157ter / Art. 3 d). */
  nonResidentAssimilation?: boolean;
  worldwideIncome?: number;
  luxembourgProfessionalIncome?: number;
  householdProfessionalIncome?: number;
  foreignNetIncome?: number;

  notes?: string;
}

export interface MissingInformationTaskDto {
  id: string;
  workspaceId: string;
  taskType: TaskType;
  severity: TaskSeverity;
  title: string;
  description: string;
  isResolved: boolean;
  assignedToUserId?: string | null;
  relatedDocumentType?: string | null;
  relatedFactId?: string | null;
  createdAt: string;
  resolvedAt?: string | null;
}

export interface ReadinessDetailsDto {
  workspaceId: string;
  taxYear: number;
  completionScore: number; // 0 to 100
  totalTasks: number;
  unresolvedBlockers: number;
  unresolvedWarnings: number;
  tasks: MissingInformationTaskDto[];
}
