-- PR5: Gate Operations + Access Event Ledger.
--
-- Scope guard:
-- - Builds on PR4 visitor invitations and QR bearer credentials.
-- - No vehicles, ANPR, hardware integration, incidents, notifications, or dashboards.
-- - Access decisions are server-authoritative and append-only.
-- - Raw QR secrets and token hashes are never stored in gate/access event rows.

create table if not exists public.gates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  code text not null,
  name_ar text not null,
  name_en text not null,
  direction_mode text not null default 'BOTH',
  is_active boolean not null default true,
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint gates_code_not_blank check (btrim(code) <> ''),
  constraint gates_code_length check (char_length(code) <= 40),
  constraint gates_name_ar_not_blank check (btrim(name_ar) <> ''),
  constraint gates_name_en_not_blank check (btrim(name_en) <> ''),
  constraint gates_name_ar_length check (char_length(name_ar) <= 120),
  constraint gates_name_en_length check (char_length(name_en) <= 120),
  constraint gates_direction_mode_check check (direction_mode in ('ENTRY', 'EXIT', 'BOTH')),
  constraint gates_org_property_fkey
    foreign key (organization_id, property_id)
    references public.properties (organization_id, id)
    on delete cascade
);

create unique index if not exists gates_org_id_key
  on public.gates (organization_id, id);

create unique index if not exists gates_org_code_key
  on public.gates (organization_id, lower(code));

create index if not exists idx_gates_org_property_active
  on public.gates (organization_id, property_id, is_active);

create trigger trg_gates_updated_at
  before update on public.gates
  for each row execute function public.set_updated_at();

create table if not exists public.visitor_access_state (
  visitor_invitation_id uuid primary key,
  organization_id uuid not null,
  property_id uuid not null,
  unit_id uuid not null,
  is_inside boolean not null default false,
  entry_count integer not null default 0,
  exit_count integer not null default 0,
  last_entry_at timestamptz,
  last_exit_at timestamptz,
  last_gate_id uuid,
  updated_at timestamptz not null default now(),
  constraint visitor_access_state_counts_nonnegative check (entry_count >= 0 and exit_count >= 0),
  constraint visitor_access_state_exit_not_ahead check (exit_count <= entry_count),
  constraint visitor_access_state_inside_consistent check (
    (is_inside and entry_count > exit_count)
    or (not is_inside and entry_count = exit_count)
  ),
  constraint visitor_access_state_org_invitation_fkey
    foreign key (organization_id, visitor_invitation_id)
    references public.visitor_invitations (organization_id, id)
    on delete cascade,
  constraint visitor_access_state_org_property_fkey
    foreign key (organization_id, property_id)
    references public.properties (organization_id, id)
    on delete cascade,
  constraint visitor_access_state_org_property_unit_fkey
    foreign key (organization_id, property_id, unit_id)
    references public.units (organization_id, property_id, id)
    on delete cascade,
  constraint visitor_access_state_last_gate_fkey
    foreign key (organization_id, last_gate_id)
    references public.gates (organization_id, id)
);

create index if not exists idx_visitor_access_state_org_inside
  on public.visitor_access_state (organization_id, property_id, is_inside, updated_at desc);

create table if not exists public.access_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  gate_id uuid not null,
  visitor_invitation_id uuid,
  unit_id uuid,
  direction text not null,
  decision text not null,
  reason_code text not null,
  client_scan_id uuid not null,
  operator_user_id uuid not null references auth.users(id),
  usage_policy text,
  guest_name text,
  invitation_no text,
  is_inside_after boolean,
  occurred_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  constraint access_events_direction_check check (direction in ('ENTRY', 'EXIT')),
  constraint access_events_decision_check check (decision in ('ALLOW', 'DENY')),
  constraint access_events_reason_code_check check (
    reason_code in (
      'VALID_ENTRY',
      'VALID_EXIT',
      'PASS_ALREADY_USED',
      'ALREADY_INSIDE',
      'NOT_INSIDE',
      'EXPIRED',
      'NOT_YET_VALID',
      'REVOKED',
      'INVALID_PASS',
      'PROPERTY_MISMATCH',
      'GATE_INACTIVE',
      'DIRECTION_NOT_ALLOWED',
      'FEATURE_DISABLED',
      'OPERATOR_NOT_AUTHORIZED',
      'ORGANIZATION_INACTIVE'
    )
  ),
  constraint access_events_usage_policy_check check (usage_policy is null or usage_policy in ('SINGLE_USE', 'MULTI_USE')),
  constraint access_events_guest_name_length check (guest_name is null or char_length(guest_name) <= 120),
  constraint access_events_invitation_no_length check (invitation_no is null or char_length(invitation_no) <= 64),
  constraint access_events_allow_reason_check check (
    (decision = 'ALLOW' and reason_code in ('VALID_ENTRY', 'VALID_EXIT'))
    or (decision = 'DENY' and reason_code not in ('VALID_ENTRY', 'VALID_EXIT'))
  ),
  constraint access_events_org_property_fkey
    foreign key (organization_id, property_id)
    references public.properties (organization_id, id)
    on delete cascade,
  constraint access_events_org_gate_fkey
    foreign key (organization_id, gate_id)
    references public.gates (organization_id, id)
    on delete restrict,
  constraint access_events_org_invitation_fkey
    foreign key (organization_id, visitor_invitation_id)
    references public.visitor_invitations (organization_id, id)
    on delete set null,
  constraint access_events_org_property_unit_fkey
    foreign key (organization_id, property_id, unit_id)
    references public.units (organization_id, property_id, id)
    on delete set null
);

create unique index if not exists access_events_org_client_scan_id_key
  on public.access_events (organization_id, client_scan_id);

create index if not exists idx_access_events_org_occurred
  on public.access_events (organization_id, occurred_at desc);

create index if not exists idx_access_events_org_property_gate_occurred
  on public.access_events (organization_id, property_id, gate_id, occurred_at desc);

create index if not exists idx_access_events_invitation_occurred
  on public.access_events (organization_id, visitor_invitation_id, occurred_at desc)
  where visitor_invitation_id is not null;

create or replace function public.gate_operations_enabled(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.visitor_management_enabled(p_organization_id);
$$;

create or replace function public.gate_staff_can_view(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), p_organization_id, 'operations.gates.view')
      or public.has_permission(auth.uid(), p_organization_id, 'operations.gates.manage')
      or public.has_permission(auth.uid(), p_organization_id, 'operations.gates.scan')
      or public.has_permission(auth.uid(), p_organization_id, 'operations.access_events.view');
$$;

create or replace function public.gate_staff_can_manage(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), p_organization_id, 'operations.gates.manage');
$$;

create or replace function public.gate_staff_can_scan(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), p_organization_id, 'operations.gates.scan')
      or public.has_permission(auth.uid(), p_organization_id, 'operations.gates.manage');
$$;

create or replace function public.gate_staff_can_view_access_events(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), p_organization_id, 'operations.access_events.view')
      or public.has_permission(auth.uid(), p_organization_id, 'operations.gates.manage')
      or public.has_permission(auth.uid(), p_organization_id, 'operations.gates.scan');
$$;

create or replace function public.create_gate(
  p_property_id uuid,
  p_code text,
  p_name_ar text,
  p_name_en text,
  p_direction_mode text default 'BOTH'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_property public.properties;
  v_gate_id uuid;
  v_code text := upper(nullif(btrim(p_code), ''));
  v_name_ar text := nullif(btrim(p_name_ar), '');
  v_name_en text := nullif(btrim(p_name_en), '');
  v_direction text := coalesce(nullif(btrim(p_direction_mode), ''), 'BOTH');
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if v_code is null or char_length(v_code) > 40 then
    raise exception 'INVALID_GATE_CODE' using errcode = '22023';
  end if;

  if v_name_ar is null or char_length(v_name_ar) > 120 or v_name_en is null or char_length(v_name_en) > 120 then
    raise exception 'INVALID_GATE_NAME' using errcode = '22023';
  end if;

  if v_direction not in ('ENTRY', 'EXIT', 'BOTH') then
    raise exception 'INVALID_GATE_DIRECTION' using errcode = '22023';
  end if;

  select * into v_property
  from public.properties
  where id = p_property_id;

  if v_property.id is null then
    raise exception 'PROPERTY_NOT_FOUND' using errcode = '22023';
  end if;

  if not public.organization_is_active(v_property.organization_id) then
    raise exception 'ORGANIZATION_INACTIVE' using errcode = '42501';
  end if;

  if not public.gate_operations_enabled(v_property.organization_id) then
    raise exception 'GATE_OPERATIONS_NOT_ENTITLED' using errcode = '42501';
  end if;

  if not public.gate_staff_can_manage(v_property.organization_id) then
    raise exception 'GATE_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  insert into public.gates (
    organization_id,
    property_id,
    code,
    name_ar,
    name_en,
    direction_mode,
    created_by,
    updated_by
  ) values (
    v_property.organization_id,
    v_property.id,
    v_code,
    v_name_ar,
    v_name_en,
    v_direction,
    v_user_id,
    v_user_id
  )
  returning id into v_gate_id;

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
    v_property.organization_id,
    v_property.id,
    'gate.created',
    'gate',
    v_gate_id,
    jsonb_build_object('code', v_code, 'direction_mode', v_direction)
  );

  return v_gate_id;
end;
$$;

create or replace function public.update_gate(
  p_gate_id uuid,
  p_code text,
  p_name_ar text,
  p_name_en text,
  p_direction_mode text,
  p_is_active boolean
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_gate public.gates;
  v_code text := upper(nullif(btrim(p_code), ''));
  v_name_ar text := nullif(btrim(p_name_ar), '');
  v_name_en text := nullif(btrim(p_name_en), '');
  v_direction text := coalesce(nullif(btrim(p_direction_mode), ''), 'BOTH');
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_gate
  from public.gates
  where id = p_gate_id
  for update;

  if v_gate.id is null then
    raise exception 'GATE_NOT_FOUND' using errcode = '22023';
  end if;

  if not public.organization_is_active(v_gate.organization_id) then
    raise exception 'ORGANIZATION_INACTIVE' using errcode = '42501';
  end if;

  if not public.gate_operations_enabled(v_gate.organization_id) then
    raise exception 'GATE_OPERATIONS_NOT_ENTITLED' using errcode = '42501';
  end if;

  if not public.gate_staff_can_manage(v_gate.organization_id) then
    raise exception 'GATE_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if v_code is null or char_length(v_code) > 40 then
    raise exception 'INVALID_GATE_CODE' using errcode = '22023';
  end if;

  if v_name_ar is null or char_length(v_name_ar) > 120 or v_name_en is null or char_length(v_name_en) > 120 then
    raise exception 'INVALID_GATE_NAME' using errcode = '22023';
  end if;

  if v_direction not in ('ENTRY', 'EXIT', 'BOTH') then
    raise exception 'INVALID_GATE_DIRECTION' using errcode = '22023';
  end if;

  update public.gates
  set code = v_code,
      name_ar = v_name_ar,
      name_en = v_name_en,
      direction_mode = v_direction,
      is_active = coalesce(p_is_active, false),
      updated_by = v_user_id
  where id = v_gate.id;

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
    v_gate.organization_id,
    v_gate.property_id,
    case when coalesce(p_is_active, false) then 'gate.updated' else 'gate.deactivated' end,
    'gate',
    v_gate.id,
    jsonb_build_object('code', v_code, 'direction_mode', v_direction, 'is_active', coalesce(p_is_active, false))
  );
end;
$$;

create or replace function public.process_visitor_gate_scan(
  p_gate_id uuid,
  p_invitation_id uuid,
  p_raw_secret text,
  p_direction text,
  p_client_scan_id uuid
) returns table (
  decision text,
  reason_code text,
  event_id uuid,
  guest_name text,
  invitation_no text,
  unit_id uuid,
  invitation_id uuid,
  usage_policy text,
  valid_until timestamptz,
  is_inside boolean,
  gate_id uuid,
  property_id uuid,
  occurred_at timestamptz
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_gate public.gates;
  v_hash text;
  v_invitation public.visitor_invitations;
  v_state public.visitor_access_state;
  v_direction text := upper(nullif(btrim(p_direction), ''));
  v_decision text := 'DENY';
  v_reason text := 'INVALID_PASS';
  v_event_id uuid;
  v_existing public.access_events;
  v_inside_after boolean;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if p_gate_id is null or p_client_scan_id is null or v_direction not in ('ENTRY', 'EXIT') then
    raise exception 'INVALID_GATE_SCAN_INPUT' using errcode = '22023';
  end if;

  select * into v_gate
  from public.gates
  where id = p_gate_id;

  if v_gate.id is null then
    raise exception 'GATE_NOT_FOUND' using errcode = '22023';
  end if;

  if not public.gate_staff_can_scan(v_gate.organization_id) then
    raise exception 'GATE_SCAN_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select * into v_existing
  from public.access_events
  where organization_id = v_gate.organization_id
    and client_scan_id = p_client_scan_id;

  if v_existing.id is not null then
    return query
      select
        v_existing.decision,
        v_existing.reason_code,
        v_existing.id,
        v_existing.guest_name,
        v_existing.invitation_no,
        v_existing.unit_id,
        v_existing.visitor_invitation_id,
        v_existing.usage_policy,
        vi.valid_until,
        v_existing.is_inside_after,
        v_existing.gate_id,
        v_existing.property_id,
        v_existing.occurred_at
      from public.visitor_invitations vi
      where vi.id = v_existing.visitor_invitation_id
      union all
      select
        v_existing.decision,
        v_existing.reason_code,
        v_existing.id,
        v_existing.guest_name,
        v_existing.invitation_no,
        v_existing.unit_id,
        v_existing.visitor_invitation_id,
        v_existing.usage_policy,
        null::timestamptz,
        v_existing.is_inside_after,
        v_existing.gate_id,
        v_existing.property_id,
        v_existing.occurred_at
      where v_existing.visitor_invitation_id is null
      limit 1;
    return;
  end if;

  if not public.organization_is_active(v_gate.organization_id) then
    v_reason := 'ORGANIZATION_INACTIVE';
  elsif not public.gate_operations_enabled(v_gate.organization_id) then
    v_reason := 'FEATURE_DISABLED';
  elsif not v_gate.is_active then
    v_reason := 'GATE_INACTIVE';
  elsif v_gate.direction_mode <> 'BOTH' and v_gate.direction_mode <> v_direction then
    v_reason := 'DIRECTION_NOT_ALLOWED';
  elsif p_invitation_id is null or nullif(p_raw_secret, '') is null then
    v_reason := 'INVALID_PASS';
  else
    v_hash := encode(digest(p_raw_secret, 'sha256'), 'hex');

    select vi.* into v_invitation
    from public.visitor_invitations vi
    join public.visitor_invitation_secrets vis
      on vis.organization_id = vi.organization_id
     and vis.invitation_id = vi.id
    where vi.id = p_invitation_id
      and vis.token_hash = v_hash
    for update of vi;

    if v_invitation.id is null then
      v_reason := 'INVALID_PASS';
    elsif v_invitation.organization_id <> v_gate.organization_id then
      v_reason := 'INVALID_PASS';
    elsif v_invitation.property_id <> v_gate.property_id then
      v_reason := 'PROPERTY_MISMATCH';
    elsif v_invitation.status = 'REVOKED' then
      v_reason := 'REVOKED';
    elsif now() < v_invitation.valid_from then
      v_reason := 'NOT_YET_VALID';
    elsif now() >= v_invitation.valid_until then
      v_reason := 'EXPIRED';
    else
      insert into public.visitor_access_state (
        visitor_invitation_id,
        organization_id,
        property_id,
        unit_id
      ) values (
        v_invitation.id,
        v_invitation.organization_id,
        v_invitation.property_id,
        v_invitation.unit_id
      )
      on conflict (visitor_invitation_id) do nothing;

      select * into v_state
      from public.visitor_access_state
      where visitor_invitation_id = v_invitation.id
      for update;

      if v_direction = 'ENTRY' then
        if v_invitation.usage_policy = 'SINGLE_USE' and v_state.entry_count > 0 then
          v_reason := 'PASS_ALREADY_USED';
          v_inside_after := v_state.is_inside;
        elsif v_state.is_inside then
          v_reason := 'ALREADY_INSIDE';
          v_inside_after := true;
        else
          v_decision := 'ALLOW';
          v_reason := 'VALID_ENTRY';
          update public.visitor_access_state
          set is_inside = true,
              entry_count = entry_count + 1,
              last_entry_at = now(),
              last_gate_id = v_gate.id,
              updated_at = now()
          where visitor_invitation_id = v_invitation.id
          returning * into v_state;
          v_inside_after := true;
        end if;
      else
        if not v_state.is_inside then
          v_reason := 'NOT_INSIDE';
          v_inside_after := false;
        else
          v_decision := 'ALLOW';
          v_reason := 'VALID_EXIT';
          update public.visitor_access_state
          set is_inside = false,
              exit_count = exit_count + 1,
              last_exit_at = now(),
              last_gate_id = v_gate.id,
              updated_at = now()
          where visitor_invitation_id = v_invitation.id
          returning * into v_state;
          v_inside_after := false;
        end if;
      end if;
    end if;
  end if;

  if v_invitation.id is null then
    v_inside_after := null;
  elsif v_inside_after is null then
    v_inside_after := coalesce(v_state.is_inside, false);
  end if;

  insert into public.access_events (
    organization_id,
    property_id,
    gate_id,
    visitor_invitation_id,
    unit_id,
    direction,
    decision,
    reason_code,
    client_scan_id,
    operator_user_id,
    usage_policy,
    guest_name,
    invitation_no,
    is_inside_after
  ) values (
    v_gate.organization_id,
    v_gate.property_id,
    v_gate.id,
    v_invitation.id,
    case when v_invitation.property_id = v_gate.property_id then v_invitation.unit_id else null end,
    v_direction,
    v_decision,
    v_reason,
    p_client_scan_id,
    v_user_id,
    v_invitation.usage_policy,
    v_invitation.guest_name,
    v_invitation.invitation_no,
    v_inside_after
  )
  on conflict (organization_id, client_scan_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select * into v_existing
    from public.access_events
    where organization_id = v_gate.organization_id
      and client_scan_id = p_client_scan_id;

    return query
      select
        v_existing.decision,
        v_existing.reason_code,
        v_existing.id,
        v_existing.guest_name,
        v_existing.invitation_no,
        v_existing.unit_id,
        v_existing.visitor_invitation_id,
        v_existing.usage_policy,
        vi.valid_until,
        v_existing.is_inside_after,
        v_existing.gate_id,
        v_existing.property_id,
        v_existing.occurred_at
      from public.visitor_invitations vi
      where vi.id = v_existing.visitor_invitation_id
      union all
      select
        v_existing.decision,
        v_existing.reason_code,
        v_existing.id,
        v_existing.guest_name,
        v_existing.invitation_no,
        v_existing.unit_id,
        v_existing.visitor_invitation_id,
        v_existing.usage_policy,
        null::timestamptz,
        v_existing.is_inside_after,
        v_existing.gate_id,
        v_existing.property_id,
        v_existing.occurred_at
      where v_existing.visitor_invitation_id is null
      limit 1;
    return;
  end if;

  if v_decision = 'ALLOW' then
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
      v_gate.organization_id,
      v_gate.property_id,
      case when v_direction = 'ENTRY' then 'visitor_gate.entry_allowed' else 'visitor_gate.exit_allowed' end,
      'access_event',
      v_event_id,
      jsonb_build_object(
        'gate_id', v_gate.id,
        'direction', v_direction,
        'reason_code', v_reason,
        'visitor_invitation_id', v_invitation.id,
        'unit_id', v_invitation.unit_id
      )
    );
  end if;

  return query
    select
      v_decision,
      v_reason,
      e.id,
      e.guest_name,
      e.invitation_no,
      e.unit_id,
      e.visitor_invitation_id,
      e.usage_policy,
      v_invitation.valid_until,
      e.is_inside_after,
      e.gate_id,
      e.property_id,
      e.occurred_at
    from public.access_events e
    where e.id = v_event_id;
end;
$$;

alter table public.gates enable row level security;
alter table public.visitor_access_state enable row level security;
alter table public.access_events enable row level security;

create policy gates_select_authorized_staff
  on public.gates
  for select
  to authenticated
  using (
    public.organization_is_active(organization_id)
    and public.gate_operations_enabled(organization_id)
    and public.gate_staff_can_view(organization_id)
  );

create policy visitor_access_state_select_staff_or_member
  on public.visitor_access_state
  for select
  to authenticated
  using (
    public.organization_is_active(organization_id)
    and public.gate_operations_enabled(organization_id)
    and (
      public.gate_staff_can_view_access_events(organization_id)
      or exists (
        select 1
        from public.visitor_invitations vi
        where vi.id = visitor_access_state.visitor_invitation_id
          and vi.organization_id = visitor_access_state.organization_id
          and public.visitor_invitation_member_can_read(vi)
      )
    )
  );

create policy access_events_select_authorized_staff
  on public.access_events
  for select
  to authenticated
  using (
    public.organization_is_active(organization_id)
    and public.gate_operations_enabled(organization_id)
    and public.gate_staff_can_view_access_events(organization_id)
  );

insert into public.permissions (id, key, description)
values
  ('1175b2dd-8600-4e67-a48a-9035be050fc9', 'operations.gates.view', 'View organization-scoped gates'),
  ('76c0ad3e-2255-4c80-9d7f-d3a64e9676f0', 'operations.gates.manage', 'Create and manage organization-scoped gates'),
  ('d98f27a8-9493-4670-bd8c-5b1beac0d215', 'operations.gates.scan', 'Process visitor pass scans at authorized gates'),
  ('d0119f2a-7219-4d99-a75b-e0e6957aee87', 'operations.access_events.view', 'View organization-scoped gate access events')
on conflict (key) do nothing;

insert into public.role_template_permissions (role_template_key, permission_key)
values
  ('TENANT_OWNER', 'operations.gates.view'),
  ('TENANT_OWNER', 'operations.gates.manage'),
  ('TENANT_OWNER', 'operations.gates.scan'),
  ('TENANT_OWNER', 'operations.access_events.view'),
  ('TENANT_ADMIN', 'operations.gates.view'),
  ('TENANT_ADMIN', 'operations.gates.manage'),
  ('TENANT_ADMIN', 'operations.gates.scan'),
  ('TENANT_ADMIN', 'operations.access_events.view'),
  ('GENERAL_MANAGER', 'operations.gates.view'),
  ('GENERAL_MANAGER', 'operations.gates.manage'),
  ('GENERAL_MANAGER', 'operations.gates.scan'),
  ('GENERAL_MANAGER', 'operations.access_events.view'),
  ('PROPERTY_MANAGER', 'operations.gates.view'),
  ('PROPERTY_MANAGER', 'operations.gates.manage'),
  ('PROPERTY_MANAGER', 'operations.gates.scan'),
  ('PROPERTY_MANAGER', 'operations.access_events.view'),
  ('VIEWER', 'operations.gates.view'),
  ('VIEWER', 'operations.access_events.view')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'operations.gates.view',
  'operations.gates.manage',
  'operations.gates.scan',
  'operations.access_events.view'
)
where r.key in ('TENANT_OWNER', 'TENANT_ADMIN', 'GENERAL_MANAGER', 'PROPERTY_MANAGER')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('operations.gates.view', 'operations.access_events.view')
where r.key = 'VIEWER'
on conflict do nothing;

revoke all privileges on table public.gates from public, anon, authenticated;
revoke all privileges on table public.visitor_access_state from public, anon, authenticated;
revoke all privileges on table public.access_events from public, anon, authenticated;
grant select on table public.gates to authenticated;
grant select on table public.visitor_access_state to authenticated;
grant select on table public.access_events to authenticated;
grant all privileges on table public.gates to service_role;
grant all privileges on table public.visitor_access_state to service_role;
grant all privileges on table public.access_events to service_role;

revoke all on function public.gate_operations_enabled(uuid) from public, anon, authenticated, service_role;
revoke all on function public.gate_staff_can_view(uuid) from public, anon, authenticated, service_role;
revoke all on function public.gate_staff_can_manage(uuid) from public, anon, authenticated, service_role;
revoke all on function public.gate_staff_can_scan(uuid) from public, anon, authenticated, service_role;
revoke all on function public.gate_staff_can_view_access_events(uuid) from public, anon, authenticated, service_role;
revoke all on function public.create_gate(uuid, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.update_gate(uuid, text, text, text, text, boolean) from public, anon, authenticated, service_role;
revoke all on function public.process_visitor_gate_scan(uuid, uuid, text, text, uuid) from public, anon, authenticated, service_role;

grant execute on function public.gate_operations_enabled(uuid) to authenticated, service_role;
grant execute on function public.gate_staff_can_view(uuid) to authenticated, service_role;
grant execute on function public.gate_staff_can_manage(uuid) to authenticated, service_role;
grant execute on function public.gate_staff_can_scan(uuid) to authenticated, service_role;
grant execute on function public.gate_staff_can_view_access_events(uuid) to authenticated, service_role;
grant execute on function public.create_gate(uuid, text, text, text, text) to authenticated;
grant execute on function public.update_gate(uuid, text, text, text, text, boolean) to authenticated;
grant execute on function public.process_visitor_gate_scan(uuid, uuid, text, text, uuid) to authenticated;
