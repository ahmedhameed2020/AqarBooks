-- Delivery may fail independently of immutable gate evidence. Queue only safe
-- display data; never copy QR material, device credentials, phone or free text.
alter table public.notifications drop constraint notifications_type_check,
  add constraint notifications_type_check check (type in (
    'REQUEST_RECEIVED','MAINTENANCE_UPDATE','WORK_ORDER_SCHEDULED','WORK_STARTED','WORK_COMPLETED','OWNER_CHARGE_CREATED',
    'VISITOR_INVITATION_CREATED','VISITOR_ENTERED','VISITOR_EXITED','INVITATION_REVOKED','DUE_CREATED','PAYMENT_CONFIRMED',
    'RECEIPT_AVAILABLE','VEHICLE_REGISTERED','VEHICLE_DEACTIVATED','LEASE_EXPIRY_REMINDER',
    'VISITOR_SECURITY_ALERT','VISITOR_MANUAL_EXCEPTION'));
alter table public.notifications drop constraint notifications_source_type_check,
  add constraint notifications_source_type_check check (source_type in (
    'maintenance_request','maintenance_request_update','work_order','work_order_update','work_order_cost',
    'visitor_invitation','access_event','due','payment','vehicle','lease_expiry_dispatch','gate_manual_exception'));

create table public.gate_notification_outbox (
  dedupe_key text primary key,
  organization_id uuid not null references public.organizations(id),
  recipient_user_id uuid not null references auth.users(id),
  recipient_member_id uuid not null,
  type text not null check (type in ('VISITOR_ENTERED','VISITOR_EXITED','VISITOR_SECURITY_ALERT','VISITOR_MANUAL_EXCEPTION')),
  source_id uuid not null,
  body_ar text not null,
  body_en text not null,
  action_url text not null check (action_url ~ '^/portal/visitors/[0-9a-f-]{36}$'),
  status text not null default 'PENDING' check (status in ('PENDING','DELIVERED','SKIPPED','FAILED')),
  attempts integer not null default 0 check (attempts between 0 and 5),
  next_attempt_at timestamptz not null default clock_timestamp(),
  created_at timestamptz not null default clock_timestamp(),
  foreign key (organization_id,recipient_member_id) references public.members(organization_id,id),
  check (dedupe_key = case type when 'VISITOR_ENTERED' then 'gate-entry:' when 'VISITOR_EXITED' then 'gate-exit:'
    when 'VISITOR_SECURITY_ALERT' then 'gate-alert:' else 'gate-exception:' end || source_id::text)
);
create index gate_notification_pending on public.gate_notification_outbox(next_attempt_at) where status='PENDING';
alter table public.gate_notification_outbox enable row level security;
revoke all on public.gate_notification_outbox from public,anon,authenticated,service_role;
grant select on public.gate_notification_outbox to service_role;

create function public.deliver_gate_notification(p_key text) returns void
language plpgsql security definer set search_path = '' as $$
declare v_job public.gate_notification_outbox; v_id uuid;
begin
  select * into v_job from public.gate_notification_outbox where dedupe_key=p_key for update;
  if not found or v_job.status <> 'PENDING' or v_job.attempts >= 5 or v_job.next_attempt_at > clock_timestamp() then return; end if;
  begin
    v_id := public.create_notification_once(v_job.organization_id,v_job.recipient_user_id,v_job.recipient_member_id,v_job.type,
      case v_job.type when 'VISITOR_ENTERED' then 'دخول زائر' when 'VISITOR_EXITED' then 'خروج زائر'
        when 'VISITOR_SECURITY_ALERT' then 'تنبيه أمني للزائر' else 'استثناء دخول زائر معتمد' end,
      case v_job.type when 'VISITOR_ENTERED' then 'Guest entered' when 'VISITOR_EXITED' then 'Guest exited'
        when 'VISITOR_SECURITY_ALERT' then 'Visitor security alert' else 'Approved visitor access exception' end,
      v_job.body_ar,v_job.body_en,
      case when v_job.type='VISITOR_MANUAL_EXCEPTION' then 'gate_manual_exception' else 'access_event' end,
      v_job.source_id,v_job.action_url,case when v_job.type in ('VISITOR_ENTERED','VISITOR_EXITED') then 'NORMAL' else 'HIGH' end);
    update public.gate_notification_outbox set status=case when v_id is null then 'SKIPPED' else 'DELIVERED' end,
      attempts=attempts+1 where dedupe_key=p_key;
  exception when others then
    -- Do not persist/log SQLERRM: a downstream failure may contain secret data.
    update public.gate_notification_outbox set attempts=attempts+1,
      status=case when attempts+1 >= 5 then 'FAILED' else 'PENDING' end,
      next_attempt_at=clock_timestamp()+make_interval(mins=>power(2,attempts)::integer)
      where dedupe_key=p_key;
  end;
end;
$$;

create function public.enqueue_gate_notification(
  p_organization_id uuid,p_invitation_id uuid,p_gate_id uuid,p_type text,p_source_id uuid,p_reason text,p_occurred_at timestamptz
) returns void language plpgsql security definer set search_path = '' as $$
declare v_data record; v_key text;
begin
  -- Unknown visitors never fall through to a member lookup or inferred owner.
  if p_invitation_id is null then return; end if;
  if not public.notification_feature_enabled(p_organization_id,p_type) then return; end if;
  select m.id member_id,m.user_id,i.guest_name,p.name property_name,u.code unit_code,g.name_ar gate_ar,g.name_en gate_en,g.code gate_code
    into v_data from public.visitor_invitations i
    join public.members m on m.id=i.invited_by_member_id and m.organization_id=i.organization_id
    join public.properties p on p.id=i.property_id and p.organization_id=i.organization_id
    join public.units u on u.id=i.unit_id and u.organization_id=i.organization_id
    join public.gates g on g.id=p_gate_id and g.organization_id=i.organization_id
    where i.id=p_invitation_id and i.organization_id=p_organization_id and m.user_id is not null;
  if not found then return; end if;
  v_key := case p_type when 'VISITOR_ENTERED' then 'gate-entry:' when 'VISITOR_EXITED' then 'gate-exit:'
    when 'VISITOR_SECURITY_ALERT' then 'gate-alert:' when 'VISITOR_MANUAL_EXCEPTION' then 'gate-exception:' end || p_source_id::text;
  insert into public.gate_notification_outbox(dedupe_key,organization_id,recipient_user_id,recipient_member_id,type,source_id,body_ar,body_en,action_url)
  values(v_key,p_organization_id,v_data.user_id,v_data.member_id,p_type,p_source_id,
    concat_ws(' · ',v_data.guest_name,v_data.property_name,v_data.unit_code,v_data.gate_code,v_data.gate_ar,p_reason,to_char(p_occurred_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS')||' UTC'),
    concat_ws(' · ',v_data.guest_name,v_data.property_name,v_data.unit_code,v_data.gate_code,v_data.gate_en,p_reason,to_char(p_occurred_at at time zone 'UTC','YYYY-MM-DD HH24:MI:SS')||' UTC'),
    '/portal/visitors/'||p_invitation_id::text)
  on conflict(dedupe_key) do nothing;
  perform public.deliver_gate_notification(v_key);
end;
$$;

-- Keep the existing trigger binding and exit notification behavior. The scan
-- RPC serializes visit transitions under the invitation lock; replay adds no
-- event, and ALREADY_INSIDE is not a second entry in the same visit cycle.
create or replace function public.notify_access_event_allowed() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_type text;
begin
  if new.visitor_invitation_id is null or new.decision='RECONCILE' then return new; end if;
  if new.decision='ALLOW' and new.reason_code in ('VALID_ENTRY','VALID_EXIT') then
    v_type := case when new.direction='ENTRY' then 'VISITOR_ENTERED' else 'VISITOR_EXITED' end;
  elsif new.decision='DENY' and (
    new.reason_code='PROPERTY_MISMATCH' or
    (new.reason_code in ('REVOKED','EXPIRED') and exists (
      select 1 from public.access_events e where e.organization_id=new.organization_id
        and e.visitor_invitation_id=new.visitor_invitation_id and e.decision='DENY'
        and e.reason_code=new.reason_code and e.id<>new.id
    ))) then v_type := 'VISITOR_SECURITY_ALERT';
  else return new;
  end if;
  perform public.enqueue_gate_notification(new.organization_id,new.visitor_invitation_id,new.gate_id,v_type,new.id,new.reason_code,new.occurred_at);
  return new;
end;
$$;

create function public.notify_gate_manual_exception() returns trigger
language plpgsql security definer set search_path = '' as $$
declare v_request public.gate_manual_exceptions;
begin
  if new.record_type<>'APPROVAL' or new.outcome<>'ENTERED' or new.visitor_invitation_id is null then return new; end if;
  select * into v_request from public.gate_manual_exceptions where id=new.parent_exception_id
    and record_type='REQUEST' and organization_id=new.organization_id and visitor_invitation_id=new.visitor_invitation_id
    and gate_id=new.gate_id and direction='ENTRY' and outcome='ENTERED';
  if not found then return new; end if;
  -- APPROVAL is separate immutable evidence; the request identifies the one
  -- exception. Never send pending requests, approval free text, or denials.
  perform public.enqueue_gate_notification(v_request.organization_id,v_request.visitor_invitation_id,v_request.gate_id,
    'VISITOR_MANUAL_EXCEPTION',v_request.id,'MANUAL_ALLOW',new.occurred_at);
  return new;
end;
$$;
create trigger gate_manual_exception_notification after insert on public.gate_manual_exceptions
for each row execute function public.notify_gate_manual_exception();

-- Service-only drain for the operational job. Bounded attempts and batch size;
-- SKIP LOCKED allows concurrent workers without sending a notification twice.
create function public.process_gate_notifications(p_limit integer default 100) returns integer
language plpgsql security definer set search_path = '' as $$
declare v_job record; v_count integer := 0;
begin
  if p_limit is null or p_limit not between 1 and 100 then raise exception 'INVALID_BATCH_LIMIT' using errcode='22023'; end if;
  for v_job in select dedupe_key from public.gate_notification_outbox
    where status='PENDING' and attempts<5 and next_attempt_at<=clock_timestamp()
    order by next_attempt_at,dedupe_key limit p_limit for update skip locked
  loop
    perform public.deliver_gate_notification(v_job.dedupe_key);
    v_count := v_count+1;
  end loop;
  return v_count;
end;
$$;

revoke all on function public.deliver_gate_notification(text) from public,anon,authenticated,service_role;
revoke all on function public.enqueue_gate_notification(uuid,uuid,uuid,text,uuid,text,timestamptz) from public,anon,authenticated,service_role;
revoke all on function public.notify_access_event_allowed() from public,anon,authenticated,service_role;
revoke all on function public.notify_gate_manual_exception() from public,anon,authenticated,service_role;
revoke all on function public.process_gate_notifications(integer) from public,anon,authenticated,service_role;
grant execute on function public.process_gate_notifications(integer) to service_role;
