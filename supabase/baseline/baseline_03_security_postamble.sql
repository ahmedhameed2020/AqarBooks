-- Baseline file 3 of 5 — SECURITY POSTAMBLE
--
-- Applied AFTER the schema dump and the auth companion, BEFORE the seed.
--
-- The preamble fixed the default privileges so that objects are not born
-- granted to anon. This file re-states the deviations that differ from
-- production's OWN defaults and therefore cannot be produced by defaults
-- alone. Each one is a privilege that was explicitly taken away in production
-- and that pg_dump cannot serialise, because a removal leaves no artefact.
--
-- Every statement below was derived from production, not authored by hand:
--   * the ten functions are those where
--       has_function_privilege('authenticated', oid, 'EXECUTE') is false
--   * the two relations are those where a role holds fewer privileges than the
--     default ACL would grant
--
-- This file ENDS BY ASSERTING. A baseline that silently fails to harden is the
-- exact failure being repaired here, so it must refuse to complete rather than
-- leave the database quietly open.

-- ---------------------------------------------------------------------------
-- 1. Internal functions that must never be reachable by a signed-in client.
--    Source: Phase 1 migration 20260820191859 (which itself repaired an
--    over-grant introduced by 20260820190630). post_payment_internal and
--    post_journal_entry_internal are the unguarded internals that
--    record_payment and post_journal_entry exist to wrap — direct access
--    bypasses the RBAC guard entirely.
-- ---------------------------------------------------------------------------
REVOKE EXECUTE ON FUNCTION public.append_financial_audit_event(p_organization_id uuid, p_action text, p_entity_type text, p_resort_id uuid, p_entity_id uuid, p_request_id text, p_ip_address inet, p_user_agent text, p_metadata jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.create_journal_entry_internal(p_organization_id uuid, p_resort_id uuid, p_fiscal_period_id uuid, p_entry_date date, p_description text, p_source_type text, p_lines jsonb, p_idempotency_key text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_stale_member_invitations() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.expire_stale_online_payment_transactions() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.get_payment_provider_credentials(p_organization_id uuid, p_resort_id uuid, p_provider text, p_environment text) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.post_journal_entry_internal(p_journal_entry_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.post_payment_internal(p_organization_id uuid, p_resort_id uuid, p_member_id uuid, p_unit_id uuid, p_amount numeric, p_method text, p_payment_date date, p_deposit_account_id uuid, p_fiscal_period_id uuid, p_allocations jsonb, p_idempotency_key text, p_cashier_session_id uuid, p_actor_id uuid) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.record_online_payment(p_transaction_id uuid, p_webhook_event_id text, p_provider_payload jsonb) FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.run_lease_rent_generation() FROM authenticated;
REVOKE EXECUTE ON FUNCTION public.security_function_grant_inventory() FROM authenticated;

-- ---------------------------------------------------------------------------
-- 2. lease_rent_generation_runs — the table whose anon exposure was the
--    confirmed production P0 in Phase 1 (migration 20260820190307).
--    Target: anon nothing; authenticated SELECT only; service_role full.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.lease_rent_generation_runs FROM anon;
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.lease_rent_generation_runs FROM authenticated;
GRANT SELECT ON TABLE public.lease_rent_generation_runs TO authenticated;

-- ---------------------------------------------------------------------------
-- 3. member_invitation_short_links — reached only through SECURITY DEFINER
--    functions and the service role. No client role holds any privilege.
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.member_invitation_short_links FROM anon;
REVOKE ALL ON TABLE public.member_invitation_short_links FROM authenticated;

-- ---------------------------------------------------------------------------
-- 4. ASSERTIONS — this file fails loudly rather than completing quietly.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_anon_fns int;
  v_auth_fns int;
  v_bad text;
BEGIN
  -- 4a. anon must not be able to execute ANY application function.
  SELECT count(*) INTO v_anon_fns
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  LEFT JOIN pg_depend d ON d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e'
  WHERE n.nspname = 'public' AND d.objid IS NULL
    AND has_function_privilege('anon', p.oid, 'EXECUTE');

  IF v_anon_fns <> 0 THEN
    SELECT string_agg(p.proname, ', ' ORDER BY p.proname) INTO v_bad
    FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
    LEFT JOIN pg_depend d ON d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e'
    WHERE n.nspname = 'public' AND d.objid IS NULL
      AND has_function_privilege('anon', p.oid, 'EXECUTE');
    RAISE EXCEPTION
      'POSTAMBLE_FAILED: anon can execute % application function(s): %', v_anon_fns, left(v_bad, 400);
  END IF;

  -- 4b. authenticated must be able to execute exactly 193 of 203 — the ten
  --     revoked above are the difference. A count that drifts either way means
  --     the function surface changed without this file being updated.
  SELECT count(*) INTO v_auth_fns
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  LEFT JOIN pg_depend d ON d.objid = p.oid AND d.classid = 'pg_proc'::regclass AND d.deptype = 'e'
  WHERE n.nspname = 'public' AND d.objid IS NULL
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE');

  IF v_auth_fns <> 193 THEN
    RAISE EXCEPTION
      'POSTAMBLE_FAILED: authenticated can execute % application functions, expected 193.', v_auth_fns;
  END IF;

  -- 4c. Neither deviating relation may carry an anon grant.
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public'
      AND table_name IN ('lease_rent_generation_runs','member_invitation_short_links')
      AND grantee = 'anon'
  ) THEN
    RAISE EXCEPTION 'POSTAMBLE_FAILED: anon still holds a grant on a table that must have none.';
  END IF;

  -- 4d. authenticated on lease_rent_generation_runs must be exactly SELECT.
  IF (
    SELECT coalesce(string_agg(privilege_type, ',' ORDER BY privilege_type), '(none)')
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'lease_rent_generation_runs' AND grantee = 'authenticated'
  ) <> 'SELECT' THEN
    RAISE EXCEPTION 'POSTAMBLE_FAILED: authenticated privileges on lease_rent_generation_runs are not exactly SELECT.';
  END IF;

  -- 4e. member_invitation_short_links must grant authenticated nothing.
  IF EXISTS (
    SELECT 1 FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND table_name = 'member_invitation_short_links' AND grantee = 'authenticated'
  ) THEN
    RAISE EXCEPTION 'POSTAMBLE_FAILED: authenticated still holds a grant on member_invitation_short_links.';
  END IF;
END
$$;
