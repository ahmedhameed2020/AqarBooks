-- Enforces real purchase-order matching when an invoice is linked to one
-- (p_purchase_order_id was accepted since the original migration but never
-- validated -- an invoice could be posted for any amount against any PO,
-- or against someone else's PO, silently defeating the point of having
-- purchase orders as a spending control).
--
-- Rules (linking a PO stays optional -- not every expense goes through a
-- requisition -- but *if* one is linked, these are enforced):
--   1. The PO must belong to the same organization and the same supplier
--      as the invoice.
--   2. The PO must be APPROVED or RECEIVED (a DRAFT PO isn't a real
--      commitment yet; CANCELLED is dead).
--   3. Matched against the invoice's net (pre-VAT) amount, since a PO
--      represents the value of goods/services approved, not the tax on
--      top of them: sum(net_amount) of every non-cancelled invoice
--      already linked to this PO, plus this invoice, must not exceed the
--      PO's amount. Multiple partial-delivery invoices against one PO are
--      allowed as long as they stay within that ceiling.
--
-- Same argument list as the version created in 20260812000025, so a plain
-- CREATE OR REPLACE is a real replacement (no new overload).
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
    -- Serializes concurrent invoice postings against the same PO so two
    -- concurrent "almost at the ceiling" invoices can't both read a stale
    -- already_invoiced total and both pass the check.
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

  v_entry_id := public.create_journal_entry(
    p_organization_id, p_resort_id, p_fiscal_period_id, p_invoice_date,
    'Supplier invoice ' || p_invoice_number, 'JOURNAL_VOUCHER',
    v_debit_lines || jsonb_build_array(jsonb_build_object('account_id', v_payable_account_id, 'debit', 0, 'credit', v_gross_amount)),
    null
  );
  perform public.post_journal_entry(v_entry_id);

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
