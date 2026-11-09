-- API-6: record the actual submission (date, route, confirmation) and freeze
-- the filed return version. Hand-written because this workspace has no database
-- to run `prisma migrate dev` against; apply with:
--   pnpm --filter @luxtax/api prisma:migrate

-- CreateEnum
CREATE TYPE "public"."FilingRoute" AS ENUM ('MYGUICHET_MANUAL', 'PAPER', 'OTHER');

-- AlterEnum
-- The new audit values are added, not used, in this migration, so they are safe
-- inside Prisma's migration transaction on PostgreSQL 12+.
ALTER TYPE "public"."AuditEventType" ADD VALUE IF NOT EXISTS 'RETURN_FILED';
ALTER TYPE "public"."AuditEventType" ADD VALUE IF NOT EXISTS 'ASSESSMENT_FOLLOW_UP_UPDATED';

-- CreateTable
CREATE TABLE "public"."filing_records" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "returnVersionId" UUID NOT NULL,
    "filedAt" TIMESTAMP(3) NOT NULL,
    "route" "public"."FilingRoute" NOT NULL DEFAULT 'MYGUICHET_MANUAL',
    "confirmationReference" TEXT,
    "notes" TEXT,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "filing_records_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "filing_records_workspaceId_key" ON "public"."filing_records"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "filing_records_returnVersionId_key" ON "public"."filing_records"("returnVersionId");

-- CreateIndex
CREATE INDEX "filing_records_workspaceId_idx" ON "public"."filing_records"("workspaceId");

-- AddForeignKey
ALTER TABLE "public"."filing_records" ADD CONSTRAINT "filing_records_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."tax_year_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."filing_records" ADD CONSTRAINT "filing_records_returnVersionId_fkey" FOREIGN KEY ("returnVersionId") REFERENCES "public"."return_versions"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."filing_records" ADD CONSTRAINT "filing_records_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "public"."assessments"
    ADD COLUMN "receivedAt" TIMESTAMP(3),
    ADD COLUMN "objectionDeadline" TIMESTAMP(3),
    ADD COLUMN "followUpAt" TIMESTAMP(3),
    ADD COLUMN "isFinal" BOOLEAN NOT NULL DEFAULT false;
