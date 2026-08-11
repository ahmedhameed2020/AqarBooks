-- Phase 4 database integrity tests (spec §38 "Payments").
-- Self-contained: creates its own ephemeral organization, resort, COA
-- (cloned template), fiscal year/period, a unit, a due type, and a due,
-- then exercises the payment/allocation engine. Archives the test org
-- (never deletes) when done.

select set_config('request.jwt.claim.sub', 'b66490aa-a3a7-4005-add2-1112c660b0b4', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
set local role authenticated;

do $$
declare
  v_org_id uuid;
  v_resort_id uuid;
  v_year_id uuid;
  v_period_open uuid;
  v_cash_id uuid;
  v_revenue_id uuid;
  v_receivable_id uuid;
  v_due_type_id uuid;
  v_unit_id uuid;
  v_due_id uuid;
  v_due_id_2 uuid;
  v_payment_id uuid;
  v_payment_id_2 uuid;
  v_status text;
  v_error_ok boolean;
  v_last_error text;
begin
  ---------------------------------------------------------------------
  -- Setup
  ---------------------------------------------------------------------
  v_org_id := public.create_organization('Phase4 Receivables Test', 'phase4-receivables-test-' || extract(epoch from now())::bigint, 'EGP', 'STARTER');
  v_resort_id := public.create_resort(v_org_id, 'Test Resort', 'TR1', 'Africa/Cairo');
  perform public.clone_chart_of_accounts_template(v_org_id, 'RESORT_STANDARD');
  v_year_id := public.create_fiscal_year(v_org_id, 'TestYear', '2026-01-01', '2026-12-31');
  select id into v_period_open from public.fiscal_periods where fiscal_year_id = v_year_id and period_number = 1;
  perform public.set_fiscal_period_status(v_period_open, 'OPEN', 'test setup');

  select id into v_cash_id from public.chart_of_accounts where organization_id = v_org_id and code = '1110';
  select id into v_revenue_id from public.chart_of_accounts where organization_id = v_org_id and code = '4100';
  select id into v_receivable_id from public.chart_of_accounts where organization_id = v_org_id and code = '1130';

  insert into public.due_types (organization_id, name_ar, name_en, default_revenue_account_id)
  values (v_org_id, 'صيانة', 'Maintenance', v_revenue_id)
  returning id into v_due_type_id;

  insert into public.units (organization_id, resort_id, code, unit_type)
  values (v_org_id, v_resort_id, 'U-1', 'VILLA')
  returning id into v_unit_id;

  raise notice '--- Setup complete: org=%, resort=%, unit=%', v_org_id, v_resort_id, v_unit_id;

  ---------------------------------------------------------------------
  -- Issue a 1000 due
  ---------------------------------------------------------------------
  v_due_id := public.issue_due(
    v_org_id, v_resort_id, v_unit_id, v_due_type_id, v_receivable_id,
    1000, '2026-01-05', '2026-01-31', 'Q1 maintenance', v_period_open
  );
  raise notice '--- Due issued: % (amount 1000)', v_due_id;

  ---------------------------------------------------------------------
  -- TEST 1: partial payment works and sets PARTIALLY_PAID
  ---------------------------------------------------------------------
  v_payment_id := public.record_payment(
    v_org_id, v_resort_id, null, v_unit_id, 400, 'CASH', '2026-01-10', v_cash_id, v_period_open,
    jsonb_build_array(jsonb_build_object('due_id', v_due_id, 'amount', 400)),
    'test-partial-payment-1'
  );
  select status into v_status from public.dues where id = v_due_id;
  raise notice '% TEST 1 (partial payment sets PARTIALLY_PAID, status=%)', case when v_status = 'PARTIALLY_PAID' then 'PASS' else 'FAIL' end, v_status;

  ---------------------------------------------------------------------
  -- TEST 2: over-allocation is rejected (remaining is only 600)
  ---------------------------------------------------------------------
  v_error_ok := false;
  begin
    perform public.record_payment(
      v_org_id, v_resort_id, null, v_unit_id, 700, 'CASH', '2026-01-11', v_cash_id, v_period_open,
      jsonb_build_array(jsonb_build_object('due_id', v_due_id, 'amount', 700)),
      'test-over-allocation-1'
    );
  exception when others then
    v_last_error := sqlerrm;
    v_error_ok := v_last_error ilike '%exceeds remaining balance%';
  end;
  raise notice '% TEST 2 (over-allocation rejected): %', case when v_error_ok then 'PASS' else 'FAIL' end, v_last_error;

  ---------------------------------------------------------------------
  -- TEST 3: multi-due allocation works (issue a 2nd due, pay both in one payment)
  ---------------------------------------------------------------------
  v_due_id_2 := public.issue_due(
    v_org_id, v_resort_id, v_unit_id, v_due_type_id, v_receivable_id,
    500, '2026-01-06', '2026-01-31', 'Extra fee', v_period_open
  );
  v_payment_id_2 := public.record_payment(
    v_org_id, v_resort_id, null, v_unit_id, 1100, 'BANK_TRANSFER', '2026-01-12', v_cash_id, v_period_open,
    jsonb_build_array(
      jsonb_build_object('due_id', v_due_id, 'amount', 600),
      jsonb_build_object('due_id', v_due_id_2, 'amount', 500)
    ),
    'test-multi-due-1'
  );
  select status into v_status from public.dues where id = v_due_id;
  v_error_ok := (v_status = 'PAID');
  select status into v_status from public.dues where id = v_due_id_2;
  v_error_ok := v_error_ok and (v_status = 'PAID');
  raise notice '% TEST 3 (multi-due allocation pays both dues in full)', case when v_error_ok then 'PASS' else 'FAIL' end;

  ---------------------------------------------------------------------
  -- TEST 4: cross-tenant allocation is rejected
  ---------------------------------------------------------------------
  declare
    v_other_org_id uuid;
    v_other_resort_id uuid;
    v_other_due_type_id uuid;
    v_other_unit_id uuid;
    v_other_due_id uuid;
    v_other_revenue_id uuid;
    v_other_receivable_id uuid;
    v_other_cash_id uuid;
  begin
    v_other_org_id := public.create_organization('Phase4 Cross Tenant Test', 'phase4-cross-tenant-' || extract(epoch from now())::bigint, 'EGP', 'STARTER');
    v_other_resort_id := public.create_resort(v_other_org_id, 'Other Resort', 'OR1', 'Africa/Cairo');
    perform public.clone_chart_of_accounts_template(v_other_org_id, 'RESORT_STANDARD');
    select id into v_other_revenue_id from public.chart_of_accounts where organization_id = v_other_org_id and code = '4100';
    select id into v_other_receivable_id from public.chart_of_accounts where organization_id = v_other_org_id and code = '1130';
    select id into v_other_cash_id from public.chart_of_accounts where organization_id = v_other_org_id and code = '1110';
    insert into public.due_types (organization_id, name_ar, name_en, default_revenue_account_id)
    values (v_other_org_id, 'صيانة', 'Maintenance', v_other_revenue_id) returning id into v_other_due_type_id;
    insert into public.units (organization_id, resort_id, code, unit_type)
    values (v_other_org_id, v_other_resort_id, 'OU-1', 'VILLA') returning id into v_other_unit_id;

    declare v_other_year_id uuid; v_other_period_id uuid;
    begin
      v_other_year_id := public.create_fiscal_year(v_other_org_id, 'TestYear', '2026-01-01', '2026-12-31');
      select id into v_other_period_id from public.fiscal_periods where fiscal_year_id = v_other_year_id and period_number = 1;
      perform public.set_fiscal_period_status(v_other_period_id, 'OPEN', 'test setup');
      v_other_due_id := public.issue_due(v_other_org_id, v_other_resort_id, v_other_unit_id, v_other_due_type_id, v_other_receivable_id, 300, '2026-01-05', '2026-01-31', 'Other org due', v_other_period_id);
    end;

    v_error_ok := false;
    begin
      -- Attempt to pay the OTHER org's due using THIS org's id/period/account context.
      perform public.record_payment(
        v_org_id, v_resort_id, null, v_unit_id, 300, 'CASH', '2026-01-13', v_cash_id, v_period_open,
        jsonb_build_array(jsonb_build_object('due_id', v_other_due_id, 'amount', 300)),
        'test-cross-tenant-1'
      );
    exception when others then
      v_last_error := sqlerrm;
      v_error_ok := v_last_error ilike '%does not belong to this organization%';
    end;
    raise notice '% TEST 4 (cross-tenant allocation rejected): %', case when v_error_ok then 'PASS' else 'FAIL' end, v_last_error;

    perform public.set_organization_status(v_other_org_id, 'ARCHIVED', 'phase4 integrity test cleanup');
  end;

  ---------------------------------------------------------------------
  -- TEST 5: duplicate payment retry does not duplicate (idempotency)
  ---------------------------------------------------------------------
  declare v_retry_payment_id uuid;
  begin
    v_retry_payment_id := public.record_payment(
      v_org_id, v_resort_id, null, v_unit_id, 400, 'CASH', '2026-01-10', v_cash_id, v_period_open,
      jsonb_build_array(jsonb_build_object('due_id', v_due_id, 'amount', 400)),
      'test-partial-payment-1' -- same key as TEST 1
    );
    raise notice '% TEST 5 (duplicate payment retry returns same id)', case when v_retry_payment_id = v_payment_id then 'PASS' else 'FAIL' end;
  end;

  ---------------------------------------------------------------------
  -- Cleanup
  ---------------------------------------------------------------------
  perform public.set_organization_status(v_org_id, 'ARCHIVED', 'phase4 integrity test cleanup');
  raise notice '--- Done. Test org % archived.', v_org_id;
end $$;
