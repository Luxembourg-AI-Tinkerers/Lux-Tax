import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { assertFilingYearAllowed, FilingPackageNotAllowedError } from './filing-year-guard';
import {
  appendPackageEvidence,
  assertPackageRegenerationAllowed,
  FilingPackageImmutableError,
  type PackageEvidenceEntry,
} from './filing-package-evidence';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  TaxClass,
  HouseholdRole,
  AuditEventType,
  WorkspaceStatus,
  ReturnVersionDto,
  FilingPackageDto,
  AssessmentDto,
  FilingRecordDto,
  CreateFilingRecordDto,
  UpdateAssessmentFollowUpDto,
  FilingRoute,
  Form100BoxMapping,
  MyGuichetStepGuide,
  AnnexRequestDto,
  AssessmentComparisonDiscrepancy,
  NotificationSeverity,
  NotificationType,
} from '@luxtax/contracts';
import { ImportAssessmentInput } from '@luxtax/validation';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';
import {
  isCertificate160FieldKey,
  lookupCertificate160Code,
  normalizeCertificate160Code,
} from '@luxtax/tax-engine';
import {
  FORM100_CASES,
  FORM100_INSTRUCTIONS,
  RECAP,
  foreignNatureSheet,
  foreignSheetPointer,
} from './form100-case-map';
import type { Form100CaseRef } from './form100-case-map';
import { defaultAssessmentFollowUp } from './assessment-dates';
import { selectFilerMembers } from '../calculations/class-resolution';
import { requiredApproverIds } from './return-version-history';
import { CONFIRMED_FACT_IN_RETURN_WHERE } from '../facts/fact-visibility-query';
import { stripUnsharedSnapshotFacts } from '../facts/fact-snapshot';
import {
  factAmountRole,
  RD_WITHHOLDING_CREDIT,
  RENTAL_CHARGES_DEDUCTION,
} from './form100-fact-lines';

/**
 * The approval rule shared by `approveReturn` and `recordFiling`: a joint
 * (Class 2) return needs every ACTIVE member's approval, a single filer needs
 * their own. Kept in one place so filing can never accept a weaker condition
 * than approval itself.
 */
function requiredApprovalsMet(
  isJointFiling: boolean,
  requiredMemberIds: string[],
  approvedUserIds: string[],
  actingUserId: string,
): boolean {
  return isJointFiling
    ? requiredMemberIds.every((id) => approvedUserIds.includes(id))
    : approvedUserIds.includes(actingUserId);
}

/** Prisma shape of an `Assessment` row, needed by the DTO mapper. */
type AssessmentRow = {
  id: string;
  workspaceId: string;
  taxYear: number;
  bulletinDate: Date;
  assessedTaxableIncome: Prisma.Decimal;
  assessedTaxDue: Prisma.Decimal;
  differenceWithDeclared: Prisma.Decimal;
  discrepanciesJson: Prisma.JsonValue;
  receivedAt: Date | null;
  objectionDeadline: Date | null;
  followUpAt: Date | null;
  isFinal: boolean;
  createdAt: Date;
};

@Injectable()
export class FilingService {
  private readonly logger = new Logger(FilingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  async approveReturn(
    workspaceId: string,
    userId: string,
    ipAddress?: string,
  ): Promise<ReturnVersionDto> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
      include: {
        household: {
          include: { members: { where: { status: 'ACTIVE' } } },
        },
        confirmedFacts: {
          where: CONFIRMED_FACT_IN_RETURN_WHERE,
        },
      },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    if (!workspace.calculationResult) {
      throw new BadRequestException('Tax must be calculated before approving the return');
    }

    // Get or create active ReturnVersion
    let returnVersion = await this.prisma.returnVersion.findFirst({
      where: {
        workspaceId,
        versionNumber: workspace.activeReturnVersion,
      },
      include: { approvals: { include: { user: true } } },
    });

    if (!returnVersion) {
      returnVersion = await this.prisma.returnVersion.create({
        data: {
          workspaceId,
          versionNumber: workspace.activeReturnVersion,
          factsSnapshotJson: workspace.confirmedFacts as any,
          calculationSnapshotJson: workspace.calculationResult as any,
        },
        include: { approvals: { include: { user: true } } },
      });
    }

    // API-6: a filed version is the snapshot the ACD received. Approving it
    // again would rewrite the record of what was filed.
    if (returnVersion.isFrozen) {
      throw new BadRequestException('Filed return is frozen; start an amendment instead');
    }

    await this.prisma.returnApproval.upsert({
      where: {
        returnVersionId_userId: {
          returnVersionId: returnVersion.id,
          userId,
        },
      },
      create: {
        returnVersionId: returnVersion.id,
        userId,
        isSuperseded: false,
        approvedAt: new Date(),
      },
      update: {
        isSuperseded: false,
        supersededAt: null,
        supersedingReason: null,
        approvedAt: new Date(),
      },
    });

    // Re-fetch approvals for this version
    const activeApprovals = await this.prisma.returnApproval.findMany({
      where: {
        returnVersionId: returnVersion.id,
        isSuperseded: false,
      },
      include: { user: true },
    });

    // Check if all required household members have approved
    const requiredMemberIds = requiredApproverIds(workspace.household.members);
    const approvedMemberIds = activeApprovals.map((a) => a.userId);
    const isJointFiling = workspace.taxClass === TaxClass.CLASS_2;

    const bothApproved = requiredApprovalsMet(
      isJointFiling,
      requiredMemberIds,
      approvedMemberIds,
      userId,
    );

    let newStatus: WorkspaceStatus = WorkspaceStatus.HOUSEHOLD_REVIEW;
    if (bothApproved) {
      newStatus = WorkspaceStatus.APPROVED;
    }

    await this.prisma.taxYearWorkspace.update({
      where: { id: workspaceId },
      data: { status: newStatus },
    });

    await this.auditService.logEvent({
      householdId: workspace.householdId,
      workspaceId,
      actorId: userId,
      eventType: AuditEventType.RETURN_APPROVED,
      entityType: 'ReturnApproval',
      entityId: returnVersion.id,
      newValue: {
        versionNumber: returnVersion.versionNumber,
        bothApproved,
        newStatus,
      },
      description: `Return version ${returnVersion.versionNumber} approved by user ${userId}`,
      ipAddress,
    });

    // A notification is a side effect of the approval; it must never fail the
    // approval itself.
    if (!bothApproved) {
      await this.safeNotify('approval requested', () =>
        this.notifications.emitToHousehold({
          householdId: workspace.householdId,
          workspaceId,
          actorId: userId,
          excludeUserIds: [userId],
          // A VIEWER cannot approve: notifying them would be an unactionable task.
          roles: [HouseholdRole.PRIMARY_FILER, HouseholdRole.CO_FILER],
          dedupeKey: `approval-requested:${returnVersion.id}`,
          type: NotificationType.APPROVAL_REQUESTED,
          severity: NotificationSeverity.INFO,
          title: 'Approval requested',
          body: 'A household member approved the return and is waiting for your approval.',
          entityType: 'ReturnVersion',
          entityId: returnVersion.id,
          actionUrl: `/${workspace.householdId}/dashboard`,
        }),
      );
    } else {
      await this.safeNotify('return ready for review', () =>
        this.notifications.emitToHousehold({
          householdId: workspace.householdId,
          workspaceId,
          actorId: userId,
          // The actor already knows: they just cast the final approval.
          excludeUserIds: [userId],
          dedupeKey: `return-ready:${returnVersion.id}`,
          type: NotificationType.RETURN_READY_FOR_REVIEW,
          severity: NotificationSeverity.INFO,
          title: 'Return ready for review',
          body: 'All required household members approved the return. Review it before generating the filing package.',
          entityType: 'ReturnVersion',
          entityId: returnVersion.id,
          actionUrl: `/${workspace.householdId}/dashboard`,
        }),
      );
    }

    return {
      id: returnVersion.id,
      workspaceId,
      versionNumber: returnVersion.versionNumber,
      isFrozen: returnVersion.isFrozen,
      factsSnapshot: returnVersion.factsSnapshotJson as any,
      calculationSnapshot: returnVersion.calculationSnapshotJson as any,
      approvals: activeApprovals.map((a) => ({
        id: a.id,
        returnVersionId: a.returnVersionId,
        userId: a.userId,
        userEmail: a.user.email,
        approvedAt: a.approvedAt.toISOString(),
        isSuperseded: a.isSuperseded,
        supersededAt: a.supersededAt?.toISOString() || null,
        supersedingReason: a.supersedingReason,
      })),
      bothSpousesApproved: bothApproved,
      createdAt: returnVersion.createdAt.toISOString(),
    };
  }

  async generateFilingPackage(
    workspaceId: string,
    userId: string,
    ipAddress?: string,
  ): Promise<FilingPackageDto> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
      include: {
        household: {
          include: {
            members: { include: { user: { include: { profile: true } } } },
            dependants: true,
          },
        },
        confirmedFacts: { where: CONFIRMED_FACT_IN_RETURN_WHERE },
      },
    });

    if (!workspace || !workspace.calculationResult) {
      throw new BadRequestException('Workspace does not have a calculated return');
    }

    // LEG-9: never build a filing package from a preview rule package (2028
    // single class). Those values would be copied into a real return.
    try {
      assertFilingYearAllowed(workspace.taxYear);
    } catch (error) {
      if (error instanceof FilingPackageNotAllowedError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const returnVersion = await this.prisma.returnVersion.findFirst({
      where: { workspaceId, versionNumber: workspace.activeReturnVersion },
      include: { approvals: true, filingPackage: true },
    });

    if (!returnVersion) {
      throw new BadRequestException('No return version found. Approve the return first.');
    }

    // API-6: regenerating a package for a filed version would replace the
    // artifact the user actually submitted. Amend the return instead.
    if (returnVersion.isFrozen) {
      throw new BadRequestException('Filed return is frozen; start an amendment instead');
    }

    // ---------------------------------------------------------------------
    // Form 100F sheet map.
    //
    // The official return is a 20-page letter-coded form: Signaletique,
    // Enfants, E/R, NR, C/A, I, S, P, CM, L, D, EX, DS, CE, DD, RD, Recap.
    // There is no "100A-100L" series, and 101/103/105 are modele 160
    // salary-certificate codes, not Form 100 cases. We therefore emit
    // sheet-level mappings with the legal label, plus a separate
    // certificate-import step that keeps the 160 codes as a control.
    // ---------------------------------------------------------------------
    const calc = (workspace.calculationResult ?? {}) as any;
    const calcDeductions = calc.deductions ?? {};
    const calcCredits = calc.credits ?? {};

    const form100Boxes: Form100BoxMapping[] = [];
    const certificateImport: Array<{ code: string; label: string; amount: string; sourceFactId?: string }> = [];

    const unsupportedCertificateCodes: Array<{ code: string; factId: string; message: string }> = [];

    // --------------------------------------------------------------- owners
    // The 100F prints a taxpayer and a spouse column on the C/A, S, P, CM and L
    // sheets. A fact belongs to the spouse column when it is owned by a
    // household member other than the primary filer, so the spouse's salary
    // never lands on the taxpayer's case (702, 802, 902, 1002, …).
    const members = workspace.household.members;
    const { primaryUserId } = selectFilerMembers(members, userId);
    const primaryMember = members.find((m) => m.userId === primaryUserId) ?? members[0];
    // `primaryUserId` is the acting filer (CO_FILER included), selected above.

    interface BoxOwner {
      isSpouse: boolean;
      personName?: string;
    }
    const NO_PERSON: BoxOwner = { isSpouse: false };

    const displayName = (member: (typeof members)[number] | undefined): string | undefined => {
      const profile = member?.user?.profile;
      return (
        [profile?.firstName, profile?.lastName].filter(Boolean).join(' ').trim() ||
        member?.user?.email ||
        undefined
      );
    };
    const primaryOwner: BoxOwner = { isSpouse: false, personName: displayName(primaryMember) };

    const ownerOf = (ownerId: string | null): BoxOwner => {
      if (!ownerId || ownerId === primaryUserId) return primaryOwner;
      return {
        isSpouse: true,
        personName: displayName(members.find((m) => m.userId === ownerId)),
      };
    };

    /**
     * Emit one box. `primaryCase` is the taxpayer line; `spouseCase` is the
     * same line in the spouse column (absent when the sheet has only one
     * column, e.g. DS, CE, RD). The owner decides which one is used.
     */
    const addBox = (
      primaryCase: Form100CaseRef,
      spouseCase: Form100CaseRef | undefined,
      owner: BoxOwner,
      labelFr: string,
      labelDe: string,
      amount: number | string,
      sourceFactId?: string,
      kind: Form100BoxMapping['kind'] = 'FORM_100',
    ) => {
      const box = owner.isSpouse && spouseCase ? spouseCase : primaryCase;
      form100Boxes.push({
        pageNumber: box.page,
        sheet: box.sheet,
        caseNumber: box.caseNumber,
        labelFr,
        labelDe,
        amount,
        sourceFactId,
        kind,
        personName: owner.personName,
      });
    };

    // A freelance business is reported as one net-profit line per owner (C/A
    // 501 taxpayer, 502 spouse), never as a gross revenue line plus a positive
    // expense line. Revenue and expenses are accumulated here and emitted after
    // the loop.
    // Keyed by owner AND nature: a filer can carry an Art. 14 commercial profit
    // and an Art. 91 liberal profit in the same year. Netted together they would
    // produce one wrong line, and the liberal flag would drag the commercial
    // profit onto sheet I with it.
    const freelanceByOwner = new Map<
      string,
      { ownerId: string | null; revenue: number; expenses: number; liberal: boolean }
    >();

    for (const fact of workspace.confirmedFacts) {
      const amount = fact.amount.toString();
      const owner = ownerOf(fact.ownerId);

      // A certificate-160 fact carries a code, not an engine field key. Map it
      // through the same table as the engine, and report what cannot be mapped
      // instead of dropping it.
      const isCertificateField = isCertificate160FieldKey(fact.fieldKey);
      const certificateCode = isCertificateField
        ? lookupCertificate160Code(fact.fieldKey)
        : undefined;

      if (isCertificateField && !certificateCode) {
        const code = normalizeCertificate160Code(fact.fieldKey);
        unsupportedCertificateCodes.push({
          code,
          factId: fact.id,
          message: `Certificate 160 code "${code}" is not supported by this engine; the fact was not mapped to a Form 100 case. Add it to certificate160.ts or review it manually.`,
        });
        continue;
      }

      if (certificateCode && !certificateCode.supported) {
        unsupportedCertificateCodes.push({
          code: certificateCode.code,
          factId: fact.id,
          message: `Certificate 160 code "${certificateCode.code}" (${certificateCode.labelFr}) is a certificate withholding-base label, not a return fact; the fact was not mapped to a Form 100 case.`,
        });
        continue;
      }

      if (certificateCode) {
        certificateImport.push({
          code: certificateCode.code,
          label: `${certificateCode.labelFr} (modele 160)`,
          amount,
          sourceFactId: fact.id,
        });
      }

      const category = certificateCode ? certificateCode.category : fact.category;
      const fieldKey = certificateCode ? certificateCode.fieldKey : fact.fieldKey;

      // W3: a scanned certificate arrives with the canonical keys, not with
      // `code_101`/`code_103`/`code_105`. Give the 160 control step the same
      // 101/103/105 lines either way; the code keys still take the branch above.
      if (!certificateCode && category === 'EMPLOYMENT_INCOME') {
        const controlCode =
          fieldKey === 'grossSalary'
            ? '101'
            : fieldKey === 'socialSecurity'
              ? '103'
              : fieldKey === 'withholdingTax'
                ? '105'
                : undefined;
        if (controlCode) {
          certificateImport.push({
            code: controlCode,
            label: `${lookupCertificate160Code(controlCode)?.labelFr ?? controlCode} (modele 160)`,
            amount,
            sourceFactId: fact.id,
          });
        }
      }

      switch (category) {
        case "EMPLOYMENT_INCOME":
          if (fieldKey === "grossSalary") {
            addBox(
              FORM100_CASES.salaryGross,
              FORM100_CASES.salaryGrossSpouse,
              owner,
              "Feuille S - remuneration brute (Art. 95)",
              "Blatt S - Bruttoarbeitslohn",
              amount,
              fact.id,
            );
          } else if (fieldKey === "socialSecurity") {
            addBox(
              FORM100_CASES.socialSecurity,
              FORM100_CASES.socialSecuritySpouse,
              owner,
              "Feuille DS - cotisations sociales obligatoires (Art. 110 n 1)",
              "Blatt DS - Pflichtbeitraege zur Sozialversicherung",
              amount,
              fact.id,
            );
          } else if (fieldKey === "withholdingTax") {
            addBox(
              FORM100_CASES.withholdingSalary,
              FORM100_CASES.withholdingSalarySpouse,
              owner,
              "Feuille RD - retenue d impot sur traitements et salaires",
              "Blatt RD - einbehaltene Lohnsteuer",
              amount,
              fact.id,
            );
          }
          break;

        case "PENSION_INCOME":
          if (fieldKey === "withholdingTax") {
            addBox(
              FORM100_CASES.pensionWithholding,
              FORM100_CASES.pensionWithholdingSpouse,
              owner,
              "Feuille RD - retenue d impot sur pensions et rentes",
              "Blatt RD - einbehaltene Steuer auf Pensionen",
              amount,
              fact.id,
            );
          } else {
            addBox(
              FORM100_CASES.pension,
              FORM100_CASES.pensionSpouse,
              owner,
              "Feuille P - pensions et rentes (Art. 96)",
              "Blatt P - Pensionen und Renten",
              amount,
              fact.id,
            );
          }
          break;

        case "CAPITAL_INCOME":
        case "RENTAL_INCOME": {
          // The engine branches on the field key: a capital withholding is a
          // credit it deducts, rental charges an expense it subtracts from the
          // gross rent. Printing either at CM 901 / L 1001 as a positive amount
          // declared the tax already paid, or the expense, as income.
          const role = factAmountRole(category, fieldKey);

          if (role === "CREDIT") {
            this.logger.warn(
              `Fact ${fact.id}: capital withholding is a credit, not income; mapped to the RD credit pointer instead of CM 901`,
            );
            addBox(
              RD_WITHHOLDING_CREDIT,
              undefined,
              owner,
              "Feuille RD - retenue d impot sur revenus de capitaux mobiliers : credit a imputer, ne pas declarer comme revenu en case 901",
              "Blatt RD - Quellensteuer auf Kapitaleinkuenfte: anrechenbare Steuer, kein Ertrag in Fall 901",
              amount,
              fact.id,
              "COMPUTED",
            );
          } else if (role === "DEDUCTION") {
            this.logger.warn(
              `Fact ${fact.id}: rental charges are a deduction, not rental income; emitted as a labelled deduction pointer on sheet L`,
            );
            addBox(
              RENTAL_CHARGES_DEDUCTION,
              undefined,
              owner,
              "Feuille L - charges deductibles a soustraire du loyer brut (ne pas declarer comme revenu en case 1001)",
              "Blatt L - abziehbare Werbungskosten vom Bruttomietertrag (kein Ertrag in Fall 1001)",
              amount,
              fact.id,
              "INSTRUCTION",
            );
          } else if (category === "CAPITAL_INCOME") {
            addBox(
              FORM100_CASES.capital,
              FORM100_CASES.capitalSpouse,
              owner,
              "Feuille CM - revenus de capitaux mobiliers (Art. 97)",
              "Blatt CM - Kapitaleinkuenfte",
              amount,
              fact.id,
            );
          } else {
            addBox(
              FORM100_CASES.rental,
              FORM100_CASES.rentalSpouse,
              owner,
              "Feuille L - revenus de location (Art. 98)",
              "Blatt L - Mieteinkuenfte",
              amount,
              fact.id,
            );
          }
          break;
        }

        case "FOREIGN_INCOME": {
          // The 100F has no foreign-income sheet: 1101 is the substantial-
          // participation capital-gains line. Point at the exempt column of the
          // category sheet and at the RD 1081/1082 credit instead of emitting a
          // wrong box. When the fact's field key names a nature, the sheet is
          // named precisely; otherwise the generic S/P/CM/L sentence stands —
          // guessing a sheet would be worse than naming all four. The amount and
          // the fact id stay for traceability.
          const nature = foreignNatureSheet(fact.fieldKey);
          if (nature) {
            addBox(
              foreignSheetPointer(nature),
              undefined,
              owner,
              `Foreign ${nature.label} — declare in the exempt-income column of sheet ${nature.sheet}; claim the foreign tax credit on RD 1081/1082.`,
              `Auslaendische ${nature.label} — in der Spalte der befreiten Einkuenfte des Blattes ${nature.sheet} angeben; die auslaendische Steuer auf RD 1081/1082 anrechnen.`,
              amount,
              fact.id,
              "INSTRUCTION",
            );
          } else {
            addBox(
              FORM100_INSTRUCTIONS.foreignCredit,
              undefined,
              owner,
              "Foreign income — declare in the exempt column of the relevant category sheet (S/P/CM/L); claim the foreign tax credit on RD 1081/1082.",
              "Auslaendische Einkuenfte — in der Spalte der befreiten Einkuenfte des betreffenden Blattes (S/P/CM/L) angeben; die auslaendische Steuer auf RD 1081/1082 anrechnen.",
              amount,
              fact.id,
              "INSTRUCTION",
            );
          }
          break;
        }

        case "FREELANCE_INCOME":
        case "BUSINESS_EXPENSE": {
          // Net profit is one line per owner, emitted after the loop; an
          // expense must never become a positive case amount.
          // Art. 91 (profession libérale) is page 6 sheet I, not C/A 501. The
          // distinction is carried by the fact's field key because the activity
          // type in the profile is free text and cannot be relied on.
          const liberal =
            fact.fieldKey === "professionalRevenue" || fact.fieldKey === "professionalExpense";
          const ownerKey =
            !fact.ownerId || fact.ownerId === primaryUserId ? "__primary__" : fact.ownerId;
          // Owner *and* nature: Art. 14 and Art. 91 profits are separate lines
          // and must never be netted against each other.
          const key = `${ownerKey}::${liberal ? "art91" : "art14"}`;
          const entry =
            freelanceByOwner.get(key) ?? {
              ownerId: fact.ownerId,
              revenue: 0,
              expenses: 0,
              liberal,
            };
          if (category === "FREELANCE_INCOME") entry.revenue += Number(amount) || 0;
          else entry.expenses += Number(amount) || 0;
          freelanceByOwner.set(key, entry);
          break;
        }

        case "MORTGAGE_DEDUCTION":
        case "MORTGAGE_INTEREST":
          addBox(
            FORM100_CASES.mortgageInterest,
            undefined,
            NO_PERSON,
            "Feuille L - interets debiteurs de l habitation personnelle (Art. 98 n 5 / 105)",
            "Blatt L - Schuldzinsen selbstgenutztes Wohneigentum",
            amount,
            fact.id,
          );
          break;

        case "INSURANCE_DEDUCTION":
          addBox(
            FORM100_CASES.art111,
            undefined,
            NO_PERSON,
            "Feuille DS - primes Art. 111 (enveloppe 672 EUR)",
            "Blatt DS - Versicherungspraemien (Art. 111)",
            amount,
            fact.id,
          );
          break;

        case "PENSION_SAVINGS_111BIS":
          addBox(
            FORM100_CASES.art111bis,
            undefined,
            NO_PERSON,
            "Feuille DS - prevoyance-vieillesse Art. 111bis / 111ter",
            "Blatt DS - Altersvorsorge (Art. 111bis)",
            amount,
            fact.id,
          );
          break;

        case "SAVINGS_HOUSING":
          addBox(
            FORM100_CASES.savingsHousing,
            undefined,
            NO_PERSON,
            "Feuille DS - epargne-logement Art. 111 al. 5",
            "Blatt DS - Bausparen",
            amount,
            fact.id,
          );
          break;

        case "LRCP_CONTRIBUTION":
          addBox(
            FORM100_CASES.lrcp,
            undefined,
            NO_PERSON,
            "Feuille DS - cotisations LRCP Art. 110 n 3",
            "Blatt DS - LRCP-Beitraege",
            amount,
            fact.id,
          );
          break;

        case "DONATION_DEDUCTION":
          addBox(
            FORM100_CASES.donations,
            undefined,
            NO_PERSON,
            "Feuille DS - dons Art. 112 (en plus du forfait)",
            "Blatt DS - Spenden (Art. 112)",
            amount,
            fact.id,
          );
          break;

        case "CHILDCARE_EXPENSE":
        case "HOUSEHOLD_HELP_EXPENSE":
          addBox(
            FORM100_CASES.childcare,
            undefined,
            NO_PERSON,
            "Feuille CE - frais de garde ou domesticite (Art. 127, forfait 5 400 EUR)",
            "Blatt CE - Kinderbetreuung oder Haushaltshilfe",
            amount,
            fact.id,
          );
          break;

        default:
          break;
      }
    }

    // One net-profit box per owner: revenue - expenses, on C/A 501 (taxpayer)
    // or 502 (spouse). A negative result is written as 0, never as a negative
    // case amount; the loss is carried under Art. 114 through an instruction.
    for (const group of freelanceByOwner.values()) {
      const owner = ownerOf(group.ownerId);
      const net = group.revenue - group.expenses;
      if (group.liberal) {
        addBox(
          FORM100_INSTRUCTIONS.professionalProfit,
          undefined,
          owner,
          "Bénéfice d une profession libérale (Art. 91) — page 6, feuille I (601–651 / 6108–6110), pas C/A 501",
          "Gewinn aus freiberuflicher Tätigkeit (Art. 91) — Seite 6, Blatt I (601–651 / 6108–6110), nicht C/A 501",
          net > 0 ? net.toFixed(2) : "0.00",
          undefined,
          "INSTRUCTION",
        );
      } else {
        addBox(
          FORM100_CASES.freelance,
          FORM100_CASES.freelanceSpouse,
          owner,
          "Feuille C/A - bénéfice net commercial (Art. 14)",
          "Blatt C/A - Nettogewinn (Art. 14)",
          net > 0 ? net.toFixed(2) : "0.00",
        );
      }
      if (net < 0) {
        addBox(
          FORM100_INSTRUCTIONS.lossCarryForward,
          undefined,
          owner,
          "Bénéfice net négatif - perte reportable selon l Art. 114 (aucun montant négatif en case 501/502)",
          "Negativer Nettogewinn - Verlustvortrag nach Art. 114 (kein negativer Betrag in Fall 501/502)",
          Math.abs(net).toFixed(2),
          undefined,
          "INSTRUCTION",
        );
      }
    }

    // Computed forfaits - never a hard-coded 540.
    addBox(
      FORM100_CASES.ffo,
      undefined,
      NO_PERSON,
      "Feuille S - frais d obtention forfaitaires (Art. 107)",
      "Blatt S - Werbungskosten-Pauschbetrag",
      Number(calcDeductions.fraisObtention ?? 0).toFixed(2),
    );
    if (Number(calcDeductions.travel ?? 0) > 0) {
      addBox(
        FORM100_CASES.travel,
        undefined,
        NO_PERSON,
        "Feuille S - frais de deplacement (Art. 105bis)",
        "Blatt S - Fahrtkosten",
        Number(calcDeductions.travel).toFixed(2),
      );
    }
    if (calc.deductions === undefined) {
      // A stored result written before the deduction breakdown existed cannot
      // support DS 1553. Printing 0.00 would look like a declared figure.
      addBox(
        FORM100_INSTRUCTIONS.staleSnapshot,
        undefined,
        NO_PERSON,
        "Feuille DS - case 1553 non reconstructible: ce resultat stocke precede le detail des deductions. Recalculez puis regenerez le paquet.",
        "Blatt DS - Fall 1553 nicht rekonstruierbar: dieser gespeicherte Stand stammt aus der Zeit vor der Abzugsaufstellung. Neu berechnen und Paket neu erzeugen.",
        "0.00",
        undefined,
        "INSTRUCTION",
      );
    } else {
    // DS 1553 is the TOTAL of the special expenses covered by the minimum
    // forfait (cases 1301–1552), not the forfait itself: writing 480/960 there
    // understated the total whenever 1471/1503/1525 were also declared.
    // Older snapshots predate `specialExpensesCovered`; rebuild it from the
    // breakdown they do carry instead of reporting a spurious zero at 1553.
    const coveredSpecialExpenses = Number(
      calcDeductions.specialExpensesCovered ??
        Number(calcDeductions.art111 ?? 0) +
          Number(calcDeductions.asrd ?? 0) +
          Number(calcDeductions.art111bis ?? 0) +
          Number(calcDeductions.savingsHousing ?? 0),
    );
    addBox(
      FORM100_CASES.specialExpensesForfait,
      undefined,
      NO_PERSON,
      "Feuille DS - total des depenses speciales couvertes par le minimum forfaitaire (cases 1301 a 1552)",
      "Blatt DS - Gesamtbetrag der durch den Mindestpauschbetrag gedeckten Sonderausgaben (Faelle 1301-1552)",
      coveredSpecialExpenses.toFixed(2),
    );
    const specialExpensesMinimum = Number(calcDeductions.specialExpensesForfait ?? 0);
    if (specialExpensesMinimum > coveredSpecialExpenses) {
      addBox(
        FORM100_INSTRUCTIONS.specialExpensesMinimum,
        undefined,
        NO_PERSON,
        `Feuille DS - le minimum forfaitaire legal (${specialExpensesMinimum.toFixed(2)} EUR) remplace le total des cases 1301 a 1552 lorsqu il est plus eleve`,
        `Blatt DS - der gesetzliche Mindestpauschbetrag (${specialExpensesMinimum.toFixed(2)} EUR) ersetzt die Summe der Faelle 1301-1552, wenn er hoeher ist`,
        specialExpensesMinimum.toFixed(2),
        undefined,
        "INSTRUCTION",
      );
    }
    }
    if (Number(calcDeductions.aep ?? 0) > 0) {
      addBox(
        FORM100_CASES.aep,
        undefined,
        NO_PERSON,
        "Recapitulation - abattement extra-professionnel (Art. 129b)",
        "Zusammenfassung - Berufsabattement (Art. 129b)",
        Number(calcDeductions.aep).toFixed(2),
      );
    }

    // The CIM is not a recap figure: it is requested on the Enfants sheet
    // (case 228), so it carries the real case number rather than "computed".
    if (Number(calcCredits.cim ?? 0) > 0) {
      addBox(
        FORM100_CASES.cim,
        undefined,
        NO_PERSON,
        "Feuille Enfants - credit d impot monoparental a demander (Art. 154ter)",
        "Blatt Kinder - Alleinerziehenden-Steuergutschrift (Art. 154ter)",
        Number(calcCredits.cim).toFixed(2),
      );
    }

    // Credits are granted through the fiche / assessment; list them for review.
    // The ACD computes these itself: there is no 100F case to copy.
    const computedNote = "Computed by ACD — no 100F case";
    const creditLines: Array<[string, number]> = [
      ["CIS (Art. 154quater)", Number(calcCredits.cis ?? 0)],
      ["CI-CO2 salarie", Number(calcCredits.ciCo2Salary ?? 0)],
      ["CIP (Art. 154quinquies)", Number(calcCredits.cip ?? 0)],
      ["CII (Art. 152ter)", Number(calcCredits.cii ?? 0)],
      ["CISSM (salaire social minimum)", Number(calcCredits.cissm ?? 0)],
      ["Start-up (jeunes entreprises)", Number(calcCredits.startup ?? 0)],
    ];
    for (const [label, value] of creditLines) {
      if (value > 0) {
        addBox(
          RECAP,
          undefined,
          NO_PERSON,
          "Recapitulation - credit " + label + " — " + computedNote,
          "Zusammenfassung - Gutschrift " + label + " — " + computedNote,
          value.toFixed(2),
          undefined,
          "COMPUTED",
        );
      }
    }

    // ------------------------------------------------------------------
    // ACD annexes implied by the declared data. The app supplies the values
    // and says plainly that the official PDF is not generated.
    // ------------------------------------------------------------------
    const annexes: AnnexRequestDto[] = [];

    const rentalNet = Number(calc?.rental?.net ?? 0);
    if (rentalNet !== 0) {
      annexes.push({
        code: "190/210",
        title: "Revenus de location — biens batis",
        reason: "Une location declaree ouvre l'annexe 190/210.",
        fields: [
          { label: "Loyers bruts", value: Number(calc?.rental?.gross ?? 0).toFixed(2) },
          { label: "Charges", value: Number(calc?.rental?.charges ?? 0).toFixed(2) },
          { label: "Resultat net", value: rentalNet.toFixed(2) },
        ],
        produced: false,
      });
    }

    const plusValues = calc?.plusValues;
    if (plusValues && (plusValues.speculation > 0 || plusValues.article100 > 0 || plusValues.article99ter > 0)) {
      annexes.push({
        code: "700",
        title: "Plus-values immobilieres et cessions",
        reason: "Une plus-value imposable ouvre le modele 700.",
        fields: [
          { label: "Speculation (Art. 99bis)", value: Number(plusValues.speculation).toFixed(2) },
          { label: "Participation importante (Art. 100)", value: Number(plusValues.article100).toFixed(2) },
          { label: "Immeubles > 5 ans (Art. 99ter)", value: Number(plusValues.article99ter).toFixed(2) },
          { label: "Abattement applique", value: Number(plusValues.abattement).toFixed(2) },
        ],
        produced: false,
      });
    }

    const dependants = workspace.household?.dependants?.length ?? 0;
    if (dependants > 0) {
      annexes.push({
        code: "104",
        title: "Designation du parent — garde alternee",
        reason: "A remplir uniquement en cas de garde alternee (un seul menage percoit la moderation).",
        fields: [{ label: "Enfants declares", value: String(dependants) }],
        produced: false,
      });
    }

    if (Number(calc?.credits?.cim ?? 0) > 0) {
      annexes.push({
        code: "100 - feuille Enfants (case 228+)",
        title: "Demande de credit d'impot monoparental",
        reason: "Le CIM se demande dans la feuille Enfants du modele 100.",
        fields: [{ label: "CIM calcule", value: Number(calc.credits.cim).toFixed(2) }],
        produced: false,
      });
    }

    // Assistant electronique exclusions (guichet.lu, 7 April 2026).
    const assistantExclusions: string[] = [];
    if (workspace.taxClass === TaxClass.CLASS_2) {
      assistantExclusions.push(
        "Une demande d imposition individuelle (Art. 3ter) ne peut pas etre introduite via l assistant electronique : deposez le modele 100 PDF via MyGuichet.",
      );
    }
    if (workspace.residenceStatus === "NON_RESIDENT") {
      assistantExclusions.push(
        "L option collective resident / non-resident (regle des 90 %) ne peut pas etre demandee via l assistant electronique.",
      );
    }

    const boxRef = (box: Form100BoxMapping): string =>
      box.kind === 'COMPUTED'
        ? 'Recapitulation (computed by ACD)'
        : box.kind === 'INSTRUCTION'
          ? 'Instruction - ' + box.sheet + ' case ' + box.caseNumber
          : 'Feuille ' + box.sheet + ' - case ' + box.caseNumber;

    const myGuichetGuide: MyGuichetStepGuide[] = [
      {
        sectionIndex: 1,
        sectionTitle: "Etape 1 - Identite et situation familiale (Signaletique, Enfants, E/R)",
        instructions: [
          "Connectez-vous a MyGuichet.lu avec votre produit LuxTrust ou votre eID luxembourgeoise.",
          "Selectionnez la demarche Declaration de l impot sur le revenu (modele 100).",
          "Confirmez l annee d imposition " + workspace.taxYear + " et la classe d impot (" + (workspace.taxClass || "1") + ").",
          "Feuille E/R : les personnes mariees sont imposees collectivement par defaut (case 317). Les cases 318/319 ne se cochent que sur demande conjointe d imposition individuelle (Art. 3ter) et exigent la double signature en page 20.",
          ...assistantExclusions,
        ],
        fieldsToEnter: [],
      },
      {
        sectionIndex: 2,
        sectionTitle: "Etape 2 - Revenus (feuilles S, P, CM, L, C/A)",
        instructions: [
          "Ouvrez chaque feuille correspondant a un revenu declare ci-dessous.",
          "Ne recopiez jamais un code du certificat 160 sur le modele 100 : ce sont des codes du certificat de remuneration (voir l etape 4).",
        ],
        fieldsToEnter: form100Boxes
          .filter((b) => [5, 7, 8, 9, 10, 11].includes(b.pageNumber) && b.labelFr.startsWith("Feuille"))
          .map((b) => ({ fieldLabel: b.labelFr, form100Box: boxRef(b), value: b.amount })),
      },
      {
        sectionIndex: 3,
        sectionTitle: "Etape 3 - Depenses speciales et charges (feuilles DS, CE)",
        instructions: [
          "Saisissez les primes Art. 111 dans l enveloppe 672 EUR, et les versements Art. 111bis separement (plafond 3 200 EUR pour 2025, 4 500 EUR a partir de 2026).",
          "Les dons Art. 112 se declarent en plus du forfait de 480 / 960 EUR.",
          "Les frais de garde et d aide a domicile vont en feuille CE (forfait 5 400 EUR), pas en DS.",
        ],
        fieldsToEnter: form100Boxes
          .filter((b) => [14, 15, 16, 17].includes(b.pageNumber))
          .map((b) => ({ fieldLabel: b.labelFr, form100Box: boxRef(b), value: b.amount })),
      },
      {
        sectionIndex: 4,
        sectionTitle: "Annexe - controle du certificat de remuneration (modele 160)",
        instructions: [
          "Controle croise : les codes 101, 102, 103, 105, 141, S, P et LRCP appartiennent au certificat 160 et servent a verifier les montants, pas a etre saisis comme cases du modele 100.",
          "Les codes de base de retenue (FD, FO, FFO, DS, FDS, CE, AC) ne se recopient jamais sur le modele 100.",
        ],
        fieldsToEnter: certificateImport.map((c) => ({
          fieldLabel: c.label,
          form100Box: "Code " + c.code,
          value: c.amount,
        })),
      },
      {
        sectionIndex: 5,
        sectionTitle: "Etape 5 - Recapitulation et signature",
        instructions: [
          "Verifiez que le revenu imposable ajuste affiche par MyGuichet correspond au recapitulatif ci-dessous.",
          "Signez electroniquement avec LuxTrust, puis telechargez le recepisse officiel de transmission ACD.",
        ],
        fieldsToEnter: form100Boxes
          .filter((b) => b.pageNumber === 19 || b.pageNumber === 20)
          .map((b) => ({ fieldLabel: b.labelFr, form100Box: boxRef(b), value: b.amount })),
      },
    ];

    // Compute checksum
    const packagePayload = JSON.stringify({
      workspaceId,
      taxYear: workspace.taxYear,
      taxClass: workspace.taxClass,
      form100Boxes,
      annexes,
      myGuichetGuide,
      unsupportedCertificateCodes,
    });
    const packageSha256 = crypto.createHash('sha256').update(packagePayload).digest('hex');

    // API-7: the package is evidence once the return is filed, and every
    // regeneration is recorded instead of overwriting the previous hash.
    const existingFilingRecord = await this.prisma.filingRecord.findUnique({
      where: { workspaceId },
      select: { id: true },
    });
    try {
      assertPackageRegenerationAllowed(Boolean(existingFilingRecord));
    } catch (error) {
      if (error instanceof FilingPackageImmutableError) {
        throw new BadRequestException(error.message);
      }
      throw error;
    }

    const existingPackage = returnVersion.filingPackage;
    const generatedAt = new Date().toISOString();
    const history = appendPackageEvidence(
      (existingPackage?.historyJson as unknown as PackageEvidenceEntry[]) ?? [],
      { sha256: packageSha256, generatedAt },
    );

    const filingPackage = await this.prisma.filingPackage.upsert({
      where: { returnVersionId: returnVersion.id },
      create: {
        returnVersionId: returnVersion.id,
        taxYear: workspace.taxYear,
        taxClass: (workspace.taxClass as TaxClass) || TaxClass.CLASS_1,
        form100BoxesJson: form100Boxes as any,
        annexesJson: annexes as any,
        myGuichetGuideJson: myGuichetGuide as any,
        unsupportedCodesJson: unsupportedCertificateCodes as any,
        packageSha256,
        historyJson: history as any,
      },
      update: {
        form100BoxesJson: form100Boxes as any,
        annexesJson: annexes as any,
        myGuichetGuideJson: myGuichetGuide as any,
        unsupportedCodesJson: unsupportedCertificateCodes as any,
        packageSha256,
        historyJson: history as any,
      },
    });

    await this.prisma.taxYearWorkspace.update({
      where: { id: workspaceId },
      data: { status: WorkspaceStatus.FILING_PACKAGE_READY },
    });

    await this.auditService.logEvent({
      householdId: workspace.householdId,
      workspaceId,
      actorId: userId,
      eventType: AuditEventType.FILING_PACKAGE_GENERATED,
      entityType: 'FilingPackage',
      entityId: filingPackage.id,
      newValue: {
        packageSha256,
        boxesCount: form100Boxes.length,
      },
      description: `Generated filing package (SHA-256: ${packageSha256.substring(0, 16)}...)`,
      ipAddress,
    });

    // Every member can now download the package; no amount or document name is
    // put in the payload, only a reference to the generated row.
    await this.safeNotify('filing package generated', () =>
      this.notifications.emitToHousehold({
        householdId: workspace.householdId,
        workspaceId,
        actorId: userId,
        excludeUserIds: [userId],
        dedupeKey: `filing-package:${filingPackage.id}`,
        type: NotificationType.FILING_PACKAGE_GENERATED,
        severity: NotificationSeverity.INFO,
        title: 'Filing package generated',
        body: 'The filing package for this tax year has been generated.',
        entityType: 'FilingPackage',
        entityId: filingPackage.id,
        actionUrl: `/${workspace.householdId}/dashboard`,
      }),
    );

    return {
      id: filingPackage.id,
      returnVersionId: returnVersion.id,
      taxYear: filingPackage.taxYear,
      taxClass: filingPackage.taxClass as TaxClass,
      generatedAt: filingPackage.generatedAt.toISOString(),
      form100Boxes,
      annexes,
      myGuichetGuide,
      unsupportedCertificateCodes,
      packageSha256,
    };
  }

  /**
   * Records that the return was actually submitted and freezes the version that
   * was sent. This is the only writer of `WorkspaceStatus.FILED`: the record, the
   * freeze and the status change commit together, so a filing can never leave a
   * workspace claiming FILED without a frozen snapshot (or the reverse).
   */
  async recordFiling(
    workspaceId: string,
    userId: string,
    input: CreateFilingRecordDto,
    ipAddress?: string,
  ): Promise<FilingRecordDto> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
      include: {
        household: {
          include: { members: { where: { status: 'ACTIVE' } } },
        },
      },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const returnVersion = await this.prisma.returnVersion.findFirst({
      where: { workspaceId, versionNumber: workspace.activeReturnVersion },
      include: { approvals: true },
    });

    if (!returnVersion) {
      throw new BadRequestException('No return version found. Approve the return first.');
    }

    const approvedUserIds = returnVersion.approvals
      .filter((approval) => !approval.isSuperseded)
      .map((approval) => approval.userId);

    if (approvedUserIds.length === 0) {
      throw new BadRequestException('The return must be approved before it can be filed');
    }

    // A VIEWER cannot approve, so counting one here would make the return
    // permanently unfilable. Same helper as approval and history.
    const requiredMemberIds = requiredApproverIds(workspace.household.members);
    if (
      !requiredApprovalsMet(
        workspace.taxClass === TaxClass.CLASS_2,
        requiredMemberIds,
        approvedUserIds,
        userId,
      )
    ) {
      throw new BadRequestException(
        'Every required household member must approve the return before it is filed',
      );
    }

    const existing = await this.prisma.filingRecord.findUnique({ where: { workspaceId } });
    if (existing) {
      throw new BadRequestException('A filing record already exists for this workspace');
    }

    const [filingRecord, frozenVersion] = await this.prisma.$transaction([
      this.prisma.filingRecord.create({
        data: {
          workspaceId,
          returnVersionId: returnVersion.id,
          filedAt: new Date(input.filedAt),
          route: input.route,
          confirmationReference: input.confirmationReference,
          notes: input.notes,
          createdById: userId,
        },
      }),
      this.prisma.returnVersion.update({
        where: { id: returnVersion.id },
        data: { isFrozen: true },
      }),
      this.prisma.taxYearWorkspace.update({
        where: { id: workspaceId },
        data: { status: WorkspaceStatus.FILED },
      }),
    ]);

    await this.auditService.logEvent({
      householdId: workspace.householdId,
      workspaceId,
      actorId: userId,
      eventType: AuditEventType.RETURN_FILED,
      entityType: 'FilingRecord',
      entityId: filingRecord.id,
      newValue: {
        returnVersionId: returnVersion.id,
        versionNumber: frozenVersion.versionNumber,
        filedAt: filingRecord.filedAt.toISOString(),
        route: filingRecord.route,
        confirmationReference: filingRecord.confirmationReference,
      },
      description: `Return version ${frozenVersion.versionNumber} recorded as filed via ${filingRecord.route}`,
      ipAddress,
    });

    return this.toFilingRecordDto(
      filingRecord,
      frozenVersion.versionNumber,
      frozenVersion.isFrozen,
    );
  }

  /** The filing record of a workspace, or null while it has not been filed. */
  async getFilingRecord(workspaceId: string): Promise<FilingRecordDto | null> {
    const filingRecord = await this.prisma.filingRecord.findUnique({
      where: { workspaceId },
      include: { returnVersion: { select: { versionNumber: true, isFrozen: true } } },
    });

    if (!filingRecord) return null;

    return this.toFilingRecordDto(
      filingRecord,
      filingRecord.returnVersion.versionNumber,
      filingRecord.returnVersion.isFrozen,
    );
  }

  /**
   * Corrects the follow-up/objection dates of an imported assessment. The
   * bulletin date and the assessed amounts stay untouched: they are the ACD's
   * figures, not user input.
   */
  async updateAssessmentFollowUp(
    workspaceId: string,
    assessmentId: string,
    userId: string,
    input: UpdateAssessmentFollowUpDto,
    ipAddress?: string,
  ): Promise<AssessmentDto> {
    const assessment = await this.prisma.assessment.findFirst({
      where: { id: assessmentId, workspaceId },
      include: { workspace: { select: { householdId: true } } },
    });

    if (!assessment) {
      throw new NotFoundException('Assessment not found');
    }

    const updated = await this.prisma.assessment.update({
      where: { id: assessment.id },
      data: {
        objectionDeadline:
          input.objectionDeadline !== undefined
            ? new Date(input.objectionDeadline)
            : undefined,
        followUpAt: input.followUpAt !== undefined ? new Date(input.followUpAt) : undefined,
        isFinal: input.isFinal,
      },
    });

    await this.auditService.logEvent({
      householdId: assessment.workspace.householdId,
      workspaceId,
      actorId: userId,
      eventType: AuditEventType.ASSESSMENT_FOLLOW_UP_UPDATED,
      entityType: 'Assessment',
      entityId: assessment.id,
      previousValue: {
        objectionDeadline: assessment.objectionDeadline?.toISOString() ?? null,
        followUpAt: assessment.followUpAt?.toISOString() ?? null,
        isFinal: assessment.isFinal,
      },
      newValue: {
        objectionDeadline: updated.objectionDeadline?.toISOString() ?? null,
        followUpAt: updated.followUpAt?.toISOString() ?? null,
        isFinal: updated.isFinal,
      },
      description: `Updated follow-up dates of the ${assessment.taxYear} assessment`,
      ipAddress,
    });

    return this.toAssessmentDto(updated);
  }

  async importAssessment(
    workspaceId: string,
    userId: string,
    input: ImportAssessmentInput,
    ipAddress?: string,
  ): Promise<AssessmentDto> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const calcResult = workspace.calculationResult as any;
    const declaredIncome = calcResult ? Number(calcResult.taxableIncome) : 0;
    const declaredTax = calcResult ? Number(calcResult.finalTaxLiability) : 0;

    const assessedIncome = parseFloat(input.assessedTaxableIncome);
    const assessedTax = parseFloat(input.assessedTaxDue);
    const difference = Math.round((assessedTax - declaredTax) * 100) / 100;

    // The bulletin date is both the receipt date and the anchor of the default
    // deadlines; deriving all three from one value keeps them consistent.
    const bulletinDate = new Date(input.bulletinDate);
    const defaultFollowUp = defaultAssessmentFollowUp(bulletinDate);

    const discrepancies: AssessmentComparisonDiscrepancy[] = [];
    if (Math.abs(assessedIncome - declaredIncome) > 1) {
      discrepancies.push({
        field: 'Taxable Income (Revenu imposable)',
        declaredValue: declaredIncome,
        assessedValue: assessedIncome,
        difference: assessedIncome - declaredIncome,
        notes: 'ACD adjusted taxable base compared to declared return.',
      });
    }

    if (Math.abs(difference) > 1) {
      discrepancies.push({
        field: 'Final Tax Liability (Impôt sur le revenu dû)',
        declaredValue: declaredTax,
        assessedValue: assessedTax,
        difference,
        notes: difference > 0 ? 'ACD assessed higher tax than calculated.' : 'ACD assessed lower tax than calculated.',
      });
    }

    const assessment = await this.prisma.assessment.create({
      data: {
        workspaceId,
        taxYear: input.taxYear,
        bulletinDate,
        assessedTaxableIncome: new Prisma.Decimal(input.assessedTaxableIncome),
        assessedTaxDue: new Prisma.Decimal(input.assessedTaxDue),
        differenceWithDeclared: new Prisma.Decimal(difference),
        discrepanciesJson: discrepancies as any,
        receivedAt: bulletinDate,
        objectionDeadline: input.objectionDeadline
          ? new Date(input.objectionDeadline)
          : defaultFollowUp.objectionDeadline,
        followUpAt: input.followUpAt
          ? new Date(input.followUpAt)
          : defaultFollowUp.followUpAt,
        isFinal: input.isFinal ?? false,
      },
    });

    await this.prisma.taxYearWorkspace.update({
      where: { id: workspaceId },
      data: { status: WorkspaceStatus.ASSESSED },
    });

    await this.auditService.logEvent({
      householdId: workspace.householdId,
      workspaceId,
      actorId: userId,
      eventType: AuditEventType.ASSESSMENT_IMPORTED,
      entityType: 'Assessment',
      entityId: assessment.id,
      newValue: {
        assessedTaxDue: input.assessedTaxDue,
        difference,
        objectionDeadline: assessment.objectionDeadline?.toISOString() ?? null,
        followUpAt: assessment.followUpAt?.toISOString() ?? null,
      },
      description: `Imported official ACD tax assessment for ${input.taxYear}: difference = ${difference} EUR`,
      ipAddress,
    });

    return this.toAssessmentDto(assessment);
  }

  async rollOverToNextYear(
    workspaceId: string,
    userId: string,
    ipAddress?: string,
  ): Promise<{ nextWorkspaceId: string; nextTaxYear: number }> {
    const currentWorkspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
      include: {
        taxProfile: true,
      },
    });

    if (!currentWorkspace) {
      throw new NotFoundException('Current workspace not found');
    }

    const nextTaxYear = currentWorkspace.taxYear + 1;

    // Check if next year workspace already exists
    let nextWorkspace = await this.prisma.taxYearWorkspace.findUnique({
      where: {
        householdId_taxYear: {
          householdId: currentWorkspace.householdId,
          taxYear: nextTaxYear,
        },
      },
    });

    if (!nextWorkspace) {
      nextWorkspace = await this.prisma.taxYearWorkspace.create({
        data: {
          householdId: currentWorkspace.householdId,
          taxYear: nextTaxYear,
          status: WorkspaceStatus.DRAFT,
          residenceStatus: currentWorkspace.residenceStatus,
          taxClass: currentWorkspace.taxClass,
          completionScore: 10,
        },
      });

      // Roll forward tax profile answers
      if (currentWorkspace.taxProfile) {
        await this.prisma.taxProfile.create({
          data: {
            workspaceId: nextWorkspace.id,
            maritalStatus: currentWorkspace.taxProfile.maritalStatus,
            answersJson: currentWorkspace.taxProfile.answersJson as any,
          },
        });
      }

      await this.auditService.logEvent({
        householdId: currentWorkspace.householdId,
        workspaceId: nextWorkspace.id,
        actorId: userId,
        eventType: AuditEventType.WORKSPACE_INITIALIZED,
        entityType: 'TaxYearWorkspace',
        entityId: nextWorkspace.id,
        description: `Rolled over tax workspace to ${nextTaxYear} from ${currentWorkspace.taxYear}`,
        ipAddress,
      });
    }

    return {
      nextWorkspaceId: nextWorkspace.id,
      nextTaxYear,
    };
  }

  async getLatestReturnVersion(workspaceId: string): Promise<ReturnVersionDto | null> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
      include: {
        household: {
          include: { members: { where: { status: 'ACTIVE' } } },
        },
      },
    });

    if (!workspace) return null;

    const returnVersion = await this.prisma.returnVersion.findFirst({
      where: { workspaceId, versionNumber: workspace.activeReturnVersion },
      include: { approvals: { include: { user: true } } },
    });

    if (!returnVersion) return null;

    const activeApprovals = returnVersion.approvals.filter((a) => !a.isSuperseded);
    const requiredApprovers = requiredApproverIds(workspace.household.members);
    const bothApproved =
      requiredApprovers.length > 0 &&
      requiredApprovers.every((id) => activeApprovals.some((a) => a.userId === id));

    return {
      id: returnVersion.id,
      workspaceId,
      versionNumber: returnVersion.versionNumber,
      isFrozen: returnVersion.isFrozen,
      // A snapshot written before the predicate also required sharing may still
      // carry a fact its owner kept private; this endpoint is readable by every
      // member, so those entries are not served. New snapshots never hold one.
      factsSnapshot: stripUnsharedSnapshotFacts(
        returnVersion.factsSnapshotJson,
      ) as any,
      calculationSnapshot: returnVersion.calculationSnapshotJson as any,
      approvals: activeApprovals.map((a) => ({
        id: a.id,
        returnVersionId: a.returnVersionId,
        userId: a.userId,
        userEmail: a.user?.email,
        approvedAt: a.approvedAt.toISOString(),
        isSuperseded: a.isSuperseded,
        supersededAt: a.supersededAt?.toISOString() || null,
        supersedingReason: a.supersedingReason,
      })),
      bothSpousesApproved: bothApproved,
      createdAt: returnVersion.createdAt.toISOString(),
    };
  }

  async getLatestFilingPackage(workspaceId: string): Promise<FilingPackageDto | null> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) return null;

    const returnVersion = await this.prisma.returnVersion.findFirst({
      where: { workspaceId, versionNumber: workspace.activeReturnVersion },
      include: { filingPackage: true },
    });

    if (!returnVersion?.filingPackage) return null;
    const fp = returnVersion.filingPackage;

    return {
      id: fp.id,
      returnVersionId: fp.returnVersionId,
      taxYear: fp.taxYear,
      taxClass: fp.taxClass as TaxClass,
      generatedAt: fp.generatedAt.toISOString(),
      form100Boxes: (fp.form100BoxesJson as any) || [],
      annexes: (fp.annexesJson as any) || [],
      myGuichetGuide: (fp.myGuichetGuideJson as any) || [],
      unsupportedCertificateCodes: (fp.unsupportedCodesJson as any) || [],
      packageSha256: fp.packageSha256,
    };
  }

  async getLatestAssessment(workspaceId: string): Promise<AssessmentDto | null> {
    const assessment = await this.prisma.assessment.findFirst({
      where: { workspaceId },
      orderBy: { createdAt: 'desc' },
    });

    if (!assessment) return null;

    return this.toAssessmentDto(assessment);
  }

  /**
   * One mapper for every assessment response, so the follow-up fields can never
   * appear on the import response but vanish from the GET.
   */
  private toAssessmentDto(assessment: AssessmentRow): AssessmentDto {
    return {
      id: assessment.id,
      workspaceId: assessment.workspaceId,
      taxYear: assessment.taxYear,
      bulletinDate: assessment.bulletinDate.toISOString(),
      assessedTaxableIncome: Number(assessment.assessedTaxableIncome),
      assessedTaxDue: Number(assessment.assessedTaxDue),
      differenceWithDeclared: Number(assessment.differenceWithDeclared),
      discrepancies: (assessment.discrepanciesJson as any) || [],
      receivedAt: assessment.receivedAt?.toISOString() ?? null,
      objectionDeadline: assessment.objectionDeadline?.toISOString() ?? null,
      followUpAt: assessment.followUpAt?.toISOString() ?? null,
      isFinal: assessment.isFinal,
      createdAt: assessment.createdAt.toISOString(),
    };
  }

  /** `filedAt` is a calendar day: the stored UTC midnight is cut to YYYY-MM-DD. */
  private toFilingRecordDto(
    record: {
      id: string;
      workspaceId: string;
      returnVersionId: string;
      filedAt: Date;
      route: string;
      confirmationReference: string | null;
      notes: string | null;
      createdById: string;
      createdAt: Date;
      updatedAt: Date;
    },
    versionNumber: number,
    isFrozen: boolean,
  ): FilingRecordDto {
    return {
      id: record.id,
      workspaceId: record.workspaceId,
      returnVersionId: record.returnVersionId,
      versionNumber,
      filedAt: record.filedAt.toISOString().slice(0, 10),
      route: record.route as FilingRoute,
      confirmationReference: record.confirmationReference,
      notes: record.notes,
      createdById: record.createdById,
      createdAt: record.createdAt.toISOString(),
      updatedAt: record.updatedAt.toISOString(),
      isFrozen,
    };
  }

  /**
   * Notifications are a side effect: a delivery failure must never roll back or
   * mask an approval or a filing package that already committed.
   */
  private async safeNotify(
    description: string,
    emit: () => Promise<unknown>,
  ): Promise<void> {
    try {
      await emit();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.warn(`Notification skipped (${description}): ${message}`);
    }
  }
}
