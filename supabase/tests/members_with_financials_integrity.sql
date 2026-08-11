-- members_with_financials view integrity + cross-tenant RLS isolation test.
-- Verifies: (1) total_balance sums a member's active-owned units' balances
-- in FULL for co-owners (the approved phase-3 policy, not pro-rated by
-- share_percentage), (2) a member with no units gets clean zeros, (3) a
-- genuine tenant user only sees their own org's members through the view
-- (the reason for security_invoker = true, composed through
-- units_with_financials).

select set_config('request.jwt.claim.sub', 'b66490aa-a3a7-4005-add2-1112c660b0b4', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
set local role authenticated;

create temporary table test_results (name text, status text, detail text);

do $$
declare
  v_org_a uuid;
  v_resort_a uuid;
  v_period_a uuid;
  v_cash_a uuid;
  v_revenue_a uuid;
  v_receivable_a uuid;
  v_due_type_a uuid;
  v_unit_a1 uuid;
  v_unit_a2 uuid;
  v_unit_a3 uuid;
  v_due_a1 uuid;
  v_due_a2 uuid;
  v_due_a3 uuid;
  v_owner1 uuid;
  v_owner2 uuid;
  v_owner3 uuid;
  v_owner4 uuid;

  v_org_b uuid;
  v_resort_b uuid;
  v_unit_b1 uuid;
  v_member_b uuid;

  v_tenant_user uuid := '11d45b6f-1162-433e-8324-ebaf7cd0e618';

  r record;
  v_pass boolean;
begin
  ---------------------------------------------------------------------
  -- Setup: org A, 3 units, 4 members (one with no units at all)
  ---------------------------------------------------------------------
  v_org_a := public.create_organization('MWF Test Org A', 'mwf-test-a-' || extract(epoch from now())::bigint, 'EGP', 'STARTER');
  v_resort_a := public.create_resort(v_org_a, 'Resort A', 'RA1', 'Africa/Cairo');
  perform public.clone_chart_of_accounts_template(v_org_a, 'RESORT_STANDARD');
  declare v_year_a uuid;
  begin
    v_year_a := public.create_fiscal_year(v_org_a, 'TestYear', '2026-01-01', '2026-12-31');
    select id into v_period_a from public.fiscal_periods where fiscal_year_id = v_year_a and period_number = 1;
    perform public.set_fiscal_period_status(v_period_a, 'OPEN', 'test setup');
  end;

  select id into v_cash_a from public.chart_of_accounts where organization_id = v_org_a and code = '1110';
  select id into v_revenue_a from public.chart_of_accounts where organization_id = v_org_a and code = '4100';
  select id into v_receivable_a from public.chart_of_accounts where organization_id = v_org_a and code = '1130';

  insert into public.due_types (organization_id, name_ar, name_en, default_revenue_account_id)
  values (v_org_a, 'صيانة', 'Maintenance', v_revenue_a) returning id into v_due_type_a;

  insert into public.units (organization_id, resort_id, code, unit_type) values (v_org_a, v_resort_a, 'A-1', 'VILLA') returning id into v_unit_a1;
  insert into public.units (organization_id, resort_id, code, unit_type) values (v_org_a, v_resort_a, 'A-2', 'CHALET') returning id into v_unit_a2;
  insert into public.units (organization_id, resort_id, code, unit_type) values (v_org_a, v_resort_a, 'A-3', 'APARTMENT') returning id into v_unit_a3;

  insert into public.members (organization_id, full_name) values (v_org_a, 'Owner One') returning id into v_owner1;
  insert into public.members (organization_id, full_name) values (v_org_a, 'Owner Two') returning id into v_owner2;
  insert into public.members (organization_id, full_name) values (v_org_a, 'Owner Three') returning id into v_owner3;
  insert into public.members (organization_id, full_name) values (v_org_a, 'Owner No-Units') returning id into v_owner4;

  insert into public.unit_ownerships (organization_id, unit_id, member_id, share_percentage, is_primary_contact)
  values (v_org_a, v_unit_a1, v_owner1, 100, true);
  insert into public.unit_ownerships (organization_id, unit_id, member_id, share_percentage, is_primary_contact)
  values (v_org_a, v_unit_a2, v_owner2, 100, true);
  -- A-3 is co-owned 50/50 by Owner One and Owner Three.
  insert into public.unit_ownerships (organization_id, unit_id, member_id, share_percentage, is_primary_contact)
  values (v_org_a, v_unit_a3, v_owner1, 50, true);
  insert into public.unit_ownerships (organization_id, unit_id, member_id, share_percentage, is_primary_contact)
  values (v_org_a, v_unit_a3, v_owner3, 50, false);

  -- A-1: due 1000, paid 300 by Owner One -> balance 700
  v_due_a1 := public.issue_due(v_org_a, v_resort_a, v_unit_a1, v_due_type_a, v_receivable_a, 1000, '2026-01-05', '2026-01-31', 'Q1 fee', v_period_a);
  perform public.record_payment(
    v_org_a, v_resort_a, v_owner1, null, 300, 'CASH', '2026-01-10', v_cash_a, v_period_a,
    jsonb_build_array(jsonb_build_object('due_id', v_due_a1, 'amount', 300)),
    'mwf-test-payment-1'
  );

  -- A-2: due 500, paid in full by Owner Two -> balance 0
  v_due_a2 := public.issue_due(v_org_a, v_resort_a, v_unit_a2, v_due_type_a, v_receivable_a, 500, '2026-01-05', '2026-01-31', 'Q1 fee', v_period_a);
  perform public.record_payment(
    v_org_a, v_resort_a, v_owner2, null, 500, 'CASH', '2026-01-12', v_cash_a, v_period_a,
    jsonb_build_array(jsonb_build_object('due_id', v_due_a2, 'amount', 500)),
    'mwf-test-payment-2'
  );

  -- A-3: due 800, unpaid -> balance 800 (owed by both co-owners in full)
  v_due_a3 := public.issue_due(v_org_a, v_resort_a, v_unit_a3, v_due_type_a, v_receivable_a, 800, '2026-01-05', '2026-01-31', 'Q1 fee', v_period_a);

  ---------------------------------------------------------------------
  -- Setup: org B, kept entirely separate
  ---------------------------------------------------------------------
  v_org_b := public.create_organization('MWF Test Org B', 'mwf-test-b-' || extract(epoch from now())::bigint, 'EGP', 'STARTER');
  v_resort_b := public.create_resort(v_org_b, 'Resort B', 'RB1', 'Africa/Cairo');
  perform public.clone_chart_of_accounts_template(v_org_b, 'RESORT_STANDARD');
  insert into public.units (organization_id, resort_id, code, unit_type) values (v_org_b, v_resort_b, 'B-1', 'VILLA') returning id into v_unit_b1;
  insert into public.members (organization_id, full_name) values (v_org_b, 'Other Org Member') returning id into v_member_b;
  insert into public.unit_ownerships (organization_id, unit_id, member_id, share_percentage, is_primary_contact)
  values (v_org_b, v_unit_b1, v_member_b, 100, true);

  insert into test_results values ('setup', 'INFO', format('org_a=%s, org_b=%s', v_org_a, v_org_b));

  ---------------------------------------------------------------------
  -- TEST 1: Owner One -- sole owner of A-1 (balance 700) + co-owner of
  -- A-3 (balance 800, full amount not pro-rated) -> total 1500, 2 units
  ---------------------------------------------------------------------
  select * into r from public.members_with_financials where id = v_owner1;
  v_pass := r.units_count = 2 and r.total_balance = 1500 and r.has_arrears = true
    and r.last_payment_amount = 300 and r.last_payment_date = '2026-01-10';
  insert into test_results values (
    'TEST 1 (Owner One: 2 units, full co-owner balance, last payment)',
    case when v_pass then 'PASS' else 'FAIL' end,
    format('units_count=%s total_balance=%s arrears=%s last_amt=%s last_date=%s', r.units_count, r.total_balance, r.has_arrears, r.last_payment_amount, r.last_payment_date)
  );

  ---------------------------------------------------------------------
  -- TEST 2: Owner Two -- fully paid, no arrears
  ---------------------------------------------------------------------
  select * into r from public.members_with_financials where id = v_owner2;
  v_pass := r.units_count = 1 and r.total_balance = 0 and r.has_arrears = false;
  insert into test_results values (
    'TEST 2 (Owner Two: fully paid, no arrears)',
    case when v_pass then 'PASS' else 'FAIL' end,
    format('units_count=%s total_balance=%s arrears=%s', r.units_count, r.total_balance, r.has_arrears)
  );

  ---------------------------------------------------------------------
  -- TEST 3: Owner Three -- co-owner of A-3 only, sees the SAME full
  -- balance as Owner One does for that unit (approved policy)
  ---------------------------------------------------------------------
  select * into r from public.members_with_financials where id = v_owner3;
  v_pass := r.units_count = 1 and r.total_balance = 800 and r.has_arrears = true;
  insert into test_results values (
    'TEST 3 (Owner Three: co-owner sees full unit balance)',
    case when v_pass then 'PASS' else 'FAIL' end,
    format('units_count=%s total_balance=%s arrears=%s', r.units_count, r.total_balance, r.has_arrears)
  );

  ---------------------------------------------------------------------
  -- TEST 4: Owner No-Units -- clean zeros, not an error
  ---------------------------------------------------------------------
  select * into r from public.members_with_financials where id = v_owner4;
  v_pass := r.units_count = 0 and r.total_balance = 0 and r.has_arrears = false and r.last_payment_amount is null;
  insert into test_results values (
    'TEST 4 (member with no units: clean zeros)',
    case when v_pass then 'PASS' else 'FAIL' end,
    format('units_count=%s total_balance=%s arrears=%s last_amt=%s', r.units_count, r.total_balance, r.has_arrears, r.last_payment_amount)
  );

  ---------------------------------------------------------------------
  -- TEST 5: org-wide arrears sum via members_with_financials must NOT be
  -- used for the /members "total arrears" KPI (it would double-count A-3
  -- across its two co-owners) -- confirm that behavior is real here, as
  -- documentation for why the page computes that KPI from units directly.
  ---------------------------------------------------------------------
  declare
    v_sum_via_members numeric;
    v_sum_via_units numeric;
  begin
    select sum(total_balance) into v_sum_via_members from public.members_with_financials where organization_id = v_org_a and has_arrears;
    select sum(balance) into v_sum_via_units from public.units_with_financials where organization_id = v_org_a and has_arrears;
    -- Owner One (1500: A1=700 + A3=800) + Owner Three (800: A3 again) = 2300,
    -- double-counting A-3's 800 balance across its two co-owners. The
    -- correct org-wide figure sums each unit once: A1=700 + A3=800 = 1500
    -- (A-2 is fully paid, so it has no arrears and is excluded either way).
    v_pass := v_sum_via_members = 2300 and v_sum_via_units = 1500;
    insert into test_results values (
      'TEST 5 (confirms co-owner double-count via members; units-based sum is correct)',
      case when v_pass then 'PASS' else 'FAIL' end,
      format('sum_via_members=%s (expected 2300, double-counts A-3) sum_via_units=%s (expected 1500, correct)', v_sum_via_members, v_sum_via_units)
    );
  end;

  ---------------------------------------------------------------------
  -- TEST 6: RLS isolation -- a genuine tenant user of org A only must
  -- never see org B's members through the view.
  ---------------------------------------------------------------------
  perform public.add_organization_member(v_org_a, v_tenant_user, 'TENANT_OWNER');
  perform set_config('request.jwt.claim.sub', v_tenant_user::text, false);

  declare
    v_count_a int;
    v_count_b int;
  begin
    select count(*) into v_count_a from public.members_with_financials where organization_id = v_org_a;
    select count(*) into v_count_b from public.members_with_financials where organization_id = v_org_b;
    v_pass := v_count_a = 4 and v_count_b = 0;
    insert into test_results values (
      'TEST 6 (tenant user sees only own org members via view)',
      case when v_pass then 'PASS' else 'FAIL' end,
      format('org_a_members=%s org_b_members=%s', v_count_a, v_count_b)
    );
  end;

  perform set_config('request.jwt.claim.sub', 'b66490aa-a3a7-4005-add2-1112c660b0b4', false);

  ---------------------------------------------------------------------
  -- Cleanup
  ---------------------------------------------------------------------
  perform public.set_organization_status(v_org_a, 'ARCHIVED', 'members_with_financials test cleanup');
  perform public.set_organization_status(v_org_b, 'ARCHIVED', 'members_with_financials test cleanup');
  insert into test_results values ('cleanup', 'INFO', 'both test orgs archived');
end $$;

select name, status, detail from test_results order by name;
