-- RLS: evaluate the permission check ONCE per statement for chart_of_accounts, fiscal_periods and dues (approved scope: these three tables only).
--
-- Measured (docs/audits/phase3-evidence/task10-rls/diagnosis.md): the policies called has_permission() / has_any_permission() -- STABLE SECURITY DEFINER
-- functions with SET search_path, which Postgres can neither inline nor hoist -- once per scanned row (~190 microseconds each), so a permitted staff member
-- who may see 26 rows of chart_of_accounts still paid for all 13,473 rows of every tenant: an exact count took 5.7-8.5 s against the 8 s statement_timeout of
-- role `authenticated`, and tests/membership-status-access.integration.test.ts failed on it with HTTP 500 / 57014.
--
-- orgs_with_permission_keys(keys) returns the CALLER'S OWN organizations where an ACTIVE membership and a tenant-scoped role hold any listed key -- the same
-- authority model as has_permission() / has_any_permission() (identity only from auth.uid(); never PLATFORM_SUPER_ADMIN through a role). A policy then reads
--     (auth.uid() is not null and is_platform_admin(auth.uid())) OR organization_id IN (SELECT orgs_with_permission_keys(ARRAY[...]))
-- which Postgres evaluates as a hashed sub-plan, once per statement. Platform admins keep their unconditional branch (constant argument, evaluated once).
--
-- Nothing is widened: the set of rows each principal can read or write through these policies is unchanged (proved by
-- tests/rls-set-based-policies-equivalence.integration.test.ts, which compares the old and the new expressions row by row for staff, owners, invited /
-- suspended members, strangers and a platform admin). organization_id is NOT NULL on all three tables, so the NULL-organization case cannot arise.
-- The function has exactly the EXECUTE grants of has_permission() / has_any_permission() (authenticated and service_role; not anon, not PUBLIC).
-- Only these five policies change; every other policy, grant and the global timeout are untouched.

CREATE OR REPLACE FUNCTION public.orgs_with_permission_keys(p_permission_keys text[])
 RETURNS SETOF uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  select om.organization_id
    from public.organization_memberships om
   where auth.uid() is not null
     and om.user_id = auth.uid()
     and om.status = 'active'
     and exists (
       select 1
         from public.user_role_assignments ura
         join public.roles r on r.id = ura.role_id
         join public.role_permissions rp on rp.role_id = r.id
         join public.permissions p on p.id = rp.permission_id
        where ura.user_id = auth.uid()
          and ura.organization_id = om.organization_id
          and p.key = any (p_permission_keys)
          and (r.organization_id = om.organization_id
               or (r.organization_id is null and r.key <> 'PLATFORM_SUPER_ADMIN'))
     );
$function$;

REVOKE ALL ON FUNCTION public.orgs_with_permission_keys(text[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.orgs_with_permission_keys(text[]) TO authenticated, service_role;

-- chart_of_accounts ----------------------------------------------------------------------------------------------------------------------------------
ALTER POLICY chart_of_accounts_select_permission ON public.chart_of_accounts
  USING (
    (auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))
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
    ((auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))
      OR organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY['finance.accounts.manage'::text])))
    AND public.organization_is_active(organization_id)
  )
  WITH CHECK (
    ((auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))
      OR organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY['finance.accounts.manage'::text])))
    AND public.organization_is_active(organization_id)
  );

-- fiscal_periods -------------------------------------------------------------------------------------------------------------------------------------
ALTER POLICY fiscal_periods_select_permission ON public.fiscal_periods
  USING (
    (auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))
    OR organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY[
      'finance.periods.manage'::text, 'finance.reports.read'::text, 'finance.accounts.view'::text, 'finance.payments.read'::text,
      'receivables.payments.create'::text, 'finance.dues.read'::text, 'finance.dues.issue'::text, 'finance.expenses.read'::text,
      'finance.suppliers.read'::text, 'finance.einvoice.read'::text, 'finance.assets.read'::text, 'finance.entries.create'::text,
      'banking.accounts.view'::text, 'cashier.transactions.read'::text, 'operations.maintenance.costs.post'::text, 'finance.budgets.manage'::text]))
  );

ALTER POLICY fiscal_periods_manage ON public.fiscal_periods
  USING (
    ((auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))
      OR organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY['finance.periods.manage'::text])))
    AND public.organization_is_active(organization_id)
  )
  WITH CHECK (
    ((auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))
      OR organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY['finance.periods.manage'::text])))
    AND public.organization_is_active(organization_id)
  );

-- dues (only the staff-permission policy; the owner routes dues_select_own* are NOT touched) ------------------------------------------------------------
ALTER POLICY dues_select_permission ON public.dues
  USING (
    (auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))
    OR organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY['finance.dues.read'::text]))
  );
