-- API-10: append-only audit trail with a hash chain.
ALTER TABLE "audit_events" ADD COLUMN "prevHash" TEXT;
ALTER TABLE "audit_events" ADD COLUMN "hash" TEXT;

CREATE INDEX "audit_events_householdId_hash_idx" ON "audit_events"("householdId", "hash");

-- Refuse UPDATE and DELETE at the database level: the trail is evidence.
CREATE OR REPLACE FUNCTION audit_events_append_only() RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only (API-10)';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_no_update_delete
  BEFORE UPDATE OR DELETE ON "audit_events"
  FOR EACH ROW EXECUTE FUNCTION audit_events_append_only();
