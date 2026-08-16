-- Two independent fixes to record_supplier_payment, combined into one
-- redefinition since they touch the same function body:
--
-- 1. Concurrency/idempotency race: the function checked idempotency_key via
--    a plain SELECT with no advisory lock and no exception handler around
--    the final INSERT. Two concurrent calls with the same key could both
--    pass the "not found" check before either commits, both build and post
--    a journal entry, and only the losing transaction's INSERT would hit
--    idx_supplier_payments_idempotency's unique constraint -- rolling back
--    its own journal entry (safe) but surfacing a raw Postgres error
--    instead of gracefully returning the winner's payment id (matches
--    record_payment's proven pattern). The same missing lock also let two
--    concurrent non-idempotent payments both read a stale
--    remaining-balance for the same invoice and both believe there was
--    room to allocate, risking an overpaid invoice.
--
-- 2. Resort validation gap: p_resort_id was never checked against
--    p_organization_id (same class of gap fixed for record_expense in
--    20260812000018).
create or replace function public.record_supplier_payment(
  p_organization_id uuid,
  p_resort_id uuid,
  p_supplier_id uuid,
  p_amount numeric,
  p_method text,
  p_payment_date date,
  p_payment_account_id uuid,
  p_fiscal_period_id uuid,
  p_allocations jsonb, -- [{ "invoice_id": uuid, "amount": numeric }, ...]
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
  v_invoice public.supplier_invoices;
  v_allocated_total numeric(19, 4) := 0;
  v_remaining numeric(19, 4);
  v_debit_lines jsonb := '[]'::jsonb;
  v_grouped record;
  v_entry_id uuid;
  v_payment_id uuid;
  v_existing_payment_id uuid;
  v_voucher_number bigint;
  v_paid_so_far numeric(19, 4);
  v_new_status text;
  v_session public.cashier_sessions;
begin
  if p_resort_id is null then
    raise exception 'RESORT_REQUIRED: يرجى اختيار الموقع' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.resorts where id = p_resort_id and organization_id = p_organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;
  if not public.has_financial_permission(p_organization_id, 'finance.entries.create', p_resort_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية تسجيل دفعات في هذا الموقع' using errcode = '42501';
  end if;
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  if p_allocations is null or jsonb_array_length(p_allocations) < 1 then
    raise exception 'at least one allocation is required';
  end if;

  if p_cashier_session_id is not null then
    select * into v_session from public.cashier_sessions where id = p_cashier_session_id;
    if v_session.id is null or v_session.organization_id <> p_organization_id then
      raise exception 'cashier session does not belong to this organization';
    end if;
    if v_session.status <> 'OPEN' then
      raise exception 'cashier session is not open';
    end if;
    if not exists (
      select 1 from public.cashboxes where id = v_session.cashbox_id and gl_account_id = p_payment_account_id
    ) then
      raise exception 'payment account does not match this cashier session''s cashbox';
    end if;
  end if;

  -- Fast-path idempotency check (may race -- the real guarantee is the
  -- unique index + exception handler around the INSERT below).
  if p_idempotency_key is not null then
    select id into v_payment_id
    from public.supplier_payments
    where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
    if v_payment_id is not null then
      return v_payment_id;
    end if;
  end if;

  -- Serializes concurrent supplier-payment recordings for this
  -- organization: closes both the idempotency race above and the
  -- remaining-balance race on shared invoices below. Dedicated lock name
  -- (not shared with record_payment/record_expense) since those touch
  -- unrelated tables and shouldn't contend with this one.
  perform pg_advisory_xact_lock(hashtext('record_supplier_payment_' || p_organization_id::text));

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    select * into v_invoice from public.supplier_invoices where id = (v_alloc ->> 'invoice_id')::uuid;
    if v_invoice.id is null or v_invoice.organization_id <> p_organization_id then
      raise exception 'invoice does not belong to this organization';
    end if;
    if v_invoice.status = 'CANCELLED' then
      raise exception 'cannot allocate to a cancelled invoice';
    end if;

    select coalesce(sum(spa.amount), 0) into v_paid_so_far
    from public.supplier_payment_allocations spa
    join public.supplier_payments sp on sp.id = spa.payment_id
    where spa.invoice_id = v_invoice.id;

    v_remaining := v_invoice.amount - v_paid_so_far;
    if (v_alloc ->> 'amount')::numeric(19, 4) > v_remaining then
      raise exception 'allocation of % exceeds remaining balance % for invoice %', v_alloc ->> 'amount', v_remaining, v_invoice.id;
    end if;

    v_allocated_total := v_allocated_total + (v_alloc ->> 'amount')::numeric(19, 4);
  end loop;

  if v_allocated_total <> p_amount then
    raise exception 'allocations (%) must sum to the payment amount (%)', v_allocated_total, p_amount;
  end if;

  for v_grouped in
    select si.payable_account_id as account_id, sum((a ->> 'amount')::numeric(19, 4)) as total
    from jsonb_array_elements(p_allocations) a
    join public.supplier_invoices si on si.id = (a ->> 'invoice_id')::uuid
    group by si.payable_account_id
  loop
    v_debit_lines := v_debit_lines || jsonb_build_array(
      jsonb_build_object('account_id', v_grouped.account_id, 'debit', v_grouped.total, 'credit', 0)
    );
  end loop;

  v_entry_id := public.create_journal_entry(
    p_organization_id, p_resort_id, p_fiscal_period_id, p_payment_date,
    'Supplier payment', 'PAYMENT_VOUCHER',
    v_debit_lines || jsonb_build_array(jsonb_build_object('account_id', p_payment_account_id, 'debit', 0, 'credit', p_amount)),
    null
  );
  perform public.post_journal_entry(v_entry_id);

  v_voucher_number := public.next_sequence_value(p_organization_id, null, 'supplier_payment');

  begin
    insert into public.supplier_payments (
      organization_id, resort_id, supplier_id, amount, method, payment_date,
      voucher_number, payment_account_id, journal_entry_id, cashier_session_id, idempotency_key, created_by
    ) values (
      p_organization_id, p_resort_id, p_supplier_id, p_amount, p_method, p_payment_date,
      v_voucher_number, p_payment_account_id, v_entry_id, p_cashier_session_id, p_idempotency_key, auth.uid()
    )
    returning id into v_payment_id;
  exception
    when unique_violation then
      -- Lost the idempotency race (or a duplicate voucher_number, which
      -- next_sequence_value should never produce -- re-raise that case).
      if p_idempotency_key is not null then
        select id into v_existing_payment_id
        from public.supplier_payments
        where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
        if v_existing_payment_id is null then raise; end if;
        return v_existing_payment_id;
      else
        raise;
      end if;
  end;

  if p_cashier_session_id is not null then
    insert into public.cash_transactions (organization_id, session_id, type, amount, description, created_by)
    values (p_organization_id, p_cashier_session_id, 'PAYMENT', p_amount, 'Supplier payment ' || v_payment_id, auth.uid());
  end if;

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    insert into public.supplier_payment_allocations (payment_id, invoice_id, amount)
    values (v_payment_id, (v_alloc ->> 'invoice_id')::uuid, (v_alloc ->> 'amount')::numeric(19, 4));

    select * into v_invoice from public.supplier_invoices where id = (v_alloc ->> 'invoice_id')::uuid;
    select coalesce(sum(spa.amount), 0) into v_paid_so_far
    from public.supplier_payment_allocations spa
    join public.supplier_payments sp on sp.id = spa.payment_id
    where spa.invoice_id = v_invoice.id;

    v_new_status := case when v_paid_so_far >= v_invoice.amount then 'PAID' else 'PARTIALLY_PAID' end;
    update public.supplier_invoices set status = v_new_status where id = v_invoice.id;
  end loop;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'supplier_payment.recorded', 'supplier_payment', v_payment_id,
    jsonb_build_object('amount', p_amount, 'voucher_number', v_voucher_number));

  return v_payment_id;
end;
$$;
