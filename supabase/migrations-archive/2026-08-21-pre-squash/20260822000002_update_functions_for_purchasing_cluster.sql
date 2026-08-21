-- Phase 2d of the resort -> property domain rename. Surgically updates all
-- 9 functions referencing purchase_orders/purchase_requests/
-- supplier_invoices/supplier_payments that read the now-renamed resort_id
-- column. Unlike Phase 2c (treasury), every one of the 9 candidates found
-- by an initial text search genuinely needs an edit -- no false positives.
--
-- Two edit shapes, same as Phase 2c:
--
-- 1. Direct INSERT column-list edits (create_purchase_order,
--    create_purchase_request, post_supplier_invoice, record_supplier_payment).
--
-- 2. Row-typed-variable field-access edits (approve_purchase_order,
--    decide_purchase_request, set_purchase_order_status -- one occurrence
--    each; cancel_supplier_invoice, void_supplier_payment -- THREE
--    occurrences each, since v_invoice.resort_id / v_payment.resort_id is
--    read once for a has_financial_permission() argument, once for a
--    create_journal_entry_internal() argument, and once as a value into
--    platform_audit_logs -- all three must change together).
--
-- Some functions declare a row-typed variable that is NOT edited because it
-- never reads .resort_id: post_supplier_invoice's v_po (purchase_orders),
-- record_supplier_payment's v_invoice (supplier_invoices), and
-- void_supplier_payment's v_invoice (supplier_invoices) all only read other
-- fields (.id, .organization_id, .supplier_id, .status, .amount, etc.) --
-- confirmed via full live-body reads, left untouched.

create or replace function public.approve_purchase_order(p_purchase_order_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_order public.purchase_orders;
  v_order_number bigint;
begin
  select * into v_order from public.purchase_orders where id = p_purchase_order_id;
  if v_order.id is null then
    raise exception 'purchase order not found';
  end if;
  if not public.has_permission(auth.uid(), v_order.organization_id, 'purchasing.orders.approve') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_order.status <> 'DRAFT' then
    raise exception 'only a draft order can be approved';
  end if;

  v_order_number := public.next_sequence_value(v_order.organization_id, null, 'purchase_order');

  update public.purchase_orders
  set status = 'APPROVED', approved_by = auth.uid(), order_number = v_order_number
  where id = p_purchase_order_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_order.organization_id, v_order.property_id, 'purchase_order.approved', 'purchase_order', p_purchase_order_id,
    jsonb_build_object('order_number', v_order_number));
end;
$function$;

create or replace function public.cancel_supplier_invoice(p_organization_id uuid, p_invoice_id uuid, p_fiscal_period_id uuid, p_reason text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  if not public.has_financial_permission(p_organization_id, 'finance.suppliers.void', v_invoice.property_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإلغاء فواتير الموردين' using errcode = '42501';
  end if;
  -- Explicit and separate from finance.suppliers.void on purpose (see
  -- migration header) -- reversing a posted entry is a posting action.
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.entries.post') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: إلغاء فاتورة مرحّلة يتطلب أيضًا صلاحية ترحيل القيود' using errcode = '42501';
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

  v_entry_id := public.create_journal_entry_internal(
    p_organization_id, v_invoice.property_id, p_fiscal_period_id, current_date,
    'Cancellation of supplier invoice ' || v_invoice.invoice_number, 'JOURNAL_VOUCHER',
    v_debit_lines || v_credit_lines,
    null
  );
  perform public.post_journal_entry_internal(v_entry_id);

  update public.supplier_invoices
  set status = 'CANCELLED', reversed_at = now(), reversed_by = auth.uid(), reversal_reason = v_reason
  where id = p_invoice_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (auth.uid(), p_organization_id, v_invoice.property_id, 'supplier_invoice.cancelled', 'supplier_invoice', p_invoice_id, v_reason,
    jsonb_build_object('reversal_entry_id', v_entry_id, 'amount', v_invoice.amount));

  return v_entry_id;
end;
$function$;

create or replace function public.create_purchase_order(p_organization_id uuid, p_resort_id uuid, p_supplier_id uuid, p_purchase_request_id uuid, p_description text, p_amount numeric, p_order_date date)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_order_id uuid;
begin
  if p_resort_id is null then
    raise exception 'RESORT_REQUIRED: يرجى اختيار الموقع' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.resorts where id = p_resort_id and organization_id = p_organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;
  if not public.has_financial_permission(p_organization_id, 'purchasing.requests.create', p_resort_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية إنشاء أمر شراء في هذا الموقع' using errcode = '42501';
  end if;
  if not exists (select 1 from public.suppliers where id = p_supplier_id and organization_id = p_organization_id) then
    raise exception 'supplier does not belong to this organization';
  end if;
  if p_purchase_request_id is not null and not exists (
    select 1 from public.purchase_requests
    where id = p_purchase_request_id and organization_id = p_organization_id and status = 'APPROVED'
  ) then
    raise exception 'purchase request must be an approved request belonging to this organization';
  end if;

  insert into public.purchase_orders (
    organization_id, property_id, supplier_id, purchase_request_id, description, amount, order_date, created_by
  ) values (
    p_organization_id, p_resort_id, p_supplier_id, p_purchase_request_id, p_description, p_amount, p_order_date, auth.uid()
  )
  returning id into v_order_id;

  return v_order_id;
end;
$function$;

create or replace function public.create_purchase_request(p_organization_id uuid, p_resort_id uuid, p_description text, p_estimated_amount numeric)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_request_id uuid;
begin
  if p_resort_id is null then
    raise exception 'RESORT_REQUIRED: يرجى اختيار الموقع' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.resorts where id = p_resort_id and organization_id = p_organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;
  if not public.has_financial_permission(p_organization_id, 'purchasing.requests.create', p_resort_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية إنشاء طلب شراء في هذا الموقع' using errcode = '42501';
  end if;
  if p_estimated_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  insert into public.purchase_requests (organization_id, property_id, description, estimated_amount, requested_by)
  values (p_organization_id, p_resort_id, p_description, p_estimated_amount, auth.uid())
  returning id into v_request_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id)
  values (auth.uid(), p_organization_id, p_resort_id, 'purchase_request.created', 'purchase_request', v_request_id);

  return v_request_id;
end;
$function$;

create or replace function public.decide_purchase_request(p_request_id uuid, p_approve boolean, p_reason text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_request public.purchase_requests;
begin
  select * into v_request from public.purchase_requests where id = p_request_id;
  if v_request.id is null then
    raise exception 'purchase request not found';
  end if;
  if not public.has_permission(auth.uid(), v_request.organization_id, 'purchasing.orders.approve') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_request.status <> 'SUBMITTED' then
    raise exception 'only a submitted request can be decided';
  end if;

  update public.purchase_requests
  set status = case when p_approve then 'APPROVED' else 'REJECTED' end, approved_by = auth.uid()
  where id = p_request_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, reason)
  values (auth.uid(), v_request.organization_id, v_request.property_id,
    case when p_approve then 'purchase_request.approved' else 'purchase_request.rejected' end,
    'purchase_request', p_request_id, p_reason);
end;
$function$;

create or replace function public.post_supplier_invoice(p_organization_id uuid, p_resort_id uuid, p_supplier_id uuid, p_purchase_order_id uuid, p_invoice_number text, p_expense_account_id uuid, p_net_amount numeric, p_discount_amount numeric, p_vat_rate numeric, p_vat_account_id uuid, p_wht_rate numeric, p_wht_account_id uuid, p_invoice_date date, p_due_date date, p_fiscal_period_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
    organization_id, property_id, supplier_id, purchase_order_id, invoice_number,
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

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'supplier_invoice.posted', 'supplier_invoice', v_invoice_id,
    jsonb_build_object('amount', v_gross_amount, 'invoice_number', p_invoice_number, 'purchase_order_id', p_purchase_order_id));

  return v_invoice_id;
end;
$function$;

create or replace function public.record_supplier_payment(p_organization_id uuid, p_resort_id uuid, p_supplier_id uuid, p_amount numeric, p_method text, p_payment_date date, p_payment_account_id uuid, p_fiscal_period_id uuid, p_allocations jsonb, p_idempotency_key text, p_cashier_session_id uuid DEFAULT NULL::uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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
      organization_id, property_id, supplier_id, amount, method, payment_date,
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

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'supplier_payment.recorded', 'supplier_payment', v_payment_id,
    jsonb_build_object('amount', p_amount, 'wht_amount', v_total_wht, 'voucher_number', v_voucher_number));

  return v_payment_id;
end;
$function$;

create or replace function public.set_purchase_order_status(p_purchase_order_id uuid, p_new_status text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_order public.purchase_orders;
  v_legal boolean;
begin
  select * into v_order from public.purchase_orders where id = p_purchase_order_id;
  if v_order.id is null then
    raise exception 'purchase order not found';
  end if;
  if not public.has_permission(auth.uid(), v_order.organization_id, 'purchasing.orders.approve') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  v_legal := (v_order.status, p_new_status) in (('APPROVED', 'RECEIVED'), ('DRAFT', 'CANCELLED'), ('APPROVED', 'CANCELLED'));
  if not v_legal then
    raise exception 'illegal purchase order status transition: % -> %', v_order.status, p_new_status;
  end if;

  update public.purchase_orders set status = p_new_status where id = p_purchase_order_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_order.organization_id, v_order.property_id, 'purchase_order.status_changed', 'purchase_order', p_purchase_order_id,
    jsonb_build_object('new_status', p_new_status));
end;
$function$;

create or replace function public.void_supplier_payment(p_organization_id uuid, p_payment_id uuid, p_fiscal_period_id uuid, p_reason text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  perform pg_advisory_xact_lock(hashtext('record_supplier_payment_' || p_organization_id::text));

  select * into v_payment from public.supplier_payments where id = p_payment_id and organization_id = p_organization_id for update;
  if v_payment.id is null then
    raise exception 'PAYMENT_NOT_FOUND: الدفعة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  if not public.has_financial_permission(p_organization_id, 'finance.suppliers.void', v_payment.property_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإلغاء دفعات الموردين' using errcode = '42501';
  end if;
  -- Explicit and separate from finance.suppliers.void on purpose (see
  -- migration header) -- reversing a posted entry is a posting action.
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.entries.post') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: عكس دفعة مرحّلة يتطلب أيضًا صلاحية ترحيل القيود' using errcode = '42501';
  end if;

  if v_payment.reversed_at is not null then
    raise exception 'ALREADY_REVERSED: هذه الدفعة معكوسة بالفعل بتاريخ %', v_payment.reversed_at using errcode = '22023';
  end if;

  select array_agg(distinct invoice_id) into v_affected_invoice_ids
  from public.supplier_payment_allocations
  where payment_id = p_payment_id and reversed_at is null;

  if v_affected_invoice_ids is not null then
    perform 1 from public.supplier_invoices where id = any(v_affected_invoice_ids) order by id for update;
  end if;

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

  v_entry_id := public.create_journal_entry_internal(
    p_organization_id, v_payment.property_id, p_fiscal_period_id, current_date,
    'Reversal of supplier payment voucher #' || v_payment.voucher_number, 'PAYMENT_VOUCHER',
    v_debit_lines || v_credit_lines,
    null
  );
  perform public.post_journal_entry_internal(v_entry_id);

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

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (auth.uid(), p_organization_id, v_payment.property_id, 'supplier_payment.reversed', 'supplier_payment', p_payment_id, v_reason,
    jsonb_build_object('reversal_entry_id', v_entry_id, 'original_amount', v_payment.amount, 'affected_invoice_ids', to_jsonb(coalesce(v_affected_invoice_ids, array[]::uuid[]))));

  return v_entry_id;
end;
$function$;
