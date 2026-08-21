-- Baseline file 0 of 5 — SECURITY PREAMBLE
--
-- MUST BE APPLIED BEFORE ANY OBJECT IS CREATED. Order is the entire point of
-- this file; running it later makes it a no-op with respect to objects that
-- already exist.
--
-- WHY THIS FILE EXISTS
-- The Step 5 gate failed because a database rebuilt from the schema dump alone
-- had `anon` able to EXECUTE all 203 application functions, where production
-- allows it zero. The dump was not at fault: it faithfully emits
--   REVOKE ALL ON FUNCTION ... FROM PUBLIC;
--   GRANT  ALL ON FUNCTION ... TO "authenticated";   -- never to anon
-- and it even carries the correct ALTER DEFAULT PRIVILEGES. The problem is
-- that those statements sit at the END of the dump (line ~20913) while objects
-- are created from line 55. So every function is born carrying the platform's
-- default ACL — which grants anon — and nothing afterwards takes it away:
-- REVOKE ... FROM PUBLIC does not touch a role-specific grant, and omitting a
-- GRANT does not remove one that already exists.
--
-- Correcting the default privileges FIRST means the objects are never granted
-- to anon at all, and the dump's own GRANT statements then produce exactly the
-- intended access. That replaces what would otherwise be 203 explicit REVOKEs
-- with the two statements below.
--
-- WHY REVOKE AND NOT MERELY "OMIT THE GRANT"
-- pg_dump can only express privileges that exist. Production's state was
-- produced by an explicit revocation (migration 20260820190630), and a removed
-- privilege leaves no artefact to serialise. It must therefore be re-stated
-- here as an action, not inferred from an absence.
--
-- TARGET STATE — read from production pg_default_acl (defaclrole = postgres):
--   S  {postgres=rwU, anon=rwU, authenticated=rwU, service_role=rwU}
--   f  {postgres=X,             authenticated=X,   service_role=X}   <- no anon
--   r  {postgres=arwdDxtm, anon=arwdDxtm, authenticated=arwdDxtm, service_role=arwdDxtm}
--
-- Only `f` deviates from the platform default, and only for anon.

-- Phase 1 hardening (migration 20260820190630): functions created in this
-- schema must not be executable by anon by default.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM anon;

-- The same migration also revoked from PUBLIC. Restated for the same reason:
-- it is a removal, so the dump cannot carry it.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- Verify the preamble actually took effect before anything is built on top of
-- it. If the default ACL still admits anon, every function created afterwards
-- inherits the defect, and the failure would surface only at the gate — or,
-- worse, not at all.
DO $$
DECLARE
  v_acl text;
BEGIN
  SELECT d.defaclacl::text INTO v_acl
  FROM pg_default_acl d
  JOIN pg_namespace n ON n.oid = d.defaclnamespace
  WHERE n.nspname = 'public'
    AND d.defaclobjtype = 'f'
    AND pg_get_userbyid(d.defaclrole) = 'postgres';

  IF v_acl IS NOT NULL AND v_acl LIKE '%anon=%' THEN
    RAISE EXCEPTION
      'PREAMBLE_FAILED: default privileges on FUNCTIONS still grant anon (%). Objects created now would inherit it.', v_acl;
  END IF;
END
$$;
