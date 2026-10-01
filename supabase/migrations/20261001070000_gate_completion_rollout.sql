-- Core visitor_management_enabled remains authoritative; completion is opt-in.
create table public.gate_completion_policy (
  organization_id uuid primary key references public.organizations(id),
  enabled boolean not null default false,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.gate_completion_policy enable row level security;
revoke all on public.gate_completion_policy from public,anon,authenticated,service_role;
grant select on public.gate_completion_policy to authenticated,service_role;
create policy gate_completion_policy_read on public.gate_completion_policy for select to authenticated
using (auth.uid() is not null and (public.gate_staff_can_view(organization_id) or public.gate_staff_can_manage(organization_id)));

create function public.gate_completion_enabled(p_organization_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select (auth.uid() is null or public.has_permission(auth.uid(),p_organization_id,'operations.gates.view')
    or public.has_permission(auth.uid(),p_organization_id,'operations.gates.manage')
    or public.has_permission(auth.uid(),p_organization_id,'operations.gates.scan')
    or public.has_permission(auth.uid(),p_organization_id,'operations.access_events.view'))
  and public.gate_operations_enabled(p_organization_id) and exists(
    select 1 from public.gate_completion_policy where organization_id=p_organization_id and enabled
  );
$$;
revoke all on function public.gate_completion_enabled(uuid) from public,anon,authenticated,service_role;
grant execute on function public.gate_completion_enabled(uuid) to authenticated,service_role;

create function public.set_gate_completion_policy(p_organization_id uuid,p_enabled boolean) returns void
language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.organization_is_active(p_organization_id)
    or not public.gate_operations_enabled(p_organization_id) or not public.gate_staff_can_manage(p_organization_id) then
    raise exception 'GATE_COMPLETION_NOT_AUTHORIZED' using errcode='42501';
  end if;
  if p_enabled is null then raise exception 'INVALID_GATE_COMPLETION_POLICY' using errcode='22023'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('gate-completion:'||p_organization_id::text,0));
  insert into public.gate_completion_policy(organization_id,enabled,updated_by)
    values(p_organization_id,p_enabled,auth.uid())
  on conflict(organization_id) do update set enabled=excluded.enabled,updated_by=excluded.updated_by,updated_at=now();
end;
$$;
revoke all on function public.set_gate_completion_policy(uuid,boolean) from public,anon,authenticated,service_role;
grant execute on function public.set_gate_completion_policy(uuid,boolean) to authenticated;

-- Hold a shared policy row lock until transaction completion, so disabling waits
-- for admitted mutations and no newly admitted mutation can follow the rollback.
create function public.require_gate_completion(p_organization_id uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_enabled boolean;
begin
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('gate-completion:'||p_organization_id::text,0));
  select enabled into v_enabled from public.gate_completion_policy
    where organization_id=p_organization_id for share;
  if v_enabled is distinct from true or not public.gate_operations_enabled(p_organization_id) then
    raise exception 'GATE_COMPLETION_DISABLED' using errcode='42501';
  end if;
end;
$$;
revoke all on function public.require_gate_completion(uuid) from public,anon,authenticated,service_role;

create function public.guard_gate_completion_insert() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  perform public.require_gate_completion(new.organization_id);
  return new;
end;
$$;
revoke all on function public.guard_gate_completion_insert() from public,anon,authenticated,service_role;
create trigger completion_guard before insert on public.gate_device_enrollments
for each row execute function public.guard_gate_completion_insert();
create trigger completion_guard before insert on public.gate_devices
for each row execute function public.guard_gate_completion_insert();
create trigger completion_guard before insert on public.gate_manual_exceptions
for each row execute function public.guard_gate_completion_insert();
create trigger completion_guard before insert on public.gate_access_reconciliations
for each row execute function public.guard_gate_completion_insert();
create trigger completion_guard before insert on public.gate_connectivity_incidents
for each row execute function public.guard_gate_completion_insert();

-- Separate private canonical scan logic from the two admitted public paths.
do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.process_visitor_gate_scan(uuid,uuid,text,text,uuid)'::regprocedure) into v_definition;
  execute replace(v_definition,'public.process_visitor_gate_scan(', 'public.process_visitor_gate_scan_core(');
  select pg_get_functiondef('public.process_visitor_gate_scan(uuid,text,uuid,uuid,text,text,uuid)'::regprocedure) into v_definition;
  if position(E'begin\n' in v_definition)=0 then raise exception 'TRUSTED_SCAN_DEFINITION_CHANGED'; end if;
  v_definition := replace(v_definition,'public.process_visitor_gate_scan(' || E'\n      p_gate_id', 'public.process_visitor_gate_scan_core(' || E'\n      p_gate_id');
  if position('public.process_visitor_gate_scan_core(' in v_definition)=0 then raise exception 'TRUSTED_SCAN_CORE_CALL_CHANGED'; end if;
  execute replace(v_definition,E'begin\n',E'begin\n  perform public.require_gate_completion((select organization_id from public.gates where id=p_gate_id));\n');
end;
$$;
revoke all on function public.process_visitor_gate_scan_core(uuid,uuid,text,text,uuid) from public,anon,authenticated,service_role;

create or replace function public.process_visitor_gate_scan(
  p_gate_id uuid,p_invitation_id uuid,p_raw_secret text,p_direction text,p_client_scan_id uuid
) returns table(decision text,reason_code text,event_id uuid,guest_name text,invitation_no text,
  unit_id uuid,invitation_id uuid,usage_policy text,valid_until timestamptz,is_inside boolean,
  gate_id uuid,property_id uuid,occurred_at timestamptz)
language plpgsql security definer set search_path='' as $$
declare v_enabled boolean;
begin
  -- Lock the same policy row as enabling, fencing legacy admissions at rollout.
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('gate-completion:'||(select organization_id::text from public.gates where id=p_gate_id),0));
  select p.enabled into v_enabled from public.gate_completion_policy p
    join public.gates g on g.organization_id=p.organization_id where g.id=p_gate_id for share of p;
  if v_enabled is true then raise exception 'GATE_TRUSTED_DEVICE_REQUIRED' using errcode='42501'; end if;
  return query select * from public.process_visitor_gate_scan_core(p_gate_id,p_invitation_id,p_raw_secret,p_direction,p_client_scan_id);
end;
$$;
revoke all on function public.process_visitor_gate_scan(uuid,uuid,text,text,uuid) from public,anon,authenticated,service_role;
grant execute on function public.process_visitor_gate_scan(uuid,uuid,text,text,uuid) to authenticated;

create or replace function public.gate_hardware_event_eligible(p_event_id uuid,p_endpoint_id uuid) returns boolean
language sql stable security definer set search_path='' as $$
  select exists (
    select 1 from public.access_events e
    join public.gate_hardware_settings s on s.organization_id=e.organization_id and s.enabled
    join public.organizations o on o.id=e.organization_id and o.status='ACTIVE'
    join public.gates g on g.id=e.gate_id and g.organization_id=e.organization_id and g.is_active
    join public.gate_hardware_endpoints h on h.id=p_endpoint_id and h.organization_id=e.organization_id and h.gate_id=e.gate_id
    where e.id=p_event_id and e.decision='ALLOW' and e.reconciliation_id is null
      and ((e.direction='ENTRY' and e.reason_code='VALID_ENTRY') or (e.direction='EXIT' and e.reason_code='VALID_EXIT'))
      and h.is_active and h.adapter='NOOP' and public.gate_completion_enabled(e.organization_id)
  );
$$;
