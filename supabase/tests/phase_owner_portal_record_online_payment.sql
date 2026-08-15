-- supabase/tests/phase_owner_portal_record_online_payment.sql
-- Phase 4, Task 5: pgTAP-style coverage for record_online_payment --
-- concurrency (org-scoped advisory lock ordering), idempotent replay,
-- settlement-race all-or-nothing behavior, no-open-period / missing-
-- clearing-account / ownership failure paths, and the service_role-only
-- privilege boundary.
--
-- Run via mcp__claude_ai_Supabase__execute_sql directly -- this repo's
-- phase_owner_portal_*.sql scripts are NOT wired into any npm script
-- (npm run test:sql is an unrelated TypeScript suite,
-- tests/pgtap.integration.test.ts). Paste this script's body into
-- execute_sql and read the NOTICE/exception output.
--
-- Structural template: phase_owner_portal_finance_settings.sql (assert +
-- unconditional cleanup, clock_timestamp()-suffixed unique values so the
-- script stays idempotent across repeated runs) and
-- phase_owner_portal_transaction_integrity.sql (online_payment_transactions
-- fixture shape, dues-is-function-written convention).
do $$
declare
  v_platform_admin uuid := 'b66490aa-a3a7-4005-add2-1112c660b0b4';

  -- Org A: hosts scenarios 1, 2, 3, 5, 6, 7 -- has a valid clearing account
  -- and an OPEN fiscal period covering today.
  v_org_id uuid;
  v_resort_id uuid;
  v_resort_no_settings_id uuid;
  v_asset_account_id uuid;
  v_receivable_account_id uuid;
  v_due_type_id uuid;
  v_unit_id uuid;
  v_unit_unowned_id uuid;
  v_member_id uuid;
  v_fiscal_year_id uuid;
  v_fiscal_period_id uuid;

  -- Org B: scenario 4 only -- valid clearing account, but its fiscal
  -- period is deliberately left PLANNED (never opened).
  v_org2_id uuid;
  v_resort_b_id uuid;
  v_asset_account_b_id uuid;
  v_receivable_account_b_id uuid;
  v_due_type_b_id uuid;
  v_unit_b_id uuid;
  v_member_b_id uuid;
  v_fiscal_year_b_id uuid;

  -- Dues
  v_due_happy_id uuid;      -- scenario 1/2
  v_due_id uuid;            -- scenario 3, first allocation (gets pre-settled)
  v_due2_id uuid;           -- scenario 3, second allocation (must stay untouched)
  v_due_ownership_id uuid;  -- scenario 6
  v_due_b_id uuid;          -- scenario 4

  -- Transactions
  v_txn_happy_id uuid;
  v_txn_race_id uuid;
  v_txn_no_period_id uuid;
  v_txn_missing_clearing_id uuid;
  v_txn_ownership_id uuid;

  -- Scratch
  v_result record;
  v_result2 record;
  v_presettle_result record;
  v_payment_count integer;
  v_journal_entry_id uuid;
  v_journal_status text;
  v_debit_total numeric(19,4);
  v_credit_total numeric(19,4);
  v_due_status text;
  v_txn_status text;
  v_error_caught boolean;
  v_run_suffix text := extract(epoch from clock_timestamp())::text;
begin
  -- Impersonate the platform admin for the has_permission()-gated fixture
  -- helpers below (create_fiscal_year, set_fiscal_period_status). This
  -- script otherwise stays on the default (postgres/superuser) role for
  -- execute_sql, which is what lets it write directly into
  -- "functions-are-the-only-writer" tables like dues -- same rationale
  -- phase_owner_portal_finance_settings.sql relies on.
  perform set_config('request.jwt.claim.sub', v_platform_admin::text, false);

  -- === Shared setup: Org A ===
  insert into public.organizations (name, slug, default_currency, status)
  values ('Phase4 ROP Test A ' || clock_timestamp()::text, 'p4-rop-a-' || extract(epoch from clock_timestamp())::text, 'EGP', 'ACTIVE')
  returning id into v_org_id;

  insert into public.resorts (organization_id, name, code)
  values (v_org_id, 'Test Resort A', 'ROP-A-' || clock_timestamp()::text) returning id into v_resort_id;

  insert into public.resorts (organization_id, name, code)
  values (v_org_id, 'Test Resort A (no clearing config)', 'ROP-A2-' || clock_timestamp()::text) returning id into v_resort_no_settings_id;

  insert into public.chart_of_accounts (organization_id, code, name_ar, name_en, category, normal_balance, is_group, is_active)
  values (v_org_id, 'ROP-ASSET-' || clock_timestamp()::text, 'مقاصة', 'Clearing', 'ASSET', 'DEBIT', false, true)
  returning id into v_asset_account_id;

  insert into public.chart_of_accounts (organization_id, code, name_ar, name_en, category, normal_balance, is_group, is_active)
  values (v_org_id, 'ROP-RECV-' || clock_timestamp()::text, 'ذمم', 'Receivable', 'ASSET', 'DEBIT', false, true)
  returning id into v_receivable_account_id;

  insert into public.organization_finance_settings (organization_id, resort_id, online_payments_clearing_account_id)
  values (v_org_id, v_resort_id, v_asset_account_id);
  -- Deliberately NO row for (v_org_id, v_resort_no_settings_id) -- scenario 5.

  insert into public.due_types (organization_id, name_ar, name_en, default_revenue_account_id)
  values (v_org_id, 'اشتراك', 'Dues', v_receivable_account_id) returning id into v_due_type_id;

  insert into public.units (organization_id, resort_id, code, unit_type)
  values (v_org_id, v_resort_id, 'ROP-U1-' || clock_timestamp()::text, 'VILLA') returning id into v_unit_id;

  insert into public.units (organization_id, resort_id, code, unit_type)
  values (v_org_id, v_resort_id, 'ROP-U2-' || clock_timestamp()::text, 'VILLA') returning id into v_unit_unowned_id;
  -- v_unit_unowned_id deliberately gets NO unit_ownerships row for
  -- v_member_id -- scenario 6.

  insert into public.members (organization_id, full_name)
  values (v_org_id, 'Test Owner A') returning id into v_member_id;

  insert into public.unit_ownerships (organization_id, unit_id, member_id)
  values (v_org_id, v_unit_id, v_member_id);

  v_fiscal_year_id := public.create_fiscal_year(v_org_id, '2026-A', '2026-01-01', '2026-12-31');
  select id into v_fiscal_period_id
  from public.fiscal_periods
  where fiscal_year_id = v_fiscal_year_id
    and current_date between start_date and end_date;
  perform public.set_fiscal_period_status(v_fiscal_period_id, 'OPEN', 'Phase 4 test setup');

  -- Dues for org A
  insert into public.dues (organization_id, resort_id, unit_id, due_type_id, receivable_account_id, amount, issue_date, due_date, status)
  values (v_org_id, v_resort_id, v_unit_id, v_due_type_id, v_receivable_account_id, 1000, current_date, current_date + 30, 'ISSUED')
  returning id into v_due_happy_id;

  insert into public.dues (organization_id, resort_id, unit_id, due_type_id, receivable_account_id, amount, issue_date, due_date, status)
  values (v_org_id, v_resort_id, v_unit_id, v_due_type_id, v_receivable_account_id, 400, current_date, current_date + 30, 'ISSUED')
  returning id into v_due_id;

  insert into public.dues (organization_id, resort_id, unit_id, due_type_id, receivable_account_id, amount, issue_date, due_date, status)
  values (v_org_id, v_resort_id, v_unit_id, v_due_type_id, v_receivable_account_id, 300, current_date, current_date + 30, 'ISSUED')
  returning id into v_due2_id;

  insert into public.dues (organization_id, resort_id, unit_id, due_type_id, receivable_account_id, amount, issue_date, due_date, status)
  values (v_org_id, v_resort_id, v_unit_unowned_id, v_due_type_id, v_receivable_account_id, 500, current_date, current_date + 30, 'ISSUED')
  returning id into v_due_ownership_id;

  -- === Shared setup: Org B (scenario 4 -- no open period) ===
  insert into public.organizations (name, slug, default_currency, status)
  values ('Phase4 ROP Test B ' || clock_timestamp()::text, 'p4-rop-b-' || extract(epoch from clock_timestamp())::text, 'EGP', 'ACTIVE')
  returning id into v_org2_id;

  insert into public.resorts (organization_id, name, code)
  values (v_org2_id, 'Test Resort B', 'ROP-B-' || clock_timestamp()::text) returning id into v_resort_b_id;

  insert into public.chart_of_accounts (organization_id, code, name_ar, name_en, category, normal_balance, is_group, is_active)
  values (v_org2_id, 'ROP-B-ASSET-' || clock_timestamp()::text, 'مقاصة', 'Clearing', 'ASSET', 'DEBIT', false, true)
  returning id into v_asset_account_b_id;

  insert into public.chart_of_accounts (organization_id, code, name_ar, name_en, category, normal_balance, is_group, is_active)
  values (v_org2_id, 'ROP-B-RECV-' || clock_timestamp()::text, 'ذمم', 'Receivable', 'ASSET', 'DEBIT', false, true)
  returning id into v_receivable_account_b_id;

  insert into public.organization_finance_settings (organization_id, resort_id, online_payments_clearing_account_id)
  values (v_org2_id, v_resort_b_id, v_asset_account_b_id);

  insert into public.due_types (organization_id, name_ar, name_en, default_revenue_account_id)
  values (v_org2_id, 'اشتراك', 'Dues', v_receivable_account_b_id) returning id into v_due_type_b_id;

  insert into public.units (organization_id, resort_id, code, unit_type)
  values (v_org2_id, v_resort_b_id, 'ROP-B-U1-' || clock_timestamp()::text, 'VILLA') returning id into v_unit_b_id;

  insert into public.members (organization_id, full_name)
  values (v_org2_id, 'Test Owner B') returning id into v_member_b_id;

  insert into public.unit_ownerships (organization_id, unit_id, member_id)
  values (v_org2_id, v_unit_b_id, v_member_b_id);

  v_fiscal_year_b_id := public.create_fiscal_year(v_org2_id, '2026-B', '2026-01-01', '2026-12-31');
  -- Deliberately no set_fiscal_period_status call -- every period for org B
  -- stays PLANNED, so no period covers current_date -> OPEN_PERIOD_REQUIRED.

  insert into public.dues (organization_id, resort_id, unit_id, due_type_id, receivable_account_id, amount, issue_date, due_date, status)
  values (v_org2_id, v_resort_b_id, v_unit_b_id, v_due_type_b_id, v_receivable_account_b_id, 250, current_date, current_date + 30, 'ISSUED')
  returning id into v_due_b_id;

  raise notice 'phase_owner_portal_record_online_payment.sql: fixtures ready';

  -----------------------------------------------------------------------
  -- SCENARIO 1: happy path.
  -----------------------------------------------------------------------
  insert into public.online_payment_transactions
    (organization_id, resort_id, member_id, client_request_id, provider, amount, expires_at)
  values
    (v_org_id, v_resort_id, v_member_id, 'rop-happy-' || v_run_suffix, 'PAYMOB', 1000, now() + interval '30 minutes')
  returning id into v_txn_happy_id;

  insert into public.online_payment_transaction_allocations (transaction_id, due_id, amount)
  values (v_txn_happy_id, v_due_happy_id, 1000);

  select * into v_result from public.record_online_payment(v_txn_happy_id, 'evt-happy-' || v_run_suffix);
  assert v_result.status = 'PAID', format('FAIL scenario 1: expected status PAID, got %s / %s / %s', v_result.status, v_result.failure_code, v_result.failure_message);
  assert v_result.payment_id is not null, 'FAIL scenario 1: expected a payment_id';

  select count(*) into v_payment_count from public.payments where id = v_result.payment_id and method = 'ONLINE';
  assert v_payment_count = 1, format('FAIL scenario 1: expected exactly one ONLINE payments row, got %s', v_payment_count);

  select p.journal_entry_id into v_journal_entry_id from public.payments p where p.id = v_result.payment_id;
  select status into v_journal_status from public.journal_entries where id = v_journal_entry_id;
  assert v_journal_status = 'POSTED', format('FAIL scenario 1: expected POSTED journal entry, got %s', v_journal_status);

  select coalesce(sum(debit), 0), coalesce(sum(credit), 0) into v_debit_total, v_credit_total
  from public.journal_entry_lines where journal_entry_id = v_journal_entry_id;
  assert v_debit_total = v_credit_total, format('FAIL scenario 1: journal entry not balanced (debit=%s credit=%s)', v_debit_total, v_credit_total);
  assert v_debit_total = 1000, format('FAIL scenario 1: expected journal totals of 1000, got %s', v_debit_total);

  select status into v_due_status from public.dues where id = v_due_happy_id;
  assert v_due_status = 'PAID', format('FAIL scenario 1: expected due status PAID, got %s', v_due_status);

  raise notice 'SCENARIO 1 (happy path): PASS -- payment_id=%, journal_entry_id=%', v_result.payment_id, v_journal_entry_id;

  -----------------------------------------------------------------------
  -- SCENARIO 2: idempotent replay (sequential) -- two more calls against
  -- the now-PAID transaction from scenario 1.
  -----------------------------------------------------------------------
  select * into v_result2 from public.record_online_payment(v_txn_happy_id, 'evt-happy-replay-1-' || v_run_suffix);
  assert v_result2.status = 'PAID' and v_result2.payment_id = v_result.payment_id,
    format('FAIL scenario 2 (replay 1): expected PAID/%s, got %s/%s', v_result.payment_id, v_result2.status, v_result2.payment_id);

  select * into v_result2 from public.record_online_payment(v_txn_happy_id, 'evt-happy-replay-2-' || v_run_suffix);
  assert v_result2.status = 'PAID' and v_result2.payment_id = v_result.payment_id,
    format('FAIL scenario 2 (replay 2): expected PAID/%s, got %s/%s', v_result.payment_id, v_result2.status, v_result2.payment_id);

  select count(*) into v_payment_count from public.payments where id = v_result.payment_id;
  assert v_payment_count = 1, format('FAIL scenario 2: expected still exactly one payments row after replay, got %s', v_payment_count);

  raise notice 'SCENARIO 2 (idempotent replay): PASS -- payment_id=% unchanged across 2 replays', v_result.payment_id;

  -----------------------------------------------------------------------
  -- SCENARIO 3: settlement race, all-or-nothing. v_due_id gets settled by
  -- a DIRECT post_payment_internal call (simulating a concurrent
  -- staff-side record_payment) BEFORE record_online_payment ever
  -- processes the online transaction that also allocates against
  -- v_due_id and v_due2_id.
  -----------------------------------------------------------------------
  select * into v_presettle_result from public.post_payment_internal(
    p_organization_id => v_org_id,
    p_resort_id => v_resort_id,
    p_member_id => v_member_id,
    p_unit_id => v_unit_id,
    p_amount => 400,
    p_method => 'CASH',
    p_payment_date => current_date,
    p_deposit_account_id => v_asset_account_id,
    p_fiscal_period_id => v_fiscal_period_id,
    p_allocations => jsonb_build_array(jsonb_build_object('due_id', v_due_id, 'amount', 400)),
    p_idempotency_key => 'rop-presettle-' || v_run_suffix,
    p_cashier_session_id => null,
    p_actor_id => null
  );
  assert v_presettle_result.payment_id is not null, 'FAIL scenario 3 setup: pre-settlement payment did not post';

  select status into v_due_status from public.dues where id = v_due_id;
  assert v_due_status = 'PAID', format('FAIL scenario 3 setup: expected v_due_id PAID before the race, got %s', v_due_status);

  insert into public.online_payment_transactions
    (organization_id, resort_id, member_id, client_request_id, provider, amount, expires_at)
  values
    (v_org_id, v_resort_id, v_member_id, 'rop-race-' || v_run_suffix, 'PAYMOB', 700, now() + interval '30 minutes')
  returning id into v_txn_race_id;

  insert into public.online_payment_transaction_allocations (transaction_id, due_id, amount)
  values (v_txn_race_id, v_due_id, 400), (v_txn_race_id, v_due2_id, 300);

  select * into v_result from public.record_online_payment(v_txn_race_id, 'evt-race-' || v_run_suffix);
  assert v_result.status = 'FAILED', format('FAIL scenario 3: expected status FAILED, got %s', v_result.status);
  assert v_result.failure_code = 'DUE_ALREADY_SETTLED', format('FAIL scenario 3: expected failure_code DUE_ALREADY_SETTLED, got %s', v_result.failure_code);
  assert v_result.payment_id is null, 'FAIL scenario 3: expected no payment_id on failure';

  -- Fresh, separate select -- proves the FAILED status actually persisted
  -- (the non-raising design from Task 4), not just what the RETURN QUERY
  -- row happened to say.
  select status into v_txn_status from public.online_payment_transactions where id = v_txn_race_id;
  assert v_txn_status = 'FAILED', format('FAIL scenario 3: transaction row status did not persist as FAILED, got %s', v_txn_status);

  -- All-or-nothing: the still-valid due2 allocation must NOT have gotten a
  -- partial payment either.
  select count(*) into v_payment_count
  from public.payment_allocations pa join public.payments p on p.id = pa.payment_id
  where pa.due_id = v_due2_id and p.status = 'POSTED';
  assert v_payment_count = 0, format('FAIL scenario 3: expected zero payments against the still-valid due2, got %s', v_payment_count);

  select status into v_due_status from public.dues where id = v_due2_id;
  assert v_due_status = 'ISSUED', format('FAIL scenario 3: expected due2 to remain ISSUED (untouched), got %s', v_due_status);

  raise notice 'SCENARIO 3 (settlement race, all-or-nothing): PASS';

  -----------------------------------------------------------------------
  -- SCENARIO 4: no open period covers today for org B.
  -----------------------------------------------------------------------
  insert into public.online_payment_transactions
    (organization_id, resort_id, member_id, client_request_id, provider, amount, expires_at)
  values
    (v_org2_id, v_resort_b_id, v_member_b_id, 'rop-noperiod-' || v_run_suffix, 'PAYMOB', 250, now() + interval '30 minutes')
  returning id into v_txn_no_period_id;

  insert into public.online_payment_transaction_allocations (transaction_id, due_id, amount)
  values (v_txn_no_period_id, v_due_b_id, 250);

  select * into v_result from public.record_online_payment(v_txn_no_period_id, 'evt-noperiod-' || v_run_suffix);
  assert v_result.status = 'PENDING', format('FAIL scenario 4: expected status PENDING, got %s', v_result.status);
  assert v_result.failure_code = 'OPEN_PERIOD_REQUIRED', format('FAIL scenario 4: expected failure_code OPEN_PERIOD_REQUIRED, got %s', v_result.failure_code);

  select status into v_txn_status from public.online_payment_transactions where id = v_txn_no_period_id;
  assert v_txn_status = 'PENDING', format('FAIL scenario 4: transaction row status should remain PENDING, got %s', v_txn_status);

  raise notice 'SCENARIO 4 (no open period): PASS';

  -----------------------------------------------------------------------
  -- SCENARIO 5: missing clearing account (resort has no
  -- organization_finance_settings row at all).
  -----------------------------------------------------------------------
  insert into public.online_payment_transactions
    (organization_id, resort_id, member_id, client_request_id, provider, amount, expires_at)
  values
    (v_org_id, v_resort_no_settings_id, v_member_id, 'rop-noclearing-' || v_run_suffix, 'PAYMOB', 100, now() + interval '30 minutes')
  returning id into v_txn_missing_clearing_id;

  select * into v_result from public.record_online_payment(v_txn_missing_clearing_id, 'evt-noclearing-' || v_run_suffix);
  assert v_result.status = 'FAILED', format('FAIL scenario 5: expected status FAILED, got %s', v_result.status);
  assert v_result.failure_code = 'CLEARING_ACCOUNT_NOT_CONFIGURED', format('FAIL scenario 5: expected failure_code CLEARING_ACCOUNT_NOT_CONFIGURED, got %s', v_result.failure_code);

  raise notice 'SCENARIO 5 (missing clearing account): PASS';

  -----------------------------------------------------------------------
  -- SCENARIO 6: ownership check -- the due's unit has no unit_ownerships
  -- row for the transaction's member_id.
  -----------------------------------------------------------------------
  insert into public.online_payment_transactions
    (organization_id, resort_id, member_id, client_request_id, provider, amount, expires_at)
  values
    (v_org_id, v_resort_id, v_member_id, 'rop-notowned-' || v_run_suffix, 'PAYMOB', 500, now() + interval '30 minutes')
  returning id into v_txn_ownership_id;

  insert into public.online_payment_transaction_allocations (transaction_id, due_id, amount)
  values (v_txn_ownership_id, v_due_ownership_id, 500);

  select * into v_result from public.record_online_payment(v_txn_ownership_id, 'evt-notowned-' || v_run_suffix);
  assert v_result.status = 'FAILED', format('FAIL scenario 6: expected status FAILED, got %s', v_result.status);
  assert v_result.failure_code = 'DUE_NOT_OWNED_BY_MEMBER', format('FAIL scenario 6: expected failure_code DUE_NOT_OWNED_BY_MEMBER, got %s', v_result.failure_code);

  select count(*) into v_payment_count
  from public.payment_allocations pa join public.payments p on p.id = pa.payment_id
  where pa.due_id = v_due_ownership_id and p.status = 'POSTED';
  assert v_payment_count = 0, format('FAIL scenario 6: expected zero payments against the not-owned due, got %s', v_payment_count);

  raise notice 'SCENARIO 6 (ownership check): PASS';

  -----------------------------------------------------------------------
  -- SCENARIO 7: privilege check -- authenticated must be denied at the
  -- grant level (42501), not merely get back an unexpected result.
  -----------------------------------------------------------------------
  set local role authenticated;
  v_error_caught := false;
  begin
    perform public.record_online_payment(gen_random_uuid(), 'evt-priv-' || v_run_suffix);
  exception when sqlstate '42501' then
    v_error_caught := true;
  end;
  reset role;
  assert v_error_caught, 'FAIL scenario 7: authenticated should not be able to call record_online_payment (expected 42501)';

  raise notice 'SCENARIO 7 (privilege check): PASS';

  -----------------------------------------------------------------------
  -- Cleanup -- unconditional, matches this repo's established
  -- never-hard-delete convention (see phase3_journal_integrity.sql,
  -- phase4_receivables_integrity.sql, phase_owner_portal_data_integrity.sql:
  -- every one of them archives its ephemeral test org via
  -- set_organization_status rather than deleting rows). This is not
  -- optional here specifically: this script posts real payments/journal
  -- entries, which flips chart_of_accounts.is_used to true, and
  -- trg_coa_prevent_delete_used then hard-blocks any DELETE against those
  -- accounts (confirmed live: COA_USED_DELETE_FORBIDDEN). Archiving avoids
  -- the problem entirely and matches the master spec's "never hard-delete"
  -- rule. Idempotency across repeated runs still holds because every
  -- unique value above (org slug, resort code, account code, transaction
  -- client_request_id, ...) is clock_timestamp()/epoch-suffixed, so a new
  -- run creates fresh orgs regardless of previously archived leftovers.
  -----------------------------------------------------------------------
  perform public.set_organization_status(v_org_id, 'ARCHIVED', 'phase_owner_portal_record_online_payment test cleanup');
  perform public.set_organization_status(v_org2_id, 'ARCHIVED', 'phase_owner_portal_record_online_payment test cleanup');

  raise notice 'phase_owner_portal_record_online_payment.sql: all 7 SQL scenarios passed, cleanup complete';
end $$;
