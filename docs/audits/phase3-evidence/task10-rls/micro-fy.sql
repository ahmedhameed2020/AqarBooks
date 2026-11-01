begin;
select set_config('request.jwt.claims','{"sub":"2c63a9fa-3d09-49be-81a2-d446bf6f9dd0","role":"authenticated"}',true);
\timing on
select count(*) from public.fiscal_years where organization_id is not null;
select count(*) from public.fiscal_years where public.has_any_permission(organization_id, array['finance.periods.manage','finance.reports.read','finance.accounts.view']);
select count(*) from public.fiscal_years where public.has_permission(auth.uid(), organization_id, 'finance.periods.manage');
select count(*) from public.fiscal_years where public.organization_is_active(organization_id);
select count(*) from public.fiscal_years where public.is_platform_admin(case when organization_id is not null then auth.uid() end);
rollback;
