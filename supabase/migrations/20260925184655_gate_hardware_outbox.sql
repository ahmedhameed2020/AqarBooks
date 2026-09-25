-- Independent, private side effect of an immutable canonical ALLOW event.
-- No arbitrary payload, URL, credential, QR, or guest data enters this boundary.
create table public.gate_hardware_settings (
  organization_id uuid primary key references public.organizations(id),
  enabled boolean not null default false
);
create table public.gate_hardware_endpoints (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id),
  gate_id uuid not null,
  adapter text not null default 'NOOP' check (adapter in ('NOOP')),
  is_active boolean not null default false,
  unique (organization_id, id),
  unique (gate_id),
  foreign key (organization_id, gate_id) references public.gates(organization_id, id)
);
create table public.gate_hardware_commands (
  id uuid primary key default gen_random_uuid(),
  access_event_id uuid not null references public.access_events(id),
  organization_id uuid not null references public.organizations(id),
  endpoint_id uuid not null,
  gate_id uuid not null,
  command_type text not null default 'OPEN' check (command_type='OPEN'),
  direction text not null check (direction in ('ENTRY','EXIT')),
  adapter text not null check (adapter in ('NOOP')),
  status text not null default 'PENDING' check (status in ('PENDING','DISPATCHING','ACKNOWLEDGED','FAILED','DEAD')),
  attempts integer not null default 0 check (attempts between 0 and 10),
  claim_token uuid,
  claimed_at timestamptz,
  next_attempt_at timestamptz not null default clock_timestamp(),
  result_code text check (result_code in ('ACKNOWLEDGED','NOT_CONFIGURED','RETRYABLE_ERROR','PERMANENT_ERROR','POLICY_DISABLED','ATTEMPTS_EXHAUSTED')),
  created_at timestamptz not null default clock_timestamp(),
  updated_at timestamptz not null default clock_timestamp(),
  unique (access_event_id, command_type),
  foreign key (organization_id, endpoint_id) references public.gate_hardware_endpoints(organization_id, id),
  foreign key (organization_id, gate_id) references public.gates(organization_id, id),
  check ((status='DISPATCHING') = (claim_token is not null and claimed_at is not null))
);
create index gate_hardware_commands_due on public.gate_hardware_commands(next_attempt_at, id) where status in ('PENDING','FAILED');
create index gate_hardware_commands_stale on public.gate_hardware_commands(claimed_at) where status='DISPATCHING';
create index gate_hardware_commands_endpoint on public.gate_hardware_commands(organization_id, endpoint_id);
create index gate_hardware_commands_gate on public.gate_hardware_commands(organization_id, gate_id);
create index gate_hardware_endpoints_org on public.gate_hardware_endpoints(organization_id, gate_id);

alter table public.gate_hardware_settings enable row level security;
alter table public.gate_hardware_endpoints enable row level security;
alter table public.gate_hardware_commands enable row level security;
revoke all on public.gate_hardware_settings, public.gate_hardware_endpoints, public.gate_hardware_commands from public, anon, authenticated, service_role;
grant select, insert, update on public.gate_hardware_settings, public.gate_hardware_endpoints to service_role;
grant select on public.gate_hardware_commands to service_role;

create function public.gate_hardware_event_eligible(p_event_id uuid, p_endpoint_id uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.access_events e
    join public.gate_hardware_settings s on s.organization_id=e.organization_id and s.enabled
    join public.organizations o on o.id=e.organization_id and o.status='ACTIVE'
    join public.gates g on g.id=e.gate_id and g.organization_id=e.organization_id and g.is_active
    join public.gate_hardware_endpoints h on h.id=p_endpoint_id and h.organization_id=e.organization_id and h.gate_id=e.gate_id
    where e.id=p_event_id and e.decision='ALLOW' and e.reconciliation_id is null
      and ((e.direction='ENTRY' and e.reason_code='VALID_ENTRY') or (e.direction='EXIT' and e.reason_code='VALID_EXIT'))
      and h.is_active and h.adapter='NOOP' and public.gate_operations_enabled(e.organization_id)
  );
$$;

create function public.enqueue_gate_hardware_command(p_access_event_id uuid) returns uuid
language plpgsql security definer set search_path = '' as $$
declare v_id uuid;
begin
  insert into public.gate_hardware_commands(access_event_id,organization_id,endpoint_id,gate_id,direction,adapter)
  select e.id,e.organization_id,h.id,e.gate_id,e.direction,h.adapter
  from public.access_events e join public.gate_hardware_endpoints h on h.gate_id=e.gate_id and h.organization_id=e.organization_id
  where e.id=p_access_event_id and public.gate_hardware_event_eligible(e.id,h.id)
  on conflict (access_event_id, command_type) do nothing returning id into v_id;
  if v_id is null then select id into v_id from public.gate_hardware_commands where access_event_id=p_access_event_id and command_type='OPEN'; end if;
  return v_id;
end;
$$;

create function public.enqueue_access_event_hardware() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  perform public.enqueue_gate_hardware_command(new.id);
  return new;
exception when others then
  -- Hardware persistence failure must never replace/roll back access evidence.
  -- Do not log SQLERRM: vendor/database errors may contain secrets.
  raise warning 'GATE_HARDWARE_ENQUEUE_FAILED';
  return new;
end;
$$;
create trigger access_event_hardware after insert on public.access_events
for each row when (new.decision='ALLOW') execute function public.enqueue_access_event_hardware();

create function public.claim_gate_hardware_commands(p_limit integer default 50)
returns table(id uuid,access_event_id uuid,endpoint_id uuid,gate_id uuid,direction text,adapter text,claim_token uuid)
language plpgsql security definer set search_path = '' as $$
declare v_job public.gate_hardware_commands; v_now timestamptz := clock_timestamp();
begin
  if p_limit is null or p_limit not between 1 and 50 then raise exception 'INVALID_BATCH_LIMIT' using errcode='22023'; end if;
  for v_job in select c.* from public.gate_hardware_commands c
    where (c.status in ('PENDING','FAILED') and c.next_attempt_at<=v_now)
      or (c.status='DISPATCHING' and c.claimed_at<v_now-interval '10 minutes')
    order by c.next_attempt_at,c.id limit p_limit for update skip locked
  loop
    if v_job.attempts>=10 or not public.gate_hardware_event_eligible(v_job.access_event_id,v_job.endpoint_id) then
      update public.gate_hardware_commands c set status='DEAD',claim_token=null,claimed_at=null,updated_at=v_now,
        result_code=case when v_job.attempts>=10 then 'ATTEMPTS_EXHAUSTED' else 'POLICY_DISABLED' end where c.id=v_job.id;
      continue;
    end if;
    return query update public.gate_hardware_commands c set status='DISPATCHING',attempts=c.attempts+1,
      claim_token=gen_random_uuid(),claimed_at=v_now,updated_at=v_now where c.id=v_job.id
      returning c.id,c.access_event_id,c.endpoint_id,c.gate_id,c.direction,c.adapter,c.claim_token;
  end loop;
end;
$$;

-- Recheck after claiming and immediately before the external side effect.
create function public.validate_gate_hardware_command(p_command_id uuid,p_claim_token uuid) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_job public.gate_hardware_commands;
begin
  select * into v_job from public.gate_hardware_commands where id=p_command_id for update;
  if not found or v_job.status<>'DISPATCHING' or v_job.claim_token is distinct from p_claim_token
    or v_job.claimed_at<clock_timestamp()-interval '10 minutes' then return false; end if;
  if not public.gate_hardware_event_eligible(v_job.access_event_id,v_job.endpoint_id) then
    update public.gate_hardware_commands set status='DEAD',result_code='POLICY_DISABLED',claim_token=null,claimed_at=null,updated_at=clock_timestamp() where id=p_command_id;
    return false;
  end if;
  return true;
end;
$$;

create function public.complete_gate_hardware_command(p_command_id uuid,p_claim_token uuid,p_result text) returns text
language plpgsql security definer set search_path = '' as $$
declare v_job public.gate_hardware_commands; v_status text; v_now timestamptz := clock_timestamp();
begin
  if p_result is null or p_result not in ('ACKNOWLEDGED','NOT_CONFIGURED','RETRYABLE_ERROR','PERMANENT_ERROR') then
    raise exception 'INVALID_HARDWARE_RESULT' using errcode='22023';
  end if;
  select * into v_job from public.gate_hardware_commands where id=p_command_id for update;
  if not found or v_job.status<>'DISPATCHING' or v_job.claim_token is distinct from p_claim_token
    or v_job.claimed_at<v_now-interval '10 minutes' then return 'STALE'; end if;
  v_status := case when p_result='ACKNOWLEDGED' then 'ACKNOWLEDGED'
    when p_result in ('NOT_CONFIGURED','PERMANENT_ERROR') or v_job.attempts>=10 then 'DEAD' else 'FAILED' end;
  update public.gate_hardware_commands set status=v_status,result_code=p_result,claim_token=null,claimed_at=null,updated_at=v_now,
    next_attempt_at=v_now+make_interval(secs=>least(3600,60*power(2,v_job.attempts-1))::integer) where id=p_command_id;
  return v_status;
end;
$$;

revoke all on function public.gate_hardware_event_eligible(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.enqueue_access_event_hardware() from public,anon,authenticated,service_role;
revoke all on function public.enqueue_gate_hardware_command(uuid) from public,anon,authenticated,service_role;
revoke all on function public.claim_gate_hardware_commands(integer) from public,anon,authenticated,service_role;
revoke all on function public.validate_gate_hardware_command(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.complete_gate_hardware_command(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.enqueue_gate_hardware_command(uuid) to service_role;
grant execute on function public.claim_gate_hardware_commands(integer) to service_role;
grant execute on function public.validate_gate_hardware_command(uuid,uuid) to service_role;
grant execute on function public.complete_gate_hardware_command(uuid,uuid,text) to service_role;
