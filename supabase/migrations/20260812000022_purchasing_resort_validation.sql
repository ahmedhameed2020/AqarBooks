-- Same resort-ownership gap as record_expense/record_supplier_payment,
-- fixed here for the remaining three RPCs that accept p_resort_id:
-- create_purchase_request, create_purchase_order, post_supplier_invoice.
-- (decide_purchase_request / approve_purchase_order / set_purchase_order_status
-- take no p_resort_id -- they derive the resort from the existing request/
-- order row, so there is nothing to validate there.)
--
-- Permission keys are unchanged from the current, verified RPC bodies:
-- create_purchase_request and create_purchase_order both check
-- 'purchasing.requests.create'; post_supplier_invoice checks
-- 'finance.entries.create'. Upgraded from has_permission (org-level only)
-- to has_financial_permission (org + resort-scoped), matching every other
-- financial RPC fixed this session.

create or replace function public.create_purchase_request(
  p_organization_id uuid,
  p_resort_id uuid,
  p_description text,
  p_estimated_amount numeric
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id)
  values (auth.uid(), p_organization_id, p_resort_id, 'purchase_request.created', 'purchase_request', v_request_id);

  return v_request_id;
end;
$$;

create or replace function public.create_purchase_order(
  p_organization_id uuid,
  p_resort_id uuid,
  p_supplier_id uuid,
  p_purchase_request_id uuid,
  p_description text,
  p_amount numeric,
  p_order_date date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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
    organization_id, resort_id, supplier_id, purchase_request_id, description, amount, order_date, created_by
  ) values (
    p_organization_id, p_resort_id, p_supplier_id, p_purchase_request_id, p_description, p_amount, p_order_date, auth.uid()
  )
  returning id into v_order_id;

  return v_order_id;
end;
$$;

create or replace function public.post_supplier_invoice(
  p_organization_id uuid,
  p_resort_id uuid,
  p_supplier_id uuid,
  p_purchase_order_id uuid,
  p_invoice_number text,
  p_expense_account_id uuid,
  p_amount numeric,
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
  if p_amount <= 0 then
    raise exception 'amount must be positive';
  end if;

  select payable_account_id into v_payable_account_id
  from public.suppliers where id = p_supplier_id and organization_id = p_organization_id;
  if v_payable_account_id is null then
    raise exception 'supplier does not belong to this organization';
  end if;

  v_entry_id := public.create_journal_entry(
    p_organization_id, p_resort_id, p_fiscal_period_id, p_invoice_date,
    'Supplier invoice ' || p_invoice_number, 'JOURNAL_VOUCHER',
    jsonb_build_array(
      jsonb_build_object('account_id', p_expense_account_id, 'debit', p_amount, 'credit', 0),
      jsonb_build_object('account_id', v_payable_account_id, 'debit', 0, 'credit', p_amount)
    ),
    null
  );
  perform public.post_journal_entry(v_entry_id);

  insert into public.supplier_invoices (
    organization_id, resort_id, supplier_id, purchase_order_id, invoice_number,
    expense_account_id, payable_account_id, amount, invoice_date, due_date, journal_entry_id, created_by
  ) values (
    p_organization_id, p_resort_id, p_supplier_id, p_purchase_order_id, p_invoice_number,
    p_expense_account_id, v_payable_account_id, p_amount, p_invoice_date, p_due_date, v_entry_id, auth.uid()
  )
  returning id into v_invoice_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'supplier_invoice.posted', 'supplier_invoice', v_invoice_id,
    jsonb_build_object('amount', p_amount, 'invoice_number', p_invoice_number));

  return v_invoice_id;
end;
$$;
