import type { Form100CaseRef } from './form100-case-map';

/**
 * How one confirmed capital or rental fact has to be printed on the Form 100.
 *
 * `INCOME`: the amount is taxable income and belongs to the category case.
 * `CREDIT`: the amount is tax already withheld; the ACD deducts it, so printing
 *           it as a positive income case overstates the declared income.
 * `DEDUCTION`: the amount reduces the gross income of its category; printing it
 *           as income adds the expense to the tax base.
 */
export type FactAmountRole = 'INCOME' | 'CREDIT' | 'DEDUCTION';

/**
 * The role of a capital or rental fact, decided by its field key exactly as the
 * tax engine decides it (`packages/tax-engine/src/engine.ts`):
 *
 * - `CAPITAL_INCOME`: `withholdingTax` is a credit; everything else — including
 *   `qualifyingDividend`, whose 50 % exemption the engine computes — is income.
 * - `RENTAL_INCOME`: `rentalCharges` is a deduction; `grossRent` and a net
 *   amount are income.
 *
 * Returns `null` for a category this table does not cover.
 */
export function factAmountRole(
  category: string,
  fieldKey: string,
): FactAmountRole | null {
  if (category === 'CAPITAL_INCOME') {
    return fieldKey === 'withholdingTax' ? 'CREDIT' : 'INCOME';
  }

  if (category === 'RENTAL_INCOME') {
    return fieldKey === 'rentalCharges' ? 'DEDUCTION' : 'INCOME';
  }

  return null;
}

/**
 * A withholding is a credit the ACD deducts, never a positive income case: the
 * 100F claims it on the RD sheet (page 19). Our case map has no copyable case
 * number for the withholding on movable capital, so the package points at the
 * sheet with `caseNumber: 'computed'` — the convention the contract reserves
 * for credits the ACD derives itself — instead of guessing a printed case.
 */
export const RD_WITHHOLDING_CREDIT: Form100CaseRef = {
  page: 19,
  sheet: 'RD',
  caseNumber: 'computed',
};

/**
 * Sheet L prints gross rent and the deductible charges on separate lines; the
 * case map only carries the gross-rent case (1001/1002). Posting the charges as
 * a negative rent would read as a negative gross rent, so the package emits a
 * clearly labelled deduction pointer on the same sheet instead.
 */
export const RENTAL_CHARGES_DEDUCTION: Form100CaseRef = {
  page: 10,
  sheet: 'L',
  caseNumber: 'charges (deduction)',
};
