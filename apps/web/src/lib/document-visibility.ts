import { DocumentVisibility } from '@luxtax/contracts';

/**
 * The visibility control in the vault cycles through the three states a
 * document can actually be in. PRIVATE_DRAFT stays reachable, so a document can
 * also be taken out of the return — which the caller must confirm first, see
 * `removesFromReturn`.
 */
export function nextDocumentVisibility(current: DocumentVisibility): DocumentVisibility {
  switch (current) {
    case DocumentVisibility.PRIVATE_DRAFT:
      return DocumentVisibility.SHARED_FOR_DISCUSSION;
    case DocumentVisibility.SHARED_FOR_DISCUSSION:
      return DocumentVisibility.INCLUDED_IN_RETURN;
    case DocumentVisibility.INCLUDED_IN_RETURN:
      return DocumentVisibility.PRIVATE_DRAFT;
    default:
      // PROPOSED_FOR_RETURN and ARCHIVED are not offered by the vault cycle;
      // any other state is promoted rather than silently left untouched.
      return DocumentVisibility.INCLUDED_IN_RETURN;
  }
}

/** True when the change takes a document out of the return calculation. */
export function removesFromReturn(
  current: DocumentVisibility,
  next: DocumentVisibility,
): boolean {
  return (
    current === DocumentVisibility.INCLUDED_IN_RETURN &&
    next !== DocumentVisibility.INCLUDED_IN_RETURN
  );
}
