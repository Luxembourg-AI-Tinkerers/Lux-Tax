-- MFA (TOTP) becomes real.
--
-- totp.ts was complete, tested and imported by nothing: no column, no enrol
-- route, no challenge at login, while .env.example advertised MFA_ENABLED. These
-- columns make the advertised control implementable; the secret is stored sealed
-- (AES-256-GCM, key derived from JWT_ACCESS_SECRET) and recovery codes are kept
-- as SHA-256 hashes only.

ALTER TABLE "users" ADD COLUMN "mfaSecret" TEXT;
ALTER TABLE "users" ADD COLUMN "mfaEnabled" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "users" ADD COLUMN "mfaRecoveryCodes" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
