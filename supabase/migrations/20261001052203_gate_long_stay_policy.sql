-- Explicit tenant policy. No organization is opted into alerts by migration.
create table public.gate_long_stay_policy (
  organization_id uuid primary key references public.organizations(id) on delete cascade,
  threshold_hours integer not null default 12 check (threshold_hours between 1 and 168),
  notifications_enabled boolean not null default false,
  updated_by uuid not null references auth.users(id),
  updated_at timestamptz not null default now()
);
alter table public.gate_long_stay_policy enable row level security;
revoke all on public.gate_long_stay_policy from public,anon,authenticated,service_role;
grant select on public.gate_long_stay_policy to authenticated,service_role;
create policy gate_long_stay_policy_read on public.gate_long_stay_policy for select to authenticated
using (auth.uid() is not null and public.gate_operations_enabled(organization_id) and
  (public.gate_staff_can_view(organization_id) or public.has_permission(auth.uid(),organization_id,'operations.access_events.view')));

create function public.set_gate_long_stay_policy(p_organization_id uuid,p_threshold_hours integer,p_notifications_enabled boolean)
returns void language plpgsql security definer set search_path='' as $$
begin
  if auth.uid() is null or not public.gate_operations_enabled(p_organization_id)
    or not public.gate_staff_can_manage(p_organization_id) then
    raise exception 'GATE_POLICY_NOT_AUTHORIZED' using errcode='42501';
  end if;
  if p_threshold_hours is null or p_threshold_hours not between 1 and 168 or p_notifications_enabled is null then
    raise exception 'INVALID_GATE_POLICY' using errcode='22023';
  end if;
  insert into public.gate_long_stay_policy(organization_id,threshold_hours,notifications_enabled,updated_by)
    values(p_organization_id,p_threshold_hours,p_notifications_enabled,auth.uid())
  on conflict(organization_id) do update set threshold_hours=excluded.threshold_hours,
    notifications_enabled=excluded.notifications_enabled,updated_by=excluded.updated_by,updated_at=now();
end;
$$;
revoke all on function public.set_gate_long_stay_policy(uuid,integer,boolean) from public,anon,authenticated,service_role;
grant execute on function public.set_gate_long_stay_policy(uuid,integer,boolean) to authenticated;

create function public.detect_gate_long_stays(p_limit integer default 100) returns integer
language plpgsql security definer set search_path='' as $$
declare v_row record; v_count integer:=0;
begin
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_BATCH_LIMIT' using errcode='22023'; end if;
  -- Serialize with scans/reconciliation by locking the same mutable occupancy row.
  -- The original entry timestamp must match; reconciliation is never an entry origin.
  for v_row in
    select s.organization_id,s.visitor_invitation_id,e.id,e.gate_id,e.occurred_at
    from public.visitor_access_state s
    join public.gate_long_stay_policy p on p.organization_id=s.organization_id
    join public.access_events e on e.organization_id=s.organization_id
      and e.visitor_invitation_id=s.visitor_invitation_id and e.occurred_at=s.last_entry_at
      and e.decision='ALLOW' and e.direction='ENTRY' and e.reason_code='VALID_ENTRY'
    where s.is_inside and p.notifications_enabled
      and public.gate_operations_enabled(s.organization_id)
      and public.notification_feature_enabled(s.organization_id,'VISITOR_SECURITY_ALERT')
      and s.last_entry_at<=now()-make_interval(hours=>p.threshold_hours)
      and not exists(select 1 from public.gate_notification_outbox o where o.dedupe_key='gate-alert:'||e.id::text)
    order by s.last_entry_at,e.id limit p_limit for update of s skip locked
  loop
    perform public.enqueue_gate_notification(v_row.organization_id,v_row.visitor_invitation_id,v_row.gate_id,
      'VISITOR_SECURITY_ALERT',v_row.id,'LONG_STAY',v_row.occurred_at);
    v_count:=v_count+1;
  end loop;
  return v_count;
end;
$$;
revoke all on function public.detect_gate_long_stays(integer) from public,anon,authenticated,service_role;
grant execute on function public.detect_gate_long_stays(integer) to service_role;
