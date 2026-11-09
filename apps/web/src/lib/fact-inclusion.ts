/**
 * The API silently downgrades `isIncludedInReturn` to false when a fact comes
 * from a document that is not proposed for / included in the return (a private
 * draft or a discussion-only document). The web client must never report such a
 * fact as included: the figure is saved, but the return does not use it.
 */
export const FACT_INCLUSION_DOWNGRADE_MESSAGE =
  'The fact was saved, but it is NOT included in the return: the source document is only shared for discussion. Promote it to "Proposed for return" or "Included in return" in the document vault — only those states may feed the return.';

export function factInclusionWarning(
  requested: boolean,
  returned: boolean | null | undefined,
): string | null {
  if (!requested || returned !== false) {
    return null;
  }

  return FACT_INCLUSION_DOWNGRADE_MESSAGE;
}
