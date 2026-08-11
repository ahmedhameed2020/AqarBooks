-- Phase 6 database integrity tests. Self-contained: ephemeral org, resort,
-- cloned COA, fiscal period, a supplier, an expense category, and a
-- cashbox+session (to prove the expense engine finally produces a PAYMENT
-- cash_transaction, closing the gap noted in the Phase 5 report). Archives
-- the test org (never deletes) when done. Results land in a temp table.

select set_config('request.jwt.claim.sub', 'b66490aa-a3a7-4005-add2-1112c660b0b4', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
set local role authenticated;

create temporary table _test_results (
  seq int generated always as identity,
  test text,
  result text,
  detail text
);

do $$
declare
  v_org_id uuid;
  v_resort_id uuid;
  v_year_id uuid;
  v_period_open uuid;
  v_cash_id uuid;
  v_expense_id uuid;
  v_payable_id uuid;
  v_supplier_id uuid;
  v_category_id uuid;
  v_cashbox_id uuid;
  v_session_id uuid;
  v_po_id uuid;
  v_invoice_id uuid;
  v_invoice_id_2 uuid;
  v_payment_id uuid;
  v_payment_id_2 uuid;
  v_expense_voucher_id uuid;
  v_status text;
  v_error_ok boolean;
  v_last_error text;
  v_debit_total numeric;
  v_credit_total numeric;
  v_cash_txn_count int;
begin
  ---------------------------------------------------------------------
  -- Setup
  ---------------------------------------------------------------------
  v_org_id := public.create_organization('Phase6 Purchasing Test', 'phase6-purchasing-test-' || extract(epoch from now())::bigint, 'EGP', 'STARTER');
  v_resort_id := public.create_resort(v_org_id, 'Test Resort', 'TR1', 'Africa/Cairo');
  perform public.clone_chart_of_accounts_template(v_org_id, 'RESORT_STANDARD');
  v_year_id := public.create_fiscal_year(v_org_id, 'TestYear', '2026-01-01', '2026-12-31');
  select id into v_period_open from public.fiscal_periods where fiscal_year_id = v_year_id and period_number = 1;
  perform public.set_fiscal_period_status(v_period_open, 'OPEN', 'test setup');

  select id into v_cash_id from public.chart_of_accounts where organization_id = v_org_id and code = '1110';
  select id into v_expense_id from public.chart_of_accounts where organization_id = v_org_id and code = '5200';
  select id into v_payable_id from public.chart_of_accounts where organization_id = v_org_id and code = '2100';

  insert into public.suppliers (organization_id, name, payable_account_id)
  values (v_org_id, 'Test Supplier', v_payable_id) returning id into v_supplier_id;
  insert into public.expense_categories (organization_id, name_ar, name_en, default_expense_account_id)
  values (v_org_id, 'صيانة', 'Maintenance', v_expense_id) returning id into v_category_id;
  insert into public.cashboxes (organization_id, resort_id, name, gl_account_id)
  values (v_org_id, v_resort_id, 'Main Box', v_cash_id) returning id into v_cashbox_id;
  v_session_id := public.open_cashier_session(v_org_id, v_resort_id, v_cashbox_id, 500);

  insert into _test_results (test, result, detail) values ('Setup', 'INFO', 'org=' || v_org_id);

  ---------------------------------------------------------------------
  -- TEST 1: purchase order requires explicit approval (no auto-commitment)
  ---------------------------------------------------------------------
  v_po_id := public.create_purchase_order(v_org_id, v_resort_id, v_supplier_id, null, 'Test PO', 1000, '2026-01-05');
  select status, order_number is null into v_status, v_error_ok from public.purchase_orders where id = v_po_id;
  v_error_ok := (v_status = 'DRAFT' and v_error_ok);
  insert into _test_results (test, result, detail)
  values ('1: new PO is DRAFT with no order number until approved', case when v_error_ok then 'PASS' else 'FAIL' end, 'status=' || v_status);

  ---------------------------------------------------------------------
  -- TEST 2: illegal PO transition rejected (DRAFT -> RECEIVED, skipping APPROVED)
  ---------------------------------------------------------------------
  v_error_ok := false;
  begin
    perform public.set_purchase_order_status(v_po_id, 'RECEIVED');
  exception when others then
    v_last_error := sqlerrm;
    v_error_ok := v_last_error ilike '%illegal purchase order status transition%';
  end;
  insert into _test_results (test, result, detail)
  values ('2: illegal PO transition rejected', case when v_error_ok then 'PASS' else 'FAIL' end, v_last_error);

  perform public.approve_purchase_order(v_po_id);

  ---------------------------------------------------------------------
  -- TEST 3: posting a supplier invoice produces a balanced journal entry
  ---------------------------------------------------------------------
  v_invoice_id := public.post_supplier_invoice(v_org_id, v_resort_id, v_supplier_id, v_po_id, 'INV-001', v_expense_id, 1000, '2026-01-06', '2026-02-05', v_period_open);
  select sum(l.debit), sum(l.credit) into v_debit_total, v_credit_total
  from public.journal_entry_lines l
  join public.journal_entries je on je.id = l.journal_entry_id
  where je.id = (select journal_entry_id from public.supplier_invoices where id = v_invoice_id);
  v_error_ok := (v_debit_total = 1000 and v_credit_total = 1000);
  insert into _test_results (test, result, detail)
  values ('3: supplier invoice posts a balanced entry', case when v_error_ok then 'PASS' else 'FAIL' end, 'debit=' || v_debit_total || ' credit=' || v_credit_total);

  ---------------------------------------------------------------------
  -- TEST 4: over-allocation on supplier payment rejected
  ---------------------------------------------------------------------
  v_error_ok := false;
  begin
    perform public.record_supplier_payment(
      v_org_id, v_resort_id, v_supplier_id, 1500, 'BANK_TRANSFER', '2026-01-10', v_cash_id, v_period_open,
      jsonb_build_array(jsonb_build_object('invoice_id', v_invoice_id, 'amount', 1500)),
      'test-over-allocation', null
    );
  exception when others then
    v_last_error := sqlerrm;
    v_error_ok := v_last_error ilike '%exceeds remaining balance%';
  end;
  insert into _test_results (test, result, detail)
  values ('4: supplier payment over-allocation rejected', case when v_error_ok then 'PASS' else 'FAIL' end, v_last_error);

  ---------------------------------------------------------------------
  -- TEST 5: partial supplier payment works
  ---------------------------------------------------------------------
  v_payment_id := public.record_supplier_payment(
    v_org_id, v_resort_id, v_supplier_id, 400, 'BANK_TRANSFER', '2026-01-10', v_cash_id, v_period_open,
    jsonb_build_array(jsonb_build_object('invoice_id', v_invoice_id, 'amount', 400)),
    'test-partial-supplier-payment', null
  );
  select status into v_status from public.supplier_invoices where id = v_invoice_id;
  v_error_ok := (v_status = 'PARTIALLY_PAID');
  insert into _test_results (test, result, detail)
  values ('5: partial supplier payment sets PARTIALLY_PAID', case when v_error_ok then 'PASS' else 'FAIL' end, 'status=' || v_status);

  ---------------------------------------------------------------------
  -- TEST 6: multi-invoice allocation in one payment
  ---------------------------------------------------------------------
  v_invoice_id_2 := public.post_supplier_invoice(v_org_id, v_resort_id, v_supplier_id, null, 'INV-002', v_expense_id, 200, '2026-01-07', '2026-02-06', v_period_open);
  v_payment_id_2 := public.record_supplier_payment(
    v_org_id, v_resort_id, v_supplier_id, 800, 'BANK_TRANSFER', '2026-01-12', v_cash_id, v_period_open,
    jsonb_build_array(
      jsonb_build_object('invoice_id', v_invoice_id, 'amount', 600),
      jsonb_build_object('invoice_id', v_invoice_id_2, 'amount', 200)
    ),
    'test-multi-invoice-supplier-payment', null
  );
  select status into v_status from public.supplier_invoices where id = v_invoice_id;
  v_error_ok := (v_status = 'PAID');
  select status into v_status from public.supplier_invoices where id = v_invoice_id_2;
  v_error_ok := v_error_ok and (v_status = 'PAID');
  insert into _test_results (test, result, detail)
  values ('6: multi-invoice allocation pays both invoices in full', case when v_error_ok then 'PASS' else 'FAIL' end, null);

  ---------------------------------------------------------------------
  -- TEST 7: expense voucher through an open cashier session produces a
  -- PAYMENT cash_transaction (closes the Phase 5 gap)
  ---------------------------------------------------------------------
  v_expense_voucher_id := public.record_expense(
    v_org_id, v_resort_id, v_category_id, 'Petty cash purchase', 50, '2026-01-15', v_cash_id, v_period_open, v_session_id
  );
  select count(*) into v_cash_txn_count
  from public.cash_transactions
  where session_id = v_session_id and type = 'PAYMENT' and amount = 50;
  v_error_ok := (v_cash_txn_count = 1);
  insert into _test_results (test, result, detail)
  values ('7: expense via cashier session logs a PAYMENT cash_transaction', case when v_error_ok then 'PASS' else 'FAIL' end, 'count=' || v_cash_txn_count);

  ---------------------------------------------------------------------
  -- Cleanup
  ---------------------------------------------------------------------
  perform public.close_cashier_session(v_session_id, 450);
  perform public.set_organization_status(v_org_id, 'ARCHIVED', 'phase6 integrity test cleanup');
  insert into _test_results (test, result, detail) values ('Cleanup', 'INFO', 'org ' || v_org_id || ' archived');
end $$;

select seq, test, result, detail from _test_results order by seq;
