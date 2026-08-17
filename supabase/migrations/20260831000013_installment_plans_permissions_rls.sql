-- property.installments.view / property.installments.manage -- same role
-- grants as property.leases.* (20260831000004), no reason for this
-- feature's role matrix to differ.
insert into public.permissions (key, description)
values
  ('property.installments.view', 'عرض خطط التقسيط'),
  ('property.installments.manage', 'إدارة خطط التقسيط (إنشاء، إلغاء)')
on conflict (key) do update set description = excluded.description;

insert into public.role_template_permissions (role_template_key, permission_key)
values
  ('TENANT_OWNER', 'property.installments.view'),
  ('TENANT_OWNER', 'property.installments.manage'),
  ('TENANT_ADMIN', 'property.installments.view'),
  ('GENERAL_MANAGER', 'property.installments.view'),
  ('PROPERTY_MANAGER', 'property.installments.view'),
  ('PROPERTY_MANAGER', 'property.installments.manage'),
  ('FINANCE_MANAGER', 'property.installments.view'),
  ('ACCOUNTANT', 'property.installments.view'),
  ('COLLECTOR', 'property.installments.view'),
  ('AUDITOR', 'property.installments.view'),
  ('VIEWER', 'property.installments.view')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.role_template_permissions rtp on rtp.role_template_key = r.key
join public.permissions p on p.key = rtp.permission_key
where r.organization_id is not null
  and rtp.permission_key in ('property.installments.view', 'property.installments.manage')
on conflict do nothing;

-- SELECT-only RLS -- every write goes through an RPC (Phase 3), matching
-- unit_leases/dues/payments.
create policy "installment_plans_select_staff" on public.installment_plans for select
  using (
    public.has_permission(auth.uid(), organization_id, 'property.installments.view')
    or public.has_permission(auth.uid(), organization_id, 'property.installments.manage')
  );

create policy "installment_plans_select_own" on public.installment_plans for select
  using (
    buyer_member_id = public.current_member_id()
    and public.organization_is_active(organization_id)
  );

create policy "plan_installments_select_staff" on public.plan_installments for select
  using (
    exists (
      select 1 from public.installment_plans p
      where p.id = plan_id
        and (
          public.has_permission(auth.uid(), p.organization_id, 'property.installments.view')
          or public.has_permission(auth.uid(), p.organization_id, 'property.installments.manage')
        )
    )
  );

create policy "plan_installments_select_own" on public.plan_installments for select
  using (
    exists (
      select 1 from public.installment_plans p
      where p.id = plan_id
        and p.buyer_member_id = public.current_member_id()
        and public.organization_is_active(p.organization_id)
    )
  );

-- Closes the tenant-visibility gap the same way dues_select_own_via_lease
-- did for leases: the existing dues_select_own policy only covers owners
-- (via unit_ownerships). A buyer's own installment dues need a targeted
-- policy of their own.
create policy "dues_select_own_via_installment_plan" on public.dues for select
  using (
    source_type = 'INSTALLMENT_PLAN'
    and source_id in (
      select pi.id from public.plan_installments pi
      join public.installment_plans p on p.id = pi.plan_id
      where p.buyer_member_id = public.current_member_id()
    )
  );
