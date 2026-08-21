-- Unit handover: the moment a finished unit passes to its owner or tenant.
--
-- HANDOVER POSTS NOTHING TO THE LEDGER, deliberately. No cash moves and no
-- obligation is created by the act of handing over keys, so inventing a journal
-- entry here would be fabricating accounting. What handover actually does is
-- act as a GATE: a developer must not bill service charges on a unit still
-- under construction, because its owner is not yet benefiting from the common
-- areas they would be paying to maintain. That gate is the real accounting
-- connection, and it is wired into the service charge allocation below.
--
-- A handover without a snag list is just a date field. The defect list is what
-- makes this a workflow rather than a checkbox -- and a BLOCKING defect
-- prevents completion outright, because signing off a handover while the unit
-- still has an unresolved blocking fault is precisely the dispute this record
-- exists to prevent.

alter table public.units
  add column if not exists handed_over_at date;

comment on column public.units.handed_over_at is
  'Date the unit was actually handed over. NULL means still with the developer. Service charge levies may be restricted to handed-over units only.';

create table public.unit_handovers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  -- One handover per unit: a unit is handed over once. A re-delivery after a
  -- tenant leaves is a different concept and does not belong here.
  unit_id uuid not null references public.units (id) on delete cascade unique,
  handed_to_member_id uuid references public.members (id) on delete set null,
  status text not null default 'SCHEDULED'
    check (status in ('SCHEDULED', 'COMPLETED', 'CANCELLED')),
  scheduled_date date,
  completed_date date,
  -- Utility readings at the moment of transfer: the practical evidence for who
  -- owes which consumption either side of the line.
  electricity_reading numeric(14, 3),
  water_reading numeric(14, 3),
  gas_reading numeric(14, 3),
  note text,
  completed_by uuid references auth.users (id),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint unit_handovers_completed_has_date check (
    status <> 'COMPLETED' or completed_date is not null
  )
);

create index idx_unit_handovers_org_status on public.unit_handovers (organization_id, status);

create trigger trg_unit_handovers_updated_at
  before update on public.unit_handovers
  for each row execute function public.set_updated_at();

create table public.unit_handover_snags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  handover_id uuid not null references public.unit_handovers (id) on delete cascade,
  description text not null check (btrim(description) <> ''),
  -- BLOCKING stops completion; MINOR is recorded and handed over anyway, which
  -- is how snagging actually works on site.
  severity text not null default 'MINOR' check (severity in ('BLOCKING', 'MINOR')),
  status text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED')),
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index idx_unit_handover_snags_handover on public.unit_handover_snags (handover_id, status);

alter table public.unit_handovers enable row level security;
alter table public.unit_handover_snags enable row level security;

insert into public.permissions (key, description) values
  ('property.handover.read', 'الاطلاع على تسليم الوحدات وقوائم الملاحظات'),
  ('property.handover.manage', 'جدولة تسليم الوحدات وتسجيل الملاحظات واعتماد التسليم')
on conflict do nothing;

create policy "unit_handovers_select"
  on public.unit_handovers for select
  using (
    public.has_permission(auth.uid(), organization_id, 'property.handover.read')
    or public.has_permission(auth.uid(), organization_id, 'property.handover.manage')
  );

create policy "unit_handover_snags_select"
  on public.unit_handover_snags for select
  using (
    public.has_permission(auth.uid(), organization_id, 'property.handover.read')
    or public.has_permission(auth.uid(), organization_id, 'property.handover.manage')
  );

-- Snags are editable directly while the handover is still open; completion
-- itself goes through the RPC so its guard cannot be bypassed.
create policy "unit_handover_snags_manage"
  on public.unit_handover_snags for all
  using (
    public.has_permission(auth.uid(), organization_id, 'property.handover.manage')
    and public.organization_is_active(organization_id)
    and exists (
      select 1 from public.unit_handovers h
      where h.id = handover_id and h.status = 'SCHEDULED'
    )
  )
  with check (
    public.has_permission(auth.uid(), organization_id, 'property.handover.manage')
    and public.organization_is_active(organization_id)
    and exists (
      select 1 from public.unit_handovers h
      where h.id = handover_id and h.status = 'SCHEDULED'
    )
  );

insert into public.role_template_permissions (role_template_key, permission_key)
values
  ('TENANT_OWNER', 'property.handover.read'),
  ('TENANT_OWNER', 'property.handover.manage'),
  ('PROPERTY_MANAGER', 'property.handover.read'),
  ('PROPERTY_MANAGER', 'property.handover.manage'),
  ('GENERAL_MANAGER', 'property.handover.read'),
  ('AUDITOR', 'property.handover.read')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.role_template_permissions rtp on rtp.role_template_key = r.key
join public.permissions p on p.key = rtp.permission_key
where r.organization_id is not null
  and rtp.permission_key in ('property.handover.read', 'property.handover.manage')
on conflict do nothing;

create or replace function public.schedule_unit_handover(
  p_unit_id uuid,
  p_scheduled_date date,
  p_handed_to_member_id uuid default null,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_unit record;
  v_id uuid;
begin
  select * into v_unit from public.units where id = p_unit_id;
  if v_unit.id is null then
    raise exception 'UNIT_NOT_FOUND: الوحدة غير موجودة' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_unit.organization_id, 'property.handover.manage') then
    raise exception 'FORBIDDEN_PROPERTY_PERMISSION: غير مصرح لك بإدارة تسليم الوحدات' using errcode = '42501';
  end if;
  if not public.organization_is_active(v_unit.organization_id) then
    raise exception 'ORGANIZATION_NOT_ACTIVE: المؤسسة غير نشطة' using errcode = 'P0001';
  end if;

  insert into public.unit_handovers (
    organization_id, property_id, unit_id, handed_to_member_id,
    status, scheduled_date, note, created_by
  ) values (
    v_unit.organization_id, v_unit.property_id, p_unit_id, p_handed_to_member_id,
    'SCHEDULED', p_scheduled_date, p_note, auth.uid()
  )
  on conflict (unit_id) do update
    set scheduled_date = excluded.scheduled_date,
        handed_to_member_id = excluded.handed_to_member_id,
        note = excluded.note
    where public.unit_handovers.status = 'SCHEDULED'
  returning id into v_id;

  if v_id is null then
    raise exception 'HANDOVER_ALREADY_COMPLETED: تم تسليم هذه الوحدة بالفعل' using errcode = 'P0001';
  end if;

  return v_id;
end;
$$;

-- Complete a handover. Refuses while any BLOCKING snag is still open -- the
-- one rule that makes this record worth keeping.
create or replace function public.complete_unit_handover(
  p_handover_id uuid,
  p_completed_date date default current_date,
  p_electricity_reading numeric default null,
  p_water_reading numeric default null,
  p_gas_reading numeric default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_h record;
  v_blocking int;
begin
  select * into v_h from public.unit_handovers where id = p_handover_id for update;
  if v_h.id is null then
    raise exception 'HANDOVER_NOT_FOUND: سجل التسليم غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_h.organization_id, 'property.handover.manage') then
    raise exception 'FORBIDDEN_PROPERTY_PERMISSION: غير مصرح لك باعتماد التسليم' using errcode = '42501';
  end if;

  if v_h.status <> 'SCHEDULED' then
    raise exception 'HANDOVER_NOT_SCHEDULED: لا يمكن اعتماد تسليم غير مجدول' using errcode = 'P0001';
  end if;

  select count(*) into v_blocking
  from public.unit_handover_snags
  where handover_id = p_handover_id and severity = 'BLOCKING' and status = 'OPEN';

  if v_blocking > 0 then
    raise exception
      'HANDOVER_BLOCKED_BY_SNAGS: لا يمكن اعتماد التسليم ولديك % ملاحظة حاسمة غير مغلقة', v_blocking
      using errcode = 'P0001';
  end if;

  update public.unit_handovers
  set status = 'COMPLETED',
      completed_date = p_completed_date,
      completed_by = auth.uid(),
      electricity_reading = coalesce(p_electricity_reading, electricity_reading),
      water_reading = coalesce(p_water_reading, water_reading),
      gas_reading = coalesce(p_gas_reading, gas_reading)
  where id = p_handover_id;

  -- Denormalised onto the unit so the service charge allocation can filter on
  -- it without joining, and so "is this unit ours or the owner's?" is answerable
  -- from the unit row itself.
  update public.units set handed_over_at = p_completed_date where id = v_h.unit_id;

  insert into public.platform_audit_logs (
    actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary
  ) values (
    auth.uid(), v_h.organization_id, v_h.property_id,
    'unit_handover.completed', 'unit_handover', p_handover_id,
    jsonb_build_object('unit_id', v_h.unit_id, 'completed_date', p_completed_date)
  );
end;
$$;

-- Service charge levies may bill only units already handed over. Off by
-- default so existing behaviour is untouched; a developer with a part-delivered
-- phase turns it on so units still under construction are not charged for
-- common areas their owners cannot yet use.
alter table public.service_charge_levies
  add column if not exists handed_over_only boolean not null default false;

comment on column public.service_charge_levies.handed_over_only is
  'When true, only units with units.handed_over_at set participate in the allocation.';

create or replace function public.compute_service_charge_allocations(
  p_levy_id uuid
)
returns table (
  unit_count int,
  allocated_total numeric,
  levy_total numeric
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_levy record;
  v_basis_sum numeric;
  v_missing_area int;
  v_decimals int;
  v_step numeric;
  v_shortfall_units int;
begin
  select * into v_levy from public.service_charge_levies where id = p_levy_id;

  if v_levy.id is null then
    raise exception 'SERVICE_CHARGE_LEVY_NOT_FOUND: تحصيلة رسوم الخدمة غير موجودة' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_levy.organization_id, 'finance.service_charges.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإدارة رسوم الخدمة' using errcode = '42501';
  end if;

  if v_levy.status <> 'DRAFT' then
    raise exception 'SERVICE_CHARGE_LEVY_NOT_DRAFT: لا يمكن إعادة حساب توزيع تحصيلة صادرة' using errcode = 'P0001';
  end if;

  select public.currency_decimals(o.default_currency) into v_decimals
  from public.organizations o where o.id = v_levy.organization_id;
  v_decimals := coalesce(v_decimals, 2);
  v_step := power(10::numeric, -v_decimals);

  insert into public.service_charge_allocations (organization_id, levy_id, unit_id, basis_value)
  select v_levy.organization_id, v_levy.id, u.id,
         case v_levy.allocation_basis
           when 'AREA' then coalesce(u.area, 0)
           when 'EQUAL' then 1
           else coalesce(u.area, 0)
         end
  from public.units u
  where u.organization_id = v_levy.organization_id
    and u.property_id = v_levy.property_id
    and u.is_active
    and (not v_levy.handed_over_only or u.handed_over_at is not null)
  on conflict (levy_id, unit_id) do update
    set basis_value = case v_levy.allocation_basis
                        when 'AREA' then excluded.basis_value
                        when 'EQUAL' then 1
                        else public.service_charge_allocations.basis_value
                      end;

  delete from public.service_charge_allocations a
  where a.levy_id = v_levy.id
    and not exists (
      select 1 from public.units u
      where u.id = a.unit_id and u.is_active and u.property_id = v_levy.property_id
        and (not v_levy.handed_over_only or u.handed_over_at is not null)
    );

  if v_levy.allocation_basis = 'AREA' then
    select count(*) into v_missing_area
    from public.service_charge_allocations a
    join public.units u on u.id = a.unit_id
    where a.levy_id = v_levy.id and coalesce(u.area, 0) <= 0;

    if v_missing_area > 0 then
      raise exception
        'SERVICE_CHARGE_MISSING_AREA: % وحدة بلا مساحة مسجلة؛ سجّل مساحاتها أو استخدم أساس توزيع آخر', v_missing_area
        using errcode = 'P0001';
    end if;
  end if;

  select coalesce(sum(basis_value), 0) into v_basis_sum
  from public.service_charge_allocations where levy_id = v_levy.id;

  if v_basis_sum <= 0 then
    raise exception 'SERVICE_CHARGE_ZERO_BASIS: مجموع أساس التوزيع صفر؛ لا يمكن توزيع المبلغ' using errcode = 'P0001';
  end if;

  with computed as (
    select a.id,
           trunc(v_levy.total_amount * a.basis_value / v_basis_sum, v_decimals) as floor_amt
    from public.service_charge_allocations a
    where a.levy_id = v_levy.id
  )
  update public.service_charge_allocations a
  set share_amount = c.floor_amt
  from computed c
  where a.id = c.id;

  select round((v_levy.total_amount - coalesce(sum(share_amount), 0)) / v_step)::int
  into v_shortfall_units
  from public.service_charge_allocations where levy_id = v_levy.id;

  if v_shortfall_units > 0 then
    with ranked as (
      select a.id,
             row_number() over (
               order by (v_levy.total_amount * a.basis_value / v_basis_sum) - a.share_amount desc,
                        u.code
             ) as rn
      from public.service_charge_allocations a
      join public.units u on u.id = a.unit_id
      where a.levy_id = v_levy.id
    )
    update public.service_charge_allocations a
    set share_amount = a.share_amount + v_step
    from ranked r
    where a.id = r.id and r.rn <= v_shortfall_units;
  end if;

  return query
  select count(*)::int, coalesce(sum(a.share_amount), 0), v_levy.total_amount
  from public.service_charge_allocations a
  where a.levy_id = v_levy.id;
end;
$$;
