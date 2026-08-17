-- Phase 4 gap found while designing generate_lease_rent_dues(): dues rows
-- require a NOT NULL due_type_id and receivable_account_id, so a lease
-- needs its own copies of these -- exactly like due_schedules already
-- carries due_type_id/receivable_account_id for the same reason. unit_leases
-- has zero real rows in production yet (feature unreleased), so this is a
-- safe additive NOT NULL column pair, not a backfill migration.
alter table public.unit_leases
  add column due_type_id uuid not null references public.due_types (id),
  add column receivable_account_id uuid not null references public.chart_of_accounts (id);

-- create_unit_lease's signature changes (two new required params), which
-- is a new overload, not a replacement, under Postgres's function-identity
-- rules -- explicitly drop the old 9-arg version first so it can't be
-- called anymore and leave a stale, incomplete path callable.
drop function if exists public.create_unit_lease(uuid, uuid, uuid, numeric, text, date, date, numeric, text);

create or replace function public.create_unit_lease(
  p_organization_id uuid,
  p_unit_id uuid,
  p_tenant_member_id uuid,
  p_due_type_id uuid,
  p_receivable_account_id uuid,
  p_rent_amount numeric,
  p_rent_frequency text,
  p_starts_on date,
  p_ends_on date default null,
  p_security_deposit_amount numeric default 0,
  p_billing_recipient text default 'TENANT'
) returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  v_property_id uuid;
  v_lease_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'property.leases.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك بإدارة عقود الإيجار' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'ORGANIZATION_INACTIVE: المنظمة غير نشطة' using errcode = '22023';
  end if;

  select property_id into v_property_id
  from public.units where id = p_unit_id and organization_id = p_organization_id;
  if v_property_id is null then
    raise exception 'UNIT_NOT_FOUND: الوحدة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  if not exists (select 1 from public.members where id = p_tenant_member_id and organization_id = p_organization_id) then
    raise exception 'TENANT_NOT_FOUND: العضو غير موجود في هذا الكيان' using errcode = '22023';
  end if;

  if not exists (select 1 from public.due_types where id = p_due_type_id and organization_id = p_organization_id) then
    raise exception 'DUE_TYPE_NOT_FOUND: نوع الاستحقاق غير موجود في هذا الكيان' using errcode = '22023';
  end if;

  if not exists (select 1 from public.chart_of_accounts where id = p_receivable_account_id and organization_id = p_organization_id) then
    raise exception 'ACCOUNT_NOT_FOUND: حساب الذمم غير موجود في هذا الكيان' using errcode = '22023';
  end if;

  insert into public.unit_leases (
    organization_id, property_id, unit_id, tenant_member_id, status,
    due_type_id, receivable_account_id,
    starts_on, ends_on, rent_amount, rent_frequency, security_deposit_amount,
    billing_recipient, created_by
  ) values (
    p_organization_id, v_property_id, p_unit_id, p_tenant_member_id, 'DRAFT',
    p_due_type_id, p_receivable_account_id,
    p_starts_on, p_ends_on, p_rent_amount, p_rent_frequency, p_security_deposit_amount,
    p_billing_recipient, auth.uid()
  ) returning id into v_lease_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, v_property_id, 'unit_lease.created', 'unit_lease', v_lease_id,
    jsonb_build_object('unit_id', p_unit_id, 'tenant_member_id', p_tenant_member_id, 'rent_amount', p_rent_amount));

  return v_lease_id;
end;
$$;
