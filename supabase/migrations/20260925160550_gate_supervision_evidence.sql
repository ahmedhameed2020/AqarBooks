-- Supervision is evidence, never a replacement for an original scan decision.
create table public.gate_manual_exceptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  gate_id uuid not null,
  property_id uuid not null,
  visitor_invitation_id uuid,
  device_id uuid references public.gate_devices(id),
  source_event_id uuid references public.access_events(id),
  record_type text not null check (record_type in ('REQUEST', 'APPROVAL')),
  parent_exception_id uuid unique references public.gate_manual_exceptions(id),
  direction text not null check (direction in ('ENTRY', 'EXIT')),
  outcome text not null check (outcome in ('ENTERED', 'EXITED', 'DENIED')),
  category text not null check (category in ('POLICY_EXCEPTION', 'EMERGENCY', 'CONNECTIVITY_FAILURE', 'MISSED_SCAN', 'OTHER')),
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  actor_user_id uuid not null references auth.users(id),
  occurred_at timestamptz not null default clock_timestamp(),
  foreign key (organization_id, gate_id) references public.gates(organization_id, id),
  foreign key (organization_id, property_id) references public.properties(organization_id, id),
  foreign key (organization_id, visitor_invitation_id) references public.visitor_invitations(organization_id, id),
  check ((record_type = 'REQUEST' and parent_exception_id is null) or (record_type = 'APPROVAL' and parent_exception_id is not null)),
  check (outcome = 'DENIED' or (outcome = 'ENTERED' and direction = 'ENTRY') or (outcome = 'EXITED' and direction = 'EXIT'))
);
create index gate_manual_exceptions_org_occurred on public.gate_manual_exceptions(organization_id, occurred_at desc);
create index gate_manual_exceptions_invitation on public.gate_manual_exceptions(visitor_invitation_id);
create index gate_manual_exceptions_device on public.gate_manual_exceptions(device_id);
create index gate_manual_exceptions_source on public.gate_manual_exceptions(source_event_id);

create table public.gate_access_reconciliations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  gate_id uuid not null,
  visitor_invitation_id uuid not null,
  category text not null check (category in ('MISSED_SCAN', 'STATE_CORRECTION', 'OTHER')),
  reason text not null check (char_length(btrim(reason)) between 1 and 500),
  actor_user_id uuid not null references auth.users(id),
  before_is_inside boolean not null,
  after_is_inside boolean not null,
  before_entry_count integer not null,
  before_exit_count integer not null,
  after_entry_count integer not null,
  after_exit_count integer not null,
  occurred_at timestamptz not null,
  foreign key (organization_id, gate_id) references public.gates(organization_id, id),
  foreign key (organization_id, visitor_invitation_id) references public.visitor_invitations(organization_id, id),
  check (before_is_inside <> after_is_inside),
  check (before_entry_count >= before_exit_count and before_exit_count >= 0),
  check (after_entry_count >= after_exit_count and after_exit_count >= 0),
  check (before_is_inside = (before_entry_count > before_exit_count)),
  check (after_is_inside = (after_entry_count > after_exit_count))
);
create index gate_access_reconciliations_org_occurred on public.gate_access_reconciliations(organization_id, occurred_at desc);
create index gate_access_reconciliations_invitation on public.gate_access_reconciliations(visitor_invitation_id);

create function public.gate_supervision_append_only() returns trigger
language plpgsql set search_path = '' as $$
begin
  raise exception 'GATE_SUPERVISION_APPEND_ONLY' using errcode = '55000';
end;
$$;
create trigger gate_manual_exceptions_immutable before update or delete on public.gate_manual_exceptions
for each row execute function public.gate_supervision_append_only();
create trigger gate_access_reconciliations_immutable before update or delete on public.gate_access_reconciliations
for each row execute function public.gate_supervision_append_only();

-- A private helper unifies tenant, feature and permission checks for all writers.
create function public.gate_supervision_context(p_gate_id uuid, p_permission text)
returns public.gates language plpgsql security definer set search_path = '' as $$
declare v_gate public.gates;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  select * into v_gate from public.gates where id = p_gate_id;
  if v_gate.id is null
    or not public.organization_is_active(v_gate.organization_id)
    or not public.gate_operations_enabled(v_gate.organization_id)
    or not public.has_permission(auth.uid(), v_gate.organization_id, p_permission) then
    raise exception 'GATE_SUPERVISION_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  return v_gate;
end;
$$;

create function public.create_gate_manual_exception(
  p_gate_id uuid, p_invitation_id uuid, p_direction text, p_outcome text,
  p_category text, p_reason text, p_source_event_id uuid default null, p_device_id uuid default null
) returns uuid language plpgsql security definer set search_path = '' as $$
declare v_gate public.gates; v_id uuid;
begin
  v_gate := public.gate_supervision_context(p_gate_id, 'operations.gates.exceptions.create');
  if p_direction is null or p_direction not in ('ENTRY', 'EXIT')
    or p_outcome is null or p_outcome not in ('ENTERED', 'EXITED', 'DENIED')
    or (p_outcome = 'ENTERED' and p_direction <> 'ENTRY') or (p_outcome = 'EXITED' and p_direction <> 'EXIT')
    or p_category is null or p_category not in ('POLICY_EXCEPTION', 'EMERGENCY', 'CONNECTIVITY_FAILURE', 'MISSED_SCAN', 'OTHER')
    or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'INVALID_MANUAL_EXCEPTION' using errcode = '22023';
  end if;
  -- Unknown visitors have no invitation; tenant/property always come from the
  -- permission-checked gate, never from caller-supplied ownership fields.
  if (p_invitation_id is not null and not exists(select 1 from public.visitor_invitations where id=p_invitation_id and organization_id=v_gate.organization_id and property_id=v_gate.property_id))
    or (p_device_id is not null and not exists(select 1 from public.gate_devices where id=p_device_id and organization_id=v_gate.organization_id and gate_id=v_gate.id))
    or (p_source_event_id is not null and not exists(select 1 from public.access_events where id=p_source_event_id and organization_id=v_gate.organization_id and property_id=v_gate.property_id and gate_id=v_gate.id and visitor_invitation_id is not distinct from p_invitation_id and direction=p_direction)) then
    raise exception 'GATE_SUPERVISION_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  insert into public.gate_manual_exceptions(organization_id,gate_id,property_id,visitor_invitation_id,device_id,source_event_id,record_type,direction,outcome,category,reason,actor_user_id)
  values(v_gate.organization_id,v_gate.id,v_gate.property_id,p_invitation_id,p_device_id,p_source_event_id,'REQUEST',p_direction,p_outcome,p_category,btrim(p_reason),auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

create function public.approve_gate_manual_exception(p_exception_id uuid, p_reason text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare v_request public.gate_manual_exceptions; v_gate public.gates; v_id uuid;
begin
  if auth.uid() is null then raise exception 'NOT_AUTHENTICATED' using errcode = '42501'; end if;
  select * into v_request from public.gate_manual_exceptions where id=p_exception_id and record_type='REQUEST';
  v_gate := public.gate_supervision_context(v_request.gate_id, 'operations.gates.exceptions.approve');
  if p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'INVALID_APPROVAL_REASON' using errcode = '22023';
  end if;
  if v_request.actor_user_id = auth.uid() then raise exception 'MANUAL_EXCEPTION_SELF_APPROVAL' using errcode = '42501'; end if;
  -- Serialize approval attempts without changing the immutable request.
  perform 1 from public.gate_manual_exceptions where id=p_exception_id for update;
  if exists(select 1 from public.gate_manual_exceptions where parent_exception_id=p_exception_id) then
    raise exception 'MANUAL_EXCEPTION_ALREADY_APPROVED' using errcode = '22023';
  end if;
  insert into public.gate_manual_exceptions(organization_id,gate_id,property_id,visitor_invitation_id,device_id,source_event_id,record_type,parent_exception_id,direction,outcome,category,reason,actor_user_id)
  values(v_request.organization_id,v_request.gate_id,v_request.property_id,v_request.visitor_invitation_id,v_request.device_id,v_request.source_event_id,'APPROVAL',v_request.id,v_request.direction,v_request.outcome,v_request.category,btrim(p_reason),auth.uid()) returning id into v_id;
  return v_id;
end;
$$;

alter table public.access_events add column reconciliation_id uuid unique references public.gate_access_reconciliations(id);
alter table public.access_events drop constraint access_events_decision_check;
alter table public.access_events drop constraint access_events_reason_code_check;
alter table public.access_events drop constraint access_events_allow_reason_check;
alter table public.access_events add constraint access_events_decision_check check (decision in ('ALLOW','DENY','RECONCILE'));
alter table public.access_events add constraint access_events_reason_code_check check (reason_code in (
  'VALID_ENTRY','VALID_EXIT','PASS_ALREADY_USED','ALREADY_INSIDE','NOT_INSIDE','EXPIRED','NOT_YET_VALID','REVOKED','INVALID_PASS',
  'PROPERTY_MISMATCH','GATE_INACTIVE','DIRECTION_NOT_ALLOWED','FEATURE_DISABLED','OPERATOR_NOT_AUTHORIZED','ORGANIZATION_INACTIVE','RECONCILED_ENTRY','RECONCILED_EXIT'));
alter table public.access_events add constraint access_events_allow_reason_check check (
  (decision='ALLOW' and reason_code in ('VALID_ENTRY','VALID_EXIT') and reconciliation_id is null)
  or (decision='DENY' and reason_code not in ('VALID_ENTRY','VALID_EXIT','RECONCILED_ENTRY','RECONCILED_EXIT') and reconciliation_id is null)
  or (decision='RECONCILE' and reconciliation_id is not null and ((direction='ENTRY' and reason_code='RECONCILED_ENTRY' and is_inside_after=true) or (direction='EXIT' and reason_code='RECONCILED_EXIT' and is_inside_after=false)))) ;

create function public.reconcile_visitor_access_state(
  p_gate_id uuid, p_invitation_id uuid, p_is_inside boolean, p_category text, p_reason text
) returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_gate public.gates; v_invitation public.visitor_invitations; v_state public.visitor_access_state;
  v_id uuid; v_at timestamptz; v_entry integer; v_exit integer;
begin
  v_gate := public.gate_supervision_context(p_gate_id, 'operations.gates.occupancy.reconcile');
  if p_invitation_id is null or p_is_inside is null or p_category is null or p_category not in ('MISSED_SCAN','STATE_CORRECTION','OTHER')
    or p_reason is null or char_length(btrim(p_reason)) not between 1 and 500 then
    raise exception 'INVALID_RECONCILIATION' using errcode = '22023';
  end if;
  -- All scan/reconcile writers lock invitation, then state. Never invert this order.
  select * into v_invitation from public.visitor_invitations
  where id=p_invitation_id and organization_id=v_gate.organization_id and property_id=v_gate.property_id for update;
  if v_invitation.id is null then raise exception 'GATE_SUPERVISION_NOT_AUTHORIZED' using errcode = '42501'; end if;
  insert into public.visitor_access_state(visitor_invitation_id,organization_id,property_id,unit_id)
  values(v_invitation.id,v_invitation.organization_id,v_invitation.property_id,v_invitation.unit_id)
  on conflict (visitor_invitation_id) do nothing;
  select * into v_state from public.visitor_access_state where visitor_invitation_id=v_invitation.id for update;
  if v_state.is_inside=p_is_inside then raise exception 'RECONCILIATION_STATE_UNCHANGED' using errcode = '22023'; end if;
  v_at := clock_timestamp();
  v_entry := v_state.entry_count + case when p_is_inside then 1 else 0 end;
  v_exit := case when p_is_inside then v_state.exit_count else v_state.entry_count end;
  insert into public.gate_access_reconciliations(organization_id,gate_id,visitor_invitation_id,category,reason,actor_user_id,before_is_inside,after_is_inside,before_entry_count,before_exit_count,after_entry_count,after_exit_count,occurred_at)
  values(v_gate.organization_id,v_gate.id,v_invitation.id,p_category,btrim(p_reason),auth.uid(),v_state.is_inside,p_is_inside,v_state.entry_count,v_state.exit_count,v_entry,v_exit,v_at) returning id into v_id;
  insert into public.access_events(organization_id,property_id,gate_id,visitor_invitation_id,unit_id,direction,decision,reason_code,client_scan_id,operator_user_id,usage_policy,guest_name,invitation_no,is_inside_after,occurred_at,reconciliation_id)
  values(v_gate.organization_id,v_gate.property_id,v_gate.id,v_invitation.id,v_invitation.unit_id,case when p_is_inside then 'ENTRY' else 'EXIT' end,'RECONCILE',case when p_is_inside then 'RECONCILED_ENTRY' else 'RECONCILED_EXIT' end,gen_random_uuid(),auth.uid(),v_invitation.usage_policy,v_invitation.guest_name,v_invitation.invitation_no,p_is_inside,v_at,v_id);
  update public.visitor_access_state set is_inside=p_is_inside,entry_count=v_entry,exit_count=v_exit,
    last_entry_at=case when p_is_inside then v_at else last_entry_at end,
    last_exit_at=case when p_is_inside then last_exit_at else v_at end,
    last_gate_id=v_gate.id,updated_at=v_at where visitor_invitation_id=v_invitation.id;
  return v_id;
end;
$$;

-- Safe evidence projections deliberately bypass the narrower invitation/profile
-- RLS only after re-proving the caller's exact tenant evidence permission. They
-- expose no phone, QR, token, device credential, or authentication columns.
create function public.list_gate_current_visitors(
  p_organization_id uuid,
  p_property_id uuid default null,
  p_gate_id uuid default null,
  p_query text default null,
  p_offset integer default 0,
  p_limit integer default 50
) returns table (
  invitation_id uuid, invitation_no text, guest_name text,
  property_id uuid, property_name text, unit_id uuid, unit_code text,
  gate_id uuid, gate_code text, gate_name_ar text, gate_name_en text,
  entered_at timestamptz, valid_until timestamptz,
  entry_count integer, exit_count integer, total_count bigint,
  count_only boolean
) language plpgsql stable security definer set search_path = '' as $$
declare v_total bigint;
begin
  if auth.uid() is null or p_organization_id is null
    or not public.organization_is_active(p_organization_id)
    or not public.gate_operations_enabled(p_organization_id)
    or not public.has_permission(auth.uid(),p_organization_id,'operations.access_events.view') then
    raise exception 'GATE_EVIDENCE_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_offset is null or p_offset < 0
    or p_limit is null or p_limit < 1 or p_limit > 100
    or (p_query is not null and char_length(p_query) > 120) then
    raise exception 'INVALID_GATE_EVIDENCE_FILTERS' using errcode = '22023';
  end if;

  select count(*)::bigint into v_total
  from public.visitor_access_state s
  join public.visitor_invitations i
    on i.id=s.visitor_invitation_id and i.organization_id=s.organization_id
  join public.properties p
    on p.id=s.property_id and p.organization_id=s.organization_id
  join public.units u
    on u.id=s.unit_id and u.organization_id=s.organization_id
  left join public.gates g
    on g.id=s.last_gate_id and g.organization_id=s.organization_id
  where s.organization_id=p_organization_id
    and s.is_inside=true
    and (p_property_id is null or s.property_id=p_property_id)
    and (p_gate_id is null or s.last_gate_id=p_gate_id)
    and (p_query is null or btrim(p_query)='' or i.guest_name ilike '%'||btrim(p_query)||'%' or i.invitation_no ilike '%'||btrim(p_query)||'%');

  return query
  select
    s.visitor_invitation_id, i.invitation_no, i.guest_name,
    s.property_id, p.name, s.unit_id, u.code,
    s.last_gate_id, g.code, g.name_ar, g.name_en,
    s.last_entry_at, i.valid_until, s.entry_count, s.exit_count,
    v_total, false
  from public.visitor_access_state s
  join public.visitor_invitations i
    on i.id=s.visitor_invitation_id and i.organization_id=s.organization_id
  join public.properties p
    on p.id=s.property_id and p.organization_id=s.organization_id
  join public.units u
    on u.id=s.unit_id and u.organization_id=s.organization_id
  left join public.gates g
    on g.id=s.last_gate_id and g.organization_id=s.organization_id
  where s.organization_id=p_organization_id
    and s.is_inside=true
    and (p_property_id is null or s.property_id=p_property_id)
    and (p_gate_id is null or s.last_gate_id=p_gate_id)
    and (p_query is null or btrim(p_query)='' or i.guest_name ilike '%'||btrim(p_query)||'%' or i.invitation_no ilike '%'||btrim(p_query)||'%')
  order by s.last_entry_at asc nulls last, s.visitor_invitation_id asc
  offset p_offset limit p_limit;

  if not found and v_total > 0 then
    return query select
      null::uuid, null::text, null::text,
      null::uuid, null::text, null::uuid, null::text,
      null::uuid, null::text, null::text, null::text,
      null::timestamptz, null::timestamptz,
      null::integer, null::integer, v_total, true;
  end if;
end;
$$;

create function public.list_gate_access_evidence(
  p_organization_id uuid,
  p_property_id uuid default null,
  p_gate_id uuid default null,
  p_decision text default null,
  p_reason text default null,
  p_direction text default null,
  p_invitation text default null,
  p_guest text default null,
  p_operator text default null,
  p_from timestamptz default null,
  p_to timestamptz default null,
  p_offset integer default 0,
  p_limit integer default 50,
  p_cursor_occurred_at timestamptz default null,
  p_cursor_id uuid default null,
  p_upper_occurred_at timestamptz default null,
  p_upper_id uuid default null
) returns table (
  id uuid, property_id uuid, property_name text,
  gate_id uuid, gate_code text, gate_name_ar text, gate_name_en text,
  visitor_invitation_id uuid, invitation_no text, guest_name text,
  unit_id uuid, unit_code text,
  direction text, decision text, reconciliation_id uuid, reason_code text,
  operator_user_id uuid, operator_name text,
  is_inside_after boolean, occurred_at timestamptz, total_count bigint,
  count_only boolean
) language plpgsql stable security definer set search_path = '' as $$
declare v_total bigint;
begin
  if auth.uid() is null or p_organization_id is null
    or not public.organization_is_active(p_organization_id)
    or not public.gate_operations_enabled(p_organization_id)
    or not public.has_permission(auth.uid(),p_organization_id,'operations.access_events.view') then
    raise exception 'GATE_EVIDENCE_NOT_AUTHORIZED' using errcode = '42501';
  end if;
  if p_offset is null or p_offset < 0
    or p_limit is null or p_limit < 1 or p_limit > 1000
    or (p_decision is not null and p_decision not in ('ALLOW','DENY','RECONCILE'))
    or (p_direction is not null and p_direction not in ('ENTRY','EXIT'))
    or (p_reason is not null and char_length(p_reason) > 80)
    or (p_invitation is not null and char_length(p_invitation) > 80)
    or (p_guest is not null and char_length(p_guest) > 120)
    or (p_operator is not null and char_length(p_operator) > 120)
    or (p_from is not null and p_to is not null and p_from > p_to)
    or ((p_cursor_occurred_at is null) <> (p_cursor_id is null))
    or ((p_upper_occurred_at is null) <> (p_upper_id is null)) then
    raise exception 'INVALID_GATE_EVIDENCE_FILTERS' using errcode = '22023';
  end if;

  select count(*)::bigint into v_total
  from public.access_events e
  join public.properties p
    on p.id=e.property_id and p.organization_id=e.organization_id
  join public.gates g
    on g.id=e.gate_id and g.organization_id=e.organization_id
  left join public.units u
    on u.id=e.unit_id and u.organization_id=e.organization_id
  left join public.profiles pr on pr.id=e.operator_user_id
  where e.organization_id=p_organization_id
    and (p_property_id is null or e.property_id=p_property_id)
    and (p_gate_id is null or e.gate_id=p_gate_id)
    and (p_decision is null or e.decision=p_decision)
    and (p_reason is null or btrim(p_reason)='' or e.reason_code ilike '%'||btrim(p_reason)||'%')
    and (p_direction is null or e.direction=p_direction)
    and (p_invitation is null or btrim(p_invitation)='' or e.invitation_no ilike '%'||btrim(p_invitation)||'%')
    and (p_guest is null or btrim(p_guest)='' or e.guest_name ilike '%'||btrim(p_guest)||'%')
    and (p_operator is null or btrim(p_operator)='' or coalesce(pr.full_name,e.operator_user_id::text) ilike '%'||btrim(p_operator)||'%')
    and (p_from is null or e.occurred_at>=p_from)
    and (p_to is null or e.occurred_at<=p_to)
    and (p_upper_occurred_at is null or e.occurred_at<p_upper_occurred_at or (e.occurred_at=p_upper_occurred_at and e.id<=p_upper_id))
    and (p_cursor_occurred_at is null or e.occurred_at<p_cursor_occurred_at or (e.occurred_at=p_cursor_occurred_at and e.id<p_cursor_id));

  return query
  select
    e.id, e.property_id, p.name,
    e.gate_id, g.code, g.name_ar, g.name_en,
    e.visitor_invitation_id, e.invitation_no, e.guest_name,
    e.unit_id, u.code,
    e.direction, e.decision, e.reconciliation_id, e.reason_code,
    e.operator_user_id, coalesce(pr.full_name,e.operator_user_id::text),
    e.is_inside_after, e.occurred_at, v_total, false
  from public.access_events e
  join public.properties p
    on p.id=e.property_id and p.organization_id=e.organization_id
  join public.gates g
    on g.id=e.gate_id and g.organization_id=e.organization_id
  left join public.units u
    on u.id=e.unit_id and u.organization_id=e.organization_id
  left join public.profiles pr on pr.id=e.operator_user_id
  where e.organization_id=p_organization_id
    and (p_property_id is null or e.property_id=p_property_id)
    and (p_gate_id is null or e.gate_id=p_gate_id)
    and (p_decision is null or e.decision=p_decision)
    and (p_reason is null or btrim(p_reason)='' or e.reason_code ilike '%'||btrim(p_reason)||'%')
    and (p_direction is null or e.direction=p_direction)
    and (p_invitation is null or btrim(p_invitation)='' or e.invitation_no ilike '%'||btrim(p_invitation)||'%')
    and (p_guest is null or btrim(p_guest)='' or e.guest_name ilike '%'||btrim(p_guest)||'%')
    and (p_operator is null or btrim(p_operator)='' or coalesce(pr.full_name,e.operator_user_id::text) ilike '%'||btrim(p_operator)||'%')
    and (p_from is null or e.occurred_at>=p_from)
    and (p_to is null or e.occurred_at<=p_to)
    and (p_upper_occurred_at is null or e.occurred_at<p_upper_occurred_at or (e.occurred_at=p_upper_occurred_at and e.id<=p_upper_id))
    and (p_cursor_occurred_at is null or e.occurred_at<p_cursor_occurred_at or (e.occurred_at=p_cursor_occurred_at and e.id<p_cursor_id))
  order by e.occurred_at desc, e.id desc
  offset p_offset limit p_limit;

  if not found and v_total > 0 then
    return query select
      null::uuid, null::uuid, null::text,
      null::uuid, null::text, null::text, null::text,
      null::uuid, null::text, null::text,
      null::uuid, null::text,
      null::text, null::text, null::uuid, null::text,
      null::uuid, null::text,
      null::boolean, null::timestamptz, v_total, true;
  end if;
end;
$$;

-- A waiting scan must timestamp its evidence after acquiring the invitation lock,
-- rather than inheriting the transaction's earlier start time and reversing history.
alter table public.access_events alter column occurred_at set default clock_timestamp();
do $$
declare v_definition text;
begin
  v_definition := pg_get_functiondef('public.process_visitor_gate_scan(uuid,uuid,text,text,uuid)'::regprocedure);
  execute replace(v_definition, 'now()', 'clock_timestamp()');
end;
$$;

insert into public.permissions(key,description) values
  ('operations.gates.exceptions.create','Record gate manual exception evidence'),
  ('operations.gates.exceptions.approve','Approve gate manual exception evidence'),
  ('operations.gates.occupancy.reconcile','Reconcile visitor occupancy with immutable evidence') on conflict (key) do nothing;
insert into public.role_template_permissions(role_template_key,permission_key)
select r,p from unnest(array['TENANT_OWNER','TENANT_ADMIN','GENERAL_MANAGER','PROPERTY_MANAGER']) r
cross join unnest(array['operations.gates.exceptions.create','operations.gates.exceptions.approve','operations.gates.occupancy.reconcile']) p on conflict do nothing;
insert into public.role_permissions(role_id,permission_id)
select r.id,p.id from public.roles r cross join public.permissions p
where r.key in ('TENANT_OWNER','TENANT_ADMIN','GENERAL_MANAGER','PROPERTY_MANAGER')
and p.key in ('operations.gates.exceptions.create','operations.gates.exceptions.approve','operations.gates.occupancy.reconcile') on conflict do nothing;

alter table public.gate_manual_exceptions enable row level security;
alter table public.gate_access_reconciliations enable row level security;
create policy gate_manual_exceptions_read on public.gate_manual_exceptions for select to authenticated using (
  public.organization_is_active(organization_id) and public.gate_operations_enabled(organization_id) and (
    public.has_permission(auth.uid(),organization_id,'operations.gates.exceptions.create') or
    public.has_permission(auth.uid(),organization_id,'operations.gates.exceptions.approve') or
    public.has_permission(auth.uid(),organization_id,'operations.access_events.view')));
create policy gate_access_reconciliations_read on public.gate_access_reconciliations for select to authenticated using (
  public.organization_is_active(organization_id) and public.gate_operations_enabled(organization_id) and (
    public.has_permission(auth.uid(),organization_id,'operations.gates.occupancy.reconcile') or
    public.has_permission(auth.uid(),organization_id,'operations.access_events.view')));

create view public.gate_manual_exception_details with (security_invoker=true) as
select r.id,r.organization_id,r.gate_id,r.property_id,r.visitor_invitation_id,r.device_id,r.source_event_id,r.direction,r.outcome,r.category,r.reason,
  r.actor_user_id as operator_user_id,r.occurred_at as occurred_at,
  a.id as approval_id,a.actor_user_id as supervisor_user_id,a.reason as approval_reason,a.occurred_at as approved_at,
  case when a.id is null then 'PENDING' else 'APPROVED' end as status
from public.gate_manual_exceptions r left join public.gate_manual_exceptions a on a.parent_exception_id=r.id
where r.record_type='REQUEST';

revoke all on public.gate_manual_exceptions,public.gate_access_reconciliations,public.gate_manual_exception_details from public,anon,authenticated,service_role;
grant select on public.gate_manual_exceptions,public.gate_access_reconciliations,public.gate_manual_exception_details to authenticated,service_role;
revoke all on function public.gate_supervision_append_only() from public,anon,authenticated,service_role;
revoke all on function public.gate_supervision_context(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.create_gate_manual_exception(uuid,uuid,text,text,text,text,uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.approve_gate_manual_exception(uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.reconcile_visitor_access_state(uuid,uuid,boolean,text,text) from public,anon,authenticated,service_role;
revoke all on function public.list_gate_current_visitors(uuid,uuid,uuid,text,integer,integer) from public,anon,authenticated,service_role;
revoke all on function public.list_gate_access_evidence(uuid,uuid,uuid,text,text,text,text,text,text,timestamptz,timestamptz,integer,integer,timestamptz,uuid,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_gate_manual_exception(uuid,uuid,text,text,text,text,uuid,uuid) to authenticated,service_role;
grant execute on function public.approve_gate_manual_exception(uuid,text) to authenticated,service_role;
grant execute on function public.reconcile_visitor_access_state(uuid,uuid,boolean,text,text) to authenticated,service_role;
grant execute on function public.list_gate_current_visitors(uuid,uuid,uuid,text,integer,integer) to authenticated,service_role;
grant execute on function public.list_gate_access_evidence(uuid,uuid,uuid,text,text,text,text,text,text,timestamptz,timestamptz,integer,integer,timestamptz,uuid,timestamptz,uuid) to authenticated,service_role;
