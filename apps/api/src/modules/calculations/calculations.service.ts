import { Injectable, NotFoundException, BadRequestException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { normalizeStoredCalculation } from './calculation-snapshot';
import { AuditService } from '../audit/audit.service';
import { ReturnApprovalsService } from '../filing/return-approvals.service';
import {
  TaxCalculationResultDto,
  TaxClass,
  TaxResidence,
  AuditEventType,
  WorkspaceStatus,
  QuestionnaireAnswersDto,
  DocumentVisibility,
  AssessmentMode,
  ScenarioComparisonDto,
} from '@luxtax/contracts';
import {
  LuxembourgTaxEngine,
  isSupportedTaxYear,
  resolveChildReliefHistory,
  SUPPORTED_TAX_YEARS,
} from '@luxtax/tax-engine';
import { Prisma } from '@prisma/client';
import { hashCalculationResult } from './calculation-history';
import {
  deriveIsSingleParent,
  deriveTaxClass,
  classWindowWarning,
  isScenarioComparisonEligible,
  selectFilerMembers,
  shouldPersist,
  spouseEndsAtEvent,
} from './class-resolution';

/** Art. 119 n° 3 b–c: a stale ACTIVE household member is not a current spouse. */
const FORMER_SPOUSE_WARNING =
  'A former/deceased spouse is still another ACTIVE household member (possibly the PRIMARY_FILER); the calculation excludes that member because the taxpayer is widowed/divorced.';

/** Keep a two-decimal delta free of float noise (e.g. 0.30000000000000004). */
const roundMoney = (value: number): number => Math.round(value * 100) / 100;

@Injectable()
export class CalculationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly returnApprovals: ReturnApprovalsService,
  ) {}

  /**
   * Read and validate one workspace snapshot: only return-eligible facts
   * (manual facts plus documents proposed/included for the return), never
   * private drafts. The persisted calculation and every comparison run read
   * through this same query, so they cannot diverge in what they select.
   */
  private async loadWorkspace(workspaceId: string) {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
      include: {
        household: {
          include: {
            members: { where: { status: 'ACTIVE' } },
            dependants: true,
          },
        },
        confirmedFacts: {
          where: {
            isIncludedInReturn: true,
            // Only manual facts and facts whose source document is explicitly
            // proposed for, or included in, the return may feed the joint
            // calculation. Private drafts and shared discussion documents do
            // not, even if a stale flag says otherwise.
            OR: [
              { sourceDocumentId: null },
              {
                sourceDocument: {
                  is: {
                    visibility: {
                      in: [
                        DocumentVisibility.PROPOSED_FOR_RETURN,
                        DocumentVisibility.INCLUDED_IN_RETURN,
                      ],
                    },
                  },
                },
              },
            ],
          },
        },
        taxProfile: true,
      },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    if (!isSupportedTaxYear(workspace.taxYear)) {
      throw new BadRequestException(
        `No tax rule package for ${workspace.taxYear}. Supported years: ${SUPPORTED_TAX_YEARS.join(', ')}.`,
      );
    }

    return workspace;
  }

  async calculateTax(
    workspaceId: string,
    actorId: string,
    ipAddress?: string,
    options?: { assessmentMode?: AssessmentMode; persist?: boolean },
  ): Promise<TaxCalculationResultDto> {
    // A comparison run still reads and validates the workspace; only the write
    // and the audit event are skipped.
    const workspace = await this.loadWorkspace(workspaceId);

    const answers = (workspace.taxProfile?.answersJson ?? {}) as Partial<QuestionnaireAnswersDto>;
    const members = workspace.household.members;
    // A second ACTIVE membership is not automatically a spouse: only a CO_FILER
    // files jointly. A VIEWER, or any other non-filer role, must not be read as a
    // spouse, otherwise a read-only or stale member restores the couple's
    // collective extras for a Class 2 filer who has none. The acting user leads
    // the selection so a co-filer who is the surviving or divorced spouse does
    // not compute on the deceased/former spouse's income as primary.
    const selection = selectFilerMembers(members, actorId);
    const primaryMember =
      members.find((member) => member.userId === selection.primaryUserId) ?? null;
    const selectedSpouseMember =
      members.find((member) => member.userId === selection.spouseUserId) ?? null;
    const primaryUserId = primaryMember?.userId ?? null;

    // Resolve the household situation once: the class, the Art. 154ter default
    // and the CIM gate must all read the same status and child count, otherwise
    // a status held only on the tax profile (or a child known only through the
    // household dependants) yields Class 1a without the CIM, or the reverse.
    const maritalStatus = workspace.taxProfile?.maritalStatus ?? answers.maritalStatus;

    // A membership cannot be ended through the household API, so a marriage that
    // ended by death or divorce leaves the former spouse's row ACTIVE CO_FILER.
    // A WIDOWED or DIVORCED taxpayer has no current spouse by definition — the
    // event year only bounds the Art. 119 n° 3 Class 2 window — so that row is
    // never a spouse for this calculation, with or without a year. Keeping it
    // would hand the engine a spouse id and restore the couple's collective
    // extras (double capital tranche, couple deduction multiplier, AEP) for a
    // filer assessed alone. The role stays as it is; only this calculation
    // ignores it.
    const spouseIsFormer = spouseEndsAtEvent(maritalStatus, answers, workspace.taxYear);
    const spouseMember = spouseIsFormer ? null : selectedSpouseMember;
    const spouseUserId = spouseMember?.userId ?? null;

    // The questionnaire says "same as dependants" for the moderated-child field,
    // so a blank answer falls back to the household dependants. The class must
    // use that same count — not the raw answers.
    // A per-child history is authoritative: only it knows which children are
    // moderated *this year*, so class resolution, CIM and the deduction caps must
    // use its count rather than the scalar fallback.
    const historyModerationCount =
      (answers.childReliefHistory?.length ?? 0) > 0
        ? resolveChildReliefHistory(
            answers.childReliefHistory as NonNullable<typeof answers.childReliefHistory>,
            workspace.taxYear,
          ).moderationCount
        : undefined;
    const childrenWithModeration =
      historyModerationCount ??
      answers.childrenWithModeration ??
      (answers.childrenCount && answers.childrenCount > 0
        ? answers.childrenCount
        : workspace.household.dependants.length);

    // A stored class must not override the current questionnaire: `calculateTax`
    // persists the resolved class after every run, so a persisted value is never
    // an explicit user choice. Re-resolve from today's answers instead, and keep
    // the stored class only for a workspace that has no tax profile (and thus no
    // questionnaire) yet.
    const taxClass = deriveTaxClass(
      workspace.taxProfile ? null : (workspace.taxClass as TaxClass | null),
      maritalStatus,
      answers,
      childrenWithModeration,
      workspace.taxYear,
    );

    // Art. 119 n° 3 b–c: a widow(er) or divorced filer in the three-year window
    // keeps Class 2 although the deceased/former spouse is no longer a household
    // member. The Class 2 tariff then applies, but the couple's collective extras
    // (double capital tranche, couple deduction multiplier) must not.
    const class2WithoutSpouse =
      taxClass === TaxClass.CLASS_2 &&
      !spouseUserId &&
      (maritalStatus === 'WIDOWED' || maritalStatus === 'DIVORCED');

    // LEG-8: only a married Class 2 couple with an assessed spouse has three
    // legally distinct scenarios. `spouseMember` is that assessed spouse — null
    // for a widow(er), a divorced filer (even one keeping Class 2 under Art. 119
    // n° 3) and a married filer without a joined CO_FILER — so those households
    // cannot report the three identical runs as comparable.
    const comparisonEligible = isScenarioComparisonEligible(
      maritalStatus,
      taxClass,
      Boolean(spouseMember),
    );

    const factsInput = workspace.confirmedFacts.map((f) => ({
      id: f.id,
      ownerId: f.ownerId,
      category: f.category,
      fieldKey: f.fieldKey,
      amount: Number(f.amount),
      sourceDocumentId: f.sourceDocumentId,
    }));

    const result = LuxembourgTaxEngine.calculate({
      taxYear: workspace.taxYear,
      taxClass,
      residence: workspace.residenceStatus as TaxResidence,
      facts: factsInput,
      primaryUserId: primaryUserId ?? actorId,
      spouseUserId,
      dependantsCount: workspace.household.dependants.length,
      class2WithoutSpouse,

      // Household profile inputs
      // A comparison run overrides the stored election; the workspace is untouched.
      assessmentMode: options?.assessmentMode ?? answers.assessmentMode,
      reallocationPercentPrimary: answers.reallocationPercentPrimary,
      primaryAge: answers.primaryAge,
      spouseAge: answers.spouseAge,
      childrenWithModeration,
      bothParentsSameHome: answers.bothParentsSameHome,
      childAllocations: answers.childAllocations,
      childBenefitReceived: answers.childBenefitReceived,
      moderatedChildrenWithoutBenefit: answers.moderatedChildrenWithoutBenefit,
      childrenWithBonification: answers.childrenWithBonification,
      childReliefHistory: answers.childReliefHistory,
      bothSpousesProfessional: answers.spouseHasProfessionalIncome ?? false,
      conjointAidant: answers.spouseIsConjointAidant ?? false,
      spouseRetiredUnder3Years: answers.spouseRetiredUnder3Years ?? false,
      mortgageFixationYear: answers.mortgageOccupancyYear,
      mortgageBeforeDisposition: answers.mortgageBeforeDisposition,
      travelUnitsPrimary: answers.travelUnitsPrimary,
      travelUnitsSpouse: answers.travelUnitsSpouse,
      invalidityRatePrimary: answers.invalidityRatePrimary,
      invalidityRateSpouse: answers.invalidityRateSpouse,
      // Art. 111bis: a spouse-less filer has a single souscripteur, so a stale
      // "2" from a couple questionnaire cannot double the cap. The engine
      // clamps to the assessed persons as the second line of defence.
      art111bisContributors: spouseUserId ? answers.art111bisContributors : 1,
      savingsHousingSubscriberAge: answers.savingsHousingSubscriberAge,
      priorYearLosses: answers.priorYearLosses,
      lossCarryForward: answers.lossCarryForward,
      spouseResidence: answers.spouseResidence,
      mixedCoupleCollectiveRequested: answers.mixedCoupleCollectiveRequested,
      amvpEligible: answers.amvpEligible,
      // Art. 154ter: the CIM gate follows the household, not only the never-married
      // status. A divorced or widowed parent in Class 1a with a moderated child is
      // the typical claimant. An explicit answer (including `false`) wins.
      isSingleParent: deriveIsSingleParent(maritalStatus, childrenWithModeration, answers.isSingleParent),
      spouseEmployedByBusiness: answers.spouseEmployedByBusiness ?? false,
      rentalForfaitEligible: answers.rentalForfaitEligible ?? false,
      rentalSocial: answers.rentalSocial ?? false,
      asrdPrimeUnique: answers.asrdPrimeUnique,
      asrdSubscriberAge: answers.asrdSubscriberAge,
      asrdChildren: answers.asrdChildren,
      startupInvestment: answers.startupInvestment,
      // Single-row plus-values entry mirroring the questionnaire.
      movableGains:
        answers.movableGainProceeds && answers.movableGainProceeds > 0
          ? [{
              proceeds: answers.movableGainProceeds,
              cost: answers.movableGainCost ?? 0,
              holdingMonths: answers.movableGainHoldingMonths ?? 12,
              participationPercent: answers.movableGainParticipationPercent ?? 0,
            }]
          : undefined,
      realEstateGains:
        answers.realEstateGainProceeds && answers.realEstateGainProceeds > 0
          ? [{
              proceeds: answers.realEstateGainProceeds,
              cost: answers.realEstateGainCost ?? 0,
              holdingYears: answers.realEstateGainHoldingYears ?? 10,
              isPrincipalResidence: answers.realEstateGainPrincipalResidence ?? false,
            }]
          : undefined,
      youngEmployeePrime: answers.youngEmployeePrime,
      youngEmployeePrimeEligible: answers.youngEmployeePrimeEligible ?? false,
      relibiFinalElective: answers.relibiFinalElective ?? false,
      securities:
        answers.securitiesGrossIncome && answers.securitiesGrossIncome > 0
          ? [{
              grossIncome: answers.securitiesGrossIncome,
              qualifyingDividend: answers.securitiesQualifying ?? false,
              foreignTax: answers.securitiesForeignTax ?? 0,
              relibiWithheld: answers.securitiesRelibiWithheld ?? 0,
            }]
          : undefined,
      rentalProperties:
        answers.rentalGrossRent && answers.rentalGrossRent > 0
          ? [{
              grossRent: answers.rentalGrossRent,
              charges: answers.rentalCharges ?? 0,
              purchasePrice: answers.rentalPurchasePrice,
              completionYear: answers.rentalCompletionYear,
              energyRenovationAmount: answers.rentalEnergyRenovationAmount,
              interest: answers.rentalInterest ?? 0,
            }]
          : undefined,
      // One foreign income row -> treaty method.
      foreignIncomeItems:
        answers.foreignAmount && answers.foreignAmount > 0
          ? [{
              country: answers.foreignCountry ?? 'FR',
              amount: answers.foreignAmount,
              foreignTax: answers.foreignTax ?? 0,
            }]
          : undefined,
      nonResidentAssimilation: answers.nonResidentAssimilation,
      worldwideIncome: answers.worldwideIncome,
      luxembourgProfessionalIncome: answers.luxembourgProfessionalIncome,
      householdProfessionalIncome: answers.householdProfessionalIncome,
      foreignNetIncome: answers.foreignNetIncome,
    });

    // Art. 119 n° 3 b–c: when the questionnaire has no death/divorce year the
    // three-year Class 2 window cannot be checked, so the default class is applied
    // with an explicit warning instead of silently.
    const classWarning = classWindowWarning(maritalStatus, answers);
    if (classWarning) result.warnings.push(classWarning);

    // The former/deceased spouse's membership is household data, not a selection
    // bug: say explicitly that the calculation left it out.
    if (spouseIsFormer && selectedSpouseMember) {
      result.warnings.push(FORMER_SPOUSE_WARNING);
    }

    // The DTO carries one API-level fact the pure engine cannot know: whether the
    // household has three legally distinct scenarios. Spread rather than assign so
    // a frozen engine result is never mutated.
    const calculation: TaxCalculationResultDto = { ...result, comparisonEligible };

    // A comparison run must not overwrite the stored result or leave an event
    // that reads like a filed election: `persist: false` skips both writes while
    // the read, the validation and the mapping above still run.
    if (shouldPersist(options)) {
      // API-6: a filed return is a frozen snapshot. Recalculating would leave the
      // stored figures diverging from what the ACD received, so the write is
      // refused before anything is persisted; a correction starts an amendment.
      if (workspace.status === WorkspaceStatus.FILED) {
        throw new BadRequestException('Filed return is frozen; start an amendment instead');
      }

      // API-9: the workspace keeps the latest result for reads; every calculation
      // also lands in an append-only snapshot so earlier figures survive.
      await this.prisma.calculationSnapshot.create({
        data: {
          workspaceId,
          taxYear: calculation.taxYear,
          taxClass,
          rulePackageVersion: calculation.rulePackageVersion,
          resultSha256: hashCalculationResult(calculation),
          resultJson: calculation as any,
          createdById: actorId,
        },
      });

      await this.prisma.taxYearWorkspace.update({
        where: { id: workspaceId },
        data: {
          taxClass,
          estimatedTaxBalance: new Prisma.Decimal(result.balancePayableOrRefund),
          calculationResult: calculation as any,
          status:
            workspace.status === WorkspaceStatus.DRAFT ||
            workspace.status === WorkspaceStatus.COLLECTING ||
            workspace.status === WorkspaceStatus.NEEDS_REVIEW
              ? WorkspaceStatus.CALCULATED
              : workspace.status,
        },
      });

      await this.auditService.logEvent({
        householdId: workspace.householdId,
        workspaceId,
        actorId,
        eventType: AuditEventType.TAX_CALCULATED,
        entityType: 'TaxCalculation',
        entityId: workspaceId,
        newValue: {
          taxYear: result.taxYear,
          taxClass: result.taxClass,
          rulePackageVersion: result.rulePackageVersion,
          assessmentMode: result.assessmentMode,
          taxableIncome: result.taxableIncome,
          finalTaxLiability: result.finalTaxLiability,
          balance: result.balancePayableOrRefund,
          unsupported: result.unsupported,
        },
        description: `Calculated ${result.taxYear} tax (${result.taxClass}/${result.assessmentMode}) with rules ${result.rulePackageVersion}: balance = ${result.balancePayableOrRefund} EUR`,
        ipAddress,
      });

      // A persisted recalculation replaces the numbers a previous approval
      // covered, so that approval must not survive it: the result is stored
      // first, then the workspace moves to NEEDS_REVIEW and a new version opens.
      // A comparison run never reaches this block (`persist: false`).
      await this.returnApprovals.invalidateForChange(
        workspaceId,
        actorId,
        'Tax calculation recalculated',
        ipAddress,
      );
    }

    return calculation;
  }

  /**
   * Art. 3 / 3bis vs Art. 3ter: one action returns the same household's tax
   * under (a) collective Class 2, (b) 2× Class 1 (pure) and (c) the Art. 3ter
   * reallocation, with the deltas and the shared rule-package version.
   *
   * Every run is non-persisting: it neither overwrites the workspace result
   * nor audits, so the comparison cannot be mistaken for a filing election.
   */
  async compareScenarios(workspaceId: string, actorId: string): Promise<ScenarioComparisonDto> {
    const collective = await this.calculateTax(workspaceId, actorId, undefined, {
      assessmentMode: 'COLLECTIVE',
      persist: false,
    });
    const individualPure = await this.calculateTax(workspaceId, actorId, undefined, {
      assessmentMode: 'INDIVIDUAL_PURE',
      persist: false,
    });
    const individualReallocation = await this.calculateTax(workspaceId, actorId, undefined, {
      assessmentMode: 'INDIVIDUAL_REALLOCATION',
      persist: false,
    });

    // Only a married Class 2 couple with an assessed spouse has a collective
    // assessment to compare against. A widow(er) or divorced filer keeping Class
    // 2, a married filer without a joined CO_FILER and a PACS couple resolve all
    // three runs to collective: the results exist but are identical, so the UI
    // must not offer a table.
    const comparable = collective.comparisonEligible === true;

    const warnings: string[] = [];
    const seen = new Set<string>();
    for (const run of [collective, individualPure, individualReallocation]) {
      for (const warning of [...run.warnings, ...run.unsupported]) {
        if (!seen.has(warning)) {
          seen.add(warning);
          warnings.push(warning);
        }
      }
    }
    if (!comparable) {
      warnings.push(
        'Only a married Class 2 couple with an assessed spouse has three legally distinct scenarios. This household does not, so the three runs apply the same collective rules and the table would be misleading.',
      );
    }

    return {
      taxYear: collective.taxYear,
      rulePackageVersion: collective.rulePackageVersion,
      collective,
      individualPure,
      individualReallocation,
      deltaCollectiveVsIndividual: roundMoney(
        collective.finalTaxLiability - individualPure.finalTaxLiability,
      ),
      deltaCollectiveVsReallocation: roundMoney(
        collective.finalTaxLiability - individualReallocation.finalTaxLiability,
      ),
      comparable,
      warnings,
    };
  }

  async getLatestCalculation(workspaceId: string): Promise<TaxCalculationResultDto | null> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace || !workspace.calculationResult) {
      return null;
    }

    // A snapshot stored by an earlier model version may predate
    // `specialExpensesCovered` or the CIM split. Reconstruct only what the
    // stored numbers determine, and leave the rest for the UI to label as a
    // stale estimate — never invent a line the result does not support.
    const normalized = normalizeStoredCalculation(workspace.calculationResult);
    return normalized ? normalized.calculation : null;
  }
}
