-- supabase/tests/phase_owner_portal_finance_settings.sql
-- Run via: mcp__claude_ai_Supabase__execute_sql directly against the live
-- project -- this repo's phase_owner_portal_*.sql scripts are NOT wired
-- into any npm script (confirmed: npm run test:sql runs an unrelated
-- TypeScript suite, tests/pgtap.integration.test.ts). Paste this script's
-- body into execute_sql and read the NOTICE/exception output.
do $$
declare
  v_org_id uuid;
  v_resort_id uuid;
  v_asset_account_id uuid;
  v_liability_account_id uuid;
  v_group_account_id uuid;
  v_inactive_account_id uuid;
  v_wrong_org_account_id uuid;
  v_other_org_id uuid;
  v_error_caught boolean;
begin
  -- Setup: one org, one resort, and accounts covering every rejection path.
  insert into public.organizations (name, slug, default_currency, status)
  values ('Phase4 FinSettings Test ' || clock_timestamp()::text, 'p4-fs-' || extract(epoch from clock_timestamp())::text, 'EGP', 'ACTIVE')
  returning id into v_org_id;

  insert into public.organizations (name, slug, default_currency, status)
  values ('Phase4 FinSettings Other Org ' || clock_timestamp()::text, 'p4-fs-other-' || extract(epoch from clock_timestamp())::text, 'EGP', 'ACTIVE')
  returning id into v_other_org_id;

  insert into public.resorts (organization_id, name, code)
  values (v_org_id, 'Test Resort', 'TR' || substr(md5(clock_timestamp()::text), 1, 8))
  returning id into v_resort_id;

  insert into public.chart_of_accounts (organization_id, code, name_ar, name_en, category, normal_balance, is_group, is_active)
  values (v_org_id, 'TEST-ASSET-' || clock_timestamp()::text, 'أصل تجريبي', 'Test Asset', 'ASSET', 'DEBIT', false, true)
  returning id into v_asset_account_id;

  insert into public.chart_of_accounts (organization_id, code, name_ar, name_en, category, normal_balance, is_group, is_active)
  values (v_org_id, 'TEST-LIAB-' || clock_timestamp()::text, 'التزام تجريبي', 'Test Liability', 'LIABILITY', 'CREDIT', false, true)
  returning id into v_liability_account_id;

  insert into public.chart_of_accounts (organization_id, code, name_ar, name_en, category, normal_balance, is_group, is_active)
  values (v_org_id, 'TEST-GROUP-' || clock_timestamp()::text, 'مجموعة تجريبية', 'Test Group', 'ASSET', 'DEBIT', true, true)
  returning id into v_group_account_id;

  insert into public.chart_of_accounts (organization_id, code, name_ar, name_en, category, normal_balance, is_group, is_active)
  values (v_org_id, 'TEST-INACTIVE-' || clock_timestamp()::text, 'حساب معطل', 'Inactive Account', 'ASSET', 'DEBIT', false, false)
  returning id into v_inactive_account_id;

  insert into public.chart_of_accounts (organization_id, code, name_ar, name_en, category, normal_balance, is_group, is_active)
  values (v_other_org_id, 'TEST-OTHERORG-' || clock_timestamp()::text, 'حساب كيان آخر', 'Other Org Account', 'ASSET', 'DEBIT', false, true)
  returning id into v_wrong_org_account_id;

  -- 1. Valid ASSET, non-group, active, same-org account -> succeeds.
  insert into public.organization_finance_settings (organization_id, resort_id, online_payments_clearing_account_id)
  values (v_org_id, v_resort_id, v_asset_account_id);
  assert (select count(*) from public.organization_finance_settings where organization_id = v_org_id and resort_id = v_resort_id) = 1,
    'FAIL: valid clearing account config should have been accepted';

  -- 2. LIABILITY account -> rejected.
  v_error_caught := false;
  begin
    update public.organization_finance_settings
    set online_payments_clearing_account_id = v_liability_account_id
    where organization_id = v_org_id and resort_id = v_resort_id;
  exception when sqlstate '22023' then v_error_caught := true;
  end;
  assert v_error_caught, 'FAIL: LIABILITY account should have been rejected';

  -- 3. Group account -> rejected.
  v_error_caught := false;
  begin
    update public.organization_finance_settings
    set online_payments_clearing_account_id = v_group_account_id
    where organization_id = v_org_id and resort_id = v_resort_id;
  exception when sqlstate '22023' then v_error_caught := true;
  end;
  assert v_error_caught, 'FAIL: group account should have been rejected';

  -- 4. Inactive account -> rejected.
  v_error_caught := false;
  begin
    update public.organization_finance_settings
    set online_payments_clearing_account_id = v_inactive_account_id
    where organization_id = v_org_id and resort_id = v_resort_id;
  exception when sqlstate '22023' then v_error_caught := true;
  end;
  assert v_error_caught, 'FAIL: inactive account should have been rejected';

  -- 5. Cross-organization account -> rejected.
  v_error_caught := false;
  begin
    update public.organization_finance_settings
    set online_payments_clearing_account_id = v_wrong_org_account_id
    where organization_id = v_org_id and resort_id = v_resort_id;
  exception when sqlstate '22023' then v_error_caught := true;
  end;
  assert v_error_caught, 'FAIL: cross-org account should have been rejected';

  -- 6. authenticated (no finance.accounts.manage) cannot write -> denied.
  -- Two valid denial paths exist and either proves the property under test:
  -- (a) sqlstate 42501 from organization_finance_settings' own RLS WITH CHECK, or
  -- (b) sqlstate 22023 CLEARING_ACCOUNT_NOT_IN_ORGANIZATION from the BEFORE INSERT
  --     validation trigger, because BEFORE triggers run before RLS WITH CHECK is
  --     evaluated, and the trigger's SELECT against chart_of_accounts is itself
  --     RLS-scoped to this unprivileged role, so it sees zero rows for an account
  --     that unambiguously belongs to v_org_id.
  perform set_config('request.jwt.claims', json_build_object('sub', gen_random_uuid()::text)::text, true);
  set local role authenticated;
  v_error_caught := false;
  begin
    insert into public.organization_finance_settings (organization_id, resort_id, online_payments_clearing_account_id)
    values (v_org_id, v_resort_id, v_asset_account_id);
  exception
    when sqlstate '42501' then v_error_caught := true;
    when sqlstate '22023' then v_error_caught := true;
  end;
  reset role;
  assert v_error_caught, 'FAIL: authenticated without finance.accounts.manage should not be able to insert';

  -- Cleanup -- unconditional, matches this repo's established test-residue pattern.
  -- platform_audit_logs has no ON DELETE CASCADE on organization_id, and the
  -- attempted authenticated-role insert above (step 6) is audit-logged, so it
  -- must be cleared before organizations can be deleted.
  delete from public.organization_finance_settings where organization_id in (v_org_id, v_other_org_id);
  delete from public.chart_of_accounts where organization_id in (v_org_id, v_other_org_id);
  delete from public.resorts where organization_id = v_org_id;
  delete from public.platform_audit_logs where organization_id in (v_org_id, v_other_org_id);
  delete from public.organizations where id in (v_org_id, v_other_org_id);

  raise notice 'phase_owner_portal_finance_settings.sql: all assertions passed';
end $$;
