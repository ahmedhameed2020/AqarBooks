-- PR8: shared amenity catalogue and owner booking workflow.
-- Booking mutations are RPC-only so tenant scope, current unit ownership,
-- schedule validation, and concurrency control cannot be supplied by clients.

create table if not exists public.amenities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  name_ar text not null,
  name_en text not null,
  description_ar text,
  description_en text,
  capacity integer not null default 1,
  slot_minutes integer not null default 60,
  opens_at time not null default time '08:00',
  closes_at time not null default time '22:00',
  max_advance_days integer not null default 30,
  requires_approval boolean not null default false,
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint amenities_org_property_fkey
    foreign key (organization_id, property_id)
    references public.properties (organization_id, id)
    on delete cascade,
  constraint amenities_org_id_unique unique (organization_id, id),
  constraint amenities_org_property_id_unique unique (organization_id, property_id, id),
  constraint amenities_names_not_blank check (btrim(name_ar) <> '' and btrim(name_en) <> ''),
  constraint amenities_text_lengths check (
    char_length(name_ar) <= 120
    and char_length(name_en) <= 120
    and (description_ar is null or char_length(description_ar) <= 1000)
    and (description_en is null or char_length(description_en) <= 1000)
  ),
  constraint amenities_capacity_valid check (capacity between 1 and 10000),
  constraint amenities_slot_minutes_valid check (slot_minutes between 15 and 480),
  constraint amenities_hours_valid check (opens_at < closes_at),
  constraint amenities_advance_window_valid check (max_advance_days between 1 and 365)
);

create unique index if not exists amenities_property_name_en_key
  on public.amenities (organization_id, property_id, lower(btrim(name_en)));

create index if not exists idx_amenities_org_property_active
  on public.amenities (organization_id, property_id, is_active, name_en);

drop trigger if exists trg_amenities_updated_at on public.amenities;
create trigger trg_amenities_updated_at
  before update on public.amenities
  for each row execute function public.set_updated_at();

create table if not exists public.amenity_bookings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  amenity_id uuid not null,
  unit_id uuid not null,
  member_id uuid not null,
  starts_at timestamptz not null,
  ends_at timestamptz not null,
  status text not null default 'REQUESTED',
  member_note text,
  staff_note text,
  decided_at timestamptz,
  decided_by uuid references auth.users(id),
  cancelled_at timestamptz,
  cancelled_by uuid references auth.users(id),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint amenity_bookings_org_amenity_fkey
    foreign key (organization_id, property_id, amenity_id)
    references public.amenities (organization_id, property_id, id)
    on delete cascade,
  constraint amenity_bookings_org_property_unit_fkey
    foreign key (organization_id, property_id, unit_id)
    references public.units (organization_id, property_id, id)
    on delete restrict,
  constraint amenity_bookings_org_member_fkey
    foreign key (organization_id, member_id)
    references public.members (organization_id, id)
    on delete restrict,
  constraint amenity_bookings_status_check
    check (status in ('REQUESTED', 'CONFIRMED', 'REJECTED', 'CANCELLED')),
  constraint amenity_bookings_time_valid check (ends_at > starts_at),
  constraint amenity_bookings_notes_length check (
    (member_note is null or char_length(member_note) <= 500)
    and (staff_note is null or char_length(staff_note) <= 500)
  ),
  constraint amenity_bookings_decision_consistent check (
    (status in ('CONFIRMED', 'REJECTED') and decided_at is not null and decided_by is not null)
    or (status in ('REQUESTED', 'CANCELLED'))
  ),
  constraint amenity_bookings_cancel_consistent check (
    (status = 'CANCELLED' and cancelled_at is not null and cancelled_by is not null)
    or (status <> 'CANCELLED' and cancelled_at is null and cancelled_by is null)
  )
);

create index if not exists idx_amenity_bookings_conflict_lookup
  on public.amenity_bookings (amenity_id, starts_at, ends_at)
  where status in ('REQUESTED', 'CONFIRMED');

create index if not exists idx_amenity_bookings_member_upcoming
  on public.amenity_bookings (member_id, starts_at desc);

create index if not exists idx_amenity_bookings_org_status_start
  on public.amenity_bookings (organization_id, status, starts_at);

drop trigger if exists trg_amenity_bookings_updated_at on public.amenity_bookings;
create trigger trg_amenity_bookings_updated_at
  before update on public.amenity_bookings
  for each row execute function public.set_updated_at();

create or replace function public.amenity_booking_enabled(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.get_entitlement(p_organization_id, 'amenity_bookings'), 'false'::jsonb) = 'true'::jsonb
    or exists (
      select 1
      from public.tenant_feature_flags tff
      where tff.organization_id = p_organization_id
        and tff.flag_key = 'amenity_bookings'
        and tff.enabled = true
    );
$$;

create or replace function public.amenity_staff_can_read(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), p_organization_id, 'operations.amenities.view')
      or public.has_permission(auth.uid(), p_organization_id, 'operations.amenities.manage');
$$;

create or replace function public.amenity_staff_can_manage(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), p_organization_id, 'operations.amenities.manage');
$$;

create or replace function public.create_amenity(
  p_property_id uuid,
  p_name_ar text,
  p_name_en text,
  p_description_ar text default null,
  p_description_en text default null,
  p_capacity integer default 1,
  p_slot_minutes integer default 60,
  p_opens_at time default time '08:00',
  p_closes_at time default time '22:00',
  p_max_advance_days integer default 30,
  p_requires_approval boolean default false
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_property public.properties;
  v_amenity_id uuid := gen_random_uuid();
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_property
  from public.properties p
  where p.id = p_property_id
    and public.organization_is_active(p.organization_id)
    and public.amenity_booking_enabled(p.organization_id)
    and public.amenity_staff_can_manage(p.organization_id);
  if v_property.id is null then
    raise exception 'AMENITY_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if nullif(btrim(p_name_ar), '') is null or nullif(btrim(p_name_en), '') is null then
    raise exception 'INVALID_AMENITY_NAME' using errcode = '22023';
  end if;

  insert into public.amenities (
    id, organization_id, property_id, name_ar, name_en,
    description_ar, description_en, capacity, slot_minutes,
    opens_at, closes_at, max_advance_days, requires_approval,
    created_by, updated_by
  ) values (
    v_amenity_id, v_property.organization_id, v_property.id,
    btrim(p_name_ar), btrim(p_name_en), nullif(btrim(p_description_ar), ''),
    nullif(btrim(p_description_en), ''), p_capacity, p_slot_minutes,
    p_opens_at, p_closes_at, p_max_advance_days,
    coalesce(p_requires_approval, false), v_user_id, v_user_id
  );

  return v_amenity_id;
exception
  when unique_violation then
    raise exception 'DUPLICATE_AMENITY_NAME' using errcode = '23505';
end;
$$;

create or replace function public.update_amenity(
  p_amenity_id uuid,
  p_name_ar text,
  p_name_en text,
  p_description_ar text default null,
  p_description_en text default null,
  p_capacity integer default 1,
  p_slot_minutes integer default 60,
  p_opens_at time default time '08:00',
  p_closes_at time default time '22:00',
  p_max_advance_days integer default 30,
  p_requires_approval boolean default false,
  p_is_active boolean default true
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_amenity public.amenities;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_amenity
  from public.amenities a
  where a.id = p_amenity_id
    and public.organization_is_active(a.organization_id)
    and public.amenity_booking_enabled(a.organization_id)
    and public.amenity_staff_can_manage(a.organization_id);
  if v_amenity.id is null then
    raise exception 'AMENITY_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if nullif(btrim(p_name_ar), '') is null or nullif(btrim(p_name_en), '') is null then
    raise exception 'INVALID_AMENITY_NAME' using errcode = '22023';
  end if;

  update public.amenities
  set name_ar = btrim(p_name_ar), name_en = btrim(p_name_en),
      description_ar = nullif(btrim(p_description_ar), ''),
      description_en = nullif(btrim(p_description_en), ''),
      capacity = p_capacity, slot_minutes = p_slot_minutes,
      opens_at = p_opens_at, closes_at = p_closes_at,
      max_advance_days = p_max_advance_days,
      requires_approval = coalesce(p_requires_approval, false),
      is_active = coalesce(p_is_active, true), updated_by = v_user_id
  where id = v_amenity.id;
exception
  when unique_violation then
    raise exception 'DUPLICATE_AMENITY_NAME' using errcode = '23505';
end;
$$;

create or replace function public.set_amenity_active(
  p_amenity_id uuid,
  p_is_active boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_amenity public.amenities;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_amenity
  from public.amenities a
  where a.id = p_amenity_id
    and public.organization_is_active(a.organization_id)
    and public.amenity_booking_enabled(a.organization_id)
    and public.amenity_staff_can_manage(a.organization_id);
  if v_amenity.id is null then
    raise exception 'AMENITY_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  update public.amenities
  set is_active = coalesce(p_is_active, false), updated_by = v_user_id
  where id = v_amenity.id;
end;
$$;

create or replace function public.create_amenity_booking(
  p_amenity_id uuid,
  p_unit_id uuid,
  p_local_starts_at timestamp,
  p_member_note text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_member_id uuid := public.current_member_id();
  v_amenity public.amenities;
  v_unit public.units;
  v_timezone text;
  v_starts_at timestamptz;
  v_ends_at timestamptz;
  v_local_start timestamp;
  v_local_end timestamp;
  v_minutes_from_open integer;
  v_status text;
  v_booking_id uuid := gen_random_uuid();
begin
  if v_user_id is null or v_member_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_amenity
  from public.amenities a
  where a.id = p_amenity_id
    and a.is_active
    and public.organization_is_active(a.organization_id)
    and public.amenity_booking_enabled(a.organization_id);
  if v_amenity.id is null then
    raise exception 'AMENITY_BOOKING_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select * into v_unit from public.units
  where id = p_unit_id and archived_at is null;
  if v_unit.id is null
     or v_unit.organization_id <> v_amenity.organization_id
     or v_unit.property_id <> v_amenity.property_id
     or not public.is_current_member_unit_owner(v_member_id, v_unit.organization_id, v_unit.id) then
    raise exception 'AMENITY_BOOKING_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select p.timezone into v_timezone from public.properties p where p.id = v_amenity.property_id;
  v_starts_at := p_local_starts_at at time zone v_timezone;
  v_ends_at := v_starts_at + make_interval(mins => v_amenity.slot_minutes);
  v_local_start := p_local_starts_at;
  v_local_end := v_ends_at at time zone v_timezone;
  v_minutes_from_open := floor(extract(epoch from (v_local_start::time - v_amenity.opens_at)) / 60)::integer;

  if v_starts_at <= now()
     or v_starts_at > now() + make_interval(days => v_amenity.max_advance_days)
     or v_local_start::date <> v_local_end::date
     or v_local_start::time < v_amenity.opens_at
     or v_local_end::time > v_amenity.closes_at
     or extract(second from v_local_start) <> 0
     or v_minutes_from_open < 0
     or mod(v_minutes_from_open, v_amenity.slot_minutes) <> 0 then
    raise exception 'INVALID_BOOKING_SLOT' using errcode = '22023';
  end if;
  if p_member_note is not null and char_length(p_member_note) > 500 then
    raise exception 'INVALID_BOOKING_NOTE' using errcode = '22023';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(v_amenity.id::text, 0));
  if exists (
    select 1 from public.amenity_bookings ab
    where ab.amenity_id = v_amenity.id
      and ab.status in ('REQUESTED', 'CONFIRMED')
      and ab.starts_at < v_ends_at
      and ab.ends_at > v_starts_at
  ) then
    raise exception 'AMENITY_SLOT_UNAVAILABLE' using errcode = '23P01';
  end if;

  v_status := case when v_amenity.requires_approval then 'REQUESTED' else 'CONFIRMED' end;
  insert into public.amenity_bookings (
    id, organization_id, property_id, amenity_id, unit_id, member_id,
    starts_at, ends_at, status, member_note, decided_at, decided_by, created_by
  ) values (
    v_booking_id, v_amenity.organization_id, v_amenity.property_id, v_amenity.id,
    v_unit.id, v_member_id, v_starts_at, v_ends_at, v_status,
    nullif(btrim(p_member_note), ''),
    case when v_status = 'CONFIRMED' then now() else null end,
    case when v_status = 'CONFIRMED' then v_user_id else null end,
    v_user_id
  );
  return v_booking_id;
end;
$$;

create or replace function public.cancel_own_amenity_booking(p_booking_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_member_id uuid := public.current_member_id();
  v_booking public.amenity_bookings;
begin
  if v_user_id is null or v_member_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_booking from public.amenity_bookings where id = p_booking_id for update;
  if v_booking.id is null
     or v_booking.member_id <> v_member_id
     or not public.amenity_booking_enabled(v_booking.organization_id) then
    raise exception 'AMENITY_BOOKING_NOT_FOUND' using errcode = 'P0002';
  end if;
  if v_booking.status not in ('REQUESTED', 'CONFIRMED') or v_booking.starts_at <= now() then
    raise exception 'AMENITY_BOOKING_NOT_CANCELLABLE' using errcode = '22023';
  end if;
  update public.amenity_bookings
  set status = 'CANCELLED', cancelled_at = now(), cancelled_by = v_user_id
  where id = v_booking.id;
end;
$$;

create or replace function public.decide_amenity_booking(
  p_booking_id uuid,
  p_decision text,
  p_staff_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_booking public.amenity_bookings;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;
  select * into v_booking
  from public.amenity_bookings ab
  where ab.id = p_booking_id
    and public.organization_is_active(ab.organization_id)
    and public.amenity_booking_enabled(ab.organization_id)
    and public.amenity_staff_can_manage(ab.organization_id)
  for update;
  if v_booking.id is null then
    raise exception 'AMENITY_BOOKING_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if v_booking.status <> 'REQUESTED' or p_decision not in ('CONFIRMED', 'REJECTED') then
    raise exception 'INVALID_BOOKING_DECISION' using errcode = '22023';
  end if;
  if p_staff_note is not null and char_length(p_staff_note) > 500 then
    raise exception 'INVALID_BOOKING_NOTE' using errcode = '22023';
  end if;
  update public.amenity_bookings
  set status = p_decision, staff_note = nullif(btrim(p_staff_note), ''),
      decided_at = now(), decided_by = v_user_id
  where id = v_booking.id;
end;
$$;

alter table public.notifications drop constraint if exists notifications_type_check;
alter table public.notifications add constraint notifications_type_check check (
  type in (
    'REQUEST_RECEIVED', 'MAINTENANCE_UPDATE', 'WORK_ORDER_SCHEDULED',
    'WORK_STARTED', 'WORK_COMPLETED', 'OWNER_CHARGE_CREATED',
    'VISITOR_INVITATION_CREATED', 'VISITOR_ENTERED', 'VISITOR_EXITED',
    'INVITATION_REVOKED', 'DUE_CREATED', 'PAYMENT_CONFIRMED',
    'RECEIPT_AVAILABLE', 'VEHICLE_REGISTERED', 'VEHICLE_DEACTIVATED',
    'AMENITY_BOOKING_REQUESTED', 'AMENITY_BOOKING_CONFIRMED',
    'AMENITY_BOOKING_REJECTED', 'AMENITY_BOOKING_CANCELLED'
  )
);

alter table public.notifications drop constraint if exists notifications_source_type_check;
alter table public.notifications add constraint notifications_source_type_check check (
  source_type in (
    'maintenance_request', 'maintenance_request_update', 'work_order',
    'work_order_update', 'work_order_cost', 'visitor_invitation',
    'access_event', 'due', 'payment', 'vehicle', 'amenity_booking'
  )
);

create or replace function public.notify_amenity_booking_lifecycle()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_member public.members;
  v_amenity public.amenities;
  v_timezone text;
  v_type text;
begin
  if tg_op = 'UPDATE' and new.status = old.status then
    return new;
  end if;
  select * into v_member from public.members where id = new.member_id;
  select * into v_amenity from public.amenities where id = new.amenity_id;
  select p.timezone into v_timezone from public.properties p where p.id = new.property_id;
  if v_member.user_id is null then return new; end if;
  v_type := 'AMENITY_BOOKING_' || new.status;
  perform public.create_notification_once(
    new.organization_id, v_member.user_id, v_member.id, v_type,
    case new.status
      when 'REQUESTED' then 'تم استلام طلب حجز المرفق'
      when 'CONFIRMED' then 'تم تأكيد حجز المرفق'
      when 'REJECTED' then 'تعذر قبول حجز المرفق'
      else 'تم إلغاء حجز المرفق' end,
    case new.status
      when 'REQUESTED' then 'Amenity booking received'
      when 'CONFIRMED' then 'Amenity booking confirmed'
      when 'REJECTED' then 'Amenity booking declined'
      else 'Amenity booking cancelled' end,
    v_amenity.name_ar || ' · ' || to_char(new.starts_at at time zone v_timezone, 'YYYY-MM-DD HH24:MI'),
    v_amenity.name_en || ' · ' || to_char(new.starts_at at time zone v_timezone, 'YYYY-MM-DD HH24:MI'),
    'amenity_booking', new.id, '/portal/amenities',
    case when new.status = 'REJECTED' then 'HIGH' else 'NORMAL' end
  );
  return new;
end;
$$;

drop trigger if exists trg_notify_amenity_booking_lifecycle on public.amenity_bookings;
create trigger trg_notify_amenity_booking_lifecycle
  after insert or update of status on public.amenity_bookings
  for each row execute function public.notify_amenity_booking_lifecycle();

alter table public.amenities enable row level security;
alter table public.amenity_bookings enable row level security;

create policy amenities_select_staff_or_owner
  on public.amenities for select to authenticated
  using (
    public.organization_is_active(organization_id)
    and public.amenity_booking_enabled(organization_id)
    and (
      public.amenity_staff_can_read(organization_id)
      or (
        is_active
        and exists (
          select 1
          from public.unit_ownerships uo
          join public.units u on u.id = uo.unit_id
          where uo.organization_id = amenities.organization_id
            and u.organization_id = amenities.organization_id
            and u.property_id = amenities.property_id
            and uo.member_id = public.current_member_id()
            and (uo.start_date is null or uo.start_date <= current_date)
            and (uo.end_date is null or uo.end_date >= current_date)
        )
      )
    )
  );

create policy amenity_bookings_select_staff_or_owner
  on public.amenity_bookings for select to authenticated
  using (
    public.organization_is_active(organization_id)
    and public.amenity_booking_enabled(organization_id)
    and (
      public.amenity_staff_can_read(organization_id)
      or member_id = public.current_member_id()
    )
  );

insert into public.permissions (id, key, description)
values
  ('17966621-5eb1-415d-b8d7-1391a8601b7c', 'operations.amenities.view', 'View organization-scoped amenities and bookings'),
  ('1575beac-1dc8-4298-825a-44e75d22d374', 'operations.amenities.manage', 'Manage amenities and decide booking requests')
on conflict (key) do nothing;

insert into public.role_template_permissions (role_template_key, permission_key)
values
  ('TENANT_OWNER', 'operations.amenities.view'),
  ('TENANT_OWNER', 'operations.amenities.manage'),
  ('TENANT_ADMIN', 'operations.amenities.view'),
  ('TENANT_ADMIN', 'operations.amenities.manage'),
  ('GENERAL_MANAGER', 'operations.amenities.view'),
  ('GENERAL_MANAGER', 'operations.amenities.manage'),
  ('PROPERTY_MANAGER', 'operations.amenities.view'),
  ('PROPERTY_MANAGER', 'operations.amenities.manage'),
  ('VIEWER', 'operations.amenities.view')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('operations.amenities.view', 'operations.amenities.manage')
where r.key in ('TENANT_OWNER', 'TENANT_ADMIN', 'GENERAL_MANAGER', 'PROPERTY_MANAGER')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'operations.amenities.view'
where r.key = 'VIEWER'
on conflict do nothing;

insert into public.plan_entitlements (id, plan_id, key, value)
select gen_random_uuid(), p.id, 'amenity_bookings',
  case when p.key in ('PROFESSIONAL', 'ENTERPRISE') then 'true'::jsonb else 'false'::jsonb end
from public.plans p
on conflict (plan_id, key) do nothing;

revoke all privileges on table public.amenities from public, anon, authenticated;
revoke all privileges on table public.amenity_bookings from public, anon, authenticated;
grant select on table public.amenities to authenticated;
grant select on table public.amenity_bookings to authenticated;
grant all privileges on table public.amenities to service_role;
grant all privileges on table public.amenity_bookings to service_role;

revoke all on function public.amenity_booking_enabled(uuid) from public, anon, authenticated, service_role;
revoke all on function public.amenity_staff_can_read(uuid) from public, anon, authenticated, service_role;
revoke all on function public.amenity_staff_can_manage(uuid) from public, anon, authenticated, service_role;
revoke all on function public.create_amenity(uuid, text, text, text, text, integer, integer, time, time, integer, boolean) from public, anon, authenticated, service_role;
revoke all on function public.update_amenity(uuid, text, text, text, text, integer, integer, time, time, integer, boolean, boolean) from public, anon, authenticated, service_role;
revoke all on function public.set_amenity_active(uuid, boolean) from public, anon, authenticated, service_role;
revoke all on function public.create_amenity_booking(uuid, uuid, timestamp, text) from public, anon, authenticated, service_role;
revoke all on function public.cancel_own_amenity_booking(uuid) from public, anon, authenticated, service_role;
revoke all on function public.decide_amenity_booking(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.notify_amenity_booking_lifecycle() from public, anon, authenticated, service_role;

grant execute on function public.amenity_booking_enabled(uuid) to authenticated, service_role;
grant execute on function public.amenity_staff_can_read(uuid) to authenticated, service_role;
grant execute on function public.amenity_staff_can_manage(uuid) to authenticated, service_role;
grant execute on function public.create_amenity(uuid, text, text, text, text, integer, integer, time, time, integer, boolean) to authenticated;
grant execute on function public.update_amenity(uuid, text, text, text, text, integer, integer, time, time, integer, boolean, boolean) to authenticated;
grant execute on function public.set_amenity_active(uuid, boolean) to authenticated;
grant execute on function public.create_amenity_booking(uuid, uuid, timestamp, text) to authenticated;
grant execute on function public.cancel_own_amenity_booking(uuid) to authenticated;
grant execute on function public.decide_amenity_booking(uuid, text, text) to authenticated;
