/**
 * Every explainer the interface shows behind a "?".
 *
 * Two rules kept this file honest. One: an id is a compile-time key, so a
 * component cannot ask for help that does not exist. Two: the body explains the
 * consequence — what changes if you pick this — rather than restating the label,
 * because a tooltip that repeats its own heading is noise.
 *
 * Voice: second person, one or two sentences, no jargon that the sentence does
 * not itself unpack.
 */

export interface HelpEntry {
  /** Shown in bold at the top of the tooltip. */
  readonly title: string;
  /** One or two sentences: what it is, and what it changes. */
  readonly body: string;
}

export const HELP_TEXTS = {
  // ── Household ────────────────────────────────────────────────────────────
  taxYearWorkspace: {
    title: 'Tax year',
    body: 'Each year is a separate workspace. Figures never move between years unless you roll them forward yourself.',
  },
  householdMembers: {
    title: 'Household members',
    body: 'A spouse joins with their own account. Until a document is shared, each of you sees only their own files.',
  },

  // ── Questionnaire ────────────────────────────────────────────────────────
  householdStatus: {
    title: 'Household status',
    body: 'Decides which tax class the engine applies: single, Class 1a with children, or Class 2 for a couple filing together.',
  },
  mixedCouple: {
    title: 'Cross-border couple (Art. 3 d)',
    body: 'A couple living on both sides of the border can ask to be taxed together, but only if the resident spouse earns at least 90 % of the household’s Luxembourg income.',
  },
  class2Window: {
    title: 'Keeping Class 2',
    body: 'After a death or a divorce, Class 2 can be kept for that year and the three following ones (Art. 119 n° 3).',
  },
  employmentIncome: {
    title: 'Employment income',
    body: 'Salary and benefits from your certificate 160F. The tax withheld there is a prepayment, not a separate income.',
  },
  freelanceIncome: {
    title: 'Freelance and business income',
    body: 'Art. 14 covers commercial activity, Art. 91 liberal professions. Both are taxed on net profit, so expenses reduce the figure.',
  },
  pensionIncome: {
    title: 'Pension income',
    body: 'Pensions and annuities, including a survivor’s pension. Tax withheld on a pension is a prepayment, not extra income.',
  },
  capitalIncome: {
    title: 'Capital income',
    body: 'Interest, dividends and gains. A qualifying dividend is taxed at half the rate and is declared on its own line.',
  },
  rentalIncome: {
    title: 'Rental income',
    body: 'Rent from property in Luxembourg. Charges and the flat allowance reduce the taxable base, not the rent you received.',
  },
  foreignIncome: {
    title: 'Foreign income',
    body: 'Income already taxed abroad. The credit is granted per country and capped at the Luxembourg tax that income attracts.',
  },
  mortgageInterest: {
    title: 'Mortgage interest',
    body: 'Interest on your main home only. The deductible share depends on the year the valeur locative was fixed, not on when you moved in.',
  },
  art111: {
    title: 'Art. 111 envelope',
    body: 'Private insurance, funeral costs and consumer-loan interest, capped at €672 per person. Anything above the cap is not deductible.',
  },
  art111bis: {
    title: 'Third-pillar pension (Art. 111bis)',
    body: 'Contributions to a supplementary pension have their own cap and do not consume the €672 envelope.',
  },
  savingsHousing: {
    title: 'Épargne-logement',
    body: 'Interest on a home-savings account, plus a bonus for young savers. The bonus has an age limit.',
  },
  donations: {
    title: 'Donations (Art. 112)',
    body: 'Gifts to approved organisations. The receipt must name the organisation and the year, or the amount cannot be recognised.',
  },
  childrenModeration: {
    title: 'Moderated children',
    body: 'Children in your household for whom you receive family allowances. The count drives several caps.',
  },
  childrenBonification: {
    title: 'Bonification',
    body: 'A refundable relief per child, not a deduction: it can be paid out even when no tax is due.',
  },
  cim: {
    title: 'Child-in-care credit (CIM)',
    body: 'A refundable credit for childcare. If it is larger than your tax, the difference is paid to you.',
  },
  travelUnits: {
    title: 'Travel units',
    body: 'The commute between home and work. One unit equals 4 km, and the allowance is capped.',
  },
  invalidity: {
    title: 'Invalidity rate',
    body: 'A recognised rate raises several deductions. Copy it from the certificate rather than estimating.',
  },
  priorYearLosses: {
    title: 'Losses carried forward',
    body: 'A loss from an earlier year reduces this year’s taxable base (Art. 114). It cannot create a refund on its own.',
  },
  asrd: {
    title: 'ASRD relief',
    body: 'A non-refundable relief linked to mortgage interest. Its multiplier depends on your children and your age.',
  },
  startupInvestment: {
    title: 'Start-up investment',
    body: 'A direct investment in a young company gives an investment deduction in the year you subscribe.',
  },
  spouseProfessional: {
    title: 'Spouse’s professional income',
    body: 'Whether your spouse also works changes the employee flat allowance and the Class 2 comparison.',
  },
  conjointAidant: {
    title: 'Conjoint aidant',
    body: 'A spouse who works in the family business without a separate salary. Special rules apply to their share.',
  },

  // ── Document vault ─────────────────────────────
  documentVault: {
    title: 'Document vault',
    body: 'Everything uploaded for this tax year. A file stays here even when its figures are not part of the return.',
  },
  confirmedFacts: {
    title: 'Confirmed facts',
    body: 'Figures you accepted. They feed the calculation and the Form 100 package; nothing else does.',
  },
  factInclusion: {
    title: 'Included in the return',
    body: 'Off means the figure is recorded but left out of this year’s calculation. You can switch it back at any time.',
  },
  factCategory: {
    title: 'Category',
    body: 'What kind of income or expense this is. It decides which cap applies and which line of Form 100 receives it.',
  },

  // ── Calculation ──────────────────────────────────────────────────────────
  marginalRate: {
    title: 'Marginal rate',
    body: 'The rate on your next euro of income: your top bracket, not your average.',
  },
  solidarity: {
    title: 'Solidarity surcharge',
    body: 'A 7 % surcharge on the tax bill, rising to 9 % above €150,000. It funds the employment fund.',
  },
  fraisObtention: {
    title: 'Frais d’obtention',
    body: 'The cost of earning your salary. The engine uses the flat allowance unless your actual costs are higher.',
  },
  credits: {
    title: 'Tax credits',
    body: 'Applied after the scale. The CIM part is refundable; the others can only reduce the bill to zero.',
  },
  withheldAtSource: {
    title: 'Withheld at source',
    body: 'Tax your employer already paid on your salary (code 105). It is subtracted from the final bill, not added to income.',
  },
  taxableIncome: {
    title: 'Taxable income',
    body: 'Income after the deductions the law allows. The scale is applied to this figure, not to your gross salary.',
  },
  deductionsTotal: {
    title: 'Total deductions',
    body: 'Everything that reduces taxable income: professional costs, special expenses, interest and extraordinary costs.',
  },
  scenarioComparison: {
    title: 'Scenario comparison',
    body: 'Runs the same year with a different election — single versus joint, for example — without changing your saved return.',
  },

  // ── Document vault ───────────────────────────────────────────────────────
  documentVisibility: {
    title: 'Who can see this document',
    body: 'Private draft: only you. Shared: the household can read it, but its figures stay out of the return. Proposed: the co-filer may include it. Included: its figures are in the return.',
  },
  factConfidence: {
    title: 'Reading confidence',
    body: 'How sure the reader was of this figure. Nothing enters the return until you confirm it.',
  },
  needsOcr: {
    title: 'Needs OCR',
    body: 'No text could be read — a photo or a scan. Re-scan once an OCR engine is configured, or type the figures yourself.',
  },

  // ── Filing ───────────────────────────────────────────────────────────────
  packageChecksum: {
    title: 'Package checksum',
    body: 'A SHA-256 of everything generated, so a later change to the file is detectable.',
  },
  formBox: {
    title: 'Form 100 case',
    body: 'The page, sheet and case number printed on the official form where this figure belongs.',
  },
  approval: {
    title: 'Approval',
    body: 'A joint return needs both filers to approve. A material change resets the approval, so it must be given again.',
  },
  filingRoute: {
    title: 'Filing route',
    body: 'How the return reached the ACD. MyGuichet is the electronic route; the paper form is the fallback.',
  },

  // ── Assessment ───────────────────────────────────────────────────────────
  assessmentVariance: {
    title: 'Declared vs assessed',
    body: 'The difference between what you filed and what the ACD calculated. A variance is a prompt to read the bulletin, not proof of an error.',
  },
  objectionDeadline: {
    title: 'Objection deadline',
    body: 'Three months from the bulletin date to contest the assessment (Art. 107). It is a legal deadline.',
  },
  followUpDate: {
    title: 'Follow-up date',
    body: 'A reminder you set for yourself. It changes nothing at the administration.',
  },
  rollover: {
    title: 'Roll into next year',
    body: 'Copies the profile and dependants into next year’s workspace. Every figure still has to be confirmed again.',
  },

  // ── Freelance ────────────────────────────────────────────────────────────
  freelanceNature: {
    title: 'Commercial or liberal',
    body: 'Art. 14 (commercial) and Art. 91 (liberal profession) land on different Form 100 sheets, so the nature matters.',
  },
  netProfit: {
    title: 'Net profit',
    body: 'Revenue minus deductible operating expenses. Only the net figure enters the return.',
  },
  vatCollected: {
    title: 'VAT',
    body: 'VAT you collect is not income: it passes through to the administration.',
  },

  // ── Admin console ────────────────────────────────────────────────────────
  modelCapabilities: {
    title: 'Capabilities',
    body: 'Vision models read images and scans; text models only read text already extracted from a PDF.',
  },
  dataClass: {
    title: 'Data class',
    body: 'The most sensitive data this model may receive. CUSTOMER_DOCUMENT means unredacted scans, so the model must be cleared for it.',
  },
  rolloutPercentage: {
    title: 'Rollout',
    body: 'The share of matching requests sent to this model. 100 % sends everything to it.',
  },
  modelRouting: {
    title: 'Task routing',
    body: 'Which model reads which task. The primary is tried first; the fallbacks cover an outage.',
  },
} as const satisfies Record<string, HelpEntry>;

export type HelpId = keyof typeof HELP_TEXTS;
