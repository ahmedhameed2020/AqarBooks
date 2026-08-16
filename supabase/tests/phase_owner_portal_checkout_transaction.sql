-- supabase/tests/phase_owner_portal_checkout_transaction.sql
-- Phase 5, Task 4: pgTAP-style coverage for
-- create_online_payment_checkout_transaction() -- the atomic checkout RPC
-- that creates an online_payment_transactions row plus its
-- online_payment_transaction_allocations rows in one DB transaction,
-- enforcing the sum-of-allocations invariant Phase 3's schema migration
-- (20260815000001) flagged as needing enforcement here (not a DB
-- constraint -- see that migration's "Note:" comment above the allocations
-- table).
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
-- phase_owner_portal_record_online_payment.sql (fixture shape). RLS
-- impersonation uses set_config('request.jwt.claims', ...) + set local role
-- authenticated, same incantation as phase_owner_portal_finance_settings.sql
-- scenario 8 -- required here (unlike record_online_payment, which is
-- SECURITY DEFINER and only needs privilege-boundary checks) because
-- create_online_payment_checkout_transaction() is SECURITY INVOKER: it
-- genuinely runs as the impersonated member's own session, so
-- current_member_id()/RLS must resolve for real, not just be reachable.
--
-- Real auth.users rows are required (members.user_id FK -> auth.users).
-- Reuses the project's known test accounts, same convention as
-- phase_owner_portal_transaction_integrity.sql: ahmedhameed2020@gmail.com
-- (11d45b6f-1162-433e-8324-ebaf7cd0e618) as the portal owner for this
-- script's throwaway member, and e2e-auditor@resortos-test.local
-- (04a36e0a-446e-4d93-94fb-15a2eb9a473e, confirmed to have no members row
-- at the time this test was written) as the "not a portal member" identity
-- for scenario 5. Both are unlinked/left untouched (never given a members
-- row) at cleanup so a future run of this script, or of another
-- phase_owner_portal_*.sql script borrowing the same accounts, is never
-- blocked by a stale members.user_id link (that column is globally UNIQUE).
do $$
declare
  v_platform_admin uuid := 'b66490aa-a3a7-4005-add2-1112c660b0b4';
  v_owner_user uuid := '11d45b6f-1162-433e-8324-ebaf7cd0e618';
  v_non_member_user uuid := '04a36e0a-446e-4d93-94fb-15a2eb9a473e'; -- e2e-auditor@resortos-test.local

  v_org_id uuid;
  v_resort1_id uuid;
  v_resort2_id uuid;
  v_asset_account_id uuid;
  v_due_type_id uuid;
  v_unit1_id uuid;
  v_unit2_id uuid;
  v_unit_unowned_id uuid;
  v_member_id uuid;

  v_due1_id uuid;        -- resort1, ISSUED, owned -- scenarios 1 + 6
  v_due2_id uuid;        -- resort1, ISSUED, owned -- scenarios 1 + 6
  v_due_cross_a_id uuid; -- resort1, ISSUED, owned -- scenario 2
  v_due_cross_b_id uuid; -- resort2, ISSUED, owned -- scenario 2
  v_due_unowned_id uuid; -- resort1, ISSUED, NOT owned -- scenario 3
  v_due_paid_id uuid;    -- resort1, PAID, owned -- scenario 4
  v_due_double_id uuid;  -- resort1, ISSUED, owned -- scenario 8 (double-booking)

  v_result record;
  v_txn_count_before integer;
  v_txn_count_after integer;
  v_alloc_count integer;
  v_error_caught boolean;
  v_sqlstate text;
  v_run_suffix text := extract(epoch from clock_timestamp())::text;
begin
  -----------------------------------------------------------------------
  -- Setup (default/superuser role -- bypasses RLS, same convention as
  -- phase_owner_portal_record_online_payment.sql). dues is a
  -- "functions-are-the-only-writer" table under RLS, but direct inserts
  -- here work fine because setup runs under the unrestricted default role,
  -- not `authenticated`.
  -----------------------------------------------------------------------
  insert into public.organizations (name, slug, default_currency, status)
  values ('Phase5 Checkout Test ' || clock_timestamp()::text, 'p5-checkout-' || v_run_suffix, 'EGP', 'ACTIVE')
  returning id into v_org_id;

  insert into public.resorts (organization_id, name, code)
  values (v_org_id, 'Checkout Resort 1', 'P5C1-' || v_run_suffix) returning id into v_resort1_id;

  insert into public.resorts (organization_id, name, code)
  values (v_org_id, 'Checkout Resort 2', 'P5C2-' || v_run_suffix) returning id into v_resort2_id;

  insert into public.chart_of_accounts (organization_id, code, name_ar, name_en, category, normal_balance, is_group, is_active)
  values (v_org_id, 'P5C-RECV-' || v_run_suffix, 'ذمم', 'Receivable', 'ASSET', 'DEBIT', false, true)
  returning id into v_asset_account_id;

  insert into public.due_types (organization_id, name_ar, name_en, default_revenue_account_id)
  values (v_org_id, 'اشتراك', 'Dues', v_asset_account_id) returning id into v_due_type_id;

  insert into public.units (organization_id, resort_id, code, unit_type)
  values (v_org_id, v_resort1_id, 'P5C-U1-' || v_run_suffix, 'VILLA') returning id into v_unit1_id;

  insert into public.units (organization_id, resort_id, code, unit_type)
  values (v_org_id, v_resort2_id, 'P5C-U2-' || v_run_suffix, 'VILLA') returning id into v_unit2_id;

  insert into public.units (organization_id, resort_id, code, unit_type)
  values (v_org_id, v_resort1_id, 'P5C-U3-' || v_run_suffix, 'VILLA') returning id into v_unit_unowned_id;
  -- v_unit_unowned_id deliberately gets NO unit_ownerships row for
  -- v_member_id -- scenario 3.

  insert into public.members (organization_id, full_name, user_id)
  values (v_org_id, 'Checkout Test Owner', v_owner_user) returning id into v_member_id;

  insert into public.unit_ownerships (organization_id, unit_id, member_id)
  values (v_org_id, v_unit1_id, v_member_id), (v_org_id, v_unit2_id, v_member_id);

  insert into public.dues (organization_id, resort_id, unit_id, due_type_id, receivable_account_id, amount, issue_date, due_date, status)
  values (v_org_id, v_resort1_id, v_unit1_id, v_due_type_id, v_asset_account_id, 600, current_date, current_date + 30, 'ISSUED')
  returning id into v_due1_id;

  insert into public.dues (organization_id, resort_id, unit_id, due_type_id, receivable_account_id, amount, issue_date, due_date, status)
  values (v_org_id, v_resort1_id, v_unit1_id, v_due_type_id, v_asset_account_id, 400, current_date, current_date + 30, 'ISSUED')
  returning id into v_due2_id;

  insert into public.dues (organization_id, resort_id, unit_id, due_type_id, receivable_account_id, amount, issue_date, due_date, status)
  values (v_org_id, v_resort1_id, v_unit1_id, v_due_type_id, v_asset_account_id, 300, current_date, current_date + 30, 'ISSUED')
  returning id into v_due_cross_a_id;

  insert into public.dues (organization_id, resort_id, unit_id, due_type_id, receivable_account_id, amount, issue_date, due_date, status)
  values (v_org_id, v_resort2_id, v_unit2_id, v_due_type_id, v_asset_account_id, 250, current_date, current_date + 30, 'ISSUED')
  returning id into v_due_cross_b_id;

  insert into public.dues (organization_id, resort_id, unit_id, due_type_id, receivable_account_id, amount, issue_date, due_date, status)
  values (v_org_id, v_resort1_id, v_unit_unowned_id, v_due_type_id, v_asset_account_id, 500, current_date, current_date + 30, 'ISSUED')
  returning id into v_due_unowned_id;

  insert into public.dues (organization_id, resort_id, unit_id, due_type_id, receivable_account_id, amount, issue_date, due_date, status)
  values (v_org_id, v_resort1_id, v_unit1_id, v_due_type_id, v_asset_account_id, 200, current_date, current_date + 30, 'PAID')
  returning id into v_due_paid_id;

  insert into public.dues (organization_id, resort_id, unit_id, due_type_id, receivable_account_id, amount, issue_date, due_date, status)
  values (v_org_id, v_resort1_id, v_unit1_id, v_due_type_id, v_asset_account_id, 150, current_date, current_date + 30, 'ISSUED')
  returning id into v_due_double_id;

  raise notice 'phase_owner_portal_checkout_transaction.sql: fixtures ready (org=%, member=%)', v_org_id, v_member_id;

  -----------------------------------------------------------------------
  -- SCENARIO 1: valid multi-due, same-resort checkout succeeds -- returns
  -- a transaction_id and correctly summed amount; verify (via a fresh
  -- separate select) that both tables' rows exist with matching data.
  -----------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_user::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select * into v_result from public.create_online_payment_checkout_transaction(
    array[v_due1_id, v_due2_id], 'FAWRY'
  );

  reset role;

  assert v_result.transaction_id is not null, 'FAIL scenario 1: expected a transaction_id';
  assert v_result.amount = 1000, format('FAIL scenario 1: expected summed amount 1000, got %s', v_result.amount);

  select count(*) into v_alloc_count from public.online_payment_transaction_allocations
  where transaction_id = v_result.transaction_id and due_id in (v_due1_id, v_due2_id);
  assert v_alloc_count = 2, format('FAIL scenario 1: expected 2 allocation rows, got %s', v_alloc_count);

  perform 1 from public.online_payment_transactions
  where id = v_result.transaction_id and organization_id = v_org_id and resort_id = v_resort1_id
    and member_id = v_member_id and provider = 'FAWRY' and amount = 1000 and status = 'PENDING';
  assert found, 'FAIL scenario 1: transaction row did not persist with expected organization/resort/member/provider/amount/status';

  raise notice 'SCENARIO 1 (valid multi-due checkout): PASS -- transaction_id=%, amount=%', v_result.transaction_id, v_result.amount;

  -----------------------------------------------------------------------
  -- SCENARIO 2: cross-resort due mix rejected with CROSS_RESORT_NOT_ALLOWED
  -- (sqlstate 22023). Atomicity proof: fresh selects confirm zero new
  -- transaction/allocation rows for this attempt.
  -----------------------------------------------------------------------
  select count(*) into v_txn_count_before from public.online_payment_transactions where organization_id = v_org_id;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_user::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_error_caught := false;
  v_sqlstate := null;
  begin
    perform public.create_online_payment_checkout_transaction(array[v_due_cross_a_id, v_due_cross_b_id], 'FAWRY');
  exception when others then
    v_error_caught := true;
    get stacked diagnostics v_sqlstate = returned_sqlstate;
  end;

  reset role;

  assert v_error_caught and v_sqlstate = '22023',
    format('FAIL scenario 2: expected sqlstate 22023 (CROSS_RESORT_NOT_ALLOWED), got error_caught=%s sqlstate=%s', v_error_caught, v_sqlstate);

  select count(*) into v_txn_count_after from public.online_payment_transactions where organization_id = v_org_id;
  assert v_txn_count_after = v_txn_count_before,
    format('FAIL scenario 2: expected no new transaction row, before=%s after=%s', v_txn_count_before, v_txn_count_after);

  select count(*) into v_alloc_count from public.online_payment_transaction_allocations
  where due_id in (v_due_cross_a_id, v_due_cross_b_id);
  assert v_alloc_count = 0, format('FAIL scenario 2: expected zero allocation rows for the rejected cross-resort dues, got %s', v_alloc_count);

  raise notice 'SCENARIO 2 (cross-resort rejected, atomic): PASS';

  -----------------------------------------------------------------------
  -- SCENARIO 3: a due NOT owned by the calling member is rejected with
  -- SOME_DUES_NOT_FOUND_OR_NOT_OWNED (sqlstate 22023). Atomicity proof as
  -- above.
  -----------------------------------------------------------------------
  select count(*) into v_txn_count_before from public.online_payment_transactions where organization_id = v_org_id;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_user::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_error_caught := false;
  v_sqlstate := null;
  begin
    perform public.create_online_payment_checkout_transaction(array[v_due_unowned_id], 'FAWRY');
  exception when others then
    v_error_caught := true;
    get stacked diagnostics v_sqlstate = returned_sqlstate;
  end;

  reset role;

  assert v_error_caught and v_sqlstate = '22023',
    format('FAIL scenario 3: expected sqlstate 22023 (SOME_DUES_NOT_FOUND_OR_NOT_OWNED), got error_caught=%s sqlstate=%s', v_error_caught, v_sqlstate);

  select count(*) into v_txn_count_after from public.online_payment_transactions where organization_id = v_org_id;
  assert v_txn_count_after = v_txn_count_before,
    format('FAIL scenario 3: expected no new transaction row, before=%s after=%s', v_txn_count_before, v_txn_count_after);

  select count(*) into v_alloc_count from public.online_payment_transaction_allocations where due_id = v_due_unowned_id;
  assert v_alloc_count = 0, format('FAIL scenario 3: expected zero allocation rows for the not-owned due, got %s', v_alloc_count);

  raise notice 'SCENARIO 3 (due not owned by member rejected, atomic): PASS';

  -----------------------------------------------------------------------
  -- SCENARIO 4: a PAID due is rejected with DUE_NOT_PAYABLE (sqlstate
  -- 22023). Atomicity proof as above.
  -----------------------------------------------------------------------
  select count(*) into v_txn_count_before from public.online_payment_transactions where organization_id = v_org_id;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_user::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_error_caught := false;
  v_sqlstate := null;
  begin
    perform public.create_online_payment_checkout_transaction(array[v_due_paid_id], 'FAWRY');
  exception when others then
    v_error_caught := true;
    get stacked diagnostics v_sqlstate = returned_sqlstate;
  end;

  reset role;

  assert v_error_caught and v_sqlstate = '22023',
    format('FAIL scenario 4: expected sqlstate 22023 (DUE_NOT_PAYABLE), got error_caught=%s sqlstate=%s', v_error_caught, v_sqlstate);

  select count(*) into v_txn_count_after from public.online_payment_transactions where organization_id = v_org_id;
  assert v_txn_count_after = v_txn_count_before,
    format('FAIL scenario 4: expected no new transaction row, before=%s after=%s', v_txn_count_before, v_txn_count_after);

  select count(*) into v_alloc_count from public.online_payment_transaction_allocations where due_id = v_due_paid_id;
  assert v_alloc_count = 0, format('FAIL scenario 4: expected zero allocation rows for the PAID due, got %s', v_alloc_count);

  raise notice 'SCENARIO 4 (PAID due rejected, atomic): PASS';

  -----------------------------------------------------------------------
  -- SCENARIO 5: a user with no members row at all (not a portal member)
  -- is rejected with sqlstate 42501. Atomicity proof as above.
  -----------------------------------------------------------------------
  select count(*) into v_txn_count_before from public.online_payment_transactions where organization_id = v_org_id;

  perform set_config('request.jwt.claims', json_build_object('sub', v_non_member_user::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_error_caught := false;
  v_sqlstate := null;
  begin
    perform public.create_online_payment_checkout_transaction(array[v_due1_id], 'FAWRY');
  exception when others then
    v_error_caught := true;
    get stacked diagnostics v_sqlstate = returned_sqlstate;
  end;

  reset role;

  assert v_error_caught and v_sqlstate = '42501',
    format('FAIL scenario 5: expected sqlstate 42501 (NOT_A_PORTAL_MEMBER), got error_caught=%s sqlstate=%s', v_error_caught, v_sqlstate);

  select count(*) into v_txn_count_after from public.online_payment_transactions where organization_id = v_org_id;
  assert v_txn_count_after = v_txn_count_before,
    format('FAIL scenario 5: expected no new transaction row, before=%s after=%s', v_txn_count_before, v_txn_count_after);

  raise notice 'SCENARIO 5 (non-portal-member rejected, 42501): PASS';

  -----------------------------------------------------------------------
  -- SCENARIO 6: p_provider = 'PAYMOB' rejected with INVALID_PROVIDER
  -- (sqlstate 22023) -- the explicit Paymob-exclusion gate (Task 3 ships
  -- Paymob as contract-tests-only, not production-wired; this RPC must not
  -- let a checkout transaction be created for it). Reuses v_due1_id/
  -- v_due2_id (already allocated into scenario 1's transaction) -- fine,
  -- since this call must fail on the provider check before the due loop
  -- ever runs. Atomicity proof as above.
  -----------------------------------------------------------------------
  select count(*) into v_txn_count_before from public.online_payment_transactions where organization_id = v_org_id;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_user::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_error_caught := false;
  v_sqlstate := null;
  begin
    perform public.create_online_payment_checkout_transaction(array[v_due1_id, v_due2_id], 'PAYMOB');
  exception when others then
    v_error_caught := true;
    get stacked diagnostics v_sqlstate = returned_sqlstate;
  end;

  reset role;

  assert v_error_caught and v_sqlstate = '22023',
    format('FAIL scenario 6: expected sqlstate 22023 (INVALID_PROVIDER), got error_caught=%s sqlstate=%s', v_error_caught, v_sqlstate);

  select count(*) into v_txn_count_after from public.online_payment_transactions where organization_id = v_org_id;
  assert v_txn_count_after = v_txn_count_before,
    format('FAIL scenario 6: expected no new transaction row, before=%s after=%s', v_txn_count_before, v_txn_count_after);

  raise notice 'SCENARIO 6 (PAYMOB provider rejected, atomic): PASS';

  -----------------------------------------------------------------------
  -- SCENARIO 7: empty array (array[]::uuid[]) rejected with
  -- NO_DUES_SELECTED (sqlstate 22023). array_length() of an empty array is
  -- NULL in Postgres, so this hits the same `p_due_ids is null or
  -- array_length(p_due_ids, 1) is null` guard as a NULL array. Atomicity
  -- proof as above.
  -----------------------------------------------------------------------
  select count(*) into v_txn_count_before from public.online_payment_transactions where organization_id = v_org_id;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_user::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_error_caught := false;
  v_sqlstate := null;
  begin
    perform public.create_online_payment_checkout_transaction(array[]::uuid[], 'FAWRY');
  exception when others then
    v_error_caught := true;
    get stacked diagnostics v_sqlstate = returned_sqlstate;
  end;

  reset role;

  assert v_error_caught and v_sqlstate = '22023',
    format('FAIL scenario 7: expected sqlstate 22023 (NO_DUES_SELECTED), got error_caught=%s sqlstate=%s', v_error_caught, v_sqlstate);

  select count(*) into v_txn_count_after from public.online_payment_transactions where organization_id = v_org_id;
  assert v_txn_count_after = v_txn_count_before,
    format('FAIL scenario 7: expected no new transaction row, before=%s after=%s', v_txn_count_before, v_txn_count_after);

  raise notice 'SCENARIO 7 (empty due array rejected, atomic): PASS';

  -----------------------------------------------------------------------
  -- SCENARIO 8: double-booking guard -- two sequential checkout calls for
  -- the SAME due. The first succeeds; the second must be rejected with
  -- DUE_HAS_PENDING_CHECKOUT (sqlstate 22023), and a fresh select must show
  -- exactly ONE transaction+allocation pair for this due, not two.
  -----------------------------------------------------------------------
  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_user::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  select * into v_result from public.create_online_payment_checkout_transaction(array[v_due_double_id], 'FAWRY');

  reset role;

  assert v_result.transaction_id is not null, 'FAIL scenario 8 setup: first call for v_due_double_id should have succeeded';

  select count(*) into v_txn_count_before from public.online_payment_transactions where organization_id = v_org_id;

  perform set_config('request.jwt.claims', json_build_object('sub', v_owner_user::text, 'role', 'authenticated')::text, true);
  set local role authenticated;

  v_error_caught := false;
  v_sqlstate := null;
  begin
    perform public.create_online_payment_checkout_transaction(array[v_due_double_id], 'FAWRY');
  exception when others then
    v_error_caught := true;
    get stacked diagnostics v_sqlstate = returned_sqlstate;
  end;

  reset role;

  assert v_error_caught and v_sqlstate = '22023',
    format('FAIL scenario 8: expected sqlstate 22023 (DUE_HAS_PENDING_CHECKOUT) on the second call, got error_caught=%s sqlstate=%s', v_error_caught, v_sqlstate);

  select count(*) into v_txn_count_after from public.online_payment_transactions where organization_id = v_org_id;
  assert v_txn_count_after = v_txn_count_before,
    format('FAIL scenario 8: expected no new transaction row from the rejected second call, before=%s after=%s', v_txn_count_before, v_txn_count_after);

  -- Fresh, separate select -- proves exactly one transaction+allocation
  -- pair exists for this due, not two (the bug this fix closes).
  select count(*) into v_alloc_count from public.online_payment_transaction_allocations where due_id = v_due_double_id;
  assert v_alloc_count = 1, format('FAIL scenario 8: expected exactly 1 allocation row for v_due_double_id, got %s', v_alloc_count);

  raise notice 'SCENARIO 8 (double-booking rejected, only 1 transaction+allocation pair exists): PASS';

  -----------------------------------------------------------------------
  -- Cleanup -- unconditional, matches this repo's established
  -- never-hard-delete convention (see phase_owner_portal_record_online_payment.sql
  -- for the identical rationale: this script's dues are real receivable
  -- rows and archiving avoids ever needing a hard delete). Unlink the
  -- borrowed real auth account from its throwaway member row first
  -- (members.user_id is globally UNIQUE) so a future run isn't blocked by
  -- it. jwt claim must be restored to the platform admin before calling
  -- set_organization_status(), which checks is_platform_admin(auth.uid()).
  -----------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_platform_admin::text, false);
  update public.members set user_id = null where id = v_member_id;
  perform public.set_organization_status(v_org_id, 'ARCHIVED', 'phase_owner_portal_checkout_transaction test cleanup');

  raise notice 'phase_owner_portal_checkout_transaction.sql: all 8 SQL scenarios passed (atomicity property additionally verified inline in scenarios 2-8), cleanup complete';
end $$;
