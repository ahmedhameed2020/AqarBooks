-- PR1: Maintenance Request Core.
--
-- Scope guard:
-- - No work_orders.
-- - No technician/vendor assignment.
-- - No accounting entries, dues, expenses, supplier invoices, payments, or receipts.
-- - No attachments/storage in this PR; tenant-safe Storage RLS is deferred to PR1B.

create table if not exists public.maintenance_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  name_ar text not null,
  name_en text not null,
  default_priority text not null default 'NORMAL',
  is_active boolean not null default true,
  sort_order integer not null default 100,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maintenance_categories_name_ar_not_blank check (btrim(name_ar) <> ''),
  constraint maintenance_categories_name_en_not_blank check (btrim(name_en) <> ''),
  constraint maintenance_categories_default_priority_check check (default_priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT'))
);

create unique index if not exists maintenance_categories_org_name_ar_key
  on public.maintenance_categories (organization_id, lower(name_ar));

create unique index if not exists maintenance_categories_org_name_en_key
  on public.maintenance_categories (organization_id, lower(name_en));

create index if not exists idx_maintenance_categories_org_active_sort
  on public.maintenance_categories (organization_id, is_active, sort_order, name_ar);

create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  property_id uuid not null,
  unit_id uuid not null,
  requester_member_id uuid not null,
  category_id uuid not null,
  request_no text not null,
  title text not null,
  description text not null,
  priority text not null default 'NORMAL',
  status text not null default 'SUBMITTED',
  submitted_at timestamptz not null default now(),
  triaged_at timestamptz,
  started_at timestamptz,
  waiting_at timestamptz,
  completed_at timestamptz,
  closed_at timestamptz,
  cancelled_at timestamptz,
  created_by uuid references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint maintenance_requests_title_not_blank check (btrim(title) <> ''),
  constraint maintenance_requests_description_not_blank check (btrim(description) <> ''),
  constraint maintenance_requests_priority_check check (priority in ('LOW', 'NORMAL', 'HIGH', 'URGENT')),
  constraint maintenance_requests_status_check check (status in ('SUBMITTED', 'TRIAGED', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CLOSED', 'CANCELLED')),
  constraint maintenance_requests_terminal_timestamps check (
    (status <> 'CANCELLED' or cancelled_at is not null)
    and (status <> 'CLOSED' or closed_at is not null)
    and (status <> 'COMPLETED' or completed_at is not null)
  )
);

create unique index if not exists maintenance_requests_org_request_no_key
  on public.maintenance_requests (organization_id, request_no);

create index if not exists idx_maintenance_requests_org_status_created
  on public.maintenance_requests (organization_id, status, created_at desc);

create index if not exists idx_maintenance_requests_org_property_status
  on public.maintenance_requests (organization_id, property_id, status);

create index if not exists idx_maintenance_requests_org_unit_created
  on public.maintenance_requests (organization_id, unit_id, created_at desc);

create index if not exists idx_maintenance_requests_member_created
  on public.maintenance_requests (requester_member_id, created_at desc);

create table if not exists public.maintenance_request_updates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  maintenance_request_id uuid not null,
  actor_user_id uuid references auth.users(id),
  actor_member_id uuid references public.members(id),
  previous_status text,
  resulting_status text,
  note text not null,
  visibility text not null default 'STAFF_ONLY',
  created_at timestamptz not null default now(),
  constraint maintenance_request_updates_note_not_blank check (btrim(note) <> ''),
  constraint maintenance_request_updates_visibility_check check (visibility in ('STAFF_ONLY', 'MEMBER_VISIBLE')),
  constraint maintenance_request_updates_previous_status_check check (
    previous_status is null or previous_status in ('SUBMITTED', 'TRIAGED', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CLOSED', 'CANCELLED')
  ),
  constraint maintenance_request_updates_resulting_status_check check (
    resulting_status is null or resulting_status in ('SUBMITTED', 'TRIAGED', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CLOSED', 'CANCELLED')
  ),
  constraint maintenance_request_updates_actor_check check (actor_user_id is not null or actor_member_id is not null)
);

create index if not exists idx_maintenance_request_updates_request_created
  on public.maintenance_request_updates (maintenance_request_id, created_at);

create index if not exists idx_maintenance_request_updates_org_created
  on public.maintenance_request_updates (organization_id, created_at desc);

create or replace function public.seed_default_maintenance_categories()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.maintenance_categories (
    organization_id,
    name_ar,
    name_en,
    default_priority,
    sort_order
  )
  values
    (new.id, 'سباكة', 'Plumbing', 'NORMAL', 10),
    (new.id, 'كهرباء', 'Electrical', 'NORMAL', 20),
    (new.id, 'تكييف', 'HVAC', 'NORMAL', 30),
    (new.id, 'مناطق مشتركة', 'Common Areas', 'NORMAL', 40),
    (new.id, 'أخرى', 'Other', 'NORMAL', 50)
  on conflict do nothing;

  return new;
end;
$$;

drop trigger if exists seed_default_maintenance_categories_after_organization_insert
  on public.organizations;

create trigger seed_default_maintenance_categories_after_organization_insert
  after insert on public.organizations
  for each row
  execute function public.seed_default_maintenance_categories();

insert into public.maintenance_categories (
  organization_id,
  name_ar,
  name_en,
  default_priority,
  sort_order
)
select o.id, c.name_ar, c.name_en, c.default_priority, c.sort_order
from public.organizations o
cross join (
  values
    ('سباكة', 'Plumbing', 'NORMAL', 10),
    ('كهرباء', 'Electrical', 'NORMAL', 20),
    ('تكييف', 'HVAC', 'NORMAL', 30),
    ('مناطق مشتركة', 'Common Areas', 'NORMAL', 40),
    ('أخرى', 'Other', 'NORMAL', 50)
) as c(name_ar, name_en, default_priority, sort_order)
on conflict do nothing;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'maintenance_categories_org_id_unique'
      and conrelid = 'public.maintenance_categories'::regclass
  ) then
    alter table public.maintenance_categories
      add constraint maintenance_categories_org_id_unique unique (organization_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'maintenance_requests_org_id_unique'
      and conrelid = 'public.maintenance_requests'::regclass
  ) then
    alter table public.maintenance_requests
      add constraint maintenance_requests_org_id_unique unique (organization_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'properties_org_id_unique'
      and conrelid = 'public.properties'::regclass
  ) then
    alter table public.properties
      add constraint properties_org_id_unique unique (organization_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'units_org_property_id_unique'
      and conrelid = 'public.units'::regclass
  ) then
    alter table public.units
      add constraint units_org_property_id_unique unique (organization_id, property_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'members_org_id_unique'
      and conrelid = 'public.members'::regclass
  ) then
    alter table public.members
      add constraint members_org_id_unique unique (organization_id, id);
  end if;
end $$;

alter table public.maintenance_requests
  add constraint maintenance_requests_org_property_fkey
  foreign key (organization_id, property_id)
  references public.properties (organization_id, id)
  on delete cascade;

alter table public.maintenance_requests
  add constraint maintenance_requests_org_property_unit_fkey
  foreign key (organization_id, property_id, unit_id)
  references public.units (organization_id, property_id, id)
  on delete cascade;

alter table public.maintenance_requests
  add constraint maintenance_requests_org_member_fkey
  foreign key (organization_id, requester_member_id)
  references public.members (organization_id, id)
  on delete cascade;

alter table public.maintenance_requests
  add constraint maintenance_requests_org_category_fkey
  foreign key (organization_id, category_id)
  references public.maintenance_categories (organization_id, id);

alter table public.maintenance_request_updates
  add constraint maintenance_request_updates_org_request_fkey
  foreign key (organization_id, maintenance_request_id)
  references public.maintenance_requests (organization_id, id)
  on delete cascade;

create or replace function public.maintenance_module_enabled(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.get_entitlement(p_organization_id, 'maintenance_module'), 'false'::jsonb) = 'true'::jsonb
    or exists (
      select 1
      from public.tenant_feature_flags tff
      where tff.organization_id = p_organization_id
        and tff.flag_key = 'maintenance_module'
        and tff.enabled = true
    );
$$;

create or replace function public.is_current_member_unit_owner(
  p_member_id uuid,
  p_organization_id uuid,
  p_unit_id uuid
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.unit_ownerships uo
    where uo.organization_id = p_organization_id
      and uo.member_id = p_member_id
      and uo.unit_id = p_unit_id
      and p_member_id = public.current_member_id()
      and (uo.start_date is null or uo.start_date <= current_date)
      and (uo.end_date is null or uo.end_date >= current_date)
  );
$$;

create or replace function public.maintenance_request_staff_can_read(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), p_organization_id, 'operations.maintenance.view')
      or public.has_permission(auth.uid(), p_organization_id, 'operations.maintenance.manage');
$$;

create or replace function public.assert_maintenance_status_transition(
  p_previous_status text,
  p_next_status text,
  p_actor_kind text
) returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if p_previous_status = p_next_status then
    return;
  end if;

  if p_actor_kind = 'MEMBER' then
    if p_next_status = 'CANCELLED'
       and p_previous_status in ('SUBMITTED', 'TRIAGED') then
      return;
    end if;
    raise exception 'INVALID_MAINTENANCE_TRANSITION' using errcode = '22023';
  end if;

  if p_actor_kind = 'STAFF' then
    if (p_previous_status = 'SUBMITTED' and p_next_status in ('TRIAGED', 'CANCELLED'))
      or (p_previous_status = 'TRIAGED' and p_next_status in ('IN_PROGRESS', 'COMPLETED', 'CANCELLED'))
      or (p_previous_status = 'IN_PROGRESS' and p_next_status in ('WAITING', 'COMPLETED', 'CANCELLED'))
      or (p_previous_status = 'WAITING' and p_next_status in ('IN_PROGRESS', 'CANCELLED'))
      or (p_previous_status = 'COMPLETED' and p_next_status in ('CLOSED', 'TRIAGED'))
    then
      return;
    end if;
    raise exception 'INVALID_MAINTENANCE_TRANSITION' using errcode = '22023';
  end if;

  raise exception 'INVALID_MAINTENANCE_ACTOR' using errcode = '22023';
end;
$$;

create or replace function public.create_maintenance_request(
  p_unit_id uuid,
  p_category_id uuid,
  p_title text,
  p_description text,
  p_priority text default 'NORMAL'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_member_id uuid := public.current_member_id();
  v_unit public.units;
  v_category public.maintenance_categories;
  v_request_id uuid;
  v_request_no text;
  v_priority text := coalesce(nullif(btrim(p_priority), ''), 'NORMAL');
begin
  if v_user_id is null or v_member_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if nullif(btrim(p_title), '') is null or char_length(btrim(p_title)) > 160 then
    raise exception 'INVALID_TITLE' using errcode = '22023';
  end if;

  if nullif(btrim(p_description), '') is null or char_length(btrim(p_description)) > 4000 then
    raise exception 'INVALID_DESCRIPTION' using errcode = '22023';
  end if;

  if v_priority not in ('LOW', 'NORMAL', 'HIGH', 'URGENT') then
    raise exception 'INVALID_PRIORITY' using errcode = '22023';
  end if;

  select * into v_unit
  from public.units
  where id = p_unit_id
    and is_active = true
    and archived_at is null;

  if v_unit.id is null then
    raise exception 'UNIT_NOT_FOUND' using errcode = '22023';
  end if;

  if not public.organization_is_active(v_unit.organization_id) then
    raise exception 'ORGANIZATION_INACTIVE' using errcode = '42501';
  end if;

  if not public.maintenance_module_enabled(v_unit.organization_id) then
    raise exception 'MAINTENANCE_NOT_ENTITLED' using errcode = '42501';
  end if;

  if not public.is_current_member_unit_owner(v_member_id, v_unit.organization_id, v_unit.id) then
    raise exception 'UNIT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select * into v_category
  from public.maintenance_categories
  where id = p_category_id
    and organization_id = v_unit.organization_id
    and is_active = true;

  if v_category.id is null then
    raise exception 'CATEGORY_NOT_FOUND' using errcode = '22023';
  end if;

  insert into public.maintenance_requests (
    organization_id,
    property_id,
    unit_id,
    requester_member_id,
    category_id,
    request_no,
    title,
    description,
    priority,
    status,
    created_by,
    updated_by
  ) values (
    v_unit.organization_id,
    v_unit.property_id,
    v_unit.id,
    v_member_id,
    v_category.id,
    'PENDING',
    btrim(p_title),
    btrim(p_description),
    v_priority,
    'SUBMITTED',
    v_user_id,
    v_user_id
  )
  returning id into v_request_id;

  v_request_no := 'MR-' || upper(left(replace(v_request_id::text, '-', ''), 10));

  update public.maintenance_requests
  set request_no = v_request_no
  where id = v_request_id;

  insert into public.maintenance_request_updates (
    organization_id,
    maintenance_request_id,
    actor_user_id,
    actor_member_id,
    previous_status,
    resulting_status,
    note,
    visibility
  ) values (
    v_unit.organization_id,
    v_request_id,
    v_user_id,
    v_member_id,
    null,
    'SUBMITTED',
    'Maintenance request submitted by member.',
    'MEMBER_VISIBLE'
  );

  insert into public.platform_audit_logs (
    actor_id,
    organization_id,
    property_id,
    action,
    entity_type,
    entity_id,
    safe_change_summary
  ) values (
    v_user_id,
    v_unit.organization_id,
    v_unit.property_id,
    'maintenance_request.created',
    'maintenance_request',
    v_request_id,
    jsonb_build_object('request_no', v_request_no, 'unit_id', v_unit.id, 'status', 'SUBMITTED')
  );

  return v_request_id;
end;
$$;

create or replace function public.cancel_own_maintenance_request(
  p_request_id uuid,
  p_note text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_member_id uuid := public.current_member_id();
  v_request public.maintenance_requests;
  v_note text := coalesce(nullif(btrim(p_note), ''), 'Cancelled by member.');
begin
  if v_user_id is null or v_member_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if char_length(v_note) > 1000 then
    raise exception 'INVALID_NOTE' using errcode = '22023';
  end if;

  select * into v_request
  from public.maintenance_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'REQUEST_NOT_FOUND' using errcode = '22023';
  end if;

  if v_request.requester_member_id <> v_member_id then
    raise exception 'REQUEST_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if not public.is_current_member_unit_owner(v_member_id, v_request.organization_id, v_request.unit_id) then
    raise exception 'UNIT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if not public.organization_is_active(v_request.organization_id) then
    raise exception 'ORGANIZATION_INACTIVE' using errcode = '42501';
  end if;

  if not public.maintenance_module_enabled(v_request.organization_id) then
    raise exception 'MAINTENANCE_NOT_ENTITLED' using errcode = '42501';
  end if;

  perform public.assert_maintenance_status_transition(v_request.status, 'CANCELLED', 'MEMBER');

  update public.maintenance_requests
  set status = 'CANCELLED',
      cancelled_at = now(),
      updated_at = now(),
      updated_by = v_user_id
  where id = v_request.id;

  insert into public.maintenance_request_updates (
    organization_id,
    maintenance_request_id,
    actor_user_id,
    actor_member_id,
    previous_status,
    resulting_status,
    note,
    visibility
  ) values (
    v_request.organization_id,
    v_request.id,
    v_user_id,
    v_member_id,
    v_request.status,
    'CANCELLED',
    v_note,
    'MEMBER_VISIBLE'
  );

  insert into public.platform_audit_logs (
    actor_id,
    organization_id,
    property_id,
    action,
    entity_type,
    entity_id,
    safe_change_summary
  ) values (
    v_user_id,
    v_request.organization_id,
    v_request.property_id,
    'maintenance_request.cancelled',
    'maintenance_request',
    v_request.id,
    jsonb_build_object('request_no', v_request.request_no, 'previous_status', v_request.status, 'status', 'CANCELLED')
  );
end;
$$;

create or replace function public.update_maintenance_request_staff(
  p_request_id uuid,
  p_next_status text default null,
  p_category_id uuid default null,
  p_priority text default null,
  p_note text default null,
  p_visibility text default 'STAFF_ONLY'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.maintenance_requests;
  v_next_status text;
  v_priority text;
  v_visibility text := coalesce(nullif(btrim(p_visibility), ''), 'STAFF_ONLY');
  v_note text := nullif(btrim(p_note), '');
  v_category public.maintenance_categories;
  v_status_changed boolean := false;
  v_category_changed boolean := false;
  v_priority_changed boolean := false;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if v_visibility not in ('STAFF_ONLY', 'MEMBER_VISIBLE') then
    raise exception 'INVALID_VISIBILITY' using errcode = '22023';
  end if;

  if v_note is not null and char_length(v_note) > 1000 then
    raise exception 'INVALID_NOTE' using errcode = '22023';
  end if;

  select * into v_request
  from public.maintenance_requests
  where id = p_request_id
  for update;

  if v_request.id is null then
    raise exception 'REQUEST_NOT_FOUND' using errcode = '22023';
  end if;

  if not public.has_permission(v_user_id, v_request.organization_id, 'operations.maintenance.manage') then
    raise exception 'FORBIDDEN_MAINTENANCE_MANAGE' using errcode = '42501';
  end if;

  if not public.organization_is_active(v_request.organization_id) then
    raise exception 'ORGANIZATION_INACTIVE' using errcode = '42501';
  end if;

  if not public.maintenance_module_enabled(v_request.organization_id) then
    raise exception 'MAINTENANCE_NOT_ENTITLED' using errcode = '42501';
  end if;

  v_next_status := coalesce(nullif(btrim(p_next_status), ''), v_request.status);
  if v_next_status not in ('SUBMITTED', 'TRIAGED', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CLOSED', 'CANCELLED') then
    raise exception 'INVALID_STATUS' using errcode = '22023';
  end if;

  perform public.assert_maintenance_status_transition(v_request.status, v_next_status, 'STAFF');
  v_status_changed := v_next_status <> v_request.status;

  v_priority := coalesce(nullif(btrim(p_priority), ''), v_request.priority);
  if v_priority not in ('LOW', 'NORMAL', 'HIGH', 'URGENT') then
    raise exception 'INVALID_PRIORITY' using errcode = '22023';
  end if;
  v_priority_changed := v_priority <> v_request.priority;

  if p_category_id is not null and p_category_id <> v_request.category_id then
    select * into v_category
    from public.maintenance_categories
    where id = p_category_id
      and organization_id = v_request.organization_id
      and is_active = true;

    if v_category.id is null then
      raise exception 'CATEGORY_NOT_FOUND' using errcode = '22023';
    end if;
    v_category_changed := true;
  end if;

  if not v_status_changed and not v_priority_changed and not v_category_changed and v_note is null then
    raise exception 'NO_CHANGE' using errcode = '22023';
  end if;

  update public.maintenance_requests
  set status = v_next_status,
      category_id = coalesce(p_category_id, category_id),
      priority = v_priority,
      triaged_at = case when v_next_status = 'TRIAGED' and triaged_at is null then now() else triaged_at end,
      started_at = case when v_next_status = 'IN_PROGRESS' and started_at is null then now() else started_at end,
      waiting_at = case when v_next_status = 'WAITING' then now() else waiting_at end,
      completed_at = case when v_next_status = 'COMPLETED' and completed_at is null then now() else completed_at end,
      closed_at = case when v_next_status = 'CLOSED' and closed_at is null then now() else closed_at end,
      cancelled_at = case when v_next_status = 'CANCELLED' and cancelled_at is null then now() else cancelled_at end,
      updated_at = now(),
      updated_by = v_user_id
  where id = v_request.id;

  insert into public.maintenance_request_updates (
    organization_id,
    maintenance_request_id,
    actor_user_id,
    previous_status,
    resulting_status,
    note,
    visibility
  ) values (
    v_request.organization_id,
    v_request.id,
    v_user_id,
    case when v_status_changed then v_request.status else null end,
    case when v_status_changed then v_next_status else null end,
    coalesce(
      v_note,
      case
        when v_status_changed then 'Status changed by staff.'
        when v_category_changed or v_priority_changed then 'Request triage fields updated by staff.'
        else 'Request updated by staff.'
      end
    ),
    v_visibility
  );

  if v_status_changed or v_category_changed or v_priority_changed then
    insert into public.platform_audit_logs (
      actor_id,
      organization_id,
      property_id,
      action,
      entity_type,
      entity_id,
      safe_change_summary
    ) values (
      v_user_id,
      v_request.organization_id,
      v_request.property_id,
      case when v_status_changed then 'maintenance_request.status_changed' else 'maintenance_request.triaged' end,
      'maintenance_request',
      v_request.id,
      jsonb_build_object(
        'request_no', v_request.request_no,
        'previous_status', v_request.status,
        'status', v_next_status,
        'priority_changed', v_priority_changed,
        'category_changed', v_category_changed
      )
    );
  end if;
end;
$$;

alter table public.maintenance_categories enable row level security;
alter table public.maintenance_requests enable row level security;
alter table public.maintenance_request_updates enable row level security;

create policy maintenance_categories_select_staff_or_member
  on public.maintenance_categories
  for select
  to authenticated
  using (
    public.organization_is_active(organization_id)
    and public.maintenance_module_enabled(organization_id)
    and (
      public.maintenance_request_staff_can_read(organization_id)
      or organization_id in (
        select m.organization_id
        from public.members m
        where m.id = public.current_member_id()
      )
    )
  );

create policy maintenance_categories_manage_staff
  on public.maintenance_categories
  for all
  to authenticated
  using (
    public.has_permission(auth.uid(), organization_id, 'operations.maintenance.manage')
    and public.organization_is_active(organization_id)
    and public.maintenance_module_enabled(organization_id)
  )
  with check (
    public.has_permission(auth.uid(), organization_id, 'operations.maintenance.manage')
    and public.organization_is_active(organization_id)
    and public.maintenance_module_enabled(organization_id)
  );

create policy maintenance_requests_select_staff_or_owner
  on public.maintenance_requests
  for select
  to authenticated
  using (
    public.organization_is_active(organization_id)
    and public.maintenance_module_enabled(organization_id)
    and (
      public.maintenance_request_staff_can_read(organization_id)
      or (
        requester_member_id = public.current_member_id()
        and public.is_current_member_unit_owner(public.current_member_id(), organization_id, unit_id)
      )
    )
  );

create policy maintenance_requests_manage_staff
  on public.maintenance_requests
  for update
  to authenticated
  using (
    public.has_permission(auth.uid(), organization_id, 'operations.maintenance.manage')
    and public.organization_is_active(organization_id)
    and public.maintenance_module_enabled(organization_id)
  )
  with check (
    public.has_permission(auth.uid(), organization_id, 'operations.maintenance.manage')
    and public.organization_is_active(organization_id)
    and public.maintenance_module_enabled(organization_id)
  );

create policy maintenance_request_updates_select_staff_or_owner_visible
  on public.maintenance_request_updates
  for select
  to authenticated
  using (
    public.organization_is_active(organization_id)
    and public.maintenance_module_enabled(organization_id)
    and (
      public.maintenance_request_staff_can_read(organization_id)
      or (
        visibility = 'MEMBER_VISIBLE'
        and exists (
          select 1
          from public.maintenance_requests mr
          where mr.id = maintenance_request_updates.maintenance_request_id
            and mr.organization_id = maintenance_request_updates.organization_id
            and mr.requester_member_id = public.current_member_id()
            and public.is_current_member_unit_owner(public.current_member_id(), mr.organization_id, mr.unit_id)
        )
      )
    )
  );

insert into public.permissions (id, key, description)
values
  ('3c909fb1-3522-4c6a-97d8-b4df4e5f9eb1', 'operations.maintenance.view', 'View organization-scoped maintenance requests'),
  ('bc7e6372-1c7f-4f87-af3d-06eb942d1651', 'operations.maintenance.manage', 'Triage and update organization-scoped maintenance requests')
on conflict (key) do nothing;

insert into public.role_template_permissions (role_template_key, permission_key)
values
  ('TENANT_OWNER', 'operations.maintenance.view'),
  ('TENANT_OWNER', 'operations.maintenance.manage'),
  ('TENANT_ADMIN', 'operations.maintenance.view'),
  ('TENANT_ADMIN', 'operations.maintenance.manage'),
  ('GENERAL_MANAGER', 'operations.maintenance.view'),
  ('GENERAL_MANAGER', 'operations.maintenance.manage'),
  ('PROPERTY_MANAGER', 'operations.maintenance.view'),
  ('PROPERTY_MANAGER', 'operations.maintenance.manage'),
  ('VIEWER', 'operations.maintenance.view')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('operations.maintenance.view', 'operations.maintenance.manage')
where r.key in ('TENANT_OWNER', 'TENANT_ADMIN', 'GENERAL_MANAGER', 'PROPERTY_MANAGER')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'operations.maintenance.view'
where r.key = 'VIEWER'
on conflict do nothing;

insert into public.plan_entitlements (id, plan_id, key, value)
select gen_random_uuid(), p.id, 'maintenance_module',
  case when p.key in ('PROFESSIONAL', 'ENTERPRISE') then 'true'::jsonb else 'false'::jsonb end
from public.plans p
on conflict (plan_id, key) do nothing;

grant all on table public.maintenance_categories to authenticated, service_role;
grant all on table public.maintenance_requests to authenticated, service_role;
grant all on table public.maintenance_request_updates to authenticated, service_role;
revoke all on function public.seed_default_maintenance_categories() from public;
revoke all on function public.seed_default_maintenance_categories() from anon;
revoke all on function public.seed_default_maintenance_categories() from authenticated;
revoke all on function public.maintenance_module_enabled(uuid) from public;
revoke all on function public.is_current_member_unit_owner(uuid, uuid, uuid) from public;
revoke all on function public.maintenance_request_staff_can_read(uuid) from public;
revoke all on function public.assert_maintenance_status_transition(text, text, text) from public;
revoke all on function public.create_maintenance_request(uuid, uuid, text, text, text) from public;
revoke all on function public.cancel_own_maintenance_request(uuid, text) from public;
revoke all on function public.update_maintenance_request_staff(uuid, text, uuid, text, text, text) from public;

grant execute on function public.maintenance_module_enabled(uuid) to authenticated, service_role;
grant execute on function public.is_current_member_unit_owner(uuid, uuid, uuid) to authenticated, service_role;
grant execute on function public.maintenance_request_staff_can_read(uuid) to authenticated, service_role;
grant execute on function public.create_maintenance_request(uuid, uuid, text, text, text) to authenticated;
grant execute on function public.cancel_own_maintenance_request(uuid, text) to authenticated;
grant execute on function public.update_maintenance_request_staff(uuid, text, uuid, text, text, text) to authenticated;
