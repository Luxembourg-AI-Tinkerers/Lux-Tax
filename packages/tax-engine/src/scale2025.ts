import { TaxClass } from '@luxtax/contracts';

export interface TaxBracket {
  readonly lower: number;
  readonly upper: number;
  readonly rate: number;
}

/**
 * Official Luxembourg 2025 Income Tax Brackets (Barème de l'impôt sur le revenu 2025)
 * Reference: Article 118 LIR adapted for 4 index brackets.
 */
export const TAX_BRACKETS_2025: readonly TaxBracket[] = [
  { lower: 0, upper: 13230, rate: 0.0 },
  { lower: 13230, upper: 15435, rate: 0.08 },
  { lower: 15435, upper: 17640, rate: 0.09 },
  { lower: 17640, upper: 19845, rate: 0.10 },
  { lower: 19845, upper: 22050, rate: 0.11 },
  { lower: 22050, upper: 24255, rate: 0.12 },
  { lower: 24255, upper: 26460, rate: 0.14 },
  { lower: 26460, upper: 28665, rate: 0.16 },
  { lower: 28665, upper: 30870, rate: 0.18 },
  { lower: 30870, upper: 33075, rate: 0.20 },
  { lower: 33075, upper: 35280, rate: 0.22 },
  { lower: 35280, upper: 37485, rate: 0.24 },
  { lower: 37485, upper: 39690, rate: 0.26 },
  { lower: 39690, upper: 41895, rate: 0.28 },
  { lower: 41895, upper: 44100, rate: 0.30 },
  { lower: 44100, upper: 46305, rate: 0.32 },
  { lower: 46305, upper: 48510, rate: 0.34 },
  { lower: 48510, upper: 50715, rate: 0.36 },
  { lower: 50715, upper: 52920, rate: 0.38 },
  { lower: 52920, upper: 110250, rate: 0.39 },
  { lower: 110250, upper: 165375, rate: 0.40 },
  { lower: 165375, upper: 234870, rate: 0.41 },
  { lower: 234870, upper: Infinity, rate: 0.42 },
];

/**
 * Calculates raw base tax using progressive scale for a given taxable income.
 */
export function calculateProgressiveScaleTax(taxableIncome: number): number {
  if (taxableIncome <= 13230) {
    return 0;
  }

  let totalTax = 0;
  for (const bracket of TAX_BRACKETS_2025) {
    if (taxableIncome > bracket.lower) {
      const taxableInBracket = Math.min(taxableIncome, bracket.upper) - bracket.lower;
      totalTax += taxableInBracket * bracket.rate;
    }
  }

  return Math.round(totalTax * 100) / 100;
}

/**
 * Calculates base tax according to Tax Class (1, 1a, 2).
 * - Class 1: Direct application of progressive scale.
 * - Class 2: Splitting method: Tax(R/2) * 2.
 * - Class 1a: Intermediate scale (single parents / age >= 65).
 */
export function calculateBaseTaxForClass(taxableIncome: number, taxClass: TaxClass): number {
  if (taxableIncome <= 0) {
    return 0;
  }

  // Article 119 LIR: Round down taxable income to nearest 50 EUR bracket
  const roundedTaxableIncome = Math.floor(taxableIncome / 50) * 50;

  if (taxClass === TaxClass.CLASS_2) {
    // Splitting method: Tax = 2 * Scale(R / 2)
    const halfIncome = Math.floor((roundedTaxableIncome / 2) / 50) * 50;
    const halfTax = calculateProgressiveScaleTax(halfIncome);
    return Math.round(halfTax * 2 * 100) / 100;
  }

  if (taxClass === TaxClass.CLASS_1A) {
    // Class 1a concession: Rate difference between Class 1 and Class 2
    const class1Tax = calculateProgressiveScaleTax(roundedTaxableIncome);
    const halfIncome = Math.floor((roundedTaxableIncome / 2) / 50) * 50;
    const class2Tax = Math.round(calculateProgressiveScaleTax(halfIncome) * 2 * 100) / 100;
    // Class 1a is half-way between Class 1 and Class 2, or Class 2 tax with cap
    const class1aTax = Math.round(((class1Tax + class2Tax) / 2) * 100) / 100;
    return Math.min(class1Tax, class1aTax);
  }

  // Class 1
  return calculateProgressiveScaleTax(roundedTaxableIncome);
}
