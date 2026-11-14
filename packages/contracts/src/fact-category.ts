import { DocumentType, FactCategory } from './enums';

/**
 * Which deduction or income category a recognised figure belongs to.
 *
 * The extractor knows the printed field name (`childcareExpense`), while the
 * engine, the deduction caps and the Form 100 case map all key on a category.
 * That translation used to live in the browser, which meant a fact confirmed
 * from the API — or bulk-confirmed — had no category at all. One table, shared
 * by both callers, is the only way the two agree.
 */
const CATEGORY_BY_FIELD: Readonly<Record<string, FactCategory>> = {
  grossSalary: FactCategory.EMPLOYMENT_INCOME,
  socialSecurity: FactCategory.EMPLOYMENT_INCOME,
  withholdingTax: FactCategory.EMPLOYMENT_INCOME,
  fraisObtention: FactCategory.EMPLOYMENT_INCOME,

  grossPension: FactCategory.PENSION_INCOME,

  capitalIncome: FactCategory.CAPITAL_INCOME,
  qualifyingDividend: FactCategory.CAPITAL_INCOME,

  rentalGross: FactCategory.RENTAL_INCOME,
  rentalCharges: FactCategory.RENTAL_INCOME,
  rentalNet: FactCategory.RENTAL_INCOME,

  foreignIncome: FactCategory.FOREIGN_INCOME,

  freelanceRevenue: FactCategory.FREELANCE_INCOME,
  professionalRevenue: FactCategory.FREELANCE_INCOME,

  businessExpense: FactCategory.BUSINESS_EXPENSE,
  professionalExpense: FactCategory.BUSINESS_EXPENSE,

  mortgageInterest: FactCategory.MORTGAGE_INTEREST,
  mortgageDeduction: FactCategory.MORTGAGE_DEDUCTION,

  insurancePremium: FactCategory.INSURANCE_DEDUCTION,
  pensionSavings111bis: FactCategory.PENSION_SAVINGS_111BIS,
  savingsHousing: FactCategory.SAVINGS_HOUSING,
  lrcp: FactCategory.LRCP_CONTRIBUTION,

  donationAmount: FactCategory.DONATION_DEDUCTION,
  childcareExpense: FactCategory.CHILDCARE_EXPENSE,
  domesticServiceExpense: FactCategory.HOUSEHOLD_HELP_EXPENSE,
};

/**
 * Category for one recognised figure.
 *
 * `documentType` is a tie-breaker only: a salary certificate's figures are
 * employment income whatever the field is called, while an unrecognised field
 * on a freelance invoice stays an ordinary deduction. Anything unknown becomes
 * `OTHER_DEDUCTION` — never a guess that changes how tax is computed.
 */
export function factCategoryForFieldName(
  fieldName: string,
  documentType?: DocumentType | string | null,
): FactCategory {
  const known = CATEGORY_BY_FIELD[fieldName];
  if (known) return known;

  switch (documentType) {
    case DocumentType.SALARY_CERTIFICATE:
    case DocumentType.PENSION_CERTIFICATE:
    case DocumentType.MORTGAGE_CERTIFICATE:
    case DocumentType.INSURANCE_CERTIFICATE:
    case DocumentType.DONATION_CERTIFICATE:
      // A figure on one of these is the figure the certificate exists to
      // report; the specific field name already won above when it was known.
      return documentType === DocumentType.DONATION_CERTIFICATE
        ? FactCategory.DONATION_DEDUCTION
        : FactCategory.OTHER_DEDUCTION;
    case DocumentType.FREELANCE_INVOICE:
      return FactCategory.FREELANCE_INCOME;
    case DocumentType.BUSINESS_EXPENSE:
      return FactCategory.BUSINESS_EXPENSE;
    case DocumentType.CHILDCARE_INVOICE:
      return FactCategory.CHILDCARE_EXPENSE;
    default:
      return FactCategory.OTHER_DEDUCTION;
  }
}
