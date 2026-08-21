-- Follow-up from the 17-call-site audit of "perform public.post_journal_entry("
-- (requested after fixing record_payment/record_expense): every OTHER
-- automatic accounting flow that does its own resort-scoped permission
-- check and then delegates to the PUBLIC create_journal_entry/
-- post_journal_entry shares the same bug -- the public post_journal_entry
-- independently requires finance.entries.post, which ACCOUNTANT (the real
-- role affected here) never holds.
--
-- Audit verdict per function (grep-confirmed against the full migration
-- history for which definition is actually live, and against app/ + lib/
-- for which functions are actually called from the application):
--
--   1. post_supplier_invoice (live def: 20260812000026) -- FIXED BELOW.
--      Checks finance.entries.create (resort-scoped) before posting its
--      own invoice entry; ACCOUNTANT holds create but not post.
--   2. record_supplier_payment (live def: 20260812000029) -- FIXED BELOW.
--      Same pattern, same affected role.
--   3. cancel_supplier_invoice / void_supplier_payment (live def:
--      20260812000029) -- NOT fixed here, deliberately. Both check
--      finance.suppliers.void (resort-scoped), which today is only ever
--      granted to TENANT_OWNER/FINANCE_MANAGER -- both of whom already
--      hold finance.entries.post, so there is no live bug. Swapping these
--      to the _internal variants anyway is a reasonable hardening (it
--      would stop being incidentally safe if finance.suppliers.void is
--      ever granted more broadly in the future), but that's a deliberate
--      policy call, not a bug fix -- left for a separate decision.
--   4. issue_due (singular, 10-arg, live def: 20260810000025) -- DROPPED
--      BELOW, not fixed. Confirmed via `grep -rn '"issue_due"'` across
--      app/, lib/, and tests/: the application only ever calls the batch
--      `issue_dues` (plural) RPC. issue_due (singular) has no caller
--      anywhere and was never dropped when issue_dues superseded it --
--      genuinely dead code, not worth fixing a permission bug that no
--      real path can ever trigger.
--   5. Every other call site from the original 17-site grep was already
--      confirmed superseded (dead) by a later CREATE OR REPLACE of the
--      same function name, or was record_payment/record_expense (already
--      fixed in 20260813000005 / 20260813000006) -- no action needed.

drop function if exists public.issue_due(uuid, uuid, uuid, uuid, uuid, numeric, date, date, text, uuid);

create or replace function public.post_supplier_invoice(
  p_organization_id uuid,
  p_resort_id uuid,
  p_supplier_id uuid,
  p_purchase_order_id uuid,
  p_invoice_number text,
  p_expense_account_id uuid,
  p_net_amount numeric,
  p_discount_amount numeric,
  p_vat_rate numeric,
  p_vat_account_id uuid,
  p_wht_rate numeric,
  p_wht_account_id uuid,
  p_invoice_date date,
  p_due_date date,
  p_fiscal_period_id uuid
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_payable_account_id uuid;
  v_entry_id uuid;
  v_invoice_id uuid;
  v_taxable_base numeric(19, 4);
  v_vat_amount numeric(19, 4);
  v_wht_amount numeric(19, 4);
  v_gross_amount numeric(19, 4);
  v_debit_lines jsonb;
  v_po public.purchase_orders;
  v_already_invoiced numeric(19, 4);
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
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية ترحيل فواتير في هذا الموقع' using errcode = '42501';
  end if;
  if p_net_amount <= 0 then
    raise exception 'amount must be positive';
  end if;
  if coalesce(p_discount_amount, 0) < 0 or coalesce(p_discount_amount, 0) >= p_net_amount then
    raise exception 'discount must be zero or less than the invoice net amount';
  end if;
  if coalesce(p_vat_rate, 0) < 0 or coalesce(p_vat_rate, 0) > 100 then
    raise exception 'VAT rate out of range';
  end if;
  if coalesce(p_wht_rate, 0) < 0 or coalesce(p_wht_rate, 0) > 100 then
    raise exception 'WHT rate out of range';
  end if;
  if coalesce(p_vat_rate, 0) > 0 and p_vat_account_id is null then
    raise exception 'VAT account is required when a VAT rate is set';
  end if;
  if coalesce(p_wht_rate, 0) > 0 and p_wht_account_id is null then
    raise exception 'WHT account is required when a WHT rate is set';
  end if;
  if p_vat_account_id is not null and not exists (
    select 1 from public.chart_of_accounts where id = p_vat_account_id and organization_id = p_organization_id
  ) then
    raise exception 'VAT account does not belong to this organization';
  end if;
  if p_wht_account_id is not null and not exists (
    select 1 from public.chart_of_accounts where id = p_wht_account_id and organization_id = p_organization_id
  ) then
    raise exception 'WHT account does not belong to this organization';
  end if;

  select payable_account_id into v_payable_account_id
  from public.suppliers where id = p_supplier_id and organization_id = p_organization_id;
  if v_payable_account_id is null then
    raise exception 'supplier does not belong to this organization';
  end if;

  v_taxable_base := p_net_amount - coalesce(p_discount_amount, 0);
  v_vat_amount := round(v_taxable_base * coalesce(p_vat_rate, 0) / 100, 4);
  v_wht_amount := round(v_taxable_base * coalesce(p_wht_rate, 0) / 100, 4);
  v_gross_amount := v_taxable_base + v_vat_amount;

  if p_purchase_order_id is not null then
    perform pg_advisory_xact_lock(hashtext('post_supplier_invoice_po_' || p_purchase_order_id::text));

    select * into v_po from public.purchase_orders where id = p_purchase_order_id;
    if v_po.id is null or v_po.organization_id <> p_organization_id then
      raise exception 'PO_NOT_FOUND: أمر الشراء غير موجود في هذا الكيان' using errcode = '22023';
    end if;
    if v_po.supplier_id <> p_supplier_id then
      raise exception 'PO_SUPPLIER_MISMATCH: أمر الشراء صادر لمورد مختلف عن المورد المحدد' using errcode = '22023';
    end if;
    if v_po.status not in ('APPROVED', 'RECEIVED') then
      raise exception 'PO_NOT_APPROVED: لا يمكن ترحيل فاتورة على أمر شراء غير معتمد' using errcode = '22023';
    end if;

    select coalesce(sum(net_amount), 0) into v_already_invoiced
    from public.supplier_invoices
    where purchase_order_id = p_purchase_order_id and status <> 'CANCELLED';

    if v_already_invoiced + p_net_amount > v_po.amount then
      raise exception 'PO_AMOUNT_EXCEEDED: مبلغ الفاتورة (%) يتجاوز المتبقي من أمر الشراء (%)', p_net_amount, v_po.amount - v_already_invoiced
        using errcode = '22023';
    end if;
  end if;

  v_debit_lines := jsonb_build_array(jsonb_build_object('account_id', p_expense_account_id, 'debit', v_taxable_base, 'credit', 0));
  if v_vat_amount > 0 then
    v_debit_lines := v_debit_lines || jsonb_build_array(jsonb_build_object('account_id', p_vat_account_id, 'debit', v_vat_amount, 'credit', 0));
  end if;

  -- Uses the _internal variants (see 20260813000005): finance.entries.create
  -- (checked above, resort-scoped) already authorizes this whole atomic
  -- "post invoice + post its own entry" action.
  v_entry_id := public.create_journal_entry_internal(
    p_organization_id, p_resort_id, p_fiscal_period_id, p_invoice_date,
    'Supplier invoice ' || p_invoice_number, 'JOURNAL_VOUCHER',
    v_debit_lines || jsonb_build_array(jsonb_build_object('account_id', v_payable_account_id, 'debit', 0, 'credit', v_gross_amount)),
    null
  );
  perform public.post_journal_entry_internal(v_entry_id);

  insert into public.supplier_invoices (
    organization_id, resort_id, supplier_id, purchase_order_id, invoice_number,
    expense_account_id, payable_account_id, amount, net_amount, discount_amount,
    vat_rate, vat_amount, vat_account_id, wht_rate, wht_amount, wht_account_id,
    invoice_date, due_date, journal_entry_id, created_by
  ) values (
    p_organization_id, p_resort_id, p_supplier_id, p_purchase_order_id, p_invoice_number,
    p_expense_account_id, v_payable_account_id, v_gross_amount, p_net_amount, coalesce(p_discount_amount, 0),
    coalesce(p_vat_rate, 0), v_vat_amount, p_vat_account_id, coalesce(p_wht_rate, 0), v_wht_amount, p_wht_account_id,
    p_invoice_date, p_due_date, v_entry_id, auth.uid()
  )
  returning id into v_invoice_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'supplier_invoice.posted', 'supplier_invoice', v_invoice_id,
    jsonb_build_object('amount', v_gross_amount, 'invoice_number', p_invoice_number, 'purchase_order_id', p_purchase_order_id));

  return v_invoice_id;
end;
$$;

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

  -- Uses the _internal variants: finance.entries.create (checked above,
  -- resort-scoped) already authorizes this whole atomic "record payment +
  -- post its own entry" action.
  v_entry_id := public.create_journal_entry_internal(
    p_organization_id, p_resort_id, p_fiscal_period_id, p_payment_date,
    'Supplier payment', 'PAYMENT_VOUCHER',
    v_debit_lines || v_credit_lines,
    null
  );
  perform public.post_journal_entry_internal(v_entry_id);

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

notify pgrst, 'reload schema';
