-- DELIBERATELY WRONG (negative control, scratch_rls only): the migration's function, but a policy that forgets the platform-admin branch (dues) and
-- one that checks a single key (chart_of_accounts select), so roles without that key lose rows.
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
ALTER POLICY dues_select_permission ON public.dues USING (organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY['finance.dues.read'::text])));
ALTER POLICY chart_of_accounts_select_permission ON public.chart_of_accounts USING ((auth.uid() IS NOT NULL AND public.is_platform_admin(auth.uid())) OR organization_id IN (SELECT public.orgs_with_permission_keys(ARRAY['finance.accounts.view'::text])));
