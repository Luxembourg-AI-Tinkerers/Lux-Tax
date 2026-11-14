-- DA-2: record where a document's figures came from, and whether it could be
-- read at all.
--
-- Before this migration every upload was stored as `EXTRACTED` even when the
-- file was a photograph the pipeline could not read: the API returned zero
-- facts, the UI showed "0 extracted figures", and nothing distinguished
-- "this document has no deductible amounts" from "we never saw its content".
--
-- 1. `NEEDS_OCR` on DocumentStatus is the state between the two.
-- 2. `extractionSource` records the reader that produced the text — a PDF text
--    layer, a text file, an embedded OCR sidecar, or a vision model.
-- 3. `ocrRequired` is denormalised on purpose: the vault filters and the
--    dashboard counter read it on every list request, and a boolean index is
--    cheaper than parsing a JSON column.
--
-- No existing row changes meaning: every row keeps `EXTRACTED`, and the new
-- columns default to `NONE` / `false`. A backfill is deliberately avoided —
-- guessing which old documents were unreadable would invent a fact.

ALTER TYPE "DocumentStatus" ADD VALUE IF NOT EXISTS 'NEEDS_OCR';

ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'TRAINING_INVOICE';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'MEDICAL_INVOICE';
ALTER TYPE "DocumentType" ADD VALUE IF NOT EXISTS 'RECEIPT';

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ExtractionSource') THEN
    CREATE TYPE "ExtractionSource" AS ENUM ('TEXT_LAYER', 'EMBEDDED_TEXT', 'PLAIN_TEXT', 'VISION', 'NONE');
  END IF;
END
$$;

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "extractionSource" "ExtractionSource" NOT NULL DEFAULT 'NONE',
  ADD COLUMN IF NOT EXISTS "ocrRequired" BOOLEAN NOT NULL DEFAULT false;

-- The vault's "needs attention" filter: only the failing rows are scanned.
CREATE INDEX IF NOT EXISTS "documents_ocrRequired_idx"
  ON "documents" ("ocrRequired")
  WHERE "ocrRequired" = true;
