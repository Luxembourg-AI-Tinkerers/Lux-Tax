-- Auth hardening.
--
-- 1. E-mail verification becomes real: a one-time token hash plus an expiry, so
--    an account can prove it controls its address. Platform administration and
--    invitation acceptance both depend on that proof.
-- 2. Access tokens become revocable: `tokenVersion` is embedded in the JWT and
--    compared on every request, so a logout can invalidate tokens already issued.
-- 3. Refresh rotation gains a family id, so replaying a revoked token can revoke
--    every descendant instead of only failing that one request.

-- AlterTable
ALTER TABLE "users" ADD COLUMN "emailVerificationTokenHash" TEXT;
ALTER TABLE "users" ADD COLUMN "emailVerificationExpiresAt" TIMESTAMP(3);
ALTER TABLE "users" ADD COLUMN "tokenVersion" INTEGER NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "users_emailVerificationTokenHash_key" ON "users"("emailVerificationTokenHash");

-- AlterTable
ALTER TABLE "sessions" ADD COLUMN "familyId" TEXT;

-- CreateIndex
CREATE INDEX "sessions_familyId_idx" ON "sessions"("familyId");
