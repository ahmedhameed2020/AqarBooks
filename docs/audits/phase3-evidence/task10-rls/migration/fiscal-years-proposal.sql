-- PROPOSAL ONLY (not in supabase/migrations, not applied anywhere). Needs approval: fiscal_years is outside the tables approved so far.
-- Independent equivalence proof, writes included: tests/rls-fiscal-years-equivalence.integration.test.ts (negative control fails as required).

ALTER POLICY fiscal_years_select_permission ON public.fiscal_years
  USING (
    (SELECT auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid()))
    OR organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY[
         'finance.periods.manage'::text, 'finance.reports.read'::text, 'finance.accounts.view'::text]))
  );

ALTER POLICY fiscal_years_manage ON public.fiscal_years
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
