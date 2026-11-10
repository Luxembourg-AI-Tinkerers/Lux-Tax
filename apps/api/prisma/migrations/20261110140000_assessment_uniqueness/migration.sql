-- Two data-model corrections.
--
-- 1. One assessment per (workspace, tax year). The service always inserted, so
--    two imports produced two rows and "the latest" was decided by createdAt
--    with no tiebreak. Existing duplicates are removed first (the newest row per
--    key survives) so the unique index can be created on a populated database.
-- 2. Drop `person_profiles.matriculeEncrypted`. Nothing ever wrote or read it and
--    no cipher exists in the codebase, so the name promised encryption that was
--    never implemented.

-- Keep the newest assessment for each (workspaceId, taxYear).
DELETE FROM "assessments" older
USING "assessments" newer
WHERE older."workspaceId" = newer."workspaceId"
  AND older."taxYear" = newer."taxYear"
  AND (
    older."createdAt" < newer."createdAt"
    OR (older."createdAt" = newer."createdAt" AND older."id" < newer."id")
  );

CREATE UNIQUE INDEX "assessments_workspaceId_taxYear_key"
  ON "assessments"("workspaceId", "taxYear");

ALTER TABLE "person_profiles" DROP COLUMN IF EXISTS "matriculeEncrypted";
