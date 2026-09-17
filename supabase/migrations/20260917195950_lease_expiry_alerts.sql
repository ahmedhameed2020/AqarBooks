-- PR9.2: Lease expiry reminders only. This migration deliberately does not
-- create successor leases, decide renewals, alter dues, or add timeline/UI.

alter table public.notifications
  drop constraint notifications_type_check,
  add constraint notifications_type_check check (
    type in (
      'REQUEST_RECEIVED', 'MAINTENANCE_UPDATE', 'WORK_ORDER_SCHEDULED',
      'WORK_STARTED', 'WORK_COMPLETED', 'OWNER_CHARGE_CREATED',
      'VISITOR_INVITATION_CREATED', 'VISITOR_ENTERED', 'VISITOR_EXITED',
      'INVITATION_REVOKED', 'DUE_CREATED', 'PAYMENT_CONFIRMED',
      'RECEIPT_AVAILABLE', 'VEHICLE_REGISTERED', 'VEHICLE_DEACTIVATED',
      'LEASE_EXPIRY_REMINDER'
    )
  ),
  drop constraint notifications_source_type_check,
  add constraint notifications_source_type_check check (
    source_type in (
      'maintenance_request', 'maintenance_request_update', 'work_order',
      'work_order_update', 'work_order_cost', 'visitor_invitation',
      'access_event', 'due', 'payment', 'vehicle', 'lease_expiry_dispatch'
    )
  );

create or replace function public.notification_feature_enabled(
  p_organization_id uuid,
  p_notification_type text
) returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.organization_is_active(p_organization_id)
    and case
      when p_notification_type = 'LEASE_EXPIRY_REMINDER'
        then public.lease_lifecycle_enabled(p_organization_id)
      else public.unit_experience_enabled(p_organization_id)
    end
$$;

create or replace function public.create_notification_once(
  p_organization_id uuid,
  p_recipient_user_id uuid,
  p_recipient_member_id uuid,
  p_type text,
  p_title_ar text,
  p_title_en text,
  p_body_ar text,
  p_body_en text,
  p_source_type text,
  p_source_id uuid,
  p_action_url text,
  p_priority text default 'NORMAL'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_notification_id uuid;
begin
  if p_recipient_user_id is null then
    return null;
  end if;

  if not public.notification_feature_enabled(p_organization_id, p_type) then
    return null;
  end if;

  if p_recipient_member_id is not null and not exists (
    select 1
    from public.members m
    where m.id = p_recipient_member_id
      and m.organization_id = p_organization_id
      and m.user_id = p_recipient_user_id
  ) then
    raise exception 'INVALID_NOTIFICATION_RECIPIENT' using errcode = '23503';
  end if;

  insert into public.notifications (
    organization_id, recipient_user_id, recipient_member_id, type,
    title_ar, title_en, body_ar, body_en, source_type, source_id,
    action_url, priority
  ) values (
    p_organization_id, p_recipient_user_id, p_recipient_member_id, p_type,
    p_title_ar, p_title_en, p_body_ar, p_body_en, p_source_type, p_source_id,
    p_action_url, coalesce(p_priority, 'NORMAL')
  )
  on conflict (organization_id, recipient_user_id, type, source_type, source_id)
  do update set id = notifications.id
  returning id into v_notification_id;

  return v_notification_id;
end;
$$;

create or replace function public.mark_notification_read(p_notification_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  update public.notifications
  set is_read = true,
      read_at = coalesce(read_at, now())
  where id = p_notification_id
    and recipient_user_id = v_user_id
    and public.notification_feature_enabled(organization_id, type);

  if not found then
    raise exception 'NOTIFICATION_NOT_FOUND' using errcode = 'P0002';
  end if;
end;
$$;

create or replace function public.mark_all_notifications_read()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_count integer;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  update public.notifications
  set is_read = true,
      read_at = coalesce(read_at, now())
  where recipient_user_id = v_user_id
    and is_read = false
    and public.notification_feature_enabled(organization_id, type);

  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

drop policy if exists notifications_select_recipient on public.notifications;
create policy notifications_select_recipient
  on public.notifications
  for select
  to authenticated
  using (
    recipient_user_id = auth.uid()
    and public.notification_feature_enabled(organization_id, type)
  );

create or replace function public.run_lease_expiry_alerts(
  p_as_of_date date default current_date
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_candidate record;
  v_recipient record;
  v_dispatch_id uuid;
  v_candidates integer := 0;
  v_dispatched integer := 0;
  v_idempotent integer := 0;
begin
  if auth.role() is distinct from 'service_role' then
    raise exception 'LEASE_EXPIRY_JOB_FORBIDDEN' using errcode = '42501';
  end if;

  for v_candidate in
    select
      l.id as lease_id,
      l.organization_id,
      l.property_id,
      l.unit_id,
      l.tenant_member_id,
      l.ends_on,
      (l.ends_on - p_as_of_date)::integer as threshold_days
    from public.unit_leases l
    where l.status = 'ACTIVE'
      and l.ends_on is not null
      and (l.ends_on - p_as_of_date) in (90, 60, 30)
      and public.organization_is_active(l.organization_id)
      and public.lease_lifecycle_enabled(l.organization_id)
  loop
    v_candidates := v_candidates + 1;

    for v_recipient in
      select distinct recipients.user_id, recipients.member_id
      from (
        select m.user_id, m.id as member_id
        from public.members m
        where m.id = v_candidate.tenant_member_id
          and m.organization_id = v_candidate.organization_id
          and m.user_id is not null

        union

        select m.user_id, m.id
        from public.unit_ownerships uo
        join public.members m
          on m.id = uo.member_id
         and m.organization_id = uo.organization_id
        where uo.organization_id = v_candidate.organization_id
          and uo.unit_id = v_candidate.unit_id
          and uo.start_date <= p_as_of_date
          and (uo.end_date is null or uo.end_date >= p_as_of_date)
          and m.user_id is not null

        union

        select ura.user_id, null::uuid
        from public.user_role_assignments ura
        join public.organization_memberships om
          on om.user_id = ura.user_id
         and om.organization_id = ura.organization_id
         and om.status = 'active'
        join public.role_permissions rp on rp.role_id = ura.role_id
        join public.permissions p on p.id = rp.permission_id
        where ura.organization_id = v_candidate.organization_id
          and p.key in ('property.lease_renewals.view', 'property.lease_renewals.manage')
          and (ura.property_id is null or ura.property_id = v_candidate.property_id)
      ) recipients
      where recipients.user_id is not null
    loop
      v_dispatch_id := null;
      insert into public.lease_expiry_dispatches (
        organization_id, lease_id, lease_ends_on, threshold_days,
        recipient_user_id, recipient_member_id
      ) values (
        v_candidate.organization_id, v_candidate.lease_id, v_candidate.ends_on,
        v_candidate.threshold_days, v_recipient.user_id, v_recipient.member_id
      )
      on conflict (lease_id, lease_ends_on, threshold_days, recipient_user_id) do nothing
      returning id into v_dispatch_id;

      if v_dispatch_id is null then
        v_idempotent := v_idempotent + 1;
        continue;
      end if;

      perform public.create_notification_once(
        v_candidate.organization_id,
        v_recipient.user_id,
        v_recipient.member_id,
        'LEASE_EXPIRY_REMINDER',
        'تنبيه بانتهاء عقد الإيجار',
        'Lease expiry reminder',
        'ينتهي عقد الإيجار خلال ' || v_candidate.threshold_days::text || ' يومًا في ' || v_candidate.ends_on::text || '.',
        'The lease expires in ' || v_candidate.threshold_days::text || ' days on ' || v_candidate.ends_on::text || '.',
        'lease_expiry_dispatch',
        v_dispatch_id,
        null,
        case when v_candidate.threshold_days = 30 then 'HIGH' else 'NORMAL' end
      );
      v_dispatched := v_dispatched + 1;
    end loop;
  end loop;

  return jsonb_build_object(
    'candidates', v_candidates,
    'dispatched', v_dispatched,
    'idempotent', v_idempotent
  );
end;
$$;

revoke all on function public.notification_feature_enabled(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.run_lease_expiry_alerts(date) from public, anon, authenticated, service_role;
grant execute on function public.notification_feature_enabled(uuid, text) to authenticated, service_role;
grant execute on function public.run_lease_expiry_alerts(date) to service_role;
