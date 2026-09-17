-- PR9.1: Lease lifecycle and renewal database contract only.
-- No successor lease, rent due, notification, or scheduler behavior is
-- implemented here. Those remain separate reviewed delivery slices.

create table public.lease_renewal_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null references public.properties(id) on delete cascade,
  unit_id uuid not null references public.units(id) on delete cascade,
  lease_id uuid not null references public.unit_leases(id) on delete cascade,
  tenant_member_id uuid not null references public.members(id),
  status text not null default 'REQUESTED'
    check (status in ('REQUESTED', 'APPROVED', 'REJECTED')),
  requester_kind text not null check (requester_kind in ('TENANT', 'STAFF')),
  requested_by uuid not null references auth.users(id),
  proposed_starts_on date not null,
  proposed_ends_on date,
  proposed_rent_amount numeric(19,4) not null check (proposed_rent_amount > 0),
  proposed_rent_frequency text not null
    check (proposed_rent_frequency in ('MONTHLY', 'QUARTERLY', 'YEARLY')),
  request_note text,
  decided_by uuid references auth.users(id),
  decided_at timestamptz,
  decision_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint lease_renewal_requests_dates_valid
    check (proposed_ends_on is null or proposed_ends_on >= proposed_starts_on),
  constraint lease_renewal_requests_decision_consistent check (
    (status = 'REQUESTED' and decided_by is null and decided_at is null and decision_reason is null)
    or
    (status in ('APPROVED', 'REJECTED') and decided_by is not null and decided_at is not null)
  ),
  constraint lease_renewal_requests_one_per_lease unique (lease_id)
);

create table public.lease_renewal_transitions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  renewal_request_id uuid not null references public.lease_renewal_requests(id) on delete cascade,
  from_status text check (from_status is null or from_status in ('REQUESTED', 'APPROVED', 'REJECTED')),
  to_status text not null check (to_status in ('REQUESTED', 'APPROVED', 'REJECTED')),
  actor_id uuid not null references auth.users(id),
  reason text,
  created_at timestamptz not null default now(),
  constraint lease_renewal_transition_changes_state
    check (from_status is distinct from to_status)
);

create table public.lease_expiry_dispatches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  lease_id uuid not null references public.unit_leases(id) on delete cascade,
  lease_ends_on date not null,
  threshold_days integer not null check (threshold_days in (90, 60, 30)),
  recipient_user_id uuid not null references auth.users(id),
  recipient_member_id uuid references public.members(id),
  dispatched_at timestamptz not null default now(),
  constraint lease_expiry_dispatches_idempotency
    unique (lease_id, lease_ends_on, threshold_days, recipient_user_id)
);

create index lease_renewal_requests_org_status_idx
  on public.lease_renewal_requests (organization_id, status, created_at desc);
create index lease_renewal_requests_unit_idx
  on public.lease_renewal_requests (unit_id, created_at desc);
create index lease_renewal_transitions_request_idx
  on public.lease_renewal_transitions (renewal_request_id, created_at);
create index lease_expiry_dispatches_org_end_idx
  on public.lease_expiry_dispatches (organization_id, lease_ends_on, threshold_days);

create trigger lease_renewal_requests_updated_at
before update on public.lease_renewal_requests
for each row execute function public.set_updated_at();

create or replace function public.prevent_lease_renewal_transition_mutation()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  -- Cascading parent deletion is permitted so tenant deletion remains
  -- operable. Direct UPDATE/DELETE always enters at trigger depth one.
  if tg_op = 'DELETE' and pg_trigger_depth() > 1 then
    return old;
  end if;
  raise exception 'LEASE_RENEWAL_TRANSITIONS_APPEND_ONLY' using errcode = '42501';
end;
$$;

create trigger lease_renewal_transitions_append_only
before update or delete on public.lease_renewal_transitions
for each row execute function public.prevent_lease_renewal_transition_mutation();

create or replace function public.lease_lifecycle_enabled(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.get_entitlement(p_organization_id, 'lease_lifecycle'), 'false'::jsonb) = 'true'::jsonb
$$;

create or replace function public.lease_renewal_staff_can_read(
  p_organization_id uuid,
  p_property_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.organization_is_active(p_organization_id)
    and public.lease_lifecycle_enabled(p_organization_id)
    and (
      public.has_permission(auth.uid(), p_organization_id, 'property.lease_renewals.view')
      or public.has_permission(auth.uid(), p_organization_id, 'property.lease_renewals.manage')
    )
    and (
      public.is_platform_admin(auth.uid())
      or exists (
        select 1
        from public.user_role_assignments ura
        join public.role_permissions rp on rp.role_id = ura.role_id
        join public.permissions p on p.id = rp.permission_id
        where ura.user_id = auth.uid()
          and ura.organization_id = p_organization_id
          and p.key in ('property.lease_renewals.view', 'property.lease_renewals.manage')
          and (ura.property_id is null or ura.property_id = p_property_id)
      )
    )
$$;

create or replace function public.lease_renewal_staff_can_manage(
  p_organization_id uuid,
  p_property_id uuid
)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select
    public.organization_is_active(p_organization_id)
    and public.lease_lifecycle_enabled(p_organization_id)
    and public.has_permission(auth.uid(), p_organization_id, 'property.lease_renewals.manage')
    and (
      public.is_platform_admin(auth.uid())
      or exists (
        select 1
        from public.user_role_assignments ura
        join public.role_permissions rp on rp.role_id = ura.role_id
        join public.permissions p on p.id = rp.permission_id
        where ura.user_id = auth.uid()
          and ura.organization_id = p_organization_id
          and p.key = 'property.lease_renewals.manage'
          and (ura.property_id is null or ura.property_id = p_property_id)
      )
    )
$$;

create or replace function public.request_lease_renewal(
  p_lease_id uuid,
  p_proposed_starts_on date default null,
  p_proposed_ends_on date default null,
  p_proposed_rent_amount numeric default null,
  p_proposed_rent_frequency text default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lease public.unit_leases;
  v_member_id uuid := public.current_member_id();
  v_requester_kind text;
  v_starts_on date;
  v_ends_on date;
  v_rent_amount numeric(19,4);
  v_rent_frequency text;
  v_request_id uuid;
begin
  if auth.uid() is null then
    raise exception 'LEASE_RENEWAL_NOT_FOUND' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('lease_renewal:' || p_lease_id::text, 0)
  );

  select l.* into v_lease
  from public.unit_leases l
  where l.id = p_lease_id
    and l.status = 'ACTIVE'
    and public.organization_is_active(l.organization_id)
    and public.lease_lifecycle_enabled(l.organization_id)
    and (
      l.tenant_member_id = v_member_id
      or public.lease_renewal_staff_can_manage(l.organization_id, l.property_id)
    );

  if v_lease.id is null then
    raise exception 'LEASE_RENEWAL_NOT_FOUND' using errcode = 'P0002';
  end if;

  select r.id into v_request_id
  from public.lease_renewal_requests r
  where r.lease_id = p_lease_id;
  if v_request_id is not null then
    return v_request_id;
  end if;

  v_starts_on := coalesce(p_proposed_starts_on, v_lease.ends_on + 1);
  v_ends_on := p_proposed_ends_on;
  v_rent_amount := coalesce(p_proposed_rent_amount, v_lease.rent_amount);
  v_rent_frequency := coalesce(p_proposed_rent_frequency, v_lease.rent_frequency);

  if v_starts_on is null
     or (v_lease.ends_on is not null and v_starts_on <= v_lease.ends_on)
     or (v_ends_on is not null and v_ends_on < v_starts_on)
     or v_rent_amount <= 0
     or v_rent_frequency not in ('MONTHLY', 'QUARTERLY', 'YEARLY') then
    raise exception 'LEASE_RENEWAL_INVALID_TERMS' using errcode = '22023';
  end if;

  v_requester_kind := case when v_lease.tenant_member_id = v_member_id then 'TENANT' else 'STAFF' end;

  insert into public.lease_renewal_requests (
    organization_id, property_id, unit_id, lease_id, tenant_member_id,
    requester_kind, requested_by, proposed_starts_on, proposed_ends_on,
    proposed_rent_amount, proposed_rent_frequency, request_note
  ) values (
    v_lease.organization_id, v_lease.property_id, v_lease.unit_id, v_lease.id,
    v_lease.tenant_member_id, v_requester_kind, auth.uid(), v_starts_on,
    v_ends_on, v_rent_amount, v_rent_frequency, nullif(btrim(p_note), '')
  ) returning id into v_request_id;

  insert into public.lease_renewal_transitions (
    organization_id, renewal_request_id, from_status, to_status, actor_id, reason
  ) values (
    v_lease.organization_id, v_request_id, null, 'REQUESTED', auth.uid(), nullif(btrim(p_note), '')
  );

  return v_request_id;
end;
$$;

create or replace function public.decide_lease_renewal(
  p_request_id uuid,
  p_decision text,
  p_reason text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_request public.lease_renewal_requests;
  v_decision text := upper(btrim(coalesce(p_decision, '')));
begin
  if auth.uid() is null or v_decision not in ('APPROVED', 'REJECTED') then
    raise exception 'LEASE_RENEWAL_NOT_FOUND' using errcode = 'P0002';
  end if;

  select r.* into v_request
  from public.lease_renewal_requests r
  where r.id = p_request_id
    and public.lease_renewal_staff_can_manage(r.organization_id, r.property_id)
  for update;

  if v_request.id is null then
    raise exception 'LEASE_RENEWAL_NOT_FOUND' using errcode = 'P0002';
  end if;

  if v_request.status = v_decision then
    return v_request.id;
  end if;
  if v_request.status <> 'REQUESTED' then
    raise exception 'LEASE_RENEWAL_INVALID_STATE' using errcode = '22023';
  end if;
  if v_decision = 'REJECTED' and nullif(btrim(p_reason), '') is null then
    raise exception 'LEASE_RENEWAL_DECISION_REASON_REQUIRED' using errcode = '22023';
  end if;

  update public.lease_renewal_requests
  set status = v_decision,
      decided_by = auth.uid(),
      decided_at = now(),
      decision_reason = nullif(btrim(p_reason), '')
  where id = v_request.id;

  insert into public.lease_renewal_transitions (
    organization_id, renewal_request_id, from_status, to_status, actor_id, reason
  ) values (
    v_request.organization_id, v_request.id, 'REQUESTED', v_decision, auth.uid(), nullif(btrim(p_reason), '')
  );

  return v_request.id;
end;
$$;

create or replace function public.get_owned_unit_lease_renewal_status(p_unit_id uuid)
returns table (
  renewal_request_id uuid,
  lease_id uuid,
  unit_id uuid,
  status text,
  requested_at timestamptz,
  decided_at timestamptz,
  lease_ends_on date
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_member_id uuid := public.current_member_id();
  v_organization_id uuid;
begin
  select u.organization_id into v_organization_id
  from public.units u
  where u.id = p_unit_id
    and public.organization_is_active(u.organization_id)
    and public.lease_lifecycle_enabled(u.organization_id)
    and exists (
      select 1
      from public.unit_ownerships uo
      where uo.organization_id = u.organization_id
        and uo.unit_id = u.id
        and uo.member_id = v_member_id
        and uo.start_date <= current_date
        and (uo.end_date is null or uo.end_date >= current_date)
    );

  if v_organization_id is null then
    raise exception 'LEASE_RENEWAL_NOT_FOUND' using errcode = 'P0002';
  end if;

  return query
  select r.id, r.lease_id, r.unit_id, r.status, r.created_at, r.decided_at, l.ends_on
  from public.lease_renewal_requests r
  join public.unit_leases l on l.id = r.lease_id and l.organization_id = r.organization_id
  where r.organization_id = v_organization_id
    and r.unit_id = p_unit_id
  order by r.created_at desc
  limit 1;
end;
$$;

alter table public.lease_renewal_requests enable row level security;
alter table public.lease_renewal_transitions enable row level security;
alter table public.lease_expiry_dispatches enable row level security;

create policy lease_renewal_requests_select_tenant_or_staff
on public.lease_renewal_requests for select to authenticated
using (
  public.organization_is_active(organization_id)
  and public.lease_lifecycle_enabled(organization_id)
  and (
    tenant_member_id = public.current_member_id()
    or public.lease_renewal_staff_can_read(organization_id, property_id)
  )
);

create policy lease_renewal_transitions_select_tenant_or_staff
on public.lease_renewal_transitions for select to authenticated
using (
  exists (
    select 1
    from public.lease_renewal_requests r
    where r.id = renewal_request_id
      and r.organization_id = organization_id
      and public.organization_is_active(r.organization_id)
      and public.lease_lifecycle_enabled(r.organization_id)
      and (
        r.tenant_member_id = public.current_member_id()
        or public.lease_renewal_staff_can_read(r.organization_id, r.property_id)
      )
  )
);

insert into public.permissions (key, description)
values
  ('property.lease_renewals.view', 'View lease renewal requests and transition history'),
  ('property.lease_renewals.manage', 'Create and decide lease renewal requests')
on conflict (key) do nothing;

insert into public.role_template_permissions (role_template_key, permission_key)
select role_key, permission_key
from (values
  ('TENANT_OWNER', 'property.lease_renewals.view'),
  ('TENANT_OWNER', 'property.lease_renewals.manage'),
  ('TENANT_ADMIN', 'property.lease_renewals.view'),
  ('GENERAL_MANAGER', 'property.lease_renewals.view'),
  ('PROPERTY_MANAGER', 'property.lease_renewals.view'),
  ('PROPERTY_MANAGER', 'property.lease_renewals.manage'),
  ('FINANCE_MANAGER', 'property.lease_renewals.view'),
  ('ACCOUNTANT', 'property.lease_renewals.view'),
  ('COLLECTOR', 'property.lease_renewals.view'),
  ('AUDITOR', 'property.lease_renewals.view'),
  ('VIEWER', 'property.lease_renewals.view')
) as grants(role_key, permission_key)
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'property.lease_renewals.view'
where r.key in (
  'TENANT_OWNER', 'TENANT_ADMIN', 'GENERAL_MANAGER', 'PROPERTY_MANAGER',
  'FINANCE_MANAGER', 'ACCOUNTANT', 'COLLECTOR', 'AUDITOR', 'VIEWER'
)
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'property.lease_renewals.manage'
where r.key in ('TENANT_OWNER', 'PROPERTY_MANAGER')
on conflict do nothing;

insert into public.plan_entitlements (id, plan_id, key, value)
select gen_random_uuid(), p.id, 'lease_lifecycle',
  case when p.key in ('PROFESSIONAL', 'ENTERPRISE') then 'true'::jsonb else 'false'::jsonb end
from public.plans p
on conflict (plan_id, key) do nothing;

revoke all privileges on table public.lease_renewal_requests from public, anon, authenticated;
revoke all privileges on table public.lease_renewal_transitions from public, anon, authenticated;
revoke all privileges on table public.lease_expiry_dispatches from public, anon, authenticated;
grant select on table public.lease_renewal_requests to authenticated;
grant select on table public.lease_renewal_transitions to authenticated;
grant all privileges on table public.lease_renewal_requests to service_role;
grant all privileges on table public.lease_renewal_transitions to service_role;
grant all privileges on table public.lease_expiry_dispatches to service_role;

revoke all on function public.prevent_lease_renewal_transition_mutation() from public, anon, authenticated, service_role;
revoke all on function public.lease_lifecycle_enabled(uuid) from public, anon, authenticated, service_role;
revoke all on function public.lease_renewal_staff_can_read(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.lease_renewal_staff_can_manage(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.request_lease_renewal(uuid, date, date, numeric, text, text) from public, anon, authenticated, service_role;
revoke all on function public.decide_lease_renewal(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.get_owned_unit_lease_renewal_status(uuid) from public, anon, authenticated, service_role;

grant execute on function public.lease_lifecycle_enabled(uuid) to authenticated, service_role;
grant execute on function public.lease_renewal_staff_can_read(uuid, uuid) to authenticated, service_role;
grant execute on function public.lease_renewal_staff_can_manage(uuid, uuid) to authenticated, service_role;
grant execute on function public.request_lease_renewal(uuid, date, date, numeric, text, text) to authenticated, service_role;
grant execute on function public.decide_lease_renewal(uuid, text, text) to authenticated, service_role;
grant execute on function public.get_owned_unit_lease_renewal_status(uuid) to authenticated, service_role;
