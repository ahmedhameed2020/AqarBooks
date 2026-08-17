-- units_with_financials view integrity + cross-tenant RLS isolation test.
-- Self-contained: creates two ephemeral orgs (A with 3 units, B with 1 unit),
-- issues dues and a partial payment on org A, links an owner + building/zone
-- to one unit, then verifies the view's computed columns AND that a genuine
-- tenant user (not a platform admin) querying the view only ever sees their
-- own organization's rows -- the real point of this test, since a view
-- missing `security_invoker = true` would silently bypass RLS instead of
-- enforcing it.

select set_config('request.jwt.claim.sub', 'b66490aa-a3a7-4005-add2-1112c660b0b4', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
set local role authenticated;

-- Results go into a temp table instead of `raise notice`, so they show up
-- in the normal query-results grid regardless of the SQL editor's UI.
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
  v_zone_a uuid;
  v_building_a uuid;
  v_unit_a1 uuid;
  v_unit_a2 uuid;
  v_unit_a3 uuid;
  v_due_a1 uuid;
  v_due_a2 uuid;
  v_member_a uuid;

  v_org_b uuid;
  v_resort_b uuid;
  v_unit_b1 uuid;

  -- organization_memberships.user_id has an FK to auth.users, so this must be
  -- a real existing user -- not a fabricated uuid. Using the known tenant
  -- test account (ahmedhameed2020@gmail.com) is fine: it's a genuine
  -- non-platform-admin user, and this test only checks it's excluded from
  -- org B, regardless of whatever other orgs it's already a member of.
  v_tenant_user uuid := '11d45b6f-1162-433e-8324-ebaf7cd0e618';

  r record;
  v_pass boolean;
begin
  ---------------------------------------------------------------------
  -- Setup: org A with 3 units, one due type, dues + a partial payment
  ---------------------------------------------------------------------
  v_org_a := public.create_organization('UWF Test Org A', 'uwf-test-a-' || extract(epoch from now())::bigint, 'EGP', 'STARTER');
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

  insert into public.zones (organization_id, property_id, name_ar, name_en)
  values (v_org_a, v_resort_a, 'منطقة أ', 'Zone A') returning id into v_zone_a;
  insert into public.buildings (organization_id, property_id, zone_id, code, name_ar, name_en)
  values (v_org_a, v_resort_a, v_zone_a, 'B1', 'مبنى 1', 'Building 1') returning id into v_building_a;

  insert into public.units (organization_id, property_id, building_id, zone_id, code, unit_type)
  values (v_org_a, v_resort_a, v_building_a, v_zone_a, 'A-1', 'VILLA') returning id into v_unit_a1;
  insert into public.units (organization_id, property_id, code, unit_type)
  values (v_org_a, v_resort_a, 'A-2', 'CHALET') returning id into v_unit_a2;
  insert into public.units (organization_id, property_id, code, unit_type)
  values (v_org_a, v_resort_a, 'A-3', 'APARTMENT') returning id into v_unit_a3;

  insert into public.members (organization_id, full_name, email)
  values (v_org_a, 'Owner One', 'owner1@example.com') returning id into v_member_a;
  insert into public.unit_ownerships (organization_id, unit_id, member_id, share_percentage, is_primary_contact)
  values (v_org_a, v_unit_a1, v_member_a, 100, true);

  -- A-1: due 1000, partial payment 400 -> balance 600, arrears
  v_due_a1 := public.issue_due(v_org_a, v_resort_a, v_unit_a1, v_due_type_a, v_receivable_a, 1000, '2026-01-05', '2026-01-31', 'Q1 fee', v_period_a);
  perform public.record_payment(
    v_org_a, v_resort_a, null, v_unit_a1, 400, 'CASH', '2026-01-10', v_cash_a, v_period_a,
    jsonb_build_array(jsonb_build_object('due_id', v_due_a1, 'amount', 400)),
    'uwf-test-payment-1'
  );

  -- A-2: due 500, unpaid -> balance 500, arrears, no owner (vacant)
  v_due_a2 := public.issue_due(v_org_a, v_resort_a, v_unit_a2, v_due_type_a, v_receivable_a, 500, '2026-01-05', '2026-01-31', 'Q1 fee', v_period_a);

  -- A-3: no dues at all -> balance 0, no arrears, no owner (vacant)

  ---------------------------------------------------------------------
  -- Setup: org B with its own unit + due, kept entirely separate
  ---------------------------------------------------------------------
  v_org_b := public.create_organization('UWF Test Org B', 'uwf-test-b-' || extract(epoch from now())::bigint, 'EGP', 'STARTER');
  v_resort_b := public.create_resort(v_org_b, 'Resort B', 'RB1', 'Africa/Cairo');
  perform public.clone_chart_of_accounts_template(v_org_b, 'RESORT_STANDARD');
  insert into public.units (organization_id, property_id, code, unit_type)
  values (v_org_b, v_resort_b, 'B-1', 'VILLA') returning id into v_unit_b1;

  insert into test_results values ('setup', 'INFO', format('org_a=%s, org_b=%s', v_org_a, v_org_b));

  ---------------------------------------------------------------------
  -- TEST 1: computed financials are correct for A-1 (still as platform admin)
  ---------------------------------------------------------------------
  select * into r from public.units_with_financials where id = v_unit_a1;
  v_pass := r.total_due = 1000 and r.total_paid = 400 and r.balance = 600 and r.has_arrears = true
    and r.owner_name = 'Owner One' and r.occupancy_status = 'OCCUPIED'
    and r.building_name_en = 'Building 1' and r.zone_name_en = 'Zone A';
  insert into test_results values (
    'TEST 1 (A-1 financials/owner/building/zone)',
    case when v_pass then 'PASS' else 'FAIL' end,
    format('due=%s paid=%s balance=%s arrears=%s owner=%s occ=%s', r.total_due, r.total_paid, r.balance, r.has_arrears, r.owner_name, r.occupancy_status)
  );

  ---------------------------------------------------------------------
  -- TEST 2: A-2 is fully outstanding with no owner (vacant)
  ---------------------------------------------------------------------
  select * into r from public.units_with_financials where id = v_unit_a2;
  v_pass := r.total_due = 500 and r.total_paid = 0 and r.balance = 500 and r.has_arrears = true
    and r.owner_id is null and r.occupancy_status = 'VACANT';
  insert into test_results values (
    'TEST 2 (A-2 outstanding, vacant)',
    case when v_pass then 'PASS' else 'FAIL' end,
    format('balance=%s arrears=%s occ=%s', r.balance, r.has_arrears, r.occupancy_status)
  );

  ---------------------------------------------------------------------
  -- TEST 3: A-3 has no dues at all -> zeros, no arrears
  ---------------------------------------------------------------------
  select * into r from public.units_with_financials where id = v_unit_a3;
  v_pass := r.total_due = 0 and r.total_paid = 0 and r.balance = 0 and r.has_arrears = false;
  insert into test_results values (
    'TEST 3 (A-3 no dues -> zeros)',
    case when v_pass then 'PASS' else 'FAIL' end,
    format('due=%s paid=%s balance=%s arrears=%s', r.total_due, r.total_paid, r.balance, r.has_arrears)
  );

  ---------------------------------------------------------------------
  -- TEST 4: RLS isolation -- a genuine tenant user of org A only must
  -- never see org B's rows through the view (the reason for
  -- security_invoker = true on the view).
  ---------------------------------------------------------------------
  perform public.add_organization_member(v_org_a, v_tenant_user, 'TENANT_OWNER');

  perform set_config('request.jwt.claim.sub', v_tenant_user::text, false);

  declare
    v_count_a int;
    v_count_b int;
  begin
    select count(*) into v_count_a from public.units_with_financials where organization_id = v_org_a;
    select count(*) into v_count_b from public.units_with_financials where organization_id = v_org_b;
    v_pass := v_count_a = 3 and v_count_b = 0;
    insert into test_results values (
      'TEST 4 (tenant user sees only own org via view)',
      case when v_pass then 'PASS' else 'FAIL' end,
      format('org_a_rows=%s org_b_rows=%s', v_count_a, v_count_b)
    );
  end;

  -- restore platform admin session for cleanup
  perform set_config('request.jwt.claim.sub', 'b66490aa-a3a7-4005-add2-1112c660b0b4', false);

  ---------------------------------------------------------------------
  -- Cleanup: archive both test orgs (never delete, per project convention)
  ---------------------------------------------------------------------
  perform public.set_organization_status(v_org_a, 'ARCHIVED', 'units_with_financials test cleanup');
  perform public.set_organization_status(v_org_b, 'ARCHIVED', 'units_with_financials test cleanup');
  insert into test_results values ('cleanup', 'INFO', 'both test orgs archived');
end $$;

select name, status, detail from test_results order by name;
