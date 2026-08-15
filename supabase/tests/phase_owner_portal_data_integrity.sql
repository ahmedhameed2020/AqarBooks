-- Phase 2 Task 10: unit_ownerships/units/dues/payments/payment_allocations
-- RLS isolation test. Self-contained: creates one org (A) with a shared
-- unit co-owned by two members (a first owner + a co-owner) plus a second,
-- entirely separate org (B) for the organization_is_active gate. Proves:
--
--  1. An owner sees their own unit (via unit_ownerships).
--  2. An owner sees a due on their own unit.
--  3. An owner sees their own POSTED payment.
--  4. A co-owner of the SAME unit (different member) does NOT see the
--     first owner's payment (payment privacy between co-owners).
--  5. That same co-owner DOES still see the shared unit's due (joint
--     obligation visibility -- confirms #4 isn't accidentally
--     over-blocking dues too).
--  6. An owner of a SEPARATE org that gets ARCHIVED loses visibility of
--     their own unit/due/payment (proves the organization_is_active gate
--     added in 20260814000007 actually works, not just that it's present
--     in the SQL).
--
-- Real auth.users rows are required (members.user_id FK). Reuses the
-- project's known test/staff accounts plus two dedicated e2e-* fixture
-- accounts already present in this project (see other supabase/tests/*.sql
-- and tests/e2e/*.spec.ts for the same convention) so no personal account
-- is borrowed for the co-owner / second-org roles.
--
-- Note: issue_due (singular) no longer exists -- dues are issued via
-- issue_dues() (bulk-capable, takes an array of unit ids, returns a jsonb
-- summary rather than the due id) gated by has_financial_permission(),
-- which requires an ACTIVE organization_memberships row for the caller.
-- The platform admin caller therefore needs a throwaway active membership
-- on each test org before calling it (same convention as
-- separate_test_accounts.sql activating a membership immediately since the
-- real invite-email flow isn't in play in a fixture script).

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
  v_unit_a uuid;
  v_member_owner uuid;
  v_member_coowner uuid;
  v_due_a uuid;
  v_payment_a uuid;

  v_org_c uuid;
  v_resort_c uuid;
  v_period_c uuid;
  v_cash_c uuid;
  v_revenue_c uuid;
  v_receivable_c uuid;
  v_due_type_c uuid;
  v_unit_c uuid;
  v_member_c uuid;
  v_due_c uuid;
  v_payment_c uuid;

  -- Real existing auth.users rows (FK requirement), same convention as
  -- phase_owner_portal_identity_integrity.sql / units_with_financials_integrity.sql.
  v_owner_user uuid := '11d45b6f-1162-433e-8324-ebaf7cd0e618';
  v_coowner_user uuid := 'aeefd024-79c6-4f16-bf35-d28df0ed4bf8'; -- e2e-viewer@resortos-test.local
  v_owner_c_user uuid := '925ebf91-df93-4815-9280-b33defffe59c'; -- e2e-orgb-owner@resortos-test.local

  v_pass boolean;
  v_count int;
begin
  ---------------------------------------------------------------------
  -- Setup: org A, one unit co-owned by two members, one due, one
  -- POSTED payment made by the first owner only.
  ---------------------------------------------------------------------
  v_org_a := public.create_organization('Portal Data Test A', 'portal-data-a-' || extract(epoch from now())::bigint, 'EGP', 'STARTER');
  v_resort_a := public.create_resort(p_organization_id => v_org_a, p_name => 'Resort PDA', p_code => 'PDA1', p_timezone => 'Africa/Cairo', p_address => null, p_governorate => null, p_phone => null, p_email => null);
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

  insert into public.units (organization_id, resort_id, code, unit_type)
  values (v_org_a, v_resort_a, 'PDA-1', 'VILLA') returning id into v_unit_a;

  insert into public.members (organization_id, full_name, user_id)
  values (v_org_a, 'Data Test Owner', v_owner_user) returning id into v_member_owner;
  insert into public.members (organization_id, full_name, user_id)
  values (v_org_a, 'Data Test Co-owner', v_coowner_user) returning id into v_member_coowner;

  insert into public.unit_ownerships (organization_id, unit_id, member_id, share_percentage, is_primary_contact)
  values (v_org_a, v_unit_a, v_member_owner, 50, true);
  insert into public.unit_ownerships (organization_id, unit_id, member_id, share_percentage, is_primary_contact)
  values (v_org_a, v_unit_a, v_member_coowner, 50, false);

  -- issue_dues() -> has_financial_permission() requires an ACTIVE
  -- organization_memberships row for the caller (platform-admin creation of
  -- the org does not by itself grant financial-permission access), so give
  -- the platform admin a throwaway active membership on this test org
  -- first -- same convention as separate_test_accounts.sql activating a
  -- membership immediately since the real invite-email flow isn't in play.
  perform public.add_organization_member(v_org_a, 'b66490aa-a3a7-4005-add2-1112c660b0b4', 'TENANT_OWNER');
  update public.organization_memberships set status = 'active'
  where organization_id = v_org_a and user_id = 'b66490aa-a3a7-4005-add2-1112c660b0b4';

  -- issue_due (singular, fiscal-period-aware) no longer exists -- the
  -- current entry point is issue_dues (bulk-capable, array of unit ids,
  -- returns a jsonb summary rather than the due id), so the created due's
  -- id is looked up afterward by its known unit/type/issue_date.
  perform public.issue_dues(
    p_organization_id => v_org_a,
    p_resort_id => v_resort_a,
    p_unit_ids => array[v_unit_a],
    p_due_type_id => v_due_type_a,
    p_receivable_account_id => v_receivable_a,
    p_amount => 1000,
    p_issue_date => '2026-01-05'::date,
    p_due_date => '2026-01-31'::date,
    p_description => 'Q1 fee'
  );
  select id into v_due_a from public.dues
  where unit_id = v_unit_a and due_type_id = v_due_type_a and issue_date = '2026-01-05'
  order by created_at desc limit 1;

  v_payment_a := public.record_payment(
    v_org_a, v_resort_a, v_member_owner, v_unit_a, 400, 'CASH', '2026-01-10', v_cash_a, v_period_a,
    jsonb_build_array(jsonb_build_object('due_id', v_due_a, 'amount', 400)),
    'portal-data-test-payment-a'
  );

  ---------------------------------------------------------------------
  -- Setup: org C, single owner, single unit/due/payment -- for the
  -- organization_is_active gate test after archiving.
  ---------------------------------------------------------------------
  v_org_c := public.create_organization('Portal Data Test C', 'portal-data-c-' || extract(epoch from now())::bigint, 'EGP', 'STARTER');
  v_resort_c := public.create_resort(p_organization_id => v_org_c, p_name => 'Resort PDC', p_code => 'PDC1', p_timezone => 'Africa/Cairo', p_address => null, p_governorate => null, p_phone => null, p_email => null);
  perform public.clone_chart_of_accounts_template(v_org_c, 'RESORT_STANDARD');
  declare v_year_c uuid;
  begin
    v_year_c := public.create_fiscal_year(v_org_c, 'TestYear', '2026-01-01', '2026-12-31');
    select id into v_period_c from public.fiscal_periods where fiscal_year_id = v_year_c and period_number = 1;
    perform public.set_fiscal_period_status(v_period_c, 'OPEN', 'test setup');
  end;

  select id into v_cash_c from public.chart_of_accounts where organization_id = v_org_c and code = '1110';
  select id into v_revenue_c from public.chart_of_accounts where organization_id = v_org_c and code = '4100';
  select id into v_receivable_c from public.chart_of_accounts where organization_id = v_org_c and code = '1130';

  insert into public.due_types (organization_id, name_ar, name_en, default_revenue_account_id)
  values (v_org_c, 'صيانة', 'Maintenance', v_revenue_c) returning id into v_due_type_c;

  insert into public.units (organization_id, resort_id, code, unit_type)
  values (v_org_c, v_resort_c, 'PDC-1', 'VILLA') returning id into v_unit_c;

  insert into public.members (organization_id, full_name, user_id)
  values (v_org_c, 'Data Test Owner C', v_owner_c_user) returning id into v_member_c;

  insert into public.unit_ownerships (organization_id, unit_id, member_id, share_percentage, is_primary_contact)
  values (v_org_c, v_unit_c, v_member_c, 100, true);

  perform public.add_organization_member(v_org_c, 'b66490aa-a3a7-4005-add2-1112c660b0b4', 'TENANT_OWNER');
  update public.organization_memberships set status = 'active'
  where organization_id = v_org_c and user_id = 'b66490aa-a3a7-4005-add2-1112c660b0b4';

  perform public.issue_dues(
    p_organization_id => v_org_c,
    p_resort_id => v_resort_c,
    p_unit_ids => array[v_unit_c],
    p_due_type_id => v_due_type_c,
    p_receivable_account_id => v_receivable_c,
    p_amount => 500,
    p_issue_date => '2026-01-05'::date,
    p_due_date => '2026-01-31'::date,
    p_description => 'Q1 fee'
  );
  select id into v_due_c from public.dues
  where unit_id = v_unit_c and due_type_id = v_due_type_c and issue_date = '2026-01-05'
  order by created_at desc limit 1;

  v_payment_c := public.record_payment(
    v_org_c, v_resort_c, v_member_c, v_unit_c, 500, 'CASH', '2026-01-10', v_cash_c, v_period_c,
    jsonb_build_array(jsonb_build_object('due_id', v_due_c, 'amount', 500)),
    'portal-data-test-payment-c'
  );

  insert into test_results values ('setup', 'INFO', format('org_a=%s org_c=%s', v_org_a, v_org_c));

  ---------------------------------------------------------------------
  -- TEST 1: owner sees their own unit via unit_ownerships/units RLS.
  ---------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_owner_user::text, false);

  select count(*) into v_count from public.units where id = v_unit_a;
  v_pass := v_count = 1;
  insert into test_results values (
    'TEST 1 (owner sees own unit)',
    case when v_pass then 'PASS' else 'FAIL' end,
    format('visible_rows=%s', v_count)
  );

  ---------------------------------------------------------------------
  -- TEST 2: owner sees the due on their own unit.
  ---------------------------------------------------------------------
  select count(*) into v_count from public.dues where id = v_due_a;
  v_pass := v_count = 1;
  insert into test_results values (
    'TEST 2 (owner sees due on own unit)',
    case when v_pass then 'PASS' else 'FAIL' end,
    format('visible_rows=%s', v_count)
  );

  ---------------------------------------------------------------------
  -- TEST 3: owner sees their own POSTED payment.
  ---------------------------------------------------------------------
  select count(*) into v_count from public.payments where id = v_payment_a;
  v_pass := v_count = 1;
  insert into test_results values (
    'TEST 3 (owner sees own POSTED payment)',
    case when v_pass then 'PASS' else 'FAIL' end,
    format('visible_rows=%s', v_count)
  );

  ---------------------------------------------------------------------
  -- TEST 4: co-owner of the SAME unit does NOT see the first owner's
  -- payment (payment privacy between co-owners).
  ---------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_coowner_user::text, false);

  select count(*) into v_count from public.payments where id = v_payment_a;
  v_pass := v_count = 0;
  insert into test_results values (
    'TEST 4 (co-owner cannot see other owner payment)',
    case when v_pass then 'PASS' else 'FAIL' end,
    format('visible_rows=%s', v_count)
  );

  ---------------------------------------------------------------------
  -- TEST 5: same co-owner DOES still see the shared unit's due (joint
  -- obligation visibility -- confirms #4 isn't over-blocking).
  ---------------------------------------------------------------------
  select count(*) into v_count from public.dues where id = v_due_a;
  v_pass := v_count = 1;
  insert into test_results values (
    'TEST 5 (co-owner still sees shared unit due)',
    case when v_pass then 'PASS' else 'FAIL' end,
    format('visible_rows=%s', v_count)
  );

  ---------------------------------------------------------------------
  -- TEST 6: archive org C, confirm its owner loses ALL portal read
  -- access (organization_is_active gate).
  ---------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', 'b66490aa-a3a7-4005-add2-1112c660b0b4', false);
  perform public.set_organization_status(v_org_c, 'ARCHIVED', 'portal data test: archived-org gate');

  perform set_config('request.jwt.claim.sub', v_owner_c_user::text, false);

  declare
    v_count_unit int;
    v_count_due int;
    v_count_payment int;
  begin
    select count(*) into v_count_unit from public.units where id = v_unit_c;
    select count(*) into v_count_due from public.dues where id = v_due_c;
    select count(*) into v_count_payment from public.payments where id = v_payment_c;
    v_pass := v_count_unit = 0 and v_count_due = 0 and v_count_payment = 0;
    insert into test_results values (
      'TEST 6 (archived-org owner loses all portal access)',
      case when v_pass then 'PASS' else 'FAIL' end,
      format('unit_rows=%s due_rows=%s payment_rows=%s', v_count_unit, v_count_due, v_count_payment)
    );
  end;

  ---------------------------------------------------------------------
  -- Cleanup: unconditionally unlink every real auth account borrowed
  -- above, regardless of what state earlier assertions left things in,
  -- then archive the still-active test org (org C is already archived).
  -- members.user_id is globally UNIQUE, so leaving any link in place
  -- would block a future run of this same script and leave real
  -- test/staff accounts pointing at throwaway orgs in the meantime.
  --
  -- v_member_c's org (org C) was already archived by TEST 6 above, and
  -- the members_manage RLS policy requires organization_is_active() --
  -- so a plain UPDATE impersonating the platform admin would silently
  -- affect 0 rows for that member (the exact residue bug flagged in Task
  -- 2's own review cycle: unlinking must be genuinely unconditional, not
  -- just attempted). `reset role` drops back to the underlying
  -- superuser/table-owner connection role for this one statement, which
  -- bypasses RLS entirely, guaranteeing the unlink actually lands
  -- regardless of any org's active/archived status.
  ---------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', 'b66490aa-a3a7-4005-add2-1112c660b0b4', false);
  update public.members set user_id = null
  where id in (v_member_owner, v_member_coowner);

  reset role;
  update public.members set user_id = null where id = v_member_c;
  set local role authenticated;

  perform public.set_organization_status(v_org_a, 'ARCHIVED', 'portal data test cleanup');
  insert into test_results values ('cleanup', 'INFO', 'org A and org C archived, all borrowed auth links unlinked');
end $$;

select name, status, detail from test_results order by name;
