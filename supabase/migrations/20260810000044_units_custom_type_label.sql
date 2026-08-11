-- Adds a free-text label for units whose unit_type is 'OTHER', so "Other"
-- isn't a dead end in the UI (e.g. "كشك حراسة" / "Guard kiosk"). Nullable
-- and not constrained to unit_type = 'OTHER' at the DB level -- the create
-- unit form enforces "required when Other is selected" client + server
-- side; a DB check here would risk breaking on data written before this
-- column existed.

alter table public.units add column custom_type_label text;

-- CREATE OR REPLACE VIEW only allows appending columns at the end (Postgres
-- rejects reordering/removing), so custom_type_label is added last rather
-- than grouped next to unit_type.
create or replace view public.units_with_financials
with (security_invoker = true) as
with due_totals as (
  select
    d.unit_id,
    sum(d.amount) as total_due
  from public.dues d
  where d.status <> 'VOID'
  group by d.unit_id
),
paid_totals as (
  select
    d.unit_id,
    sum(pa.amount) as total_paid
  from public.payment_allocations pa
  join public.payments p on p.id = pa.payment_id
  join public.dues d on d.id = pa.due_id
  where p.status = 'POSTED'
  group by d.unit_id
),
current_owner as (
  select distinct on (uo.unit_id)
    uo.unit_id,
    uo.member_id as owner_id,
    m.full_name as owner_name
  from public.unit_ownerships uo
  join public.members m on m.id = uo.member_id
  where uo.end_date is null or uo.end_date >= current_date
  order by uo.unit_id, uo.is_primary_contact desc, uo.share_percentage desc, uo.start_date desc
)
select
  u.id,
  u.organization_id,
  u.resort_id,
  u.building_id,
  u.zone_id,
  u.code,
  u.unit_type,
  u.floor_number,
  u.area,
  u.is_active,
  b.name_ar as building_name_ar,
  b.name_en as building_name_en,
  z.name_ar as zone_name_ar,
  z.name_en as zone_name_en,
  co.owner_id,
  co.owner_name,
  case when co.owner_id is not null then 'OCCUPIED' else 'VACANT' end as occupancy_status,
  coalesce(dt.total_due, 0)::numeric(19, 4) as total_due,
  coalesce(pt.total_paid, 0)::numeric(19, 4) as total_paid,
  (coalesce(dt.total_due, 0) - coalesce(pt.total_paid, 0))::numeric(19, 4) as balance,
  (coalesce(dt.total_due, 0) - coalesce(pt.total_paid, 0)) > 0 as has_arrears,
  u.custom_type_label
from public.units u
left join public.buildings b on b.id = u.building_id
left join public.zones z on z.id = u.zone_id
left join due_totals dt on dt.unit_id = u.id
left join paid_totals pt on pt.unit_id = u.id
left join current_owner co on co.unit_id = u.id;
