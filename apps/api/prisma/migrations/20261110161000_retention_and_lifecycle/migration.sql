-- M10: retention and account-lifecycle events.
--
-- 1. `DocumentExtraction.extractedText` (and `rawJson`) hold the raw text the
--    vision model read from a document — a health-insurance certificate, a
--    donation receipt. They exist only to let the user review what was
--    recognised; once every fact of that document is confirmed, the snippet is
--    redundant and is cleared by the API. Nullable to allow that.
-- 2. Two lifecycle events so export and erasure are visible in the same trail as
--    everything else.

ALTER TABLE "document_extractions" ALTER COLUMN "extractedText" DROP NOT NULL;

ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'USER_DATA_EXPORTED';
ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'USER_ACCOUNT_ERASED';
