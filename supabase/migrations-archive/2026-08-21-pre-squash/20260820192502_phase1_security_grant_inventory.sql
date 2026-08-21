-- Phase 1 security remediation — migration 6 of 6
--
-- Adds a read-only inventory function so the function-grant posture can be
-- asserted automatically, instead of being re-derived by hand each time.
--
-- WHY THIS EXISTS
-- Migration 4 granted EXECUTE to `authenticated` on nine internal functions
-- (post_payment_internal, post_journal_entry_internal,
-- get_payment_provider_credentials among them) as an unintended side effect.
-- It was caught only by diffing two security-advisor runs by hand. A count
-- check would NOT have caught it in general: the total can stay at 169 while
-- a safe function is swapped for a dangerous one. The regression test that
-- accompanies this migration therefore asserts SET EQUALITY against a named
-- baseline allowlist, not a count.
--
-- SECURITY INVOKER on purpose: this function reads pg_catalog, which is
-- world-readable, so it needs no elevated rights -- and making it SECURITY
-- DEFINER would enlarge the very surface it exists to police. EXECUTE is
-- granted to service_role only, matching the posture set in migration 4.

CREATE OR REPLACE FUNCTION public.security_function_grant_inventory()
RETURNS TABLE (
  function_name text,
  is_security_definer boolean,
  anon_can_execute boolean,
  authenticated_can_execute boolean
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = 'public', 'pg_catalog'
AS $function$
  SELECT DISTINCT
    p.proname::text,
    p.prosecdef,
    has_function_privilege('anon', p.oid, 'EXECUTE'),
    has_function_privilege('authenticated', p.oid, 'EXECUTE')
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  LEFT JOIN pg_depend d
    ON d.objid = p.oid
   AND d.classid = 'pg_proc'::regclass
   AND d.deptype = 'e'
  WHERE n.nspname = 'public'
    AND d.objid IS NULL          -- application functions only
    AND p.prokind = 'f';
$function$;

REVOKE EXECUTE ON FUNCTION public.security_function_grant_inventory() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.security_function_grant_inventory() FROM anon;
REVOKE EXECUTE ON FUNCTION public.security_function_grant_inventory() FROM authenticated;
GRANT EXECUTE ON FUNCTION public.security_function_grant_inventory() TO service_role;
