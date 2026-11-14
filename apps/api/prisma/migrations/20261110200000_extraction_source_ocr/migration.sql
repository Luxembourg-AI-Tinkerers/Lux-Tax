-- DA-9: a third reader.
--
-- The extraction source now distinguishes a local OCR run from a vision model:
-- they have different privacy properties (nothing leaves the machine), different
-- failure modes (a missing binary, not a timeout), and an auditor reading a
-- document's provenance needs to tell them apart.

ALTER TYPE "ExtractionSource" ADD VALUE IF NOT EXISTS 'OCR';
