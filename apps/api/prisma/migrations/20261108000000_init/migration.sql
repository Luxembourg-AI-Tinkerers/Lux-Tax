-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "public"."HouseholdRole" AS ENUM ('PRIMARY_FILER', 'CO_FILER', 'VIEWER');

-- CreateEnum
CREATE TYPE "public"."MembershipStatus" AS ENUM ('PENDING_INVITATION', 'ACTIVE', 'REMOVED');

-- CreateEnum
CREATE TYPE "public"."WorkspaceStatus" AS ENUM ('DRAFT', 'COLLECTING', 'NEEDS_REVIEW', 'READY_TO_CALCULATE', 'CALCULATED', 'HOUSEHOLD_REVIEW', 'APPROVED', 'FILING_PACKAGE_READY', 'FILED', 'ASSESSED', 'CLOSED');

-- CreateEnum
CREATE TYPE "public"."AuditEventType" AS ENUM ('USER_REGISTERED', 'USER_LOGGED_IN', 'USER_LOGGED_OUT', 'HOUSEHOLD_CREATED', 'MEMBER_INVITED', 'MEMBER_JOINED', 'MEMBER_REMOVED', 'WORKSPACE_INITIALIZED', 'DOCUMENT_UPLOADED', 'DOCUMENT_DELETED', 'FACT_CREATED', 'FACT_CONFIRMED', 'FACT_UPDATED', 'TAX_CALCULATED', 'RETURN_APPROVED', 'APPROVAL_INVALIDATED', 'FILING_PACKAGE_GENERATED', 'ASSESSMENT_IMPORTED');

-- CreateEnum
CREATE TYPE "public"."TaxResidence" AS ENUM ('RESIDENT', 'NON_RESIDENT');

-- CreateEnum
CREATE TYPE "public"."TaxClass" AS ENUM ('CLASS_1', 'CLASS_1A', 'CLASS_2');

-- CreateEnum
CREATE TYPE "public"."DocumentVisibility" AS ENUM ('PRIVATE_DRAFT', 'SHARED_FOR_DISCUSSION', 'PROPOSED_FOR_RETURN', 'INCLUDED_IN_RETURN', 'ARCHIVED');

-- CreateEnum
CREATE TYPE "public"."DocumentType" AS ENUM ('SALARY_CERTIFICATE', 'PENSION_CERTIFICATE', 'MORTGAGE_CERTIFICATE', 'INSURANCE_CERTIFICATE', 'DONATION_CERTIFICATE', 'CHILDCARE_INVOICE', 'TAX_ASSESSMENT', 'FREELANCE_INVOICE', 'BUSINESS_EXPENSE', 'PROFIT_AND_LOSS_STATEMENT', 'VAT_RETURN', 'BUSINESS_TAX_ADVANCE', 'FREELANCE_CONTRACT', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "public"."DocumentStatus" AS ENUM ('UPLOADED', 'PROCESSING', 'EXTRACTED', 'FAILED', 'CONFIRMED');

-- CreateEnum
CREATE TYPE "public"."FactCategory" AS ENUM ('EMPLOYMENT_INCOME', 'FREELANCE_INCOME', 'BUSINESS_EXPENSE', 'PENSION_INCOME', 'MORTGAGE_DEDUCTION', 'INSURANCE_DEDUCTION', 'DONATION_DEDUCTION', 'CHILDCARE_EXPENSE', 'OTHER_DEDUCTION');

-- CreateEnum
CREATE TYPE "public"."TaskSeverity" AS ENUM ('BLOCKER', 'WARNING', 'INFO');

-- CreateEnum
CREATE TYPE "public"."TaskType" AS ENUM ('MISSING_SALARY_CERTIFICATE', 'MISSING_MORTGAGE_CERTIFICATE', 'UNCONFIRMED_FACT', 'MISSING_SPOUSE_INCOME', 'MISSING_RESIDENCE_INFO', 'RETURN_APPROVAL_REQUIRED', 'MISSING_FREELANCE_DOCUMENT');

-- CreateTable
CREATE TABLE "public"."users" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "isEmailVerified" BOOLEAN NOT NULL DEFAULT false,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."sessions" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "refreshTokenHash" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."person_profiles" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "firstName" TEXT,
    "lastName" TEXT,
    "dateOfBirth" TIMESTAMP(3),
    "matriculeEncrypted" TEXT,
    "taxResidence" "public"."TaxResidence" NOT NULL DEFAULT 'RESIDENT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "person_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."households" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "createdById" UUID NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "households_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."household_memberships" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "public"."HouseholdRole" NOT NULL DEFAULT 'CO_FILER',
    "status" "public"."MembershipStatus" NOT NULL DEFAULT 'ACTIVE',
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "household_memberships_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."household_invitations" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "invitedEmail" TEXT NOT NULL,
    "invitedRole" "public"."HouseholdRole" NOT NULL DEFAULT 'CO_FILER',
    "tokenHash" TEXT NOT NULL,
    "invitedById" UUID NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "household_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."dependants" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "relationshipType" TEXT NOT NULL DEFAULT 'CHILD',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "dependants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tax_year_workspaces" (
    "id" UUID NOT NULL,
    "householdId" UUID NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "status" "public"."WorkspaceStatus" NOT NULL DEFAULT 'DRAFT',
    "completionScore" INTEGER NOT NULL DEFAULT 0,
    "activeReturnVersion" INTEGER NOT NULL DEFAULT 1,
    "residenceStatus" "public"."TaxResidence" NOT NULL DEFAULT 'RESIDENT',
    "taxClass" "public"."TaxClass",
    "estimatedTaxBalance" DECIMAL(12,2),
    "calculationResult" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_year_workspaces_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."documents" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "uploaderId" UUID NOT NULL,
    "ownerId" UUID,
    "fileName" TEXT NOT NULL,
    "originalName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "sha256Hash" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "documentType" "public"."DocumentType" NOT NULL DEFAULT 'UNKNOWN',
    "status" "public"."DocumentStatus" NOT NULL DEFAULT 'UPLOADED',
    "visibility" "public"."DocumentVisibility" NOT NULL DEFAULT 'PRIVATE_DRAFT',
    "pageCount" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."document_extractions" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "extractedText" TEXT NOT NULL,
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "rawJson" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "document_extractions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."extracted_facts" (
    "id" UUID NOT NULL,
    "documentId" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "ownerId" UUID,
    "fieldName" TEXT NOT NULL,
    "fieldValue" TEXT NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "confidence" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "sourcePage" INTEGER,
    "sourceSnippet" TEXT,
    "isConfirmed" BOOLEAN NOT NULL DEFAULT false,
    "confirmedAt" TIMESTAMP(3),
    "confirmedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "extracted_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."confirmed_facts" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "ownerId" UUID,
    "category" "public"."FactCategory" NOT NULL,
    "fieldKey" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'EUR',
    "taxYear" INTEGER NOT NULL,
    "sourceDocumentId" UUID,
    "extractedFactId" UUID,
    "isSharedWithHousehold" BOOLEAN NOT NULL DEFAULT true,
    "isIncludedInReturn" BOOLEAN NOT NULL DEFAULT true,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "confirmed_facts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."tax_profiles" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "maritalStatus" TEXT NOT NULL DEFAULT 'SINGLE',
    "answersJson" JSONB NOT NULL DEFAULT '{}',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tax_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."missing_information_items" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "taskType" "public"."TaskType" NOT NULL,
    "severity" "public"."TaskSeverity" NOT NULL DEFAULT 'WARNING',
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "isResolved" BOOLEAN NOT NULL DEFAULT false,
    "assignedToUserId" UUID,
    "relatedDocumentType" "public"."DocumentType",
    "relatedFactId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),

    CONSTRAINT "missing_information_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."return_versions" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "versionNumber" INTEGER NOT NULL DEFAULT 1,
    "isFrozen" BOOLEAN NOT NULL DEFAULT false,
    "factsSnapshotJson" JSONB NOT NULL DEFAULT '[]',
    "calculationSnapshotJson" JSONB NOT NULL DEFAULT '{}',
    "generatedPackageHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "return_versions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."return_approvals" (
    "id" UUID NOT NULL,
    "returnVersionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "approvedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isSuperseded" BOOLEAN NOT NULL DEFAULT false,
    "supersededAt" TIMESTAMP(3),
    "supersedingReason" TEXT,

    CONSTRAINT "return_approvals_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."filing_packages" (
    "id" UUID NOT NULL,
    "returnVersionId" UUID NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "taxClass" "public"."TaxClass" NOT NULL,
    "form100BoxesJson" JSONB NOT NULL DEFAULT '[]',
    "myGuichetGuideJson" JSONB NOT NULL DEFAULT '[]',
    "packageSha256" TEXT NOT NULL,
    "generatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "filing_packages_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."assessments" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "taxYear" INTEGER NOT NULL,
    "bulletinDate" TIMESTAMP(3) NOT NULL,
    "assessedTaxableIncome" DECIMAL(12,2) NOT NULL,
    "assessedTaxDue" DECIMAL(12,2) NOT NULL,
    "differenceWithDeclared" DECIMAL(12,2) NOT NULL,
    "discrepanciesJson" JSONB NOT NULL DEFAULT '[]',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "assessments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."audit_events" (
    "id" UUID NOT NULL,
    "householdId" UUID,
    "workspaceId" UUID,
    "actorId" UUID NOT NULL,
    "actorEmail" TEXT,
    "eventType" "public"."AuditEventType" NOT NULL,
    "entityType" TEXT NOT NULL,
    "entityId" TEXT NOT NULL,
    "previousValue" JSONB,
    "newValue" JSONB,
    "description" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."freelance_business_profiles" (
    "id" UUID NOT NULL,
    "workspaceId" UUID NOT NULL,
    "ownerId" UUID NOT NULL,
    "businessName" TEXT NOT NULL,
    "activityType" TEXT NOT NULL,
    "taxIdOrVat" TEXT,
    "accountingType" TEXT NOT NULL DEFAULT 'CASH_BASIS',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "freelance_business_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."custom_ai_models" (
    "id" VARCHAR(64) NOT NULL,
    "display_name" VARCHAR(255) NOT NULL,
    "provider_type" VARCHAR(64) NOT NULL,
    "model_identifier" VARCHAR(255) NOT NULL,
    "endpoint_url" TEXT,
    "api_key" TEXT,
    "capabilities" JSONB NOT NULL DEFAULT '[]',
    "permitted_data_class" VARCHAR(64) NOT NULL,
    "hosting_region" VARCHAR(64) NOT NULL,
    "status" VARCHAR(32) NOT NULL DEFAULT 'ACTIVE',
    "healthy" BOOLEAN NOT NULL DEFAULT true,
    "is_custom" BOOLEAN NOT NULL DEFAULT true,
    "latency_ms" INTEGER DEFAULT 0,
    "last_tested_at" TIMESTAMPTZ,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_ai_models_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "public"."custom_ai_routes" (
    "id" VARCHAR(64) NOT NULL,
    "task_name" VARCHAR(128) NOT NULL,
    "primary_model_id" VARCHAR(64) NOT NULL,
    "fallback_model_ids" JSONB NOT NULL DEFAULT '[]',
    "prompt_version" VARCHAR(64) NOT NULL,
    "output_schema_version" VARCHAR(64) NOT NULL,
    "timeout_ms" INTEGER NOT NULL DEFAULT 8000,
    "max_data_class" VARCHAR(64) NOT NULL DEFAULT 'CUSTOMER_DOCUMENT',
    "active_rollout_percentage" INTEGER NOT NULL DEFAULT 100,
    "created_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "custom_ai_routes_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "public"."users"("email");

-- CreateIndex
CREATE INDEX "sessions_userId_idx" ON "public"."sessions"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "person_profiles_userId_key" ON "public"."person_profiles"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "households_slug_key" ON "public"."households"("slug");

-- CreateIndex
CREATE INDEX "household_memberships_userId_idx" ON "public"."household_memberships"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "household_memberships_householdId_userId_key" ON "public"."household_memberships"("householdId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "household_invitations_tokenHash_key" ON "public"."household_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX "household_invitations_householdId_idx" ON "public"."household_invitations"("householdId");

-- CreateIndex
CREATE INDEX "household_invitations_invitedEmail_idx" ON "public"."household_invitations"("invitedEmail");

-- CreateIndex
CREATE INDEX "dependants_householdId_idx" ON "public"."dependants"("householdId");

-- CreateIndex
CREATE INDEX "tax_year_workspaces_householdId_idx" ON "public"."tax_year_workspaces"("householdId");

-- CreateIndex
CREATE UNIQUE INDEX "tax_year_workspaces_householdId_taxYear_key" ON "public"."tax_year_workspaces"("householdId", "taxYear");

-- CreateIndex
CREATE INDEX "documents_workspaceId_idx" ON "public"."documents"("workspaceId");

-- CreateIndex
CREATE INDEX "documents_uploaderId_idx" ON "public"."documents"("uploaderId");

-- CreateIndex
CREATE INDEX "documents_sha256Hash_idx" ON "public"."documents"("sha256Hash");

-- CreateIndex
CREATE INDEX "document_extractions_documentId_idx" ON "public"."document_extractions"("documentId");

-- CreateIndex
CREATE INDEX "extracted_facts_workspaceId_idx" ON "public"."extracted_facts"("workspaceId");

-- CreateIndex
CREATE INDEX "extracted_facts_documentId_idx" ON "public"."extracted_facts"("documentId");

-- CreateIndex
CREATE UNIQUE INDEX "confirmed_facts_extractedFactId_key" ON "public"."confirmed_facts"("extractedFactId");

-- CreateIndex
CREATE INDEX "confirmed_facts_workspaceId_idx" ON "public"."confirmed_facts"("workspaceId");

-- CreateIndex
CREATE INDEX "confirmed_facts_ownerId_idx" ON "public"."confirmed_facts"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "tax_profiles_workspaceId_key" ON "public"."tax_profiles"("workspaceId");

-- CreateIndex
CREATE INDEX "missing_information_items_workspaceId_idx" ON "public"."missing_information_items"("workspaceId");

-- CreateIndex
CREATE INDEX "return_versions_workspaceId_idx" ON "public"."return_versions"("workspaceId");

-- CreateIndex
CREATE UNIQUE INDEX "return_versions_workspaceId_versionNumber_key" ON "public"."return_versions"("workspaceId", "versionNumber");

-- CreateIndex
CREATE INDEX "return_approvals_returnVersionId_idx" ON "public"."return_approvals"("returnVersionId");

-- CreateIndex
CREATE INDEX "return_approvals_userId_idx" ON "public"."return_approvals"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "return_approvals_returnVersionId_userId_key" ON "public"."return_approvals"("returnVersionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "filing_packages_returnVersionId_key" ON "public"."filing_packages"("returnVersionId");

-- CreateIndex
CREATE INDEX "assessments_workspaceId_idx" ON "public"."assessments"("workspaceId");

-- CreateIndex
CREATE INDEX "audit_events_householdId_createdAt_idx" ON "public"."audit_events"("householdId", "createdAt");

-- CreateIndex
CREATE INDEX "audit_events_actorId_idx" ON "public"."audit_events"("actorId");

-- CreateIndex
CREATE INDEX "freelance_business_profiles_workspaceId_idx" ON "public"."freelance_business_profiles"("workspaceId");

-- CreateIndex
CREATE INDEX "freelance_business_profiles_ownerId_idx" ON "public"."freelance_business_profiles"("ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "freelance_business_profiles_workspaceId_ownerId_key" ON "public"."freelance_business_profiles"("workspaceId", "ownerId");

-- CreateIndex
CREATE UNIQUE INDEX "custom_ai_routes_task_name_key" ON "public"."custom_ai_routes"("task_name");

-- AddForeignKey
ALTER TABLE "public"."sessions" ADD CONSTRAINT "sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."person_profiles" ADD CONSTRAINT "person_profiles_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."households" ADD CONSTRAINT "households_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."household_memberships" ADD CONSTRAINT "household_memberships_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."household_memberships" ADD CONSTRAINT "household_memberships_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."household_invitations" ADD CONSTRAINT "household_invitations_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."household_invitations" ADD CONSTRAINT "household_invitations_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."dependants" ADD CONSTRAINT "dependants_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tax_year_workspaces" ADD CONSTRAINT "tax_year_workspaces_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."households"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."documents" ADD CONSTRAINT "documents_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."tax_year_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."documents" ADD CONSTRAINT "documents_uploaderId_fkey" FOREIGN KEY ("uploaderId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."documents" ADD CONSTRAINT "documents_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."document_extractions" ADD CONSTRAINT "document_extractions_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."extracted_facts" ADD CONSTRAINT "extracted_facts_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "public"."documents"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."extracted_facts" ADD CONSTRAINT "extracted_facts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."tax_year_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."confirmed_facts" ADD CONSTRAINT "confirmed_facts_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."tax_year_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."confirmed_facts" ADD CONSTRAINT "confirmed_facts_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."confirmed_facts" ADD CONSTRAINT "confirmed_facts_sourceDocumentId_fkey" FOREIGN KEY ("sourceDocumentId") REFERENCES "public"."documents"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."confirmed_facts" ADD CONSTRAINT "confirmed_facts_extractedFactId_fkey" FOREIGN KEY ("extractedFactId") REFERENCES "public"."extracted_facts"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."tax_profiles" ADD CONSTRAINT "tax_profiles_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."tax_year_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."missing_information_items" ADD CONSTRAINT "missing_information_items_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."tax_year_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."return_versions" ADD CONSTRAINT "return_versions_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."tax_year_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."return_approvals" ADD CONSTRAINT "return_approvals_returnVersionId_fkey" FOREIGN KEY ("returnVersionId") REFERENCES "public"."return_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."return_approvals" ADD CONSTRAINT "return_approvals_userId_fkey" FOREIGN KEY ("userId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."filing_packages" ADD CONSTRAINT "filing_packages_returnVersionId_fkey" FOREIGN KEY ("returnVersionId") REFERENCES "public"."return_versions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."assessments" ADD CONSTRAINT "assessments_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."tax_year_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_events" ADD CONSTRAINT "audit_events_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "public"."users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_events" ADD CONSTRAINT "audit_events_householdId_fkey" FOREIGN KEY ("householdId") REFERENCES "public"."households"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."audit_events" ADD CONSTRAINT "audit_events_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."tax_year_workspaces"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."freelance_business_profiles" ADD CONSTRAINT "freelance_business_profiles_workspaceId_fkey" FOREIGN KEY ("workspaceId") REFERENCES "public"."tax_year_workspaces"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "public"."freelance_business_profiles" ADD CONSTRAINT "freelance_business_profiles_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "public"."users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

