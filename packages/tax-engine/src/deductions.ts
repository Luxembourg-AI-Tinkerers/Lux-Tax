import { TaxClass } from '@luxtax/contracts';

export interface DeductionsBreakdown {
  employmentExpensesDeduction: number;
  specialExpensesDeduction: number;
  mortgageInterestDeduction: number;
  insuranceAndSavingsDeduction: number;
  donationsDeduction: number;
  totalDeductions: number;
}

/**
 * Calculates allowable deductions under Luxembourg tax law:
 * - Frais d'obtention minimum: €540 per employed person.
 * - Forfait dépenses spéciales: €480 (Class 1/1a) or €960 (Class 2).
 * - Art 111 LIR: €672 per person in household.
 * - Primary residence mortgage interest: capped according to occupation year.
 * - Art 112 LIR donations: min €120, max 20% of net income.
 */
export function calculateDeductions(params: {
  taxClass: TaxClass;
  employedSpousesCount: number;
  actualEmploymentExpenses: number;
  declaredMortgageInterest: number;
  occupancyYear?: number;
  taxYear: number;
  declaredInsurance: number;
  householdMembersCount: number;
  declaredDonations: number;
  netIncomeBeforeSpecialExpenses: number;
}): DeductionsBreakdown {
  const {
    taxClass,
    employedSpousesCount,
    actualEmploymentExpenses,
    declaredMortgageInterest,
    occupancyYear,
    taxYear,
    declaredInsurance,
    householdMembersCount,
    declaredDonations,
    netIncomeBeforeSpecialExpenses,
  } = params;

  // 1. Frais d'obtention (Employment expenses minimum = €540 per working person)
  const minimumFrais = employedSpousesCount > 0 ? employedSpousesCount * 540 : 0;
  const employmentExpensesDeduction = Math.max(minimumFrais, actualEmploymentExpenses);

  // 2. Primary residence mortgage interest cap (Art 102 LIR)
  // Recent occupation (0-5 years): €4,000/person
  // 6-10 years: €3,000/person
  // >10 years: €2,000/person
  let mortgageCapPerPerson = 4000;
  if (occupancyYear) {
    const yearsOccupied = taxYear - occupancyYear;
    if (yearsOccupied > 10) {
      mortgageCapPerPerson = 2000;
    } else if (yearsOccupied > 5) {
      mortgageCapPerPerson = 3000;
    }
  }
  const totalMortgageCap = mortgageCapPerPerson * Math.max(1, householdMembersCount);
  const mortgageInterestDeduction = Math.min(declaredMortgageInterest, totalMortgageCap);

  // 3. Art 111 LIR: Insurance and debit interest cap (€672 per household member)
  const insuranceCap = 672 * Math.max(1, householdMembersCount);
  const insuranceAndSavingsDeduction = Math.min(declaredInsurance, insuranceCap);

  // 4. Art 112 LIR: Donations (min €120, max 20% of net income or €1,000,000)
  let donationsDeduction = 0;
  if (declaredDonations >= 120) {
    const maxDonationAllowed = Math.max(0, netIncomeBeforeSpecialExpenses * 0.20);
    donationsDeduction = Math.min(declaredDonations, maxDonationAllowed);
  }

  // 5. Flat minimum for special expenses (forfait dépenses spéciales)
  // €480 for single (Class 1/1a) or €960 for married joint (Class 2)
  const flatSpecialExpensesMinimum = taxClass === TaxClass.CLASS_2 ? 960 : 480;
  const actualSpecialExpensesSum = insuranceAndSavingsDeduction + donationsDeduction;
  const specialExpensesDeduction = Math.max(flatSpecialExpensesMinimum, actualSpecialExpensesSum);

  const totalDeductions =
    employmentExpensesDeduction +
    mortgageInterestDeduction +
    specialExpensesDeduction;

  return {
    employmentExpensesDeduction,
    specialExpensesDeduction,
    mortgageInterestDeduction,
    insuranceAndSavingsDeduction,
    donationsDeduction,
    totalDeductions,
  };
}
