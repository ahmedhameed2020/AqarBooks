-- Phase 7 report correctness tests. Self-contained: ephemeral org, resort,
-- cloned COA, fiscal period, and three known journal entries whose expected
-- totals are hand-computed below, so this isn't just "the function ran
-- without erroring" but "the function returns the arithmetically correct
-- answer." Archives the test org (never deletes) when done.

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
  v_expense_id uuid;
  v_entry_1 uuid;
  v_entry_2 uuid;
  v_entry_3 uuid;
  v_tb_cash_debit numeric;
  v_tb_cash_credit numeric;
  v_tb_revenue_balance numeric;
  v_tb_expense_balance numeric;
  v_total_debit numeric;
  v_total_credit numeric;
  v_ledger_final_balance numeric;
  v_error_ok boolean;
begin
  ---------------------------------------------------------------------
  -- Setup: three known entries.
  --   1) Dr Cash 1000 / Cr Revenue 1000   (cash sale)
  --   2) Dr Expense 300 / Cr Cash 300     (cash expense)
  --   3) Dr Cash 200 / Cr Revenue 200     (another cash sale)
  -- Expected: Cash account debit=1200, credit=300, balance=900 (DEBIT normal)
  --           Revenue balance = 1200 (CREDIT normal)
  --           Expense balance = 300 (DEBIT normal)
  --           Trial balance totals: debit=1500, credit=1500
  ---------------------------------------------------------------------
  v_org_id := public.create_organization('Phase7 Reports Test', 'phase7-reports-test-' || extract(epoch from now())::bigint, 'EGP', 'STARTER');
  v_resort_id := public.create_resort(v_org_id, 'Test Resort', 'TR1', 'Africa/Cairo');
  perform public.clone_chart_of_accounts_template(v_org_id, 'RESORT_STANDARD');
  v_year_id := public.create_fiscal_year(v_org_id, 'TestYear', '2026-01-01', '2026-12-31');
  select id into v_period_open from public.fiscal_periods where fiscal_year_id = v_year_id and period_number = 1;
  perform public.set_fiscal_period_status(v_period_open, 'OPEN', 'test setup');

  select id into v_cash_id from public.chart_of_accounts where organization_id = v_org_id and code = '1110';
  select id into v_revenue_id from public.chart_of_accounts where organization_id = v_org_id and code = '4100';
  select id into v_expense_id from public.chart_of_accounts where organization_id = v_org_id and code = '5200';

  v_entry_1 := public.create_journal_entry(v_org_id, null, v_period_open, '2026-01-05', 'Cash sale 1', 'JOURNAL_VOUCHER',
    jsonb_build_array(jsonb_build_object('account_id', v_cash_id, 'debit', 1000, 'credit', 0), jsonb_build_object('account_id', v_revenue_id, 'debit', 0, 'credit', 1000)), null);
  perform public.post_journal_entry(v_entry_1);

  v_entry_2 := public.create_journal_entry(v_org_id, null, v_period_open, '2026-01-06', 'Cash expense', 'JOURNAL_VOUCHER',
    jsonb_build_array(jsonb_build_object('account_id', v_expense_id, 'debit', 300, 'credit', 0), jsonb_build_object('account_id', v_cash_id, 'debit', 0, 'credit', 300)), null);
  perform public.post_journal_entry(v_entry_2);

  v_entry_3 := public.create_journal_entry(v_org_id, null, v_period_open, '2026-01-07', 'Cash sale 2', 'JOURNAL_VOUCHER',
    jsonb_build_array(jsonb_build_object('account_id', v_cash_id, 'debit', 200, 'credit', 0), jsonb_build_object('account_id', v_revenue_id, 'debit', 0, 'credit', 200)), null);
  perform public.post_journal_entry(v_entry_3);

  insert into _test_results (test, result, detail) values ('Setup', 'INFO', 'org=' || v_org_id);

  ---------------------------------------------------------------------
  -- TEST 1: get_trial_balance computes correct per-account debit/credit
  ---------------------------------------------------------------------
  select total_debit, total_credit into v_tb_cash_debit, v_tb_cash_credit
  from public.get_trial_balance(v_org_id, '1900-01-01', '2026-12-31')
  where account_id = v_cash_id;
  v_error_ok := (v_tb_cash_debit = 1200 and v_tb_cash_credit = 300);
  insert into _test_results (test, result, detail)
  values ('1: trial balance cash account debit/credit correct', case when v_error_ok then 'PASS' else 'FAIL' end,
    'debit=' || v_tb_cash_debit || ' credit=' || v_tb_cash_credit);

  ---------------------------------------------------------------------
  -- TEST 2: trial balance is internally balanced (total debit = total credit)
  ---------------------------------------------------------------------
  select sum(total_debit), sum(total_credit) into v_total_debit, v_total_credit
  from public.get_trial_balance(v_org_id, '1900-01-01', '2026-12-31');
  v_error_ok := (v_total_debit = v_total_credit and v_total_debit = 1500);
  insert into _test_results (test, result, detail)
  values ('2: trial balance totals are equal and correct', case when v_error_ok then 'PASS' else 'FAIL' end,
    'debit=' || v_total_debit || ' credit=' || v_total_credit);

  ---------------------------------------------------------------------
  -- TEST 3: revenue/expense balances correct (Income Statement inputs)
  ---------------------------------------------------------------------
  select balance into v_tb_revenue_balance from public.get_trial_balance(v_org_id, '2026-01-01', '2026-01-31') where account_id = v_revenue_id;
  select balance into v_tb_expense_balance from public.get_trial_balance(v_org_id, '2026-01-01', '2026-01-31') where account_id = v_expense_id;
  v_error_ok := (v_tb_revenue_balance = 1200 and v_tb_expense_balance = 300);
  insert into _test_results (test, result, detail)
  values ('3: revenue and expense balances correct for income statement', case when v_error_ok then 'PASS' else 'FAIL' end,
    'revenue=' || v_tb_revenue_balance || ' expense=' || v_tb_expense_balance);

  ---------------------------------------------------------------------
  -- TEST 4: get_account_ledger running balance ends at the correct total
  ---------------------------------------------------------------------
  select running_balance into v_ledger_final_balance
  from public.get_account_ledger(v_org_id, v_cash_id, '1900-01-01', '2026-12-31')
  order by entry_date desc, entry_number desc
  limit 1;
  v_error_ok := (v_ledger_final_balance = 900);
  insert into _test_results (test, result, detail)
  values ('4: account ledger running balance ends correct (900)', case when v_error_ok then 'PASS' else 'FAIL' end,
    'final_balance=' || v_ledger_final_balance);

  ---------------------------------------------------------------------
  -- Cleanup
  ---------------------------------------------------------------------
  perform public.set_organization_status(v_org_id, 'ARCHIVED', 'phase7 integrity test cleanup');
  insert into _test_results (test, result, detail) values ('Cleanup', 'INFO', 'org ' || v_org_id || ' archived');
end $$;

select seq, test, result, detail from _test_results order by seq;
