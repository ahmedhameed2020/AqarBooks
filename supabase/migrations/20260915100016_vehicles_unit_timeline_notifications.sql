-- PR6: Vehicles + unified unit timeline + in-app notifications.
-- Forward-only. Canonical domains remain source of truth; timeline is an
-- authorization-aware projection, notifications are attention records.

create table if not exists public.vehicles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  unit_id uuid not null,
  member_id uuid not null,
  plate_number text not null,
  plate_country text not null,
  plate_region text,
  normalized_plate text not null,
  make text,
  model text,
  color text,
  year integer,
  notes text,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  deactivated_at timestamptz,
  deactivated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint vehicles_org_property_fkey
    foreign key (organization_id, property_id)
    references public.properties (organization_id, id)
    on delete cascade,
  constraint vehicles_org_property_unit_fkey
    foreign key (organization_id, property_id, unit_id)
    references public.units (organization_id, property_id, id)
    on delete cascade,
  constraint vehicles_org_member_fkey
    foreign key (organization_id, member_id)
    references public.members (organization_id, id)
    on delete cascade,
  constraint vehicles_org_id_unique unique (organization_id, id),
  constraint vehicles_plate_number_not_blank check (btrim(plate_number) <> ''),
  constraint vehicles_plate_country_not_blank check (btrim(plate_country) <> ''),
  constraint vehicles_normalized_plate_not_blank check (btrim(normalized_plate) <> ''),
  constraint vehicles_plate_number_length check (char_length(plate_number) <= 40),
  constraint vehicles_plate_country_length check (char_length(plate_country) <= 3),
  constraint vehicles_plate_region_length check (plate_region is null or char_length(plate_region) <= 40),
  constraint vehicles_optional_text_length check (
    (make is null or char_length(make) <= 80)
    and (model is null or char_length(model) <= 80)
    and (color is null or char_length(color) <= 60)
    and (notes is null or char_length(notes) <= 500)
  ),
  constraint vehicles_year_reasonable check (year is null or (year between 1900 and extract(year from current_date)::integer + 1)),
  constraint vehicles_deactivation_consistent check (
    (is_active and deactivated_at is null and deactivated_by is null)
    or (not is_active and deactivated_at is not null and deactivated_by is not null)
  )
);

create unique index if not exists vehicles_org_normalized_plate_active_key
  on public.vehicles (organization_id, normalized_plate)
  where is_active;

create index if not exists idx_vehicles_org_property_unit
  on public.vehicles (organization_id, property_id, unit_id, is_active);

create index if not exists idx_vehicles_member_created
  on public.vehicles (member_id, created_at desc);

create index if not exists idx_vehicles_org_created
  on public.vehicles (organization_id, created_at desc);

drop trigger if exists trg_vehicles_updated_at on public.vehicles;
create trigger trg_vehicles_updated_at
  before update on public.vehicles
  for each row execute function public.set_updated_at();

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  recipient_user_id uuid not null references auth.users(id) on delete cascade,
  recipient_member_id uuid references public.members(id) on delete cascade,
  type text not null,
  title_ar text not null,
  title_en text not null,
  body_ar text not null,
  body_en text not null,
  source_type text not null,
  source_id uuid not null,
  action_url text,
  priority text not null default 'NORMAL',
  is_read boolean not null default false,
  read_at timestamptz,
  created_at timestamptz not null default now(),
  constraint notifications_org_member_fkey
    foreign key (organization_id, recipient_member_id)
    references public.members (organization_id, id)
    on delete cascade,
  constraint notifications_type_check check (
    type in (
      'REQUEST_RECEIVED',
      'MAINTENANCE_UPDATE',
      'WORK_ORDER_SCHEDULED',
      'WORK_STARTED',
      'WORK_COMPLETED',
      'OWNER_CHARGE_CREATED',
      'VISITOR_INVITATION_CREATED',
      'VISITOR_ENTERED',
      'VISITOR_EXITED',
      'INVITATION_REVOKED',
      'DUE_CREATED',
      'PAYMENT_CONFIRMED',
      'RECEIPT_AVAILABLE',
      'VEHICLE_REGISTERED',
      'VEHICLE_DEACTIVATED'
    )
  ),
  constraint notifications_priority_check check (priority in ('LOW', 'NORMAL', 'HIGH')),
  constraint notifications_source_type_check check (
    source_type in (
      'maintenance_request',
      'maintenance_request_update',
      'work_order',
      'work_order_update',
      'work_order_cost',
      'visitor_invitation',
      'access_event',
      'due',
      'payment',
      'vehicle'
    )
  ),
  constraint notifications_title_body_not_blank check (
    btrim(title_ar) <> ''
    and btrim(title_en) <> ''
    and btrim(body_ar) <> ''
    and btrim(body_en) <> ''
  ),
  constraint notifications_action_url_safe check (
    action_url is null
    or (left(action_url, 1) = '/' and position('//' in action_url) = 0 and char_length(action_url) <= 240)
  ),
  constraint notifications_read_at_consistent check ((is_read = false and read_at is null) or (is_read = true and read_at is not null))
);

create unique index if not exists notifications_event_once_key
  on public.notifications (organization_id, recipient_user_id, type, source_type, source_id);

create index if not exists idx_notifications_recipient_created
  on public.notifications (recipient_user_id, is_read, created_at desc);

create index if not exists idx_notifications_org_created
  on public.notifications (organization_id, created_at desc);

create or replace function public.unit_experience_enabled(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.get_entitlement(p_organization_id, 'unit_experience'), 'false'::jsonb) = 'true'::jsonb
    or exists (
      select 1
      from public.tenant_feature_flags tff
      where tff.organization_id = p_organization_id
        and tff.flag_key = 'unit_experience'
        and tff.enabled = true
    );
$$;

create or replace function public.normalize_vehicle_plate(
  p_plate_country text,
  p_plate_region text,
  p_plate_number text
) returns text
language sql
immutable
security definer
set search_path = public
as $$
  select upper(regexp_replace(
    coalesce(p_plate_country, '') || ':' || coalesce(p_plate_region, '') || ':' || coalesce(p_plate_number, ''),
    '[^[:alnum:]]',
    '',
    'g'
  ));
$$;

create or replace function public.vehicle_staff_can_read(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), p_organization_id, 'operations.vehicles.view')
      or public.has_permission(auth.uid(), p_organization_id, 'operations.vehicles.manage');
$$;

create or replace function public.vehicle_staff_can_manage(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), p_organization_id, 'operations.vehicles.manage');
$$;

create or replace function public.vehicle_member_can_read(p_vehicle public.vehicles)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_vehicle.member_id = public.current_member_id()
    and public.is_current_member_unit_owner(public.current_member_id(), p_vehicle.organization_id, p_vehicle.unit_id);
$$;

create or replace function public.create_notification_once(
  p_organization_id uuid,
  p_recipient_user_id uuid,
  p_recipient_member_id uuid,
  p_type text,
  p_title_ar text,
  p_title_en text,
  p_body_ar text,
  p_body_en text,
  p_source_type text,
  p_source_id uuid,
  p_action_url text,
  p_priority text default 'NORMAL'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification_id uuid;
begin
  if p_recipient_user_id is null then
    return null;
  end if;

  if not public.organization_is_active(p_organization_id)
     or not public.unit_experience_enabled(p_organization_id) then
    return null;
  end if;

  if p_recipient_member_id is not null and not exists (
    select 1
    from public.members m
    where m.id = p_recipient_member_id
      and m.organization_id = p_organization_id
      and m.user_id = p_recipient_user_id
  ) then
    raise exception 'INVALID_NOTIFICATION_RECIPIENT' using errcode = '23503';
  end if;

  insert into public.notifications (
    organization_id,
    recipient_user_id,
    recipient_member_id,
    type,
    title_ar,
    title_en,
    body_ar,
    body_en,
    source_type,
    source_id,
    action_url,
    priority
  )
  values (
    p_organization_id,
    p_recipient_user_id,
    p_recipient_member_id,
    p_type,
    p_title_ar,
    p_title_en,
    p_body_ar,
    p_body_en,
    p_source_type,
    p_source_id,
    p_action_url,
    coalesce(p_priority, 'NORMAL')
  )
  on conflict (organization_id, recipient_user_id, type, source_type, source_id)
  do update set id = notifications.id
  returning id into v_notification_id;

  return v_notification_id;
end;
$$;

create or replace function public.create_vehicle(
  p_unit_id uuid,
  p_plate_number text,
  p_plate_country text,
  p_plate_region text default null,
  p_make text default null,
  p_model text default null,
  p_color text default null,
  p_year integer default null,
  p_notes text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_member_id uuid := public.current_member_id();
  v_unit public.units;
  v_vehicle_id uuid := gen_random_uuid();
  v_normalized_plate text;
begin
  if v_user_id is null or v_member_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_unit
  from public.units
  where id = p_unit_id
    and archived_at is null;

  if v_unit.id is null then
    raise exception 'UNIT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.organization_is_active(v_unit.organization_id) then
    raise exception 'ORGANIZATION_INACTIVE' using errcode = '42501';
  end if;

  if not public.unit_experience_enabled(v_unit.organization_id) then
    raise exception 'UNIT_EXPERIENCE_NOT_ENTITLED' using errcode = '42501';
  end if;

  if not public.is_current_member_unit_owner(v_member_id, v_unit.organization_id, v_unit.id) then
    raise exception 'UNIT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if p_plate_number is null or btrim(p_plate_number) = '' or char_length(btrim(p_plate_number)) > 40 then
    raise exception 'INVALID_VEHICLE_PLATE' using errcode = '22023';
  end if;

  if p_plate_country is null or btrim(p_plate_country) = '' or char_length(upper(btrim(p_plate_country))) > 3 then
    raise exception 'INVALID_VEHICLE_COUNTRY' using errcode = '22023';
  end if;

  v_normalized_plate := public.normalize_vehicle_plate(p_plate_country, p_plate_region, p_plate_number);
  if v_normalized_plate is null or btrim(v_normalized_plate) = '' then
    raise exception 'INVALID_VEHICLE_PLATE' using errcode = '22023';
  end if;

  insert into public.vehicles (
    id,
    organization_id,
    property_id,
    unit_id,
    member_id,
    plate_number,
    plate_country,
    plate_region,
    normalized_plate,
    make,
    model,
    color,
    year,
    notes,
    created_by,
    updated_by
  )
  values (
    v_vehicle_id,
    v_unit.organization_id,
    v_unit.property_id,
    v_unit.id,
    v_member_id,
    btrim(p_plate_number),
    upper(btrim(p_plate_country)),
    nullif(btrim(p_plate_region), ''),
    v_normalized_plate,
    nullif(btrim(p_make), ''),
    nullif(btrim(p_model), ''),
    nullif(btrim(p_color), ''),
    p_year,
    nullif(btrim(p_notes), ''),
    v_user_id,
    v_user_id
  );

  insert into public.platform_audit_logs (
    actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary
  )
  values (
    v_user_id,
    v_unit.organization_id,
    v_unit.property_id,
    'vehicle.created',
    'vehicle',
    v_vehicle_id,
    jsonb_build_object('unit_id', v_unit.id, 'member_id', v_member_id)
  );

  perform public.create_notification_once(
    v_unit.organization_id,
    (select m.user_id from public.members m where m.id = v_member_id),
    v_member_id,
    'VEHICLE_REGISTERED',
    'تم تسجيل مركبة',
    'Vehicle registered',
    'تمت إضافة المركبة إلى سجل وحدتك.',
    'The vehicle was added to your unit records.',
    'vehicle',
    v_vehicle_id,
    '/portal/vehicles/' || v_vehicle_id::text,
    'NORMAL'
  );

  return v_vehicle_id;
exception
  when unique_violation then
    raise exception 'DUPLICATE_VEHICLE_PLATE' using errcode = '23505';
end;
$$;

create or replace function public.update_vehicle_staff(
  p_vehicle_id uuid,
  p_plate_number text,
  p_plate_country text,
  p_plate_region text default null,
  p_make text default null,
  p_model text default null,
  p_color text default null,
  p_year integer default null,
  p_notes text default null,
  p_is_active boolean default true
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_vehicle public.vehicles;
  v_normalized_plate text;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_vehicle
  from public.vehicles
  where id = p_vehicle_id;

  if v_vehicle.id is null then
    raise exception 'VEHICLE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.organization_is_active(v_vehicle.organization_id)
     or not public.unit_experience_enabled(v_vehicle.organization_id)
     or not public.vehicle_staff_can_manage(v_vehicle.organization_id) then
    raise exception 'VEHICLE_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  v_normalized_plate := public.normalize_vehicle_plate(p_plate_country, p_plate_region, p_plate_number);

  update public.vehicles
  set
    plate_number = btrim(p_plate_number),
    plate_country = upper(btrim(p_plate_country)),
    plate_region = nullif(btrim(p_plate_region), ''),
    normalized_plate = v_normalized_plate,
    make = nullif(btrim(p_make), ''),
    model = nullif(btrim(p_model), ''),
    color = nullif(btrim(p_color), ''),
    year = p_year,
    notes = nullif(btrim(p_notes), ''),
    is_active = p_is_active,
    updated_by = v_user_id,
    deactivated_at = case when p_is_active then null else coalesce(deactivated_at, now()) end,
    deactivated_by = case when p_is_active then null else coalesce(deactivated_by, v_user_id) end
  where id = p_vehicle_id;

  insert into public.platform_audit_logs (
    actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary
  )
  values (
    v_user_id,
    v_vehicle.organization_id,
    v_vehicle.property_id,
    case when p_is_active then 'vehicle.updated' else 'vehicle.deactivated' end,
    'vehicle',
    v_vehicle.id,
    jsonb_build_object('unit_id', v_vehicle.unit_id, 'active', p_is_active)
  );
exception
  when unique_violation then
    raise exception 'DUPLICATE_VEHICLE_PLATE' using errcode = '23505';
end;
$$;

create or replace function public.deactivate_own_vehicle(p_vehicle_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_member_id uuid := public.current_member_id();
  v_vehicle public.vehicles;
begin
  if v_user_id is null or v_member_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_vehicle
  from public.vehicles
  where id = p_vehicle_id;

  if v_vehicle.id is null then
    raise exception 'VEHICLE_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.organization_is_active(v_vehicle.organization_id)
     or not public.unit_experience_enabled(v_vehicle.organization_id)
     or v_vehicle.member_id <> v_member_id
     or not public.is_current_member_unit_owner(v_member_id, v_vehicle.organization_id, v_vehicle.unit_id) then
    raise exception 'VEHICLE_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if not v_vehicle.is_active then
    return;
  end if;

  update public.vehicles
  set is_active = false,
      updated_by = v_user_id,
      deactivated_at = now(),
      deactivated_by = v_user_id
  where id = v_vehicle.id;

  insert into public.platform_audit_logs (
    actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary
  )
  values (
    v_user_id,
    v_vehicle.organization_id,
    v_vehicle.property_id,
    'vehicle.deactivated',
    'vehicle',
    v_vehicle.id,
    jsonb_build_object('unit_id', v_vehicle.unit_id, 'member_id', v_vehicle.member_id)
  );

  perform public.create_notification_once(
    v_vehicle.organization_id,
    (select m.user_id from public.members m where m.id = v_member_id),
    v_member_id,
    'VEHICLE_DEACTIVATED',
    'تم إيقاف مركبة',
    'Vehicle deactivated',
    'تم إيقاف المركبة في سجل وحدتك.',
    'The vehicle was deactivated in your unit records.',
    'vehicle',
    v_vehicle.id,
    '/portal/vehicles/' || v_vehicle.id::text,
    'NORMAL'
  );
end;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  update public.notifications
  set is_read = true,
      read_at = coalesce(read_at, now())
  where id = p_notification_id
    and recipient_user_id = v_user_id
    and public.organization_is_active(organization_id)
    and public.unit_experience_enabled(organization_id);

  if not found then
    raise exception 'NOTIFICATION_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  update public.notifications
  set is_read = true,
      read_at = coalesce(read_at, now())
  where recipient_user_id = v_user_id
    and is_read = false
    and public.organization_is_active(organization_id)
    and public.unit_experience_enabled(organization_id);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

create or replace function public.get_unit_timeline(
  p_unit_id uuid,
  p_cursor_occurred_at timestamptz default null,
  p_cursor_event_id text default null,
  p_limit integer default 25
) returns table (
  event_id text,
  event_type text,
  occurred_at timestamptz,
  title_ar text,
  title_en text,
  summary_ar text,
  summary_en text,
  icon_key text,
  status_key text,
  source_type text,
  source_id uuid,
  visibility text,
  amount numeric,
  currency text
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_member_id uuid := public.current_member_id();
  v_unit public.units;
  v_limit integer := least(greatest(coalesce(p_limit, 25), 1), 50);
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_unit
  from public.units
  where id = p_unit_id
    and archived_at is null;

  if v_unit.id is null then
    raise exception 'UNIT_NOT_FOUND' using errcode = 'P0002';
  end if;

  if not public.organization_is_active(v_unit.organization_id)
     or not public.unit_experience_enabled(v_unit.organization_id)
     or not public.is_current_member_unit_owner(v_member_id, v_unit.organization_id, v_unit.id) then
    raise exception 'UNIT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  return query
  with events as (
    select
      'vehicle:' || v.id::text as event_id,
      case when v.is_active then 'VEHICLE_REGISTERED' else 'VEHICLE_DEACTIVATED' end as event_type,
      case when v.is_active then v.created_at else coalesce(v.deactivated_at, v.updated_at) end as occurred_at,
      case when v.is_active then 'تم تسجيل مركبة' else 'تم إيقاف مركبة' end as title_ar,
      case when v.is_active then 'Vehicle registered' else 'Vehicle deactivated' end as title_en,
      v.plate_country || ' · ' || v.plate_number as summary_ar,
      v.plate_country || ' · ' || v.plate_number as summary_en,
      'car' as icon_key,
      case when v.is_active then 'ACTIVE' else 'INACTIVE' end as status_key,
      'vehicle' as source_type,
      v.id as source_id,
      'MEMBER_VISIBLE' as visibility,
      null::numeric as amount,
      null::text as currency
    from public.vehicles v
    where v.organization_id = v_unit.organization_id
      and v.unit_id = v_unit.id
      and v.member_id = v_member_id

    union all
    select
      'maintenance_request:' || mr.id::text,
      'MAINTENANCE_REQUEST',
      mr.submitted_at,
      'تم إرسال طلب صيانة',
      'Maintenance request submitted',
      mr.request_no || ' · ' || mr.title,
      mr.request_no || ' · ' || mr.title,
      'wrench',
      mr.status,
      'maintenance_request',
      mr.id,
      'MEMBER_VISIBLE',
      null::numeric,
      null::text
    from public.maintenance_requests mr
    where mr.organization_id = v_unit.organization_id
      and mr.unit_id = v_unit.id
      and mr.requester_member_id = v_member_id

    union all
    select
      'maintenance_update:' || mu.id::text,
      'MAINTENANCE_UPDATE',
      mu.created_at,
      'تحديث على طلب الصيانة',
      'Maintenance update',
      mr.request_no || ' · ' || mu.note,
      mr.request_no || ' · ' || mu.note,
      'wrench',
      coalesce(mu.resulting_status, mr.status),
      'maintenance_request_update',
      mu.id,
      'MEMBER_VISIBLE',
      null::numeric,
      null::text
    from public.maintenance_request_updates mu
    join public.maintenance_requests mr
      on mr.id = mu.maintenance_request_id
     and mr.organization_id = mu.organization_id
    where mu.organization_id = v_unit.organization_id
      and mr.unit_id = v_unit.id
      and mr.requester_member_id = v_member_id
      and mu.visibility = 'MEMBER_VISIBLE'

    union all
    select
      'work_order:' || wo.id::text,
      case
        when wo.status = 'SCHEDULED' then 'WORK_ORDER_SCHEDULED'
        when wo.status = 'IN_PROGRESS' then 'WORK_STARTED'
        when wo.status = 'COMPLETED' then 'WORK_COMPLETED'
        else 'WORK_ORDER_UPDATE'
      end,
      coalesce(wo.scheduled_start_at, wo.started_at, wo.completed_at, wo.created_at),
      case
        when wo.status = 'SCHEDULED' then 'تمت جدولة أمر العمل'
        when wo.status = 'IN_PROGRESS' then 'بدأ تنفيذ الصيانة'
        when wo.status = 'COMPLETED' then 'اكتمل أمر العمل'
        else 'تحديث على أمر العمل'
      end,
      case
        when wo.status = 'SCHEDULED' then 'Work order scheduled'
        when wo.status = 'IN_PROGRESS' then 'Maintenance work started'
        when wo.status = 'COMPLETED' then 'Work order completed'
        else 'Work order update'
      end,
      wo.work_order_no || ' · ' || wo.status,
      wo.work_order_no || ' · ' || wo.status,
      'clipboard-check',
      wo.status,
      'work_order',
      wo.id,
      'MEMBER_VISIBLE',
      null::numeric,
      null::text
    from public.work_orders wo
    join public.maintenance_requests mr
      on mr.id = wo.maintenance_request_id
     and mr.organization_id = wo.organization_id
    where wo.organization_id = v_unit.organization_id
      and wo.unit_id = v_unit.id
      and mr.requester_member_id = v_member_id
      and wo.status in ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED')

    union all
    select
      'work_order_update:' || wu.id::text,
      'WORK_ORDER_UPDATE',
      wu.created_at,
      'تحديث على أمر العمل',
      'Work order update',
      wo.work_order_no || ' · ' || wu.note,
      wo.work_order_no || ' · ' || wu.note,
      'clipboard-check',
      coalesce(wu.resulting_status, wo.status),
      'work_order_update',
      wu.id,
      'MEMBER_VISIBLE',
      null::numeric,
      null::text
    from public.work_order_updates wu
    join public.work_orders wo
      on wo.id = wu.work_order_id
     and wo.organization_id = wu.organization_id
    join public.maintenance_requests mr
      on mr.id = wo.maintenance_request_id
     and mr.organization_id = wo.organization_id
    where wu.organization_id = v_unit.organization_id
      and wo.unit_id = v_unit.id
      and mr.requester_member_id = v_member_id
      and wu.visibility = 'MEMBER_VISIBLE'

    union all
    select
      'visitor_invitation:' || vi.id::text,
      case when vi.status = 'REVOKED' then 'INVITATION_REVOKED' else 'VISITOR_INVITATION_CREATED' end,
      case when vi.status = 'REVOKED' then coalesce(vi.revoked_at, vi.updated_at) else vi.created_at end,
      case when vi.status = 'REVOKED' then 'تم إلغاء تصريح زائر' else 'تم إنشاء تصريح زائر' end,
      case when vi.status = 'REVOKED' then 'Visitor pass revoked' else 'Visitor pass created' end,
      vi.guest_name,
      vi.guest_name,
      'ticket-check',
      vi.status,
      'visitor_invitation',
      vi.id,
      'MEMBER_VISIBLE',
      null::numeric,
      null::text
    from public.visitor_invitations vi
    where vi.organization_id = v_unit.organization_id
      and vi.unit_id = v_unit.id
      and vi.invited_by_member_id = v_member_id

    union all
    select
      'access_event:' || ae.id::text,
      case when ae.direction = 'ENTRY' then 'VISITOR_ENTERED' else 'VISITOR_EXITED' end,
      ae.occurred_at,
      case when ae.direction = 'ENTRY' then 'دخول زائر' else 'خروج زائر' end,
      case when ae.direction = 'ENTRY' then 'Guest entered' else 'Guest exited' end,
      coalesce(ae.guest_name, 'زائر') || ' · ' || coalesce(g.name_ar, 'البوابة'),
      coalesce(ae.guest_name, 'Guest') || ' · ' || coalesce(g.name_en, 'Gate'),
      'door-open',
      ae.reason_code,
      'access_event',
      ae.id,
      'MEMBER_VISIBLE',
      null::numeric,
      null::text
    from public.access_events ae
    left join public.gates g
      on g.id = ae.gate_id
     and g.organization_id = ae.organization_id
    join public.visitor_invitations vi
      on vi.id = ae.visitor_invitation_id
     and vi.organization_id = ae.organization_id
    where ae.organization_id = v_unit.organization_id
      and ae.unit_id = v_unit.id
      and ae.decision = 'ALLOW'
      and ae.reason_code in ('VALID_ENTRY', 'VALID_EXIT')
      and vi.invited_by_member_id = v_member_id

    union all
    select
      'due:' || d.id::text,
      'DUE_CREATED',
      d.created_at,
      'استحقاق مالي جديد',
      'New due issued',
      coalesce(d.description, 'استحقاق مالي'),
      coalesce(d.description, 'Financial due'),
      'receipt',
      d.status,
      'due',
      d.id,
      'MEMBER_VISIBLE',
      d.amount,
      o.default_currency
    from public.dues d
    join public.organizations o on o.id = d.organization_id
    where d.organization_id = v_unit.organization_id
      and d.unit_id = v_unit.id
      and d.status <> 'VOID'
      and exists (
        select 1
        from public.unit_ownerships uo
        where uo.organization_id = d.organization_id
          and uo.unit_id = d.unit_id
          and uo.member_id = v_member_id
          and uo.start_date <= d.created_at::date
          and (uo.end_date is null or uo.end_date >= d.created_at::date)
      )

    union all
    select
      'payment:' || p.id::text,
      'PAYMENT_CONFIRMED',
      p.created_at,
      'تم تأكيد دفعة',
      'Payment confirmed',
      coalesce(p.receipt_no, p.method),
      coalesce(p.receipt_no, p.method),
      'credit-card',
      p.status,
      'payment',
      p.id,
      'MEMBER_VISIBLE',
      p.amount,
      o.default_currency
    from public.payments p
    join public.organizations o on o.id = p.organization_id
    where p.organization_id = v_unit.organization_id
      and p.unit_id = v_unit.id
      and p.member_id = v_member_id
      and p.status = 'POSTED'
  )
  select *
  from events e
  where p_cursor_occurred_at is null
     or (e.occurred_at, e.event_id) < (p_cursor_occurred_at, coalesce(p_cursor_event_id, '~~~~'))
  order by e.occurred_at desc, e.event_id desc
  limit v_limit;
end;
$$;

create or replace function public.notify_maintenance_request_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  select user_id into v_user_id from public.members where id = new.requester_member_id;
  perform public.create_notification_once(
    new.organization_id,
    v_user_id,
    new.requester_member_id,
    'REQUEST_RECEIVED',
    'استلمنا طلب الصيانة',
    'Maintenance request received',
    new.request_no || ' · ' || new.title,
    new.request_no || ' · ' || new.title,
    'maintenance_request',
    new.id,
    '/portal/maintenance/' || new.id::text,
    'NORMAL'
  );
  return new;
end;
$$;

create or replace function public.notify_maintenance_request_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.maintenance_requests;
  v_user_id uuid;
begin
  if new.visibility <> 'MEMBER_VISIBLE' then
    return new;
  end if;

  select * into v_request
  from public.maintenance_requests
  where id = new.maintenance_request_id
    and organization_id = new.organization_id;
  if v_request.id is null then
    return new;
  end if;

  select user_id into v_user_id
  from public.members
  where id = v_request.requester_member_id
    and organization_id = v_request.organization_id;

  perform public.create_notification_once(
    new.organization_id,
    v_user_id,
    v_request.requester_member_id,
    'MAINTENANCE_UPDATE',
    'تحديث على طلب الصيانة',
    'Maintenance request update',
    left(new.note, 240),
    left(new.note, 240),
    'maintenance_request_update',
    new.id,
    '/portal/maintenance/' || v_request.id::text,
    'NORMAL'
  );
  return new;
end;
$$;

create or replace function public.notify_work_order_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.maintenance_requests;
  v_user_id uuid;
  v_type text;
  v_title_ar text;
  v_title_en text;
begin
  if new.status not in ('SCHEDULED', 'IN_PROGRESS', 'COMPLETED') then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select * into v_request
  from public.maintenance_requests
  where id = new.maintenance_request_id
    and organization_id = new.organization_id;
  select user_id into v_user_id from public.members where id = v_request.requester_member_id;

  v_type := case
    when new.status = 'SCHEDULED' then 'WORK_ORDER_SCHEDULED'
    when new.status = 'IN_PROGRESS' then 'WORK_STARTED'
    else 'WORK_COMPLETED'
  end;
  v_title_ar := case
    when new.status = 'SCHEDULED' then 'تمت جدولة الصيانة'
    when new.status = 'IN_PROGRESS' then 'بدأ تنفيذ الصيانة'
    else 'اكتملت الصيانة'
  end;
  v_title_en := case
    when new.status = 'SCHEDULED' then 'Maintenance scheduled'
    when new.status = 'IN_PROGRESS' then 'Maintenance started'
    else 'Maintenance completed'
  end;

  perform public.create_notification_once(
    new.organization_id,
    v_user_id,
    v_request.requester_member_id,
    v_type,
    v_title_ar,
    v_title_en,
    new.work_order_no,
    new.work_order_no,
    'work_order',
    new.id,
    '/portal/maintenance/' || v_request.id::text,
    'NORMAL'
  );
  return new;
end;
$$;

create or replace function public.notify_owner_charge_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_order public.work_orders;
  v_request public.maintenance_requests;
  v_user_id uuid;
begin
  if new.owner_charge_status <> 'OWNER_CHARGED' or new.owner_due_id is null then
    return new;
  end if;
  if tg_op = 'UPDATE' and old.owner_charge_status is not distinct from new.owner_charge_status then
    return new;
  end if;

  select * into v_order from public.work_orders where id = new.work_order_id and organization_id = new.organization_id;
  select * into v_request from public.maintenance_requests where id = v_order.maintenance_request_id and organization_id = new.organization_id;
  select user_id into v_user_id from public.members where id = v_request.requester_member_id;

  perform public.create_notification_once(
    new.organization_id,
    v_user_id,
    v_request.requester_member_id,
    'OWNER_CHARGE_CREATED',
    'تم تسجيل تكلفة صيانة على حسابك',
    'Maintenance charge created',
    'يمكنك مراجعة الاستحقاق من صفحة المستحقات.',
    'You can review the due from the dues page.',
    'work_order_cost',
    new.id,
    '/portal/dues',
    'HIGH'
  );
  return new;
end;
$$;

create or replace function public.notify_visitor_invitation_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
  v_type text;
begin
  if tg_op = 'UPDATE' and old.status is not distinct from new.status then
    return new;
  end if;

  select user_id into v_user_id from public.members where id = new.invited_by_member_id;
  v_type := case when new.status = 'REVOKED' then 'INVITATION_REVOKED' else 'VISITOR_INVITATION_CREATED' end;

  perform public.create_notification_once(
    new.organization_id,
    v_user_id,
    new.invited_by_member_id,
    v_type,
    case when new.status = 'REVOKED' then 'تم إلغاء تصريح زائر' else 'تم إنشاء تصريح زائر' end,
    case when new.status = 'REVOKED' then 'Visitor pass revoked' else 'Visitor pass created' end,
    new.guest_name,
    new.guest_name,
    'visitor_invitation',
    new.id,
    '/portal/visitors/' || new.id::text,
    'NORMAL'
  );
  return new;
end;
$$;

create or replace function public.notify_access_event_allowed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invitation public.visitor_invitations;
  v_user_id uuid;
begin
  if new.decision <> 'ALLOW' or new.reason_code not in ('VALID_ENTRY', 'VALID_EXIT') or new.visitor_invitation_id is null then
    return new;
  end if;

  select * into v_invitation
  from public.visitor_invitations
  where id = new.visitor_invitation_id
    and organization_id = new.organization_id;
  if v_invitation.id is null then
    return new;
  end if;

  select user_id into v_user_id from public.members where id = v_invitation.invited_by_member_id;
  perform public.create_notification_once(
    new.organization_id,
    v_user_id,
    v_invitation.invited_by_member_id,
    case when new.direction = 'ENTRY' then 'VISITOR_ENTERED' else 'VISITOR_EXITED' end,
    case when new.direction = 'ENTRY' then 'دخول زائر' else 'خروج زائر' end,
    case when new.direction = 'ENTRY' then 'Guest entered' else 'Guest exited' end,
    coalesce(new.guest_name, v_invitation.guest_name),
    coalesce(new.guest_name, v_invitation.guest_name),
    'access_event',
    new.id,
    '/portal/visitors/' || v_invitation.id::text,
    'HIGH'
  );
  return new;
end;
$$;

create or replace function public.notify_due_created()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member_id uuid;
  v_user_id uuid;
begin
  select uo.member_id into v_member_id
  from public.unit_ownerships uo
  join public.members m on m.id = uo.member_id and m.organization_id = uo.organization_id
  where uo.organization_id = new.organization_id
    and uo.unit_id = new.unit_id
    and uo.start_date <= current_date
    and (uo.end_date is null or uo.end_date >= current_date)
    and m.user_id is not null
  order by uo.is_primary_contact desc, uo.created_at asc
  limit 1;

  if v_member_id is null then
    return new;
  end if;
  select user_id into v_user_id from public.members where id = v_member_id;

  perform public.create_notification_once(
    new.organization_id,
    v_user_id,
    v_member_id,
    'DUE_CREATED',
    'استحقاق مالي جديد',
    'New due issued',
    coalesce(new.description, 'يوجد استحقاق جديد على وحدتك.'),
    coalesce(new.description, 'A new due was issued for your unit.'),
    'due',
    new.id,
    '/portal/dues',
    'NORMAL'
  );
  return new;
end;
$$;

create or replace function public.notify_payment_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if new.status <> 'POSTED' or new.member_id is null then
    return new;
  end if;
  select user_id into v_user_id from public.members where id = new.member_id;

  perform public.create_notification_once(
    new.organization_id,
    v_user_id,
    new.member_id,
    'PAYMENT_CONFIRMED',
    'تم تأكيد دفعة',
    'Payment confirmed',
    coalesce(new.receipt_no, new.method),
    coalesce(new.receipt_no, new.method),
    'payment',
    new.id,
    '/portal/payments',
    'NORMAL'
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_maintenance_request_created on public.maintenance_requests;
create trigger trg_notify_maintenance_request_created
  after insert on public.maintenance_requests
  for each row execute function public.notify_maintenance_request_created();

drop trigger if exists trg_notify_maintenance_request_update on public.maintenance_request_updates;
create trigger trg_notify_maintenance_request_update
  after insert on public.maintenance_request_updates
  for each row execute function public.notify_maintenance_request_update();

drop trigger if exists trg_notify_work_order_lifecycle on public.work_orders;
create trigger trg_notify_work_order_lifecycle
  after insert or update of status on public.work_orders
  for each row execute function public.notify_work_order_lifecycle();

drop trigger if exists trg_notify_owner_charge_created on public.work_order_costs;
create trigger trg_notify_owner_charge_created
  after insert or update of owner_charge_status on public.work_order_costs
  for each row execute function public.notify_owner_charge_created();

drop trigger if exists trg_notify_visitor_invitation_lifecycle on public.visitor_invitations;
create trigger trg_notify_visitor_invitation_lifecycle
  after insert or update of status on public.visitor_invitations
  for each row execute function public.notify_visitor_invitation_lifecycle();

drop trigger if exists trg_notify_access_event_allowed on public.access_events;
create trigger trg_notify_access_event_allowed
  after insert on public.access_events
  for each row execute function public.notify_access_event_allowed();

drop trigger if exists trg_notify_due_created on public.dues;
create trigger trg_notify_due_created
  after insert on public.dues
  for each row execute function public.notify_due_created();

drop trigger if exists trg_notify_payment_confirmed on public.payments;
create trigger trg_notify_payment_confirmed
  after insert on public.payments
  for each row execute function public.notify_payment_confirmed();

alter table public.vehicles enable row level security;
alter table public.notifications enable row level security;

create policy vehicles_select_staff_or_owner
  on public.vehicles
  for select
  to authenticated
  using (
    public.organization_is_active(organization_id)
    and public.unit_experience_enabled(organization_id)
    and (
      public.vehicle_staff_can_read(organization_id)
      or public.vehicle_member_can_read(vehicles)
    )
  );

create policy notifications_select_recipient
  on public.notifications
  for select
  to authenticated
  using (
    recipient_user_id = auth.uid()
    and public.organization_is_active(organization_id)
    and public.unit_experience_enabled(organization_id)
  );

insert into public.permissions (id, key, description)
values
  ('81220a64-a678-42a6-b32f-30c322dd34b9', 'operations.vehicles.view', 'View organization-scoped unit vehicle records'),
  ('0fe87c39-9462-4c3f-9141-e4b074f7e244', 'operations.vehicles.manage', 'Manage organization-scoped unit vehicle records')
on conflict (key) do nothing;

insert into public.role_template_permissions (role_template_key, permission_key)
values
  ('TENANT_OWNER', 'operations.vehicles.view'),
  ('TENANT_OWNER', 'operations.vehicles.manage'),
  ('TENANT_ADMIN', 'operations.vehicles.view'),
  ('TENANT_ADMIN', 'operations.vehicles.manage'),
  ('GENERAL_MANAGER', 'operations.vehicles.view'),
  ('GENERAL_MANAGER', 'operations.vehicles.manage'),
  ('PROPERTY_MANAGER', 'operations.vehicles.view'),
  ('PROPERTY_MANAGER', 'operations.vehicles.manage'),
  ('VIEWER', 'operations.vehicles.view')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('operations.vehicles.view', 'operations.vehicles.manage')
where r.key in ('TENANT_OWNER', 'TENANT_ADMIN', 'GENERAL_MANAGER', 'PROPERTY_MANAGER')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'operations.vehicles.view'
where r.key = 'VIEWER'
on conflict do nothing;

insert into public.plan_entitlements (id, plan_id, key, value)
select gen_random_uuid(), p.id, 'unit_experience',
  case when p.key in ('PROFESSIONAL', 'ENTERPRISE') then 'true'::jsonb else 'false'::jsonb end
from public.plans p
on conflict (plan_id, key) do nothing;

revoke all privileges on table public.vehicles from public, anon, authenticated;
revoke all privileges on table public.notifications from public, anon, authenticated;
grant select on table public.vehicles to authenticated;
grant select on table public.notifications to authenticated;
grant all privileges on table public.vehicles to service_role;
grant all privileges on table public.notifications to service_role;

revoke all on function public.unit_experience_enabled(uuid) from public, anon, authenticated, service_role;
revoke all on function public.normalize_vehicle_plate(text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.vehicle_staff_can_read(uuid) from public, anon, authenticated, service_role;
revoke all on function public.vehicle_staff_can_manage(uuid) from public, anon, authenticated, service_role;
revoke all on function public.vehicle_member_can_read(public.vehicles) from public, anon, authenticated, service_role;
revoke all on function public.create_notification_once(uuid, uuid, uuid, text, text, text, text, text, text, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.create_vehicle(uuid, text, text, text, text, text, text, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.update_vehicle_staff(uuid, text, text, text, text, text, text, integer, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.deactivate_own_vehicle(uuid) from public, anon, authenticated, service_role;
revoke all on function public.mark_notification_read(uuid) from public, anon, authenticated, service_role;
revoke all on function public.mark_all_notifications_read() from public, anon, authenticated, service_role;
revoke all on function public.get_unit_timeline(uuid, timestamptz, text, integer) from public, anon, authenticated, service_role;
revoke all on function public.notify_maintenance_request_created() from public, anon, authenticated, service_role;
revoke all on function public.notify_maintenance_request_update() from public, anon, authenticated, service_role;
revoke all on function public.notify_work_order_lifecycle() from public, anon, authenticated, service_role;
revoke all on function public.notify_owner_charge_created() from public, anon, authenticated, service_role;
revoke all on function public.notify_visitor_invitation_lifecycle() from public, anon, authenticated, service_role;
revoke all on function public.notify_access_event_allowed() from public, anon, authenticated, service_role;
revoke all on function public.notify_due_created() from public, anon, authenticated, service_role;
revoke all on function public.notify_payment_confirmed() from public, anon, authenticated, service_role;

grant execute on function public.unit_experience_enabled(uuid) to authenticated, service_role;
grant execute on function public.vehicle_staff_can_read(uuid) to authenticated, service_role;
grant execute on function public.vehicle_staff_can_manage(uuid) to authenticated, service_role;
grant execute on function public.vehicle_member_can_read(public.vehicles) to authenticated, service_role;
grant execute on function public.create_vehicle(uuid, text, text, text, text, text, text, integer, text) to authenticated;
grant execute on function public.update_vehicle_staff(uuid, text, text, text, text, text, text, integer, text, boolean) to authenticated;
grant execute on function public.deactivate_own_vehicle(uuid) to authenticated;
grant execute on function public.mark_notification_read(uuid) to authenticated;
grant execute on function public.mark_all_notifications_read() to authenticated;
grant execute on function public.get_unit_timeline(uuid, timestamptz, text, integer) to authenticated;
