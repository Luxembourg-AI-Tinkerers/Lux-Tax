-- L3: record rejected logins.
--
-- 1. A new event type for a refusal. The value is added to the existing enum;
--    `IF NOT EXISTS` keeps the migration re-runnable on a database where a
--    partial apply already happened.
-- 2. `actorId` becomes nullable: a login attempt against an address that matches
--    no account has no user to point at, and dropping those rows would remove
--    exactly the signal that matters — an enumeration or credential-stuffing run.
--
-- Existing rows keep their actor, and the hash chain is unaffected: the canonical
-- payload hashes the id when present and null when absent.

ALTER TYPE "AuditEventType" ADD VALUE IF NOT EXISTS 'USER_LOGIN_FAILED';

ALTER TABLE "audit_events" ALTER COLUMN "actorId" DROP NOT NULL;
