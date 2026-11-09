-- API-7: append-only evidence index for filing packages.
ALTER TABLE "filing_packages"
  ADD COLUMN "historyJson" JSONB NOT NULL DEFAULT '[]';
