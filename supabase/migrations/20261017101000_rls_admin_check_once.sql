-- RLS: evaluate the platform-admin check ONCE per statement in the five policies changed by 20261017100900 (same five, nothing else).
--
-- Correction of the previous migration: its header says the platform-admin branch "is evaluated once". That is wrong. auth.uid() and is_platform_admin() are
-- STABLE (not IMMUTABLE), so inside a sequential-scan filter Postgres calls them for EVERY row (the plan's Filter showed the call inline, twice per row because
-- two permissive policies apply; the statement timeouts of tests/membership-status-access.integration.test.ts had `SQL function "is_platform_admin"` as their
-- CONTEXT). Wrapping the check in an uncorrelated scalar sub-select turns it into an InitPlan, executed once per statement:
--     (SELECT auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))
-- The sub-select references no column of the table (an InitPlan is by definition uncorrelated); tests/rls-set-based-policies-equivalence.integration.test.ts
-- asserts both facts: no column reference inside the sub-select in the catalog expression, and `InitPlan ... Result (actual rows=1 loops=1)` with no
-- is_platform_admin call in the scan's Filter, for a regular user, a platform admin and a stranger.
--
-- Semantics are unchanged: every row each principal could read, update or insert through these policies before is still readable / updatable / insertable and
-- nothing else is (same test, old expressions vs. new ones, both directions). No grant, no function and no timeout is touched.

-- chart_of_accounts ----------------------------------------------------------------------------------------------------------------------------------
ALTER POLICY chart_of_accounts_select_permission ON public.chart_of_accounts
  USING (
    (SELECT auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))
    OR organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY[
      'finance.accounts.view'::text, 'finance.reports.read'::text, 'finance.entries.create'::text, 'finance.dues.issue'::text,
      'receivables.dues.create'::text, 'receivables.payments.create'::text, 'finance.expenses.read'::text, 'finance.suppliers.read'::text,
      'finance.assets.read'::text, 'finance.assets.manage'::text, 'finance.service_charges.read'::text, 'finance.service_charges.manage'::text,
      'finance.einvoice.read'::text, 'finance.einvoice.manage'::text, 'finance.commissions.read'::text, 'finance.commissions.manage'::text,
      'finance.budgets.manage'::text, 'banking.accounts.view'::text, 'cashier.transactions.read'::text,
      'operations.maintenance.costs.manage'::text, 'operations.maintenance.costs.post'::text, 'operations.maintenance.owner_charge'::text,
      'property.leases.manage'::text, 'property.installments.manage'::text]))
  );

ALTER POLICY chart_of_accounts_manage ON public.chart_of_accounts
  USING (
    ((SELECT auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))
      OR organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY['finance.accounts.manage'::text])))
    AND public.organization_is_active(organization_id)
  )
  WITH CHECK (
    ((SELECT auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))
      OR organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY['finance.accounts.manage'::text])))
    AND public.organization_is_active(organization_id)
  );

-- fiscal_periods -------------------------------------------------------------------------------------------------------------------------------------
ALTER POLICY fiscal_periods_select_permission ON public.fiscal_periods
  USING (
    (SELECT auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))
    OR organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY[
      'finance.periods.manage'::text, 'finance.reports.read'::text, 'finance.accounts.view'::text, 'finance.payments.read'::text,
      'receivables.payments.create'::text, 'finance.dues.read'::text, 'finance.dues.issue'::text, 'finance.expenses.read'::text,
      'finance.suppliers.read'::text, 'finance.einvoice.read'::text, 'finance.assets.read'::text, 'finance.entries.create'::text,
      'banking.accounts.view'::text, 'cashier.transactions.read'::text, 'operations.maintenance.costs.post'::text, 'finance.budgets.manage'::text]))
  );

ALTER POLICY fiscal_periods_manage ON public.fiscal_periods
  USING (
    ((SELECT auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))
      OR organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY['finance.periods.manage'::text])))
    AND public.organization_is_active(organization_id)
  )
  WITH CHECK (
    ((SELECT auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))
      OR organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY['finance.periods.manage'::text])))
    AND public.organization_is_active(organization_id)
  );

-- dues (only the staff-permission policy; the owner routes dues_select_own* are NOT touched) ------------------------------------------------------------
ALTER POLICY dues_select_permission ON public.dues
  USING (
    (SELECT auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))
    OR organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY['finance.dues.read'::text]))
  );
