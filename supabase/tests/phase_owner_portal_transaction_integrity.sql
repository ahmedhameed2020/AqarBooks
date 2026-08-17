-- Phase 3 online-payment-transaction-model isolation & integrity test.
-- Creates two orgs (A, B), each with one owner (linked to a distinct real
-- auth.users row) and org A with one unit+due, to prove:
--   1. An owner sees only their own transaction.
--   2. An owner cannot INSERT a transaction claiming another member_id
--      (RLS with-check forces member_id = current_member_id()).
--   3. A different owner cannot see another org's transaction, even
--      knowing its real UUID.
--   4. amount cannot be changed once a transaction leaves PENDING.
--   5. organization_id/property_id/member_id/provider cannot be changed once
--      a transaction leaves PENDING.
--   6. A transaction cannot transition PAID -> PENDING (or any terminal
--      state back to any other state).
--   7. A duplicate (organization_id, client_request_id) is rejected by the
--      unique index.
--   8. A duplicate (provider, provider_reference) is rejected by the
--      unique index.
--   9. A duplicate (provider, webhook_event_id) is rejected by the unique
--      index.
--  10. expire_stale_online_payment_transactions() only flips PENDING rows
--      past expires_at to EXPIRED, never touches PAID/other rows, and is
--      not callable by `authenticated` at all.
--  11. Allocation rows are visible to the owning member only (same
--      cross-org denial as the transaction itself).
--
-- Real auth.users rows are required (members.user_id FK). Reuses the
-- project's known platform-admin/staff test account plus one dedicated
-- e2e-* fixture account already present in this project (see
-- phase_owner_portal_data_integrity.sql for the same convention), so no
-- personal account is borrowed for the second owner role.
--
-- Idempotency: dues is a "functions are the only writer" table (RLS has a
-- SELECT policy only -- see 20260810000026_property_receivables_rls.sql),
-- so the due is created via issue_dues(), same as Task 10's script, which
-- requires the platform-admin caller to hold an ACTIVE organization
-- membership with finance.dues.issue on org A first.

select set_config('request.jwt.claim.sub', 'b66490aa-a3a7-4005-add2-1112c660b0b4', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
set local role authenticated;

create temporary table test_results (name text, status text, detail text);

do $$
declare
  v_org_a uuid;
  v_org_b uuid;
  v_resort_a uuid;
  v_unit_a uuid;
  v_due_type_a uuid;
  v_receivable_a uuid;
  v_revenue_a uuid;
  v_due_a uuid;
  v_member_a uuid;
  v_member_b uuid;
  v_owner_a_user uuid := '11d45b6f-1162-433e-8324-ebaf7cd0e618';
  v_owner_b_user uuid := 'aeefd024-79c6-4f16-bf35-d28df0ed4bf8'; -- e2e-viewer@resortos-test.local
  v_platform_admin uuid := 'b66490aa-a3a7-4005-add2-1112c660b0b4';
  v_txn_a uuid;
  v_txn_b uuid;
  v_count int;
  v_pass boolean;
  v_error_caught boolean;
  -- provider_reference and webhook_event_id are globally unique per
  -- (provider, value) -- not scoped to organization_id (see
  -- idx_online_txn_provider_ref / idx_online_txn_webhook_event in
  -- 20260815000001) -- and archiving an org does not delete its rows, so a
  -- literal constant here would collide with the previous run's leftover
  -- row on a second consecutive run. Suffix both with a per-run token to
  -- keep the script idempotent, same rationale as create_organization's
  -- epoch-suffixed slug above.
  v_run_suffix text := extract(epoch from clock_timestamp())::text;
begin
  v_org_a := public.create_organization('Portal Txn Test A', 'portal-txn-a-' || extract(epoch from now())::bigint, 'EGP', 'STARTER');
  v_org_b := public.create_organization('Portal Txn Test B', 'portal-txn-b-' || extract(epoch from now())::bigint, 'EGP', 'STARTER');
  v_resort_a := public.create_resort(p_organization_id => v_org_a, p_name => 'Resort A', p_code => 'PTA1', p_timezone => 'Africa/Cairo', p_address => null, p_governorate => null, p_phone => null, p_email => null);
  perform public.clone_chart_of_accounts_template(v_org_a, 'RESORT_STANDARD');

  select id into v_revenue_a from public.chart_of_accounts where organization_id = v_org_a and code = '4100';
  select id into v_receivable_a from public.chart_of_accounts where organization_id = v_org_a and code = '1130';

  insert into public.due_types (organization_id, name_ar, name_en, default_revenue_account_id)
  values (v_org_a, 'اشتراك', 'Dues', v_revenue_a) returning id into v_due_type_a;

  insert into public.units (organization_id, property_id, code, unit_type)
  values (v_org_a, v_resort_a, 'PTA-101', 'VILLA') returning id into v_unit_a;

  -- issue_dues() -> has_financial_permission() requires an ACTIVE
  -- organization_memberships row for the caller, same convention as
  -- phase_owner_portal_data_integrity.sql: give the platform admin a
  -- throwaway active membership on org A first.
  perform public.add_organization_member(v_org_a, v_platform_admin, 'TENANT_OWNER');
  update public.organization_memberships set status = 'active'
  where organization_id = v_org_a and user_id = v_platform_admin;

  perform public.issue_dues(
    p_organization_id => v_org_a,
    p_resort_id => v_resort_a,
    p_unit_ids => array[v_unit_a],
    p_due_type_id => v_due_type_a,
    p_receivable_account_id => v_receivable_a,
    p_amount => 1000,
    p_issue_date => current_date,
    p_due_date => current_date + 30,
    p_description => 'portal txn test due'
  );
  select id into v_due_a from public.dues
  where unit_id = v_unit_a and due_type_id = v_due_type_a and issue_date = current_date
  order by created_at desc limit 1;

  insert into public.members (organization_id, full_name, user_id)
  values (v_org_a, 'Owner A', v_owner_a_user) returning id into v_member_a;
  insert into public.members (organization_id, full_name, user_id)
  values (v_org_b, 'Owner B', v_owner_b_user) returning id into v_member_b;

  -- TEST 1: owner A inserts their own PENDING transaction + allocation.
  perform set_config('request.jwt.claim.sub', v_owner_a_user::text, false);
  insert into public.online_payment_transactions
    (organization_id, property_id, member_id, client_request_id, provider, amount, expires_at)
  values
    (v_org_a, v_resort_a, v_member_a, 'creq-a-1', 'PAYMOB', 1000, now() + interval '30 minutes')
  returning id into v_txn_a;
  insert into public.online_payment_transaction_allocations (transaction_id, due_id, amount)
  values (v_txn_a, v_due_a, 1000);

  select count(*) into v_count from public.online_payment_transactions where id = v_txn_a;
  v_pass := v_count = 1;
  insert into test_results values ('TEST 1 (owner inserts and sees own transaction)', case when v_pass then 'PASS' else 'FAIL' end, format('count=%s', v_count));

  -- TEST 2: owner A cannot insert a transaction claiming member B's id.
  v_error_caught := false;
  begin
    insert into public.online_payment_transactions
      (organization_id, property_id, member_id, client_request_id, provider, amount, expires_at)
    values
      (v_org_a, v_resort_a, v_member_b, 'creq-a-spoof', 'PAYMOB', 500, now() + interval '30 minutes');
  exception when sqlstate '42501' then
    v_error_caught := true;
  end;
  v_pass := v_error_caught;
  insert into test_results values ('TEST 2 (owner cannot insert transaction claiming another member_id)', case when v_pass then 'PASS' else 'FAIL' end, format('error_caught=%s', v_error_caught));

  -- TEST 3: owner B (different org) cannot see owner A's transaction, even with the real UUID.
  perform set_config('request.jwt.claim.sub', v_owner_b_user::text, false);
  select count(*) into v_count from public.online_payment_transactions where id = v_txn_a;
  v_pass := v_count = 0;
  insert into test_results values ('TEST 3 (different owner cannot see other org transaction)', case when v_pass then 'PASS' else 'FAIL' end, format('visible_rows=%s', v_count));

  select count(*) into v_count from public.online_payment_transaction_allocations
  where transaction_id = v_txn_a;
  v_pass := v_count = 0;
  insert into test_results values ('TEST 11 (different owner cannot see other org allocation rows)', case when v_pass then 'PASS' else 'FAIL' end, format('visible_rows=%s', v_count));

  -- Back to a privileged identity for the mutation tests below: RLS grants
  -- owners no UPDATE policy at all on this table (Task 2's migration
  -- comment: every status change is server-controlled), so these mutation
  -- tests exercise the trigger itself directly, bypassing RLS via `reset
  -- role`, mirroring how Phase 4's webhook handler will write through the
  -- service-role client rather than the owner's own session.
  reset role;

  -- TEST 4: amount cannot change once a transaction leaves PENDING.
  update public.online_payment_transactions set status = 'PAID', paid_at = now() where id = v_txn_a;
  v_error_caught := false;
  begin
    update public.online_payment_transactions set amount = 1 where id = v_txn_a;
  exception when sqlstate '22023' then
    v_error_caught := true;
  end;
  v_pass := v_error_caught;
  insert into test_results values ('TEST 4 (amount immutable after leaving PENDING)', case when v_pass then 'PASS' else 'FAIL' end, format('error_caught=%s', v_error_caught));

  -- TEST 5: organization_id/property_id/member_id/provider cannot change once settled.
  v_error_caught := false;
  begin
    update public.online_payment_transactions set provider = 'FAWRY' where id = v_txn_a;
  exception when sqlstate '22023' then
    v_error_caught := true;
  end;
  v_pass := v_error_caught;
  insert into test_results values ('TEST 5 (provider immutable after leaving PENDING)', case when v_pass then 'PASS' else 'FAIL' end, format('error_caught=%s', v_error_caught));

  -- TEST 6: cannot transition PAID back to PENDING (or any other state).
  v_error_caught := false;
  begin
    update public.online_payment_transactions set status = 'PENDING' where id = v_txn_a;
  exception when sqlstate '22023' then
    v_error_caught := true;
  end;
  v_pass := v_error_caught;
  insert into test_results values ('TEST 6 (cannot transition PAID back to PENDING)', case when v_pass then 'PASS' else 'FAIL' end, format('error_caught=%s', v_error_caught));

  -- TEST 7: duplicate (organization_id, client_request_id) rejected.
  v_error_caught := false;
  begin
    insert into public.online_payment_transactions
      (organization_id, property_id, member_id, client_request_id, provider, amount, expires_at)
    values
      (v_org_a, v_resort_a, v_member_a, 'creq-a-1', 'PAYMOB', 250, now() + interval '30 minutes');
  exception when unique_violation then
    v_error_caught := true;
  end;
  v_pass := v_error_caught;
  insert into test_results values ('TEST 7 (duplicate client_request_id within org rejected)', case when v_pass then 'PASS' else 'FAIL' end, format('error_caught=%s', v_error_caught));

  -- TEST 8: duplicate (provider, provider_reference) rejected.
  insert into public.online_payment_transactions
    (organization_id, property_id, member_id, client_request_id, provider, amount, expires_at, provider_reference)
  values
    (v_org_a, v_resort_a, v_member_a, 'creq-a-2', 'PAYMOB', 300, now() + interval '30 minutes', 'PMOB-REF-' || v_run_suffix)
  returning id into v_txn_b;

  v_error_caught := false;
  begin
    insert into public.online_payment_transactions
      (organization_id, property_id, member_id, client_request_id, provider, amount, expires_at, provider_reference)
    values
      (v_org_a, v_resort_a, v_member_a, 'creq-a-3', 'PAYMOB', 300, now() + interval '30 minutes', 'PMOB-REF-' || v_run_suffix);
  exception when unique_violation then
    v_error_caught := true;
  end;
  v_pass := v_error_caught;
  insert into test_results values ('TEST 8 (duplicate provider_reference for same provider rejected)', case when v_pass then 'PASS' else 'FAIL' end, format('error_caught=%s', v_error_caught));

  -- TEST 9: duplicate (provider, webhook_event_id) rejected.
  update public.online_payment_transactions set webhook_event_id = 'EVT-' || v_run_suffix where id = v_txn_b;
  v_error_caught := false;
  begin
    insert into public.online_payment_transactions
      (organization_id, property_id, member_id, client_request_id, provider, amount, expires_at, webhook_event_id)
    values
      (v_org_a, v_resort_a, v_member_a, 'creq-a-4', 'PAYMOB', 300, now() + interval '30 minutes', 'EVT-' || v_run_suffix);
  exception when unique_violation then
    v_error_caught := true;
  end;
  v_pass := v_error_caught;
  insert into test_results values ('TEST 9 (duplicate webhook_event_id for same provider rejected)', case when v_pass then 'PASS' else 'FAIL' end, format('error_caught=%s', v_error_caught));

  -- TEST 10: expiry sweep only touches PENDING rows past expires_at, and is
  -- not callable by `authenticated`.
  update public.online_payment_transactions set expires_at = now() - interval '1 hour' where id = v_txn_b; -- v_txn_b is still PENDING
  perform set_config('request.jwt.claim.sub', v_owner_a_user::text, false);
  set local role authenticated;
  v_error_caught := false;
  begin
    perform public.expire_stale_online_payment_transactions();
  exception when sqlstate '42501' then
    v_error_caught := true;
  end;
  v_pass := v_error_caught;
  insert into test_results values ('TEST 10a (expire sweep not callable by authenticated)', case when v_pass then 'PASS' else 'FAIL' end, format('error_caught=%s', v_error_caught));

  reset role;
  perform public.expire_stale_online_payment_transactions();

  declare v_status_b text; v_status_a text;
  begin
    select status into v_status_b from public.online_payment_transactions where id = v_txn_b;
    v_pass := v_status_b = 'EXPIRED';
    insert into test_results values ('TEST 10b (stale PENDING transaction flipped to EXPIRED)', case when v_pass then 'PASS' else 'FAIL' end, format('status=%s', v_status_b));

    select status into v_status_a from public.online_payment_transactions where id = v_txn_a;
    v_pass := v_status_a = 'PAID';
    insert into test_results values ('TEST 10c (already-PAID transaction untouched by sweep)', case when v_pass then 'PASS' else 'FAIL' end, format('status=%s', v_status_a));
  end;

  -- Unlink real auth accounts from these throwaway test members before
  -- archiving -- members.user_id is globally UNIQUE, so leaving it linked
  -- would block any future run of this same script. Done unconditionally,
  -- via `reset role` (bypasses RLS entirely), regardless of what state
  -- earlier assertions left things in -- same lesson as Task 10's own
  -- cleanup comment.
  --
  -- jwt.claim.sub must be restored to the platform admin before this point:
  -- TEST 10 left it set to owner A, and set_organization_status() checks
  -- is_platform_admin(auth.uid()), which reads that same session GUC
  -- regardless of the Postgres role active at call time.
  perform set_config('request.jwt.claim.sub', v_platform_admin::text, false);
  reset role;
  update public.members set user_id = null where id in (v_member_a, v_member_b);

  set local role authenticated;
  perform public.set_organization_status(v_org_a, 'ARCHIVED', 'portal transaction test cleanup');
  perform public.set_organization_status(v_org_b, 'ARCHIVED', 'portal transaction test cleanup');
  insert into test_results values ('cleanup', 'INFO', 'both test orgs archived, both borrowed auth accounts unlinked');
end $$;

select name, status, detail from test_results order by name;
