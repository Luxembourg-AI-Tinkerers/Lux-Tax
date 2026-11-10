import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import {
  FreelanceBusinessProfileDto,
  FreelanceMetricsDto,
  DocumentType,
  FactCategory,
  DocumentVisibility,
  DocumentStatus,
  AuditEventType,
} from '@luxtax/contracts';
import { UpdateFreelanceProfileInput } from '@luxtax/validation';
import { AuditService } from '../audit/audit.service';
import { ReturnApprovalsService } from '../filing/return-approvals.service';
import { canIncludeInReturn, Visibility } from '../facts/fact-visibility';
import { selectFilerMembers } from '../calculations/class-resolution';
import {
  CONFIRMED_FACT_IN_RETURN_WHERE,
  householdVisibleConfirmedFactWhere,
  householdVisibleDocumentWhere,
} from '../facts/fact-visibility-query';
import { assertActiveHouseholdMember } from '../facts/household-owner';
import * as crypto from 'crypto';

@Injectable()
export class FreelanceService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly returnApprovals: ReturnApprovalsService,
  ) {}

  async getProfiles(workspaceId: string): Promise<FreelanceBusinessProfileDto[]> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
      include: {
        household: {
          include: {
            members: {
              where: { status: 'ACTIVE' },
              include: { user: true },
            },
          },
        },
        freelanceProfiles: {
          include: { owner: true },
        },
      },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const profiles = [...workspace.freelanceProfiles];

    // Only members who actually run an independent activity get a profile.
    // Creating one for every household member misrepresented pure employees as
    // freelancers and polluted the AEP / CII evidence trail.
    const independentOwnerIds = new Set(
      (
        await this.prisma.confirmedFact.findMany({
          where: {
            workspaceId,
            category: { in: ['FREELANCE_INCOME', 'BUSINESS_EXPENSE'] },
          },
          select: { ownerId: true },
        })
      )
        .map((f) => f.ownerId)
        .filter((id): id is string => Boolean(id)),
    );

    for (const member of workspace.household.members) {
      const existing = profiles.find((p) => p.ownerId === member.userId);
      if (!existing && independentOwnerIds.has(member.userId)) {
        const defaultName = member.user?.email
          ? `${member.user.email.split('@')[0].toUpperCase()} Consulting`
          : 'Freelance & Business Activity';
        const created = await this.prisma.freelanceBusinessProfile.create({
          data: {
            workspaceId,
            ownerId: member.userId,
            businessName: defaultName,
            activityType: 'Consulting & Professional Services',
            accountingType: 'CASH_BASIS',
          },
          include: { owner: true },
        });
        profiles.push(created);
      }
    }

    return profiles.map((p) => ({
      id: p.id,
      workspaceId: p.workspaceId,
      ownerId: p.ownerId,
      ownerEmail: p.owner?.email || null,
      businessName: p.businessName,
      activityType: p.activityType,
      taxIdOrVat: p.taxIdOrVat,
      accountingType: p.accountingType as 'CASH_BASIS' | 'ACCRUAL',
      createdAt: p.createdAt.toISOString(),
      updatedAt: p.updatedAt.toISOString(),
    }));
  }

  async updateProfile(
    workspaceId: string,
    ownerId: string,
    input: UpdateFreelanceProfileInput,
  ): Promise<FreelanceBusinessProfileDto> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // `ownerId` arrives in the path: it must name an active member of this
    // household, never an arbitrary user id.
    await assertActiveHouseholdMember(
      this.prisma,
      workspace.householdId,
      ownerId,
      'Freelance profile owner must be an active member of this household',
    );

    const updated = await this.prisma.freelanceBusinessProfile.upsert({
      where: {
        workspaceId_ownerId: {
          workspaceId,
          ownerId,
        },
      },
      create: {
        workspaceId,
        ownerId,
        businessName: input.businessName,
        activityType: input.activityType,
        taxIdOrVat: input.taxIdOrVat,
        accountingType: input.accountingType || 'CASH_BASIS',
      },
      update: {
        businessName: input.businessName,
        activityType: input.activityType,
        taxIdOrVat: input.taxIdOrVat,
        accountingType: input.accountingType || 'CASH_BASIS',
      },
      include: { owner: true },
    });

    return {
      id: updated.id,
      workspaceId: updated.workspaceId,
      ownerId: updated.ownerId,
      ownerEmail: updated.owner?.email || null,
      businessName: updated.businessName,
      activityType: updated.activityType,
      taxIdOrVat: updated.taxIdOrVat,
      accountingType: updated.accountingType as 'CASH_BASIS' | 'ACCRUAL',
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async getMetrics(
    workspaceId: string,
    viewerId: string,
    ownerId?: string,
  ): Promise<FreelanceMetricsDto> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
      include: {
        // Only what this member may read: another member's private-draft
        // invoice or unshared fact must not reach these totals, exactly as
        // GET /facts and GET /documents hide them. The return filter on top
        // keeps a discussion-only document out of the revenue figures.
        confirmedFacts: {
          where: {
            AND: [
              CONFIRMED_FACT_IN_RETURN_WHERE,
              householdVisibleConfirmedFactWhere(viewerId),
            ],
          },
        },
        documents: { where: householdVisibleDocumentWhere(viewerId) },
      },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const facts = ownerId
      ? workspace.confirmedFacts.filter((f) => f.ownerId === ownerId)
      : workspace.confirmedFacts;

    const docs = ownerId
      ? workspace.documents.filter((d) => d.ownerId === ownerId)
      : workspace.documents;

    let totalGrossRevenue = 0;
    let totalBusinessExpenses = 0;

    for (const fact of facts) {
      const amt = Number(fact.amount) || 0;
      if (fact.category === FactCategory.FREELANCE_INCOME) {
        totalGrossRevenue += amt;
      } else if (fact.category === FactCategory.BUSINESS_EXPENSE) {
        totalBusinessExpenses += amt;
      }
    }

    const netBusinessProfit = Math.max(0, totalGrossRevenue - totalBusinessExpenses);

    const freelanceDocTypes: string[] = [
      DocumentType.FREELANCE_INVOICE,
      DocumentType.BUSINESS_EXPENSE,
      DocumentType.PROFIT_AND_LOSS_STATEMENT,
      DocumentType.VAT_RETURN,
      DocumentType.BUSINESS_TAX_ADVANCE,
      DocumentType.FREELANCE_CONTRACT,
    ];

    const freelanceDocs = docs.filter((d) => freelanceDocTypes.includes(d.documentType));

    const invoicesCount = docs.filter((d) => d.documentType === DocumentType.FREELANCE_INVOICE).length;
    const expensesCount = docs.filter((d) => d.documentType === DocumentType.BUSINESS_EXPENSE).length;
    const contractsCount = docs.filter((d) => d.documentType === DocumentType.FREELANCE_CONTRACT).length;
    const vatReturnsCount = docs.filter((d) => d.documentType === DocumentType.VAT_RETURN).length;

    // Standard Luxembourg VAT calculation (17% normal rate)
    const vatCollected = Math.round(totalGrossRevenue * 0.17 * 100) / 100;
    const vatDeductible = Math.round(totalBusinessExpenses * 0.17 * 100) / 100;
    const netVatPayable = Math.max(0, Math.round((vatCollected - vatDeductible) * 100) / 100);

    return {
      workspaceId,
      ownerId: ownerId || null,
      totalGrossRevenue,
      totalBusinessExpenses,
      netBusinessProfit,
      totalDocumentsCount: freelanceDocs.length,
      invoicesCount,
      expensesCount,
      contractsCount,
      vatReturnsCount,
      vatCollected,
      vatDeductible,
      netVatPayable,
    };
  }

  async loadDemoData(workspaceId: string, actorId: string): Promise<{ success: boolean; count: number }> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
      include: {
        household: {
          include: {
            members: {
              where: { status: 'ACTIVE' },
              include: { user: true },
            },
          },
        },
      },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const members = workspace.household.members;
    const { primaryUserId, spouseUserId } = selectFilerMembers(members, actorId);
    const spouseA = primaryUserId || actorId;
    const spouseB = spouseUserId;

    // 1. Setup profiles for spouses
    await this.prisma.freelanceBusinessProfile.upsert({
      where: {
        workspaceId_ownerId: {
          workspaceId,
          ownerId: spouseA,
        },
      },
      create: {
        workspaceId,
        ownerId: spouseA,
        businessName: 'NextWave Cloud Solutions',
        activityType: 'IT Consulting & Software Architecture',
        taxIdOrVat: 'LU34829101',
        accountingType: 'CASH_BASIS',
      },
      update: {
        businessName: 'NextWave Cloud Solutions',
        activityType: 'IT Consulting & Software Architecture',
        taxIdOrVat: 'LU34829101',
      },
    });

    if (spouseB) {
      await this.prisma.freelanceBusinessProfile.upsert({
        where: {
          workspaceId_ownerId: {
            workspaceId,
            ownerId: spouseB,
          },
        },
        create: {
          workspaceId,
          ownerId: spouseB,
          businessName: 'Studio Lumina UX & Design',
          activityType: 'Digital Product Design & Branding',
          taxIdOrVat: 'LU55928172',
          accountingType: 'CASH_BASIS',
        },
        update: {
          businessName: 'Studio Lumina UX & Design',
          activityType: 'Digital Product Design & Branding',
          taxIdOrVat: 'LU55928172',
        },
      });
    }

    // 2. Demo freelance documents and facts
    const demoEntries: Array<{
      ownerId: string;
      docType: DocumentType;
      category: FactCategory;
      fileName: string;
      fieldKey: string;
      amount: string;
      description: string;
      confidence: number;
    }> = [
      // Spouse A: IT Consulting
      {
        ownerId: spouseA,
        docType: DocumentType.FREELANCE_INVOICE,
        category: FactCategory.FREELANCE_INCOME,
        fileName: 'Invoice_2025_001_FintechClient.pdf',
        fieldKey: 'freelanceRevenue',
        amount: '28000.00',
        description: 'Q1-Q2 Cloud Architecture Consulting (FinTech Luxembourg S.A.)',
        confidence: 0.98,
      },
      {
        ownerId: spouseA,
        docType: DocumentType.FREELANCE_INVOICE,
        category: FactCategory.FREELANCE_INCOME,
        fileName: 'Invoice_2025_002_GovTech.pdf',
        fieldKey: 'freelanceRevenue',
        amount: '19500.00',
        description: 'Q3 Enterprise Microservices Implementation',
        confidence: 0.96,
      },
      {
        ownerId: spouseA,
        docType: DocumentType.BUSINESS_EXPENSE,
        category: FactCategory.BUSINESS_EXPENSE,
        fileName: 'AWS_Cloud_Hosting_Annual_2025.pdf',
        fieldKey: 'businessExpense',
        amount: '3200.00',
        description: 'AWS Enterprise Production Infrastructure & CI/CD',
        confidence: 0.95,
      },
      {
        ownerId: spouseA,
        docType: DocumentType.BUSINESS_EXPENSE,
        category: FactCategory.BUSINESS_EXPENSE,
        fileName: 'MacBook_Pro_M4_Workstation.pdf',
        fieldKey: 'businessExpense',
        amount: '2850.00',
        description: 'Professional Developer Workstation & Dual 4K Displays',
        confidence: 0.97,
      },
    ];

    if (spouseB) {
      demoEntries.push(
        {
          ownerId: spouseB,
          docType: DocumentType.FREELANCE_INVOICE,
          category: FactCategory.FREELANCE_INCOME,
          fileName: 'Design_Invoice_2025_LuxBanking.pdf',
          fieldKey: 'freelanceRevenue',
          amount: '22000.00',
          description: 'Design System & Mobile App Redesign (Banque Privée Lux)',
          confidence: 0.97,
        },
        {
          ownerId: spouseB,
          docType: DocumentType.FREELANCE_INVOICE,
          category: FactCategory.FREELANCE_INCOME,
          fileName: 'Design_Invoice_2025_SaaSApp.pdf',
          fieldKey: 'freelanceRevenue',
          amount: '14500.00',
          description: 'B2B SaaS Product UX Architecture & Usability Testing',
          confidence: 0.95,
        },
        {
          ownerId: spouseB,
          docType: DocumentType.BUSINESS_EXPENSE,
          category: FactCategory.BUSINESS_EXPENSE,
          fileName: 'Figma_Adobe_Subscription_2025.pdf',
          fieldKey: 'businessExpense',
          amount: '1800.00',
          description: 'Figma Enterprise & Adobe Creative Cloud Annual Licenses',
          confidence: 0.96,
        },
        {
          ownerId: spouseB,
          docType: DocumentType.BUSINESS_EXPENSE,
          category: FactCategory.BUSINESS_EXPENSE,
          fileName: 'Coworking_Space_LuxCity_2025.pdf',
          fieldKey: 'businessExpense',
          amount: '2400.00',
          description: 'Dedicated Desk & Meeting Room Access (The Office Luxembourg)',
          confidence: 0.94,
        },
      );
    }

    let count = 0;
    for (const entry of demoEntries) {
      const sha256 = crypto
        .createHash('sha256')
        .update(`${workspaceId}_${entry.fileName}_${entry.amount}`)
        .digest('hex');

      // Check if document already exists
      const existingDoc = await this.prisma.document.findFirst({
        where: { workspaceId, sha256Hash: sha256 },
      });

      if (!existingDoc) {
        const doc = await this.prisma.document.create({
          data: {
            workspaceId,
            uploaderId: actorId,
            ownerId: entry.ownerId,
            fileName: `${sha256.substring(0, 10)}_${entry.fileName}`,
            originalName: entry.fileName,
            mimeType: 'application/pdf',
            fileSize: 42000,
            sha256Hash: sha256,
            storagePath: `/tmp/demo_${entry.fileName}`,
            documentType: entry.docType,
            status: DocumentStatus.CONFIRMED,
            visibility: DocumentVisibility.INCLUDED_IN_RETURN,
            pageCount: 1,
          },
        });

        const fact = await this.prisma.extractedFact.create({
          data: {
            documentId: doc.id,
            workspaceId,
            ownerId: entry.ownerId,
            fieldName: entry.fieldKey,
            fieldValue: entry.amount,
            currency: 'EUR',
            confidence: entry.confidence,
            sourcePage: 1,
            sourceSnippet: `${entry.description} - EUR ${entry.amount}`,
            isConfirmed: true,
            confirmedAt: new Date(),
            confirmedById: actorId,
          },
        });

        // A fact may only enter the return once its source document has been
        // proposed for, or included in, it. The demo loader creates its own
        // INCLUDED_IN_RETURN documents, so demo data keeps counting, while a
        // fact from a private draft could never seed the return.
        const isIncludedInReturn = canIncludeInReturn(doc.visibility as Visibility);

        await this.prisma.confirmedFact.create({
          data: {
            workspaceId,
            ownerId: entry.ownerId,
            category: entry.category,
            fieldKey: entry.fieldKey,
            amount: entry.amount,
            currency: 'EUR',
            taxYear: workspace.taxYear,
            sourceDocumentId: doc.id,
            extractedFactId: fact.id,
            isSharedWithHousehold: true,
            isIncludedInReturn,
            description: entry.description,
          },
        });

        count++;
      }
    }

    await this.auditService.logEvent({
      householdId: workspace.householdId,
      workspaceId,
      actorId,
      eventType: AuditEventType.FACT_CREATED,
      entityType: 'FreelanceDemoData',
      entityId: workspaceId,
      description: `Loaded ${count} realistic freelance documents and facts into workspace`,
    });

    // Demo facts are real confirmed facts that feed the joint return, so loading
    // them is a material change: standing approvals must be superseded exactly
    // as they are for a manual fact edit. Only a run that wrote new facts can
    // change the return, and the reason stays generic (no amounts, no names).
    if (count > 0) {
      await this.returnApprovals.invalidateForChange(
        workspaceId,
        actorId,
        'Freelance demo facts loaded',
      );
    }

    return { success: true, count };
  }
}
