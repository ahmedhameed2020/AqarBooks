-- Phase 2 Task 10: read RLS for units/dues/payments/payment_allocations,
-- consistent with the Checkpoint 2 decision (20260814000006) that owners of
-- a SUSPENDED or ARCHIVED organization must not retain ANY portal access,
-- not just their own members row.
--
-- Privacy rules:
--  - unit_ownerships: a member sees only their own ownership rows.
--  - units: a member sees a unit only through a CURRENT ownership link
--    (end_date is null or in the future) -- a past owner loses visibility.
--  - dues: visibility goes through the unit-ownership chain. Co-owners of
--    the same unit legitimately share visibility of that unit's dues (a
--    joint obligation), so this intentionally is NOT restricted to the
--    due's own member_id (dues has no member_id column anyway).
--  - payments: visibility does NOT go through the unit chain. One
--    co-owner's payment history must never be exposed to another co-owner
--    of the same unit, so this is gated on payments.member_id directly,
--    restricted to POSTED (REVERSED payments aren't surfaced to owners).
--  - payment_allocations: inherits payments' privacy via payment_id, same
--    POSTED-only restriction.
--
-- organization_id derivation per table (checked against the actual create
-- table statements in 20260810000023_property_tables.sql and
-- 20260810000024_receivables_tables.sql):
--  - unit_ownerships: direct organization_id column.
--  - units: direct organization_id column.
--  - dues: direct organization_id column.
--  - payments: direct organization_id column.
--  - payment_allocations: NO direct organization_id column -- derived via
--    a join back to payments.organization_id.

drop policy if exists "unit_ownerships_select_own" on public.unit_ownerships;
create policy "unit_ownerships_select_own"
  on public.unit_ownerships for select
  using (
    member_id = public.current_member_id()
    and public.organization_is_active(organization_id)
  );

drop policy if exists "units_select_own" on public.units;
create policy "units_select_own"
  on public.units for select
  using (
    public.organization_is_active(organization_id)
    and id in (
      select unit_id from public.unit_ownerships
      where member_id = public.current_member_id()
        and (end_date is null or end_date >= current_date)
    )
  );

drop policy if exists "dues_select_own" on public.dues;
create policy "dues_select_own"
  on public.dues for select
  using (
    public.organization_is_active(organization_id)
    and unit_id in (
      select unit_id from public.unit_ownerships
      where member_id = public.current_member_id()
        and (end_date is null or end_date >= current_date)
    )
  );

drop policy if exists "payments_select_own" on public.payments;
create policy "payments_select_own"
  on public.payments for select
  using (
    member_id = public.current_member_id()
    and status = 'POSTED'
    and public.organization_is_active(organization_id)
  );

drop policy if exists "payment_allocations_select_own" on public.payment_allocations;
create policy "payment_allocations_select_own"
  on public.payment_allocations for select
  using (
    payment_id in (
      select id from public.payments
      where member_id = public.current_member_id()
        and status = 'POSTED'
        and public.organization_is_active(organization_id)
    )
  );

notify pgrst, 'reload schema';
