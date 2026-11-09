-- Persist the certificate-160 codes that could not be mapped, so the warning
-- survives a reload and the package evidence keeps it.
ALTER TABLE "public"."filing_packages"
  ADD COLUMN "unsupportedCodesJson" JSONB NOT NULL DEFAULT '[]';
