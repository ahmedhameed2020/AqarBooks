-- Unit editing + archival (never physical delete -- a unit can have
-- historical payments, settled dues, ended ownerships, and audit events
-- that must survive it being taken off the active roster).
--
-- update_unit / archive_unit / restore_unit are RPCs (not direct table
-- writes) so the permission check and audit trail are enforced server-side
-- regardless of what the client sends, matching the create_resort /
-- update_resort pattern already used elsewhere in this schema.

alter table public.units
  add column if not exists archived_at timestamptz,
  add column if not exists archived_by uuid references auth.users (id);

create or replace view public.units_with_financials
with (security_invoker = true) as
with due_totals as (
  select
    d.unit_id,
    sum(d.amount) as total_due
  from public.dues d
  where d.status <> 'VOID'
  group by d.unit_id
),
paid_totals as (
  select
    d.unit_id,
    sum(pa.amount) as total_paid
  from public.payment_allocations pa
  join public.payments p on p.id = pa.payment_id
  join public.dues d on d.id = pa.due_id
  where p.status = 'POSTED'
  group by d.unit_id
),
current_owner as (
  select distinct on (uo.unit_id)
    uo.unit_id,
    uo.member_id as owner_id,
    m.full_name as owner_name,
    m.phone as owner_phone
  from public.unit_ownerships uo
  join public.members m on m.id = uo.member_id
  where uo.end_date is null or uo.end_date >= current_date
  order by uo.unit_id, uo.is_primary_contact desc, uo.share_percentage desc, uo.start_date desc
)
select
  -- CREATE OR REPLACE VIEW only allows appending columns at the end
  -- (Postgres rejects reordering/renaming existing output columns), so the
  -- pre-existing column order from 20260810000044 is preserved exactly and
  -- only genuinely new columns (owner_phone, archived_at) are appended last.
  u.id,
  u.organization_id,
  u.resort_id,
  u.building_id,
  u.zone_id,
  u.code,
  u.unit_type,
  u.floor_number,
  u.area,
  u.is_active,
  b.name_ar as building_name_ar,
  b.name_en as building_name_en,
  z.name_ar as zone_name_ar,
  z.name_en as zone_name_en,
  co.owner_id,
  co.owner_name,
  case when co.owner_id is not null then 'OCCUPIED' else 'VACANT' end as occupancy_status,
  coalesce(dt.total_due, 0)::numeric(19, 4) as total_due,
  coalesce(pt.total_paid, 0)::numeric(19, 4) as total_paid,
  (coalesce(dt.total_due, 0) - coalesce(pt.total_paid, 0))::numeric(19, 4) as balance,
  (coalesce(dt.total_due, 0) - coalesce(pt.total_paid, 0)) > 0 as has_arrears,
  u.custom_type_label,
  co.owner_phone,
  u.archived_at
from public.units u
left join public.buildings b on b.id = u.building_id
left join public.zones z on z.id = u.zone_id
left join due_totals dt on dt.unit_id = u.id
left join paid_totals pt on pt.unit_id = u.id
left join current_owner co on co.unit_id = u.id;

create or replace function public.update_unit(
  p_organization_id uuid,
  p_unit_id uuid,
  p_code text,
  p_unit_type text,
  p_custom_type_label text default null,
  p_building_id uuid default null,
  p_zone_id uuid default null,
  p_floor_number int default null,
  p_area numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resort_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'property.units.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك بتعديل بيانات الوحدة' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'ORGANIZATION_INACTIVE: الكيان غير نشط';
  end if;

  -- resort_id is deliberately not a parameter: a unit never moves resorts
  -- from an edit form, only building/zone within its own resort.
  select resort_id into v_resort_id from public.units where id = p_unit_id and organization_id = p_organization_id;
  if v_resort_id is null then
    raise exception 'UNIT_NOT_FOUND: الوحدة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  if p_building_id is not null and not exists (
    select 1 from public.buildings where id = p_building_id and resort_id = v_resort_id
  ) then
    raise exception 'INVALID_BUILDING: المبنى المحدد لا ينتمي لموقع هذه الوحدة' using errcode = '22023';
  end if;

  if p_zone_id is not null and not exists (
    select 1 from public.zones where id = p_zone_id and resort_id = v_resort_id
  ) then
    raise exception 'INVALID_ZONE: المنطقة المحددة لا تنتمي لموقع هذه الوحدة' using errcode = '22023';
  end if;

  update public.units
  set code = p_code,
      unit_type = p_unit_type,
      custom_type_label = case when p_unit_type = 'OTHER' then p_custom_type_label else null end,
      building_id = p_building_id,
      zone_id = p_zone_id,
      floor_number = p_floor_number,
      area = p_area
  where id = p_unit_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, v_resort_id, 'unit.updated', 'unit', p_unit_id,
    jsonb_build_object('code', p_code, 'unit_type', p_unit_type));
exception
  when unique_violation then
    raise exception 'DUPLICATE_CODE: رمز الوحدة ده مستخدم بالفعل في نفس الموقع' using errcode = '23505';
end;
$$;

create or replace function public.archive_unit(
  p_organization_id uuid,
  p_unit_id uuid,
  p_reason text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resort_id uuid;
  v_active_owners int;
  v_open_dues int;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'property.units.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك بأرشفة الوحدة' using errcode = '42501';
  end if;

  select resort_id into v_resort_id from public.units where id = p_unit_id and organization_id = p_organization_id;
  if v_resort_id is null then
    raise exception 'UNIT_NOT_FOUND: الوحدة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  select count(*) into v_active_owners
  from public.unit_ownerships
  where unit_id = p_unit_id and (end_date is null or end_date >= current_date);
  if v_active_owners > 0 then
    raise exception 'UNIT_HAS_ACTIVE_OWNERSHIP: لا يمكن أرشفة وحدة عليها ملكية نشطة — أنهِ الملكية أولًا' using errcode = '22023';
  end if;

  select count(*) into v_open_dues
  from public.dues
  where unit_id = p_unit_id and status in ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'OVERDUE');
  if v_open_dues > 0 then
    raise exception 'UNIT_HAS_OPEN_DUES: لا يمكن أرشفة وحدة عليها مستحقات مفتوحة غير مسددة' using errcode = '22023';
  end if;

  update public.units
  set is_active = false,
      archived_at = now(),
      archived_by = auth.uid()
  where id = p_unit_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (auth.uid(), p_organization_id, v_resort_id, 'unit.archived', 'unit', p_unit_id, p_reason, '{}'::jsonb);
end;
$$;

create or replace function public.restore_unit(
  p_organization_id uuid,
  p_unit_id uuid
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resort_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'property.units.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك باستعادة الوحدة' using errcode = '42501';
  end if;

  select resort_id into v_resort_id from public.units where id = p_unit_id and organization_id = p_organization_id;
  if v_resort_id is null then
    raise exception 'UNIT_NOT_FOUND: الوحدة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  update public.units
  set is_active = true,
      archived_at = null,
      archived_by = null
  where id = p_unit_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, v_resort_id, 'unit.restored', 'unit', p_unit_id, '{}'::jsonb);
end;
$$;
