-- Persist the ACD annexes implied by a filing package.
ALTER TABLE "filing_packages"
  ADD COLUMN "annexesJson" JSONB NOT NULL DEFAULT '[]';
