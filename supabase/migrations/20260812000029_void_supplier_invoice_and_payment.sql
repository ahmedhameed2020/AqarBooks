-- cancel_supplier_invoice / void_supplier_payment: the "undo" pair for the
-- suppliers workflow. Design B (mark, never delete), same as void_payment
-- for member payments -- but unlike record_payment (which never creates a
-- journal entry, a separate deliberately-deferred gap), post_supplier_invoice
-- and record_supplier_payment both post real balanced journal entries, so
-- both RPCs here must reverse them for real, not just flip a status flag.
--
-- Reversal lines are rebuilt manually via create_journal_entry +
-- post_journal_entry (not the existing but unused reverse_journal_entry
-- utility) to match the exact pattern every other workflow RPC in this
-- schema already uses, and to avoid coupling this feature to a second,
-- separately-granted permission (finance.entries.reverse) on top of the
-- new finance.suppliers.void gate below.

-- cancel_supplier_invoice: only allowed while the invoice has no active
-- (non-reversed) payment allocations -- if it's been partially or fully
-- paid, those payments must be voided first (which recomputes the invoice
-- back to POSTED), then it becomes cancellable. This avoids the deeper
-- complexity of partially unwinding payments as a side effect of
-- cancelling their invoice.
create or replace function public.cancel_supplier_invoice(
  p_organization_id uuid,
  p_invoice_id uuid,
  p_fiscal_period_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invoice public.supplier_invoices;
  v_reason text;
  v_entry_id uuid;
  v_taxable_base numeric(19, 4);
  v_debit_lines jsonb;
  v_credit_lines jsonb;
  v_has_active_allocations boolean;
begin
  if auth.uid() is null then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: طلب غير موثق' using errcode = '42501';
  end if;

  v_reason := trim(coalesce(p_reason, ''));
  if v_reason = '' then
    raise exception 'REASON_REQUIRED: سبب الإلغاء مطلوب' using errcode = '22023';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception 'REASON_TOO_LONG: سبب الإلغاء طويل جدًا (الحد 1000 حرف)' using errcode = '22023';
  end if;

  select * into v_invoice from public.supplier_invoices where id = p_invoice_id and organization_id = p_organization_id for update;
  if v_invoice.id is null then
    raise exception 'INVOICE_NOT_FOUND: الفاتورة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  if not public.has_financial_permission(p_organization_id, 'finance.suppliers.void', v_invoice.resort_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإلغاء فواتير الموردين' using errcode = '42501';
  end if;

  if v_invoice.status = 'CANCELLED' then
    raise exception 'ALREADY_CANCELLED: هذه الفاتورة ملغاة بالفعل بتاريخ %', v_invoice.reversed_at using errcode = '22023';
  end if;

  select exists(
    select 1 from public.supplier_payment_allocations where invoice_id = p_invoice_id and reversed_at is null
  ) into v_has_active_allocations;
  if v_has_active_allocations then
    raise exception 'HAS_PAYMENTS: لا يمكن إلغاء فاتورة عليها دفعات مسددة، يجب عكس الدفعات أولًا' using errcode = '22023';
  end if;

  v_taxable_base := v_invoice.net_amount - v_invoice.discount_amount;
  v_debit_lines := jsonb_build_array(jsonb_build_object('account_id', v_invoice.payable_account_id, 'debit', v_invoice.amount, 'credit', 0));
  v_credit_lines := jsonb_build_array(jsonb_build_object('account_id', v_invoice.expense_account_id, 'debit', 0, 'credit', v_taxable_base));
  if v_invoice.vat_amount > 0 then
    v_credit_lines := v_credit_lines || jsonb_build_array(jsonb_build_object('account_id', v_invoice.vat_account_id, 'debit', 0, 'credit', v_invoice.vat_amount));
  end if;

  v_entry_id := public.create_journal_entry(
    p_organization_id, v_invoice.resort_id, p_fiscal_period_id, current_date,
    'Cancellation of supplier invoice ' || v_invoice.invoice_number, 'JOURNAL_VOUCHER',
    v_debit_lines || v_credit_lines,
    null
  );
  perform public.post_journal_entry(v_entry_id);

  update public.supplier_invoices
  set status = 'CANCELLED', reversed_at = now(), reversed_by = auth.uid(), reversal_reason = v_reason
  where id = p_invoice_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (auth.uid(), p_organization_id, v_invoice.resort_id, 'supplier_invoice.cancelled', 'supplier_invoice', p_invoice_id, v_reason,
    jsonb_build_object('reversal_entry_id', v_entry_id, 'amount', v_invoice.amount));

  return v_entry_id;
end;
$$;

-- void_supplier_payment: reverses a supplier payment voucher. Marks the
-- payment and its still-active allocations reversed (never deletes),
-- rebuilds and posts the inverse journal entry, and recomputes the status
-- of every invoice this payment touched from its remaining active
-- allocations (mirrors record_supplier_payment's own PAID/PARTIALLY_PAID
-- logic, extended with POSTED for "back to zero paid").
create or replace function public.void_supplier_payment(
  p_organization_id uuid,
  p_payment_id uuid,
  p_fiscal_period_id uuid,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payment public.supplier_payments;
  v_reason text;
  v_affected_invoice_ids uuid[];
  v_debit_lines jsonb := '[]'::jsonb;
  v_credit_lines jsonb := '[]'::jsonb;
  v_grouped record;
  v_entry_id uuid;
  v_invoice_id uuid;
  v_invoice public.supplier_invoices;
  v_paid_so_far numeric(19, 4);
  v_new_status text;
begin
  if auth.uid() is null then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: طلب غير موثق' using errcode = '42501';
  end if;

  v_reason := trim(coalesce(p_reason, ''));
  if v_reason = '' then
    raise exception 'REASON_REQUIRED: سبب الإلغاء مطلوب' using errcode = '22023';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception 'REASON_TOO_LONG: سبب الإلغاء طويل جدًا (الحد 1000 حرف)' using errcode = '22023';
  end if;

  -- Same lock key as record_supplier_payment, so a void can't race a new
  -- payment being recorded against the same organization's invoices.
  perform pg_advisory_xact_lock(hashtext('record_supplier_payment_' || p_organization_id::text));

  select * into v_payment from public.supplier_payments where id = p_payment_id and organization_id = p_organization_id for update;
  if v_payment.id is null then
    raise exception 'PAYMENT_NOT_FOUND: الدفعة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  if not public.has_financial_permission(p_organization_id, 'finance.suppliers.void', v_payment.resort_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإلغاء دفعات الموردين' using errcode = '42501';
  end if;

  if v_payment.reversed_at is not null then
    raise exception 'ALREADY_REVERSED: هذه الدفعة معكوسة بالفعل بتاريخ %', v_payment.reversed_at using errcode = '22023';
  end if;

  select array_agg(distinct invoice_id) into v_affected_invoice_ids
  from public.supplier_payment_allocations
  where payment_id = p_payment_id and reversed_at is null;

  -- Lock affected invoices in a fixed order before touching any of them,
  -- so a hypothetical concurrent path locking the same invoices can't
  -- deadlock against this transaction.
  if v_affected_invoice_ids is not null then
    perform 1 from public.supplier_invoices where id = any(v_affected_invoice_ids) order by id for update;
  end if;

  -- Rebuild the reversal lines from the still-active allocations (marked
  -- reversed further below) joined to their invoices -- exact inverse of
  -- record_supplier_payment's own line-building.
  for v_grouped in
    select si.payable_account_id as account_id, sum(spa.amount) as total
    from public.supplier_payment_allocations spa
    join public.supplier_invoices si on si.id = spa.invoice_id
    where spa.payment_id = p_payment_id and spa.reversed_at is null
    group by si.payable_account_id
  loop
    v_credit_lines := v_credit_lines || jsonb_build_array(
      jsonb_build_object('account_id', v_grouped.account_id, 'debit', 0, 'credit', v_grouped.total)
    );
  end loop;

  v_debit_lines := jsonb_build_array(jsonb_build_object('account_id', v_payment.payment_account_id, 'debit', v_payment.amount, 'credit', 0));

  if v_payment.wht_amount > 0 then
    for v_grouped in
      select si.wht_account_id as account_id,
        sum(round(spa.amount * si.wht_amount / nullif(si.amount, 0), 4)) as total
      from public.supplier_payment_allocations spa
      join public.supplier_invoices si on si.id = spa.invoice_id
      where spa.payment_id = p_payment_id and spa.reversed_at is null and si.wht_amount > 0
      group by si.wht_account_id
    loop
      v_debit_lines := v_debit_lines || jsonb_build_array(
        jsonb_build_object('account_id', v_grouped.account_id, 'debit', v_grouped.total, 'credit', 0)
      );
    end loop;
  end if;

  v_entry_id := public.create_journal_entry(
    p_organization_id, v_payment.resort_id, p_fiscal_period_id, current_date,
    'Reversal of supplier payment voucher #' || v_payment.voucher_number, 'PAYMENT_VOUCHER',
    v_debit_lines || v_credit_lines,
    null
  );
  perform public.post_journal_entry(v_entry_id);

  update public.supplier_payment_allocations
  set reversed_at = now(), reversed_by = auth.uid()
  where payment_id = p_payment_id and reversed_at is null;

  update public.supplier_payments
  set reversed_at = now(), reversed_by = auth.uid(), reversal_reason = v_reason
  where id = p_payment_id;

  if v_affected_invoice_ids is not null then
    foreach v_invoice_id in array v_affected_invoice_ids loop
      select coalesce(sum(spa.amount), 0) into v_paid_so_far
      from public.supplier_payment_allocations spa
      where spa.invoice_id = v_invoice_id and spa.reversed_at is null;

      select * into v_invoice from public.supplier_invoices where id = v_invoice_id;
      if v_invoice.status <> 'CANCELLED' then
        v_new_status := case
          when v_paid_so_far >= v_invoice.amount then 'PAID'
          when v_paid_so_far > 0 then 'PARTIALLY_PAID'
          else 'POSTED'
        end;
        update public.supplier_invoices set status = v_new_status where id = v_invoice_id;
      end if;
    end loop;
  end if;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (auth.uid(), p_organization_id, v_payment.resort_id, 'supplier_payment.reversed', 'supplier_payment', p_payment_id, v_reason,
    jsonb_build_object('reversal_entry_id', v_entry_id, 'original_amount', v_payment.amount, 'affected_invoice_ids', to_jsonb(coalesce(v_affected_invoice_ids, array[]::uuid[]))));

  return v_entry_id;
end;
$$;

-- record_supplier_payment's remaining-balance checks must now exclude
-- reversed allocations (the column didn't exist when that function was
-- last defined) -- otherwise a voided allocation would still count against
-- an invoice's remaining balance, permanently under-crediting it. Same
-- signature as 20260812000021/025, so a plain CREATE OR REPLACE is a real
-- replacement.
create or replace function public.record_supplier_payment(
  p_organization_id uuid,
  p_resort_id uuid,
  p_supplier_id uuid,
  p_amount numeric,
  p_method text,
  p_payment_date date,
  p_payment_account_id uuid,
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
  v_invoice public.supplier_invoices;
  v_allocated_total numeric(19, 4) := 0;
  v_total_wht numeric(19, 4) := 0;
  v_alloc_wht numeric(19, 4);
  v_remaining numeric(19, 4);
  v_debit_lines jsonb := '[]'::jsonb;
  v_credit_lines jsonb := '[]'::jsonb;
  v_grouped record;
  v_entry_id uuid;
  v_payment_id uuid;
  v_existing_payment_id uuid;
  v_voucher_number bigint;
  v_paid_so_far numeric(19, 4);
  v_new_status text;
  v_session public.cashier_sessions;
  v_expected_cash numeric(19, 4);
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

  if p_idempotency_key is not null then
    select id into v_payment_id
    from public.supplier_payments
    where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
    if v_payment_id is not null then
      return v_payment_id;
    end if;
  end if;

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
    where spa.invoice_id = v_invoice.id and spa.reversed_at is null;

    v_remaining := v_invoice.amount - v_paid_so_far;
    if (v_alloc ->> 'amount')::numeric(19, 4) > v_remaining then
      raise exception 'allocation of % exceeds remaining balance % for invoice %', v_alloc ->> 'amount', v_remaining, v_invoice.id;
    end if;

    if v_invoice.wht_amount > 0 and v_invoice.amount > 0 then
      v_alloc_wht := round((v_alloc ->> 'amount')::numeric(19, 4) * v_invoice.wht_amount / v_invoice.amount, 4);
    else
      v_alloc_wht := 0;
    end if;
    v_total_wht := v_total_wht + v_alloc_wht;

    v_allocated_total := v_allocated_total + (v_alloc ->> 'amount')::numeric(19, 4);
  end loop;

  v_expected_cash := v_allocated_total - v_total_wht;
  if v_expected_cash <> p_amount then
    raise exception 'cash amount (%) must equal allocations (%) minus WHT withheld (%) = %', p_amount, v_allocated_total, v_total_wht, v_expected_cash;
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

  v_credit_lines := jsonb_build_array(jsonb_build_object('account_id', p_payment_account_id, 'debit', 0, 'credit', p_amount));

  if v_total_wht > 0 then
    for v_grouped in
      select si.wht_account_id as account_id,
        sum(round((a ->> 'amount')::numeric(19, 4) * si.wht_amount / nullif(si.amount, 0), 4)) as total
      from jsonb_array_elements(p_allocations) a
      join public.supplier_invoices si on si.id = (a ->> 'invoice_id')::uuid
      where si.wht_amount > 0
      group by si.wht_account_id
    loop
      v_credit_lines := v_credit_lines || jsonb_build_array(
        jsonb_build_object('account_id', v_grouped.account_id, 'debit', 0, 'credit', v_grouped.total)
      );
    end loop;
  end if;

  v_entry_id := public.create_journal_entry(
    p_organization_id, p_resort_id, p_fiscal_period_id, p_payment_date,
    'Supplier payment', 'PAYMENT_VOUCHER',
    v_debit_lines || v_credit_lines,
    null
  );
  perform public.post_journal_entry(v_entry_id);

  v_voucher_number := public.next_sequence_value(p_organization_id, null, 'supplier_payment');

  begin
    insert into public.supplier_payments (
      organization_id, resort_id, supplier_id, amount, method, payment_date,
      voucher_number, payment_account_id, wht_amount, journal_entry_id, cashier_session_id, idempotency_key, created_by
    ) values (
      p_organization_id, p_resort_id, p_supplier_id, p_amount, p_method, p_payment_date,
      v_voucher_number, p_payment_account_id, v_total_wht, v_entry_id, p_cashier_session_id, p_idempotency_key, auth.uid()
    )
    returning id into v_payment_id;
  exception
    when unique_violation then
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
    where spa.invoice_id = v_invoice.id and spa.reversed_at is null;

    v_new_status := case when v_paid_so_far >= v_invoice.amount then 'PAID' else 'PARTIALLY_PAID' end;
    update public.supplier_invoices set status = v_new_status where id = v_invoice.id;
  end loop;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'supplier_payment.recorded', 'supplier_payment', v_payment_id,
    jsonb_build_object('amount', p_amount, 'wht_amount', v_total_wht, 'voucher_number', v_voucher_number));

  return v_payment_id;
end;
$$;
