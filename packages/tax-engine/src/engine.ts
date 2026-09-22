import {
  TaxClass,
  TaxCalculationParams,
  TaxCalculationResultDto,
  CalculationLineItemProvenance,
} from '@luxtax/contracts';
import { calculateBaseTaxForClass } from './scale2025';
import { calculateDeductions } from './deductions';
import { calculateTaxCredits } from './credits';

export class LuxembourgTaxEngine {
  /**
   * Deterministic calculation for Luxembourg personal income tax (2025).
   */
  public static calculate(params: TaxCalculationParams): TaxCalculationResultDto {
    const {
      taxYear,
      taxClass,
      facts,
      primaryUserId,
      spouseUserId,
      dependantsCount = 0,
    } = params;

    const provenance: CalculationLineItemProvenance[] = [];
    const warnings: string[] = [];

    // 1. Group facts by category and owner
    let totalGrossSalary = 0;
    let totalSocialContributions = 0;
    let totalWithholdingTax = 0;
    let totalMortgageInterest = 0;
    let totalInsurance = 0;
    let totalDonations = 0;
    let totalActualFrais = 0;

    const grossSalaries: number[] = [];
    const salaryFactIds: string[] = [];
    const mortgageFactIds: string[] = [];
    const insuranceFactIds: string[] = [];
    const donationFactIds: string[] = [];
    const withholdingFactIds: string[] = [];

    for (const fact of facts) {
      const amt = Number(fact.amount) || 0;
      switch (fact.category) {
        case 'EMPLOYMENT_INCOME':
          if (fact.fieldKey === 'grossSalary' || fact.fieldKey === 'code_101' || fact.fieldKey === 'code_102') {
            totalGrossSalary += amt;
            grossSalaries.push(amt);
            salaryFactIds.push(fact.id);
          } else if (fact.fieldKey === 'socialSecurity' || fact.fieldKey === 'code_103') {
            totalSocialContributions += amt;
            salaryFactIds.push(fact.id);
          } else if (fact.fieldKey === 'withholdingTax' || fact.fieldKey === 'code_105') {
            totalWithholdingTax += amt;
            withholdingFactIds.push(fact.id);
          } else if (fact.fieldKey === 'fraisObtention') {
            totalActualFrais += amt;
          }
          break;
        case 'MORTGAGE_DEDUCTION':
          totalMortgageInterest += amt;
          mortgageFactIds.push(fact.id);
          break;
        case 'INSURANCE_DEDUCTION':
          totalInsurance += amt;
          insuranceFactIds.push(fact.id);
          break;
        case 'DONATION_DEDUCTION':
          totalDonations += amt;
          donationFactIds.push(fact.id);
          break;
        default:
          break;
      }
    }

    // Determine count of employed spouses
    let employedSpousesCount = grossSalaries.length > 0 ? (grossSalaries.length >= 2 || (primaryUserId && spouseUserId) ? 2 : 1) : 1;
    const householdMembersCount = (spouseUserId ? 2 : 1) + dependantsCount;

    // Gross employment income after social security
    const netEmploymentIncome = Math.max(0, totalGrossSalary - totalSocialContributions);

    provenance.push({
      ruleCode: 'LIR-ART-95',
      description: 'Gross employment income after mandatory social security contributions (Cotisations sociales)',
      sourceFactIds: salaryFactIds,
      formula: 'grossSalary - socialSecurityContributions',
      inputs: {
        grossSalary: totalGrossSalary,
        socialSecurityContributions: totalSocialContributions,
      },
      outputAmount: netEmploymentIncome,
    });

    // 2. Compute deductions
    const deductions = calculateDeductions({
      taxClass,
      employedSpousesCount,
      actualEmploymentExpenses: totalActualFrais,
      declaredMortgageInterest: totalMortgageInterest,
      taxYear,
      declaredInsurance: totalInsurance,
      householdMembersCount,
      declaredDonations: totalDonations,
      netIncomeBeforeSpecialExpenses: netEmploymentIncome,
    });

    provenance.push({
      ruleCode: 'LIR-ART-107',
      description: 'Minimum employment expenses deduction (Frais d\'obtention forfaitaires: €540 per working person)',
      sourceFactIds: [],
      formula: 'max(employedCount * 540, actualFrais)',
      inputs: {
        employedCount: employedSpousesCount,
        actualFrais: totalActualFrais,
      },
      outputAmount: deductions.employmentExpensesDeduction,
    });

    if (totalMortgageInterest > 0) {
      provenance.push({
        ruleCode: 'LIR-ART-102',
        description: 'Deductible mortgage interest on primary residence (capped per household member)',
        sourceFactIds: mortgageFactIds,
        formula: 'min(declaredInterest, capPerPerson * membersCount)',
        inputs: {
          declaredInterest: totalMortgageInterest,
          membersCount: householdMembersCount,
        },
        outputAmount: deductions.mortgageInterestDeduction,
      });
    }

    provenance.push({
      ruleCode: 'LIR-ART-109-112',
      description: 'Special expenses deduction (Dépenses spéciales: insurance, pension, donations, or flat minimum)',
      sourceFactIds: [...insuranceFactIds, ...donationFactIds],
      formula: 'max(flatSpecialExpensesMinimum, insuranceDeduction + donationsDeduction)',
      inputs: {
        insurance: deductions.insuranceAndSavingsDeduction,
        donations: deductions.donationsDeduction,
      },
      outputAmount: deductions.specialExpensesDeduction,
    });

    // 3. Taxable income (Revenu imposable ajusté)
    const taxableIncome = Math.max(0, netEmploymentIncome - deductions.totalDeductions);

    provenance.push({
      ruleCode: 'LIR-ART-119',
      description: 'Adjusted taxable income (Revenu imposable ajusté)',
      sourceFactIds: [],
      formula: 'max(0, netEmploymentIncome - totalDeductions)',
      inputs: {
        netEmploymentIncome,
        totalDeductions: deductions.totalDeductions,
      },
      outputAmount: taxableIncome,
    });

    // 4. Base progressive tax
    const baseTax = calculateBaseTaxForClass(taxableIncome, taxClass);

    provenance.push({
      ruleCode: 'LIR-ART-118-121',
      description: `Base income tax calculated using 2025 progressive scale for ${taxClass}`,
      sourceFactIds: [],
      formula: taxClass === TaxClass.CLASS_2 ? '2 * ProgressiveScale(taxableIncome / 2)' : 'ProgressiveScale(taxableIncome)',
      inputs: {
        taxableIncome,
        taxClass,
      },
      outputAmount: baseTax,
    });

    // 5. Solidarity surcharge (Contribution au fonds pour l'emploi)
    const highIncomeThreshold = taxClass === TaxClass.CLASS_2 ? 300000 : 150000;
    const solidaritySurchargeRate = taxableIncome > highIncomeThreshold ? 0.09 : 0.07;
    const solidaritySurchargeAmount = Math.round(baseTax * solidaritySurchargeRate * 100) / 100;

    provenance.push({
      ruleCode: 'LIR-ART-FONDS-EMPLOI',
      description: `Solidarity surcharge (${(solidaritySurchargeRate * 100).toFixed(0)}% contribution to Employment Fund)`,
      sourceFactIds: [],
      formula: 'baseTax * solidaritySurchargeRate',
      inputs: {
        baseTax,
        solidaritySurchargeRate,
      },
      outputAmount: solidaritySurchargeAmount,
    });

    const totalTaxBeforeCredits = Math.round((baseTax + solidaritySurchargeAmount) * 100) / 100;

    // 6. Tax credits (CIS, CIM)
    const isSingleParent = taxClass === TaxClass.CLASS_1A && dependantsCount > 0;
    const credits = calculateTaxCredits({
      taxClass,
      grossSalaries,
      taxableIncome,
      isSingleParent,
    });

    if (credits.cisAmount > 0) {
      provenance.push({
        ruleCode: 'LIR-ART-139ter-CIS',
        description: 'Employee tax credit (Crédit d\'impôt salarié - CIS)',
        sourceFactIds: salaryFactIds,
        formula: 'calculateCis(grossSalaries)',
        inputs: {
          totalGross: totalGrossSalary,
        },
        outputAmount: credits.cisAmount,
      });
    }

    if (credits.cimAmount > 0) {
      provenance.push({
        ruleCode: 'LIR-ART-139quater-CIM',
        description: 'Single-parent tax credit (Crédit d\'impôt monoparental - CIM)',
        sourceFactIds: [],
        formula: 'calculateCim(taxableIncome)',
        inputs: {
          taxableIncome,
        },
        outputAmount: credits.cimAmount,
      });
    }

    // 7. Final tax liability
    const finalTaxLiability = Math.max(0, Math.round((totalTaxBeforeCredits - credits.totalTaxCredits) * 100) / 100);

    // 8. Balance payable / Refund
    // Balance = finalTaxLiability - totalWithholdingTax
    // Positive = tax due to ACD; Negative = refund from ACD
    const balancePayableOrRefund = Math.round((finalTaxLiability - totalWithholdingTax) * 100) / 100;

    provenance.push({
      ruleCode: 'LIR-ART-154',
      description: 'Tax reconciliation: Tax liability minus tax withheld at source (Retenue d\'impôt sur traitements et salaires)',
      sourceFactIds: withholdingFactIds,
      formula: 'finalTaxLiability - taxWithheldAtSource',
      inputs: {
        finalTaxLiability,
        taxWithheldAtSource: totalWithholdingTax,
      },
      outputAmount: balancePayableOrRefund,
    });

    if (totalGrossSalary === 0) {
      warnings.push('No gross salary facts confirmed for this workspace. Tax liability is 0.');
    }
    if (taxClass === TaxClass.CLASS_2 && !spouseUserId) {
      warnings.push('Class 2 selected but no spouse is registered in the workspace.');
    }

    return {
      taxYear,
      taxClass,
      grossIncome: totalGrossSalary,
      totalDeductions: deductions.totalDeductions,
      taxableIncome,
      baseTax,
      solidaritySurchargeRate,
      solidaritySurchargeAmount,
      totalTaxBeforeCredits,
      totalTaxCredits: credits.totalTaxCredits,
      finalTaxLiability,
      taxWithheldAtSource: totalWithholdingTax,
      balancePayableOrRefund,
      provenance,
      warnings,
      calculatedAt: new Date().toISOString(),
    };
  }
}
