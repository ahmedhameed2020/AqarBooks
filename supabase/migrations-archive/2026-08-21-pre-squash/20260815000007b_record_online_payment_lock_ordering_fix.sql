-- Phase 4, Task 4 follow-up (code review fix): record_online_payment locked
-- dues rows (its own step-3 validation loop) BEFORE post_payment_internal
-- ever acquired the organization-scoped advisory lock
-- (pg_advisory_xact_lock(hashtext('record_payment_' || organization_id))).
-- record_payment's path always takes that advisory lock first, then locks
-- dues. That ordering mismatch is a real circular-wait: a concurrent
-- record_payment (holding the advisory lock, waiting on a due
-- record_online_payment already locked) and a concurrent
-- record_online_payment (holding that due, now waiting on the advisory lock
-- record_payment holds) form an AB-BA cycle -- Postgres's deadlock detector
-- would catch and abort one of them (40P01), contradicting the design doc's
-- promise that both callers use the same total lock order.
--
-- Fix: acquire the identical advisory lock here too, before locking any
-- dues row, so both record_payment and record_online_payment take the same
-- lock in the same relative order (advisory lock before any dues row lock)
-- for any organization. post_payment_internal's own later acquisition of
-- the same lock key becomes a no-op once this caller already holds it --
-- Postgres advisory xact locks are reentrant within a transaction.
create or replace function public.record_online_payment(
  p_transaction_id uuid,
  p_webhook_event_id text,
  p_provider_payload jsonb default null
)
returns table (
  status text,
  payment_id uuid,
  failure_code text,
  failure_message text
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_txn public.online_payment_transactions;
  v_alloc record;
  v_due public.dues;
  v_paid_so_far numeric(19,4);
  v_result record;
  v_allocations_jsonb jsonb := '[]'::jsonb;
  v_clearing_account_id uuid;
  v_clearing_account public.chart_of_accounts;
  v_fiscal_period_id uuid;
  v_failure_message text;
begin
  select * into v_txn from public.online_payment_transactions
  where id = p_transaction_id for update;

  if v_txn.id is null then
    raise exception 'ONLINE_TXN_NOT_FOUND: transaction % not found', p_transaction_id using errcode = '22023';
  end if;

  if v_txn.status = 'PAID' then
    return query select 'PAID'::text, v_txn.payment_id, null::text, null::text;
    return;
  end if;

  if v_txn.status <> 'PENDING' then
    raise exception 'ONLINE_TXN_NOT_PENDING: cannot post a % transaction', v_txn.status using errcode = '22023';
  end if;

  -- Take the SAME organization-scoped advisory lock that post_payment_internal
  -- takes for record_payment, and take it BEFORE locking any dues row below.
  -- record_payment's path always acquires this lock first and only then locks
  -- dues; if record_online_payment locked dues first and only acquired this
  -- lock later (inside post_payment_internal), a concurrent record_payment
  -- (holding the advisory lock, waiting on a due this function already locked)
  -- and this function (holding that due, now waiting on the advisory lock)
  -- would form an AB-BA circular wait -- a genuine deadlock, not just lock
  -- contention. Acquiring the identical lock key here, before the due-locking
  -- loop, makes both callers take the advisory lock before any dues row lock,
  -- in the same relative order, for any organization -- which is what
  -- actually prevents the deadlock. post_payment_internal's own later
  -- pg_advisory_xact_lock call with this same key is a no-op once we already
  -- hold it: Postgres advisory xact locks are reentrant within a transaction.
  perform pg_advisory_xact_lock(hashtext('record_payment_' || v_txn.organization_id::text));

  -- Clearing account: resolve from organization_finance_settings, re-validate
  -- the same four conditions the config-time trigger already checked (an
  -- account can be deactivated after configuration). No fallback, ever.
  select ofs.online_payments_clearing_account_id into v_clearing_account_id
  from public.organization_finance_settings ofs
  where ofs.organization_id = v_txn.organization_id and ofs.resort_id = v_txn.resort_id;

  if v_clearing_account_id is not null then
    select * into v_clearing_account from public.chart_of_accounts where id = v_clearing_account_id;
  end if;

  if v_clearing_account_id is null
    or v_clearing_account.id is null
    or v_clearing_account.category <> 'ASSET'
    or v_clearing_account.is_group
    or not v_clearing_account.is_active
    or (v_clearing_account.resort_id is not null and v_clearing_account.resort_id <> v_txn.resort_id)
  then
    v_failure_message := format('No valid online-payments clearing account configured for resort %s', v_txn.resort_id);
    update public.online_payment_transactions
    set status = 'FAILED', failed_at = now(),
        failure_code = 'CLEARING_ACCOUNT_NOT_CONFIGURED',
        failure_message = v_failure_message
    where id = p_transaction_id;
    return query select 'FAILED'::text, null::uuid, 'CLEARING_ACCOUNT_NOT_CONFIGURED'::text, v_failure_message;
    return;
  end if;

  -- Fiscal period: fiscal_periods has no resort_id column (org-wide), so
  -- resolve purely by organization_id + date range. current_date is the
  -- posting date for an online payment -- there is no staff member choosing
  -- one. Columns are alias-qualified (fp.*) because the function's own
  -- RETURNS TABLE column `status` is visible as a bare PL/pgSQL identifier
  -- inside this function body and would otherwise collide with
  -- fiscal_periods.status, making an unqualified `status = 'OPEN'` raise
  -- "column reference status is ambiguous" (42702).
  select fp.id into v_fiscal_period_id
  from public.fiscal_periods fp
  where fp.organization_id = v_txn.organization_id
    and fp.status = 'OPEN'
    and current_date between fp.start_date and fp.end_date
  order by fp.start_date desc
  limit 1;

  if v_fiscal_period_id is null then
    v_failure_message := format('No open fiscal period covers %s for organization %s', current_date, v_txn.organization_id);
    update public.online_payment_transactions
    set failure_code = 'OPEN_PERIOD_REQUIRED',
        failure_message = v_failure_message
    where id = p_transaction_id;
    -- status stays PENDING -- retryable, see design doc Decision 2.
    return query select 'PENDING'::text, null::uuid, 'OPEN_PERIOD_REQUIRED'::text, v_failure_message;
    return;
  end if;

  -- Lock every allocated due in a fixed (due_id) order. Deadlock safety here
  -- comes from the org-scoped advisory lock acquired above, taken before this
  -- loop touches any dues row -- both this function and record_payment now
  -- take that same advisory lock before locking any due, in the same
  -- relative order, so a concurrent staff-side record_payment call touching
  -- an overlapping due can never deadlock against this function.
  for v_alloc in
    select due_id, amount from public.online_payment_transaction_allocations
    where transaction_id = p_transaction_id
    order by due_id
  loop
    select * into v_due from public.dues where id = v_alloc.due_id for update;

    if v_due.id is null or v_due.organization_id <> v_txn.organization_id or v_due.resort_id <> v_txn.resort_id then
      v_failure_message := format('Due %s is outside this transaction''s organization/resort', v_alloc.due_id);
      update public.online_payment_transactions
      set status = 'FAILED', failed_at = now(), failure_code = 'DUE_OUT_OF_SCOPE', failure_message = v_failure_message
      where id = p_transaction_id;
      return query select 'FAILED'::text, null::uuid, 'DUE_OUT_OF_SCOPE'::text, v_failure_message;
      return;
    end if;

    if not exists (
      select 1 from public.unit_ownerships uo
      where uo.unit_id = v_due.unit_id
        and uo.member_id = v_txn.member_id
        and (uo.end_date is null or uo.end_date >= current_date)
    ) then
      v_failure_message := format('Due %s''s unit is not owned by member %s', v_alloc.due_id, v_txn.member_id);
      update public.online_payment_transactions
      set status = 'FAILED', failed_at = now(), failure_code = 'DUE_NOT_OWNED_BY_MEMBER', failure_message = v_failure_message
      where id = p_transaction_id;
      return query select 'FAILED'::text, null::uuid, 'DUE_NOT_OWNED_BY_MEMBER'::text, v_failure_message;
      return;
    end if;

    if v_due.status = 'VOID' then
      v_failure_message := format('Due %s is no longer payable (void)', v_alloc.due_id);
      update public.online_payment_transactions
      set status = 'FAILED', failed_at = now(), failure_code = 'DUE_ALREADY_SETTLED', failure_message = v_failure_message
      where id = p_transaction_id;
      return query select 'FAILED'::text, null::uuid, 'DUE_ALREADY_SETTLED'::text, v_failure_message;
      return;
    end if;

    select coalesce(sum(pa.amount), 0) into v_paid_so_far
    from public.payment_allocations pa
    join public.payments p on p.id = pa.payment_id
    where pa.due_id = v_due.id and p.status = 'POSTED';

    if v_alloc.amount > (v_due.amount - v_paid_so_far) then
      v_failure_message := format('Due %s no longer has enough remaining balance for %s', v_alloc.due_id, v_alloc.amount);
      update public.online_payment_transactions
      set status = 'FAILED', failed_at = now(), failure_code = 'DUE_ALREADY_SETTLED', failure_message = v_failure_message
      where id = p_transaction_id;
      return query select 'FAILED'::text, null::uuid, 'DUE_ALREADY_SETTLED'::text, v_failure_message;
      return;
    end if;

    v_allocations_jsonb := v_allocations_jsonb || jsonb_build_array(jsonb_build_object('due_id', v_alloc.due_id, 'amount', v_alloc.amount));
  end loop;

  -- Every allocation still fits -- proceed to the shared accounting core.
  -- p_unit_id is null: an online transaction may span dues on more than one
  -- unit (design doc Decision 4); payments.unit_id representing "the" unit
  -- doesn't apply when allocations aren't single-unit, so it's left unset
  -- rather than picking one allocation's unit arbitrarily.
  select * into v_result from public.post_payment_internal(
    p_organization_id => v_txn.organization_id,
    p_resort_id => v_txn.resort_id,
    p_member_id => v_txn.member_id,
    p_unit_id => null,
    p_amount => v_txn.amount,
    p_method => 'ONLINE',
    p_payment_date => current_date,
    p_deposit_account_id => v_clearing_account_id,
    p_fiscal_period_id => v_fiscal_period_id,
    p_allocations => v_allocations_jsonb,
    p_idempotency_key => 'online:' || p_transaction_id::text,
    p_cashier_session_id => null,
    p_actor_id => null
  );

  update public.online_payment_transactions
  set status = 'PAID',
      payment_id = v_result.payment_id,
      paid_at = now(),
      webhook_event_id = p_webhook_event_id,
      provider_payload = coalesce(p_provider_payload, provider_payload)
  where id = p_transaction_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (null, v_txn.organization_id, v_txn.resort_id, 'online_payment.posted', 'online_payment_transaction', p_transaction_id,
    jsonb_build_object('payment_id', v_result.payment_id, 'amount', v_txn.amount, 'provider', v_txn.provider));

  return query select 'PAID'::text, v_result.payment_id, null::text, null::text;
end;
$$;

revoke all on function public.record_online_payment(uuid, text, jsonb) from public;
revoke all on function public.record_online_payment(uuid, text, jsonb) from authenticated;
revoke all on function public.record_online_payment(uuid, text, jsonb) from anon;
grant execute on function public.record_online_payment(uuid, text, jsonb) to service_role;

notify pgrst, 'reload schema';
