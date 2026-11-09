/**
 * Private-draft redaction and filing-package downloads (MOB-5).
 *
 * Two mobile concerns that need no React Native to verify:
 *
 * 1. **Privacy.** An extracted fact is only visible to the household once its source
 *    document is proposed for the return (`PROPOSED_FOR_RETURN` / `INCLUDED_IN_RETURN`).
 *    A `PRIVATE_DRAFT` fact belongs to its uploader only; another member must see that
 *    something exists without seeing the amount.
 * 2. **Download.** The filing package PDF lives behind an authenticated endpoint; the
 *    mobile app needs a stable URL and a filename that cannot traverse paths.
 */

export type DocumentVisibilityLike =
  | 'PRIVATE_DRAFT'
  | 'SHARED_FOR_DISCUSSION'
  | 'PROPOSED_FOR_RETURN'
  | 'INCLUDED_IN_RETURN'
  | 'ARCHIVED'
  | string;

export interface VisibilityCarrier {
  ownerId?: string | null;
  visibility?: DocumentVisibilityLike | null;
  isSharedWithHousehold?: boolean | null;
}

export interface RedactableFact extends VisibilityCarrier {
  fieldValue?: string | number | null;
  amount?: string | number | null;
  description?: string | null;
}

/** Visibilities that make an amount readable by the whole household. */
const HOUSEHOLD_VISIBLE: readonly string[] = ['PROPOSED_FOR_RETURN', 'INCLUDED_IN_RETURN'];

/**
 * True when `viewerId` may see the amount.
 *
 * Rules, in order:
 *  - the owner always sees their own data;
 *  - an explicitly shared fact is visible to the household;
 *  - `PROPOSED_FOR_RETURN` / `INCLUDED_IN_RETURN` are visible;
 *  - everything else (`PRIVATE_DRAFT`, `SHARED_FOR_DISCUSSION`, `ARCHIVED`, unknown) is not.
 */
export function canSeeAmount(item: VisibilityCarrier, viewerId: string | null | undefined): boolean {
  const owner = item.ownerId ?? null;
  if (owner && viewerId && owner === viewerId) return true;
  if (item.isSharedWithHousehold === true) return true;
  const visibility = item.visibility ?? null;
  if (visibility && HOUSEHOLD_VISIBLE.includes(visibility)) return true;
  return false;
}

export const REDACTED_PLACEHOLDER = '••••';

export interface RedactionResult<T> {
  item: T;
  redacted: boolean;
}

/**
 * Replaces the monetary value with a placeholder when the viewer may not see it.
 * The description is kept: knowing that a salary certificate exists is not a leak,
 * the amount is.
 */
export function redactFact<T extends RedactableFact>(
  fact: T,
  viewerId: string | null | undefined,
): RedactionResult<T> {
  if (canSeeAmount(fact, viewerId)) return { item: fact, redacted: false };

  const masked = { ...fact } as T & { fieldValue?: unknown; amount?: unknown };
  if ('fieldValue' in fact) masked.fieldValue = REDACTED_PLACEHOLDER;
  if ('amount' in fact) masked.amount = REDACTED_PLACEHOLDER;

  return { item: masked as T, redacted: true };
}

/** Applies the rule to a list and reports how many were masked. */
export function redactFacts<T extends RedactableFact>(
  facts: readonly T[],
  viewerId: string | null | undefined,
): { items: T[]; redactedCount: number } {
  let redactedCount = 0;
  const items = facts.map((fact) => {
    const result = redactFact(fact, viewerId);
    if (result.redacted) redactedCount += 1;
    return result.item;
  });
  return { items, redactedCount };
}

/** Removes the trailing slash so joins cannot produce `//`. */
export function normaliseBaseUrl(baseUrl: string): string {
  return baseUrl.replace(/\/+$/, '');
}

/**
 * URL of the annex PDF for a workspace. Mirrors the API route added in Phase 6
 * (`GET /api/workspaces/:id/filing-package/annexes.pdf`).
 */
export function annexPdfUrl(baseUrl: string, workspaceId: string): string {
  const base = normaliseBaseUrl(baseUrl);
  return `${base}/api/workspaces/${encodeURIComponent(workspaceId)}/filing-package/annexes.pdf`;
}

/**
 * Download filename. Everything outside `[A-Za-z0-9._-]` is replaced, so a workspace
 * id or hash can never inject a path separator or a shell metacharacter.
 */
export function annexPdfFileName(taxYear: number, hashPrefix?: string | null): string {
  const safeHash = (hashPrefix ?? '').replace(/[^A-Za-z0-9]/g, '').slice(0, 8);
  const suffix = safeHash ? `-${safeHash}` : '';
  return `luxtax-annexes-${taxYear}${suffix}.pdf`;
}
