import { TaxClass } from '@luxtax/contracts';

export interface TaxCreditsBreakdown {
  cisAmount: number;
  cimAmount: number;
  totalTaxCredits: number;
}

/**
 * Calculates Luxembourg Tax Credits (2025):
 * - CIS (Crédit d'impôt salarié):
 *   - Gross income <= €11,265: €0
 *   - €11,265 < Gross <= €40,000: up to €600/year (graduated up to €696 depending on scale)
 *   - €40,000 < Gross < €80,000: Linear phaseout from €600 down to €0: 600 - (Gross - 40000) * 0.015
 *   - Gross >= €80,000: €0
 * - CIM (Crédit d'impôt monoparental):
 *   - For Class 1a single parents: €2,505/year for income up to €35,000, phased down to minimum €750.
 */
export function calculateTaxCredits(params: {
  taxClass: TaxClass;
  grossSalaries: number[];
  taxableIncome: number;
  isSingleParent: boolean;
}): TaxCreditsBreakdown {
  const { taxClass, grossSalaries, taxableIncome, isSingleParent } = params;

  let totalCis = 0;
  for (const gross of grossSalaries) {
    if (gross > 11265 && gross < 80000) {
      if (gross <= 40000) {
        // Linear increase or flat 600
        totalCis += Math.min(600, (gross - 11265) * 0.021 + 300);
      } else {
        // Phase-out above 40,000
        const cis = 600 - (gross - 40000) * 0.015;
        totalCis += Math.max(0, cis);
      }
    }
  }

  const cisAmount = Math.round(totalCis * 100) / 100;

  let cimAmount = 0;
  if (taxClass === TaxClass.CLASS_1A && isSingleParent) {
    if (taxableIncome <= 35000) {
      cimAmount = 2505;
    } else if (taxableIncome <= 105000) {
      cimAmount = Math.max(750, 2505 - (taxableIncome - 35000) * 0.025);
    } else {
      cimAmount = 750;
    }
    cimAmount = Math.round(cimAmount * 100) / 100;
  }

  const totalTaxCredits = cisAmount + cimAmount;

  return {
    cisAmount,
    cimAmount,
    totalTaxCredits,
  };
}
