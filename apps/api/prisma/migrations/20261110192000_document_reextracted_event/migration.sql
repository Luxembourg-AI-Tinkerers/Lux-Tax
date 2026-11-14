-- DA-6: re-reading a stored document is an event, not a side effect.
--
-- A document uploaded before an OCR model existed can be read again afterwards.
-- That replaces the figures the user was shown, so it has to be visible in the
-- audit trail for the same reason a confirmation is: the return changed without
-- a new file arriving.

ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'DOCUMENT_REEXTRACTED';
