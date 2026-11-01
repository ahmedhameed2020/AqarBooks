begin;
select set_config('request.jwt.claims','{"sub":"2c63a9fa-3d09-49be-81a2-d446bf6f9dd0","role":"authenticated"}',true);
\timing on
-- baseline: scan only (table owner, no RLS)
select count(*) from public.chart_of_accounts where organization_id is not null;
-- per-row calls (argument depends on the row so the planner cannot evaluate them once)
select count(*) from public.chart_of_accounts where public.is_platform_admin(case when organization_id is not null then auth.uid() end);
select count(*) from public.chart_of_accounts where public.has_permission(auth.uid(), organization_id, 'finance.accounts.view');
select count(*) from public.chart_of_accounts where public.has_any_permission(organization_id, array['finance.accounts.view','finance.reports.read','finance.entries.create']);
select count(*) from public.chart_of_accounts where public.organization_is_active(organization_id);
rollback;
