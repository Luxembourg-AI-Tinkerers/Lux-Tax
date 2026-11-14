-- Clears a drift that predates the document-automation work.
--
-- `audit_events.actorId` became nullable in 20261110160000_login_failed_audit,
-- but its foreign key was left as ON DELETE RESTRICT. The schema declares
-- `actor User? @relation(...)`, and Prisma's referential action for an optional
-- relation is SET NULL, so `prisma migrate diff` reported a difference on every
-- run — which makes "zero drift" impossible to use as evidence.
--
-- RESTRICT would block a user deletion outright; SET NULL keeps the audit row
-- (the entry is still a record of something that happened) while dropping the
-- link to an account that no longer exists. Accounts are anonymised rather than
-- deleted, so no production row changes behaviour here.

ALTER TABLE "audit_events" DROP CONSTRAINT IF EXISTS "audit_events_actorId_fkey";

ALTER TABLE "audit_events"
  ADD CONSTRAINT "audit_events_actorId_fkey"
  FOREIGN KEY ("actorId") REFERENCES "users"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
