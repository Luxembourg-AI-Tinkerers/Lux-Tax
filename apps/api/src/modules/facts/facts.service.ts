import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AuditEventType,
  ConfirmedFactDto,
  ExtractedFactDto,
  FactCategory,
  WorkspaceStatus,
} from '@luxtax/contracts';
import { ConfirmFactInput, UpdateFactInput } from '@luxtax/validation';
import { Prisma } from '@prisma/client';

@Injectable()
export class FactsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
  ) {}

  async getFactsForWorkspace(workspaceId: string): Promise<{
    extractedFacts: ExtractedFactDto[];
    confirmedFacts: ConfirmedFactDto[];
  }> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    const [extracted, confirmed] = await Promise.all([
      this.prisma.extractedFact.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.confirmedFact.findMany({
        where: { workspaceId },
        orderBy: { createdAt: 'desc' },
      }),
    ]);

    return {
      extractedFacts: extracted.map((f) => ({
        id: f.id,
        documentId: f.documentId,
        workspaceId: f.workspaceId,
        ownerId: f.ownerId,
        fieldName: f.fieldName,
        fieldValue: f.fieldValue,
        currency: f.currency,
        confidence: f.confidence,
        sourcePage: f.sourcePage,
        sourceSnippet: f.sourceSnippet,
        isConfirmed: f.isConfirmed,
        confirmedAt: f.confirmedAt?.toISOString() || null,
        confirmedById: f.confirmedById,
        createdAt: f.createdAt.toISOString(),
      })),
      confirmedFacts: confirmed.map((f) => ({
        id: f.id,
        workspaceId: f.workspaceId,
        ownerId: f.ownerId,
        category: f.category as FactCategory,
        fieldKey: f.fieldKey,
        amount: f.amount.toString(),
        currency: f.currency,
        taxYear: f.taxYear,
        sourceDocumentId: f.sourceDocumentId,
        extractedFactId: f.extractedFactId,
        isSharedWithHousehold: f.isSharedWithHousehold,
        isIncludedInReturn: f.isIncludedInReturn,
        description: f.description,
        createdAt: f.createdAt.toISOString(),
        updatedAt: f.updatedAt.toISOString(),
      })),
    };
  }

  async confirmFact(
    workspaceId: string,
    userId: string,
    input: ConfirmFactInput,
    ipAddress?: string,
  ): Promise<ConfirmedFactDto> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
      include: { household: true },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    let sourceDocumentId: string | null = null;
    if (input.extractedFactId) {
      const extracted = await this.prisma.extractedFact.findUnique({
        where: { id: input.extractedFactId },
      });
      if (extracted) {
        sourceDocumentId = extracted.documentId;
        await this.prisma.extractedFact.update({
          where: { id: input.extractedFactId },
          data: {
            isConfirmed: true,
            confirmedAt: new Date(),
            confirmedById: userId,
          },
        });
      }
    }

    const confirmed = await this.prisma.confirmedFact.create({
      data: {
        workspaceId,
        ownerId: input.ownerId || userId,
        category: input.category,
        fieldKey: input.fieldKey,
        amount: new Prisma.Decimal(input.amount),
        currency: input.currency || 'EUR',
        taxYear: workspace.taxYear,
        sourceDocumentId,
        extractedFactId: input.extractedFactId,
        isSharedWithHousehold: input.isSharedWithHousehold ?? true,
        isIncludedInReturn: input.isIncludedInReturn ?? true,
        description: input.description,
      },
    });

    // Invalidate any previously approved returns
    await this.invalidateApprovalsIfAny(
      workspaceId,
      workspace.householdId,
      userId,
      `New fact confirmed: ${input.fieldKey} = ${input.amount} EUR`,
      ipAddress,
    );

    // Audit event
    await this.auditService.logEvent({
      householdId: workspace.householdId,
      workspaceId,
      actorId: userId,
      eventType: AuditEventType.FACT_CONFIRMED,
      entityType: 'ConfirmedFact',
      entityId: confirmed.id,
      newValue: {
        category: confirmed.category,
        fieldKey: confirmed.fieldKey,
        amount: confirmed.amount.toString(),
      },
      description: `Confirmed fact "${confirmed.fieldKey}" for ${confirmed.amount} EUR`,
      ipAddress,
    });

    return {
      id: confirmed.id,
      workspaceId: confirmed.workspaceId,
      ownerId: confirmed.ownerId,
      category: confirmed.category as FactCategory,
      fieldKey: confirmed.fieldKey,
      amount: confirmed.amount.toString(),
      currency: confirmed.currency,
      taxYear: confirmed.taxYear,
      sourceDocumentId: confirmed.sourceDocumentId,
      extractedFactId: confirmed.extractedFactId,
      isSharedWithHousehold: confirmed.isSharedWithHousehold,
      isIncludedInReturn: confirmed.isIncludedInReturn,
      description: confirmed.description,
      createdAt: confirmed.createdAt.toISOString(),
      updatedAt: confirmed.updatedAt.toISOString(),
    };
  }

  async updateFact(
    workspaceId: string,
    factId: string,
    userId: string,
    input: UpdateFactInput,
    ipAddress?: string,
  ): Promise<ConfirmedFactDto> {
    const fact = await this.prisma.confirmedFact.findUnique({
      where: { id: factId },
      include: { workspace: true },
    });

    if (!fact || fact.workspaceId !== workspaceId) {
      throw new NotFoundException('Confirmed fact not found in workspace');
    }

    const previousAmount = fact.amount.toString();
    const updated = await this.prisma.confirmedFact.update({
      where: { id: factId },
      data: {
        amount: input.amount ? new Prisma.Decimal(input.amount) : undefined,
        ownerId: input.ownerId !== undefined ? input.ownerId : undefined,
        category: input.category,
        isSharedWithHousehold: input.isSharedWithHousehold,
        isIncludedInReturn: input.isIncludedInReturn,
        description: input.description,
      },
    });

    // Invalidate approvals on change
    await this.invalidateApprovalsIfAny(
      workspaceId,
      fact.workspace.householdId,
      userId,
      `Fact updated: ${fact.fieldKey} changed from ${previousAmount} to ${updated.amount.toString()} EUR`,
      ipAddress,
    );

    // Audit event
    await this.auditService.logEvent({
      householdId: fact.workspace.householdId,
      workspaceId,
      actorId: userId,
      eventType: AuditEventType.FACT_UPDATED,
      entityType: 'ConfirmedFact',
      entityId: fact.id,
      previousValue: { amount: previousAmount },
      newValue: { amount: updated.amount.toString() },
      description: `Updated fact "${fact.fieldKey}" from ${previousAmount} EUR to ${updated.amount.toString()} EUR`,
      ipAddress,
    });

    return {
      id: updated.id,
      workspaceId: updated.workspaceId,
      ownerId: updated.ownerId,
      category: updated.category as FactCategory,
      fieldKey: updated.fieldKey,
      amount: updated.amount.toString(),
      currency: updated.currency,
      taxYear: updated.taxYear,
      sourceDocumentId: updated.sourceDocumentId,
      extractedFactId: updated.extractedFactId,
      isSharedWithHousehold: updated.isSharedWithHousehold,
      isIncludedInReturn: updated.isIncludedInReturn,
      description: updated.description,
      createdAt: updated.createdAt.toISOString(),
      updatedAt: updated.updatedAt.toISOString(),
    };
  }

  async deleteFact(
    workspaceId: string,
    factId: string,
    userId: string,
    ipAddress?: string,
  ): Promise<void> {
    const fact = await this.prisma.confirmedFact.findUnique({
      where: { id: factId },
      include: { workspace: true },
    });

    if (!fact || fact.workspaceId !== workspaceId) {
      throw new NotFoundException('Confirmed fact not found');
    }

    await this.prisma.confirmedFact.delete({
      where: { id: factId },
    });

    await this.invalidateApprovalsIfAny(
      workspaceId,
      fact.workspace.householdId,
      userId,
      `Fact deleted: ${fact.fieldKey} (${fact.amount.toString()} EUR)`,
      ipAddress,
    );

    await this.auditService.logEvent({
      householdId: fact.workspace.householdId,
      workspaceId,
      actorId: userId,
      eventType: AuditEventType.FACT_UPDATED,
      entityType: 'ConfirmedFact',
      entityId: factId,
      previousValue: { fieldKey: fact.fieldKey, amount: fact.amount.toString() },
      description: `Deleted confirmed fact "${fact.fieldKey}"`,
      ipAddress,
    });
  }

  /**
   * Invalidates existing return approvals whenever a material fact change occurs.
   */
  private async invalidateApprovalsIfAny(
    workspaceId: string,
    householdId: string,
    actorId: string,
    reason: string,
    ipAddress?: string,
  ): Promise<void> {
    const activeApprovals = await this.prisma.returnApproval.findMany({
      where: {
        returnVersion: { workspaceId },
        isSuperseded: false,
      },
      include: { returnVersion: true },
    });

    if (activeApprovals.length > 0) {
      await this.prisma.returnApproval.updateMany({
        where: {
          returnVersion: { workspaceId },
          isSuperseded: false,
        },
        data: {
          isSuperseded: true,
          supersededAt: new Date(),
          supersedingReason: reason,
        },
      });

      await this.prisma.taxYearWorkspace.update({
        where: { id: workspaceId },
        data: {
          status: WorkspaceStatus.NEEDS_REVIEW,
          activeReturnVersion: { increment: 1 },
        },
      });

      await this.auditService.logEvent({
        householdId,
        workspaceId,
        actorId,
        eventType: AuditEventType.APPROVAL_INVALIDATED,
        entityType: 'ReturnApproval',
        entityId: workspaceId,
        description: `Approvals invalidated due to material change: ${reason}`,
        ipAddress,
      });
    }
  }
}
