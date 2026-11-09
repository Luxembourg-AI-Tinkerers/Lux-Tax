import {
  TaxClass,
  TaxCalculationParams,
  TaxCalculationResultDto,
  CalculationLineItemProvenance,
  DeductionBreakdownDto,
  CreditBreakdownDto,
  AssessmentMode,
} from '@luxtax/contracts';
import { getRulePackage } from './rules';
import { baseTax, floorEuroToCote, marginalRate, roundRiaDownTo50 } from './scale';
import { calculateDeductions, DeductionContext, PersonIncome, resolveArt111bisContributors, round2 } from './deductions';
import { bonificationForChildren, cicForSalary, cimFor, cissmForSalary, degrevementForChildren, resolvePerPersonCredits } from './credits';
import { addMoney, fromCents, mulRate, sumCents, toCents } from './money';
import { treatyMethodFor } from './rules/treaties';
import { resolveChildReliefHistory } from './child-relief';
import {
  isCertificate160FieldKey,
  lookupCertificate160Code,
  normalizeCertificate160Code,
} from './forms/certificate160';

interface PersonFacts {
  grossSalary: number;
  socialContributions: number;
  withholdingTax: number;
  actualFraisObtention: number;
  freelanceRevenue: number;
  businessExpenses: number;
  grossPension: number;
  pensionWithholding: number;
  capitalIncome: number;
  qualifyingDividends: number;
  capitalWithholding: number;
  rentalGross: number;
  rentalCharges: number;
  rentalNet: number;
  foreignIncome: number;
  factIds: string[];
}

const emptyPerson = (): PersonFacts => ({
  grossSalary: 0,
  socialContributions: 0,
  withholdingTax: 0,
  actualFraisObtention: 0,
  freelanceRevenue: 0,
  businessExpenses: 0,
  grossPension: 0,
  pensionWithholding: 0,
  capitalIncome: 0,
  qualifyingDividends: 0,
  capitalWithholding: 0,
  rentalGross: 0,
  rentalCharges: 0,
  rentalNet: 0,
  foreignIncome: 0,
  factIds: [],
});

/** Questionnaire child counts: non-negative integers, NaN-safe. */
const countOf = (value: number | undefined): number =>
  value !== undefined && Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;

export class LuxembourgTaxEngine {
  /**
   * Compare the three legal assessment modes on the same facts: collective
   * (Art. 3 / 3bis), 2× Class 1 (Art. 3ter pure) and the Art. 3ter reallocation
   * of the joint taxable base.
   *
   * Pure function: the caller's params object is never mutated. A non-Class-2
   * household is not a couple, so the engine resolves all three runs to
   * collective and the three results are identical.
   */
  public static compareAssessmentModes(params: TaxCalculationParams): {
    collective: TaxCalculationResultDto;
    individualPure: TaxCalculationResultDto;
    individualReallocation: TaxCalculationResultDto;
  } {
    return {
      collective: LuxembourgTaxEngine.calculate({ ...params, assessmentMode: 'COLLECTIVE' }),
      individualPure: LuxembourgTaxEngine.calculate({ ...params, assessmentMode: 'INDIVIDUAL_PURE' }),
      individualReallocation: LuxembourgTaxEngine.calculate({
        ...params,
        assessmentMode: 'INDIVIDUAL_REALLOCATION',
      }),
    };
  }

  /**
   * Deterministic Luxembourg resident personal income tax calculation.
   * Rules come exclusively from the immutable package for `params.taxYear`.
   */
  public static calculate(params: TaxCalculationParams): TaxCalculationResultDto {
    const {
      taxYear,
      taxClass,
      facts,
      primaryUserId,
      spouseUserId,
      childrenWithModeration = 0,
      childrenWithBonification = 0,
      childBenefitReceived = true,
      moderatedChildrenWithoutBenefit,
      dependantsCount = 0,
    } = params;

    const pkg = getRulePackage(taxYear);
    const provenance: CalculationLineItemProvenance[] = [];
    const warnings: string[] = [];
    const unsupported: string[] = [];

    // Art. 122 / 123bis counts, clamped so the relief never sees a negative or
    // fractional number of children. A per-child history is authoritative when
    // supplied: it is the only shape that can enforce the two-bonification
    // lifetime cap, the one-relief-per-child-per-year rule and the transitional
    // résidence-alternée rule.
    const childReliefResolution =
      (params.childReliefHistory?.length ?? 0) > 0
        ? resolveChildReliefHistory(params.childReliefHistory ?? [], taxYear)
        : null;
    const moderationCount = childReliefResolution
      ? childReliefResolution.moderationCount
      : countOf(childrenWithModeration);
    const bonificationCount = childReliefResolution
      ? childReliefResolution.bonificationChildren
      : countOf(childrenWithBonification);
    if (childReliefResolution) warnings.push(...childReliefResolution.warnings);

    const assessmentMode: AssessmentMode =
      taxClass === TaxClass.CLASS_2 ? params.assessmentMode ?? 'COLLECTIVE' : 'COLLECTIVE';
    // A widow(er) / divorced filer keeping Class 2 under Art. 119 n° 3 has no
    // spouse in the workspace: the Class 2 tariff applies, but the couple's
    // collective extras (double capital tranche, couple deduction multiplier,
    // joint abattement) must not. A spouse in the workspace is what makes the
    // household collective, not the class alone.
    const isCollective =
      taxClass === TaxClass.CLASS_2 && Boolean(spouseUserId) && assessmentMode !== 'INDIVIDUAL_PURE';

    // Art. 3 d): a mixed resident/non-resident couple may opt for collective
    // assessment (and therefore Class 2) only when the resident spouse realises
    // at least 90 % of the household's professional income in Luxembourg.
    const isMixedCouple =
      (params.residence === 'NON_RESIDENT' && params.spouseResidence === 'RESIDENT') ||
      (params.residence === 'RESIDENT' && params.spouseResidence === 'NON_RESIDENT');
    const householdProfessionalIncomeForGate =
      params.householdProfessionalIncome ?? params.luxembourgProfessionalIncome ?? 0;
    const mixedProfessionalShare =
      householdProfessionalIncomeForGate > 0
        ? (params.luxembourgProfessionalIncome ?? 0) / householdProfessionalIncomeForGate
        : 0;
    const mixedCoupleCollectiveGranted =
      isMixedCouple && Boolean(params.mixedCoupleCollectiveRequested) && mixedProfessionalShare >= 0.9;

    // ------------------------------------------------- non-resident handling
    let residentMethod = 'RESIDENT_RULES';
    let nonResidentInfo: TaxCalculationResultDto['nonResident'];
    let excludeForeignIncome = false;
    // Non-resident without assimilation: foreign income is not taxable at all.
    // Distinct from `excludeForeignIncome`, which is also used to avoid counting a
    // generic FOREIGN_INCOME fact twice when the itemised breakdown is present.
    let nonResidentForeignExcluded = false;

    if (isMixedCouple && !mixedCoupleCollectiveGranted) {
      warnings.push(
        'Mixed resident/non-resident couple: collective assessment (Art. 3 d) requires the resident spouse to realise at least 90 % of the household professional income in Luxembourg. The default separate treatment applies.',
      );
    }
    if (mixedCoupleCollectiveGranted) {
      provenance.push({
        ruleCode: 'LIR-ART-3-d',
        description:
          'Mixed resident/non-resident couple admitted to collective assessment (Art. 3 d): >= 90 % of household professional income in Luxembourg; taxed as resident under Art. 6 al. 4',
        sourceFactIds: [],
        formula: 'luProfessional / householdProfessional >= 0.90',
        inputs: { share: round2(mixedProfessionalShare * 100) },
        outputAmount: 0,
      });
    }

    if (params.residence === 'NON_RESIDENT' && !mixedCoupleCollectiveGranted) {
      const worldwide = params.worldwideIncome ?? 0;
      const luProfessional = params.luxembourgProfessionalIncome ?? 0;
      const householdProfessional = params.householdProfessionalIncome ?? luProfessional;
      const foreignNet = params.foreignNetIncome;

      const worldwideShare = worldwide > 0 ? luProfessional / worldwide : 0;
      const professionalShare = householdProfessional > 0 ? luProfessional / householdProfessional : 0;

      // Art. 157ter: >= 90 % of worldwide income in LU, or foreign net < EUR 13 000.
      const assimilationGranted =
        Boolean(params.nonResidentAssimilation) &&
        (worldwideShare >= 0.9 || (foreignNet !== undefined && foreignNet < 13_000));

      nonResidentInfo = {
        assimilationGranted,
        worldwideShare: round2(worldwideShare * 100),
        professionalShareInLuxembourg: round2(professionalShare * 100),
        method: assimilationGranted ? 'RESIDENT_RULES' : 'EXEMPTION_WITH_PROGRESSION',
      };

      if (!assimilationGranted) {
        residentMethod = 'EXEMPTION_WITH_PROGRESSION';
        excludeForeignIncome = true;
        nonResidentForeignExcluded = true;
        unsupported.push(
          'NON_RESIDENT without assimilation: only Luxembourg-source income is taxed. Foreign income is excluded from the base (not merely for the rate), so the result is an estimate of the Luxembourg cote only. Treaty credit / progression mechanics are not automated.',
        );
      } else {
        provenance.push({
          ruleCode: 'LIR-ART-157ter',
          description:
            'Non-resident assimilated to a resident (Art. 157ter): >= 90 % of worldwide income in Luxembourg, or foreign net income < EUR 13 000',
          sourceFactIds: [],
          formula: 'luWorldwideShare >= 0.90 OR foreignNet < 13000',
          inputs: {
            worldwideShare: round2(worldwideShare * 100),
            foreignNet: foreignNet ?? 'unset',
          },
          outputAmount: 0,
        });
      }
    }

    // ------------------------------------------------------------------ facts
    const primary = emptyPerson();
    const spouse = spouseUserId ? emptyPerson() : null;

    let art111 = 0;
    let art111bis = 0;
    let savingsHousing = 0;
    let lrcp = 0;
    let donations = 0;
    let extraordinaryCharges = 0;
    let mortgageInterest = 0;
    const deductionFactIds: string[] = [];

    const ownerBucket = (ownerId?: string | null): PersonFacts => {
      if (spouseUserId && ownerId === spouseUserId && spouse) return spouse;
      return primary;
    };

    for (const fact of facts) {
      const amount = Number(fact.amount) || 0;
      const bucket = ownerBucket(fact.ownerId);

      // A negative amount is not a correction mechanism: netting it against other income would
      // silently reduce the return (and could drive gross income below zero). Refuse it and say
      // so, rather than letting a sign error propagate into the figures.
      if (amount < 0) {
        warnings.push(
          `Fact ${fact.id} has a negative amount (${amount}) and was ignored. Enter the correction ` +
            'as a positive amount in the right box; a sign error must not reduce another income line.',
        );
        continue;
      }

      // ------------------------------------------------ certificate 160 codes
      // A salary certificate carries codes, not engine field keys. Resolve
      // them through the explicit table so a code the engine cannot map is
      // reported (and skipped) instead of falling through the category switch
      // and disappearing. Plain field keys (grossSalary, …) are untouched.
      const isCertificateField = isCertificate160FieldKey(fact.fieldKey);
      const certificateCode = isCertificateField
        ? lookupCertificate160Code(fact.fieldKey)
        : undefined;

      if (isCertificateField && !certificateCode) {
        warnings.push(
          `Certificate 160 code "${normalizeCertificate160Code(fact.fieldKey)}" is not supported by this engine; fact ${fact.id} was ignored. Add it to certificate160.ts or review it manually.`,
        );
        continue;
      }

      if (certificateCode && !certificateCode.supported) {
        warnings.push(
          `Certificate 160 code "${certificateCode.code}" (${certificateCode.labelFr}) is a certificate withholding-base label, not a return fact; fact ${fact.id} was ignored.`,
        );
        continue;
      }

      // The fact joins its owner bucket only here: a fact ignored above must
      // not appear as a source of the income line.
      bucket.factIds.push(fact.id);

      // A supported code wins over the category the extractor guessed: the
      // table is the legal mapping, the stored category is just a hint.
      const effectiveCategory = certificateCode ? certificateCode.category : fact.category;
      const effectiveFieldKey = certificateCode ? certificateCode.fieldKey : fact.fieldKey;

      switch (effectiveCategory) {
        case 'EMPLOYMENT_INCOME':
          if (effectiveFieldKey === 'grossSalary') {
            bucket.grossSalary = addMoney(bucket.grossSalary, amount);
          } else if (effectiveFieldKey === 'socialSecurity') {
            bucket.socialContributions = addMoney(bucket.socialContributions, amount);
          } else if (effectiveFieldKey === 'withholdingTax') {
            bucket.withholdingTax = addMoney(bucket.withholdingTax, amount);
          } else if (effectiveFieldKey === 'fraisObtention') {
            bucket.actualFraisObtention = addMoney(bucket.actualFraisObtention, amount);
          }
          break;

        case 'FREELANCE_INCOME':
          bucket.freelanceRevenue = addMoney(bucket.freelanceRevenue, amount);
          break;

        case 'BUSINESS_EXPENSE':
          bucket.businessExpenses = addMoney(bucket.businessExpenses, amount);
          break;

        case 'PENSION_INCOME':
          bucket.grossPension = addMoney(bucket.grossPension, amount);
          if (effectiveFieldKey === 'withholdingTax') bucket.pensionWithholding = addMoney(bucket.pensionWithholding, amount);
          break;

        case 'CAPITAL_INCOME':
          if (effectiveFieldKey === 'withholdingTax') bucket.capitalWithholding = addMoney(bucket.capitalWithholding, amount);
          else if (effectiveFieldKey === 'qualifyingDividend') bucket.qualifyingDividends = addMoney(bucket.qualifyingDividends, amount);
          else bucket.capitalIncome = addMoney(bucket.capitalIncome, amount);
          break;

        case 'RENTAL_INCOME':
          if (effectiveFieldKey === 'grossRent') bucket.rentalGross = addMoney(bucket.rentalGross, amount);
          else if (effectiveFieldKey === 'rentalCharges') bucket.rentalCharges = addMoney(bucket.rentalCharges, amount);
          else bucket.rentalNet = addMoney(bucket.rentalNet, amount);
          break;

        case 'FOREIGN_INCOME':
          bucket.foreignIncome = addMoney(bucket.foreignIncome, amount);
          break;

        case 'MORTGAGE_DEDUCTION':
        case 'MORTGAGE_INTEREST':
          mortgageInterest = addMoney(mortgageInterest, amount);
          deductionFactIds.push(fact.id);
          break;

        case 'INSURANCE_DEDUCTION':
          art111 = addMoney(art111, amount);
          deductionFactIds.push(fact.id);
          break;

        case 'PENSION_SAVINGS_111BIS':
          art111bis = addMoney(art111bis, amount);
          deductionFactIds.push(fact.id);
          break;

        case 'SAVINGS_HOUSING':
          savingsHousing = addMoney(savingsHousing, amount);
          deductionFactIds.push(fact.id);
          break;

        case 'LRCP_CONTRIBUTION':
          lrcp = addMoney(lrcp, amount);
          deductionFactIds.push(fact.id);
          break;

        case 'DONATION_DEDUCTION':
          donations = addMoney(donations, amount);
          deductionFactIds.push(fact.id);
          break;

        case 'CHILDCARE_EXPENSE':
        case 'HOUSEHOLD_HELP_EXPENSE':
          extraordinaryCharges = addMoney(extraordinaryCharges, amount);
          deductionFactIds.push(fact.id);
          break;

        case 'OTHER_DEDUCTION':
          warnings.push(
            `Fact ${fact.id} (${effectiveFieldKey}) is OTHER_DEDUCTION and was not included: no legal box is mapped for it yet.`,
          );
          break;

        default:
          warnings.push(`Fact ${fact.id} has an unknown category "${fact.category}" and was ignored.`);
          break;
      }
    }

    // ----------------------------------------------------- rental (Art. 98)
    const computeRental = (p: PersonFacts): { net: number; forfait: boolean; exemption: number } => {
      if (p.rentalGross === 0 && p.rentalCharges === 0 && p.rentalNet === 0) {
        return { net: 0, forfait: false, exemption: 0 };
      }

      let net = p.rentalGross > 0 ? p.rentalGross - p.rentalCharges : p.rentalNet;
      let forfaitApplied = false;

      if (p.rentalGross > 0 && params.rentalForfaitEligible) {
        const forfait = Math.min(p.rentalGross * 0.35, 2_700);
        if (forfait > p.rentalCharges) {
          net = p.rentalGross - forfait;
          forfaitApplied = true;
        }
      }

      let exemption = 0;
      if (params.rentalSocial && net > 0) {
        exemption = round2(net * 0.9);
        net = round2(net - exemption);
      }

      return { net: round2(net), forfait: forfaitApplied, exemption };
    };

    // ------------------------------------------------- treaty relief (Art. 13 / 134bis)
    const foreignItems = params.foreignIncomeItems ?? [];
    const hasForeignItems = foreignItems.length > 0;
    let exemptForeignIncome = 0;
    let creditForeignIncome = 0;
    // Income that is already in the Luxembourg base (securities ledger) but whose
    // foreign withholding is creditable: it is the denominator slice for the
    // ordinary credit, never an addition to net income.
    let securitiesCreditIncome = 0;
    let foreignTaxPaid = 0;
    // Ordinary-credit slices. Each country (and each security holding) is capped
    // on its own so a country whose foreign tax exceeds the Luxembourg tax on
    // its income cannot absorb the unused headroom of another country.
    const creditSlices = new Map<string, { income: number; foreignTax: number }>();
    const addCreditSlice = (key: string, income: number, foreignTax: number): void => {
      const existing = creditSlices.get(key) ?? { income: 0, foreignTax: 0 };
      creditSlices.set(key, {
        income: addMoney(existing.income, income),
        foreignTax: addMoney(existing.foreignTax, foreignTax),
      });
    };
    const treatyBreakdown: Array<{ country: string; method: string; amount: number }> = [];

    if (hasForeignItems && nonResidentForeignExcluded) {
      warnings.push(
        'Non-resident without assimilation: itemised foreign income was ignored. It is not taxable in Luxembourg, and no foreign tax credit applies on this path.',
      );
    } else if (hasForeignItems) {
      excludeForeignIncome = true; // the itemised breakdown replaces the generic facts
      for (const item of foreignItems) {
        const method = item.method ?? treatyMethodFor(item.country);
        treatyBreakdown.push({ country: item.country.toUpperCase(), method, amount: item.amount });
        if (method === 'EXEMPTION_PROGRESSION') {
          exemptForeignIncome = addMoney(exemptForeignIncome, item.amount);
        } else {
          creditForeignIncome = addMoney(creditForeignIncome, item.amount);
          foreignTaxPaid = addMoney(foreignTaxPaid, item.foreignTax);
          addCreditSlice(`country:${item.country.toUpperCase()}`, item.amount, item.foreignTax);
        }
      }
      provenance.push({
        ruleCode: 'LIR-ART-13-134bis',
        description:
          'Foreign income relief by treaty method: exemption with progression (FR) or ordinary credit (DE/BE/others, Art. 134bis without a treaty)',
        sourceFactIds: [],
        formula: 'credit = min(foreignTax, LU tax attributable); exemption raises the rate only',
        inputs: {
          exemptForeignIncome,
          creditForeignIncome,
          foreignTaxPaid,
          methods: treatyBreakdown.map((t) => `${t.country}:${t.method}`).join(' '),
        },
        outputAmount: creditForeignIncome,
      });
    }

    // ------------------------------------------- rental asset register (Art. 98)
    let registerRental: { net: number; forfait: boolean; exemption: number } | null = null;
    if (params.rentalProperties && params.rentalProperties.length > 0) {
      const rules = pkg.rentalAmortisation;
      let net = 0;
      let amortisationTotal = 0;
      let recentBuildings = 0;

      for (const building of params.rentalProperties) {
        if (!Number.isFinite(building.grossRent) || building.grossRent <= 0) continue;

        const charges = building.charges ?? 0;
        let amortisation = 0;

        if (building.purchasePrice && building.completionYear) {
          const age = taxYear - building.completionYear;
          const landShare = Math.min(Math.max(building.landSharePercent ?? 20, 0), 100) / 100;
          const base = building.purchasePrice * (1 - landShare);

          let rate: number;
          if (age < 5 && recentBuildings < rules.recentMaxBuildings) {
            rate = rules.recentRate;
            recentBuildings += 1;
          } else if (age < 30) {
            rate = rules.rateUnder30;
          } else if (age <= 60) {
            rate = rules.rate30to60;
          } else {
            rate = rules.rateOver60;
          }
          amortisation = addMoney(amortisation, round2(base * rate));
        }

        if (building.energyRenovationAmount && building.energyRenovationAmount > 0) {
          amortisation = addMoney(
            amortisation,
            round2(building.energyRenovationAmount * rules.energyRenovationRate),
          );
        }

        amortisationTotal = addMoney(amortisationTotal, amortisation);
        net = addMoney(net, round2(building.grossRent - charges - amortisation - (building.interest ?? 0)));
      }

      let exemption = 0;
      if (params.rentalSocial && net > 0) {
        exemption = round2(net * 0.9);
        net = round2(net - exemption);
      }

      registerRental = { net: round2(net), forfait: false, exemption };

      provenance.push({
        ruleCode: 'LIR-ART-98-AMORT',
        description:
          'Rental asset register: amortisation 4 % (recent, max two buildings) / 1.5 % / 2 % / 3 % by age, plus the energy-renovation rate, then charges and interest',
        sourceFactIds: [],
        formula: 'net = SUM(grossRent − charges − amortisation − interest)',
        inputs: {
          buildings: params.rentalProperties.length,
          amortisationTotal,
          energyRate: rules.energyRenovationRate,
        },
        outputAmount: round2(net),
      });
    }

    const primaryRental = registerRental ?? computeRental(primary);
    const spouseRental = spouse ? computeRental(spouse) : { net: 0, forfait: false, exemption: 0 };

    if (primaryRental.forfait || spouseRental.forfait) {
      provenance.push({
        ruleCode: 'LIR-ART-98-FORFAIT',
        description: 'Rental forfait 35 % of gross rent, capped at EUR 2 700 per building (private patrimoine, >= 15 years)',
        sourceFactIds: [],
        formula: 'net = gross − min(35 % × gross, 2 700)',
        inputs: {
          primaryGross: primary.rentalGross,
          spouseGross: spouse?.rentalGross ?? 0,
        },
        outputAmount: round2(primaryRental.net + spouseRental.net),
      });
    }

    if (primaryRental.exemption + spouseRental.exemption > 0) {
      provenance.push({
        ruleCode: 'LIR-ART-115-22a',
        description: 'Social rental management (Art. 115 n° 22a): 90 % of the positive net rental income exempt',
        sourceFactIds: [],
        formula: 'exemption = 90 % × positive net rent',
        inputs: {
          exemption: round2(primaryRental.exemption + spouseRental.exemption),
        },
        outputAmount: round2(primaryRental.exemption + spouseRental.exemption),
      });
    }

    // ------------------------------------------------------- capital (Art. 97)
    const capitalTaxableFor = (p: PersonFacts): number => {
      if (p.capitalIncome === 0 && p.qualifyingDividends === 0) return 0;
      const halfExempt = Math.min(p.qualifyingDividends, p.capitalIncome) * 0.5;
      return Math.max(0, round2(p.capitalIncome - halfExempt));
    };

    // ------------------------------------------------- securities ledger
    let primaryCapital = capitalTaxableFor(primary);
    const spouseCapital = spouse ? capitalTaxableFor(spouse) : 0;

    if (params.securities && params.securities.length > 0) {
      primaryCapital = 0;
      let relibiFinalExcluded = 0;

      for (const [holdingIndex, holding] of params.securities.entries()) {
        const gross = holding.grossIncome;
        if (!Number.isFinite(gross) || gross <= 0) continue;

        // 20 % RELIBI elected as final: the income does not enter the base.
        if (params.relibiFinalElective && (holding.relibiWithheld ?? 0) > 0) {
          relibiFinalExcluded = addMoney(relibiFinalExcluded, gross);
          continue;
        }

        const taxable = holding.qualifyingDividend ? gross * 0.5 : gross;
        primaryCapital = addMoney(primaryCapital, round2(taxable));

        // Foreign withholding on the same income is creditable (ordinary credit).
        // The income is already in the base through `primaryCapital` (after the
        // 50 % qualifying-dividend exemption), so it only feeds the credit slice.
        if ((holding.foreignTax ?? 0) > 0) {
          securitiesCreditIncome = addMoney(securitiesCreditIncome, round2(taxable));
          foreignTaxPaid = addMoney(foreignTaxPaid, holding.foreignTax ?? 0);
          addCreditSlice(
            `holding:${holdingIndex}:${holding.label ?? ''}`,
            round2(taxable),
            holding.foreignTax ?? 0,
          );
        }
      }

      provenance.push({
        ruleCode: 'LIR-ART-97-115-15a-RELIBI',
        description:
          'Securities ledger: 50 % exemption on qualifying dividends, RELIBI 20 % final option, creditable foreign withholding, then the Art. 115 n° 15 tranche',
        sourceFactIds: [],
        formula: 'SUM(taxable per holding) − tranche; RELIBI-final holdings excluded',
        inputs: {
          holdings: params.securities.length,
          relibiFinalExcluded,
          relibiFinalElective: String(params.relibiFinalElective ?? false),
          securitiesCreditIncome,
        },
        outputAmount: primaryCapital,
      });
    }

    // ------------------------------------------- Art. 3ter foreign relief gap
    // The individual branches (pure / reallocation) tax each spouse in Class 1
    // and never apply the exemption-with-progression or the per-spouse ordinary
    // credit, so ANY foreign item makes the result incomplete — including an
    // exemption-method country whose foreign tax is zero, which the older
    // `foreignTaxPaid > 0` warning leaves silent. This runs after both the treaty
    // breakdown and the securities ledger so it covers either source of foreign tax.
    if (
      assessmentMode !== 'COLLECTIVE' &&
      (hasForeignItems || foreignTaxPaid > 0 || exemptForeignIncome > 0)
    ) {
      const foreignReliefGap =
        'Foreign income under Art. 3ter individual assessment (pure or reallocation) is not supported: the per-spouse ordinary credit and exemption-with-progression are not modelled. Use collective assessment or obtain a professional review.';
      unsupported.push(foreignReliefGap);
      warnings.push(foreignReliefGap);
    }

    // Art. 115 n° 15: tranche exemptée, once per household (doubled if collective).
    const capitalTranche = pkg.capitalTrancheExemptee * (isCollective ? 2 : 1);
    const capitalGrossTaxable = round2(primaryCapital + spouseCapital);
    const trancheUsed = Math.min(capitalTranche, capitalGrossTaxable);
    const capitalAfterTranche = Math.max(0, round2(capitalGrossTaxable - trancheUsed));

    if (capitalGrossTaxable > 0) {
      provenance.push({
        ruleCode: 'LIR-ART-115-15',
        description:
          'Capital income tranche exemptée (Art. 115 n° 15): EUR 1 500, doubled only when a couple is assessed collectively',
        sourceFactIds: [],
        formula: 'capital − min(tranche, capital) ; tranche = 1 500 × (collective ? 2 : 1)',
        inputs: { tranche: capitalTranche, capitalGrossTaxable },
        outputAmount: capitalAfterTranche,
      });
    }

    if (primary.qualifyingDividends > 0 || (spouse?.qualifyingDividends ?? 0) > 0) {
      provenance.push({
        ruleCode: 'LIR-ART-115-15a',
        description: '50 % exemption on qualifying dividends (LU / EU parent-subsidiary / DTT fully taxable company)',
        sourceFactIds: [],
        formula: 'taxable = capital − 50 % × qualifying dividends',
        inputs: {
          qualifyingDividends: round2(primary.qualifyingDividends + (spouse?.qualifyingDividends ?? 0)),
        },
        outputAmount: capitalAfterTranche,
      });
    }

    // ------------------------------------------------- income per person
    const toPersonIncome = (p: PersonFacts, rentalNet: number, capitalTaxable: number): PersonIncome => ({
      grossSalary: p.grossSalary,
      socialContributions: p.socialContributions,
      grossPension: p.grossPension,
      capitalIncome: capitalTaxable,
      rentalIncome: rentalNet,
      foreignIncome: excludeForeignIncome ? 0 : p.foreignIncome,
      independentProfit: round2(p.freelanceRevenue - p.businessExpenses),
      actualFraisObtention: p.actualFraisObtention,
      travelUnits: 0,
      invalidityRate: undefined,
    });

    const primaryIncome = toPersonIncome(primary, primaryRental.net, primaryCapital);
    primaryIncome.travelUnits = params.travelUnitsPrimary ?? 0;
    primaryIncome.invalidityRate = params.invalidityRatePrimary;

    const spouseIncome = spouse ? toPersonIncome(spouse, spouseRental.net, spouseCapital) : undefined;
    if (spouseIncome) {
      spouseIncome.travelUnits = params.travelUnitsSpouse ?? 0;
      spouseIncome.invalidityRate = params.invalidityRateSpouse;
    }

    const netOf = (p: PersonIncome): number =>
      round2(
        Math.max(0, p.grossSalary - p.socialContributions) +
          p.grossPension +
          p.capitalIncome +
          p.rentalIncome +
          p.foreignIncome +
          p.independentProfit,
      );

    const primaryNet = netOf(primaryIncome);
    const spouseNet = spouseIncome ? netOf(spouseIncome) : 0;

    // Prime jeune salarié (Art. 115 n° 13d): 75 % exempt, capped by salary band.
    // The exemption is lost on a change of employer, so it is gated on an explicit
    // eligibility flag rather than inferred.
    let primeExemption = 0;
    const primeAmount = Math.max(0, params.youngEmployeePrime ?? 0);
    if (primeAmount > 0 && params.youngEmployeePrimeEligible) {
      const rules = pkg.youngEmployeePrime;
      const band = rules.bands.find((b) => primaryIncome.grossSalary <= b.maxSalary);
      const cap = band ? band.cap : 0;
      primeExemption = round2(Math.min(primeAmount * rules.exemptRate, cap));
      if (primeExemption > 0) {
        provenance.push({
          ruleCode: 'LIR-ART-115-13d',
          description:
            'Prime jeune salarié: 75 % of the prime exempt, capped by the gross-salary band (5 000 / 3 750 / 2 500)',
          sourceFactIds: [],
          formula: 'min(prime × 75 %, band cap)',
          inputs: { prime: primeAmount, grossSalary: primaryIncome.grossSalary, cap },
          outputAmount: primeExemption,
        });
      } else if (primaryIncome.grossSalary > 100_000) {
        warnings.push(
          'Prime jeune salarié: no exemption above EUR 100 000 of gross salary (Art. 115 n° 13d).',
        );
      }
    }

    // Credit-method foreign income is part of the base; exemption-method income is not.
    const netIncome = round2(primaryNet + spouseNet + creditForeignIncome - primeExemption);

    if (primaryIncome.independentProfit < 0 || (spouseIncome && spouseIncome.independentProfit < 0)) {
      provenance.push({
        ruleCode: 'LIR-ART-7-2',
        description: 'Independent loss compensated against the other net-income categories of the same year (Art. 7 al. 2)',
        sourceFactIds: [...primary.factIds, ...(spouse?.factIds ?? [])],
        formula: 'totalRevenusNets = SUM category nets (losses keep their sign)',
        inputs: { primaryNet, spouseNet },
        outputAmount: netIncome,
      });
    }

    // ------------------------------------------------------ plus-values
    let speculationGain = 0;
    let article100Gain = 0;
    let article99terGain = 0;

    for (const gain of params.movableGains ?? []) {
      const profit = gain.proceeds - gain.cost;
      if (profit <= 0) continue;
      if (gain.holdingMonths < pkg.plusValues.movableHoldingMonths) {
        speculationGain = addMoney(speculationGain, profit);
      } else if (gain.participationPercent > pkg.plusValues.substantialParticipation * 100) {
        article100Gain = addMoney(article100Gain, profit);
      }
      // Held > 6 months and not a substantial participation: exempt.
    }

    for (const gain of params.realEstateGains ?? []) {
      if (gain.isPrincipalResidence) continue; // Art. 102bis: exempt
      const profit = gain.proceeds - gain.cost;
      if (profit <= 0) continue;
      if (gain.holdingYears <= pkg.plusValues.realEstateHoldingYears) speculationGain = addMoney(speculationGain, profit);
      else article99terGain = addMoney(article99terGain, profit);
    }

    if (speculationGain > 0 && speculationGain < pkg.plusValues.speculationFloor) {
      speculationGain = 0; // Art. 99bis al. 2
    }

    const abattement = Math.min(
      article100Gain + article99terGain,
      isCollective ? pkg.plusValues.abattementJoint : pkg.plusValues.abattementSingle,
    );
    const extraordinaryGain = Math.max(0, round2(article100Gain + article99terGain - abattement));

    if (speculationGain > 0) {
      provenance.push({
        ruleCode: 'LIR-ART-99bis',
        description: 'Speculative gain taxed at ordinary rates (movable held <= 6 months; real estate held <= 5 years)',
        sourceFactIds: [],
        formula: 'proceeds − cost',
        inputs: { speculationGain },
        outputAmount: speculationGain,
      });
    }
    if (article100Gain + article99terGain > 0) {
      provenance.push({
        ruleCode: 'LIR-ART-100-99ter',
        description:
          'Substantial-participation / long-held real-estate gains: demi-taux global after the Art. 130 al. 4 abattement',
        sourceFactIds: [],
        formula: '(article100 + article99ter − abattement) taxed at half the global rate',
        inputs: {
          article100Gain,
          article99terGain,
          abattement,
        },
        outputAmount: extraordinaryGain,
      });
    }

    const withheld = round2(
      primary.withholdingTax +
        primary.pensionWithholding +
        primary.capitalWithholding +
        (spouse ? spouse.withholdingTax + spouse.pensionWithholding + spouse.capitalWithholding : 0),
    );

    // ---------------------------------------------------- prior losses (114)
    const lossEntries = (params.lossCarryForward ?? []).filter(
      (entry) => entry.amount > 0 && taxYear - entry.year <= 17,
    );
    const priorLossesFromLedger = fromCents(
      sumCents(...lossEntries.map((entry) => toCents(entry.amount))),
    );
    // A ledger, when supplied, is authoritative: taking the larger of the two would let a stale
    // total re-introduce losses the 17-year window has already expired.
    const priorLosses = round2(
      (params.lossCarryForward?.length ?? 0) > 0
        ? priorLossesFromLedger
        : (params.priorYearLosses ?? 0),
    );

    // ------------------------------------------------------------ deductions
    // A second souscripteur must be a second assessed person: a spouse-less
    // filer keeps one contributor however the questionnaire was answered. The
    // deduction applies the same clamp to its own person list.
    const art111bisContributorCount = resolveArt111bisContributors(
      params.art111bisContributors ?? (spouse ? 2 : 1),
      spouse ? 2 : 1,
    );
    if ((params.art111bisContributors ?? 0) > art111bisContributorCount) {
      warnings.push(
        `Art. 111bis: ${params.art111bisContributors} souscripteur(s) declared but only ` +
          `${art111bisContributorCount} assessed person(s); the cap is applied for ` +
          `${art111bisContributorCount} person(s).`,
      );
    }
    const deductionContext: DeductionContext = {
      pkg,
      taxClass,
      assessmentMode,
      primary: primaryIncome,
      spouse: spouseIncome,
      childrenWithModeration: moderationCount,
      art111Declared: art111,
      art111bisDeclared: art111bis,
      art111bisContributors: art111bisContributorCount,
      savingsHousingDeclared: savingsHousing,
      savingsHousingSubscriberAge: params.savingsHousingSubscriberAge,
      lrcpDeclared: lrcp,
      mortgageInterest,
      mortgageFixationYear: params.mortgageFixationYear,
      mortgageBeforeDisposition: params.mortgageBeforeDisposition,
      donationsDeclared: donations,
      extraordinaryChargesDeclared: extraordinaryCharges,
      bothSpousesProfessional: params.bothSpousesProfessional ?? false,
      conjointAidant: params.conjointAidant ?? false,
      spouseRetiredUnder3Years: params.spouseRetiredUnder3Years ?? false,
      priorYearLosses: priorLosses,
      availableIncomeForLosses: netIncome,
      amvpEligible: params.amvpEligible ?? false,
      asrdPrimeUnique: params.asrdPrimeUnique ?? 0,
      asrdSubscriberAge: params.asrdSubscriberAge,
      asrdChildren: params.asrdChildren ?? moderationCount,
      netIncomeForDonationCap: Math.max(0, netIncome),
    };

    if (
      mortgageInterest > 0 &&
      params.mortgageFixationYear === undefined &&
      !params.mortgageBeforeDisposition
    ) {
      warnings.push(
        'Mortgage interest was declared without the year the valeur locative was fixed. The ' +
          'Art. 105 habit_pers schedule cannot be applied without it, so the deduction was ' +
          'refused (0) instead of being granted without limit. Supply mortgageFixationYear ' +
          '(or mortgageBeforeDisposition for a home still under construction).',
      );
    }

    const d = calculateDeductions(deductionContext);

    if (priorLosses > d.priorLossesDeduction + 0.005) {
      warnings.push(
        `Prior-year losses of ${priorLosses.toFixed(2)} exceed what this year's income can ` +
          `offset: ${d.priorLossesDeduction.toFixed(2)} was applied and ` +
          `${(priorLosses - d.priorLossesDeduction).toFixed(2)} stays in the Art. 114 ` +
          'carry-forward.',
      );
    }


    const deductions: DeductionBreakdownDto = {
      fraisObtention: d.fraisObtentionDeduction,
      travel: d.travelDeduction,
      mortgageInterest: d.mortgageInterestDeduction,
      art111: d.art111Deduction,
      asrd: d.asrdDeduction,
      art111bis: d.art111bisDeduction,
      savingsHousing: d.savingsHousingDeduction,
      lrcp: d.lrcpDeduction,
      donations: d.donationsDeduction,
      specialExpensesForfait: d.specialExpensesForfait,
      specialExpensesCovered: round2(
        d.art111Deduction + d.asrdDeduction + d.art111bisDeduction + d.savingsHousingDeduction,
      ),
      specialExpensesTotal: d.specialExpensesDeduction,
      extraordinaryCharges: d.extraordinaryChargesDeduction,
      aep: d.aepDeduction,
      amvp: d.amvpDeduction,
      priorLosses: d.priorLossesDeduction,
      total: d.totalDeductions,
    };

    if (d.asrdDeduction > 0) {
      provenance.push({
        ruleCode: 'LIR-ART-111-ASRD',
        description:
          'Assurance solde restant dû single premium: base majoration 6 000 + 1 200 per child, +8 % per year of age above 30 (max 160 %)',
        sourceFactIds: deductionFactIds,
        formula: 'min(prime, (6000 + 1200 × enfants) × (1 + min(160 %, 8 % × (age − 30))))',
        inputs: { prime: params.asrdPrimeUnique ?? 0, age: params.asrdSubscriberAge ?? 'unset' },
        outputAmount: d.asrdDeduction,
      });
    }

    if (d.aepDeduction > 0) {
      provenance.push({
        ruleCode: 'LIR-ART-129b',
        description:
          'Abattement extra-professionnel (dual professional income / conjoint-aidant / recent pensioner), capped by the lower net professional income',
        sourceFactIds: [],
        formula: 'min(4500 | 2250, lower professional net)',
        inputs: {
          bothSpousesProfessional: String(params.bothSpousesProfessional ?? false),
          conjointAidant: String(params.conjointAidant ?? false),
        },
        outputAmount: d.aepDeduction,
      });
    }

    if (d.art111bisDeduction > 0) {
      provenance.push({
        ruleCode: 'LIR-ART-111bis',
        description: `Third-pillar prévoyance-vieillesse premiums (cap ${pkg.art111bisCapPerPerson} EUR per souscripteur, shared with 111ter)`,
        sourceFactIds: deductionFactIds,
        formula: 'min(declared, capPerPerson × contributors)',
        inputs: { declared: art111bis, cap: pkg.art111bisCapPerPerson, contributors: art111bisContributorCount },
        outputAmount: d.art111bisDeduction,
      });
    }

    if (d.mortgageInterestDeduction > 0) {
      provenance.push({
        ruleCode: 'LIR-ART-98-5-105',
        description:
          'Owner-occupier mortgage interest — frais d’obtention of the valeur locative (Art. 98 al. 1 n° 5 / Art. 105), ACD habit_pers schedule',
        sourceFactIds: deductionFactIds,
        formula: 'min(interest, capByYearsSinceFixation × (1 + conjoint + enfants modérés))',
        inputs: {
          declaredInterest: mortgageInterest,
          fixationYear: params.mortgageFixationYear ?? 'unset',
          multiplier: 1 + (isCollective ? 1 : 0) + moderationCount,
        },
        outputAmount: d.mortgageInterestDeduction,
      });
    }

    if (d.donationsDeduction > 0) {
      provenance.push({
        ruleCode: 'LIR-ART-112',
        description: 'Donations to approved organisations — additive to the special-expenses forfait',
        sourceFactIds: deductionFactIds,
        formula: 'min(declared, 20% × net income, 1 000 000)',
        inputs: { declared: donations },
        outputAmount: d.donationsDeduction,
      });
    }

    // ------------------------------------------------------------ taxable base
    const ordinaryTaxable = Math.max(0, round2(netIncome - d.totalDeductions));

    provenance.push({
      ruleCode: 'LIR-ART-126',
      description: 'Adjusted taxable income (revenu imposable ajusté), floored to €50 before the tariff (Art. 126 al. 2)',
      sourceFactIds: [],
      formula: 'floor50(max(0, netIncome - totalDeductions))',
      inputs: { netIncome, totalDeductions: d.totalDeductions },
      outputAmount: roundRiaDownTo50(ordinaryTaxable),
    });

    // ------------------------------------------------------------------- cote
    const effectiveClass: 'CLASS_1' | 'CLASS_1A' | 'CLASS_2' =
      pkg.singleClass
        ? 'CLASS_1'
        : mixedCoupleCollectiveGranted
          ? 'CLASS_2'
          : taxClass === TaxClass.CLASS_2 && !spouseUserId && !params.class2WithoutSpouse
            ? 'CLASS_1'
            : (taxClass as 'CLASS_1' | 'CLASS_1A' | 'CLASS_2');

    // Pending measures: advertised, sourced, and switched off until publication.
    for (const measure of pkg.pendingMeasures ?? []) {
      if (measure.status === 'IN_FORCE') continue;
      if (measure.id === 'CIC_2026') {
        warnings.push(
          `CIC 2026 not computed: ${measure.source}. Activation is a package edit — ${measure.activation}.`,
        );
      }
    }

    // Épargne-logement: a subscriber above 40 is capped at EUR 672 under current
    // law; the pending 8775 measure would remove that age limit.
    const savingsSubscriberAge = params.savingsHousingSubscriberAge;
    const epargnePending = (pkg.pendingMeasures ?? []).find(
      (m) => m.id === 'EPARGNE_LOGEMENT_8775' && m.status === 'NOT_IN_FORCE',
    );
    if (
      epargnePending &&
      savingsHousing > 0 &&
      savingsSubscriberAge !== undefined &&
      savingsSubscriberAge > pkg.specialExpenses.savingsHousingYoungMaxAge
    ) {
      warnings.push(
        `Épargne-logement capped at ${pkg.specialExpenses.savingsHousingStandard} EUR because the subscriber is over ${pkg.specialExpenses.savingsHousingYoungMaxAge}. Projet de loi 8775 would remove that age limit once in force (${epargnePending.source}).`,
      );
    }
    if (pkg.singleClass) {
      warnings.push(
        `Tax year ${taxYear} uses the single-class ("classe U") preview package: legacy class values are accepted but one tariff applies.`,
      );
      if (spouseUserId && pkg.classUTransition) {
        warnings.push(
          `The ${pkg.classUTransition.years}-year transition for couples already taxed collectively is not applied (parameters not published; method ${pkg.classUTransition.method}).`,
        );
      }
    }
    if (taxClass === TaxClass.CLASS_2 && !spouseUserId && !params.class2WithoutSpouse) {
      warnings.push('Class 2 selected but no spouse is registered in the workspace: taxed as Class 1.');
    }
    if (params.class2WithoutSpouse) {
      if (taxClass !== TaxClass.CLASS_2) {
        warnings.push(
          'Class 2 without spouse requested but the filer is not in Class 2: the flag is ignored.',
        );
      } else if (spouseUserId) {
        warnings.push(
          'Class 2 without spouse requested but a spouse is registered in the workspace: the couple is assessed collectively, so the flag is unnecessary and ignored.',
        );
      }
    }
    if (taxClass === TaxClass.CLASS_1A && !pkg.singleClass) {
      const qualifiesByAge = (params.primaryAge ?? 0) >= 65;
      if (!qualifiesByAge && !params.isSingleParent && moderationCount === 0) {
        warnings.push(
          'Class 1a selected without a 65+ taxpayer on 1 January, a child with modération, or widow status. Verify Art. 119 n° 2.',
        );
      }
    }
    if (
      assessmentMode === 'COLLECTIVE' &&
      spouseUserId &&
      params.spouseEmployedByBusiness
    ) {
      warnings.push(
        'Art. 48 n° 2–3: a Class 2 business cannot deduct the salary or rent paid to the jointly taxed spouse. That amount is not a business expense; it remains taxable salary/rental income in the household.',
      );
    }

    const fondsRateFor = (taxable: number): number => {
      const threshold =
        effectiveClass === 'CLASS_2' ? pkg.solidarity.thresholdClass2 : pkg.solidarity.thresholdClass1;
      return taxable > threshold ? pkg.solidarity.highRate : pkg.solidarity.standardRate;
    };

    let taxCote: number;
    let solidarityAmount: number;
    let taxableForRate: number;
    /** Part of the cote coming from Art. 100 / 99ter gains at the demi-taux. */
    let extraordinaryTaxComputed = 0;
    /** Foreign tax credited against the Luxembourg cote. */
    let foreignTaxCreditComputed = 0;

    if (assessmentMode === 'INDIVIDUAL_PURE' && spouseIncome) {
      const share = (value: number): number => (netIncome <= 0 ? 0 : Math.max(0, value / netIncome));
      const primaryTaxable = Math.max(0, round2(primaryNet - d.totalDeductions * share(primaryNet)));
      const spouseTaxable = Math.max(0, round2(spouseNet - d.totalDeductions * share(spouseNet)));

      const primaryBase = floorEuroToCote(baseTax(primaryTaxable + speculationGain, 'CLASS_1', pkg));
      let extraTax = 0;
      if (extraordinaryGain > 0) {
        const withExtra = floorEuroToCote(
          baseTax(primaryTaxable + speculationGain + extraordinaryGain, 'CLASS_1', pkg),
        );
        extraTax = round2(Math.max(0, withExtra - primaryBase) / 2);
      }
      extraordinaryTaxComputed = extraTax;
      const primaryCote = round2(primaryBase + extraTax);
      const spouseCote = floorEuroToCote(baseTax(spouseTaxable, 'CLASS_1', pkg));

      taxCote = round2(primaryCote + spouseCote);
      solidarityAmount = round2(
        mulRate(toCents(primaryCote), fondsRateFor(primaryTaxable)) / 100 +
          mulRate(toCents(spouseCote), fondsRateFor(spouseTaxable)) / 100,
      );
      taxableForRate = round2(primaryTaxable + spouseTaxable);

      provenance.push({
        ruleCode: 'LIR-ART-3ter-2',
        description: 'Individual assessment (pure): each spouse taxed separately in Class 1',
        sourceFactIds: [],
        formula: 'Tax_1(primary) + Tax_1(spouse)',
        inputs: { primaryTaxable, spouseTaxable },
        outputAmount: taxCote,
      });
    } else if (assessmentMode === 'INDIVIDUAL_REALLOCATION' && spouseIncome) {
      const percent = Math.min(100, Math.max(0, params.reallocationPercentPrimary ?? 50)) / 100;
      const jointRounded = roundRiaDownTo50(ordinaryTaxable);
      const primaryTaxable = round2(jointRounded * percent);
      const spouseTaxable = round2(jointRounded - primaryTaxable);

      const primaryBase = floorEuroToCote(baseTax(primaryTaxable, 'CLASS_1', pkg));
      let extraTax = 0;
      if (extraordinaryGain > 0) {
        const withExtra = floorEuroToCote(baseTax(primaryTaxable + extraordinaryGain, 'CLASS_1', pkg));
        extraTax = round2(Math.max(0, withExtra - primaryBase) / 2);
      }
      extraordinaryTaxComputed = extraTax;
      const primaryCote = round2(primaryBase + extraTax);
      const spouseCote = floorEuroToCote(baseTax(spouseTaxable, 'CLASS_1', pkg));

      taxCote = round2(primaryCote + spouseCote);
      solidarityAmount = round2(
        mulRate(toCents(primaryCote), fondsRateFor(primaryTaxable)) / 100 +
          mulRate(toCents(spouseCote), fondsRateFor(spouseTaxable)) / 100,
      );
      taxableForRate = ordinaryTaxable;

      provenance.push({
        ruleCode: 'LIR-ART-3ter-3',
        description: `Individual assessment with reallocation (${Math.round(percent * 100)} % / ${100 - Math.round(percent * 100)} %) — each spouse in Class 1`,
        sourceFactIds: [],
        formula: 'Tax_1(jointRIA × p) + Tax_1(jointRIA × (1−p))',
        inputs: { primaryTaxable, spouseTaxable },
        outputAmount: taxCote,
      });
    } else {
      const baseForCote = round2(ordinaryTaxable + speculationGain);
      let ordinaryCote = floorEuroToCote(baseTax(baseForCote, effectiveClass, pkg));

      // Exemption with progression: the exempt income raises the rate applied to
      // the Luxembourg base, but is not itself taxed.
      if (exemptForeignIncome > 0) {
        const withExempt = floorEuroToCote(baseTax(baseForCote + exemptForeignIncome, effectiveClass, pkg));
        const denominator = baseForCote + exemptForeignIncome;
        ordinaryCote = denominator > 0 ? round2((withExempt * baseForCote) / denominator) : 0;
      }

      // Ordinary credit: foreign tax credited up to the LU tax on that income.
      // `creditForeignIncome` is the credit-method treaty income (it is added to
      // net income); `securitiesCreditIncome` is already inside the base, so the
      // two are only combined as the slice whose Luxembourg tax is the cap.
      // Ordinary credit per country / per holding, not as one aggregate slice:
      // the aggregate let a high-foreign-tax country take the unused cap of a
      // low-tax one. Each slice is capped at the Luxembourg tax attributable to
      // it (tax on the base minus tax on the base without that slice), and the
      // total can never exceed the Luxembourg cote.
      const slices = [...creditSlices.values()];
      if (slices.length > 0 && foreignTaxPaid > 0 && baseForCote > 0) {
        let credited = 0;
        for (const slice of slices) {
          if (slice.income <= 0 || slice.foreignTax <= 0) continue;
          // Art. 134bis: the Luxembourg tax attributable to a State's income is a
          // fraction of the cote (income / total taxable). Summing marginal
          // differences would give every country the top band and over-credit.
          const sliceCap = ordinaryCote * Math.min(1, slice.income / baseForCote);
          credited += Math.min(slice.foreignTax, sliceCap);
        }
        foreignTaxCreditComputed = round2(Math.min(credited, ordinaryCote, foreignTaxPaid));
      }

      // Extraordinary income (Art. 100 / 99ter): demi-taux global.
      let extraordinaryTax = 0;
      if (extraordinaryGain > 0) {
        const withExtra = floorEuroToCote(baseTax(ordinaryTaxable + speculationGain + extraordinaryGain, effectiveClass, pkg));
        extraordinaryTax = round2(Math.max(0, withExtra - ordinaryCote) / 2);
      }
      extraordinaryTaxComputed = extraordinaryTax;

      taxCote = round2(ordinaryCote + extraordinaryTax);
      // `mulRate` returns cents; convert to euros before adding to the cote
      // (as the two Art. 3ter individual-assessment branches above do).
      solidarityAmount = round2(mulRate(toCents(taxCote), fondsRateFor(ordinaryTaxable)) / 100);
      taxableForRate = round2(ordinaryTaxable + speculationGain + extraordinaryGain);

      provenance.push({
        ruleCode:
          effectiveClass === 'CLASS_2'
            ? 'LIR-ART-118-121'
            : effectiveClass === 'CLASS_1A'
              ? 'LIR-ART-120bis'
              : 'LIR-ART-118',
        description:
          effectiveClass === 'CLASS_2'
            ? 'Base income tax — Class 2 splitting: 2 × Tarif(RIA / 2) (Art. 121)'
            : effectiveClass === 'CLASS_1A'
              ? 'Base income tax — Class 1a reduced base R − (79 380 − R)/4 with marginal caps (Art. 120bis)'
              : 'Base income tax — Class 1 tariff (Art. 118)',
        sourceFactIds: [],
        formula:
          effectiveClass === 'CLASS_2'
            ? '2 × Scale(RIA / 2)'
            : effectiveClass === 'CLASS_1A'
              ? 'Scale(RIA − (79 380 − RIA)/4) with 39/40/41/42 % caps'
              : 'Scale(RIA)',
        inputs: { taxableIncome: ordinaryTaxable, speculationGain, extraordinaryGain, extraordinaryTax },
        outputAmount: taxCote,
      });
    }

    const totalTaxBeforeCredits = round2(taxCote + solidarityAmount);

    // ---------------------------------------------------------------- credits
    const primaryCredits = resolvePerPersonCredits({
      salary: primaryIncome.grossSalary,
      pension: primaryIncome.grossPension,
      independentProfit: primaryIncome.independentProfit,
      pkg,
    });
    if (primaryCredits.note) warnings.push(`Primary filer: ${primaryCredits.note}`);

    const spouseCredits = spouseIncome
      ? resolvePerPersonCredits({
          salary: spouseIncome.grossSalary,
          pension: spouseIncome.grossPension,
          independentProfit: spouseIncome.independentProfit,
          pkg,
        })
      : undefined;
    if (spouseCredits?.note) warnings.push(`Spouse: ${spouseCredits.note}`);

    let cimAmount = 0;
    if (
      taxClass === TaxClass.CLASS_1A &&
      params.isSingleParent &&
      moderationCount > 0 &&
      !params.bothParentsSameHome
    ) {
      const ria = roundRiaDownTo50(ordinaryTaxable);
      cimAmount = cimFor(ria, params.childAllocations ?? 0, pkg);
      if (cimAmount > 0) {
        provenance.push({
          ruleCode: 'LIR-ART-154ter',
          description: 'Single-parent tax credit (CIM) — refundable, reduced by 50 % of allocations above the threshold',
          sourceFactIds: [],
          formula: 'CIM(RIA) − 50 % × max(0, allocations − 2 712)',
          inputs: { ria, allocations: params.childAllocations ?? 0 },
          outputAmount: cimAmount,
        });
      }
    } else if (taxClass === TaxClass.CLASS_1A && params.bothParentsSameHome) {
      warnings.push('CIM not granted: both parents share the same home as the child (Art. 154ter).');
    }

    // Start-up investment credit (2026+).
    const startupInvestment = Math.min(
      Math.max(0, params.startupInvestment ?? 0),
      pkg.startupCredit.maxInvestment,
    );
    const startupCredit = round2(startupInvestment * pkg.startupCredit.rate);
    if (startupCredit > 0) {
      provenance.push({
        ruleCode: 'LIR-STARTUP-CREDIT',
        description: 'Credit for resident investors in eligible start-ups (2026): 20 % of the investment, cap EUR 100 000',
        sourceFactIds: [],
        formula: '20 % × min(investment, 100 000)',
        inputs: { investment: startupInvestment },
        outputAmount: startupCredit,
      });
    }

    if (foreignTaxPaid > 0 && foreignTaxCreditComputed === 0 && assessmentMode !== 'COLLECTIVE') {
      warnings.push(
        'Foreign tax credit is only computed under collective assessment; individual assessment modes ignore it.',
      );
    }

    const cissmAmount = round2(
      cissmForSalary(primaryIncome.grossSalary, pkg) + (spouseIncome ? cissmForSalary(spouseIncome.grossSalary, pkg) : 0),
    );
    if (cissmAmount > 0) {
      provenance.push({
        ruleCode: 'LIR-CISSM',
        description: 'Crédit d’impôt salaire social minimum: EUR 70/month for a monthly salary of 1 800–3 000, linear to 3 600',
        sourceFactIds: [],
        formula: 'annualised monthly credit (x12)',
        inputs: { primarySalary: primaryIncome.grossSalary },
        outputAmount: cissmAmount,
      });
    }

    const cicAmount = round2(
      cicForSalary(primaryIncome.grossSalary, pkg) +
        (spouseIncome ? cicForSalary(spouseIncome.grossSalary, pkg) : 0),
    );
    if (cicAmount > 0) {
      provenance.push({
        ruleCode: 'LIR-CIC',
        description: 'Crédit d’impôt conjoncture: published monthly table, annualised (x12)',
        sourceFactIds: [],
        formula: 'SUM(piecewise-linear monthly band) x 12',
        inputs: { primarySalary: primaryIncome.grossSalary },
        outputAmount: cicAmount,
      });
    }

    const credits: CreditBreakdownDto = {
      startup: startupCredit,
      foreignTaxCredit: foreignTaxCreditComputed,
      cissm: cissmAmount,
      cic: cicAmount,
      cis: round2(primaryCredits.cis + (spouseCredits?.cis ?? 0)),
      ciCo2Salary: round2(primaryCredits.ciCo2 + (spouseCredits?.ciCo2 ?? 0)),
      cip: round2(primaryCredits.cip + (spouseCredits?.cip ?? 0)),
      ciCo2Pension: round2(primaryCredits.cipCo2 + (spouseCredits?.cipCo2 ?? 0)),
      cii: round2(primaryCredits.cii + (spouseCredits?.cii ?? 0)),
      ciCo2Independant: round2(primaryCredits.ciiCo2 + (spouseCredits?.ciiCo2 ?? 0)),
      cim: cimAmount,
      cimApplied: 0,
      cimRefund: 0,
      total: 0,
    };
    credits.total = round2(
      credits.startup +
        credits.foreignTaxCredit +
        credits.cissm +
        credits.cic +
        credits.cis +
        credits.ciCo2Salary +
        credits.cip +
        credits.ciCo2Pension +
        credits.cii +
        credits.ciCo2Independant +
        credits.cim,
    );

    if (credits.total > 0) {
      provenance.push({
        ruleCode: 'LIR-ART-152ter-154quater',
        description:
          'Salary, pension, independent, single-parent and start-up credits (per person, non-cumulative within a person)',
        sourceFactIds: [],
        formula: 'SUM per-person credits (CIS xor CIP xor CII) + CIM + start-up',
        inputs: {
          cis: credits.cis,
          ciCo2Salary: credits.ciCo2Salary,
          cip: credits.cip,
          cii: credits.cii,
          cim: credits.cim,
          startup: credits.startup,
        },
        outputAmount: credits.total,
      });
    }

    // Art. 154ter al. 2: the CIM is the only refundable credit here. It is
    // imputed on the tax still due after the other credits, and the excess is
    // paid back to the taxpayer instead of being lost. Every other credit is
    // non-refundable, so the two groups cannot be summed into one subtraction.
    const nonRefundableCredits = round2(credits.total - credits.cim);
    const taxAfterNonRefundable = Math.max(0, round2(totalTaxBeforeCredits - nonRefundableCredits));
    const cimApplied = Math.min(credits.cim, taxAfterNonRefundable);
    const cimRefund = round2(Math.max(0, credits.cim - cimApplied));
    credits.cimApplied = round2(cimApplied);
    credits.cimRefund = cimRefund;

    if (cimRefund > 0) {
      provenance.push({
        ruleCode: 'LIR-ART-154ter-refund',
        description: 'CIM refundable portion paid out (Art. 154ter al. 2)',
        sourceFactIds: [],
        formula: 'max(0, CIM - min(CIM, tax after non-refundable credits))',
        inputs: { cim: credits.cim, cimApplied, cimRefund, taxAfterNonRefundable },
        outputAmount: cimRefund,
      });
    }

    // ------------------------------------- Art. 122 / 123bis child relief
    // Child relief is not a credit: it is imputed on the tax still due after the
    // credits, and it can never turn the liability negative (non-refundable).
    const taxAfterCredits = Math.max(0, round2(taxAfterNonRefundable - cimApplied));

    // Art. 122: the dégrèvement replaces the family allowance (CAE /
    // Zukunftskeess), CEDIES or SNJ aid and is granted per child, only for the
    // moderated children for which none was paid. `childBenefitReceived` is the
    // all-or-nothing fallback (default true, so the relief is never automatic);
    // the explicit count takes precedence and can never exceed the moderated
    // children.
    const degrevementChildren = childReliefResolution
      ? childReliefResolution.degrevementChildren
      : Math.min(
          moderationCount,
          countOf(
            moderatedChildrenWithoutBenefit ??
              (childBenefitReceived === false ? moderationCount : 0),
          ),
        );
    const degrevement = degrevementForChildren(degrevementChildren, taxAfterCredits, pkg.childRelief);
    const remainingAfterDegrevement = Math.max(0, round2(taxAfterCredits - degrevement));

    // Art. 123bis: a child whose moderation right expired cannot generate a
    // dégrèvement in the same year, so the caller reports the two counts
    // separately; their sum drives the six-child cap lift. Household dependants
    // are not relief children and do not count.
    const riaForBonification = roundRiaDownTo50(ordinaryTaxable);
    const reliefChildren = moderationCount + bonificationCount;
    const bonificationComputed = bonificationForChildren(
      bonificationCount,
      riaForBonification,
      reliefChildren,
      pkg.childRelief,
    );
    const bonification = Math.min(bonificationComputed, remainingAfterDegrevement);
    const childReliefTotal = round2(degrevement + bonification);

    if (degrevement > 0) {
      provenance.push({
        ruleCode: 'LIR-ART-122',
        description:
          'Dégrèvement d’impôt pour enfant (Art. 122): no family allowance, CEDIES or SNJ aid was paid for the moderated children counted here, so the relief is granted on request and imputed on the tax still due',
        sourceFactIds: [],
        formula: 'min(children × amountPerChild, tax still due)',
        inputs: {
          children: degrevementChildren,
          amountPerChild: pkg.childRelief.amountPerChild,
          taxAfterCredits,
        },
        outputAmount: degrevement,
      });
    }

    if (bonification > 0) {
      provenance.push({
        ruleCode: 'LIR-ART-123bis',
        description:
          'Bonification d’impôt pour enfant (Art. 123bis): moderation right expired, (76 600 − RIA)/10 phase-out for up to five children, income cap lifted from six',
        sourceFactIds: [],
        formula: 'min(children × min(amountPerChild, (zeroFrom − RIA)/10), tax still due)',
        inputs: {
          children: bonificationCount,
          reliefChildren,
          ria: riaForBonification,
          amountComputed: bonificationComputed,
          taxAfterDegrevement: remainingAfterDegrevement,
        },
        outputAmount: bonification,
      });
    }

    // A child can generate only one of the two reliefs. With bare counts the
    // engine cannot tell which child is which, so it warns when both counts are
    // populated and their sum exceeds the declared household size (when none is
    // declared, any overlap of the two counts is suspicious). `dependantsCount`
    // is only a plausibility check here; it never drives the relief amounts.
    const declaredChildren = countOf(dependantsCount);
    if (
      childReliefResolution === null &&
      moderationCount > 0 &&
      bonificationCount > 0 &&
      moderationCount + bonificationCount > Math.max(declaredChildren, 1)
    ) {
      warnings.push(
        'The same child cannot generate both a dégrèvement (Art. 122) and a bonification (Art. 123bis) in the same tax year: the moderation count plus the bonification count exceeds the number of children declared. Verify that no child is counted twice.',
      );
    }

    // --------------------------------------------------------------- balance
    const finalTaxLiability = Math.max(0, round2(taxAfterCredits - childReliefTotal));
    // The refundable CIM excess is paid out, so it deepens a refund. It can only
    // exist when the tax due is already covered, so it never offsets tax payable.
    const balancePayableOrRefund = round2(finalTaxLiability - withheld - cimRefund);

    if (withheld > 0 || cimRefund > 0) {
      provenance.push({
        ruleCode: 'LIR-ART-154',
        description:
          'Reconciliation with tax withheld at source (retenue d’impôt), prepayments and the refundable CIM',
        sourceFactIds: [...primary.factIds, ...(spouse?.factIds ?? [])],
        formula: 'finalTaxLiability − taxWithheldAtSource − cimRefund',
        inputs: { finalTaxLiability, withheld, cimRefund },
        outputAmount: balancePayableOrRefund,
      });
    }

    if (primaryIncome.grossSalary === 0 && primaryIncome.grossPension === 0 && primaryIncome.independentProfit <= 0) {
      warnings.push('No salary, pension or independent profit recorded for the primary filer: tax liability may be 0.');
    }
    if (params.bothSpousesProfessional && !spouseUserId) {
      warnings.push('AEP requested but no spouse is registered in the workspace.');
    }

    const freelanceNet = round2(primaryIncome.independentProfit + (spouseIncome?.independentProfit ?? 0));

    // Art. 123bis: report whether the EUR 67 400-76 600 RIA band actually reduced
    // the per-child bonification. The six-child cap lift and a cut caused only by
    // the remaining tax due are both "not phased out".
    const bonificationPhaseOut =
      bonificationCount > 0 &&
      reliefChildren < pkg.childRelief.capLiftedFromChildren &&
      riaForBonification >= pkg.childRelief.bonificationPhaseOutFrom &&
      riaForBonification <= pkg.childRelief.bonificationZeroFrom;

    return {
      taxYear,
      taxClass,
      rulePackageVersion: pkg.version,
      assessmentMode,
      class2WithoutSpouse: Boolean(params.class2WithoutSpouse),
      youngEmployeePrimeExemption: primeExemption,
      grossIncome: round2(
        primary.grossSalary +
          primary.freelanceRevenue +
          primary.grossPension +
          (spouse ? spouse.grossSalary + spouse.freelanceRevenue + spouse.grossPension : 0),
      ),
      netIncome,
      totalDeductions: d.totalDeductions,
      deductions,
      taxableIncome: ordinaryTaxable,
      baseTax: taxCote,
      solidaritySurchargeRate: fondsRateFor(ordinaryTaxable),
      solidaritySurchargeAmount: solidarityAmount,
      totalTaxBeforeCredits,
      credits,
      totalTaxCredits: credits.total,
      childRelief: {
        degrevement,
        bonification,
        total: childReliefTotal,
        eligibleChildren: degrevementChildren,
        bonificationChildren: bonificationCount,
        bonificationPhaseOut,
      },
      finalTaxLiability,
      taxWithheldAtSource: withheld,
      balancePayableOrRefund,
      effectiveTaxRate: taxableForRate > 0 ? round2((finalTaxLiability / taxableForRate) * 100) : 0,
      marginalRate: marginalRate(roundRiaDownTo50(ordinaryTaxable), pkg),
      freelanceIncomeBreakdown: {
        primaryGrossRevenue: round2(primary.freelanceRevenue),
        primaryBusinessExpenses: round2(primary.businessExpenses),
        primaryNetProfit: round2(primary.freelanceRevenue - primary.businessExpenses),
        spouseGrossRevenue: round2(spouse?.freelanceRevenue ?? 0),
        spouseBusinessExpenses: round2(spouse?.businessExpenses ?? 0),
        spouseNetProfit: round2((spouse?.freelanceRevenue ?? 0) - (spouse?.businessExpenses ?? 0)),
        totalFreelanceNetProfit: freelanceNet,
      },
      plusValues: {
        speculation: round2(speculationGain),
        article100: round2(article100Gain),
        article99ter: round2(article99terGain),
        abattement: round2(abattement),
        taxableExtraordinary: extraordinaryGain,
        tax: extraordinaryTaxComputed,
      },
      rental: {
        gross: round2(primary.rentalGross + (spouse?.rentalGross ?? 0)),
        charges: round2(primary.rentalCharges + (spouse?.rentalCharges ?? 0)),
        net: round2(primaryRental.net + spouseRental.net),
        forfaitApplied: primaryRental.forfait || spouseRental.forfait,
        socialExemption: round2(primaryRental.exemption + spouseRental.exemption),
      },
      nonResident: nonResidentInfo,
      provenance,
      warnings,
      unsupported,
      calculatedAt: new Date().toISOString(),
    };
  }
}
