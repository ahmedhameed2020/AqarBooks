-- Idempotency follow-up requested after the supplier posting-permission
-- work: payDueFromCashierAction generated a FRESH randomUUID() server-side
-- on every invocation (treasury.ts), so a network-drop-then-resubmit never
-- actually reused the same idempotency_key -- record_payment's own
-- dedup-by-key check (20260810000027) only ever helps when the caller
-- sends a genuinely stable key. That's fixed at the application layer
-- (client generates the key once; treasury.ts/session-forms.tsx forward
-- it instead of regenerating it) -- no SQL change needed for that half.
--
-- This migration fixes the other half, found while designing the test for
-- "two concurrent requests with the same key -> one result": record_
-- payment's idempotency check (SELECT ... WHERE idempotency_key = ...)
-- runs BEFORE the advisory lock. Two truly concurrent calls with the same
-- key can both pass that check (neither sees the other's row yet), both
-- then serialize on the lock one at a time, and the SECOND one hits the
-- unique index on (organization_id, idempotency_key) at INSERT time --
-- previously with no exception handler, which raised a raw
-- unique_violation instead of gracefully returning the first call's
-- result. record_supplier_payment already had this exact handling
-- (20260812000029); record_payment never did. Same fix, same place.

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
  v_existing_payment_id uuid;
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

  perform pg_advisory_xact_lock(hashtext('record_payment_' || p_organization_id::text));

  -- A concurrent call with the same key may have inserted its row between
  -- the pre-lock check above and acquiring the lock -- re-check now that
  -- we hold it, so this call converges on the same result instead of
  -- redoing the allocation work against a due the other call already paid.
  if p_idempotency_key is not null then
    select id into v_payment_id
    from public.payments
    where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
    if v_payment_id is not null then
      return v_payment_id;
    end if;
  end if;

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
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

  v_entry_id := public.create_journal_entry_internal(
    p_organization_id, p_resort_id, p_fiscal_period_id, p_payment_date,
    'Payment received', 'RECEIPT_VOUCHER',
    jsonb_build_array(jsonb_build_object('account_id', p_deposit_account_id, 'debit', p_amount, 'credit', 0)) || v_credit_lines,
    null
  );
  perform public.post_journal_entry_internal(v_entry_id);

  v_receipt_number := public.next_sequence_value(p_organization_id, null, 'receipt');

  begin
    insert into public.payments (
      organization_id, resort_id, member_id, unit_id, amount, method, payment_date,
      receipt_number, deposit_account_id, journal_entry_id, idempotency_key, created_by
    ) values (
      p_organization_id, p_resort_id, p_member_id, p_unit_id, p_amount, p_method, p_payment_date,
      v_receipt_number, p_deposit_account_id, v_entry_id, p_idempotency_key, auth.uid()
    )
    returning id into v_payment_id;
  exception
    when unique_violation then
      if p_idempotency_key is not null then
        select id into v_existing_payment_id
        from public.payments
        where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
        if v_existing_payment_id is null then raise; end if;
        return v_existing_payment_id;
      else
        raise;
      end if;
  end;

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

notify pgrst, 'reload schema';
