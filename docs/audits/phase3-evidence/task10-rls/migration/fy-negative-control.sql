-- DELIBERATELY WRONG (negative control, scratch_rls only): narrow key list in the SELECT rule, no active-organization check and no platform-admin branch in the ALL rule
ALTER POLICY fiscal_years_select_permission ON public.fiscal_years
  USING ((SELECT auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid())) OR organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY['finance.accounts.view'::text])));
ALTER POLICY fiscal_years_manage ON public.fiscal_years
  USING (organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY['finance.periods.manage'::text])))
  WITH CHECK (organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY['finance.periods.manage'::text])));
