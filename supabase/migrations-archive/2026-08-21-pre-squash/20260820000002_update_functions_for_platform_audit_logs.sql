-- Phase 2b-3 (continued): surgical updates to the 24 functions that insert
-- into platform_audit_logs with a resort_id value, renamed to property_id
-- in 20260820000001. Live bodies fetched via pg_get_functiondef, not
-- retyped from memory. ONLY the platform_audit_logs INSERT column list's
-- resort_id token changes in each function -- every other resort_id
-- reference in the same body (on cashboxes, cashier_sessions,
-- journal_entries, purchase_requests, purchase_orders, supplier_invoices,
-- expenses, supplier_payments, resorts, and function parameters like
-- p_resort_id) belongs to a table or identifier NOT part of this migration
-- and is left completely untouched.

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
  values (auth.uid(), v_order.organization_id, v_order.resort_id, 'purchase_order.approved', 'purchase_order', p_purchase_order_id,
    jsonb_build_object('order_number', v_order_number));
end;
$function$;

create or replace function public.archive_unit(p_organization_id uuid, p_unit_id uuid, p_reason text DEFAULT NULL::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_resort_id uuid;
  v_active_owners int;
  v_open_dues int;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'property.units.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك بأرشفة الوحدة' using errcode = '42501';
  end if;

  select property_id into v_resort_id from public.units where id = p_unit_id and organization_id = p_organization_id;
  if v_resort_id is null then
    raise exception 'UNIT_NOT_FOUND: الوحدة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  select count(*) into v_active_owners
  from public.unit_ownerships
  where unit_id = p_unit_id and (end_date is null or end_date >= current_date);
  if v_active_owners > 0 then
    raise exception 'UNIT_HAS_ACTIVE_OWNERSHIP: لا يمكن أرشفة وحدة عليها ملكية نشطة — أنهِ الملكية أولًا' using errcode = '22023';
  end if;

  select count(*) into v_open_dues
  from public.dues
  where unit_id = p_unit_id and status in ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'OVERDUE');
  if v_open_dues > 0 then
    raise exception 'UNIT_HAS_OPEN_DUES: لا يمكن أرشفة وحدة عليها مستحقات مفتوحة غير مسددة' using errcode = '22023';
  end if;

  update public.units
  set is_active = false,
      archived_at = now(),
      archived_by = auth.uid()
  where id = p_unit_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (auth.uid(), p_organization_id, v_resort_id, 'unit.archived', 'unit', p_unit_id, p_reason, '{}'::jsonb);
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

  if not public.has_financial_permission(p_organization_id, 'finance.suppliers.void', v_invoice.resort_id) then
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
    p_organization_id, v_invoice.resort_id, p_fiscal_period_id, current_date,
    'Cancellation of supplier invoice ' || v_invoice.invoice_number, 'JOURNAL_VOUCHER',
    v_debit_lines || v_credit_lines,
    null
  );
  perform public.post_journal_entry_internal(v_entry_id);

  update public.supplier_invoices
  set status = 'CANCELLED', reversed_at = now(), reversed_by = auth.uid(), reversal_reason = v_reason
  where id = p_invoice_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (auth.uid(), p_organization_id, v_invoice.resort_id, 'supplier_invoice.cancelled', 'supplier_invoice', p_invoice_id, v_reason,
    jsonb_build_object('reversal_entry_id', v_entry_id, 'amount', v_invoice.amount));

  return v_entry_id;
end;
$function$;

create or replace function public.close_cashier_session(p_session_id uuid, p_actual_closing_balance numeric)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_session.organization_id, v_session.resort_id, 'cashier_session.closed', 'cashier_session', p_session_id,
    jsonb_build_object('expected', v_expected, 'actual', p_actual_closing_balance, 'variance', p_actual_closing_balance - v_expected));

  return jsonb_build_object(
    'expected_closing_balance', v_expected,
    'actual_closing_balance', p_actual_closing_balance,
    'variance', p_actual_closing_balance - v_expected
  );
end;
$function$;

create or replace function public.create_cashbox(p_organization_id uuid, p_resort_id uuid, p_name text, p_gl_account_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_cashbox_id uuid;
  v_gl_category text;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.accounts.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية إدارة الصناديق' using errcode = '42501';
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

  select category into v_gl_category
  from public.chart_of_accounts
  where id = p_gl_account_id and organization_id = p_organization_id;
  if v_gl_category is null then
    raise exception 'GL_ACCOUNT_NOT_IN_ORGANIZATION: حساب الأستاذ المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;
  if v_gl_category <> 'ASSET' then
    raise exception 'GL_ACCOUNT_NOT_ASSET: يجب اختيار حساب من نوع الأصول لصندوق نقدي' using errcode = '22023';
  end if;

  insert into public.cashboxes (organization_id, resort_id, name, gl_account_id)
  values (p_organization_id, p_resort_id, trim(p_name), p_gl_account_id)
  returning id into v_cashbox_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'cashbox.created', 'cashbox', v_cashbox_id, jsonb_build_object('name', p_name));

  return v_cashbox_id;
end;
$function$;

create or replace function public.create_journal_entry_internal(p_organization_id uuid, p_resort_id uuid, p_fiscal_period_id uuid, p_entry_date date, p_description text, p_source_type text, p_lines jsonb, p_idempotency_key text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_entry_id uuid;
  v_line jsonb;
  v_line_number int := 0;
begin
  if not public.organization_is_active(p_organization_id) then
    raise exception 'organization is not active';
  end if;

  if p_idempotency_key is not null then
    select id into v_entry_id
    from public.journal_entries
    where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
    if v_entry_id is not null then
      return v_entry_id;
    end if;
  end if;

  if not exists (
    select 1 from public.fiscal_periods
    where id = p_fiscal_period_id and organization_id = p_organization_id
  ) then
    raise exception 'fiscal period does not belong to this organization';
  end if;

  if p_lines is null or jsonb_array_length(p_lines) < 1 then
    raise exception 'at least one line is required';
  end if;

  insert into public.journal_entries (
    organization_id, resort_id, fiscal_period_id, entry_date, description,
    source_type, idempotency_key, created_by
  ) values (
    p_organization_id, p_resort_id, p_fiscal_period_id, p_entry_date, p_description,
    coalesce(p_source_type, 'JOURNAL_VOUCHER'), p_idempotency_key, auth.uid()
  )
  returning id into v_entry_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_line_number := v_line_number + 1;

    if not exists (
      select 1 from public.chart_of_accounts
      where id = (v_line ->> 'account_id')::uuid and organization_id = p_organization_id
    ) then
      raise exception 'account does not belong to this organization';
    end if;

    insert into public.journal_entry_lines (
      journal_entry_id, line_number, account_id, description, debit, credit, cost_center_id, project_id
    ) values (
      v_entry_id,
      v_line_number,
      (v_line ->> 'account_id')::uuid,
      v_line ->> 'description',
      coalesce((v_line ->> 'debit')::numeric(19, 4), 0),
      coalesce((v_line ->> 'credit')::numeric(19, 4), 0),
      nullif(v_line ->> 'cost_center_id', '')::uuid,
      nullif(v_line ->> 'project_id', '')::uuid
    );
  end loop;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'journal_entry.created', 'journal_entry', v_entry_id,
    jsonb_build_object('line_count', v_line_number));

  return v_entry_id;
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

  insert into public.purchase_requests (organization_id, resort_id, description, estimated_amount, requested_by)
  values (p_organization_id, p_resort_id, p_description, p_estimated_amount, auth.uid())
  returning id into v_request_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id)
  values (auth.uid(), p_organization_id, p_resort_id, 'purchase_request.created', 'purchase_request', v_request_id);

  return v_request_id;
end;
$function$;

create or replace function public.create_resort(p_organization_id uuid, p_name text, p_code text, p_timezone text, p_address text DEFAULT NULL::text, p_governorate text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_resort_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'tenant.settings.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'organization is not active';
  end if;

  insert into public.resorts (organization_id, name, code, timezone, address, governorate, phone, email, created_by, updated_by)
  values (p_organization_id, p_name, p_code, coalesce(p_timezone, 'Africa/Cairo'), p_address, p_governorate, p_phone, p_email, auth.uid(), auth.uid())
  returning id into v_resort_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, v_resort_id, 'resort.created', 'resort', v_resort_id,
    jsonb_build_object('name', p_name, 'code', p_code));

  return v_resort_id;
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
  values (auth.uid(), v_request.organization_id, v_request.resort_id,
    case when p_approve then 'purchase_request.approved' else 'purchase_request.rejected' end,
    'purchase_request', p_request_id, p_reason);
end;
$function$;

create or replace function public.open_cashier_session(p_organization_id uuid, p_resort_id uuid, p_cashbox_id uuid, p_opening_balance numeric)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'cashier_session.opened', 'cashier_session', v_session_id,
    jsonb_build_object('opening_balance', p_opening_balance));

  return v_session_id;
end;
$function$;

create or replace function public.post_journal_entry_internal(p_journal_entry_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_entry public.journal_entries;
  v_period public.fiscal_periods;
  v_line_count int;
  v_total_debit numeric(19, 4);
  v_total_credit numeric(19, 4);
  v_bad_account_count int;
  v_missing_cost_center_count int;
  v_entry_number bigint;
begin
  select * into v_entry from public.journal_entries where id = p_journal_entry_id;
  if v_entry.id is null then
    raise exception 'journal entry not found';
  end if;

  if not public.organization_is_active(v_entry.organization_id) then
    raise exception 'organization is not active';
  end if;
  if v_entry.status not in ('DRAFT', 'UNDER_REVIEW') then
    raise exception 'only draft or under-review entries can be posted';
  end if;

  select * into v_period from public.fiscal_periods where id = v_entry.fiscal_period_id;
  if v_period.status <> 'OPEN' then
    raise exception 'fiscal period is not open';
  end if;
  if v_entry.entry_date < v_period.start_date or v_entry.entry_date > v_period.end_date then
    raise exception 'entry date does not belong to the selected period';
  end if;

  select count(*), coalesce(sum(debit), 0), coalesce(sum(credit), 0)
  into v_line_count, v_total_debit, v_total_credit
  from public.journal_entry_lines
  where journal_entry_id = p_journal_entry_id;

  if v_line_count < 2 then
    raise exception 'a posted entry requires at least two lines';
  end if;
  if v_total_debit <> v_total_credit then
    raise exception 'unbalanced entry: total debit % does not equal total credit %', v_total_debit, v_total_credit;
  end if;

  select count(*) into v_bad_account_count
  from public.journal_entry_lines l
  join public.chart_of_accounts a on a.id = l.account_id
  where l.journal_entry_id = p_journal_entry_id
    and (a.is_group or not a.is_active or a.organization_id <> v_entry.organization_id);

  if v_bad_account_count > 0 then
    raise exception 'entry contains lines posted to a group, inactive, or cross-tenant account';
  end if;

  select count(*) into v_missing_cost_center_count
  from public.journal_entry_lines l
  join public.chart_of_accounts a on a.id = l.account_id
  where l.journal_entry_id = p_journal_entry_id
    and a.requires_cost_center
    and l.cost_center_id is null;

  if v_missing_cost_center_count > 0 then
    raise exception 'one or more lines are missing a required cost center';
  end if;

  v_entry_number := public.next_sequence_value(v_entry.organization_id, null, 'journal_entry');

  update public.journal_entries
  set status = 'POSTED', posted_by = auth.uid(), posted_at = now(), entry_number = v_entry_number
  where id = p_journal_entry_id;

  update public.chart_of_accounts
  set is_used = true
  where id in (
    select account_id from public.journal_entry_lines where journal_entry_id = p_journal_entry_id
  ) and not is_used;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_entry.organization_id, v_entry.resort_id, 'journal_entry.posted', 'journal_entry', p_journal_entry_id,
    jsonb_build_object('entry_number', v_entry_number, 'total', v_total_debit));
end;
$function$;

create or replace function public.post_payment_internal(p_organization_id uuid, p_resort_id uuid, p_member_id uuid, p_unit_id uuid, p_amount numeric, p_method text, p_payment_date date, p_deposit_account_id uuid, p_fiscal_period_id uuid, p_allocations jsonb, p_idempotency_key text, p_cashier_session_id uuid, p_actor_id uuid)
 returns TABLE(payment_id uuid, allocated_amount numeric, unallocated_amount numeric, affected_due_ids uuid[])
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_alloc jsonb;
  v_due public.dues;
  v_allocated_total numeric(19,4) := 0;
  v_remaining numeric(19,4);
  v_credit_lines jsonb := '[]'::jsonb;
  v_grouped record;
  v_entry_id uuid;
  v_payment_id uuid;
  v_existing_payment_id uuid;
  v_receipt_number bigint;
  v_paid_so_far numeric(19,4);
  v_new_status text;
  v_session public.cashier_sessions;
  v_affected_due_ids uuid[] := '{}';
begin
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
      return query
        select v_payment_id, p_amount, 0::numeric(19,4),
          array(select pa.due_id from public.payment_allocations pa where pa.payment_id = v_payment_id);
      return;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('record_payment_' || p_organization_id::text));

  if p_idempotency_key is not null then
    select id into v_payment_id
    from public.payments
    where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
    if v_payment_id is not null then
      return query
        select v_payment_id, p_amount, 0::numeric(19,4),
          array(select pa.due_id from public.payment_allocations pa where pa.payment_id = v_payment_id);
      return;
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
    if (v_alloc ->> 'amount')::numeric(19,4) > v_remaining then
      raise exception 'ALLOCATION_EXCEEDS_REMAINING: المبلغ (%) أكبر من المتبقي (%) على الاستحقاق %', v_alloc ->> 'amount', v_remaining, v_due.id using errcode = '22023';
    end if;

    v_allocated_total := v_allocated_total + (v_alloc ->> 'amount')::numeric(19,4);
  end loop;

  if v_allocated_total <> p_amount then
    raise exception 'ALLOCATIONS_MISMATCH: مجموع التوزيع (%) يجب أن يساوي مبلغ الدفعة (%)', v_allocated_total, p_amount using errcode = '22023';
  end if;

  for v_grouped in
    select d.receivable_account_id as account_id, sum((a ->> 'amount')::numeric(19,4)) as total
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
      v_receipt_number, p_deposit_account_id, v_entry_id, p_idempotency_key, p_actor_id
    )
    returning id into v_payment_id;
  exception
    when unique_violation then
      if p_idempotency_key is not null then
        select id into v_existing_payment_id
        from public.payments
        where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
        if v_existing_payment_id is null then raise; end if;
        return query
          select v_existing_payment_id, p_amount, 0::numeric(19,4),
            array(select pa.due_id from public.payment_allocations pa where pa.payment_id = v_existing_payment_id);
        return;
      else
        raise;
      end if;
  end;

  if p_cashier_session_id is not null then
    insert into public.cash_transactions (organization_id, session_id, type, amount, payment_id, created_by)
    values (p_organization_id, p_cashier_session_id, 'RECEIPT', p_amount, v_payment_id, p_actor_id);
  end if;

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    insert into public.payment_allocations (payment_id, due_id, amount)
    values (v_payment_id, (v_alloc ->> 'due_id')::uuid, (v_alloc ->> 'amount')::numeric(19,4));

    select * into v_due from public.dues where id = (v_alloc ->> 'due_id')::uuid;
    select coalesce(sum(pa.amount), 0) into v_paid_so_far
    from public.payment_allocations pa
    join public.payments p on p.id = pa.payment_id
    where pa.due_id = v_due.id and p.status = 'POSTED';

    v_new_status := case when v_paid_so_far >= v_due.amount then 'PAID' else 'PARTIALLY_PAID' end;
    update public.dues set status = v_new_status where id = v_due.id;
    v_affected_due_ids := v_affected_due_ids || v_due.id;
  end loop;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (p_actor_id, p_organization_id, p_resort_id, 'payment.recorded', 'payment', v_payment_id,
    jsonb_build_object('amount', p_amount, 'receipt_number', v_receipt_number, 'cashier_session_id', p_cashier_session_id));

  return query select v_payment_id, v_allocated_total, (p_amount - v_allocated_total), v_affected_due_ids;
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

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'supplier_invoice.posted', 'supplier_invoice', v_invoice_id,
    jsonb_build_object('amount', v_gross_amount, 'invoice_number', p_invoice_number, 'purchase_order_id', p_purchase_order_id));

  return v_invoice_id;
end;
$function$;

create or replace function public.reconcile_cashier_session(p_session_id uuid, p_note text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_session public.cashier_sessions;
begin
  select * into v_session from public.cashier_sessions where id = p_session_id;
  if v_session.id is null then
    raise exception 'cashier session not found';
  end if;
  if not public.has_permission(auth.uid(), v_session.organization_id, 'cashier.reconciliations.approve') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_session.status <> 'CLOSED' then
    raise exception 'only a closed session can be reconciled';
  end if;

  update public.cashier_sessions set status = 'RECONCILED' where id = p_session_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, reason)
  values (auth.uid(), v_session.organization_id, v_session.resort_id, 'cashier_session.reconciled', 'cashier_session', p_session_id, p_note);
end;
$function$;

create or replace function public.record_expense(p_organization_id uuid, p_resort_id uuid, p_expense_category_id uuid, p_description text, p_amount numeric, p_expense_date date, p_payment_account_id uuid, p_fiscal_period_id uuid, p_cashier_session_id uuid DEFAULT NULL::uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_expense_account_id uuid;
  v_entry_id uuid;
  v_expense_id uuid;
  v_voucher_number bigint;
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
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية تسجيل مصروف في هذا الموقع' using errcode = '42501';
  end if;

  if p_amount <= 0 then
    raise exception 'مبلغ يجب أن يكون أكبر من صفر';
  end if;

  select default_expense_account_id into v_expense_account_id
  from public.expense_categories where id = p_expense_category_id and organization_id = p_organization_id;
  if v_expense_account_id is null then
    raise exception 'expense category does not belong to this organization';
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

  -- Uses the _internal variants (see 20260813000005): the
  -- finance.entries.create check above already authorizes this whole
  -- atomic "record expense + post its own entry" action, so it doesn't
  -- re-demand finance.entries.post from the same caller.
  v_entry_id := public.create_journal_entry_internal(
    p_organization_id, p_resort_id, p_fiscal_period_id, p_expense_date,
    coalesce(p_description, 'Expense'), 'JOURNAL_VOUCHER',
    jsonb_build_array(
      jsonb_build_object('account_id', v_expense_account_id, 'debit', p_amount, 'credit', 0),
      jsonb_build_object('account_id', p_payment_account_id, 'debit', 0, 'credit', p_amount)
    ),
    null
  );
  perform public.post_journal_entry_internal(v_entry_id);

  v_voucher_number := public.next_sequence_value(p_organization_id, null, 'expense');

  insert into public.expenses (
    organization_id, resort_id, expense_category_id, description, amount, expense_date,
    payment_account_id, voucher_number, journal_entry_id, cashier_session_id, created_by
  ) values (
    p_organization_id, p_resort_id, p_expense_category_id, p_description, p_amount, p_expense_date,
    p_payment_account_id, v_voucher_number, v_entry_id, p_cashier_session_id, auth.uid()
  )
  returning id into v_expense_id;

  if p_cashier_session_id is not null then
    insert into public.cash_transactions (organization_id, session_id, type, amount, description, created_by)
    values (p_organization_id, p_cashier_session_id, 'PAYMENT', p_amount, 'Expense ' || v_expense_id, auth.uid());
  end if;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'expense.recorded', 'expense', v_expense_id,
    jsonb_build_object('amount', p_amount, 'voucher_number', v_voucher_number));

  return v_expense_id;
end;
$function$;

create or replace function public.record_online_payment(p_transaction_id uuid, p_webhook_event_id text, p_provider_payload jsonb DEFAULT NULL::jsonb)
 returns TABLE(status text, payment_id uuid, failure_code text, failure_message text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
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

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (null, v_txn.organization_id, v_txn.resort_id, 'online_payment.posted', 'online_payment_transaction', p_transaction_id,
    jsonb_build_object('payment_id', v_result.payment_id, 'amount', v_txn.amount, 'provider', v_txn.provider));

  return query select 'PAID'::text, v_result.payment_id, null::text, null::text;
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

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'supplier_payment.recorded', 'supplier_payment', v_payment_id,
    jsonb_build_object('amount', p_amount, 'wht_amount', v_total_wht, 'voucher_number', v_voucher_number));

  return v_payment_id;
end;
$function$;

create or replace function public.restore_unit(p_organization_id uuid, p_unit_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_resort_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'property.units.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك باستعادة الوحدة' using errcode = '42501';
  end if;

  select property_id into v_resort_id from public.units where id = p_unit_id and organization_id = p_organization_id;
  if v_resort_id is null then
    raise exception 'UNIT_NOT_FOUND: الوحدة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  update public.units
  set is_active = true,
      archived_at = null,
      archived_by = null
  where id = p_unit_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, v_resort_id, 'unit.restored', 'unit', p_unit_id, '{}'::jsonb);
end;
$function$;

create or replace function public.reverse_journal_entry(p_journal_entry_id uuid, p_reversal_fiscal_period_id uuid, p_reversal_date date, p_reason text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_original public.journal_entries;
  v_new_entry_id uuid;
  v_entry_number bigint;
  v_period public.fiscal_periods;
begin
  select * into v_original from public.journal_entries where id = p_journal_entry_id;
  if v_original.id is null then
    raise exception 'journal entry not found';
  end if;
  if v_original.status <> 'POSTED' then
    raise exception 'only posted entries can be reversed';
  end if;

  if not public.has_permission(auth.uid(), v_original.organization_id, 'finance.entries.reverse') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(v_original.organization_id) then
    raise exception 'organization is not active';
  end if;

  select * into v_period from public.fiscal_periods where id = p_reversal_fiscal_period_id;
  if v_period.id is null or v_period.organization_id <> v_original.organization_id then
    raise exception 'reversal fiscal period does not belong to this organization';
  end if;
  if v_period.status <> 'OPEN' then
    raise exception 'reversal fiscal period is not open';
  end if;

  insert into public.journal_entries (
    organization_id, resort_id, fiscal_period_id, entry_date, description,
    source_type, status, reversed_entry_id, created_by, posted_by, posted_at
  ) values (
    v_original.organization_id, v_original.resort_id, p_reversal_fiscal_period_id, p_reversal_date,
    coalesce(p_reason, 'Reversal of entry ' || coalesce(v_original.entry_number::text, v_original.id::text)),
    v_original.source_type, 'POSTED', v_original.id, auth.uid(), auth.uid(), now()
  )
  returning id into v_new_entry_id;

  v_entry_number := public.next_sequence_value(v_original.organization_id, null, 'journal_entry');
  update public.journal_entries set entry_number = v_entry_number where id = v_new_entry_id;

  insert into public.journal_entry_lines (journal_entry_id, line_number, account_id, description, debit, credit, cost_center_id, project_id)
  select v_new_entry_id, line_number, account_id, description, credit, debit, cost_center_id, project_id
  from public.journal_entry_lines
  where journal_entry_id = p_journal_entry_id;

  update public.journal_entries set status = 'REVERSED' where id = p_journal_entry_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (auth.uid(), v_original.organization_id, v_original.resort_id, 'journal_entry.reversed', 'journal_entry', p_journal_entry_id, p_reason,
    jsonb_build_object('reversal_entry_id', v_new_entry_id, 'reversal_entry_number', v_entry_number));

  return v_new_entry_id;
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
  values (auth.uid(), v_order.organization_id, v_order.resort_id, 'purchase_order.status_changed', 'purchase_order', p_purchase_order_id,
    jsonb_build_object('new_status', p_new_status));
end;
$function$;

create or replace function public.submit_journal_entry_for_review(p_journal_entry_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_entry public.journal_entries;
begin
  select * into v_entry from public.journal_entries where id = p_journal_entry_id;
  if v_entry.id is null then
    raise exception 'journal entry not found';
  end if;
  if not public.has_permission(auth.uid(), v_entry.organization_id, 'finance.entries.review') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية إرسال القيود للمراجعة' using errcode = '42501';
  end if;
  if v_entry.status <> 'DRAFT' then
    raise exception 'only draft entries can be submitted for review';
  end if;

  update public.journal_entries set status = 'UNDER_REVIEW' where id = p_journal_entry_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id)
  values (auth.uid(), v_entry.organization_id, v_entry.resort_id, 'journal_entry.submitted_for_review', 'journal_entry', p_journal_entry_id);
end;
$function$;

create or replace function public.update_resort(p_resort_id uuid, p_name text, p_code text, p_timezone text, p_address text DEFAULT NULL::text, p_governorate text DEFAULT NULL::text, p_phone text DEFAULT NULL::text, p_email text DEFAULT NULL::text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_organization_id uuid;
begin
  select organization_id into v_organization_id from public.resorts where id = p_resort_id;
  if v_organization_id is null then
    raise exception 'resort not found';
  end if;

  if not public.has_permission(auth.uid(), v_organization_id, 'tenant.settings.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  update public.resorts
  set name = p_name,
      code = p_code,
      timezone = coalesce(p_timezone, 'Africa/Cairo'),
      address = p_address,
      governorate = p_governorate,
      phone = p_phone,
      email = p_email,
      updated_by = auth.uid()
  where id = p_resort_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_organization_id, p_resort_id, 'resort.updated', 'resort', p_resort_id,
    jsonb_build_object('name', p_name, 'code', p_code));
end;
$function$;

create or replace function public.update_unit(p_organization_id uuid, p_unit_id uuid, p_code text, p_unit_type text, p_custom_type_label text DEFAULT NULL::text, p_building_id uuid DEFAULT NULL::uuid, p_zone_id uuid DEFAULT NULL::uuid, p_floor_number integer DEFAULT NULL::integer, p_area numeric DEFAULT NULL::numeric)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_resort_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'property.units.manage') then
    raise exception 'FORBIDDEN: غير مصرح لك بتعديل بيانات الوحدة' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'ORGANIZATION_INACTIVE: الكيان غير نشط';
  end if;

  -- resort_id is deliberately not a parameter: a unit never moves resorts
  -- from an edit form, only building/zone within its own resort.
  select property_id into v_resort_id from public.units where id = p_unit_id and organization_id = p_organization_id;
  if v_resort_id is null then
    raise exception 'UNIT_NOT_FOUND: الوحدة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  if p_building_id is not null and not exists (
    select 1 from public.buildings where id = p_building_id and property_id = v_resort_id
  ) then
    raise exception 'INVALID_BUILDING: المبنى المحدد لا ينتمي لموقع هذه الوحدة' using errcode = '22023';
  end if;

  if p_zone_id is not null and not exists (
    select 1 from public.zones where id = p_zone_id and property_id = v_resort_id
  ) then
    raise exception 'INVALID_ZONE: المنطقة المحددة لا تنتمي لموقع هذه الوحدة' using errcode = '22023';
  end if;

  update public.units
  set code = p_code,
      unit_type = p_unit_type,
      custom_type_label = case when p_unit_type = 'OTHER' then p_custom_type_label else null end,
      building_id = p_building_id,
      zone_id = p_zone_id,
      floor_number = p_floor_number,
      area = p_area
  where id = p_unit_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, v_resort_id, 'unit.updated', 'unit', p_unit_id,
    jsonb_build_object('code', p_code, 'unit_type', p_unit_type));
exception
  when unique_violation then
    raise exception 'DUPLICATE_CODE: رمز الوحدة ده مستخدم بالفعل في نفس الموقع' using errcode = '23505';
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

  if not public.has_financial_permission(p_organization_id, 'finance.suppliers.void', v_payment.resort_id) then
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
    p_organization_id, v_payment.resort_id, p_fiscal_period_id, current_date,
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
  values (auth.uid(), p_organization_id, v_payment.resort_id, 'supplier_payment.reversed', 'supplier_payment', p_payment_id, v_reason,
    jsonb_build_object('reversal_entry_id', v_entry_id, 'original_amount', v_payment.amount, 'affected_invoice_ids', to_jsonb(coalesce(v_affected_invoice_ids, array[]::uuid[]))));

  return v_entry_id;
end;
$function$;
