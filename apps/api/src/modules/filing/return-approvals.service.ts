import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import { AuditService } from '../audit/audit.service';
import {
  AuditEventType,
  NotificationSeverity,
  NotificationType,
  ReturnApprovalDto,
  ReturnVersionHistoryDto,
  ReturnVersionHistoryItemDto,
  TaxClass,
  WorkspaceStatus,
} from '@luxtax/contracts';
import { historyStatus, mergeHistory } from './return-version-history';
import { NotificationsService } from '../notifications/notifications.service';

export interface ApprovalInvalidationResult {
  /** Number of approvals that were superseded by this change. */
  invalidated: number;
  /**
   * True when the active version is a filed (frozen) snapshot: nothing was
   * superseded and the caller must start an amendment instead of editing it.
   */
  frozen?: boolean;
}

/**
 * One place that decides what a material change does to an approved return.
 *
 * Every mutation that can change the joint return — a fact, an engine-feeding
 * questionnaire answer, a document moving into the return, a recalculation —
 * must supersede the standing approvals and open a new return version.
 * Otherwise two spouses keep an "approved" stamp on numbers nobody reviewed.
 */
@Injectable()
export class ReturnApprovalsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auditService: AuditService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Supersedes every active approval of the workspace and moves it to
   * NEEDS_REVIEW with a fresh `activeReturnVersion`. Returns
   * `{ invalidated: 0 }` when nobody had approved yet, in which case neither the
   * workspace nor the version counter is touched.
   *
   * A failure here is not swallowed: the caller's write already committed, but
   * keeping an approval active across a material change is worse than an error,
   * so the request fails and the user retries.
   */
  async invalidateForChange(
    workspaceId: string,
    actorId: string,
    reason: string,
    ipAddress?: string,
  ): Promise<ApprovalInvalidationResult> {
    const workspace = await this.prisma.taxYearWorkspace.findUnique({
      where: { id: workspaceId },
      select: { householdId: true, activeReturnVersion: true },
    });

    if (!workspace) {
      throw new NotFoundException('Workspace not found');
    }

    // API-6: a filed version is the snapshot the ACD received. Superseding its
    // approvals in place would rewrite the record of what was filed, so the
    // caller is told to start an amendment instead.
    const activeVersion = await this.prisma.returnVersion.findFirst({
      where: { workspaceId, versionNumber: workspace.activeReturnVersion },
      select: { isFrozen: true },
    });

    if (activeVersion?.isFrozen) {
      return { invalidated: 0, frozen: true };
    }

    const activeApprovals = await this.prisma.returnApproval.findMany({
      where: {
        returnVersion: { workspaceId },
        isSuperseded: false,
      },
      select: { id: true },
    });

    if (activeApprovals.length === 0) {
      return { invalidated: 0 };
    }

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
      householdId: workspace.householdId,
      workspaceId,
      actorId,
      eventType: AuditEventType.APPROVAL_INVALIDATED,
      entityType: 'ReturnApproval',
      entityId: workspaceId,
      newValue: {
        reason,
        invalidatedApprovals: activeApprovals.length,
        supersededVersion: workspace.activeReturnVersion,
      },
      description: `Approvals invalidated due to material change: ${reason}`,
      ipAddress,
    });

    // A superseded approval must reach the other members: their "approved"
    // stamp no longer holds. The actor already knows what they changed.
    try {
      await this.notifications.emitToHousehold({
        householdId: workspace.householdId,
        workspaceId,
        actorId,
        excludeUserIds: [actorId],
        dedupeKey: `approval-invalidated:${workspaceId}:${workspace.activeReturnVersion + 1}`,
        type: NotificationType.APPROVAL_INVALIDATED,
        severity: NotificationSeverity.WARNING,
        title: 'Approval invalidated',
        body: 'A material change modified the return after it was approved. Review the new version and approve it again.',
        entityType: 'ReturnVersion',
        actionUrl: `/${workspace.householdId}/dashboard`,
      });
    } catch {
      // Notifications are a side effect; the invalidation is already committed.
    }

    return { invalidated: activeApprovals.length };
  }

  /**
   * Every return version of the workspace, newest first, with all approvals —
   * superseded ones included — and whether a filing package was generated.
   *
   * `activeReturnVersion` is incremented by an invalidation before any new
   * `ReturnVersion` row exists, so the active version is materialised as a
   * synthetic DRAFT row: the history must show "version N+1" instead of a gap.
   */
  async getHistory(workspaceId: string): Promise<ReturnVersionHistoryDto> {
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

    const returnVersions = await this.prisma.returnVersion.findMany({
      where: { workspaceId },
      include: {
        approvals: { include: { user: true }, orderBy: { approvedAt: 'asc' } },
        filingPackage: true,
      },
      orderBy: { versionNumber: 'desc' },
    });

    // A joint (Class 2) return needs every active member's approval; a single
    // filer needs only their own. Mirrors the rule in `approveReturn`.
    const requiredApproverCount =
      workspace.taxClass === TaxClass.CLASS_2
        ? workspace.household.members.length
        : 1;

    const versions: ReturnVersionHistoryItemDto[] = returnVersions.map(
      (returnVersion) => {
        const activeApprovalCount = returnVersion.approvals.filter(
          (approval) => !approval.isSuperseded,
        ).length;

        return {
          id: returnVersion.id,
          versionNumber: returnVersion.versionNumber,
          isCurrent: returnVersion.versionNumber === workspace.activeReturnVersion,
          isFrozen: returnVersion.isFrozen,
          status: historyStatus(
            returnVersion.versionNumber,
            workspace.activeReturnVersion,
            activeApprovalCount,
            requiredApproverCount,
          ),
          createdAt: returnVersion.createdAt.toISOString(),
          finalTaxLiability: snapshotFinalTaxLiability(
            returnVersion.calculationSnapshotJson,
          ),
          packageGenerated: returnVersion.filingPackage !== null,
          approvals: returnVersion.approvals.map(
            (approval): ReturnApprovalDto => ({
              id: approval.id,
              returnVersionId: approval.returnVersionId,
              userId: approval.userId,
              userEmail: approval.user?.email,
              approvedAt: approval.approvedAt.toISOString(),
              isSuperseded: approval.isSuperseded,
              supersededAt: approval.supersededAt?.toISOString() || null,
              supersedingReason: approval.supersedingReason,
            }),
          ),
        };
      },
    );

    return {
      workspaceId,
      activeReturnVersion: workspace.activeReturnVersion,
      versions: mergeHistory(versions, workspace.activeReturnVersion),
    };
  }
}

/**
 * The approved snapshot may be `{}` or a legacy shape; only a finite number is
 * worth showing, never `NaN` or a stringified decimal.
 */
function snapshotFinalTaxLiability(snapshot: unknown): number | undefined {
  if (!snapshot || typeof snapshot !== 'object') return undefined;
  const value = (snapshot as { finalTaxLiability?: unknown }).finalTaxLiability;
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined;
}
