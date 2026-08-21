-- Domain RPCs for unit_leases. Phase 3 of
-- docs/superpowers/plans/2026-08-17-unit-rental-occupancy-implementation-plan.md
-- Every RPC checks has_permission() itself -- the future server-action
-- layer in lib/actions/property.ts is never the security boundary, matching
-- this codebase's rule everywhere else. State transitions use the
-- (old_status, new_status) tuple-membership idiom from
-- set_purchase_order_status(), not a generic state-machine table.
-- Lifecycle events go to platform_audit_logs (manual insert), matching
-- update_unit/archive_unit/purchase-order-transition precedent -- money
-- events (rent-due generation, Phase 4) will go to financial_audit_logs
-- instead.

create or replace function public.create_unit_lease(
  p_organization_id uuid,
  p_unit_id uuid,
  p_tenant_member_id uuid,
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

  insert into public.unit_leases (
    organization_id, property_id, unit_id, tenant_member_id, status,
    starts_on, ends_on, rent_amount, rent_frequency, security_deposit_amount,
    billing_recipient, created_by
  ) values (
    p_organization_id, v_property_id, p_unit_id, p_tenant_member_id, 'DRAFT',
    p_starts_on, p_ends_on, p_rent_amount, p_rent_frequency, p_security_deposit_amount,
    p_billing_recipient, auth.uid()
  ) returning id into v_lease_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, v_property_id, 'unit_lease.created', 'unit_lease', v_lease_id,
    jsonb_build_object('unit_id', p_unit_id, 'tenant_member_id', p_tenant_member_id, 'rent_amount', p_rent_amount));

  return v_lease_id;
end;
$$;

create or replace function public.activate_unit_lease(p_lease_id uuid)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_lease public.unit_leases;
begin
  select * into v_lease from public.unit_leases where id = p_lease_id;
  if v_lease.id is null then
    raise exception 'LEASE_NOT_FOUND: عقد الإيجار غير موجود' using errcode = '22023';
  end if;
  if not public.has_permission(auth.uid(), v_lease.organization_id, 'property.leases.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك بإدارة عقود الإيجار' using errcode = '42501';
  end if;
  if v_lease.status <> 'DRAFT' then
    raise exception 'ILLEGAL_TRANSITION: لا يمكن تفعيل عقد ليس في حالة مسودة (الحالة الحالية: %)', v_lease.status
      using errcode = '22023';
  end if;

  begin
    update public.unit_leases set status = 'ACTIVE' where id = p_lease_id;
  exception when exclusion_violation then
    raise exception 'LEASE_OVERLAPS_ACTIVE: يوجد عقد إيجار نشط آخر يتداخل زمنيًا مع هذه الوحدة' using errcode = '22023';
  end;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_lease.organization_id, v_lease.property_id, 'unit_lease.activated', 'unit_lease', p_lease_id, '{}'::jsonb);
end;
$$;

create or replace function public.end_unit_lease(p_lease_id uuid, p_ends_on date, p_end_reason text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_lease public.unit_leases;
begin
  select * into v_lease from public.unit_leases where id = p_lease_id;
  if v_lease.id is null then
    raise exception 'LEASE_NOT_FOUND: عقد الإيجار غير موجود' using errcode = '22023';
  end if;
  if not public.has_permission(auth.uid(), v_lease.organization_id, 'property.leases.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك بإدارة عقود الإيجار' using errcode = '42501';
  end if;
  if v_lease.status <> 'ACTIVE' then
    raise exception 'ILLEGAL_TRANSITION: لا يمكن إنهاء عقد ليس نشطًا (الحالة الحالية: %)', v_lease.status
      using errcode = '22023';
  end if;
  if p_end_reason is null or trim(p_end_reason) = '' then
    raise exception 'END_REASON_REQUIRED: يجب إدخال سبب إنهاء العقد' using errcode = '22023';
  end if;
  if p_ends_on < v_lease.starts_on then
    raise exception 'INVALID_END_DATE: تاريخ الإنهاء يجب أن يكون بعد تاريخ البداية' using errcode = '22023';
  end if;

  update public.unit_leases
  set status = 'ENDED', ends_on = p_ends_on, ended_by = auth.uid(), ended_at = now(), end_reason = p_end_reason
  where id = p_lease_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_lease.organization_id, v_lease.property_id, 'unit_lease.ended', 'unit_lease', p_lease_id,
    jsonb_build_object('ends_on', p_ends_on, 'end_reason', p_end_reason));
end;
$$;

-- DRAFT -> CANCELLED only. An ACTIVE lease with real billing history is
-- ended (with a reason), never cancelled -- see the implementation plan
-- section 3.1 for why ACTIVE -> CANCELLED is deliberately not offered.
create or replace function public.cancel_unit_lease(p_lease_id uuid, p_cancel_reason text default null)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_lease public.unit_leases;
begin
  select * into v_lease from public.unit_leases where id = p_lease_id;
  if v_lease.id is null then
    raise exception 'LEASE_NOT_FOUND: عقد الإيجار غير موجود' using errcode = '22023';
  end if;
  if not public.has_permission(auth.uid(), v_lease.organization_id, 'property.leases.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك بإدارة عقود الإيجار' using errcode = '42501';
  end if;
  if v_lease.status <> 'DRAFT' then
    raise exception 'ILLEGAL_TRANSITION: لا يمكن إلغاء عقد فُعّل بالفعل — استخدم إنهاء العقد بدلًا من ذلك (الحالة الحالية: %)', v_lease.status
      using errcode = '22023';
  end if;

  update public.unit_leases set status = 'CANCELLED' where id = p_lease_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_lease.organization_id, v_lease.property_id, 'unit_lease.cancelled', 'unit_lease', p_lease_id,
    jsonb_build_object('reason', p_cancel_reason));
end;
$$;

-- Separated from a general "edit terms" RPC on purpose: rent_amount/
-- rent_frequency are immutable once ACTIVE (approved default, plan section
-- 3.2 -- a rent change means end-and-recreate), but billing_recipient only
-- affects future due generation, so it stays editable in DRAFT or ACTIVE.
create or replace function public.set_unit_lease_billing_recipient(p_lease_id uuid, p_billing_recipient text)
returns void
language plpgsql security definer set search_path = public
as $$
declare
  v_lease public.unit_leases;
begin
  select * into v_lease from public.unit_leases where id = p_lease_id;
  if v_lease.id is null then
    raise exception 'LEASE_NOT_FOUND: عقد الإيجار غير موجود' using errcode = '22023';
  end if;
  if not public.has_permission(auth.uid(), v_lease.organization_id, 'property.leases.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك بإدارة عقود الإيجار' using errcode = '42501';
  end if;
  if v_lease.status not in ('DRAFT', 'ACTIVE') then
    raise exception 'ILLEGAL_STATE: لا يمكن تعديل جهة الفوترة لعقد منتهٍ أو ملغى (الحالة الحالية: %)', v_lease.status
      using errcode = '22023';
  end if;

  update public.unit_leases set billing_recipient = p_billing_recipient where id = p_lease_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_lease.organization_id, v_lease.property_id, 'unit_lease.billing_recipient_changed', 'unit_lease', p_lease_id,
    jsonb_build_object('billing_recipient', p_billing_recipient));
end;
$$;
