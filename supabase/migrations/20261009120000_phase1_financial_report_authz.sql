-- Phase 1: financial-report authorization and tenant isolation.
--
-- Background (see docs/audits/AqarBooks-Capability-Gap-Audit-2026-10-09.md):
--   20261001123000_final_hardening_sprint.sql rewrote get_trial_balance as a
--   LANGUAGE sql SECURITY DEFINER function and dropped the has_permission guard the
--   baseline had. EXECUTE stayed granted to `authenticated`, so any signed-in user could
--   read any organization's trial balance by passing its UUID.
--
-- This migration is forward-only; no earlier migration is edited.

-- ---------------------------------------------------------------------------
-- 1. get_trial_balance: restore authorization, keep the corrected POSTED/in-period
--    semantics from 20261001123000. Identity comes only from auth.uid(); the
--    organization id is an input to authorize, never proof of access.
--    has_permission() requires an ACTIVE membership in that exact organization
--    (suspended / invited memberships are refused) plus finance.reports.read, or a
--    platform admin. service_role is the trusted server key and bypasses, matching
--    verify_financial_audit_chain.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_trial_balance(
  p_organization_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS TABLE(
  account_id uuid,
  code text,
  name_ar text,
  name_en text,
  category text,
  normal_balance text,
  total_debit numeric,
  total_credit numeric,
  balance numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF coalesce(auth.role(), '') <> 'service_role' THEN
    IF auth.uid() IS NULL THEN
      RAISE EXCEPTION 'UNAUTHORIZED' USING errcode = '42501';
    END IF;
    IF p_organization_id IS NULL
       OR NOT public.has_permission(auth.uid(), p_organization_id, 'finance.reports.read') THEN
      RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION' USING errcode = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    a.id,
    a.code,
    a.name_ar,
    a.name_en,
    a.category,
    a.normal_balance,
    COALESCE(SUM(l.debit), 0),
    COALESCE(SUM(l.credit), 0),
    CASE WHEN a.normal_balance = 'DEBIT'
      THEN COALESCE(SUM(l.debit), 0) - COALESCE(SUM(l.credit), 0)
      ELSE COALESCE(SUM(l.credit), 0) - COALESCE(SUM(l.debit), 0)
    END
  FROM public.chart_of_accounts a
  LEFT JOIN public.journal_entry_lines l
    ON l.account_id = a.id
   AND EXISTS (
     SELECT 1
     FROM public.journal_entries je
     WHERE je.id = l.journal_entry_id
       AND je.organization_id = p_organization_id
       AND je.status = 'POSTED'
       AND je.entry_date BETWEEN p_start_date AND p_end_date
   )
  WHERE a.organization_id = p_organization_id
    AND NOT a.is_group
  GROUP BY a.id, a.code, a.name_ar, a.name_en, a.category, a.normal_balance
  ORDER BY a.code;
END;
$$;
ALTER FUNCTION public.get_trial_balance(uuid, date, date) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.get_trial_balance(uuid, date, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_trial_balance(uuid, date, date) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. Finance helper functions that are SECURITY DEFINER, take only an organization /
--    document id, perform no authorization check, and are not called by the application
--    or by any invoker-context function, policy, view or default. They are reached only
--    from other SECURITY DEFINER functions (which run as owner) or service_role, so the
--    client-callable surface is removed rather than guarded. Each returned balances,
--    account ids, rates, buyer identity or WIP for whichever id the caller supplied.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.due_outstanding(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.creditable_remaining(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.depreciable_remaining(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.depreciation_for_period(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_due_buyer(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.project_wip_summary(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_fx_readiness(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.check_asset_disposal_readiness(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_input_tax_account(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.resolve_output_tax_account(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_exchange_rate(uuid, text, text, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.convert_to_base(uuid, numeric, text, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.compute_input_tax_split(uuid, uuid, uuid, text, numeric, integer)
  FROM PUBLIC, anon, authenticated;

GRANT EXECUTE ON FUNCTION public.due_outstanding(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.creditable_remaining(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.depreciable_remaining(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.depreciation_for_period(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_due_buyer(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.project_wip_summary(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_fx_readiness(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.check_asset_disposal_readiness(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_input_tax_account(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.resolve_output_tax_account(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_exchange_rate(uuid, text, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.convert_to_base(uuid, numeric, text, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.compute_input_tax_split(uuid, uuid, uuid, text, numeric, integer)
  TO service_role;

-- ---------------------------------------------------------------------------
-- 3. financial_audit_logs: SELECT was granted to every ACTIVE member of the organization
--    (a gate operator or technician could read the financial audit chain). Require the
--    same permission verify_financial_audit_chain requires. Nothing in the application
--    reads this table with a user session.
-- ---------------------------------------------------------------------------
DROP POLICY IF EXISTS "Admins and managers can read financial audit logs" ON public.financial_audit_logs;
DROP POLICY IF EXISTS "Finance auditors can read financial audit logs" ON public.financial_audit_logs;
CREATE POLICY "Finance auditors can read financial audit logs"
  ON public.financial_audit_logs
  FOR SELECT
  USING (
    public.has_permission(auth.uid(), organization_id, 'finance.audit.read')
    OR public.has_permission(auth.uid(), organization_id, 'finance.reports.read')
  );

-- ---------------------------------------------------------------------------
-- 4. Found while verifying grants. 20261001123000 ran
--      REVOKE ALL ON FUNCTION replace_role_permissions_atomic(...) FROM PUBLIC, anon;
--    but Supabase's default privileges also grant EXECUTE to `authenticated`, which that
--    REVOKE does not remove. The function performs no caller authorization (the server
--    action checks tenant.roles.manage and then calls it with the service-role client), so
--    any signed-in user could rewrite the permission set of any custom role in any
--    organization. Restrict to service_role, as the migration intended.
--    enforce_unit_ownership_total is a trigger function; it must not be an anon/client RPC.
-- ---------------------------------------------------------------------------
REVOKE ALL ON FUNCTION public.replace_role_permissions_atomic(uuid, uuid, uuid[]) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_role_permissions_atomic(uuid, uuid, uuid[]) TO service_role;
REVOKE ALL ON FUNCTION public.enforce_unit_ownership_total() FROM PUBLIC, anon, authenticated;
