-- PROTOTYPE (scratch_rls only): the admin check as an uncorrelated scalar sub-select -> an InitPlan evaluated once per statement
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
