-- Same class of gap as 20260812000009 (dues/due_schedules/due_generation_runs):
-- payments and payment_allocations SELECT only ever required organization
-- membership, even though finance.payments.read exists specifically for
-- this. Requires 20260812000011_backfill_finance_permissions_for_roles.sql
-- to already be applied -- otherwise CASHIER/FINANCE_MANAGER/ACCOUNTANT
-- would lose read access here too.
--
-- Writes are untouched: payments/payment_allocations have never had an
-- INSERT/UPDATE/DELETE RLS policy (generated types already mark them
-- Insert: never / Update: never) -- record_payment is SECURITY DEFINER and
-- bypasses RLS entirely, so this migration only tightens the read side.

drop policy if exists "payments_select_member" on public.payments;
create policy "payments_select_permission"
  on public.payments for select
  using (public.has_permission(auth.uid(), organization_id, 'finance.payments.read'));

drop policy if exists "payment_allocations_select_member" on public.payment_allocations;
create policy "payment_allocations_select_permission"
  on public.payment_allocations for select
  using (
    exists (
      select 1 from public.payments p
      where p.id = payment_id
        and public.has_permission(auth.uid(), p.organization_id, 'finance.payments.read')
    )
  );
