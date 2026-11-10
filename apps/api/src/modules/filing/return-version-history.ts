import type {
  ReturnVersionHistoryItemDto,
  ReturnVersionHistoryStatus,
} from '@luxtax/contracts';

/**
 * The minimum a membership must expose to decide who has to approve.
 * Structural on purpose: the pure module stays free of Prisma and Nest types.
 */
export interface ApproverCandidate {
  userId: string;
  role: string;
}

/**
 * PROD-2: a VIEWER cannot approve — the write-role guard rejects them — so
 * counting a VIEWER among the required approvers made a Class 2 return
 * permanently unapprovable: the gate waited for an approval nobody was allowed
 * to give. Only filers (PRIMARY_FILER / CO_FILER) are required to approve.
 * The order of the returned ids follows the membership order.
 */
export function requiredApproverIds(
  members: readonly ApproverCandidate[],
): string[] {
  return members
    .filter((member) => member.role !== 'VIEWER')
    .map((member) => member.userId);
}

/**
 * How many live approvals a version needs. A joint (Class 2) return needs every
 * filer's approval; a single filer needs only their own. The floor of one keeps
 * a degenerate household (only viewers left) from reporting APPROVED on zero
 * approvals, which `historyStatus` already refuses.
 */
export function requiredApproverCount(
  taxClass: string | null | undefined,
  members: readonly ApproverCandidate[],
): number {
  if (taxClass !== 'CLASS_2') return 1;
  return Math.max(1, requiredApproverIds(members).length);
}

/**
 * Status of one return version in the history list.
 *
 * The workspace only ever has one active version; every older version is
 * superseded by definition, whether or not it was approved. The active version
 * is APPROVED only when enough approvals are still live — a superseded approval
 * must not make a changed return look approved.
 */
export function historyStatus(
  versionNumber: number,
  activeVersion: number,
  activeApprovalCount: number,
  requiredApproverCount: number,
): ReturnVersionHistoryStatus {
  if (versionNumber < activeVersion) return 'SUPERSEDED';
  if (
    versionNumber === activeVersion &&
    requiredApproverCount > 0 &&
    activeApprovalCount >= requiredApproverCount
  ) {
    return 'APPROVED';
  }
  return 'DRAFT';
}

/**
 * Order the history newest-first and make sure the active version is visible
 * even before anybody approves it: `activeReturnVersion` is incremented by an
 * invalidation, but no `ReturnVersion` row exists until the next approval, so
 * the client would otherwise see a gap instead of "version N+1".
 */
export function mergeHistory(
  existing: readonly ReturnVersionHistoryItemDto[],
  activeVersion: number,
): ReturnVersionHistoryItemDto[] {
  const rows: ReturnVersionHistoryItemDto[] = existing.some(
    (item) => item.versionNumber === activeVersion,
  )
    ? [...existing]
    : [
        ...existing,
        {
          versionNumber: activeVersion,
          isCurrent: true,
          isFrozen: false,
          status: 'DRAFT',
          packageGenerated: false,
          approvals: [],
        },
      ];

  return rows.sort((a, b) => b.versionNumber - a.versionNumber);
}
