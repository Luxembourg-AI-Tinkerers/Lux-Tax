import {
  Injectable,
  Logger,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import { NotificationsService } from '../notifications/notifications.service';
import { ReturnApprovalsService } from '../filing/return-approvals.service';
import {
  AuditEventType,
  ConfirmedFactDto,
  DocumentVisibility,
  ExtractedFactDto,
  FactCategory,
  NotificationSeverity,
  NotificationType,
} from '@luxtax/contracts';
import { ConfirmFactInput, UpdateFactInput } from '@luxtax/validation';
import { Prisma } from '@prisma/client';
import {
  canIncludeInReturn,
  canReadDocument,
  shouldRedactFactAudit,
  Visibility,
} from './fact-visibility';

/**
 * Document states every active household member may read. Mirrors the shared
 * branch of `canReadDocument` in ./fact-visibility.ts.
 */
const HOUSEHOLD_VISIBLE_DOCUMENT_STATES = [
  DocumentVisibility.SHARED_FOR_DISCUSSION,
  DocumentVisibility.PROPOSED_FOR_RETURN,
  DocumentVisibility.INCLUDED_IN_RETURN,
  DocumentVisibility.ARCHIVED,
];

/** Audit description used instead of a private fact's field key and amount. */
function redactedFactAuditDescription(
  action: 'Confirmed' | 'Updated' | 'Deleted',
): string {
  return `${action} a private fact (details hidden)`;
}

interface FactOwnershipScope {
  readonly ownerId: string | null;
  readonly isSharedWithHousehold: boolean;
  readonly sourceDocument: {
    readonly uploaderId: string | null;
    readonly ownerId: string | null;
    readonly visibility: string;
  } | null;
}

/**
 * A private draft (or a manual fact the owner kept to themselves) is not
 * mutable by another household member, even with a guessed fact id. Shared by
 * `updateFact` and `deleteFact` so the two paths cannot drift.
 */
function isPrivateFactOfAnotherUser(
  fact: FactOwnershipScope,
  userId: string,
): boolean {
  const visibility = (fact.sourceDocument?.visibility ?? null) as
    | Visibility
    | null;
  const isPrivateDraft = visibility === 'PRIVATE_DRAFT';
  const isPrivateManualFact = visibility === null && !fact.isSharedWithHousehold;
  const ownedByAnotherUser =
    fact.ownerId !== userId &&
    fact.sourceDocument?.uploaderId !== userId &&
    fact.sourceDocument?.ownerId !== userId;

  return (isPrivateDraft || isPrivateManualFact) && ownedByAnotherUser;
}

@Injectable()
export class FactsService {
  private readonly logger = new Logger(FactsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notifications: NotificationsService,
    private readonly returnApprovals: ReturnApprovalsService,
  ) {}

  async getFactsForWorkspace(
    workspaceId: string,
    userId: string,
  ): Promise<{
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
        where: {
          workspaceId,
          // Only facts from documents this user may read: their own uploads,
          // documents they own, or documents shared with the household.
          document: {
            OR: [
              { uploaderId: userId },
              { ownerId: userId },
              { visibility: { in: HOUSEHOLD_VISIBLE_DOCUMENT_STATES } },
            ],
          },
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.confirmedFact.findMany({
        where: {
          workspaceId,
          OR: [
            // Manual facts: visible when shared with the household or owned by
            // the reader.
            {
              sourceDocumentId: null,
              OR: [{ ownerId: userId }, { isSharedWithHousehold: true }],
            },
            // Document-sourced facts follow the document visibility policy.
            {
              sourceDocument: {
                is: {
                  OR: [
                    { uploaderId: userId },
                    { ownerId: userId },
                    { visibility: { in: HOUSEHOLD_VISIBLE_DOCUMENT_STATES } },
                  ],
                },
              },
            },
          ],
        },
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
    let sourceVisibility: Visibility | null = null;

    if (input.extractedFactId) {
      const extracted = await this.prisma.extractedFact.findUnique({
        where: { id: input.extractedFactId },
        include: {
          document: {
            select: { uploaderId: true, ownerId: true, visibility: true },
          },
        },
      });

      // A supplied extracted-fact id must belong to this workspace; otherwise
      // the caller could pull a fact across households or spoof a source.
      if (!extracted || extracted.workspaceId !== workspaceId) {
        throw new NotFoundException('Extracted fact not found in workspace');
      }

      if (
        !canReadDocument(
          extracted.document.visibility as Visibility,
          extracted.document.uploaderId,
          extracted.document.ownerId,
          userId,
        )
      ) {
        throw new ForbiddenException(
          'This document is a private draft of another household member',
        );
      }

      sourceDocumentId = extracted.documentId;
      sourceVisibility = extracted.document.visibility as Visibility;

      await this.prisma.extractedFact.update({
        where: { id: input.extractedFactId },
        data: {
          isConfirmed: true,
          confirmedAt: new Date(),
          confirmedById: userId,
        },
      });
    }

    // A fact may only enter the joint return when its source document has been
    // proposed for, or included in, the return. The body cannot override this.
    const isIncludedInReturn =
      (input.isIncludedInReturn ?? true) && canIncludeInReturn(sourceVisibility);

    // A fact confirmed from a private draft belongs to its author alone: it is
    // never shared with the household and never re-attributed, so deleting the
    // source document (sourceDocumentId becomes null) cannot turn it into a
    // shared manual fact.
    const isPrivateSource = sourceVisibility === 'PRIVATE_DRAFT';

    const confirmed = await this.prisma.confirmedFact.create({
      data: {
        workspaceId,
        ownerId: isPrivateSource ? userId : input.ownerId || userId,
        category: input.category,
        fieldKey: input.fieldKey,
        amount: new Prisma.Decimal(input.amount),
        currency: input.currency || 'EUR',
        taxYear: workspace.taxYear,
        sourceDocumentId,
        extractedFactId: input.extractedFactId,
        isSharedWithHousehold: isPrivateSource
          ? false
          : input.isSharedWithHousehold ?? true,
        isIncludedInReturn,
        description: input.description,
      },
    });

    // The household activity feed is readable by every active member, so a
    // private fact is logged without its field key or amount — in its own audit
    // row and in the invalidation reason it may produce.
    const redactAudit = shouldRedactFactAudit(
      sourceVisibility,
      confirmed.isSharedWithHousehold,
    );
    const materialChangeReason = redactAudit
      ? redactedFactAuditDescription('Confirmed')
      : `New fact confirmed: ${input.fieldKey} = ${input.amount} EUR`;

    // Invalidate any previously approved returns
    await this.returnApprovals.invalidateForChange(
      workspaceId,
      userId,
      materialChangeReason,
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
      newValue: redactAudit
        ? { category: confirmed.category }
        : {
            category: confirmed.category,
            fieldKey: confirmed.fieldKey,
            amount: confirmed.amount.toString(),
          },
      description: redactAudit
        ? redactedFactAuditDescription('Confirmed')
        : `Confirmed fact "${confirmed.fieldKey}" for ${confirmed.amount} EUR`,
      ipAddress,
    });

    // The spouse learns that a shared material fact changed; the actor already
    // knows. Private facts never reach this branch (redactAudit is true for
    // them), and a notification failure must not undo the confirmed fact.
    if (!redactAudit && confirmed.isSharedWithHousehold) {
      await this.safeNotify('material fact confirmed', () =>
        this.notifications.emitToHousehold({
          householdId: workspace.householdId,
          workspaceId,
          actorId: userId,
          excludeUserIds: [userId],
          type: NotificationType.MATERIAL_FIELD_CHANGED,
          severity: NotificationSeverity.INFO,
          title: 'Material fact confirmed',
          body: 'A household member confirmed a fact in the joint return.',
          entityType: 'ConfirmedFact',
          entityId: confirmed.id,
          dedupeKey: `material-fact:${confirmed.id}`,
          actionUrl: `/${workspace.householdId}/dashboard`,
        }),
      );
    }

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
      include: {
        workspace: true,
        sourceDocument: {
          select: { uploaderId: true, ownerId: true, visibility: true },
        },
      },
    });

    if (!fact || fact.workspaceId !== workspaceId) {
      throw new NotFoundException('Confirmed fact not found in workspace');
    }

    const sourceVisibility = (fact.sourceDocument?.visibility ?? null) as
      | Visibility
      | null;

    // A private draft (or a manual fact the owner kept to themselves) is not
    // editable by another household member, even with a guessed fact id.
    if (isPrivateFactOfAnotherUser(fact, userId)) {
      throw new ForbiddenException(
        'Private facts can only be edited by their uploader or owner',
      );
    }

    if (input.isIncludedInReturn === true && !canIncludeInReturn(sourceVisibility)) {
      throw new BadRequestException(
        'Only facts from a document proposed for, or included in, the return can be included',
      );
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

    // Redact when the fact was private before the edit or stays private after
    // it: sharing a formerly private fact must not retroactively publish its
    // amount in the activity feed.
    const redactAudit =
      shouldRedactFactAudit(sourceVisibility, fact.isSharedWithHousehold) ||
      shouldRedactFactAudit(sourceVisibility, updated.isSharedWithHousehold);
    const materialChangeReason = redactAudit
      ? redactedFactAuditDescription('Updated')
      : `Fact updated: ${fact.fieldKey} changed from ${previousAmount} to ${updated.amount.toString()} EUR`;

    // Invalidate approvals on change
    await this.returnApprovals.invalidateForChange(
      workspaceId,
      userId,
      materialChangeReason,
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
      previousValue: redactAudit
        ? { category: fact.category }
        : { amount: previousAmount },
      newValue: redactAudit
        ? { category: updated.category }
        : { amount: updated.amount.toString() },
      description: redactAudit
        ? redactedFactAuditDescription('Updated')
        : `Updated fact "${fact.fieldKey}" from ${previousAmount} EUR to ${updated.amount.toString()} EUR`,
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
      include: {
        workspace: true,
        sourceDocument: {
          select: { uploaderId: true, ownerId: true, visibility: true },
        },
      },
    });

    if (!fact || fact.workspaceId !== workspaceId) {
      throw new NotFoundException('Confirmed fact not found');
    }

    // Same guard as updateFact: a private draft, or a manual fact its owner kept
    // unshared, may only be deleted by that member.
    if (isPrivateFactOfAnotherUser(fact, userId)) {
      throw new ForbiddenException(
        'Private facts can only be deleted by their uploader or owner',
      );
    }

    const sourceVisibility = (fact.sourceDocument?.visibility ?? null) as
      | Visibility
      | null;
    const redactAudit = shouldRedactFactAudit(
      sourceVisibility,
      fact.isSharedWithHousehold,
    );

    await this.prisma.confirmedFact.delete({
      where: { id: factId },
    });

    await this.returnApprovals.invalidateForChange(
      workspaceId,
      userId,
      redactAudit
        ? redactedFactAuditDescription('Deleted')
        : `Fact deleted: ${fact.fieldKey} (${fact.amount.toString()} EUR)`,
      ipAddress,
    );

    await this.auditService.logEvent({
      householdId: fact.workspace.householdId,
      workspaceId,
      actorId: userId,
      eventType: AuditEventType.FACT_UPDATED,
      entityType: 'ConfirmedFact',
      entityId: factId,
      previousValue: redactAudit
        ? { category: fact.category }
        : { fieldKey: fact.fieldKey, amount: fact.amount.toString() },
      description: redactAudit
        ? redactedFactAuditDescription('Deleted')
        : `Deleted confirmed fact "${fact.fieldKey}"`,
      ipAddress,
    });
  }

  /**
   * Notifications are a side effect: a delivery failure must never roll back or
   * mask a fact write that already committed.
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
