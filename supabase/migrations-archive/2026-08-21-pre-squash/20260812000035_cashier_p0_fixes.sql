-- P0 concurrency fix (approved plan): the 12-arg record_payment overload
-- (the one payDueFromCashierAction / clear_incoming_cheque call) had no
-- lock at all, unlike the 11-arg member-payment overload which uses
-- pg_advisory_xact_lock. Per the approved plan, this must be the SAME lock
-- key as the 11-arg overload (hashtext('record_payment_' || organization_id))
-- -- not a separate cashier-only key -- so both overloads serialize against
-- each other for a given organization, closing the race where a cash
-- payment and any other payment path could both read a stale remaining
-- balance for the same due. A `for update` row lock on each allocated due
-- is added on top as defense-in-depth, per the approved plan, even though
-- the shared advisory lock alone already prevents the race.
--
-- Also translates every remaining raw-English exception in this function
-- (and in open_cashier_session / close_cashier_session) to the bilingual
-- "CODE: رسالة عربية" format the rest of this schema's Aug-12 hardening
-- already uses, so formErrorMessage() (now locale-aware, see
-- lib/actions/error-messages.ts) can render them correctly in both
-- languages instead of leaking raw Postgres/English text.

create or replace function public.record_payment(
  p_organization_id uuid,
  p_resort_id uuid,
  p_member_id uuid,
  p_unit_id uuid,
  p_amount numeric,
  p_method text,
  p_payment_date date,
  p_deposit_account_id uuid,
  p_fiscal_period_id uuid,
  p_allocations jsonb,
  p_idempotency_key text,
  p_cashier_session_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alloc jsonb;
  v_due public.dues;
  v_allocated_total numeric(19, 4) := 0;
  v_remaining numeric(19, 4);
  v_credit_lines jsonb := '[]'::jsonb;
  v_grouped record;
  v_entry_id uuid;
  v_payment_id uuid;
  v_receipt_number bigint;
  v_paid_so_far numeric(19, 4);
  v_new_status text;
  v_session public.cashier_sessions;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'receivables.payments.create') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية تسجيل دفعات' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'ORGANIZATION_INACTIVE: الكيان غير نشط' using errcode = '22023';
  end if;
  if p_resort_id is null then
    raise exception 'RESORT_REQUIRED: يرجى اختيار الموقع' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.resorts where id = p_resort_id and organization_id = p_organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;
  if p_amount <= 0 then
    raise exception 'AMOUNT_INVALID: يجب أن يكون المبلغ أكبر من صفر' using errcode = '22023';
  end if;
  if p_allocations is null or jsonb_array_length(p_allocations) < 1 then
    raise exception 'ALLOCATIONS_REQUIRED: يجب توزيع المبلغ على استحقاق واحد على الأقل' using errcode = '22023';
  end if;

  if p_cashier_session_id is not null then
    select * into v_session from public.cashier_sessions where id = p_cashier_session_id;
    if v_session.id is null or v_session.organization_id <> p_organization_id then
      raise exception 'CASHIER_SESSION_NOT_FOUND: جلسة الكاشير غير موجودة في هذا الكيان' using errcode = '22023';
    end if;
    if v_session.status <> 'OPEN' then
      raise exception 'CASHIER_SESSION_NOT_OPEN: جلسة الكاشير غير مفتوحة' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.cashboxes
      where id = v_session.cashbox_id and gl_account_id = p_deposit_account_id
    ) then
      raise exception 'DEPOSIT_ACCOUNT_MISMATCH: حساب الإيداع لا يطابق صندوق جلسة الكاشير' using errcode = '22023';
    end if;
  end if;

  if p_idempotency_key is not null then
    select id into v_payment_id
    from public.payments
    where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
    if v_payment_id is not null then
      return v_payment_id;
    end if;
  end if;

  -- Same lock name as the 11-arg member-payment overload
  -- (20260812000016_record_payment_exclude_reversed.sql) so both paths
  -- that can allocate against the same organization's dues serialize
  -- against each other, not just against themselves.
  perform pg_advisory_xact_lock(hashtext('record_payment_' || p_organization_id::text));

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    -- `for update` locks each allocated due for the rest of this
    -- transaction -- belt-and-suspenders on top of the advisory lock
    -- above, so the remaining-balance check below can never read a value
    -- that a concurrent transaction is about to invalidate.
    select * into v_due from public.dues where id = (v_alloc ->> 'due_id')::uuid for update;
    if v_due.id is null or v_due.organization_id <> p_organization_id then
      raise exception 'DUE_NOT_FOUND: الاستحقاق غير موجود في هذا الكيان' using errcode = '22023';
    end if;
    if v_due.resort_id <> p_resort_id then
      raise exception 'DUE_RESORT_MISMATCH: الاستحقاق % يتبع موقعًا مختلفًا عن موقع الدفعة', v_due.id using errcode = '22023';
    end if;
    if v_due.status = 'VOID' then
      raise exception 'DUE_VOID: لا يمكن سداد استحقاق ملغى' using errcode = '22023';
    end if;

    select coalesce(sum(pa.amount), 0) into v_paid_so_far
    from public.payment_allocations pa
    join public.payments p on p.id = pa.payment_id
    where pa.due_id = v_due.id and p.status = 'POSTED';

    v_remaining := v_due.amount - v_paid_so_far;
    if (v_alloc ->> 'amount')::numeric(19, 4) > v_remaining then
      raise exception 'ALLOCATION_EXCEEDS_REMAINING: المبلغ (%) أكبر من المتبقي (%) على الاستحقاق %', v_alloc ->> 'amount', v_remaining, v_due.id using errcode = '22023';
    end if;

    v_allocated_total := v_allocated_total + (v_alloc ->> 'amount')::numeric(19, 4);
  end loop;

  if v_allocated_total <> p_amount then
    raise exception 'ALLOCATIONS_MISMATCH: مجموع التوزيع (%) يجب أن يساوي مبلغ الدفعة (%)', v_allocated_total, p_amount using errcode = '22023';
  end if;

  for v_grouped in
    select d.receivable_account_id as account_id, sum((a ->> 'amount')::numeric(19, 4)) as total
    from jsonb_array_elements(p_allocations) a
    join public.dues d on d.id = (a ->> 'due_id')::uuid
    group by d.receivable_account_id
  loop
    v_credit_lines := v_credit_lines || jsonb_build_array(
      jsonb_build_object('account_id', v_grouped.account_id, 'debit', 0, 'credit', v_grouped.total)
    );
  end loop;

  v_entry_id := public.create_journal_entry(
    p_organization_id, p_resort_id, p_fiscal_period_id, p_payment_date,
    'Payment received', 'RECEIPT_VOUCHER',
    jsonb_build_array(jsonb_build_object('account_id', p_deposit_account_id, 'debit', p_amount, 'credit', 0)) || v_credit_lines,
    null
  );
  perform public.post_journal_entry(v_entry_id);

  v_receipt_number := public.next_sequence_value(p_organization_id, null, 'receipt');

  insert into public.payments (
    organization_id, resort_id, member_id, unit_id, amount, method, payment_date,
    receipt_number, deposit_account_id, journal_entry_id, idempotency_key, created_by
  ) values (
    p_organization_id, p_resort_id, p_member_id, p_unit_id, p_amount, p_method, p_payment_date,
    v_receipt_number, p_deposit_account_id, v_entry_id, p_idempotency_key, auth.uid()
  )
  returning id into v_payment_id;

  if p_cashier_session_id is not null then
    insert into public.cash_transactions (organization_id, session_id, type, amount, payment_id, created_by)
    values (p_organization_id, p_cashier_session_id, 'RECEIPT', p_amount, v_payment_id, auth.uid());
  end if;

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    insert into public.payment_allocations (payment_id, due_id, amount)
    values (v_payment_id, (v_alloc ->> 'due_id')::uuid, (v_alloc ->> 'amount')::numeric(19, 4));

    select * into v_due from public.dues where id = (v_alloc ->> 'due_id')::uuid;
    select coalesce(sum(pa.amount), 0) into v_paid_so_far
    from public.payment_allocations pa
    join public.payments p on p.id = pa.payment_id
    where pa.due_id = v_due.id and p.status = 'POSTED';

    v_new_status := case when v_paid_so_far >= v_due.amount then 'PAID' else 'PARTIALLY_PAID' end;
    update public.dues set status = v_new_status where id = v_due.id;
  end loop;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'payment.recorded', 'payment', v_payment_id,
    jsonb_build_object('amount', p_amount, 'receipt_number', v_receipt_number, 'cashier_session_id', p_cashier_session_id));

  return v_payment_id;
end;
$$;

create or replace function public.open_cashier_session(
  p_organization_id uuid,
  p_resort_id uuid,
  p_cashbox_id uuid,
  p_opening_balance numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session_id uuid;
  v_cashbox_resort_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'cashier.sessions.open') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية فتح جلسات الكاشير' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'ORGANIZATION_INACTIVE: الكيان غير نشط' using errcode = '22023';
  end if;
  if p_resort_id is null then
    raise exception 'RESORT_REQUIRED: يرجى اختيار الموقع' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.resorts where id = p_resort_id and organization_id = p_organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;

  select resort_id into v_cashbox_resort_id
  from public.cashboxes
  where id = p_cashbox_id and organization_id = p_organization_id and is_active;
  if v_cashbox_resort_id is null then
    raise exception 'CASHBOX_NOT_FOUND: الصندوق غير موجود في هذا الكيان أو غير نشط' using errcode = '22023';
  end if;
  if v_cashbox_resort_id <> p_resort_id then
    raise exception 'CASHBOX_RESORT_MISMATCH: الصندوق المحدد يتبع موقعًا مختلفًا عن الموقع المحدد' using errcode = '22023';
  end if;

  if exists (select 1 from public.cashier_sessions where cashbox_id = p_cashbox_id and status = 'OPEN') then
    raise exception 'OPEN_SESSION_EXISTS: يوجد بالفعل جلسة مفتوحة لهذا الصندوق' using errcode = '22023';
  end if;

  insert into public.cashier_sessions (organization_id, resort_id, cashbox_id, opened_by, opening_balance)
  values (p_organization_id, p_resort_id, p_cashbox_id, auth.uid(), coalesce(p_opening_balance, 0))
  returning id into v_session_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'cashier_session.opened', 'cashier_session', v_session_id,
    jsonb_build_object('opening_balance', p_opening_balance));

  return v_session_id;
end;
$$;

-- Return type changes from void to jsonb (the expected/actual/variance
-- trio, so the UI can show the reconciliation result straight from this
-- call instead of recomputing it independently) -- CREATE OR REPLACE
-- cannot change a function's return type, so the old signature must be
-- dropped first.
drop function if exists public.close_cashier_session(uuid, numeric);

create function public.close_cashier_session(
  p_session_id uuid,
  p_actual_closing_balance numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_session public.cashier_sessions;
  v_receipts numeric(19, 4);
  v_payments numeric(19, 4);
  v_expected numeric(19, 4);
begin
  select * into v_session from public.cashier_sessions where id = p_session_id;
  if v_session.id is null then
    raise exception 'CASHIER_SESSION_NOT_FOUND: جلسة الكاشير غير موجودة' using errcode = '22023';
  end if;
  if not public.has_permission(auth.uid(), v_session.organization_id, 'cashier.sessions.close') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية إغلاق جلسات الكاشير' using errcode = '42501';
  end if;
  if v_session.status <> 'OPEN' then
    raise exception 'CASHIER_SESSION_NOT_OPEN: الجلسة ليست مفتوحة، لا يمكن إغلاقها' using errcode = '22023';
  end if;

  select
    coalesce(sum(amount) filter (where type = 'RECEIPT'), 0),
    coalesce(sum(amount) filter (where type = 'PAYMENT'), 0)
  into v_receipts, v_payments
  from public.cash_transactions
  where session_id = p_session_id;

  v_expected := v_session.opening_balance + v_receipts - v_payments;

  update public.cashier_sessions
  set status = 'CLOSED',
      closed_by = auth.uid(),
      closed_at = now(),
      expected_closing_balance = v_expected,
      actual_closing_balance = p_actual_closing_balance,
      variance = p_actual_closing_balance - v_expected
  where id = p_session_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_session.organization_id, v_session.resort_id, 'cashier_session.closed', 'cashier_session', p_session_id,
    jsonb_build_object('expected', v_expected, 'actual', p_actual_closing_balance, 'variance', p_actual_closing_balance - v_expected));

  return jsonb_build_object(
    'expected_closing_balance', v_expected,
    'actual_closing_balance', p_actual_closing_balance,
    'variance', p_actual_closing_balance - v_expected
  );
end;
$$;

-- close_cashier_session's return type changed (void -> jsonb) via DROP+CREATE
-- above. Supabase's hosted Postgres normally auto-notifies PostgREST on DDL,
-- but that relies on an event trigger that can be missing/disabled on some
-- projects. This NOTIFY is a harmless, idempotent belt-and-suspenders call
-- so the client can never hit a stale-cache error against the old (void)
-- signature after this migration is applied.
notify pgrst, 'reload schema';
