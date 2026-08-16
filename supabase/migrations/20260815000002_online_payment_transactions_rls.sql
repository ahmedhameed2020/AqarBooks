-- Owner-portal RLS for the Phase 3 transaction tables. Mirrors the
-- current_member_id() + organization_is_active() pattern from Task 10
-- (20260814000007_member_portal_data_rls.sql). No owner-facing UPDATE
-- policy exists on either table -- Phase 4's webhook handler updates these
-- rows via the service-role client (bypasses RLS after signature
-- verification), not as the owner's own session. An owner can create
-- (insert) their own PENDING transaction and read it back, but can never
-- update it directly -- every status change is server-controlled.

drop policy if exists "online_payment_transactions_select_own" on public.online_payment_transactions;
create policy "online_payment_transactions_select_own"
  on public.online_payment_transactions for select
  using (
    member_id = public.current_member_id()
    and public.organization_is_active(organization_id)
  );

drop policy if exists "online_payment_transactions_insert_own" on public.online_payment_transactions;
create policy "online_payment_transactions_insert_own"
  on public.online_payment_transactions for insert
  with check (
    member_id = public.current_member_id()
    and public.organization_is_active(organization_id)
  );

drop policy if exists "online_payment_transaction_allocations_select_own" on public.online_payment_transaction_allocations;
create policy "online_payment_transaction_allocations_select_own"
  on public.online_payment_transaction_allocations for select
  using (
    transaction_id in (
      select id from public.online_payment_transactions
      where member_id = public.current_member_id()
        and public.organization_is_active(organization_id)
    )
  );

drop policy if exists "online_payment_transaction_allocations_insert_own" on public.online_payment_transaction_allocations;
create policy "online_payment_transaction_allocations_insert_own"
  on public.online_payment_transaction_allocations for insert
  with check (
    transaction_id in (
      select id from public.online_payment_transactions
      where member_id = public.current_member_id()
        and public.organization_is_active(organization_id)
    )
  );
