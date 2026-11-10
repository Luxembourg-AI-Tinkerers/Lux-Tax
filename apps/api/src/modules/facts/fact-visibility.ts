/**
 * Visibility policy for documents and the facts extracted from them.
 *
 * This module is intentionally pure: no NestJS, Prisma, Node or framework
 * imports. It is the single place where "who may read a document" and "may a
 * fact enter the joint return" are decided, so the rules can be unit-tested
 * without a database and cannot drift between facts, documents and
 * calculations by copy-paste.
 */

export type Visibility =
  | 'PRIVATE_DRAFT'
  | 'SHARED_FOR_DISCUSSION'
  | 'PROPOSED_FOR_RETURN'
  | 'INCLUDED_IN_RETURN'
  | 'ARCHIVED';

/**
 * A married couple files one joint return, but a spouse may prepare documents
 * privately before sharing them. Only `PRIVATE_DRAFT` is restricted to the
 * uploader/owner; every other state is readable by active household members
 * (the membership check itself is done by `HouseholdGuard`).
 *
 * `ARCHIVED` stays readable so archiving a document does not hide facts that
 * already belong to a shared discussion or return.
 */
export function canReadDocument(
  visibility: Visibility | null | undefined,
  uploaderId: string | null | undefined,
  ownerId: string | null | undefined,
  userId: string | null | undefined,
): boolean {
  if (!userId) {
    return false;
  }

  if (userId === uploaderId || userId === ownerId) {
    return true;
  }

  switch (visibility) {
    case 'SHARED_FOR_DISCUSSION':
    case 'PROPOSED_FOR_RETURN':
    case 'INCLUDED_IN_RETURN':
    case 'ARCHIVED':
      return true;
    case 'PRIVATE_DRAFT':
    default:
      // Unknown or missing visibility fails closed.
      return false;
  }
}

export function isSharedForDiscussion(
  visibility: Visibility | null | undefined,
): boolean {
  return visibility === 'SHARED_FOR_DISCUSSION';
}

/**
 * The household activity feed is readable by every active member, so a fact's
 * field key and amount must not be written into its audit row while the fact is
 * private: its source document is a private draft, or it is a manual fact its
 * owner kept unshared. Redacted rows keep the fact id (`entityId`) and category
 * only.
 */
export function shouldRedactFactAudit(
  visibility: Visibility | null | undefined,
  isSharedWithHousehold: boolean | null | undefined,
): boolean {
  switch (visibility) {
    case 'PRIVATE_DRAFT':
      return true;
    case 'SHARED_FOR_DISCUSSION':
    case 'PROPOSED_FOR_RETURN':
    case 'INCLUDED_IN_RETURN':
    case 'ARCHIVED':
      // Facts from these documents are already readable through GET /facts, so
      // their audit values are not secret.
      return false;
    case null:
    case undefined:
      // A fact without a source document is a manual fact; it is private until
      // its owner shares it. A fact whose private source document was deleted
      // lands here too (sourceDocumentId is nulled by the SetNull relation).
      return isSharedWithHousehold === false;
    default:
      // Unknown visibility fails closed.
      return true;
  }
}

/**
 * Only documents explicitly proposed for, or included in, the return may feed
 * the joint calculation. Manual facts (no source document) remain allowed.
 */
export function canIncludeInReturn(
  visibility: Visibility | null | undefined,
): boolean {
  if (visibility === null || visibility === undefined) {
    return true;
  }

  return (
    visibility === 'PROPOSED_FOR_RETURN' || visibility === 'INCLUDED_IN_RETURN'
  );
}

/**
 * The `isIncludedInReturn` value a fact may actually be stored with.
 *
 * A fact its owner kept to themselves never enters the joint return: GET /facts
 * hides it from every other member, and the return snapshot (GET
 * /return-version) is served to all of them — so `isIncludedInReturn: true` on
 * an unshared fact would be a leak waiting for the next approval. The document
 * rule of `canIncludeInReturn` applies on top of the sharing decision.
 */
export function canStoreInReturn(
  isSharedWithHousehold: boolean,
  requestedInclusion: boolean,
  visibility: Visibility | null | undefined,
): boolean {
  return (
    isSharedWithHousehold &&
    requestedInclusion &&
    canIncludeInReturn(visibility)
  );
}
