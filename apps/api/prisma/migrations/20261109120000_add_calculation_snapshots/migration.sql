-- API-9: append-only history of tax calculations.
CREATE TABLE "calculation_snapshots" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "taxClass" "TaxClass" NOT NULL,
    "rulePackageVersion" TEXT NOT NULL,
    "resultSha256" TEXT NOT NULL,
    "resultJson" JSONB NOT NULL,
    "createdById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "calculation_snapshots_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "calculation_snapshots_workspaceId_createdAt_idx"
    ON "calculation_snapshots"("workspaceId", "createdAt");

ALTER TABLE "calculation_snapshots"
    ADD CONSTRAINT "calculation_snapshots_workspaceId_fkey"
    FOREIGN KEY ("workspaceId") REFERENCES "tax_year_workspaces"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
