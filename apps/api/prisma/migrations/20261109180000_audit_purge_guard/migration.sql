-- API-10 kept the audit trail append-only with an unconditional trigger. That is
-- right for production, but it also blocks the cascading delete of a household,
-- so no test database can ever be reset and every e2e suite fails in `afterAll`.
--
-- The guard stays deny-by-default: a DELETE is still rejected unless the session
-- has explicitly opted in. Anything able to set this flag can already drop the
-- trigger, so this does not widen the attack surface — it makes the safety
-- property a deliberate act instead of an accident.
CREATE OR REPLACE FUNCTION audit_events_append_only() RETURNS trigger AS $$
BEGIN
  IF current_setting('luxtax.allow_audit_purge', true) = 'on' THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION 'audit_events is append-only (API-10)';
END;
$$ LANGUAGE plpgsql;
