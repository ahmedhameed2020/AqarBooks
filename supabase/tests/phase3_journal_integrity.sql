-- Phase 3 database integrity tests (spec §38 "Journal Integrity").
-- Self-contained: creates its own ephemeral test organization, chart of
-- accounts, and fiscal year, runs through the engine's invariants, then
-- archives the test org (never hard-deletes, per the master spec).
--
-- Run as-is in the Supabase SQL Editor. Each test prints PASS/FAIL via
-- RAISE NOTICE; scroll the output panel after running.
--
-- Simulates being logged in as the platform admin so create/post/reverse
-- permission checks succeed (is_platform_admin bypasses has_permission).
-- Replace the UUID below if your platform admin's auth.users.id differs.

select set_config('request.jwt.claim.sub', 'b66490aa-a3a7-4005-add2-1112c660b0b4', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
set local role authenticated;

do $$
declare
  v_org_id uuid;
  v_year_id uuid;
  v_period_open uuid;
  v_period_closed uuid;
  v_cash_id uuid;
  v_revenue_id uuid;
  v_entry_id uuid;
  v_entry_id_2 uuid;
  v_new_entry_id uuid;
  v_status text;
  v_error_ok boolean;
  v_last_error text;
begin
  ---------------------------------------------------------------------
  -- Setup: ephemeral test org, COA, fiscal year, one open + one closed period
  ---------------------------------------------------------------------
  v_org_id := public.create_organization('Phase3 Integrity Test', 'phase3-integrity-test-' || extract(epoch from now())::bigint, 'EGP', 'STARTER');
  perform public.clone_chart_of_accounts_template(v_org_id, 'RESORT_STANDARD');
  v_year_id := public.create_fiscal_year(v_org_id, 'TestYear', '2026-01-01', '2026-12-31');

  select id into v_period_open from public.fiscal_periods where fiscal_year_id = v_year_id and period_number = 1;
  select id into v_period_closed from public.fiscal_periods where fiscal_year_id = v_year_id and period_number = 2;
  perform public.set_fiscal_period_status(v_period_open, 'OPEN', 'test setup');
  perform public.set_fiscal_period_status(v_period_closed, 'CLOSED', 'test setup');

  select id into v_cash_id from public.chart_of_accounts where organization_id = v_org_id and code = '1110';
  select id into v_revenue_id from public.chart_of_accounts where organization_id = v_org_id and code = '4100';

  raise notice '--- Setup complete: org=%, open_period=%, closed_period=%', v_org_id, v_period_open, v_period_closed;

  ---------------------------------------------------------------------
  -- TEST 1: unbalanced entry is rejected at post time
  ---------------------------------------------------------------------
  v_entry_id := public.create_journal_entry(
    v_org_id, null, v_period_open, '2026-01-15', 'Unbalanced test', 'JOURNAL_VOUCHER',
    jsonb_build_array(
      jsonb_build_object('account_id', v_cash_id, 'debit', 100, 'credit', 0),
      jsonb_build_object('account_id', v_revenue_id, 'debit', 0, 'credit', 50)
    ),
    null
  );
  v_error_ok := false;
  begin
    perform public.post_journal_entry(v_entry_id);
  exception when others then
    v_last_error := sqlerrm;
    v_error_ok := v_last_error ilike '%unbalanced%';
  end;
  raise notice '% TEST 1 (unbalanced entry rejected): %', case when v_error_ok then 'PASS' else 'FAIL' end, v_last_error;

  ---------------------------------------------------------------------
  -- TEST 2: single-line entry is rejected at post time
  ---------------------------------------------------------------------
  v_entry_id := public.create_journal_entry(
    v_org_id, null, v_period_open, '2026-01-15', 'Single line test', 'JOURNAL_VOUCHER',
    jsonb_build_array(jsonb_build_object('account_id', v_cash_id, 'debit', 100, 'credit', 0)),
    null
  );
  v_error_ok := false;
  begin
    perform public.post_journal_entry(v_entry_id);
  exception when others then
    v_error_ok := sqlerrm ilike '%at least two lines%';
  end;
  raise notice '% TEST 2 (single-line entry rejected)', case when v_error_ok then 'PASS' else 'FAIL' end;

  ---------------------------------------------------------------------
  -- TEST 3: closed-period posting is rejected
  ---------------------------------------------------------------------
  v_entry_id := public.create_journal_entry(
    v_org_id, null, v_period_closed, '2026-02-15', 'Closed period test', 'JOURNAL_VOUCHER',
    jsonb_build_array(
      jsonb_build_object('account_id', v_cash_id, 'debit', 100, 'credit', 0),
      jsonb_build_object('account_id', v_revenue_id, 'debit', 0, 'credit', 100)
    ),
    null
  );
  v_error_ok := false;
  begin
    perform public.post_journal_entry(v_entry_id);
  exception when others then
    v_error_ok := sqlerrm ilike '%not open%';
  end;
  raise notice '% TEST 3 (closed-period posting rejected)', case when v_error_ok then 'PASS' else 'FAIL' end;

  ---------------------------------------------------------------------
  -- TEST 4: group-account posting is rejected
  ---------------------------------------------------------------------
  declare v_group_account_id uuid;
  begin
    select id into v_group_account_id from public.chart_of_accounts where organization_id = v_org_id and code = '1100';
    v_entry_id := public.create_journal_entry(
      v_org_id, null, v_period_open, '2026-01-15', 'Group account test', 'JOURNAL_VOUCHER',
      jsonb_build_array(
        jsonb_build_object('account_id', v_group_account_id, 'debit', 100, 'credit', 0),
        jsonb_build_object('account_id', v_revenue_id, 'debit', 0, 'credit', 100)
      ),
      null
    );
    v_error_ok := false;
    begin
      perform public.post_journal_entry(v_entry_id);
    exception when others then
      v_error_ok := sqlerrm ilike '%group%';
    end;
    raise notice '% TEST 4 (group-account posting rejected)', case when v_error_ok then 'PASS' else 'FAIL' end;
  end;

  ---------------------------------------------------------------------
  -- TEST 5: a valid balanced entry posts successfully and gets a number
  ---------------------------------------------------------------------
  v_entry_id := public.create_journal_entry(
    v_org_id, null, v_period_open, '2026-01-20', 'Valid entry test', 'JOURNAL_VOUCHER',
    jsonb_build_array(
      jsonb_build_object('account_id', v_cash_id, 'debit', 250, 'credit', 0),
      jsonb_build_object('account_id', v_revenue_id, 'debit', 0, 'credit', 250)
    ),
    null
  );
  perform public.post_journal_entry(v_entry_id);
  select status from public.journal_entries where id = v_entry_id into v_status;
  raise notice '% TEST 5 (valid entry posts successfully, status=%)', case when v_status = 'POSTED' then 'PASS' else 'FAIL' end, v_status;

  ---------------------------------------------------------------------
  -- TEST 6: posted entries cannot be edited or deleted by direct client writes
  -- (no UPDATE/DELETE RLS policy exists for the authenticated role at all)
  ---------------------------------------------------------------------
  v_error_ok := false;
  begin
    update public.journal_entries set description = 'tampered' where id = v_entry_id;
  exception when others then
    v_error_ok := true;
  end;
  if not v_error_ok then
    -- No exception raised is also acceptable IF zero rows were affected by RLS -- verify unchanged.
    select (description <> 'tampered') into v_error_ok from public.journal_entries where id = v_entry_id;
  end if;
  raise notice '% TEST 6 (posted entry immutable via direct client write)', case when v_error_ok then 'PASS' else 'FAIL' end;

  ---------------------------------------------------------------------
  -- TEST 7: reversal creates a linked correction and flips the original status
  ---------------------------------------------------------------------
  v_new_entry_id := public.reverse_journal_entry(v_entry_id, v_period_open, '2026-01-21', 'test reversal');
  select status from public.journal_entries where id = v_entry_id into v_status;
  v_error_ok := (v_status = 'REVERSED');
  raise notice '% TEST 7a (original entry marked REVERSED)', case when v_error_ok then 'PASS' else 'FAIL' end;

  select (reversed_entry_id = v_entry_id and status = 'POSTED') into v_error_ok
  from public.journal_entries where id = v_new_entry_id;
  raise notice '% TEST 7b (reversal entry linked + posted)', case when v_error_ok then 'PASS' else 'FAIL' end;

  ---------------------------------------------------------------------
  -- TEST 8: duplicate posting is prevented via idempotency key
  ---------------------------------------------------------------------
  v_entry_id := public.create_journal_entry(
    v_org_id, null, v_period_open, '2026-01-22', 'Idempotency test', 'JOURNAL_VOUCHER',
    jsonb_build_array(
      jsonb_build_object('account_id', v_cash_id, 'debit', 10, 'credit', 0),
      jsonb_build_object('account_id', v_revenue_id, 'debit', 0, 'credit', 10)
    ),
    'fixed-test-idempotency-key-001'
  );
  v_entry_id_2 := public.create_journal_entry(
    v_org_id, null, v_period_open, '2026-01-22', 'Idempotency test retry', 'JOURNAL_VOUCHER',
    jsonb_build_array(
      jsonb_build_object('account_id', v_cash_id, 'debit', 10, 'credit', 0),
      jsonb_build_object('account_id', v_revenue_id, 'debit', 0, 'credit', 10)
    ),
    'fixed-test-idempotency-key-001'
  );
  raise notice '% TEST 8 (idempotent retry returns same entry id)', case when v_entry_id = v_entry_id_2 then 'PASS' else 'FAIL' end;

  ---------------------------------------------------------------------
  -- Cleanup: archive (never delete) the ephemeral test organization
  ---------------------------------------------------------------------
  perform public.set_organization_status(v_org_id, 'ARCHIVED', 'phase3 integrity test cleanup');
  raise notice '--- Done. Test org % archived.', v_org_id;
end $$;
