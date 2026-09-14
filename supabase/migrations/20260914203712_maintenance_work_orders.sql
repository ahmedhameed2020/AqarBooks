begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'maintenance_requests_org_id_unique'
  ) then
    alter table public.maintenance_requests
      add constraint maintenance_requests_org_id_unique unique (organization_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'properties_org_id_unique'
  ) then
    alter table public.properties
      add constraint properties_org_id_unique unique (organization_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'units_org_property_id_unique'
  ) then
    alter table public.units
      add constraint units_org_property_id_unique unique (organization_id, property_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'suppliers_org_id_unique'
  ) then
    alter table public.suppliers
      add constraint suppliers_org_id_unique unique (organization_id, id);
  end if;
end $$;

create table if not exists public.work_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  unit_id uuid not null,
  maintenance_request_id uuid not null,
  work_order_no text not null,
  status text not null default 'DRAFT',
  assigned_user_id uuid null references auth.users(id),
  supplier_id uuid null,
  scheduled_start_at timestamptz null,
  scheduled_end_at timestamptz null,
  sla_due_at timestamptz null,
  started_at timestamptz null,
  waiting_at timestamptz null,
  resumed_at timestamptz null,
  completed_at timestamptz null,
  cancelled_at timestamptz null,
  completion_summary text null,
  member_visible_summary text null,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint work_orders_status_check check (status in ('DRAFT', 'ASSIGNED', 'SCHEDULED', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED')),
  constraint work_orders_assignment_mode_check check (num_nonnulls(assigned_user_id, supplier_id) <= 1),
  constraint work_orders_assignment_required_after_draft check (
    status in ('DRAFT', 'CANCELLED') or num_nonnulls(assigned_user_id, supplier_id) = 1
  ),
  constraint work_orders_schedule_pair_check check (
    (scheduled_start_at is null and scheduled_end_at is null)
    or (scheduled_start_at is not null and scheduled_end_at is not null and scheduled_end_at > scheduled_start_at)
  ),
  constraint work_orders_completion_summary_check check (
    status <> 'COMPLETED'
    or (completion_summary is not null and btrim(completion_summary) <> '')
  ),
  constraint work_orders_completed_timestamp_check check ((status = 'COMPLETED') = (completed_at is not null)),
  constraint work_orders_cancelled_timestamp_check check ((status = 'CANCELLED') = (cancelled_at is not null)),
  constraint work_orders_work_order_no_not_blank check (btrim(work_order_no) <> ''),
  constraint work_orders_completion_summary_length check (completion_summary is null or char_length(completion_summary) <= 4000),
  constraint work_orders_member_visible_summary_length check (member_visible_summary is null or char_length(member_visible_summary) <= 4000),
  constraint work_orders_org_request_fkey foreign key (organization_id, maintenance_request_id)
    references public.maintenance_requests (organization_id, id) on delete cascade,
  constraint work_orders_org_property_fkey foreign key (organization_id, property_id)
    references public.properties (organization_id, id),
  constraint work_orders_org_supplier_fkey foreign key (organization_id, supplier_id)
    references public.suppliers (organization_id, id),
  constraint work_orders_org_id_unique unique (organization_id, id),
  constraint work_orders_no_unique unique (organization_id, work_order_no)
);

create table if not exists public.work_order_updates (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  work_order_id uuid not null,
  actor_user_id uuid not null references auth.users(id),
  previous_status text null,
  resulting_status text null,
  note text not null,
  visibility text not null default 'STAFF_ONLY',
  created_at timestamptz not null default now(),
  constraint work_order_updates_status_check check (
    previous_status is null or previous_status in ('DRAFT', 'ASSIGNED', 'SCHEDULED', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED')
  ),
  constraint work_order_updates_resulting_status_check check (
    resulting_status is null or resulting_status in ('DRAFT', 'ASSIGNED', 'SCHEDULED', 'IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED')
  ),
  constraint work_order_updates_visibility_check check (visibility in ('STAFF_ONLY', 'MEMBER_VISIBLE')),
  constraint work_order_updates_note_not_blank check (btrim(note) <> ''),
  constraint work_order_updates_note_length check (char_length(note) <= 4000),
  constraint work_order_updates_org_order_fkey foreign key (organization_id, work_order_id)
    references public.work_orders (organization_id, id) on delete cascade
);

create index if not exists idx_work_orders_org_status_created
  on public.work_orders (organization_id, status, created_at desc);
create index if not exists idx_work_orders_request
  on public.work_orders (organization_id, maintenance_request_id);
create index if not exists idx_work_orders_assigned_user
  on public.work_orders (organization_id, assigned_user_id)
  where assigned_user_id is not null;
create index if not exists idx_work_orders_supplier
  on public.work_orders (organization_id, supplier_id)
  where supplier_id is not null;
create index if not exists idx_work_orders_schedule
  on public.work_orders (organization_id, scheduled_start_at)
  where scheduled_start_at is not null;
create index if not exists idx_work_orders_sla_open
  on public.work_orders (organization_id, sla_due_at)
  where sla_due_at is not null and status not in ('COMPLETED', 'CANCELLED');
create index if not exists idx_work_order_updates_order_created
  on public.work_order_updates (organization_id, work_order_id, created_at desc);

create or replace function public.work_order_staff_can_read(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), p_organization_id, 'operations.work_orders.view')
      or public.has_permission(auth.uid(), p_organization_id, 'operations.work_orders.manage')
      or public.has_permission(auth.uid(), p_organization_id, 'operations.work_orders.assign')
      or public.has_permission(auth.uid(), p_organization_id, 'operations.work_orders.complete')
      or public.has_permission(auth.uid(), p_organization_id, 'operations.maintenance.manage');
$$;

create or replace function public.work_order_staff_can_manage(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), p_organization_id, 'operations.work_orders.manage');
$$;

create or replace function public.work_order_staff_can_assign(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), p_organization_id, 'operations.work_orders.assign')
      or public.has_permission(auth.uid(), p_organization_id, 'operations.work_orders.manage');
$$;

create or replace function public.work_order_staff_can_complete(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), p_organization_id, 'operations.work_orders.complete')
      or public.has_permission(auth.uid(), p_organization_id, 'operations.work_orders.manage');
$$;

create or replace function public.work_order_member_can_read(p_work_order public.work_orders)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.maintenance_requests mr
    where mr.id = p_work_order.maintenance_request_id
      and mr.organization_id = p_work_order.organization_id
      and mr.requester_member_id = public.current_member_id()
      and public.is_current_member_unit_owner(public.current_member_id(), mr.organization_id, mr.unit_id)
      and public.organization_is_active(mr.organization_id)
      and public.maintenance_module_enabled(mr.organization_id)
  );
$$;

create or replace function public.work_order_sla_breached(p_work_order public.work_orders)
returns boolean
language sql
stable
set search_path = public
as $$
  select p_work_order.sla_due_at is not null
    and now() > p_work_order.sla_due_at
    and p_work_order.status not in ('COMPLETED', 'CANCELLED');
$$;

create or replace function public.assert_work_order_status_transition(
  p_previous_status text,
  p_next_status text
) returns void
language plpgsql
stable
set search_path = public
as $$
begin
  if p_previous_status = p_next_status then
    return;
  end if;

  if (p_previous_status = 'DRAFT' and p_next_status = 'ASSIGNED')
    or (p_previous_status = 'ASSIGNED' and p_next_status in ('SCHEDULED', 'IN_PROGRESS'))
    or (p_previous_status = 'SCHEDULED' and p_next_status = 'IN_PROGRESS')
    or (p_previous_status = 'IN_PROGRESS' and p_next_status in ('WAITING', 'COMPLETED'))
    or (p_previous_status = 'WAITING' and p_next_status = 'IN_PROGRESS')
    or (p_previous_status in ('DRAFT', 'ASSIGNED', 'SCHEDULED') and p_next_status = 'CANCELLED')
  then
    return;
  end if;

  raise exception 'INVALID_WORK_ORDER_TRANSITION' using errcode = '22023';
end;
$$;

create or replace function public.validate_work_order_assignee(
  p_organization_id uuid,
  p_assigned_user_id uuid,
  p_supplier_id uuid
) returns void
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if num_nonnulls(p_assigned_user_id, p_supplier_id) > 1 then
    raise exception 'INVALID_WORK_ORDER_ASSIGNEE' using errcode = '22023';
  end if;

  if p_assigned_user_id is not null and not exists (
    select 1
    from public.organization_memberships om
    where om.organization_id = p_organization_id
      and om.user_id = p_assigned_user_id
      and om.status = 'active'
  ) then
    raise exception 'INVALID_WORK_ORDER_ASSIGNEE' using errcode = '22023';
  end if;

  if p_supplier_id is not null and not exists (
    select 1
    from public.suppliers s
    where s.organization_id = p_organization_id
      and s.id = p_supplier_id
      and s.is_active = true
  ) then
    raise exception 'INVALID_WORK_ORDER_SUPPLIER' using errcode = '22023';
  end if;
end;
$$;

create or replace function public.insert_work_order_update(
  p_work_order public.work_orders,
  p_actor_user_id uuid,
  p_previous_status text,
  p_resulting_status text,
  p_note text,
  p_visibility text
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_note text := coalesce(nullif(btrim(p_note), ''), 'Work order updated.');
  v_visibility text := coalesce(nullif(btrim(p_visibility), ''), 'STAFF_ONLY');
begin
  if v_visibility not in ('STAFF_ONLY', 'MEMBER_VISIBLE') then
    raise exception 'INVALID_VISIBILITY' using errcode = '22023';
  end if;

  if char_length(v_note) > 4000 then
    raise exception 'INVALID_NOTE' using errcode = '22023';
  end if;

  insert into public.work_order_updates (
    organization_id,
    work_order_id,
    actor_user_id,
    previous_status,
    resulting_status,
    note,
    visibility
  ) values (
    p_work_order.organization_id,
    p_work_order.id,
    p_actor_user_id,
    p_previous_status,
    p_resulting_status,
    v_note,
    v_visibility
  );
end;
$$;

create or replace function public.audit_work_order_action(
  p_work_order public.work_orders,
  p_actor_user_id uuid,
  p_action text,
  p_summary jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.platform_audit_logs (
    actor_id,
    organization_id,
    property_id,
    action,
    entity_type,
    entity_id,
    safe_change_summary
  ) values (
    p_actor_user_id,
    p_work_order.organization_id,
    p_work_order.property_id,
    p_action,
    'work_order',
    p_work_order.id,
    coalesce(p_summary, '{}'::jsonb)
  );
end;
$$;

create or replace function public.create_work_order(
  p_maintenance_request_id uuid,
  p_assigned_user_id uuid default null,
  p_supplier_id uuid default null,
  p_scheduled_start_at timestamptz default null,
  p_scheduled_end_at timestamptz default null,
  p_sla_due_at timestamptz default null,
  p_note text default null,
  p_visibility text default 'STAFF_ONLY'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_request public.maintenance_requests;
  v_work_order public.work_orders;
  v_final_status text := 'DRAFT';
  v_work_order_no text;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_request
  from public.maintenance_requests
  where id = p_maintenance_request_id
  for update;

  if v_request.id is null then
    raise exception 'REQUEST_NOT_FOUND' using errcode = '22023';
  end if;

  if not public.organization_is_active(v_request.organization_id) then
    raise exception 'ORGANIZATION_INACTIVE' using errcode = '42501';
  end if;

  if not public.maintenance_module_enabled(v_request.organization_id) then
    raise exception 'MAINTENANCE_NOT_ENTITLED' using errcode = '42501';
  end if;

  if not public.work_order_staff_can_manage(v_request.organization_id) then
    raise exception 'FORBIDDEN_WORK_ORDER_MANAGE' using errcode = '42501';
  end if;

  if v_request.status in ('CANCELLED', 'CLOSED') then
    raise exception 'REQUEST_NOT_ACCEPTING_WORK_ORDERS' using errcode = '22023';
  end if;

  perform public.validate_work_order_assignee(v_request.organization_id, p_assigned_user_id, p_supplier_id);

  if (p_scheduled_start_at is null) <> (p_scheduled_end_at is null) then
    raise exception 'INVALID_WORK_ORDER_SCHEDULE' using errcode = '22023';
  end if;

  if p_scheduled_start_at is not null and p_scheduled_end_at <= p_scheduled_start_at then
    raise exception 'INVALID_WORK_ORDER_SCHEDULE' using errcode = '22023';
  end if;

  if p_scheduled_start_at is not null and num_nonnulls(p_assigned_user_id, p_supplier_id) = 0 then
    raise exception 'WORK_ORDER_ASSIGNEE_REQUIRED' using errcode = '22023';
  end if;

  if num_nonnulls(p_assigned_user_id, p_supplier_id) = 1 then
    v_final_status := case when p_scheduled_start_at is not null then 'SCHEDULED' else 'ASSIGNED' end;
  end if;

  insert into public.work_orders (
    organization_id,
    property_id,
    unit_id,
    maintenance_request_id,
    work_order_no,
    status,
    assigned_user_id,
    supplier_id,
    scheduled_start_at,
    scheduled_end_at,
    sla_due_at,
    created_by,
    updated_by
  ) values (
    v_request.organization_id,
    v_request.property_id,
    v_request.unit_id,
    v_request.id,
    'PENDING',
    'DRAFT',
    p_assigned_user_id,
    p_supplier_id,
    p_scheduled_start_at,
    p_scheduled_end_at,
    p_sla_due_at,
    v_user_id,
    v_user_id
  )
  returning * into v_work_order;

  v_work_order_no := 'WO-' || upper(left(replace(v_work_order.id::text, '-', ''), 10));

  update public.work_orders
  set work_order_no = v_work_order_no
  where id = v_work_order.id
  returning * into v_work_order;

  perform public.insert_work_order_update(
    v_work_order,
    v_user_id,
    null,
    'DRAFT',
    coalesce(p_note, 'Work order created.'),
    p_visibility
  );

  if v_final_status in ('ASSIGNED', 'SCHEDULED') then
    perform public.assert_work_order_status_transition('DRAFT', 'ASSIGNED');

    update public.work_orders
    set status = 'ASSIGNED',
        updated_at = now(),
        updated_by = v_user_id
    where id = v_work_order.id
    returning * into v_work_order;

    perform public.insert_work_order_update(
      v_work_order,
      v_user_id,
      'DRAFT',
      'ASSIGNED',
      'Work order assigned.',
      'STAFF_ONLY'
    );
  end if;

  if v_final_status = 'SCHEDULED' then
    perform public.assert_work_order_status_transition('ASSIGNED', 'SCHEDULED');

    update public.work_orders
    set status = 'SCHEDULED',
        updated_at = now(),
        updated_by = v_user_id
    where id = v_work_order.id
    returning * into v_work_order;

    perform public.insert_work_order_update(
      v_work_order,
      v_user_id,
      'ASSIGNED',
      'SCHEDULED',
      'Work order scheduled.',
      'STAFF_ONLY'
    );
  end if;

  if v_request.status = 'SUBMITTED' then
    perform public.assert_maintenance_status_transition(v_request.status, 'TRIAGED', 'STAFF');

    update public.maintenance_requests
    set status = 'TRIAGED',
        triaged_at = coalesce(triaged_at, now()),
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
      'SUBMITTED',
      'TRIAGED',
      'Request triaged for work order planning.',
      'MEMBER_VISIBLE'
    );
  end if;

  perform public.audit_work_order_action(
    v_work_order,
    v_user_id,
    'work_order.created',
    jsonb_build_object(
      'work_order_no', v_work_order_no,
      'maintenance_request_id', v_request.id,
      'status', v_final_status,
      'assignment_mode', case when p_assigned_user_id is not null then 'INTERNAL' when p_supplier_id is not null then 'SUPPLIER' else 'UNASSIGNED' end
    )
  );

  return v_work_order.id;
end;
$$;

create or replace function public.assign_work_order(
  p_work_order_id uuid,
  p_assigned_user_id uuid default null,
  p_supplier_id uuid default null,
  p_note text default null,
  p_visibility text default 'STAFF_ONLY'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_work_order public.work_orders;
  v_next_status text;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_work_order
  from public.work_orders
  where id = p_work_order_id
  for update;

  if v_work_order.id is null then
    raise exception 'WORK_ORDER_NOT_FOUND' using errcode = '22023';
  end if;

  if not public.work_order_staff_can_assign(v_work_order.organization_id) then
    raise exception 'FORBIDDEN_WORK_ORDER_ASSIGN' using errcode = '42501';
  end if;

  if not public.organization_is_active(v_work_order.organization_id) or not public.maintenance_module_enabled(v_work_order.organization_id) then
    raise exception 'FORBIDDEN_WORK_ORDER_ASSIGN' using errcode = '42501';
  end if;

  if v_work_order.status in ('COMPLETED', 'CANCELLED', 'IN_PROGRESS', 'WAITING') then
    raise exception 'WORK_ORDER_ASSIGNMENT_LOCKED' using errcode = '22023';
  end if;

  perform public.validate_work_order_assignee(v_work_order.organization_id, p_assigned_user_id, p_supplier_id);

  if num_nonnulls(p_assigned_user_id, p_supplier_id) <> 1 then
    raise exception 'WORK_ORDER_ASSIGNEE_REQUIRED' using errcode = '22023';
  end if;

  v_next_status := case when v_work_order.status = 'DRAFT' then 'ASSIGNED' else v_work_order.status end;
  perform public.assert_work_order_status_transition(v_work_order.status, v_next_status);

  update public.work_orders
  set status = v_next_status,
      assigned_user_id = p_assigned_user_id,
      supplier_id = p_supplier_id,
      updated_at = now(),
      updated_by = v_user_id
  where id = v_work_order.id;

  perform public.insert_work_order_update(v_work_order, v_user_id, case when v_next_status <> v_work_order.status then v_work_order.status else null end, case when v_next_status <> v_work_order.status then v_next_status else null end, coalesce(p_note, 'Work order assignment updated.'), p_visibility);
  perform public.audit_work_order_action(v_work_order, v_user_id, 'work_order.assigned', jsonb_build_object('work_order_no', v_work_order.work_order_no, 'previous_status', v_work_order.status, 'status', v_next_status));
end;
$$;

create or replace function public.schedule_work_order(
  p_work_order_id uuid,
  p_scheduled_start_at timestamptz,
  p_scheduled_end_at timestamptz,
  p_sla_due_at timestamptz default null,
  p_note text default null,
  p_visibility text default 'STAFF_ONLY'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_work_order public.work_orders;
  v_next_status text;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if p_scheduled_start_at is null or p_scheduled_end_at is null or p_scheduled_end_at <= p_scheduled_start_at then
    raise exception 'INVALID_WORK_ORDER_SCHEDULE' using errcode = '22023';
  end if;

  select * into v_work_order
  from public.work_orders
  where id = p_work_order_id
  for update;

  if v_work_order.id is null then
    raise exception 'WORK_ORDER_NOT_FOUND' using errcode = '22023';
  end if;

  if not public.work_order_staff_can_assign(v_work_order.organization_id) then
    raise exception 'FORBIDDEN_WORK_ORDER_SCHEDULE' using errcode = '42501';
  end if;

  if not public.organization_is_active(v_work_order.organization_id) or not public.maintenance_module_enabled(v_work_order.organization_id) then
    raise exception 'FORBIDDEN_WORK_ORDER_SCHEDULE' using errcode = '42501';
  end if;

  if v_work_order.status in ('COMPLETED', 'CANCELLED') then
    raise exception 'WORK_ORDER_SCHEDULE_LOCKED' using errcode = '22023';
  end if;

  if num_nonnulls(v_work_order.assigned_user_id, v_work_order.supplier_id) <> 1 then
    raise exception 'WORK_ORDER_ASSIGNEE_REQUIRED' using errcode = '22023';
  end if;

  v_next_status := case when v_work_order.status = 'ASSIGNED' then 'SCHEDULED' else v_work_order.status end;
  perform public.assert_work_order_status_transition(v_work_order.status, v_next_status);

  update public.work_orders
  set status = v_next_status,
      scheduled_start_at = p_scheduled_start_at,
      scheduled_end_at = p_scheduled_end_at,
      sla_due_at = p_sla_due_at,
      updated_at = now(),
      updated_by = v_user_id
  where id = v_work_order.id;

  perform public.insert_work_order_update(v_work_order, v_user_id, case when v_next_status <> v_work_order.status then v_work_order.status else null end, case when v_next_status <> v_work_order.status then v_next_status else null end, coalesce(p_note, 'Work order schedule updated.'), p_visibility);
  perform public.audit_work_order_action(v_work_order, v_user_id, 'work_order.scheduled', jsonb_build_object('work_order_no', v_work_order.work_order_no, 'previous_status', v_work_order.status, 'status', v_next_status));
end;
$$;

create or replace function public.transition_work_order(
  p_work_order_id uuid,
  p_next_status text,
  p_expected_previous_statuses text[],
  p_note text default null,
  p_visibility text default 'MEMBER_VISIBLE',
  p_completion_summary text default null,
  p_member_visible_summary text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_work_order public.work_orders;
  v_request public.maintenance_requests;
  v_note text := nullif(btrim(p_note), '');
  v_completion_summary text := nullif(btrim(p_completion_summary), '');
  v_member_visible_summary text := nullif(btrim(p_member_visible_summary), '');
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if p_next_status not in ('IN_PROGRESS', 'WAITING', 'COMPLETED', 'CANCELLED') then
    raise exception 'INVALID_WORK_ORDER_STATUS' using errcode = '22023';
  end if;

  select * into v_work_order
  from public.work_orders
  where id = p_work_order_id
  for update;

  if v_work_order.id is null then
    raise exception 'WORK_ORDER_NOT_FOUND' using errcode = '22023';
  end if;

  if p_expected_previous_statuses is not null and not v_work_order.status = any(p_expected_previous_statuses) then
    raise exception 'INVALID_WORK_ORDER_TRANSITION' using errcode = '22023';
  end if;

  if not public.organization_is_active(v_work_order.organization_id) or not public.maintenance_module_enabled(v_work_order.organization_id) then
    raise exception 'FORBIDDEN_WORK_ORDER_TRANSITION' using errcode = '42501';
  end if;

  if p_next_status = 'COMPLETED' then
    if not public.work_order_staff_can_complete(v_work_order.organization_id) then
      raise exception 'FORBIDDEN_WORK_ORDER_COMPLETE' using errcode = '42501';
    end if;
    if v_completion_summary is null then
      raise exception 'COMPLETION_SUMMARY_REQUIRED' using errcode = '22023';
    end if;
  elsif p_next_status = 'CANCELLED' then
    if not public.work_order_staff_can_manage(v_work_order.organization_id) then
      raise exception 'FORBIDDEN_WORK_ORDER_CANCEL' using errcode = '42501';
    end if;
  elsif not public.work_order_staff_can_manage(v_work_order.organization_id) then
    raise exception 'FORBIDDEN_WORK_ORDER_MANAGE' using errcode = '42501';
  end if;

  if char_length(coalesce(v_completion_summary, '')) > 4000 or char_length(coalesce(v_member_visible_summary, '')) > 4000 then
    raise exception 'INVALID_SUMMARY' using errcode = '22023';
  end if;

  perform public.assert_work_order_status_transition(v_work_order.status, p_next_status);

  update public.work_orders
  set status = p_next_status,
      started_at = case when p_next_status = 'IN_PROGRESS' and started_at is null then now() else started_at end,
      waiting_at = case when p_next_status = 'WAITING' then now() else waiting_at end,
      resumed_at = case when p_next_status = 'IN_PROGRESS' and v_work_order.status = 'WAITING' then now() else resumed_at end,
      completed_at = case when p_next_status = 'COMPLETED' then now() else completed_at end,
      cancelled_at = case when p_next_status = 'CANCELLED' then now() else cancelled_at end,
      completion_summary = coalesce(v_completion_summary, completion_summary),
      member_visible_summary = coalesce(v_member_visible_summary, member_visible_summary),
      updated_at = now(),
      updated_by = v_user_id
  where id = v_work_order.id;

  perform public.insert_work_order_update(
    v_work_order,
    v_user_id,
    v_work_order.status,
    p_next_status,
    coalesce(v_note, case p_next_status
      when 'IN_PROGRESS' then 'Work started.'
      when 'WAITING' then 'Work is waiting.'
      when 'COMPLETED' then 'Work completed.'
      when 'CANCELLED' then 'Work order cancelled.'
      else 'Work order updated.'
    end),
    p_visibility
  );

  if p_next_status in ('IN_PROGRESS', 'COMPLETED') then
    select * into v_request
    from public.maintenance_requests
    where id = v_work_order.maintenance_request_id
    for update;

    if p_next_status = 'IN_PROGRESS' and v_request.status = 'TRIAGED' then
      perform public.assert_maintenance_status_transition(v_request.status, 'IN_PROGRESS', 'STAFF');
      update public.maintenance_requests
      set status = 'IN_PROGRESS',
          started_at = coalesce(started_at, now()),
          updated_at = now(),
          updated_by = v_user_id
      where id = v_request.id;

      insert into public.maintenance_request_updates (organization_id, maintenance_request_id, actor_user_id, previous_status, resulting_status, note, visibility)
      values (v_request.organization_id, v_request.id, v_user_id, 'TRIAGED', 'IN_PROGRESS', 'Work order started.', 'MEMBER_VISIBLE');
    elsif p_next_status = 'COMPLETED' and v_request.status in ('TRIAGED', 'IN_PROGRESS') then
      perform public.assert_maintenance_status_transition(v_request.status, 'COMPLETED', 'STAFF');
      update public.maintenance_requests
      set status = 'COMPLETED',
          completed_at = coalesce(completed_at, now()),
          updated_at = now(),
          updated_by = v_user_id
      where id = v_request.id;

      insert into public.maintenance_request_updates (organization_id, maintenance_request_id, actor_user_id, previous_status, resulting_status, note, visibility)
      values (v_request.organization_id, v_request.id, v_user_id, v_request.status, 'COMPLETED', coalesce(v_member_visible_summary, 'Work order completed.'), 'MEMBER_VISIBLE');
    end if;
  end if;

  perform public.audit_work_order_action(
    v_work_order,
    v_user_id,
    case p_next_status
      when 'IN_PROGRESS' then case when v_work_order.status = 'WAITING' then 'work_order.resumed' else 'work_order.started' end
      when 'WAITING' then 'work_order.waiting'
      when 'COMPLETED' then 'work_order.completed'
      when 'CANCELLED' then 'work_order.cancelled'
      else 'work_order.status_changed'
    end,
    jsonb_build_object('work_order_no', v_work_order.work_order_no, 'previous_status', v_work_order.status, 'status', p_next_status)
  );
end;
$$;

create or replace function public.add_work_order_update(
  p_work_order_id uuid,
  p_note text,
  p_visibility text default 'STAFF_ONLY'
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_work_order public.work_orders;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_work_order
  from public.work_orders
  where id = p_work_order_id
  for update;

  if v_work_order.id is null then
    raise exception 'WORK_ORDER_NOT_FOUND' using errcode = '22023';
  end if;

  if not public.work_order_staff_can_manage(v_work_order.organization_id) then
    raise exception 'FORBIDDEN_WORK_ORDER_MANAGE' using errcode = '42501';
  end if;

  if not public.organization_is_active(v_work_order.organization_id) or not public.maintenance_module_enabled(v_work_order.organization_id) then
    raise exception 'FORBIDDEN_WORK_ORDER_MANAGE' using errcode = '42501';
  end if;

  perform public.insert_work_order_update(v_work_order, v_user_id, null, null, p_note, p_visibility);
end;
$$;

create or replace function public.start_work_order(p_work_order_id uuid, p_note text default null, p_visibility text default 'MEMBER_VISIBLE')
returns void
language sql
security definer
set search_path = public
as $$
  select public.transition_work_order(p_work_order_id, 'IN_PROGRESS', array['ASSIGNED', 'SCHEDULED']::text[], p_note, p_visibility, null, null);
$$;

create or replace function public.wait_work_order(p_work_order_id uuid, p_note text default null, p_visibility text default 'MEMBER_VISIBLE')
returns void
language sql
security definer
set search_path = public
as $$
  select public.transition_work_order(p_work_order_id, 'WAITING', array['IN_PROGRESS']::text[], p_note, p_visibility, null, null);
$$;

create or replace function public.resume_work_order(p_work_order_id uuid, p_note text default null, p_visibility text default 'MEMBER_VISIBLE')
returns void
language sql
security definer
set search_path = public
as $$
  select public.transition_work_order(p_work_order_id, 'IN_PROGRESS', array['WAITING']::text[], p_note, p_visibility, null, null);
$$;

create or replace function public.complete_work_order(
  p_work_order_id uuid,
  p_completion_summary text,
  p_member_visible_summary text default null,
  p_note text default null,
  p_visibility text default 'MEMBER_VISIBLE'
) returns void
language sql
security definer
set search_path = public
as $$
  select public.transition_work_order(p_work_order_id, 'COMPLETED', array['IN_PROGRESS']::text[], p_note, p_visibility, p_completion_summary, p_member_visible_summary);
$$;

create or replace function public.cancel_work_order(p_work_order_id uuid, p_note text default null, p_visibility text default 'MEMBER_VISIBLE')
returns void
language sql
security definer
set search_path = public
as $$
  select public.transition_work_order(p_work_order_id, 'CANCELLED', array['DRAFT', 'ASSIGNED', 'SCHEDULED']::text[], p_note, p_visibility, null, null);
$$;

alter table public.work_orders enable row level security;
alter table public.work_order_updates enable row level security;

create policy work_orders_select_staff_or_owner
  on public.work_orders
  for select
  to authenticated
  using (
    public.organization_is_active(organization_id)
    and public.maintenance_module_enabled(organization_id)
    and (
      public.work_order_staff_can_read(organization_id)
      or public.work_order_member_can_read(work_orders)
    )
  );

create policy work_order_updates_select_staff_or_owner_visible
  on public.work_order_updates
  for select
  to authenticated
  using (
    public.organization_is_active(organization_id)
    and public.maintenance_module_enabled(organization_id)
    and (
      public.work_order_staff_can_read(organization_id)
      or (
        visibility = 'MEMBER_VISIBLE'
        and exists (
          select 1
          from public.work_orders wo
          where wo.id = work_order_updates.work_order_id
            and wo.organization_id = work_order_updates.organization_id
            and public.work_order_member_can_read(wo)
        )
      )
    )
  );

insert into public.permissions (id, key, description)
values
  ('ec42e51a-3555-4025-8c95-cc749ef6c7a1', 'operations.work_orders.view', 'View organization-scoped maintenance work orders'),
  ('9104211a-98f6-4baf-8f5a-c2c4396f823f', 'operations.work_orders.manage', 'Create and manage organization-scoped maintenance work orders'),
  ('88d9dfd1-92a7-4d85-bd88-fd4bb202909d', 'operations.work_orders.assign', 'Assign and schedule organization-scoped maintenance work orders'),
  ('1ae6d262-9b85-4833-8078-0f61d738839e', 'operations.work_orders.complete', 'Complete organization-scoped maintenance work orders')
on conflict (key) do nothing;

insert into public.role_template_permissions (role_template_key, permission_key)
values
  ('TENANT_OWNER', 'operations.work_orders.view'),
  ('TENANT_OWNER', 'operations.work_orders.manage'),
  ('TENANT_OWNER', 'operations.work_orders.assign'),
  ('TENANT_OWNER', 'operations.work_orders.complete'),
  ('TENANT_ADMIN', 'operations.work_orders.view'),
  ('TENANT_ADMIN', 'operations.work_orders.manage'),
  ('TENANT_ADMIN', 'operations.work_orders.assign'),
  ('TENANT_ADMIN', 'operations.work_orders.complete'),
  ('GENERAL_MANAGER', 'operations.work_orders.view'),
  ('GENERAL_MANAGER', 'operations.work_orders.manage'),
  ('GENERAL_MANAGER', 'operations.work_orders.assign'),
  ('GENERAL_MANAGER', 'operations.work_orders.complete'),
  ('PROPERTY_MANAGER', 'operations.work_orders.view'),
  ('PROPERTY_MANAGER', 'operations.work_orders.manage'),
  ('PROPERTY_MANAGER', 'operations.work_orders.assign'),
  ('PROPERTY_MANAGER', 'operations.work_orders.complete'),
  ('VIEWER', 'operations.work_orders.view')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'operations.work_orders.view',
  'operations.work_orders.manage',
  'operations.work_orders.assign',
  'operations.work_orders.complete'
)
where r.key in ('TENANT_OWNER', 'TENANT_ADMIN', 'GENERAL_MANAGER', 'PROPERTY_MANAGER')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'operations.work_orders.view'
where r.key = 'VIEWER'
on conflict do nothing;

revoke all privileges on table public.work_orders from public, anon, authenticated;
revoke all privileges on table public.work_order_updates from public, anon, authenticated;
grant select on table public.work_orders to authenticated;
grant select on table public.work_order_updates to authenticated;
grant all privileges on table public.work_orders to service_role;
grant all privileges on table public.work_order_updates to service_role;

revoke all on function public.work_order_staff_can_read(uuid) from public, anon, authenticated, service_role;
revoke all on function public.work_order_staff_can_manage(uuid) from public, anon, authenticated, service_role;
revoke all on function public.work_order_staff_can_assign(uuid) from public, anon, authenticated, service_role;
revoke all on function public.work_order_staff_can_complete(uuid) from public, anon, authenticated, service_role;
revoke all on function public.work_order_member_can_read(public.work_orders) from public, anon, authenticated, service_role;
revoke all on function public.work_order_sla_breached(public.work_orders) from public, anon, authenticated, service_role;
revoke all on function public.assert_work_order_status_transition(text, text) from public, anon, authenticated, service_role;
revoke all on function public.validate_work_order_assignee(uuid, uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.insert_work_order_update(public.work_orders, uuid, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.audit_work_order_action(public.work_orders, uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.create_work_order(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, text, text) from public, anon, authenticated, service_role;
revoke all on function public.assign_work_order(uuid, uuid, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.schedule_work_order(uuid, timestamptz, timestamptz, timestamptz, text, text) from public, anon, authenticated, service_role;
revoke all on function public.transition_work_order(uuid, text, text[], text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.add_work_order_update(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.start_work_order(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.wait_work_order(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.resume_work_order(uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.complete_work_order(uuid, text, text, text, text) from public, anon, authenticated, service_role;
revoke all on function public.cancel_work_order(uuid, text, text) from public, anon, authenticated, service_role;

grant execute on function public.work_order_staff_can_read(uuid) to authenticated, service_role;
grant execute on function public.work_order_staff_can_manage(uuid) to authenticated, service_role;
grant execute on function public.work_order_staff_can_assign(uuid) to authenticated, service_role;
grant execute on function public.work_order_staff_can_complete(uuid) to authenticated, service_role;
grant execute on function public.work_order_member_can_read(public.work_orders) to authenticated, service_role;
grant execute on function public.work_order_sla_breached(public.work_orders) to authenticated, service_role;
grant execute on function public.create_work_order(uuid, uuid, uuid, timestamptz, timestamptz, timestamptz, text, text) to authenticated;
grant execute on function public.assign_work_order(uuid, uuid, uuid, text, text) to authenticated;
grant execute on function public.schedule_work_order(uuid, timestamptz, timestamptz, timestamptz, text, text) to authenticated;
grant execute on function public.add_work_order_update(uuid, text, text) to authenticated;
grant execute on function public.start_work_order(uuid, text, text) to authenticated;
grant execute on function public.wait_work_order(uuid, text, text) to authenticated;
grant execute on function public.resume_work_order(uuid, text, text) to authenticated;
grant execute on function public.complete_work_order(uuid, text, text, text, text) to authenticated;
grant execute on function public.cancel_work_order(uuid, text, text) to authenticated;

commit;
