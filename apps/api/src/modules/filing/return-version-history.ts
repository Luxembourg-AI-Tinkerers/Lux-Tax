import type {
  ReturnVersionHistoryItemDto,
  ReturnVersionHistoryStatus,
} from '@luxtax/contracts';

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
