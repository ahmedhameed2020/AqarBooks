-- Members list view for /members: reuses units_with_financials (view-on-view)
-- rather than re-deriving the dues/payments aggregation, so a member's
-- total_balance is guaranteed to be computed from the exact same numbers
-- /property already shows -- no risk of the two pages drifting apart.
--
-- security_invoker = true for the same reason as units_with_financials: a
-- view's underlying-table permission checks default to the view OWNER
-- (which bypasses RLS via migrations), not the querying user. This also
-- correctly composes through units_with_financials, since that view is
-- itself security_invoker = true.
--
-- total_balance sums the member's currently-active ownership stakes' unit
-- balances in full (not pro-rated by share_percentage) -- approved
-- decision from the phase-3 review: the due is owed by the unit, and a
-- pro-rated "your share" figure can be added as an extra column later if a
-- real co-ownership case needs it, without changing this one.

create view public.members_with_financials
with (security_invoker = true) as
with active_ownerships as (
  select uo.member_id, uo.unit_id
  from public.unit_ownerships uo
  where uo.end_date is null or uo.end_date >= current_date
),
member_aggregates as (
  select
    ao.member_id,
    count(*) as units_count,
    sum(uwf.balance) as total_balance
  from active_ownerships ao
  join public.units_with_financials uwf on uwf.id = ao.unit_id
  group by ao.member_id
),
last_payment as (
  select distinct on (p.member_id)
    p.member_id,
    p.amount as last_payment_amount,
    p.payment_date as last_payment_date
  from public.payments p
  where p.status = 'POSTED' and p.member_id is not null
  order by p.member_id, p.payment_date desc, p.created_at desc
)
select
  m.id,
  m.organization_id,
  m.full_name,
  m.is_company,
  m.email,
  m.phone,
  coalesce(ma.units_count, 0) as units_count,
  coalesce(ma.total_balance, 0)::numeric(19, 4) as total_balance,
  coalesce(ma.total_balance, 0) > 0 as has_arrears,
  lp.last_payment_amount,
  lp.last_payment_date
from public.members m
left join member_aggregates ma on ma.member_id = m.id
left join last_payment lp on lp.member_id = m.id;
