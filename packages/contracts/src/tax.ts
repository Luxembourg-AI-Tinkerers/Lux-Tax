import { TaxClass, TaxResidence } from './enums';

export interface TaxCalculationFactInput {
  id: string;
  ownerId?: string | null;
  category: string;
  fieldKey: string;
  amount: number;
  sourceDocumentId?: string | null;
}

export interface TaxCalculationParams {
  taxYear: number;
  taxClass: TaxClass;
  residence: TaxResidence;
  facts: TaxCalculationFactInput[];
  primaryUserId: string;
  spouseUserId?: string | null;
  dependantsCount?: number;
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

export interface TaxCalculationResultDto {
  taxYear: number;
  taxClass: TaxClass;
  grossIncome: number;
  totalDeductions: number;
  taxableIncome: number;
  baseTax: number;
  solidaritySurchargeRate: number;
  solidaritySurchargeAmount: number;
  totalTaxBeforeCredits: number;
  totalTaxCredits: number;
  finalTaxLiability: number;
  taxWithheldAtSource: number;
  balancePayableOrRefund: number; // Positive = Due, Negative = Refund
  provenance: CalculationLineItemProvenance[];
  warnings: string[];
  calculatedAt: string;
}
