-- M4: the previous guard accepted a DELETE whenever the session had set
--   `SET LOCAL luxtax.allow_audit_purge = 'on'`.
-- Every role can set a custom GUC, so the flag only proved that a purge was
-- deliberate — not that the caller was allowed to perform one. Any application
-- credential could therefore erase the audit trail.
--
-- The flag now only counts for a session whose user is a member of the dedicated
-- role `luxtax_audit_purge`. That role is NOLOGIN: it is a permission, never an
-- account. Ordinary application credentials are not members and cannot purge;
-- a test or maintenance database grants the role to the account that resets it.
--
-- Deployment note: creating the role needs CREATEROLE (or superuser) on the
-- migration connection. Superusers bypass the membership check by definition.
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'luxtax_audit_purge') THEN
    CREATE ROLE luxtax_audit_purge NOLOGIN;
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION audit_events_append_only() RETURNS trigger AS $$
BEGIN
  IF current_setting('luxtax.allow_audit_purge', true) = 'on'
     AND pg_has_role(current_user, 'luxtax_audit_purge', 'member') THEN
    RETURN OLD;
  END IF;
  RAISE EXCEPTION
    'audit_events is append-only (API-10): DELETE requires membership in luxtax_audit_purge';
END;
$$ LANGUAGE plpgsql;
