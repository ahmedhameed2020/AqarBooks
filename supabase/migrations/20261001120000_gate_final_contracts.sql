-- Final operational contracts. All evidence survives completion rollback.
-- A revoker/rotator which acquired the device lock first must win admission.
do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.verify_gate_device_binding(uuid,text,uuid,text)'::regprocedure) into v_definition;
  if position('where d.id = p_device_id;' in v_definition)=0 then raise exception 'DEVICE_DEFINITION_CHANGED'; end if;
  execute replace(v_definition,'where d.id = p_device_id;', 'where d.id = p_device_id for update;');
end;
$$;

create unique index access_events_org_id_key on public.access_events(organization_id,id);
create unique index gate_devices_org_id_key on public.gate_devices(organization_id,id);
create table public.gate_scan_devices (
  organization_id uuid not null references public.organizations(id),
  access_event_id uuid primary key,
  device_id uuid not null,
  validation_ms integer not null check(validation_ms between 0 and 3600000),
  scanner_version text not null check(scanner_version in ('2026-10-01','unknown')),
  foreign key(organization_id,access_event_id) references public.access_events(organization_id,id),
  foreign key(organization_id,device_id) references public.gate_devices(organization_id,id)
);
alter table public.gate_scan_devices enable row level security;
revoke all on public.gate_scan_devices from public,anon,authenticated,service_role;
grant select on public.gate_scan_devices to authenticated,service_role;
create policy gate_scan_devices_read on public.gate_scan_devices for select to authenticated
using(public.has_permission(auth.uid(),organization_id,'operations.access_events.view'));
create function public.reject_gate_scan_device_mutation() returns trigger
language plpgsql security definer set search_path='' as $$
begin raise exception 'IMMUTABLE_GATE_SCAN_DEVICE' using errcode='42501'; end;
$$;
revoke all on function public.reject_gate_scan_device_mutation() from public,anon,authenticated,service_role;
create trigger gate_scan_devices_immutable before update or delete on public.gate_scan_devices
for each row execute function public.reject_gate_scan_device_mutation();

drop function public.process_visitor_gate_scan(uuid,text,uuid,uuid,text,text,uuid);
create function public.process_visitor_gate_scan(
  p_device_id uuid,p_device_credential text,p_gate_id uuid,p_invitation_id uuid,
  p_raw_secret text,p_direction text,p_client_scan_id uuid,p_scanner_version text default 'unknown'
) returns table(decision text,reason_code text,event_id uuid,guest_name text,invitation_no text,
  unit_id uuid,invitation_id uuid,usage_policy text,valid_until timestamptz,is_inside boolean,
  gate_id uuid,property_id uuid,occurred_at timestamptz,hardware_status text)
language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_scan record; v_existing boolean; v_hardware text; v_started timestamptz:=clock_timestamp();
begin
  v_org := public.require_gate_scan_actor(p_gate_id);
  perform public.require_gate_completion(v_org);
  if public.verify_gate_device_binding(p_device_id,
    pg_catalog.encode(extensions.digest(pg_catalog.convert_to(p_device_credential,'UTF8'),'sha256'),'hex'),
    p_gate_id,p_direction) is not true then
    -- Server log survives transaction abort; never log supplied credentials.
    raise log 'GATE_DEVICE_AUTHENTICATION_FAILED organization=% actor=%',v_org,auth.uid();
    raise exception 'DEVICE_BINDING_NOT_AUTHORIZED' using errcode='42501';
  end if;
  select exists(select 1 from public.access_events e where e.organization_id=v_org and e.client_scan_id=p_client_scan_id) into v_existing;
  select * into v_scan from public.process_visitor_gate_scan_core(p_gate_id,p_invitation_id,p_raw_secret,p_direction,p_client_scan_id);
  if not v_existing then
    insert into public.gate_scan_devices(organization_id,access_event_id,device_id,validation_ms,scanner_version)
      values(v_org,v_scan.event_id,p_device_id,least(3600000,greatest(0,extract(epoch from clock_timestamp()-v_started)*1000))::integer,
        case when p_scanner_version='2026-10-01' then p_scanner_version else 'unknown' end) on conflict(access_event_id) do nothing;
  end if;
  v_hardware := case
    when v_scan.decision<>'ALLOW' then 'NOT_ELIGIBLE'
    when exists(select 1 from public.gate_hardware_commands c where c.organization_id=v_org and c.access_event_id=v_scan.event_id) then 'QUEUED'
    when not exists(select 1 from public.gate_hardware_endpoints e join public.gate_hardware_settings s on s.organization_id=e.organization_id
      where e.organization_id=v_org and e.gate_id=v_scan.gate_id and e.is_active and s.enabled) then 'NOT_CONFIGURED'
    else 'NOT_ELIGIBLE' end;
  return query select v_scan.decision,v_scan.reason_code,v_scan.event_id,v_scan.guest_name,v_scan.invitation_no,
    v_scan.unit_id,v_scan.invitation_id,v_scan.usage_policy,v_scan.valid_until,v_scan.is_inside,
    v_scan.gate_id,v_scan.property_id,v_scan.occurred_at,v_hardware;
end;
$$;
revoke all on function public.process_visitor_gate_scan(uuid,text,uuid,uuid,text,text,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.process_visitor_gate_scan(uuid,text,uuid,uuid,text,text,uuid,text) to authenticated,service_role;

-- Completion-only notifications share the rollout lock. Deliberate legacy
-- entry/exit notifications retain their original availability.
create function public.gate_notification_admitted(p_org uuid,p_type text) returns boolean
language plpgsql security definer set search_path='' as $$
begin
  if p_type in ('VISITOR_ENTERED','VISITOR_EXITED') then return true; end if;
  perform pg_catalog.pg_advisory_xact_lock_shared(pg_catalog.hashtextextended('gate-completion:'||p_org::text,0));
  return public.gate_completion_enabled(p_org);
end;
$$;
revoke all on function public.gate_notification_admitted(uuid,text) from public,anon,authenticated,service_role;

create table public.gate_notification_recovery (
  organization_id uuid not null references public.organizations(id),
  source_id uuid not null,
  type text not null,
  reason_code text not null,
  attempts integer not null default 0 check(attempts between 0 and 5),
  status text not null default 'PENDING' check(status in ('PENDING','RECOVERED','FAILED')),
  next_attempt_at timestamptz not null default now(),
  primary key(organization_id,source_id,type)
);
alter table public.gate_notification_recovery enable row level security;
revoke all on public.gate_notification_recovery from public,anon,authenticated,service_role;
grant select on public.gate_notification_recovery to service_role;

alter function public.enqueue_gate_notification(uuid,uuid,uuid,text,uuid,text,timestamptz) rename to enqueue_gate_notification_impl;
create function public.enqueue_gate_notification(p_organization_id uuid,p_invitation_id uuid,p_gate_id uuid,p_type text,p_source_id uuid,p_reason text,p_occurred_at timestamptz)
returns void language plpgsql security definer set search_path='' as $$
begin
  if not public.gate_notification_admitted(p_organization_id,p_type) then return; end if;
  begin
    perform public.enqueue_gate_notification_impl(p_organization_id,p_invitation_id,p_gate_id,p_type,p_source_id,p_reason,p_occurred_at);
  exception when others then
    -- A separate small recovery record points back to immutable evidence.
    -- Neither error text nor guest/QR material is copied into diagnostics.
    begin
      insert into public.gate_notification_recovery(organization_id,source_id,type,reason_code)
      values(p_organization_id,p_source_id,p_type,p_reason) on conflict do nothing;
    exception when others then
      raise log 'GATE_NOTIFICATION_RECOVERY_UNAVAILABLE';
    end;
  end;
end;
$$;
revoke all on function public.enqueue_gate_notification(uuid,uuid,uuid,text,uuid,text,timestamptz) from public,anon,authenticated,service_role;

alter function public.deliver_gate_notification(text) rename to deliver_gate_notification_impl;
create function public.deliver_gate_notification(p_key text) returns void
language plpgsql security definer set search_path='' as $$
declare v_org uuid; v_type text;
begin
  select organization_id,type into v_org,v_type from public.gate_notification_outbox where dedupe_key=p_key;
  if not found or not public.gate_notification_admitted(v_org,v_type) then return; end if;
  perform public.deliver_gate_notification_impl(p_key);
end;
$$;
revoke all on function public.deliver_gate_notification(text) from public,anon,authenticated,service_role;

alter function public.process_gate_notifications(integer) rename to process_gate_notifications_impl;
revoke all on function public.process_gate_notifications_impl(integer) from public,anon,authenticated,service_role;
create function public.process_gate_notifications(p_limit integer default 100) returns integer
language plpgsql security definer set search_path='' as $$
declare v_job record; v_evidence record;
begin
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_BATCH_LIMIT' using errcode='22023'; end if;
  for v_job in select * from public.gate_notification_recovery
    where status='PENDING' and attempts<5 and next_attempt_at<=clock_timestamp()
    order by next_attempt_at,source_id limit p_limit for update skip locked
  loop
    if not public.gate_notification_admitted(v_job.organization_id,v_job.type) then continue; end if;
    select e.visitor_invitation_id,e.gate_id,e.occurred_at into v_evidence from public.access_events e
      where e.organization_id=v_job.organization_id and e.id=v_job.source_id;
    if v_job.type='VISITOR_MANUAL_EXCEPTION' then
      select e.visitor_invitation_id,e.gate_id,a.occurred_at into v_evidence from public.gate_manual_exceptions e
        join public.gate_manual_exceptions a on a.parent_exception_id=e.id and a.organization_id=e.organization_id and a.record_type='APPROVAL'
        where e.organization_id=v_job.organization_id and e.id=v_job.source_id;
    end if;
    begin
      if v_evidence.visitor_invitation_id is not null then
        perform public.enqueue_gate_notification_impl(v_job.organization_id,v_evidence.visitor_invitation_id,v_evidence.gate_id,
          v_job.type,v_job.source_id,v_job.reason_code,v_evidence.occurred_at);
      end if;
      update public.gate_notification_recovery set status='RECOVERED',attempts=attempts+1
        where organization_id=v_job.organization_id and source_id=v_job.source_id and type=v_job.type;
    exception when others then
      update public.gate_notification_recovery set attempts=attempts+1,status=case when attempts+1>=5 then 'FAILED' else 'PENDING' end,
        next_attempt_at=clock_timestamp()+make_interval(mins=>power(2,attempts)::integer)
        where organization_id=v_job.organization_id and source_id=v_job.source_id and type=v_job.type;
    end;
  end loop;
  return public.process_gate_notifications_impl(p_limit);
end;
$$;
revoke all on function public.process_gate_notifications(integer) from public,anon,authenticated,service_role;
grant execute on function public.process_gate_notifications(integer) to service_role;

-- Filter before LIMIT; the enqueue admission lock rechecks after any rollback.
do $$
declare v_definition text;
begin
  select pg_get_functiondef('public.detect_gate_long_stays(integer)'::regprocedure) into v_definition;
  execute replace(v_definition,'and public.gate_operations_enabled(s.organization_id)', 'and public.gate_completion_enabled(s.organization_id)');
end;
$$;

create function public.audit_gate_reconciliation() returns trigger
language plpgsql security definer set search_path='' as $$
begin
  insert into public.platform_audit_logs(actor_id,organization_id,property_id,action,entity_type,entity_id,safe_change_summary)
    values(auth.uid(),new.organization_id,(select property_id from public.gates where id=new.gate_id and organization_id=new.organization_id),'gate_access.reconciled','gate_access_reconciliation',new.id,
      jsonb_build_object('gate_id',new.gate_id,'invitation_id',new.visitor_invitation_id));
  return new;
end;
$$;
revoke all on function public.audit_gate_reconciliation() from public,anon,authenticated,service_role;
create trigger gate_reconciliation_audit after insert on public.gate_access_reconciliations
for each row execute function public.audit_gate_reconciliation();

insert into public.permissions(key,description) values
 ('operations.gates.devices.manage','Manage trusted gate device enrollment and revocation'),
 ('operations.gates.hardware.manage','Authorize gate hardware configuration; service integration only') on conflict(key) do nothing;
insert into public.role_permissions(role_id,permission_id)
select rp.role_id,p.id from public.role_permissions rp join public.permissions old on old.id=rp.permission_id
cross join public.permissions p where old.key='operations.gates.manage'
and p.key in ('operations.gates.devices.manage','operations.gates.hardware.manage') on conflict do nothing;
insert into public.role_template_permissions(role_template_key,permission_key)
select r.role_template_key,p.key from public.role_template_permissions r cross join public.permissions p
where r.permission_key='operations.gates.manage' and p.key in ('operations.gates.devices.manage','operations.gates.hardware.manage') on conflict do nothing;
do $$
declare v_definition text; v_signature text;
begin
  foreach v_signature in array array['public.create_gate_device_enrollment(uuid,text,text,timestamp with time zone)','public.revoke_gate_device(uuid,text)'] loop
    select pg_get_functiondef(v_signature::regprocedure) into v_definition;
    execute replace(replace(v_definition,'public.gate_staff_can_manage(v_gate.organization_id)',
      'public.has_permission(auth.uid(),v_gate.organization_id,''operations.gates.devices.manage'')'),
      'public.gate_staff_can_manage(v_device.organization_id)',
      'public.has_permission(auth.uid(),v_device.organization_id,''operations.gates.devices.manage'')');
  end loop;
end;
$$;

-- Called only by the server after a rejected scan RPC. Caller/tenant are
-- derived from the signed-in actor and gate; credentials never enter this API.
create function public.audit_gate_authentication_failure(p_actor uuid,p_gate uuid) returns void
language plpgsql security definer set search_path='' as $$
declare v_gate public.gates;
begin
  select * into v_gate from public.gates where id=p_gate;
  if not found or not public.has_permission(p_actor,v_gate.organization_id,'operations.gates.scan') then return; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('gate-auth-audit:'||p_actor::text,0));
  if (select count(*) from public.platform_audit_logs where actor_id=p_actor and organization_id=v_gate.organization_id
      and action='gate_device.authentication_failed' and created_at>now()-interval '1 minute')>=10 then return; end if;
  insert into public.platform_audit_logs(actor_id,organization_id,property_id,action,entity_type,entity_id,safe_change_summary)
    values(p_actor,v_gate.organization_id,v_gate.property_id,'gate_device.authentication_failed','gate',p_gate,
      jsonb_build_object('reason','DEVICE_BINDING_NOT_AUTHORIZED'));
end;
$$;
revoke all on function public.audit_gate_authentication_failure(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.audit_gate_authentication_failure(uuid,uuid) to service_role;

create function public.lookup_gate_reconciliation_invitation(p_gate uuid,p_query text)
returns table(id uuid,label text) language plpgsql security definer set search_path='' as $$
declare v_gate public.gates;
begin
  v_gate:=public.gate_supervision_context(p_gate,'operations.gates.occupancy.reconcile');
  if char_length(btrim(p_query)) not between 1 and 120 then return; end if;
  return query select i.id,i.invitation_no||' · '||i.guest_name from public.visitor_invitations i
    where i.organization_id=v_gate.organization_id and i.property_id=v_gate.property_id
      and (i.invitation_no=btrim(p_query) or i.id::text=btrim(p_query)) limit 1;
end;
$$;
revoke all on function public.lookup_gate_reconciliation_invitation(uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.lookup_gate_reconciliation_invitation(uuid,text) to authenticated;

-- Bounded aggregate sample, no guest/credential/free-text dimensions.
create function public.gate_scan_telemetry(p_org uuid,p_property uuid default null) returns jsonb
language sql stable security definer set search_path='' as $$
  with sample as (
    select e.gate_id,e.direction,e.reason_code,d.validation_ms,d.scanner_version
    from public.access_events e join public.gate_scan_devices d on d.access_event_id=e.id and d.organization_id=e.organization_id
    where e.organization_id=p_org and (p_property is null or e.property_id=p_property) and e.occurred_at>=now()-interval '24 hours'
    order by e.occurred_at desc limit 1000
  ), dimensions as (
    select gate_id,direction,reason_code,scanner_version,count(*) count from sample group by 1,2,3,4
  ), retries as (
    select c.attempts from public.gate_hardware_commands c join public.gates g on g.id=c.gate_id and g.organization_id=c.organization_id
    where c.organization_id=p_org and (p_property is null or g.property_id=p_property) order by c.created_at desc limit 1000
  ) select jsonb_build_object('sampleSize',(select count(*) from sample),'sampleLimit',1000,
    'validationP50Ms',(select percentile_cont(.5) within group(order by validation_ms) from sample),
    'validationP95Ms',(select percentile_cont(.95) within group(order by validation_ms) from sample),
    'hardwareRetries',(select coalesce(sum(greatest(attempts-1,0)),0) from retries),
    'dimensions',(select coalesce(jsonb_agg(to_jsonb(dimensions)),'[]') from dimensions));
$$;
revoke all on function public.gate_scan_telemetry(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.gate_scan_telemetry(uuid,uuid) to service_role;
