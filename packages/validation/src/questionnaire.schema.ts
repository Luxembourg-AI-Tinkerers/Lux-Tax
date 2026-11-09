import { z } from 'zod';

/**
 * Guided household questionnaire.
 *
 * Every field here exists because the tax engine needs it to apply the right
 * legal rule (class assignment, plafond multipliers, AEP route, CIM gate, …).
 */
export const questionnaireSchema = z.object({
  maritalStatus: z.enum(['SINGLE', 'MARRIED', 'PACS', 'DIVORCED', 'WIDOWED']),
  hasEmploymentIncome: z.boolean(),
  hasPensionIncome: z.boolean(),
  hasPrimaryResidenceMortgage: z.boolean(),
  /** Year the valeur locative was fixed (owner-occupied home), not "occupation year". */
  mortgageOccupancyYear: z.number().int().min(1950).max(2030).optional(),
  /** True while the home is being built / not yet at the owner's disposal. */
  mortgageBeforeDisposition: z.boolean().optional(),
  hasLifeInsuranceOrPensionPlan: z.boolean(),
  /** Art. 111bis / 111ter third-pillar contract (separate from the €672 envelope). */
  hasPensionSavingsContract: z.boolean().optional(),
  /** Épargne-logement contract. */
  hasSavingsHousingContract: z.boolean().optional(),
  hasDonations: z.boolean(),
  hasFreelanceIncome: z.boolean().default(false),
  childrenCount: z.number().int().min(0).max(20).default(0),
  /** Children generating a modération d'impôt (drives plafond multipliers). */
  childrenWithModeration: z.number().int().min(0).max(20).optional(),
  /** Ages on 1 January of the tax year (Class 1a at 65). */
  primaryAge: z.number().int().min(16).max(110).optional(),
  spouseAge: z.number().int().min(16).max(110).optional(),
  /** Art. 119 n° 3 b: year of the spouse's death (three-year Class 2 window). */
  spouseDeathYear: z.number().int().min(1900).max(2100).optional(),
  /** Art. 119 n° 3 c: year of the divorce or separation (three-year Class 2 window). */
  divorceOrSeparationYear: z.number().int().min(1900).max(2100).optional(),
  /** Art. 119 n° 3 c: Class 2 for at least five years before the divorce/separation. */
  class2BeforeEvent: z.boolean().optional(),
  /** Does the spouse also have professional income (Art. 129b AEP route a)? */
  spouseHasProfessionalIncome: z.boolean().optional(),
  /** Spouse registered as conjoint-aidant (Art. 129b route b). */
  spouseIsConjointAidant: z.boolean().optional(),
  /** Spouse retired less than 3 years ago (Art. 129b route c). */
  spouseRetiredUnder3Years: z.boolean().optional(),
  /** Both parents share the child's home → CIM excluded. */
  bothParentsSameHome: z.boolean().optional(),
  isSingleParent: z.boolean().optional(),
  /** Allocations paid for the child (CIM reduction above €2,712). */
  childAllocations: z.number().min(0).max(1_000_000).optional(),
  /** Family allowance / CEDIES / SNJ received for the moderated children (Art. 122 gate). */
  childBenefitReceived: z.boolean().optional(),
  /** Moderated children with no family allowance / CEDIES / SNJ (Art. 122 dégrèvement). */
  moderatedChildrenWithoutBenefit: z.number().int().min(0).max(20).optional(),
  /** Children whose moderation right expired, for the Art. 123bis bonification. */
  childrenWithBonification: z.number().int().min(0).max(20).optional(),
  /**
   * Per-child relief history. When supplied it overrides the three scalar child
   * fields: only this shape can enforce the two-bonification lifetime cap and the
   * 2025–2026 résidence-alternée rule (Art. 123bis al. 1a).
   */
  childReliefHistory: z
    .array(
      z.object({
        childId: z.string().max(120).optional(),
        moderationThisYear: z.boolean().optional(),
        benefitReceived: z.boolean().optional(),
        moderationEndYear: z.number().int().min(1900).max(2100).optional(),
        bonificationsGranted: z.number().int().min(0).max(2).optional(),
        residenceAlternee: z.boolean().optional(),
        jointParentalAuthority: z.boolean().optional(),
        familyAllowanceReceived: z.boolean().optional(),
        inHousehold: z.boolean().optional(),
      }),
    )
    .max(20)
    .optional(),
  /** Art. 3ter election (married couples). */
  assessmentMode: z.enum(['COLLECTIVE', 'INDIVIDUAL_PURE', 'INDIVIDUAL_REALLOCATION']).optional(),
  reallocationPercentPrimary: z.number().min(0).max(100).optional(),
  /** Unités d'éloignement for the déplacement forfait (Art. 105bis). */
  travelUnitsPrimary: z.number().int().min(0).max(60).optional(),
  travelUnitsSpouse: z.number().int().min(0).max(60).optional(),
  /** Number of 111bis/111ter souscripteurs (1 or 2). */
  art111bisContributors: z.number().int().min(1).max(2).optional(),
  /** Age of the younger adult épargne-logement subscriber on 1 January. */
  savingsHousingSubscriberAge: z.number().int().min(16).max(110).optional(),
  /** Art. 114 prior-year losses carried forward. */
  priorYearLosses: z.number().min(0).max(10_000_000).optional(),
  /** Art. 3 d): where the spouse lives, for the mixed-couple gate. */
  spouseResidence: z.enum(['RESIDENT', 'NON_RESIDENT']).optional(),
  /** Art. 3 d): the couple asks for collective assessment (needs a mixed couple). */
  mixedCoupleCollectiveRequested: z.boolean().optional(),
  /** Art. 114 losses by year; the engine enforces the 17-year window on these. */
  lossCarryForward: z
    .array(
      z.object({
        year: z.number().int().min(1990).max(2100),
        amount: z.number().min(0).max(10_000_000),
      }),
    )
    .max(50)
    .optional(),
  /** Art. 129g AMVP eligibility (2026+). */
  amvpEligible: z.boolean().optional(),
  /** Reduced working capacity 0–1 for the invalidity forfaits. */
  invalidityRatePrimary: z.number().min(0).max(1).optional(),
  invalidityRateSpouse: z.number().min(0).max(1).optional(),
  spouseEmployedByBusiness: z.boolean().optional(),
  rentalForfaitEligible: z.boolean().optional(),
  rentalSocial: z.boolean().optional(),
  asrdPrimeUnique: z.number().min(0).max(1_000_000).optional(),
  asrdSubscriberAge: z.number().int().min(16).max(110).optional(),
  asrdChildren: z.number().int().min(0).max(20).optional(),
  startupInvestment: z.number().min(0).max(10_000_000).optional(),
  movableGainProceeds: z.number().min(0).max(100_000_000).optional(),
  movableGainCost: z.number().min(0).max(100_000_000).optional(),
  movableGainHoldingMonths: z.number().int().min(0).max(1200).optional(),
  movableGainParticipationPercent: z.number().min(0).max(100).optional(),
  realEstateGainProceeds: z.number().min(0).max(100_000_000).optional(),
  realEstateGainCost: z.number().min(0).max(100_000_000).optional(),
  realEstateGainHoldingYears: z.number().int().min(0).max(200).optional(),
  realEstateGainPrincipalResidence: z.boolean().optional(),
  youngEmployeePrime: z.number().min(0).max(1_000_000).optional(),
  youngEmployeePrimeEligible: z.boolean().optional(),
  securitiesGrossIncome: z.number().min(0).max(100_000_000).optional(),
  securitiesQualifying: z.boolean().optional(),
  securitiesForeignTax: z.number().min(0).max(100_000_000).optional(),
  securitiesRelibiWithheld: z.number().min(0).max(100_000_000).optional(),
  relibiFinalElective: z.boolean().optional(),
  rentalGrossRent: z.number().min(0).max(100_000_000).optional(),
  rentalCharges: z.number().min(0).max(100_000_000).optional(),
  rentalPurchasePrice: z.number().min(0).max(100_000_000).optional(),
  rentalCompletionYear: z.number().int().min(1800).max(2100).optional(),
  rentalEnergyRenovationAmount: z.number().min(0).max(100_000_000).optional(),
  rentalInterest: z.number().min(0).max(100_000_000).optional(),
  foreignCountry: z.string().length(2).optional(),
  foreignAmount: z.number().min(0).max(100_000_000).optional(),
  foreignTax: z.number().min(0).max(100_000_000).optional(),
  nonResidentAssimilation: z.boolean().optional(),
  worldwideIncome: z.number().min(0).max(100_000_000).optional(),
  luxembourgProfessionalIncome: z.number().min(0).max(100_000_000).optional(),
  householdProfessionalIncome: z.number().min(0).max(100_000_000).optional(),
  foreignNetIncome: z.number().min(0).max(100_000_000).optional(),
  notes: z.string().max(1000).optional(),
}).superRefine((answers, ctx) => {
  // Art. 105 habit_pers: the deduction depends on how many years have passed since the year the
  // valeur locative was fixed (years 1-2 unlimited, 3-6 EUR 4 000, 7-11 EUR 3 000, 12+ EUR 2 000).
  // Without that year the engine refuses the interest and warns, so the questionnaire must not
  // accept the combination: a user would otherwise lose a deduction they are entitled to.
  if (answers.mixedCoupleCollectiveRequested && answers.spouseResidence === undefined) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['spouseResidence'],
      message:
        'A request for collective assessment (Art. 3 d) needs the spouse\'s residence: the gate ' +
        'compares the two residences and requires the resident spouse to realise at least 90 % of ' +
        'the household professional income in Luxembourg.',
    });
  }

  if (
    answers.hasPrimaryResidenceMortgage &&
    answers.mortgageBeforeDisposition !== true &&
    answers.mortgageOccupancyYear === undefined
  ) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['mortgageOccupancyYear'],
      message:
        'The year the valeur locative was fixed is required when a mortgage on the primary ' +
        'residence is declared: the Art. 105 schedule cannot be applied without it, so the ' +
        'interest would not be deducted. Set mortgageBeforeDisposition instead for a home ' +
        "that is still under construction.",
    });
  }
});

export type QuestionnaireInput = z.infer<typeof questionnaireSchema>;
