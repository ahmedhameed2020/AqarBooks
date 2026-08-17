-- Phase 5 database integrity tests (spec §38 "Cashier" + cheque lifecycle).
-- Self-contained: ephemeral org, resort, cloned COA, fiscal period, unit,
-- due type, a due, a cashbox, and a bank account. Archives the test org
-- (never deletes) when done. Results land in a temp table and are SELECTed
-- at the end so they show up in the Results grid (not just server logs).

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
  v_revenue_id uuid;
  v_receivable_id uuid;
  v_due_type_id uuid;
  v_unit_id uuid;
  v_due_id uuid;
  v_due_id_2 uuid;
  v_cashbox_a uuid;
  v_cashbox_b uuid;
  v_session_id uuid;
  v_closed_session_id uuid;
  v_bank_id uuid;
  v_bank_account_id uuid;
  v_cheque_id uuid;
  v_payment_id uuid;
  v_status text;
  v_variance numeric;
  v_error_ok boolean;
  v_last_error text;
begin
  ---------------------------------------------------------------------
  -- Setup
  ---------------------------------------------------------------------
  v_org_id := public.create_organization('Phase5 Treasury Test', 'phase5-treasury-test-' || extract(epoch from now())::bigint, 'EGP', 'STARTER');
  v_resort_id := public.create_resort(v_org_id, 'Test Resort', 'TR1', 'Africa/Cairo');
  perform public.clone_chart_of_accounts_template(v_org_id, 'RESORT_STANDARD');
  v_year_id := public.create_fiscal_year(v_org_id, 'TestYear', '2026-01-01', '2026-12-31');
  select id into v_period_open from public.fiscal_periods where fiscal_year_id = v_year_id and period_number = 1;
  perform public.set_fiscal_period_status(v_period_open, 'OPEN', 'test setup');

  select id into v_cash_id from public.chart_of_accounts where organization_id = v_org_id and code = '1110';
  select id into v_revenue_id from public.chart_of_accounts where organization_id = v_org_id and code = '4100';
  select id into v_receivable_id from public.chart_of_accounts where organization_id = v_org_id and code = '1130';

  insert into public.due_types (organization_id, name_ar, name_en, default_revenue_account_id)
  values (v_org_id, 'صيانة', 'Maintenance', v_revenue_id) returning id into v_due_type_id;
  insert into public.units (organization_id, property_id, code, unit_type)
  values (v_org_id, v_resort_id, 'U-1', 'VILLA') returning id into v_unit_id;

  v_due_id := public.issue_due(v_org_id, v_resort_id, v_unit_id, v_due_type_id, v_receivable_id, 200, '2026-01-05', '2026-01-31', 'Due A', v_period_open);
  v_due_id_2 := public.issue_due(v_org_id, v_resort_id, v_unit_id, v_due_type_id, v_receivable_id, 300, '2026-01-05', '2026-01-31', 'Due B', v_period_open);

  insert into public.cashboxes (organization_id, property_id, name, gl_account_id) values (v_org_id, v_resort_id, 'Main Box', v_cash_id) returning id into v_cashbox_a;
  insert into public.cashboxes (organization_id, property_id, name, gl_account_id) values (v_org_id, v_resort_id, 'Second Box', v_cash_id) returning id into v_cashbox_b;

  insert into public.banks (organization_id, name_ar, name_en) values (v_org_id, 'بنك تجريبي', 'Test Bank') returning id into v_bank_id;
  insert into public.bank_accounts (organization_id, property_id, bank_id, account_name, account_number, gl_account_id)
  values (v_org_id, v_resort_id, v_bank_id, 'Main Account', '12345', v_cash_id) returning id into v_bank_account_id;

  insert into _test_results (test, result, detail) values ('Setup', 'INFO', 'org=' || v_org_id);

  ---------------------------------------------------------------------
  -- TEST 1: cannot transact through a session that isn't open
  ---------------------------------------------------------------------
  v_closed_session_id := public.open_cashier_session(v_org_id, v_resort_id, v_cashbox_b, 0);
  perform public.close_cashier_session(v_closed_session_id, 0);

  v_error_ok := false;
  begin
    perform public.record_payment(
      v_org_id, v_resort_id, null, v_unit_id, 50, 'CASH', '2026-01-10', v_cash_id, v_period_open,
      jsonb_build_array(jsonb_build_object('due_id', v_due_id, 'amount', 50)),
      'test-no-open-session', v_closed_session_id
    );
  exception when others then
    v_last_error := sqlerrm;
    v_error_ok := v_last_error ilike '%not open%';
  end;
  insert into _test_results (test, result, detail)
  values ('1: no transaction without an open session', case when v_error_ok then 'PASS' else 'FAIL' end, v_last_error);

  ---------------------------------------------------------------------
  -- TEST 2: deposit account must match the session's own cashbox
  ---------------------------------------------------------------------
  v_session_id := public.open_cashier_session(v_org_id, v_resort_id, v_cashbox_a, 100);

  declare v_other_cash_id uuid;
  begin
    select id into v_other_cash_id from public.chart_of_accounts where organization_id = v_org_id and code = '1120';
    v_error_ok := false;
    begin
      perform public.record_payment(
        v_org_id, v_resort_id, null, v_unit_id, 50, 'CASH', '2026-01-10', v_other_cash_id, v_period_open,
        jsonb_build_array(jsonb_build_object('due_id', v_due_id, 'amount', 50)),
        'test-wrong-cashbox-account', v_session_id
      );
    exception when others then
      v_last_error := sqlerrm;
      v_error_ok := v_last_error ilike '%does not match%';
    end;
    insert into _test_results (test, result, detail)
    values ('2: deposit account must match session cashbox', case when v_error_ok then 'PASS' else 'FAIL' end, v_last_error);
  end;

  ---------------------------------------------------------------------
  -- TEST 3: closing computes and records the variance
  ---------------------------------------------------------------------
  perform public.record_payment(
    v_org_id, v_resort_id, null, v_unit_id, 50, 'CASH', '2026-01-10', v_cash_id, v_period_open,
    jsonb_build_array(jsonb_build_object('due_id', v_due_id, 'amount', 50)),
    'test-cashier-payment-1', v_session_id
  );
  perform public.close_cashier_session(v_session_id, 200);
  select status, variance into v_status, v_variance from public.cashier_sessions where id = v_session_id;
  v_error_ok := (v_status = 'CLOSED' and v_variance = 50);
  insert into _test_results (test, result, detail)
  values ('3: closing records variance', case when v_error_ok then 'PASS' else 'FAIL' end, 'status=' || v_status || ' variance=' || v_variance);

  ---------------------------------------------------------------------
  -- TEST 4: a closed session cannot be closed again or edited directly
  ---------------------------------------------------------------------
  v_error_ok := false;
  begin
    perform public.close_cashier_session(v_session_id, 999);
  exception when others then
    v_error_ok := sqlerrm ilike '%only an open session%';
  end;
  insert into _test_results (test, result, detail)
  values ('4a: cannot re-close a closed session', case when v_error_ok then 'PASS' else 'FAIL' end, null);

  update public.cashier_sessions set actual_closing_balance = 999999 where id = v_session_id;
  select (actual_closing_balance <> 999999) into v_error_ok from public.cashier_sessions where id = v_session_id;
  insert into _test_results (test, result, detail)
  values ('4b: closed session immutable via direct client write', case when v_error_ok then 'PASS' else 'FAIL' end, null);

  ---------------------------------------------------------------------
  -- TEST 5: illegal cheque status transition is rejected
  ---------------------------------------------------------------------
  v_cheque_id := public.record_incoming_cheque(v_org_id, v_resort_id, v_bank_account_id, 'CHQ-001', 300, null, '2026-01-08', '2026-02-01');
  v_error_ok := false;
  begin
    perform public.set_cheque_status(v_cheque_id, 'CLEARED', 'skip deposit step');
  exception when others then
    v_last_error := sqlerrm;
    v_error_ok := v_last_error ilike '%illegal cheque status transition%';
  end;
  insert into _test_results (test, result, detail)
  values ('5: illegal cheque transition rejected', case when v_error_ok then 'PASS' else 'FAIL' end, v_last_error);

  ---------------------------------------------------------------------
  -- TEST 6: full valid cheque lifecycle clears and produces a payment
  ---------------------------------------------------------------------
  perform public.set_cheque_status(v_cheque_id, 'DEPOSITED', 'deposited at bank');
  v_payment_id := public.clear_incoming_cheque(
    v_cheque_id, '2026-01-15', v_period_open,
    jsonb_build_array(jsonb_build_object('due_id', v_due_id_2, 'amount', 300))
  );
  select status into v_status from public.cheques where id = v_cheque_id;
  v_error_ok := (v_status = 'CLEARED');
  select status into v_status from public.dues where id = v_due_id_2;
  v_error_ok := v_error_ok and (v_status = 'PAID');
  insert into _test_results (test, result, detail)
  values ('6: cheque clears, produces payment, due paid', case when v_error_ok then 'PASS' else 'FAIL' end, null);

  ---------------------------------------------------------------------
  -- Cleanup
  ---------------------------------------------------------------------
  perform public.set_organization_status(v_org_id, 'ARCHIVED', 'phase5 integrity test cleanup');
  insert into _test_results (test, result, detail) values ('Cleanup', 'INFO', 'org ' || v_org_id || ' archived');
end $$;

select seq, test, result, detail from _test_results order by seq;
