import type { AuditEventDto } from '@luxtax/contracts';

/**
 * The household activity feed is readable by every active member, so a member
 * who is not a filer (VIEWER) must not learn from it what the rest of the app
 * hides from them: the actor's e-mail address, IP and user agent, or the name of
 * a private draft they cannot open. `documents.service.ts` writes the original
 * file name into the description and the audit values, so hiding the name means
 * replacing those with a neutral sentence.
 */
export const REDACTED_DOCUMENT_DESCRIPTION =
  'Document activity (name hidden: private draft)';

/** Copy of an audit snapshot without the original file name. */
function withoutFileName(
  value?: Record<string, unknown>,
): Record<string, unknown> | undefined {
  if (!value) return value;
  const copy = { ...value };
  delete copy.fileName;
  return copy;
}

/**
 * Apply the VIEWER view to one activity row.
 *
 * `mayReadDocumentName` answers, for a document id, whether the viewer is
 * allowed to see that document's name at all (false for a private draft and for
 * a document that no longer exists). Only `Document` events carry a file name,
 * so other events keep their description.
 */
export function redactAuditEventForViewer(
  event: AuditEventDto,
  mayReadDocumentName: (documentId: string) => boolean,
): AuditEventDto {
  const redacted: AuditEventDto = {
    ...event,
    actorEmail: undefined,
    ipAddress: undefined,
    userAgent: undefined,
  };

  if (event.entityType !== 'Document' || mayReadDocumentName(event.entityId)) {
    return redacted;
  }

  return {
    ...redacted,
    description: REDACTED_DOCUMENT_DESCRIPTION,
    previousValue: withoutFileName(event.previousValue),
    newValue: withoutFileName(event.newValue),
  };
}
