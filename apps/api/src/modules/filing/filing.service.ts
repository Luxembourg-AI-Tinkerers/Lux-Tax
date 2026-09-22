import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  TaxClass,
  AuditEventType,
  WorkspaceStatus,
  ReturnVersionDto,
  FilingPackageDto,
  AssessmentDto,
  Form100BoxMapping,
  MyGuichetStepGuide,
  AssessmentComparisonDiscrepancy,
} from '@luxtax/contracts';
import { ImportAssessmentInput } from '@luxtax/validation';
import * as crypto from 'crypto';
import { Prisma } from '@prisma/client';

@Injectable()
export class FilingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
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
          where: { isIncludedInReturn: true },
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
    const requiredMemberIds = workspace.household.members.map((m) => m.userId);
    const approvedMemberIds = activeApprovals.map((a) => a.userId);
    const isJointFiling = workspace.taxClass === TaxClass.CLASS_2;

    const bothApproved = isJointFiling
      ? requiredMemberIds.every((id) => approvedMemberIds.includes(id))
      : approvedMemberIds.includes(userId);

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
          include: { members: { include: { user: { include: { profile: true } } } } },
        },
        confirmedFacts: { where: { isIncludedInReturn: true } },
      },
    });

    if (!workspace || !workspace.calculationResult) {
      throw new BadRequestException('Workspace does not have a calculated return');
    }

    const returnVersion = await this.prisma.returnVersion.findFirst({
      where: { workspaceId, versionNumber: workspace.activeReturnVersion },
      include: { approvals: true, filingPackage: true },
    });

    if (!returnVersion) {
      throw new BadRequestException('No return version found. Approve the return first.');
    }

    // Generate Form 100 Box Mappings
    const form100Boxes: Form100BoxMapping[] = [];

    // Salary facts
    for (const fact of workspace.confirmedFacts) {
      if (fact.category === 'EMPLOYMENT_INCOME') {
        if (fact.fieldKey === 'grossSalary' || fact.fieldKey === 'code_101') {
          form100Boxes.push({
            pageNumber: 2,
            boxNumber: '101',
            labelFr: 'Rémunération brute (traitements, salaires)',
            labelDe: 'Bruttoarbeitslohn',
            amount: fact.amount.toString(),
            sourceFactId: fact.id,
          });
        } else if (fact.fieldKey === 'socialSecurity' || fact.fieldKey === 'code_103') {
          form100Boxes.push({
            pageNumber: 2,
            boxNumber: '103',
            labelFr: 'Cotisations de sécurité sociale déductibles',
            labelDe: 'Sozialversicherungsbeiträge',
            amount: fact.amount.toString(),
            sourceFactId: fact.id,
          });
        } else if (fact.fieldKey === 'withholdingTax' || fact.fieldKey === 'code_105') {
          form100Boxes.push({
            pageNumber: 2,
            boxNumber: '105',
            labelFr: 'Retenue d\'impôt sur traitements et salaires',
            labelDe: 'Einbehaltene Lohnsteuer',
            amount: fact.amount.toString(),
            sourceFactId: fact.id,
          });
        }
      } else if (fact.category === 'MORTGAGE_DEDUCTION') {
        form100Boxes.push({
          pageNumber: 4,
          boxNumber: '310',
          labelFr: 'Intérêts débiteurs relatifs à l\'habitation personnelle',
          labelDe: 'Schuldzinsen für selbstgenutztes Wohneigentum',
          amount: fact.amount.toString(),
          sourceFactId: fact.id,
        });
      } else if (fact.category === 'INSURANCE_DEDUCTION') {
        form100Boxes.push({
          pageNumber: 3,
          boxNumber: '305',
          labelFr: 'Primes d\'assurances et cotisations prévoyance-vieillesse (Art 111)',
          labelDe: 'Versicherungsbeiträge (Art. 111 L.I.R.)',
          amount: fact.amount.toString(),
          sourceFactId: fact.id,
        });
      } else if (fact.category === 'DONATION_DEDUCTION') {
        form100Boxes.push({
          pageNumber: 3,
          boxNumber: '320',
          labelFr: 'Libéralités et dons (Art 112)',
          labelDe: 'Spenden (Art. 112 L.I.R.)',
          amount: fact.amount.toString(),
          sourceFactId: fact.id,
        });
      }
    }

    // Add standard forfait minimums
    form100Boxes.push({
      pageNumber: 2,
      boxNumber: '301',
      labelFr: 'Frais d\'obtention forfaitaires minimum',
      labelDe: 'Werbungskosten-Pauschbetrag',
      amount: '540.00',
    });

    const specialExpensesForfait = workspace.taxClass === TaxClass.CLASS_2 ? '960.00' : '480.00';
    form100Boxes.push({
      pageNumber: 3,
      boxNumber: '302',
      labelFr: 'Dépenses spéciales forfaitaires minimum',
      labelDe: 'Sonderausgaben-Pauschbetrag',
      amount: specialExpensesForfait,
    });

    // Generate MyGuichet manual submission guide
    const myGuichetGuide: MyGuichetStepGuide[] = [
      {
        sectionIndex: 1,
        sectionTitle: 'Étape 1 : Données d\'identification personnelle',
        instructions: [
          'Connectez-vous à MyGuichet.lu avec votre produit LuxTrust.',
          'Sélectionnez Démarche : "Déclaration de l\'impôt sur le revenu (Modèle 100)".',
          `Confirmez l'année fiscale ${workspace.taxYear} et votre classe d'impôt (${workspace.taxClass || '1'}).`,
        ],
        fieldsToEnter: [],
      },
      {
        sectionIndex: 2,
        sectionTitle: 'Étape 2 : Revenu net d\'une occupation salariée',
        instructions: [
          'Ouvrez la section "Revenus nets salariés".',
          'Reportez les montants indiqués sur votre certificat de rémunération.',
        ],
        fieldsToEnter: form100Boxes
          .filter((b) => b.pageNumber === 2)
          .map((b) => ({
            fieldLabel: b.labelFr,
            form100Box: `Case ${b.boxNumber}`,
            value: b.amount,
          })),
      },
      {
        sectionIndex: 3,
        sectionTitle: 'Étape 3 : Dépenses spéciales et déductions',
        instructions: [
          'Ouvrez la section "Dépenses spéciales".',
          'Saisissez vos primes d\'assurance déductibles et intérêts débiteurs selon les cases indiquées.',
        ],
        fieldsToEnter: form100Boxes
          .filter((b) => b.pageNumber >= 3)
          .map((b) => ({
            fieldLabel: b.labelFr,
            form100Box: `Case ${b.boxNumber}`,
            value: b.amount,
          })),
      },
      {
        sectionIndex: 4,
        sectionTitle: 'Étape 4 : Récapitulatif et Signature',
        instructions: [
          'Vérifiez que le montant total imposable calculé par MyGuichet correspond au récapitulatif LuxTax.',
          'Signez électroniquement à l\'aide de votre certificat LuxTrust.',
          'Téléchargez le récépissé officiel de transmission ACD.',
        ],
        fieldsToEnter: [],
      },
    ];

    // Compute checksum
    const packagePayload = JSON.stringify({
      workspaceId,
      taxYear: workspace.taxYear,
      taxClass: workspace.taxClass,
      form100Boxes,
      myGuichetGuide,
    });
    const packageSha256 = crypto.createHash('sha256').update(packagePayload).digest('hex');

    const filingPackage = await this.prisma.filingPackage.upsert({
      where: { returnVersionId: returnVersion.id },
      create: {
        returnVersionId: returnVersion.id,
        taxYear: workspace.taxYear,
        taxClass: (workspace.taxClass as TaxClass) || TaxClass.CLASS_1,
        form100BoxesJson: form100Boxes as any,
        myGuichetGuideJson: myGuichetGuide as any,
        packageSha256,
      },
      update: {
        form100BoxesJson: form100Boxes as any,
        myGuichetGuideJson: myGuichetGuide as any,
        packageSha256,
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

    return {
      id: filingPackage.id,
      returnVersionId: returnVersion.id,
      taxYear: filingPackage.taxYear,
      taxClass: filingPackage.taxClass as TaxClass,
      generatedAt: filingPackage.generatedAt.toISOString(),
      form100Boxes,
      myGuichetGuide,
      packageSha256,
    };
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
        bulletinDate: new Date(input.bulletinDate),
        assessedTaxableIncome: new Prisma.Decimal(input.assessedTaxableIncome),
        assessedTaxDue: new Prisma.Decimal(input.assessedTaxDue),
        differenceWithDeclared: new Prisma.Decimal(difference),
        discrepanciesJson: discrepancies as any,
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
      },
      description: `Imported official ACD tax assessment for ${input.taxYear}: difference = ${difference} EUR`,
      ipAddress,
    });

    return {
      id: assessment.id,
      workspaceId: assessment.workspaceId,
      taxYear: assessment.taxYear,
      bulletinDate: assessment.bulletinDate.toISOString(),
      assessedTaxableIncome: Number(assessment.assessedTaxableIncome),
      assessedTaxDue: Number(assessment.assessedTaxDue),
      differenceWithDeclared: Number(assessment.differenceWithDeclared),
      discrepancies,
      createdAt: assessment.createdAt.toISOString(),
    };
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
}
