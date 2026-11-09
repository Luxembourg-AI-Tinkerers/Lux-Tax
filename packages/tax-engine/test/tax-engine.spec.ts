import { test, describe } from 'node:test';
import assert from 'node:assert';
import { TaxClass, TaxResidence } from '@luxtax/contracts';
import {
  LuxembourgTaxEngine,
  getRulePackage,
  SUPPORTED_TAX_YEARS,
  baseTax,
  floorEuroToCote,
  cisForSalary,
  ciCo2ForSalary,
  cimFor,
  cipForPension,
  cissmForSalary,
  cicForSalary,
  calculateDeductions,
  ciiForProfit,
  degrevementForChildren,
  bonificationForChildren,
} from '../src/index';

const pkg2025 = getRulePackage(2025);
const pkg2026 = getRulePackage(2026);

const close = (actual: number, expected: number, tolerance = 0.01): void => {
  assert.ok(
    Math.abs(actual - expected) <= tolerance,
    `expected ${expected} ± ${tolerance}, got ${actual}`,
  );
};

describe('Art. 118 tariff — official 2025/2026 brackets', () => {
  test('Class 1 golden values (ACD-checked)', () => {
    close(floorEuroToCote(baseTax(20_000, 'CLASS_1', pkg2025)), 612);
    close(floorEuroToCote(baseTax(30_000, 'CLASS_1', pkg2025)), 1_998);
    close(floorEuroToCote(baseTax(40_000, 'CLASS_1', pkg2025)), 4_232);
    close(floorEuroToCote(baseTax(50_000, 'CLASS_1', pkg2025)), 7_341);
  });

  test('Class 2 splitting — ACD official example €100,000 → €14,682', () => {
    close(floorEuroToCote(baseTax(100_000, 'CLASS_2', pkg2025)), 14_682);
  });

  test('Class 1a Art. 120bis — exempt at €26,460, capped at €150,000', () => {
    close(floorEuroToCote(baseTax(26_460, 'CLASS_1A', pkg2025)), 0);
    close(floorEuroToCote(baseTax(150_000, 'CLASS_1A', pkg2025)), 44_268);
  });

  test('2026 uses the same Art. 118 tariff', () => {
    close(floorEuroToCote(baseTax(50_000, 'CLASS_1', pkg2026)), 7_341);
    close(floorEuroToCote(baseTax(100_000, 'CLASS_2', pkg2026)), 14_682);
  });

  test('unknown tax year is refused, not silently mapped', () => {
    assert.throws(() => getRulePackage(2019), /No tax rule package/);
  });
});

describe('Tax year 2025 is fully supported (filing season open until 31 Dec 2026)', () => {
  const base = {
    taxClass: TaxClass.CLASS_1,
    residence: TaxResidence.RESIDENT,
    primaryUserId: 'u1',
  } as const;

  test('2025 package is present and selectable', () => {
    assert.ok(SUPPORTED_TAX_YEARS.includes(2025));
    assert.strictEqual(getRulePackage(2025).version, '2025.1.0');
  });

  test('2025 keeps the 3,200 EUR third-pillar cap (2026 gets 4,500)', () => {
    const facts = [
      { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 50_000 },
      { id: 'f2', category: 'PENSION_SAVINGS_111BIS', fieldKey: 'art111bis', amount: 4_500 },
    ];
    close(LuxembourgTaxEngine.calculate({ ...base, taxYear: 2025, facts }).deductions.art111bis, 3_200);
    close(LuxembourgTaxEngine.calculate({ ...base, taxYear: 2026, facts }).deductions.art111bis, 4_500);
  });

  test('2025 CI-CO2 is 192, 2026 is 216', () => {
    const facts = [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 30_000 }];
    close(LuxembourgTaxEngine.calculate({ ...base, taxYear: 2025, facts }).credits.ciCo2Salary, 192);
    close(LuxembourgTaxEngine.calculate({ ...base, taxYear: 2026, facts }).credits.ciCo2Salary, 216);
  });

  test('AMVP and the start-up credit do not exist in 2025', () => {
    const v2025 = LuxembourgTaxEngine.calculate({
      ...base,
      taxYear: 2025,
      amvpEligible: true,
      startupInvestment: 100_000,
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 }],
    });
    close(v2025.deductions.amvp, 0);
    close(v2025.credits.startup, 0);

    const v2026 = LuxembourgTaxEngine.calculate({
      ...base,
      taxYear: 2026,
      amvpEligible: true,
      startupInvestment: 100_000,
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 }],
    });
    close(v2026.deductions.amvp, 9_000);
    close(v2026.credits.startup, 20_000);
  });
});

describe('Credits', () => {
  test('CIS 2025 three-zone formula', () => {
    close(cisForSalary(500, pkg2025.cis), 0);
    close(cisForSalary(5_000, pkg2025.cis), 417.86);
    close(cisForSalary(11_265, pkg2025.cis), 599.55);
    close(cisForSalary(20_000, pkg2025.cis), 600);
    close(cisForSalary(60_000, pkg2025.cis), 300);
    close(cisForSalary(80_000, pkg2025.cis), 0);
  });

  test('CI-CO2 192 in 2025, 216 in 2026', () => {
    close(ciCo2ForSalary(20_000, pkg2025), 192);
    close(ciCo2ForSalary(20_000, pkg2026), 216);
    close(ciCo2ForSalary(60_000, pkg2025), 96);
    close(ciCo2ForSalary(60_000, pkg2026), 108);
  });

  test('CIM 2025: €3,504 → €750, reduced by allocations above €2,712', () => {
    close(cimFor(50_000, 0, pkg2025), 3_504);
    close(cimFor(80_000, 0, pkg2025), 2_280);
    close(cimFor(105_000, 0, pkg2025), 750);
    close(cimFor(50_000, 3_712, pkg2025), 3_004);
  });

  test('CISSM: EUR 70/month on 1 800–3 000, phased out by 3 600', () => {
    close(cissmForSalary(12 * 2_000, pkg2025), 840);
    close(cissmForSalary(12 * 3_300, pkg2025), 70 * 12 * (300 / 600));
    close(cissmForSalary(12 * 1_500, pkg2025), 0);
    close(cissmForSalary(12 * 4_000, pkg2025), 0);
  });

  test('prime jeune salarié: 75 % exempt, capped by the gross-salary band', () => {
    const base = {
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      youngEmployeePrimeEligible: true,
    } as const;

    // 12 000 prime on 40 000 gross -> 75 % = 9 000, capped at 5 000
    const low = LuxembourgTaxEngine.calculate({
      ...base,
      youngEmployeePrime: 12_000,
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 40_000 }],
    });
    close(low.youngEmployeePrimeExemption, 5_000);
    close(low.netIncome, 35_000);

    // 60 000 gross -> band cap 3 750
    const mid = LuxembourgTaxEngine.calculate({
      ...base,
      youngEmployeePrime: 12_000,
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 }],
    });
    close(mid.youngEmployeePrimeExemption, 3_750);

    // 90 000 gross -> band cap 2 500
    const high = LuxembourgTaxEngine.calculate({
      ...base,
      youngEmployeePrime: 12_000,
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 90_000 }],
    });
    close(high.youngEmployeePrimeExemption, 2_500);

    // ineligible -> no exemption, even with a prime
    const notEligible = LuxembourgTaxEngine.calculate({
      ...base,
      youngEmployeePrimeEligible: false,
      youngEmployeePrime: 12_000,
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 40_000 }],
    });
    close(notEligible.youngEmployeePrimeExemption, 0);
    close(notEligible.netIncome, 40_000);

    // above 100 000 -> zero, with a warning
    const tooHigh = LuxembourgTaxEngine.calculate({
      ...base,
      youngEmployeePrime: 12_000,
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 120_000 }],
    });
    close(tooHigh.youngEmployeePrimeExemption, 0);
    assert.ok(tooHigh.warnings.some((w) => w.includes('Prime jeune salarié')));
  });

  test('pending measures are recorded with their activation path', () => {
    const pending = pkg2026.pendingMeasures ?? [];
    const ids = pending.map((m) => m.id);
    assert.deepStrictEqual(ids.sort(), ['CIC_2026', 'EPARGNE_LOGEMENT_8775']);
    for (const measure of pending) {
      assert.strictEqual(measure.status, 'NOT_IN_FORCE');
      assert.ok(measure.source.length > 20);
      assert.ok(measure.activation.length > 20);
    }
    assert.strictEqual((pkg2025.pendingMeasures ?? []).length, 0);
  });

  test('épargne-logement above 40: capped at 672 and warns about 8775', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2026,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      savingsHousingSubscriberAge: 45,
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 },
        { id: 'f2', category: 'SAVINGS_HOUSING', fieldKey: 'savingsHousing', amount: 1_344 },
      ],
    });
    close(result.deductions.savingsHousing, 672);
    assert.ok(result.warnings.some((w) => w.includes('8775')));
  });

  test('activation is a data change: no age limit and a CIC table both apply', () => {
    const activated = {
      ...pkg2026,
      specialExpenses: { ...pkg2026.specialExpenses, savingsHousingYoungMaxAge: 200 },
      cic: {
        bands: [{ from: 1_000, to: 20_000, slope: 0, offset: 10 }],
        topAmount: 10,
      },
      pendingMeasures: (pkg2026.pendingMeasures ?? []).map((m) => ({ ...m, status: 'IN_FORCE' as const })),
    };

    const base = {
      grossSalary: 60_000,
      socialContributions: 0,
      grossPension: 0,
      capitalIncome: 0,
      rentalIncome: 0,
      foreignIncome: 0,
      independentProfit: 0,
      actualFraisObtention: 0,
      travelUnits: 0,
    };

    const deductions = calculateDeductions({
      pkg: activated,
      taxClass: 'CLASS_1',
      assessmentMode: 'COLLECTIVE',
      primary: base,
      childrenWithModeration: 0,
      art111Declared: 0,
      art111bisDeclared: 0,
      art111bisContributors: 1,
      savingsHousingDeclared: 1_344,
      savingsHousingSubscriberAge: 45,
      lrcpDeclared: 0,
      mortgageInterest: 0,
      donationsDeclared: 0,
      extraordinaryChargesDeclared: 0,
      bothSpousesProfessional: false,
      conjointAidant: false,
      spouseRetiredUnder3Years: false,
      priorYearLosses: 0,
      amvpEligible: false,
      asrdPrimeUnique: 0,
      asrdChildren: 0,
      netIncomeForDonationCap: 60_000,
    });

    close(deductions.savingsHousingDeduction, 1_344);
    close(cicForSalary(60_000, activated), 120);
  });

  test('CIC safety gate: a bill table is not paid while the measure is not in force', () => {
    const table = { bands: [{ from: 1_000, to: 20_000, slope: 0, offset: 10 }], topAmount: 10 };

    const billOnly = {
      ...pkg2026,
      cic: table,
      pendingMeasures: (pkg2026.pendingMeasures ?? []).map((m) => ({
        ...m,
        status: m.id === 'CIC_2026' ? ('NOT_IN_FORCE' as const) : m.status,
      })),
    };
    close(cicForSalary(60_000, billOnly), 0);

    const inForce = {
      ...billOnly,
      pendingMeasures: (pkg2026.pendingMeasures ?? []).map((m) => ({
        ...m,
        status: m.id === 'CIC_2026' ? ('IN_FORCE' as const) : m.status,
      })),
    };
    close(cicForSalary(60_000, inForce), 120);
  });

  test('CIC: no table published -> no credit, mechanism ready', () => {
    // Both packages deliberately carry no CIC table: the 2026 table is not published.
    close(cicForSalary(60_000, pkg2025), 0);
    close(cicForSalary(60_000, pkg2026), 0);

    // Mechanism check with a synthetic table (NOT a legal table): flat 10/month
    // from 1 000 to 2 000, 20/month above.
    const synthetic = {
      ...pkg2026,
      cic: {
        bands: [{ from: 1_000, to: 2_000, slope: 0, offset: 10 }],
        topAmount: 20,
      },
      // Activate the measure, otherwise the safety gate correctly returns 0.
      pendingMeasures: (pkg2026.pendingMeasures ?? []).map((m) => ({
        ...m,
        status: m.id === 'CIC_2026' ? ('IN_FORCE' as const) : m.status,
      })),
    };
    close(cicForSalary(12 * 1_500, synthetic), 120);
    close(cicForSalary(12 * 3_000, synthetic), 240);
    close(cicForSalary(12 * 500, synthetic), 0);
  });

  test('CIP and CII floors', () => {
    close(cipForPension(200, pkg2025.cip), 0);
    close(cipForPension(500, pkg2025.cip), 300);
    close(cipForPension(20_000, pkg2025.cip), 600);
    close(ciiForProfit(500, pkg2025.cii), 300);
    close(ciiForProfit(20_000, pkg2025.cii), 600);
  });
});

describe('Tax engine — household scenarios', () => {
  test('single employee: 111bis is not swallowed by the €672 insurance cap', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 50_000 },
        { id: 'f2', category: 'EMPLOYMENT_INCOME', fieldKey: 'socialSecurity', amount: 6_000 },
        { id: 'f3', category: 'EMPLOYMENT_INCOME', fieldKey: 'withholdingTax', amount: 7_000 },
        { id: 'f4', category: 'PENSION_SAVINGS_111BIS', fieldKey: 'art111bis', amount: 3_000 },
      ],
    });

    close(result.deductions.art111bis, 3_000);
    close(result.deductions.art111, 0);
    // net 44 000 − FFO 540 − DS max(480, 3000) = 40 460
    close(result.taxableIncome, 40_460);
    assert.strictEqual(result.rulePackageVersion, '2025.1.0');
  });

  test('two payslips for one person still earn one FFO', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      facts: [
        { id: 'a', ownerId: 'u1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 30_000 },
        { id: 'b', ownerId: 'u1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 20_000 },
      ],
    });
    close(result.deductions.fraisObtention, 540);
  });

  test('donations are additive to the special-expenses forfait', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 40_000 },
        { id: 'f2', category: 'DONATION_DEDUCTION', fieldKey: 'donation', amount: 200 },
      ],
    });
    // FDS 480 + donation 200
    close(result.deductions.specialExpensesTotal, 680);
    close(result.deductions.donations, 200);
  });

  test('Art. 129b AEP for dual professional income, capped by the lower net', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_2,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'a',
      spouseUserId: 'b',
      bothSpousesProfessional: true,
      facts: [
        { id: 'f1', ownerId: 'a', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 70_000 },
        { id: 'f2', ownerId: 'b', category: 'FREELANCE_INCOME', fieldKey: 'freelanceRevenue', amount: 6_000 },
      ],
    });
    // lower net = 6 000 → AEP capped at 4 500
    close(result.deductions.aep, 4_500);
  });

  test('a professional loss caps the AEP at zero (Art. 129b al. 3)', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_2,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'a',
      spouseUserId: 'b',
      bothSpousesProfessional: true,
      facts: [
        { id: 'f1', ownerId: 'a', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 70_000 },
        { id: 'f2', ownerId: 'b', category: 'FREELANCE_INCOME', fieldKey: 'freelanceRevenue', amount: 2_000 },
        { id: 'f3', ownerId: 'b', category: 'BUSINESS_EXPENSE', fieldKey: 'expense', amount: 9_000 },
      ],
    });
    close(result.deductions.aep, 0);
  });

  test('FDS is doubled for a dual-earner couple', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_2,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'a',
      spouseUserId: 'b',
      facts: [
        { id: 'f1', ownerId: 'a', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 40_000 },
        { id: 'f2', ownerId: 'b', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 30_000 },
      ],
    });
    assert.strictEqual(result.deductions.specialExpensesForfait, 960);
  });

  test('a loss-making side-business reduces the salary (Art. 7 al. 2)', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 },
        { id: 'f2', category: 'FREELANCE_INCOME', fieldKey: 'freelanceRevenue', amount: 5_000 },
        { id: 'f3', category: 'BUSINESS_EXPENSE', fieldKey: 'expense', amount: 25_000 },
      ],
    });
    // net = 60 000 − 20 000 = 40 000
    close(result.netIncome, 40_000);
    close(result.freelanceIncomeBreakdown!.primaryNetProfit, -20_000);
  });

  test('employee + freelance household: CIS and CII coexist', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_2,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'a',
      spouseUserId: 'b',
      bothSpousesProfessional: true,
      facts: [
        { id: 'f1', ownerId: 'a', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 },
        { id: 'f2', ownerId: 'b', category: 'FREELANCE_INCOME', fieldKey: 'freelanceRevenue', amount: 20_000 },
      ],
    });
    close(result.credits.cis, 300);
    close(result.credits.cii, 600);
  });

  test('Art. 3ter pure: two Class 1 computations', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_2,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'a',
      spouseUserId: 'b',
      assessmentMode: 'INDIVIDUAL_PURE',
      facts: [
        { id: 'f1', ownerId: 'a', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 40_000 },
        { id: 'f2', ownerId: 'b', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 40_000 },
      ],
    });
    assert.strictEqual(result.assessmentMode, 'INDIVIDUAL_PURE');
    assert.ok(result.baseTax > 0);
  });

  test('plus-values: short holding is speculation, long non-substantial is exempt', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 40_000 }],
      movableGains: [
        { proceeds: 15_000, cost: 5_000, holdingMonths: 3, participationPercent: 1 },
        { proceeds: 40_000, cost: 10_000, holdingMonths: 18, participationPercent: 5 },
      ],
    });
    close(result.plusValues!.speculation, 10_000);
    close(result.plusValues!.article100, 0);
  });

  test('Art. 100 gain: 50 000 abattement then demi-taux', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 40_000 }],
      movableGains: [{ proceeds: 120_000, cost: 60_000, holdingMonths: 24, participationPercent: 25 }],
    });
    close(result.plusValues!.article100, 60_000);
    close(result.plusValues!.abattement, 50_000);
    close(result.plusValues!.taxableExtraordinary, 10_000);
    assert.ok(result.plusValues!.tax > 0);
    assert.ok(result.plusValues!.tax < 10_000 * 0.4);
  });

  test('rental asset register: amortisation by age and energy rate', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      rentalProperties: [
        {
          grossRent: 18_000,
          charges: 2_000,
          purchasePrice: 400_000,
          completionYear: 1990, // 35 years -> 2 %
          landSharePercent: 20,
          energyRenovationAmount: 20_000, // 6 % in 2025
          interest: 1_000,
        },
      ],
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 50_000 }],
    });
    // amortisation = 400 000 × 80 % × 2 % = 6 400 ; energy = 20 000 × 6 % = 1 200
    // net = 18 000 − 2 000 − 7 600 − 1 000 = 7 400
    close(result.rental!.net, 7_400);
    assert.ok(result.provenance.some((p) => p.ruleCode === 'LIR-ART-98-AMORT'));
  });

  test('securities ledger: 50 % qualifying, RELIBI final, foreign credit', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      relibiFinalElective: true,
      securities: [
        { grossIncome: 10_000, qualifyingDividend: true },
        { grossIncome: 4_000, relibiWithheld: 800 },
        { grossIncome: 2_000, foreignTax: 300 },
      ],
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 40_000 }],
    });
    // 5 000 (half of the qualifying dividend) + 2 000 (foreign, relibi-final interest excluded)
    assert.ok(result.provenance.some((p) => p.ruleCode === 'LIR-ART-97-115-15a-RELIBI'));
    assert.ok(result.credits.foreignTaxCredit > 0);
  });

  test('rental: 35 % forfait capped at EUR 2 700', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      rentalForfaitEligible: true,
      facts: [
        { id: 'f1', category: 'RENTAL_INCOME', fieldKey: 'grossRent', amount: 20_000 },
        { id: 'f2', category: 'RENTAL_INCOME', fieldKey: 'rentalCharges', amount: 1_000 },
      ],
    });
    assert.strictEqual(result.rental!.forfaitApplied, true);
    close(result.rental!.net, 17_300);
  });

  test('ASRD single premium uses the age/children majoration', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      asrdPrimeUnique: 10_000,
      asrdSubscriberAge: 40,
      asrdChildren: 0,
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 40_000 }],
    });
    // 6 000 × (1 + 8 % × 10) = 10 800 → the whole 10 000 is deductible
    close(result.deductions.asrd, 10_000);
    assert.ok(result.deductions.specialExpensesTotal >= 10_000);
  });

  test('non-resident without assimilation is flagged and excludes foreign income', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.NON_RESIDENT,
      primaryUserId: 'u1',
      nonResidentAssimilation: false,
      worldwideIncome: 100_000,
      luxembourgProfessionalIncome: 40_000,
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 40_000 },
        { id: 'f2', category: 'FOREIGN_INCOME', fieldKey: 'foreign', amount: 30_000 },
      ],
    });
    assert.strictEqual(result.nonResident!.assimilationGranted, false);
    assert.strictEqual(result.nonResident!.method, 'EXEMPTION_WITH_PROGRESSION');
    close(result.netIncome, 40_000);
    assert.ok(result.unsupported.length > 0);
  });

  test('treaty relief: FR exempts with progression, DE grants a credit', () => {
    const facts = [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 }];

    const fr = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      facts,
      foreignIncomeItems: [{ country: 'FR', amount: 20_000, foreignTax: 2_000 }],
    });
    close(fr.credits.foreignTaxCredit, 0);
    close(fr.netIncome, 60_000);

    const noForeign = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      facts,
    });
    assert.ok(fr.baseTax > noForeign.baseTax, 'progression should raise the Luxembourg cote');

    const de = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      facts,
      foreignIncomeItems: [{ country: 'DE', amount: 20_000, foreignTax: 4_000 }],
    });
    close(de.netIncome, 80_000);
    assert.ok(de.credits.foreignTaxCredit > 0);
    assert.ok(de.credits.foreignTaxCredit <= 4_000);
  });

  test('Art. 3 d): mixed couple gets Class 2 only at >= 90 % LU professional income', () => {
    const facts = [
      { id: 'f1', ownerId: 'a', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 90_000 },
      { id: 'f2', ownerId: 'b', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 10_000 },
    ];
    const base = {
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.NON_RESIDENT,
      primaryUserId: 'a',
      spouseUserId: 'b',
      spouseResidence: 'RESIDENT' as const,
      mixedCoupleCollectiveRequested: true,
      facts,
    };

    const granted = LuxembourgTaxEngine.calculate({
      ...base,
      luxembourgProfessionalIncome: 95_000,
      householdProfessionalIncome: 100_000,
    });
    assert.ok(granted.provenance.some((p) => p.ruleCode === 'LIR-ART-3-d'));
    assert.ok(Math.abs(granted.baseTax - 2 * 0) >= 0);

    const refused = LuxembourgTaxEngine.calculate({
      ...base,
      luxembourgProfessionalIncome: 50_000,
      householdProfessionalIncome: 100_000,
    });
    assert.ok(!refused.provenance.some((p) => p.ruleCode === 'LIR-ART-3-d'));
    assert.ok(refused.warnings.some((w) => w.includes('Mixed resident/non-resident')));
  });

  test('2028 single-class package is a preview and warns', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2028,
      taxClass: TaxClass.CLASS_2,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'a',
      spouseUserId: 'b',
      facts: [{ id: 'f1', ownerId: 'a', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 }],
    });
    assert.strictEqual(result.rulePackageVersion, '2028.0.0-preview');
    assert.ok(result.warnings.some((w) => w.includes('single-class')));
  });

  test('start-up credit 2026: 20 % capped at EUR 100 000 invested', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2026,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      startupInvestment: 150_000,
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 80_000 }],
    });
    close(result.credits.startup, 20_000);
  });

  test('unsupported scenarios are reported, not silently zeroed', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.NON_RESIDENT,
      primaryUserId: 'u1',
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 40_000 }],
    });
    assert.strictEqual(result.unsupported.length, 1);
    assert.match(result.unsupported[0], /NON_RESIDENT/);
  });

  test('2026 package raises the 111bis cap to €4,500', () => {
    const result = LuxembourgTaxEngine.calculate({
      taxYear: 2026,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 50_000 },
        { id: 'f2', category: 'PENSION_SAVINGS_111BIS', fieldKey: 'art111bis', amount: 4_200 },
      ],
    });
    close(result.deductions.art111bis, 4_200);
    assert.strictEqual(result.rulePackageVersion, '2026.1.0');
  });
});

describe('Fonds pour l’emploi surcharge — the return, not only the cote (LEG-1)', () => {
  const params = (
    overrides: Omit<
      Parameters<typeof LuxembourgTaxEngine.calculate>[0],
      'taxYear' | 'residence' | 'primaryUserId'
    >,
  ) =>
    LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      ...overrides,
    });

  const salary = (amount: number) => [
    { id: 'f1', ownerId: 'u1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount },
  ];

  test('Class 1, gross €60,000: 7 % of the €10,755 cote is €752.85, not €75,285', () => {
    const r = params({ taxClass: TaxClass.CLASS_1, facts: salary(60_000) });
    close(r.baseTax, 10_755);
    close(r.solidaritySurchargeAmount, 752.85);
    close(r.totalTaxBeforeCredits, 11_507.85);
    close(r.finalTaxLiability, 11_111.85);
    close(r.balancePayableOrRefund, 11_111.85);
  });

  test('Class 2, gross €100,000: 2 × Tarif(49,490) = €14,305 cote + €1,001.35 → €15,306.35', () => {
    const r = params({ taxClass: TaxClass.CLASS_2, spouseUserId: 'u2', facts: salary(100_000) });
    assert.strictEqual(r.taxClass, TaxClass.CLASS_2);
    close(r.taxableIncome, 98_980);
    close(r.baseTax, 14_305);
    close(r.solidaritySurchargeAmount, 1_001.35);
    close(r.finalTaxLiability, 15_306.35);
  });

  test('Class 1a, taxable €26,460: cote and surcharge are both zero', () => {
    // Gross €27,480 less the €1,020 default forfaits = €26,460 taxable (Art. 120bis exemption).
    const r = params({
      taxClass: TaxClass.CLASS_1A,
      facts: salary(27_480),
      isSingleParent: true,
      childAllocations: 0,
    });
    close(r.taxableIncome, 26_460);
    close(r.baseTax, 0);
    close(r.solidaritySurchargeAmount, 0);
    close(r.totalTaxBeforeCredits, 0);
    close(r.finalTaxLiability, 0);
  });

  test('Class 1 threshold: 7 % up to €150,000 taxable, 9 % above it', () => {
    // The wall is on the taxable base, and the default forfaits are €1,020,
    // so €151,020 gross is exactly €150,000 taxable and €151,070 is €150,050.
    const atWall = params({ taxClass: TaxClass.CLASS_1, facts: salary(151_020) });
    close(atWall.taxableIncome, 150_000);
    assert.strictEqual(atWall.solidaritySurchargeRate, 0.07);
    close(atWall.baseTax, 46_590);
    close(atWall.solidaritySurchargeAmount, 3_261.3);
    close(atWall.solidaritySurchargeAmount, atWall.baseTax * 0.07, 0.005);

    const above = params({ taxClass: TaxClass.CLASS_1, facts: salary(151_070) });
    close(above.taxableIncome, 150_050);
    assert.strictEqual(above.solidaritySurchargeRate, 0.09);
    close(above.baseTax, 46_610);
    close(above.solidaritySurchargeAmount, 4_194.9);
    close(above.solidaritySurchargeAmount, above.baseTax * 0.09, 0.005);
  });

  test('Class 2 threshold: 7 % up to €300,000 taxable, 9 % above it', () => {
    const atWall = params({ taxClass: TaxClass.CLASS_2, spouseUserId: 'u2', facts: salary(301_020) });
    close(atWall.taxableIncome, 300_000);
    assert.strictEqual(atWall.solidaritySurchargeRate, 0.07);
    close(atWall.baseTax, 93_180);
    close(atWall.solidaritySurchargeAmount, 6_522.6);
    close(atWall.solidaritySurchargeAmount, atWall.baseTax * 0.07, 0.005);

    const above = params({ taxClass: TaxClass.CLASS_2, spouseUserId: 'u2', facts: salary(301_070) });
    close(above.taxableIncome, 300_050);
    assert.strictEqual(above.solidaritySurchargeRate, 0.09);
    close(above.baseTax, 93_200);
    close(above.solidaritySurchargeAmount, 8_388);
    close(above.solidaritySurchargeAmount, above.baseTax * 0.09, 0.005);
  });
});

describe('Art. 122 dégrèvement and Art. 123bis bonification (LEG-2)', () => {
  const reliefRules = pkg2025.childRelief;
  const salary = (amount: number) => [
    { id: 'f1', ownerId: 'u1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount },
  ];
  const params = (
    overrides: Omit<
      Parameters<typeof LuxembourgTaxEngine.calculate>[0],
      'taxYear' | 'residence' | 'primaryUserId'
    >,
  ) =>
    LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      ...overrides,
    });

  test('dégrèvement: 922.50 per child, capped at the tax still due', () => {
    close(degrevementForChildren(1, 5_000, reliefRules), 922.5);
    close(degrevementForChildren(2, 1_000, reliefRules), 1_000);
    close(degrevementForChildren(0, 5_000, reliefRules), 0);
    close(degrevementForChildren(3, 5_000, reliefRules), 2_767.5);
    // 2026 inherits the same parameters through the package spread.
    close(degrevementForChildren(1, 5_000, pkg2026.childRelief), 922.5);
  });

  test('bonification: 560 at RIA 71,000, zero at 76,600, cap lifted from six children', () => {
    close(bonificationForChildren(1, 71_000, 1, reliefRules), 560);
    close(bonificationForChildren(2, 71_000, 2, reliefRules), 1_120);
    close(bonificationForChildren(1, 76_600, 1, reliefRules), 0);
    close(bonificationForChildren(1, 60_000, 1, reliefRules), 922.5);
    close(bonificationForChildren(1, 80_000, 6, reliefRules), 922.5);
    close(bonificationForChildren(1, 80_000, 5, reliefRules), 0);
    close(bonificationForChildren(2, 65_000, 2, reliefRules), 1_845);
    close(bonificationForChildren(0, 60_000, 0, reliefRules), 0);
  });

  test('engine: two moderated children without any benefit are worth 1,845', () => {
    const withBenefit = params({
      taxClass: TaxClass.CLASS_1A,
      facts: salary(60_000),
      childrenWithModeration: 2,
    });
    const withoutBenefit = params({
      taxClass: TaxClass.CLASS_1A,
      facts: salary(60_000),
      childrenWithModeration: 2,
      childBenefitReceived: false,
    });

    // Default is "benefit received": no dégrèvement and no provenance entry.
    close(withBenefit.childRelief.total, 0);
    close(withBenefit.childRelief.eligibleChildren, 0);
    assert.ok(withBenefit.provenance.every((p) => p.ruleCode !== 'LIR-ART-122'));

    close(withoutBenefit.childRelief.degrevement, 1_845);
    close(withoutBenefit.childRelief.total, 1_845);
    close(withoutBenefit.childRelief.eligibleChildren, 2);
    close(withoutBenefit.finalTaxLiability, withBenefit.finalTaxLiability - 1_845);
    close(
      withoutBenefit.finalTaxLiability,
      withoutBenefit.totalTaxBeforeCredits - withoutBenefit.credits.total - 1_845,
    );
    assert.ok(withoutBenefit.provenance.some((p) => p.ruleCode === 'LIR-ART-122'));
    // The child relief is not a credit: the credit total is unchanged.
    close(withoutBenefit.totalTaxCredits, withBenefit.totalTaxCredits);
  });

  test('engine: the Art. 122 gate applies per child, not to the whole household', () => {
    // Two moderated children, only one of whom received no family allowance /
    // CEDIES / SNJ: one 922.50 dégrèvement, not two.
    const mixed = params({
      taxClass: TaxClass.CLASS_1A,
      facts: salary(60_000),
      childrenWithModeration: 2,
      moderatedChildrenWithoutBenefit: 1,
    });
    close(mixed.childRelief.degrevement, 922.5);
    close(mixed.childRelief.eligibleChildren, 1);
    close(mixed.childRelief.total, 922.5);

    // A count larger than the moderated children is clamped: no over-relief.
    const clamped = params({
      taxClass: TaxClass.CLASS_1A,
      facts: salary(60_000),
      childrenWithModeration: 1,
      moderatedChildrenWithoutBenefit: 3,
    });
    close(clamped.childRelief.degrevement, 922.5);
    close(clamped.childRelief.eligibleChildren, 1);
  });

  test('engine: one moderated child at RIA 40,000 receives the full 922.50', () => {
    const baseline = params({ taxClass: TaxClass.CLASS_1A, facts: salary(41_020) });
    const withChild = params({
      taxClass: TaxClass.CLASS_1A,
      facts: salary(41_020),
      childrenWithModeration: 1,
      childBenefitReceived: false,
    });
    close(withChild.taxableIncome, 40_000);
    close(withChild.childRelief.degrevement, 922.5);
    close(withChild.childRelief.eligibleChildren, 1);
    close(withChild.finalTaxLiability, baseline.finalTaxLiability - 922.5);
  });

  test('engine: bonification at RIA 71,000 is 560; at RIA 76,600 it is 0', () => {
    const baseline = params({ taxClass: TaxClass.CLASS_1, facts: salary(72_020) });
    const at71k = params({
      taxClass: TaxClass.CLASS_1,
      facts: salary(72_020),
      childrenWithBonification: 1,
    });
    close(at71k.taxableIncome, 71_000);
    close(at71k.childRelief.bonification, 560);
    close(at71k.childRelief.bonificationChildren, 1);
    assert.strictEqual(at71k.childRelief.bonificationPhaseOut, true);
    close(at71k.finalTaxLiability, baseline.finalTaxLiability - 560);

    const at76600 = params({
      taxClass: TaxClass.CLASS_1,
      facts: salary(77_620),
      childrenWithBonification: 1,
    });
    close(at76600.taxableIncome, 76_600);
    close(at76600.childRelief.bonification, 0);
    close(at76600.childRelief.total, 0);
  });

  test('engine: bonificationPhaseOut follows the 67,400-76,600 RIA band, not the tax cap', () => {
    // Below the band the full 922.50 is granted, so the flag stays false.
    const at60k = params({
      taxClass: TaxClass.CLASS_1,
      facts: salary(61_020),
      childrenWithBonification: 1,
    });
    close(at60k.taxableIncome, 60_000);
    close(at60k.childRelief.bonification, 922.5);
    assert.strictEqual(at60k.childRelief.bonificationPhaseOut, false);

    // Six relief children (5 moderated + 1 bonification) lift the income cap:
    // full 922.50 above 76,600, still no phase-out.
    const at80k = params({
      taxClass: TaxClass.CLASS_1,
      facts: salary(81_020),
      childrenWithModeration: 5,
      childrenWithBonification: 1,
      dependantsCount: 6,
    });
    close(at80k.taxableIncome, 80_000);
    close(at80k.childRelief.degrevement, 0);
    close(at80k.childRelief.bonification, 922.5);
    close(at80k.childRelief.total, 922.5);
    assert.strictEqual(at80k.childRelief.bonificationPhaseOut, false);

    // Household dependants are not relief children: 1 moderated + 1 bonification
    // stays in the up-to-five-children branch and is zeroed above 76,600.
    const manyDependants = params({
      taxClass: TaxClass.CLASS_1,
      facts: salary(81_020),
      childrenWithModeration: 1,
      childrenWithBonification: 1,
      dependantsCount: 6,
    });
    close(manyDependants.taxableIncome, 80_000);
    close(manyDependants.childRelief.bonification, 0);
    close(manyDependants.childRelief.total, 0);
    assert.ok(manyDependants.warnings.every((w) => !w.includes('cannot generate both')));
  });

  test('engine: warns when the moderation and bonification counts exceed the declared children', () => {
    const both = params({
      taxClass: TaxClass.CLASS_1A,
      facts: salary(60_000),
      childrenWithModeration: 1,
      childrenWithBonification: 1,
      childBenefitReceived: false,
    });
    assert.ok(both.warnings.some((w) => w.includes('cannot generate both')));
    // Bare counts: the warning is the only guard, the reliefs are still paid.
    close(both.childRelief.degrevement, 922.5);
    close(both.childRelief.bonification, 922.5);
    close(both.childRelief.total, 1_845);

    // Two children declared in the household: counts add up, no warning.
    const consistent = params({
      taxClass: TaxClass.CLASS_1,
      facts: salary(60_000),
      childrenWithModeration: 1,
      childrenWithBonification: 1,
      dependantsCount: 2,
      childBenefitReceived: false,
    });
    assert.ok(consistent.warnings.every((w) => !w.includes('cannot generate both')));
  });

  test('engine: child relief never pushes the liability below zero', () => {
    const r = params({
      taxClass: TaxClass.CLASS_1A,
      facts: salary(27_480),
      childrenWithModeration: 2,
      childBenefitReceived: false,
    });
    close(r.taxableIncome, 26_460);
    close(r.totalTaxBeforeCredits, 0);
    close(r.childRelief.total, 0);
    close(r.finalTaxLiability, 0);
    close(r.balancePayableOrRefund, 0);
  });
});

describe('CIM reachability and refundability — Art. 154ter al. 2 (LEG-3)', () => {
  const salary = (amount: number) => [
    { id: 'f1', ownerId: 'u1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount },
  ];
  const params = (
    overrides: Omit<
      Parameters<typeof LuxembourgTaxEngine.calculate>[0],
      'taxYear' | 'residence' | 'primaryUserId'
    >,
  ) =>
    LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      ...overrides,
    });

  test('engine: the CIM excess over the tax due is refunded, not clipped to zero', () => {
    const r = params({
      taxClass: TaxClass.CLASS_1A,
      facts: salary(20_000),
      childrenWithModeration: 1,
      isSingleParent: true,
      bothParentsSameHome: false,
    });

    // RIA 18,980 is below the 60,000 threshold: the full 3,504 is due and the
    // Class 1a cote is zero, so nothing can be imputed and all of it is paid out.
    close(r.taxableIncome, 18_980);
    close(r.totalTaxBeforeCredits, 0);
    close(r.credits.cim, 3_504);
    assert.ok(r.credits.cimApplied >= 0);
    close(r.credits.cimApplied, 0);
    close(r.credits.cimRefund, 3_504);
    close(r.finalTaxLiability, 0);
    assert.ok(r.balancePayableOrRefund < 0);
    close(r.balancePayableOrRefund, -3_504);
    // The credit total keeps the statutory CIM amount.
    close(r.totalTaxCredits, r.credits.total);
    assert.ok(r.provenance.some((p) => p.ruleCode === 'LIR-ART-154ter-refund'));
  });

  test('engine: a CIM fully covered by the tax is applied in full, with nothing refunded', () => {
    const r = params({
      taxClass: TaxClass.CLASS_1A,
      facts: salary(100_000),
      childrenWithModeration: 1,
      isSingleParent: true,
    });

    close(r.taxableIncome, 98_980);
    // 3,504 - (98,950 - 60,000) x 0.0612 on the RIA rounded down to 50.
    close(r.credits.cim, 1_120.26);
    close(r.credits.cimApplied, 1_120.26);
    close(r.credits.cimRefund, 0);
    assert.ok(!r.provenance.some((p) => p.ruleCode === 'LIR-ART-154ter-refund'));
    close(r.finalTaxLiability, r.totalTaxBeforeCredits - r.credits.cim);
  });

  test('engine: a partly applicable CIM is imputed up to the cote and the rest is refunded', () => {
    const r = params({
      taxClass: TaxClass.CLASS_1A,
      facts: salary(40_000),
      childrenWithModeration: 1,
      isSingleParent: true,
    });

    // 1,165.34 of non-refundable credits are absorbed by the 1,915.30 cote first,
    // then 749.96 of the 3,504 CIM, and the rest is paid back.
    close(r.taxableIncome, 38_980);
    close(r.totalTaxBeforeCredits, 1_915.3);
    close(r.credits.cim, 3_504);
    close(r.credits.cimApplied, 749.96);
    close(r.credits.cimRefund, 2_754.04);
    close(r.finalTaxLiability, 0);
    close(r.balancePayableOrRefund, -2_754.04);

    // The imputation chain adds up while the tax still due is positive.
    const nonRefundable = r.credits.total - r.credits.cim;
    close(r.totalTaxBeforeCredits - nonRefundable, 749.96);
    close(
      r.totalTaxBeforeCredits - nonRefundable - r.credits.cimApplied - r.childRelief.total,
      r.finalTaxLiability,
    );
    // Equivalent arithmetic at RIA 18,980, where the non-refundable credits are
    // larger than the cote and are floored at zero.
    const zeroCote = params({
      taxClass: TaxClass.CLASS_1A,
      facts: salary(20_000),
      childrenWithModeration: 1,
      isSingleParent: true,
    });
    const zeroCoteNonRefundable = zeroCote.credits.total - zeroCote.credits.cim;
    close(
      Math.max(
        0,
        Math.max(0, zeroCote.totalTaxBeforeCredits - zeroCoteNonRefundable) -
          zeroCote.credits.cimApplied -
          zeroCote.childRelief.total,
      ),
      zeroCote.finalTaxLiability,
    );
  });

  test('engine: the CIM gate needs the flag and the parents not sharing the home', () => {
    const notSingle = params({
      taxClass: TaxClass.CLASS_1A,
      facts: salary(40_000),
      childrenWithModeration: 1,
      isSingleParent: false,
    });
    close(notSingle.credits.cim, 0);
    close(notSingle.credits.cimApplied, 0);
    close(notSingle.credits.cimRefund, 0);

    const sharedHome = params({
      taxClass: TaxClass.CLASS_1A,
      facts: salary(40_000),
      childrenWithModeration: 1,
      isSingleParent: true,
      bothParentsSameHome: true,
    });
    close(sharedHome.credits.cim, 0);
    close(sharedHome.credits.cimRefund, 0);
    assert.ok(sharedHome.warnings.some((w) => w.includes('both parents share the same home')));
  });

  test('engine: the refundable CIM adds to the refund instead of cancelling the withholding', () => {
    const r = params({
      taxClass: TaxClass.CLASS_1A,
      facts: [
        ...salary(20_000),
        { id: 'f2', ownerId: 'u1', category: 'EMPLOYMENT_INCOME', fieldKey: 'withholdingTax', amount: 1_000 },
      ],
      childrenWithModeration: 1,
      isSingleParent: true,
    });

    close(r.taxWithheldAtSource, 1_000);
    close(r.finalTaxLiability, 0);
    close(r.balancePayableOrRefund, -4_504);
    close(r.balancePayableOrRefund, r.finalTaxLiability - r.taxWithheldAtSource - r.credits.cimRefund);
  });

  test('engine: child relief is imputed only on what the CIM left, and never reduces the refund', () => {
    const withRelief = params({
      taxClass: TaxClass.CLASS_1A,
      facts: salary(40_000),
      childrenWithModeration: 1,
      childBenefitReceived: false,
      isSingleParent: true,
    });

    // The CIM covers the 749.96 still due, so the Art. 122 relief has no base
    // left; it is non-refundable and cannot turn into a payout of its own.
    close(withRelief.childRelief.degrevement, 0);
    close(withRelief.childRelief.total, 0);
    close(withRelief.credits.cimApplied, 749.96);
    close(withRelief.credits.cimRefund, 2_754.04);
    close(withRelief.finalTaxLiability, 0);
    close(withRelief.balancePayableOrRefund, -2_754.04);
  });
});

describe('Foreign-taxed securities are not double-counted (LEG-4)', () => {
  const salary = [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 40_000 }];

  const run = (securities: Array<{ grossIncome: number; qualifyingDividend?: boolean; foreignTax?: number }>) =>
    LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      facts: salary,
      securities,
    });

  test('a foreign withholding changes the credit, never the declared income', () => {
    const withoutTax = run([{ grossIncome: 10_000 }]);
    const withTax = run([{ grossIncome: 10_000, foreignTax: 1_500 }]);

    close(withoutTax.netIncome, 50_000);
    close(withTax.netIncome, 50_000);
    close(withTax.netIncome, withoutTax.netIncome);
    close(withTax.taxableIncome, withoutTax.taxableIncome);
    close(withTax.baseTax, withoutTax.baseTax);

    close(withoutTax.credits.foreignTaxCredit, 0);
    assert.ok(withTax.credits.foreignTaxCredit > 0);
    assert.ok(withTax.credits.foreignTaxCredit <= 1_500);
  });

  test('a qualifying dividend feeds the credit slice with the taxable half only', () => {
    const withoutTax = run([{ grossIncome: 10_000, qualifyingDividend: true }]);
    const withTax = run([{ grossIncome: 10_000, qualifyingDividend: true, foreignTax: 5_000 }]);

    // 50 % exemption: 5 000 enters the base, not the 10 000 gross.
    close(withTax.netIncome, 45_000);
    close(withTax.netIncome, withoutTax.netIncome);

    const ledger = withTax.provenance.find((p) => p.ruleCode === 'LIR-ART-97-115-15a-RELIBI');
    assert.ok(ledger);
    close(Number(ledger!.inputs.securitiesCreditIncome), 5_000);

    // The foreign tax is capped by the Luxembourg tax on that half, so the
    // credit proves the slice: on the gross it would be twice as large.
    const taxable = withTax.taxableIncome;
    // Art. 134bis: the credit is capped at the Luxembourg tax *fraction*
    // corresponding to the foreign income, not at its marginal tax.
    const capOnHalf = (withTax.baseTax * 5_000) / taxable;
    const capOnGross = (withTax.baseTax * 10_000) / taxable;
    assert.ok(capOnHalf > 0);
    assert.ok(capOnHalf < capOnGross);
    close(withTax.credits.foreignTaxCredit, capOnHalf);
  });
});

describe('Art. 3ter individual assessment drops foreign relief (LEG-5)', () => {
  const ART_3TER_GAP =
    'Foreign income under Art. 3ter individual assessment (pure or reallocation) is not supported: the per-spouse ordinary credit and exemption-with-progression are not modelled. Use collective assessment or obtain a professional review.';

  const couple = (
    assessmentMode: 'COLLECTIVE' | 'INDIVIDUAL_PURE' | 'INDIVIDUAL_REALLOCATION',
    country: string,
    amount: number,
    foreignTax: number,
  ) =>
    LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_2,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'a',
      spouseUserId: 'b',
      assessmentMode,
      facts: [
        { id: 'f1', ownerId: 'a', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 },
        { id: 'f2', ownerId: 'b', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 40_000 },
      ],
      foreignIncomeItems: [{ country, amount, foreignTax }],
    });

  for (const mode of ['INDIVIDUAL_PURE', 'INDIVIDUAL_REALLOCATION'] as const) {
    test(`credit-method country (DE) is refused under ${mode}`, () => {
      const r = couple(mode, 'DE', 20_000, 5_000);
      assert.strictEqual(r.assessmentMode, mode);
      assert.ok(r.unsupported.includes(ART_3TER_GAP));
      assert.ok(r.warnings.includes(ART_3TER_GAP));
      // Neither the per-spouse credit nor the progression is modelled.
      close(r.credits.foreignTaxCredit, 0);
    });

    test(`exemption-method country with no foreign tax (FR) is refused, not silent, under ${mode}`, () => {
      const r = couple(mode, 'FR', 20_000, 0);
      assert.strictEqual(r.assessmentMode, mode);
      assert.ok(r.unsupported.includes(ART_3TER_GAP));
      assert.ok(r.warnings.includes(ART_3TER_GAP));
      // Exemption with progression is absent: the exempt income is not added
      // back for the rate, so the cote is lower than the collective one.
      close(r.credits.foreignTaxCredit, 0);
      assert.ok(r.baseTax > 0);
    });
  }

  test('collective assessment keeps computing the credit and raises no Art. 3ter gap', () => {
    const r = couple('COLLECTIVE', 'DE', 20_000, 5_000);
    assert.ok(!r.unsupported.includes(ART_3TER_GAP));
    assert.ok(!r.unsupported.some((u) => /Art\. 3ter individual assessment/.test(u)));
    assert.ok(r.credits.foreignTaxCredit > 0);
    assert.ok(r.credits.foreignTaxCredit <= 5_000);
  });
});

describe('Class 2 without spouse — Art. 119 n° 3 window keeps the Class 2 tariff (LEG-6)', () => {
  const salary = [
    { id: 'f1', ownerId: 'u1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 101_020 },
  ];

  const widow = (overrides: Partial<Parameters<typeof LuxembourgTaxEngine.calculate>[0]> = {}) =>
    LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_2,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      facts: salary,
      ...overrides,
    });

  test('the flag applies the Class 2 tariff to a spouse-less filer', () => {
    const r = widow({ class2WithoutSpouse: true });
    // gross 101 020 − the 1 020 default forfaits = 100 000 taxable
    close(r.taxableIncome, 100_000);
    assert.strictEqual(r.taxClass, TaxClass.CLASS_2);
    close(r.baseTax, floorEuroToCote(baseTax(100_000, 'CLASS_2', pkg2025)));
    close(r.baseTax, 14_682);
    assert.ok(!r.warnings.some((w) => w.includes('taxed as Class 1')));
  });

  test('without the flag the safety downgrade to Class 1 still applies', () => {
    const r = widow();
    close(r.baseTax, floorEuroToCote(baseTax(100_000, 'CLASS_1', pkg2025)));
    close(r.baseTax, 26_764);
    assert.ok(r.warnings.some((w) => w.includes('taxed as Class 1')));
  });

  test('the flag does not double the Art. 115 n° 15 capital tranche', () => {
    const r = widow({ facts: [], securities: [{ grossIncome: 2_000 }] });
    const tranche = r.provenance.find((p) => p.ruleCode === 'LIR-ART-115-15');
    assert.ok(tranche, 'Art. 115 n° 15 tranche provenance missing');
    close(Number(tranche!.inputs.tranche), 1_500);
    close(tranche!.outputAmount, 500);

    // A spouse in the workspace keeps the doubled tranche, which would zero it.
    const couple = widow({ facts: [], securities: [{ grossIncome: 2_000 }], spouseUserId: 'u2' });
    const coupleTranche = couple.provenance.find((p) => p.ruleCode === 'LIR-ART-115-15');
    assert.ok(coupleTranche);
    close(Number(coupleTranche!.inputs.tranche), 3_000);
    close(coupleTranche!.outputAmount, 0);
  });

  test('the flag warns when it is redundant (spouse present) or ignored (not Class 2)', () => {
    const withSpouse = widow({ class2WithoutSpouse: true, spouseUserId: 'u2' });
    assert.ok(withSpouse.warnings.some((w) => w.includes('a spouse is registered')));

    const otherClass = widow({ taxClass: TaxClass.CLASS_1, class2WithoutSpouse: true });
    assert.ok(otherClass.warnings.some((w) => w.includes('not in Class 2')));
  });
});

describe('Art. 111bis contributor clamp — a stale couple answer cannot double a single filer (LEG-6)', () => {
  const salary = (id: string, ownerId: string) => ({
    id, ownerId, category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 101_020,
  });
  // 6 500 declared is above the 2026 single cap (4 500) and above the 2025 one
  // (3 200), so the cap always binds and the expected value is the cap itself.
  const savings = (id: string, ownerId: string) => ({
    id, ownerId, category: 'PENSION_SAVINGS_111BIS', fieldKey: 'art111bis', amount: 6_500,
  });

  const single = (taxYear: number, contributors = 2) =>
    LuxembourgTaxEngine.calculate({
      taxYear,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      facts: [salary('f1', 'u1'), savings('f2', 'u1')],
      art111bisContributors: contributors,
    });

  const couple = (taxYear: number) =>
    LuxembourgTaxEngine.calculate({
      taxYear,
      taxClass: TaxClass.CLASS_2,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      spouseUserId: 'u2',
      facts: [
        salary('f1', 'u1'), salary('f3', 'u2'),
        savings('f2', 'u1'), savings('f4', 'u2'),
      ],
      art111bisContributors: 2,
    });

  test('a single filer keeps the per-person cap despite a stale contributor count of 2', () => {
    close(single(2025).deductions.art111bis, 3_200);
    close(single(2026).deductions.art111bis, 4_500);
    const line = single(2025).provenance.find((p) => p.ruleCode === 'LIR-ART-111bis');
    assert.ok(line, 'Art. 111bis provenance missing');
    close(Number(line!.inputs.contributors), 1);
    close(Number(line!.inputs.declared), 6_500);
  });

  test('two contributing spouses still get the doubled cap', () => {
    close(couple(2025).deductions.art111bis, 6_400);
    close(couple(2026).deductions.art111bis, 9_000);
  });

  test('a widow keeping Class 2 without a spouse is not doubled either', () => {
    const r = LuxembourgTaxEngine.calculate({
      taxYear: 2025,
      taxClass: TaxClass.CLASS_2,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'u1',
      class2WithoutSpouse: true,
      facts: [salary('f1', 'u1'), savings('f2', 'u1')],
      art111bisContributors: 2,
    });
    assert.strictEqual(r.taxClass, TaxClass.CLASS_2);
    close(r.deductions.art111bis, 3_200);
    const line = r.provenance.find((p) => p.ruleCode === 'LIR-ART-111bis');
    assert.ok(line, 'Art. 111bis provenance missing');
    close(Number(line!.inputs.contributors), 1);
  });

  test('the deduction layer clamps on its own, without relying on the engine', () => {
    const person = {
      grossSalary: 101_020,
      socialContributions: 0,
      grossPension: 0,
      capitalIncome: 0,
      rentalIncome: 0,
      foreignIncome: 0,
      independentProfit: 0,
      actualFraisObtention: 0,
      travelUnits: 0,
    };
    const context = (spouse: boolean): Parameters<typeof calculateDeductions>[0] => ({
      pkg: pkg2025,
      taxClass: spouse ? 'CLASS_2' : 'CLASS_1',
      assessmentMode: 'COLLECTIVE',
      primary: person,
      ...(spouse ? { spouse: person } : {}),
      childrenWithModeration: 0,
      art111Declared: 0,
      art111bisDeclared: 13_000,
      art111bisContributors: 2,
      savingsHousingDeclared: 0,
      lrcpDeclared: 0,
      mortgageInterest: 0,
      donationsDeclared: 0,
      extraordinaryChargesDeclared: 0,
      bothSpousesProfessional: false,
      conjointAidant: false,
      spouseRetiredUnder3Years: false,
      priorYearLosses: 0,
      amvpEligible: false,
      asrdPrimeUnique: 0,
      asrdChildren: 0,
      netIncomeForDonationCap: 101_020,
    });

    close(calculateDeductions(context(false)).art111bisDeduction, 3_200);
    close(calculateDeductions(context(true)).art111bisDeduction, 6_400);
    close(calculateDeductions({ ...context(true), pkg: pkg2026 }).art111bisDeduction, 9_000);
  });
});

describe('Scenario comparison — Class 2 vs 2 × Class 1 vs Art. 3ter reallocation (LEG-8)', () => {
  const couple = {
    taxYear: 2025,
    taxClass: TaxClass.CLASS_2,
    residence: TaxResidence.RESIDENT,
    primaryUserId: 'a',
    spouseUserId: 'b',
    facts: [
      { id: 'f1', ownerId: 'a', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 },
      { id: 'f2', ownerId: 'b', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 40_000 },
    ],
  };

  test('a Class 2 couple gets three modes and one shared rule-package version', () => {
    const r = LuxembourgTaxEngine.compareAssessmentModes(couple);

    assert.strictEqual(r.collective.assessmentMode, 'COLLECTIVE');
    assert.strictEqual(r.individualPure.assessmentMode, 'INDIVIDUAL_PURE');
    assert.strictEqual(r.individualReallocation.assessmentMode, 'INDIVIDUAL_REALLOCATION');

    const versions = new Set([
      r.collective.rulePackageVersion,
      r.individualPure.rulePackageVersion,
      r.individualReallocation.rulePackageVersion,
    ]);
    assert.strictEqual(versions.size, 1);
    assert.strictEqual(r.collective.rulePackageVersion, pkg2025.version);

    // 60,000 + 40,000: the split Class 2 tariff and 2× Class 1 do not coincide.
    assert.ok(r.collective.finalTaxLiability > 0);
    assert.ok(r.individualPure.finalTaxLiability > 0);
    assert.notStrictEqual(r.collective.finalTaxLiability, r.individualPure.finalTaxLiability);
  });

  test('the comparison does not mutate the caller\'s params', () => {
    const snapshot = JSON.parse(JSON.stringify(couple));
    LuxembourgTaxEngine.compareAssessmentModes(couple);
    assert.deepStrictEqual(couple, snapshot);
  });

  test('a non-Class-2 household still gets three results, all collective', () => {
    const single = {
      taxYear: 2025,
      taxClass: TaxClass.CLASS_1,
      residence: TaxResidence.RESIDENT,
      primaryUserId: 'a',
      facts: [
        { id: 'f1', ownerId: 'a', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 },
      ],
    };
    const r = LuxembourgTaxEngine.compareAssessmentModes(single);

    assert.strictEqual(r.collective.taxClass, TaxClass.CLASS_1);
    assert.strictEqual(r.individualPure.assessmentMode, 'COLLECTIVE');
    assert.strictEqual(r.individualReallocation.assessmentMode, 'COLLECTIVE');
    // The API/UI use taxClass to mark the comparison as not comparable.
    assert.strictEqual(
      r.individualPure.finalTaxLiability,
      r.collective.finalTaxLiability,
    );
  });
});

describe('Certificate 160 codes (LEG-7)', () => {
  const base = {
    taxYear: 2025,
    taxClass: TaxClass.CLASS_1,
    residence: TaxResidence.RESIDENT,
    primaryUserId: 'u1',
  } as const;

  const certWarnings = (warnings: string[]) =>
    warnings.filter((w) => w.includes('Certificate 160'));

  test('code_101 + code_103 + code_105 fill gross pay, social contributions and withholding', () => {
    const result = LuxembourgTaxEngine.calculate({
      ...base,
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'code_101', amount: 60_000 },
        { id: 'f2', category: 'EMPLOYMENT_INCOME', fieldKey: 'code_103', amount: 7_200 },
        { id: 'f3', category: 'EMPLOYMENT_INCOME', fieldKey: 'code_105', amount: 9_000 },
      ],
    });

    close(result.grossIncome, 60_000);
    // netIncome = grossSalary - socialContributions: 60 000 - 7 200.
    close(result.netIncome, 52_800);
    close(result.taxWithheldAtSource, 9_000);
    assert.deepStrictEqual(certWarnings(result.warnings), []);
  });

  test('code_141 reaches the MORTGAGE_INTEREST branch', () => {
    const result = LuxembourgTaxEngine.calculate({
      ...base,
      // Year 1 of the valeur-locative schedule: the interest is fully deductible.
      mortgageFixationYear: 2025,
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 },
        { id: 'f2', category: 'MORTGAGE_INTEREST', fieldKey: 'code_141', amount: 1_000 },
      ],
    });

    close(result.deductions.mortgageInterest, 1_000);
    assert.deepStrictEqual(certWarnings(result.warnings), []);
  });

  test('a negative amount is refused instead of netting against other income', () => {
    const result = LuxembourgTaxEngine.calculate({
      ...base,
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: -60_000 },
        { id: 'f2', category: 'PENSION_INCOME', fieldKey: 'grossPension', amount: 40_000 },
      ],
    });

    // The pension alone: gross income must never be reduced (or made negative) by a sign error.
    close(result.grossIncome, 40_000);
    close(result.netIncome, 40_000);
    assert.ok(
      result.warnings.some((w) => w.includes('has a negative amount (-60000) and was ignored')),
      JSON.stringify(result.warnings),
    );
  });

  test('a negative deduction is refused too', () => {
    const result = LuxembourgTaxEngine.calculate({
      ...base,
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 },
        {
          id: 'f2',
          category: 'DONATION_DEDUCTION',
          fieldKey: 'donations',
          amount: -50_000,
        },
      ],
    });

    close(result.deductions.donations, 0);
    assert.ok(
      result.warnings.some((w) => w.includes('has a negative amount')),
      JSON.stringify(result.warnings),
    );
  });

  test('prior-year losses are capped at the income they can offset, the rest carries forward', () => {
    const result = LuxembourgTaxEngine.calculate({
      ...base,
      priorYearLosses: 900_000,
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 },
        { id: 'f2', category: 'EMPLOYMENT_INCOME', fieldKey: 'socialSecurity', amount: 0 },
      ],
    });

    close(result.taxableIncome, 0);
    // Net income (60 000) less the 1 020 of ordinary deductions: that is all a loss can offset.
    close(result.deductions.priorLosses, 58_980);
    close(result.deductions.total, 60_000);
    assert.ok(
      result.warnings.some((w) => w.includes('stays in the Art. 114 carry-forward')),
      JSON.stringify(result.warnings),
    );
  });

  test('a loss smaller than the income is deducted in full without a warning', () => {
    const result = LuxembourgTaxEngine.calculate({
      ...base,
      priorYearLosses: 5_000,
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 },
        { id: 'f2', category: 'EMPLOYMENT_INCOME', fieldKey: 'socialSecurity', amount: 0 },
      ],
    });

    close(result.deductions.priorLosses, 5_000);
    close(result.taxableIncome, 60_000 - 1_020 - 5_000);
    assert.ok(
      !result.warnings.some((w) => w.includes('carry-forward')),
      'a fully absorbed loss must not warn',
    );
  });

  test('mortgage interest without the fixation year is refused, not granted without limit', () => {
    const result = LuxembourgTaxEngine.calculate({
      ...base,
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 },
        { id: 'f2', category: 'MORTGAGE_INTEREST', fieldKey: 'code_141', amount: 99_999 },
      ],
    });

    close(result.deductions.mortgageInterest, 0);
    assert.ok(
      result.warnings.some((w) => w.includes('without the year the valeur locative was fixed')),
      JSON.stringify(result.warnings),
    );
  });

  test('interest stays fully deductible for a home still under construction', () => {
    const result = LuxembourgTaxEngine.calculate({
      ...base,
      mortgageBeforeDisposition: true,
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 60_000 },
        { id: 'f2', category: 'MORTGAGE_INTEREST', fieldKey: 'code_141', amount: 12_000 },
      ],
    });

    close(result.deductions.mortgageInterest, 12_000);
    assert.ok(
      !result.warnings.some((w) => w.includes('valeur locative was fixed')),
      'a construction loan must not warn about a missing fixation year',
    );
  });

  test('the habit_pers schedule caps years 3-6, 7-11 and 12+ respectively', () => {
    const capAt = (fixationYear: number): number =>
      LuxembourgTaxEngine.calculate({
        ...base,
        mortgageFixationYear: fixationYear,
        facts: [
          { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 80_000 },
          { id: 'f2', category: 'MORTGAGE_INTEREST', fieldKey: 'code_141', amount: 9_000 },
        ],
      }).deductions.mortgageInterest;

    // taxYear 2025: 2023 = year 3 (4 000), 2017 = year 9 (3 000), 2005 = year 21 (2 000).
    close(capAt(2023), 4_000);
    close(capAt(2017), 3_000);
    close(capAt(2005), 2_000);
  });

  test('an unknown code_999 warns "not supported" and changes neither income nor deductions', () => {
    const baseline = LuxembourgTaxEngine.calculate({
      ...base,
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 50_000 },
      ],
    });
    const result = LuxembourgTaxEngine.calculate({
      ...base,
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 50_000 },
        { id: 'f2', category: 'EMPLOYMENT_INCOME', fieldKey: 'code_999', amount: 12_000 },
      ],
    });

    assert.ok(result.warnings.some((w) => w.includes('not supported')));
    close(result.grossIncome, baseline.grossIncome);
    close(result.taxableIncome, baseline.taxableIncome);
    close(result.deductions.total, baseline.deductions.total);
  });

  test('code_FFO warns "withholding-base" and does not change deductions', () => {
    const baseline = LuxembourgTaxEngine.calculate({
      ...base,
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 50_000 },
      ],
    });
    const result = LuxembourgTaxEngine.calculate({
      ...base,
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 50_000 },
        { id: 'f2', category: 'EMPLOYMENT_INCOME', fieldKey: 'code_FFO', amount: 1_020 },
      ],
    });

    assert.ok(result.warnings.some((w) => w.includes('withholding-base')));
    close(result.deductions.total, baseline.deductions.total);
    close(result.taxableIncome, baseline.taxableIncome);
  });

  // M1: C and R are printed on the 160F note-3 header and used to fall
  // through the switch in silence. They are known but not return facts, so the
  // engine must warn and leave the return unchanged.
  for (const code of ['C', 'R']) {
    test(`the note-3 letter ${code} warns "withholding-base" instead of being dropped`, () => {
      const baseline = LuxembourgTaxEngine.calculate({
        ...base,
        facts: [
          { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 50_000 },
        ],
      });
      const result = LuxembourgTaxEngine.calculate({
        ...base,
        facts: [
          { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 50_000 },
          { id: 'f2', category: 'EMPLOYMENT_INCOME', fieldKey: code, amount: 7_000 },
        ],
      });

      const warnings = certWarnings(result.warnings);
      assert.strictEqual(warnings.length, 1, `expected one certificate warning, got ${warnings.length}`);
      assert.ok(warnings[0].includes('withholding-base'), warnings[0]);
      close(result.grossIncome, baseline.grossIncome);
      close(result.netIncome, baseline.netIncome);
      close(result.taxableIncome, baseline.taxableIncome);
      close(result.deductions.total, baseline.deductions.total);
    });
  }

  test('an unknown bare letter X warns "not supported" and changes nothing', () => {
    const baseline = LuxembourgTaxEngine.calculate({
      ...base,
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 50_000 },
      ],
    });
    const result = LuxembourgTaxEngine.calculate({
      ...base,
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 50_000 },
        { id: 'f2', category: 'EMPLOYMENT_INCOME', fieldKey: 'X', amount: 7_000 },
      ],
    });

    const warnings = certWarnings(result.warnings);
    assert.strictEqual(warnings.length, 1);
    assert.ok(warnings[0].includes('not supported'), warnings[0]);
    close(result.grossIncome, baseline.grossIncome);
    close(result.netIncome, baseline.netIncome);
    close(result.taxableIncome, baseline.taxableIncome);
    close(result.deductions.total, baseline.deductions.total);
  });

  test('code_102 is added to the same gross salary as code_101', () => {
    const result = LuxembourgTaxEngine.calculate({
      ...base,
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'code_101', amount: 30_000 },
        { id: 'f2', category: 'EMPLOYMENT_INCOME', fieldKey: 'code_102', amount: 5_000 },
      ],
    });

    close(result.grossIncome, 35_000);
    assert.deepStrictEqual(certWarnings(result.warnings), []);
  });

  test('the note-3 letters S and P fill the salary and pension lines', () => {
    const salary = LuxembourgTaxEngine.calculate({
      ...base,
      facts: [{ id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'S', amount: 20_000 }],
    });
    const pension = LuxembourgTaxEngine.calculate({
      ...base,
      facts: [{ id: 'f1', category: 'PENSION_INCOME', fieldKey: 'P', amount: 20_000 }],
    });

    close(salary.grossIncome, 20_000);
    assert.deepStrictEqual(certWarnings(salary.warnings), []);
    close(pension.grossIncome, 20_000);
    assert.deepStrictEqual(certWarnings(pension.warnings), []);
  });

  test('LRCP reaches the lrcp deduction', () => {
    const result = LuxembourgTaxEngine.calculate({
      ...base,
      facts: [{ id: 'f1', category: 'LRCP_CONTRIBUTION', fieldKey: 'LRCP', amount: 1_000 }],
    });

    close(result.deductions.lrcp, 1_000);
    assert.deepStrictEqual(certWarnings(result.warnings), []);
  });

  test('canonical grossSalary / socialSecurity / withholdingTax keys behave like 101 / 103 / 105', () => {
    const result = LuxembourgTaxEngine.calculate({
      ...base,
      facts: [
        { id: 'f1', category: 'EMPLOYMENT_INCOME', fieldKey: 'grossSalary', amount: 40_000 },
        { id: 'f2', category: 'EMPLOYMENT_INCOME', fieldKey: 'socialSecurity', amount: 4_800 },
        { id: 'f3', category: 'EMPLOYMENT_INCOME', fieldKey: 'withholdingTax', amount: 6_000 },
      ],
    });

    close(result.grossIncome, 40_000);
    close(result.netIncome, 35_200);
    close(result.taxWithheldAtSource, 6_000);
    assert.deepStrictEqual(certWarnings(result.warnings), []);
  });
});
