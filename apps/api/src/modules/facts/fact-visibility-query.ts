/**
 * Prisma filters that apply the visibility policy of ./fact-visibility.ts.
 *
 * The facts list, the return snapshot and the freelance metrics must answer the
 * same question — "may this reader see this fact?" — so they share one builder
 * instead of three hand-copied `OR` trees that drift apart. The policy itself
 * stays pure in ./fact-visibility.ts; only the query shape lives here.
 */
import { Prisma } from '@prisma/client';
import { DocumentVisibility } from '@luxtax/contracts';

/**
 * Document states every active household member may read. Mirrors the shared
 * branch of `canReadDocument` in ./fact-visibility.ts.
 */
export const HOUSEHOLD_VISIBLE_DOCUMENT_STATES: DocumentVisibility[] = [
  DocumentVisibility.SHARED_FOR_DISCUSSION,
  DocumentVisibility.PROPOSED_FOR_RETURN,
  DocumentVisibility.INCLUDED_IN_RETURN,
  DocumentVisibility.ARCHIVED,
];

/**
 * Documents a member may open: their own uploads, documents they own, or a
 * document shared with the household. `PRIVATE_DRAFT` therefore stays with its
 * uploader and owner.
 */
export function householdVisibleDocumentWhere(
  userId: string,
): Prisma.DocumentWhereInput {
  return {
    OR: [
      { uploaderId: userId },
      { ownerId: userId },
      { visibility: { in: HOUSEHOLD_VISIBLE_DOCUMENT_STATES } },
    ],
  };
}

/**
 * Confirmed facts a member may read. A manual fact (no source document) stays
 * private until its owner shares it; a document-sourced fact follows the
 * visibility of its document.
 */
export function householdVisibleConfirmedFactWhere(
  userId: string,
): Prisma.ConfirmedFactWhereInput {
  return {
    OR: [
      {
        sourceDocumentId: null,
        OR: [{ ownerId: userId }, { isSharedWithHousehold: true }],
      },
      { sourceDocument: { is: householdVisibleDocumentWhere(userId) } },
    ],
  };
}

/**
 * Confirmed facts that may appear in the filed return.
 *
 * `isIncludedInReturn` alone is not a sharing decision: a fact its owner kept
 * to themselves is hidden by GET /facts from every other member, so it must
 * never reach the snapshot GET /return-version serves to the whole household.
 * A manual fact (no source document) is eligible only when it is shared; a
 * document-sourced fact also needs its document to be explicitly proposed for,
 * or included in, the return — mirrors `canIncludeInReturn`.
 */
export const CONFIRMED_FACT_IN_RETURN_WHERE: Prisma.ConfirmedFactWhereInput = {
  isIncludedInReturn: true,
  isSharedWithHousehold: true,
  OR: [
    { sourceDocumentId: null },
    {
      sourceDocument: {
        is: {
          visibility: {
            in: [
              DocumentVisibility.PROPOSED_FOR_RETURN,
              DocumentVisibility.INCLUDED_IN_RETURN,
            ],
          },
        },
      },
    },
  ],
};
