-- The audit ledger's whole point is that a row, once written, cannot move.
-- Enforcing that in the AuditService would only stop callers who go through
-- it; enforcing it here stops every caller, including a future migration,
-- a console script, or a bug. `REVOKE` blocks ordinary DML; the trigger
-- blocks the app's own connection role too, in case that role is ever
-- granted UPDATE/DELETE some other way.

REVOKE UPDATE, DELETE ON audit_events FROM PUBLIC;

CREATE OR REPLACE FUNCTION forbid_audit_mutation()
RETURNS trigger AS $$
BEGIN
  RAISE EXCEPTION 'audit_events is append-only: % is not permitted', TG_OP;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER audit_events_append_only
  BEFORE UPDATE OR DELETE ON audit_events
  FOR EACH ROW
  EXECUTE FUNCTION forbid_audit_mutation();
