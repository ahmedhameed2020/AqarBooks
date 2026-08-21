-- Phase 1 security remediation — migration 4 of 4
--
-- Removes anonymous execute access to application RPCs.
--
-- BEFORE: 165 of 180 SECURITY DEFINER functions were executable by `anon`.
-- Most fail closed on their own auth.uid() check, but a minority carried no
-- caller check at all and, being SECURITY DEFINER, bypassed RLS by
-- definition. Verified live against production with only the public
-- publishable key:
--   due_outstanding(uuid)               -> HTTP 200 (executes)
--   verify_financial_audit_chain(uuid)  -> HTTP 200 (executes)
-- plus allocate_document_number / next_sequence_value, which MUTATE document
-- counters -- an unauthenticated caller could advance invoice and receipt
-- sequences, creating permanent gaps in statutory numbering.
--
-- WHY THIS REVOKES FROM PUBLIC AS WELL AS anon:
-- The observed ACL is {=X/postgres, postgres=X/postgres, anon=X/postgres,
-- authenticated=X/postgres, service_role=X/postgres}. The leading "=X" is a
-- grant to PUBLIC, which anon inherits. Revoking from `anon` alone would have
-- left EXECUTE reachable through PUBLIC and produced a fix that fixed
-- nothing. Both are revoked here.
--
-- NO EXCEPTION IS GRANTED TO anon. Pre-flight established that the invitation
-- flow calls accept_member_invitation only after auth.setSession() and
-- auth.updateUser() have both succeeded, so the caller is already
-- `authenticated` at that point and never `anon`.
--
-- Scope: application functions only. Functions owned by extensions
-- (btree_gist's gbt_* / gbtreekey* support routines) are deliberately left
-- alone -- they are invoked by the index machinery rather than called
-- directly, and they are not ours to re-permission.
--
-- The `authenticated` surface is INTENTIONALLY UNCHANGED. All 44 server-side
-- callers use the SSR client under the user's JWT and must keep working.
-- Narrowing `authenticated` is Phase 2 work and is not in scope here.

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure::text AS sig
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN pg_depend d
      ON d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e'
    WHERE n.nspname = 'public'
      AND d.objid IS NULL          -- application functions only
      AND p.prokind = 'f'
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', r.sig);
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM anon', r.sig);
    -- preserve the surfaces the application actually uses
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', r.sig);
  END LOOP;
END
$$;

-- Future functions must not inherit anonymous execute access.
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM anon;
