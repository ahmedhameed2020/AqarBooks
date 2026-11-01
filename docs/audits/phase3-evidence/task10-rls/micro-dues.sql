begin;
select set_config('request.jwt.claims','{"sub":"2c63a9fa-3d09-49be-81a2-d446bf6f9dd0","role":"authenticated"}',true);
\timing on
select count(*) from public.dues where id is not null;
select count(*) from public.dues d where public.work_order_cost_member_can_read_due(d);
select count(*) from public.dues d where public.has_permission(auth.uid(), d.organization_id, 'finance.dues.read');
select count(*) from public.dues d where public.organization_is_active(d.organization_id);
select count(*) from public.dues d where d.unit_id in (select unit_id from public.unit_ownerships where member_id = public.current_member_id());
rollback;
