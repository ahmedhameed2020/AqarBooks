-- supabase/tests/phase_payment_provider_settings.sql
-- Multi-Tenant Payment Provider Settings -- Task 1 pgTAP-style coverage.
--
-- Run via: mcp__claude_ai_Supabase__execute_sql directly -- this repo's
-- phase_owner_portal_*.sql / phase_payment_provider_settings.sql scripts are
-- NOT wired into any npm script (npm run test:sql is an unrelated
-- TypeScript suite, tests/pgtap.integration.test.ts). Paste this script's
-- body into execute_sql and read the NOTICE/exception output.
--
-- Structural template: phase_owner_portal_record_online_payment.sql (assert
-- + unconditional archive-only cleanup, clock_timestamp()-suffixed unique
-- fixtures so the script stays idempotent across repeated runs) and
-- phase_owner_portal_finance_settings.sql (set_config('request.jwt.claims',
-- ...) + set local role authenticated impersonation for RLS/grant testing).
--
-- Covers, as separate numbered scenarios matching the task's own numbering:
--   1. Cross-org resort rejected.
--   2. enable_payment_provider blocked before VERIFIED.
--   3. Paymob+PRODUCTION structurally blocked even when VERIFIED (isolated
--      from "not verified" and from "any provider"/"any environment").
--   4. authenticated/anon cannot call get_payment_provider_credentials at all.
--   5. Secrets never selectable by authenticated/anon via vault.decrypted_secrets,
--      even though the opaque secret_id UUID is visible via a raw select.
--   6. Changing a secret resets status/enabled/verified_at; not changing a
--      secret leaves them untouched.
--   7. Org-wide and resort-specific rows for the same org/provider/environment
--      coexist; resort-specific wins when both exist, org-wide is the
--      fallback when it doesn't.
--   8. A different organization's member (with the permission in THEIR org)
--      cannot see or modify another organization's settings rows.
--   9. (code review fix) A member of a SUSPENDED organization cannot call
--      upsert_payment_provider_settings -- organization_is_active() is
--      checked inside the RPC itself, not just decoratively via RLS.
do $$
declare
  v_platform_admin uuid := 'b66490aa-a3a7-4005-add2-1112c660b0b4';
  v_user_a uuid := 'b01f4a06-0e73-4251-a254-972215659dc3'; -- e2e-property-manager@resortos-test.local, granted TENANT_OWNER in org A below
  v_user_b uuid := '925ebf91-df93-4815-9280-b33defffe59c'; -- e2e-orgb-owner@resortos-test.local, granted TENANT_OWNER in org B below

  v_org_a uuid;
  v_org_b uuid;
  v_resort_a1 uuid; -- org A, resort with its own resort-specific settings (scenario 7)
  v_resort_a2 uuid; -- org A, resort with NO resort-specific settings -- must fall back to org-wide
  v_resort_b1 uuid;

  v_role_a_owner uuid;
  v_role_b_owner uuid;

  v_settings_id uuid;
  v_row public.payment_provider_settings;
  v_error_caught boolean;
  v_sqlstate text;
  v_sqlerrm text;

  -- Scenario 3
  v_settings_paymob_prod uuid;
  v_settings_fawry_prod uuid;
  v_settings_paymob_sandbox uuid;

  -- Scenario 6
  v_settings_fawry_sandbox uuid;
  v_verified_at_1 timestamptz;
  v_verified_at_2 timestamptz;

  -- Scenario 7
  v_settings_fawry_prod_resort uuid;
  v_cred record;

  -- Scenario 5
  v_has_api_key boolean;
  v_has_hmac_secret boolean;
  v_vault_grant_count integer;
  v_run_suffix text := extract(epoch from clock_timestamp())::text;
begin
  -- Impersonate the platform admin for setup (creating orgs/roles/etc. is
  -- normally gated behind RPCs with their own permission checks; this
  -- script instead writes directly as the default postgres/superuser role
  -- for execute_sql, same rationale as every other phase_owner_portal_*.sql
  -- fixture -- see phase_owner_portal_record_online_payment.sql).
  perform set_config('request.jwt.claim.sub', v_platform_admin::text, false);

  -- === Shared setup ===
  insert into public.organizations (name, slug, default_currency, status)
  values ('PPS Test Org A ' || clock_timestamp()::text, 'pps-a-' || v_run_suffix, 'EGP', 'ACTIVE')
  returning id into v_org_a;

  insert into public.organizations (name, slug, default_currency, status)
  values ('PPS Test Org B ' || clock_timestamp()::text, 'pps-b-' || v_run_suffix, 'EGP', 'ACTIVE')
  returning id into v_org_b;

  insert into public.properties (organization_id, name, code, timezone, property_type)
  values (v_org_a, 'PPS Resort A1', 'PPS-A1-' || v_run_suffix, 'Africa/Cairo', 'resort')
  returning id into v_resort_a1;

  insert into public.properties (organization_id, name, code, timezone, property_type)
  values (v_org_a, 'PPS Resort A2', 'PPS-A2-' || v_run_suffix, 'Africa/Cairo', 'resort')
  returning id into v_resort_a2;

  insert into public.properties (organization_id, name, code, timezone, property_type)
  values (v_org_b, 'PPS Resort B1', 'PPS-B1-' || v_run_suffix, 'Africa/Cairo', 'resort')
  returning id into v_resort_b1;

  -- Grant finance.online_payments.manage to a real user in each org, via the
  -- normal role-template mechanism (this migration wired the permission
  -- into TENANT_OWNER's template).
  perform public.clone_tenant_role_templates(v_org_a);
  perform public.clone_tenant_role_templates(v_org_b);

  select id into v_role_a_owner from public.roles where organization_id = v_org_a and key = 'TENANT_OWNER';
  select id into v_role_b_owner from public.roles where organization_id = v_org_b and key = 'TENANT_OWNER';

  insert into public.user_role_assignments (user_id, role_id, organization_id, created_by)
  values (v_user_a, v_role_a_owner, v_org_a, v_platform_admin);
  insert into public.user_role_assignments (user_id, role_id, organization_id, created_by)
  values (v_user_b, v_role_b_owner, v_org_b, v_platform_admin);

  assert public.has_permission(v_user_a, v_org_a, 'finance.online_payments.manage'),
    'FAIL setup: v_user_a should have finance.online_payments.manage in org A';
  assert public.has_permission(v_user_b, v_org_b, 'finance.online_payments.manage'),
    'FAIL setup: v_user_b should have finance.online_payments.manage in org B';
  assert not public.has_permission(v_user_b, v_org_a, 'finance.online_payments.manage'),
    'FAIL setup: v_user_b must NOT have the permission in org A';

  raise notice 'phase_payment_provider_settings.sql: fixtures ready (org_a=%, org_b=%)', v_org_a, v_org_b;

  -----------------------------------------------------------------------
  -- SCENARIO 1: cannot create a settings row for a resort belonging to a
  -- DIFFERENT organization.
  -----------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  set local role authenticated;

  v_error_caught := false;
  begin
    perform public.upsert_payment_provider_settings(
      v_org_a, v_resort_b1, 'FAWRY', 'SANDBOX', 'MERCH-1', null, 'api-key-1', 'hmac-1'
    );
  exception when sqlstate '22023' then
    v_error_caught := true;
    get stacked diagnostics v_sqlerrm = message_text;
    assert v_sqlerrm like 'RESORT_NOT_IN_ORGANIZATION%', format('FAIL scenario 1: expected RESORT_NOT_IN_ORGANIZATION, got %s', v_sqlerrm);
  end;
  reset role;
  assert v_error_caught, 'FAIL scenario 1: cross-org property_id should have been rejected';

  assert (select count(*) from public.payment_provider_settings where organization_id = v_org_a and property_id = v_resort_b1) = 0,
    'FAIL scenario 1: no row should have been created';

  raise notice 'SCENARIO 1 (cross-org resort rejected): PASS';

  -----------------------------------------------------------------------
  -- SCENARIO 2: cannot enable a row that is not VERIFIED.
  -----------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  set local role authenticated;
  select public.upsert_payment_provider_settings(
    v_org_a, null, 'FAWRY', 'SANDBOX', 'MERCH-FAWRY-SANDBOX', null, 'fawry-sandbox-key-' || v_run_suffix, 'fawry-sandbox-hmac-' || v_run_suffix
  ) into v_settings_fawry_sandbox;
  reset role;

  select * into v_row from public.payment_provider_settings where id = v_settings_fawry_sandbox;
  assert v_row.status = 'DRAFT', format('FAIL scenario 2 setup: expected fresh row to be DRAFT, got %s', v_row.status);

  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  set local role authenticated;
  v_error_caught := false;
  begin
    perform public.enable_payment_provider(v_settings_fawry_sandbox);
  exception when sqlstate '22023' then
    v_error_caught := true;
    get stacked diagnostics v_sqlerrm = message_text;
    assert v_sqlerrm like 'NOT_VERIFIED%', format('FAIL scenario 2: expected NOT_VERIFIED, got %s', v_sqlerrm);
  end;
  reset role;
  assert v_error_caught, 'FAIL scenario 2: enabling a DRAFT row should have been rejected';

  select * into v_row from public.payment_provider_settings where id = v_settings_fawry_sandbox;
  assert v_row.enabled = false and v_row.status = 'DRAFT', 'FAIL scenario 2: row must remain DRAFT/disabled after the rejected enable attempt';

  raise notice 'SCENARIO 2 (enable blocked before VERIFIED): PASS';

  -----------------------------------------------------------------------
  -- SCENARIO 3: Paymob+PRODUCTION is structurally blocked even for an
  -- explicit admin call on a row that IS genuinely VERIFIED -- isolated
  -- from "not verified" (this row passes verification first) and from
  -- "any provider"/"any environment" (Fawry+PRODUCTION and Paymob+SANDBOX
  -- both succeed under the identical VERIFIED precondition).
  -----------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  set local role authenticated;
  select public.upsert_payment_provider_settings(
    v_org_a, null, 'PAYMOB', 'PRODUCTION', 'MERCH-PAYMOB-PROD', 'pk_paymob', 'paymob-prod-key-' || v_run_suffix, 'paymob-prod-hmac-' || v_run_suffix
  ) into v_settings_paymob_prod;
  select public.upsert_payment_provider_settings(
    v_org_a, null, 'FAWRY', 'PRODUCTION', 'MERCH-FAWRY-PROD', null, 'fawry-prod-key-' || v_run_suffix, 'fawry-prod-hmac-' || v_run_suffix
  ) into v_settings_fawry_prod;
  select public.upsert_payment_provider_settings(
    v_org_a, null, 'PAYMOB', 'SANDBOX', 'MERCH-PAYMOB-SANDBOX', 'pk_paymob_sb', 'paymob-sandbox-key-' || v_run_suffix, 'paymob-sandbox-hmac-' || v_run_suffix
  ) into v_settings_paymob_sandbox;
  reset role;

  -- Verify all three -- genuinely VERIFIED, not just claimed.
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  set local role authenticated;
  perform public.record_payment_provider_verification(v_settings_paymob_prod, true);
  perform public.record_payment_provider_verification(v_settings_fawry_prod, true);
  perform public.record_payment_provider_verification(v_settings_paymob_sandbox, true);
  reset role;

  select * into v_row from public.payment_provider_settings where id = v_settings_paymob_prod;
  assert v_row.status = 'VERIFIED' and v_row.verified_at is not null,
    format('FAIL scenario 3 setup: paymob/production row should be genuinely VERIFIED, got status=%s verified_at=%s', v_row.status, v_row.verified_at);

  -- The actual check: Paymob+PRODUCTION, VERIFIED, explicit admin call -> rejected.
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  set local role authenticated;
  v_error_caught := false;
  begin
    perform public.enable_payment_provider(v_settings_paymob_prod);
  exception when sqlstate '22023' then
    v_error_caught := true;
    get stacked diagnostics v_sqlerrm = message_text;
    assert v_sqlerrm like 'PAYMOB_PRODUCTION_BLOCKED%',
      format('FAIL scenario 3: expected PAYMOB_PRODUCTION_BLOCKED specifically (not NOT_VERIFIED or any other 22023), got %s', v_sqlerrm);
  end;
  reset role;
  assert v_error_caught, 'FAIL scenario 3: enabling VERIFIED Paymob+PRODUCTION should still have been rejected';

  select * into v_row from public.payment_provider_settings where id = v_settings_paymob_prod;
  assert v_row.enabled = false and v_row.status = 'VERIFIED',
    'FAIL scenario 3: paymob/production row must stay VERIFIED/disabled (status must NOT have been silently changed by the rejected call)';

  -- Isolation proof: Fawry+PRODUCTION (same environment, different provider) succeeds.
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  set local role authenticated;
  perform public.enable_payment_provider(v_settings_fawry_prod);
  reset role;
  select * into v_row from public.payment_provider_settings where id = v_settings_fawry_prod;
  assert v_row.enabled = true and v_row.status = 'ENABLED',
    format('FAIL scenario 3: Fawry+PRODUCTION should have been enabled successfully, got status=%s enabled=%s', v_row.status, v_row.enabled);

  -- Isolation proof: Paymob+SANDBOX (same provider, different environment) succeeds.
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  set local role authenticated;
  perform public.enable_payment_provider(v_settings_paymob_sandbox);
  reset role;
  select * into v_row from public.payment_provider_settings where id = v_settings_paymob_sandbox;
  assert v_row.enabled = true and v_row.status = 'ENABLED',
    format('FAIL scenario 3: Paymob+SANDBOX should have been enabled successfully, got status=%s enabled=%s', v_row.status, v_row.enabled);

  raise notice 'SCENARIO 3 (Paymob+PRODUCTION blocked, isolated from unverified/other combos): PASS';

  -----------------------------------------------------------------------
  -- SCENARIO 4: authenticated and anon cannot call
  -- get_payment_provider_credentials at all -- grant-level denial (42501),
  -- not merely an unexpected result. (public is covered implicitly: the
  -- revoke was `from public, anon, authenticated` and neither authenticated
  -- nor anon retained execute, so there is no role through which a live
  -- client session could reach it either way.)
  -----------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  set local role authenticated;
  v_error_caught := false;
  begin
    perform public.get_payment_provider_credentials(v_org_a, null, 'FAWRY', 'PRODUCTION');
  exception when sqlstate '42501' then
    v_error_caught := true;
  end;
  reset role;
  assert v_error_caught, 'FAIL scenario 4: authenticated (even with finance.online_payments.manage) should not be able to call get_payment_provider_credentials (expected 42501)';

  set local role anon;
  v_error_caught := false;
  begin
    perform public.get_payment_provider_credentials(v_org_a, null, 'FAWRY', 'PRODUCTION');
  exception when sqlstate '42501' then
    v_error_caught := true;
  end;
  reset role;
  assert v_error_caught, 'FAIL scenario 4: anon should not be able to call get_payment_provider_credentials (expected 42501)';

  raise notice 'SCENARIO 4 (get_payment_provider_credentials unreachable from authenticated/anon/public): PASS';

  -----------------------------------------------------------------------
  -- SCENARIO 5: secrets never appear via any select from authenticated/anon.
  -- The opaque secret_id UUID columns ARE visible to an authorized member
  -- via a raw `select *` (documented, intentional -- they're just pointers),
  -- but that UUID must be useless: vault.decrypted_secrets (and the whole
  -- vault schema) must have zero grants to authenticated/anon, so the UUID
  -- can never be turned into a plaintext secret from a client session.
  -----------------------------------------------------------------------
  select count(*) into v_vault_grant_count
  from information_schema.role_table_grants
  where table_schema = 'vault' and grantee in ('authenticated', 'anon');
  assert v_vault_grant_count = 0, format('FAIL scenario 5: expected zero vault table grants to authenticated/anon, got %s', v_vault_grant_count);

  select count(*) into v_vault_grant_count
  from information_schema.role_routine_grants
  where routine_schema = 'vault' and grantee in ('authenticated', 'anon');
  assert v_vault_grant_count = 0, format('FAIL scenario 5: expected zero vault routine grants to authenticated/anon, got %s', v_vault_grant_count);

  -- list_payment_provider_settings never returns the secret UUID at all
  -- (structural, not just discipline) -- only the has_api_key/has_hmac_secret
  -- booleans derived from "is not null".
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  set local role authenticated;
  select has_api_key, has_hmac_secret into v_has_api_key, v_has_hmac_secret
  from public.list_payment_provider_settings(v_org_a)
  where id = v_settings_fawry_sandbox;
  reset role;
  assert v_has_api_key and v_has_hmac_secret,
    format('FAIL scenario 5: expected has_api_key/has_hmac_secret both true, got %s/%s', v_has_api_key, v_has_hmac_secret);
  -- (the above SELECT would fail to compile at all if list_payment_provider_settings
  -- exposed secret_id columns under different names -- this line proves has_api_key/
  -- has_hmac_secret are exactly what's returned, nothing else needed to prove secret_id
  -- isn't selectable through this path since it structurally doesn't exist in the
  -- RETURNS TABLE shape.)

  -- Even though the UUID is visible via raw select as an authorized member,
  -- using it against vault.decrypted_secrets from the same session must fail.
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  set local role authenticated;
  select api_key_secret_id into v_settings_id from public.payment_provider_settings where id = v_settings_fawry_sandbox;
  assert v_settings_id is not null, 'FAIL scenario 5 setup: expected api_key_secret_id to be visible (opaque UUID) via raw select';

  v_error_caught := false;
  begin
    perform 1 from vault.decrypted_secrets where id = v_settings_id;
  exception when sqlstate '42501' then
    v_error_caught := true;
  end;
  reset role;
  assert v_error_caught, 'FAIL scenario 5: authenticated must not be able to select from vault.decrypted_secrets even with a real secret_id UUID in hand';

  raise notice 'SCENARIO 5 (secrets never leak via select; vault has zero grants to authenticated/anon): PASS';

  -----------------------------------------------------------------------
  -- SCENARIO 6: changing a secret resets status/enabled/verified_at;
  -- NOT changing a secret leaves them untouched.
  -----------------------------------------------------------------------
  -- v_settings_fawry_sandbox is still DRAFT (scenario 2 left it there).
  -- Verify it first so there's something meaningful to reset.
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  set local role authenticated;
  perform public.record_payment_provider_verification(v_settings_fawry_sandbox, true);
  reset role;

  select * into v_row from public.payment_provider_settings where id = v_settings_fawry_sandbox;
  assert v_row.status = 'VERIFIED' and v_row.verified_at is not null,
    format('FAIL scenario 6 setup: expected VERIFIED, got status=%s', v_row.status);
  v_verified_at_1 := v_row.verified_at;

  -- 6a. Re-upsert with ONLY non-secret fields changed (null/empty secret args) -> untouched.
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  set local role authenticated;
  perform public.upsert_payment_provider_settings(
    v_org_a, null, 'FAWRY', 'SANDBOX', 'MERCH-FAWRY-SANDBOX-RENAMED', null, null, ''
  );
  reset role;

  select * into v_row from public.payment_provider_settings where id = v_settings_fawry_sandbox;
  assert v_row.status = 'VERIFIED' and v_row.verified_at = v_verified_at_1 and v_row.merchant_identifier = 'MERCH-FAWRY-SANDBOX-RENAMED',
    format('FAIL scenario 6a: non-secret-only change must leave status/verified_at untouched, got status=%s verified_at=%s (expected %s)',
      v_row.status, v_row.verified_at, v_verified_at_1);

  -- 6b. Re-upsert with a NEW api_key -> resets status/enabled/verified_at.
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  set local role authenticated;
  perform public.upsert_payment_provider_settings(
    v_org_a, null, 'FAWRY', 'SANDBOX', 'MERCH-FAWRY-SANDBOX-RENAMED', null, 'fawry-sandbox-key-v2-' || v_run_suffix, null
  );
  reset role;

  select * into v_row from public.payment_provider_settings where id = v_settings_fawry_sandbox;
  assert v_row.status = 'DRAFT' and v_row.enabled = false and v_row.verified_at is null,
    format('FAIL scenario 6b: changing api_key must reset status/enabled/verified_at, got status=%s enabled=%s verified_at=%s',
      v_row.status, v_row.enabled, v_row.verified_at);

  -- Re-verify to prove the hmac-only path resets independently of api_key.
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  set local role authenticated;
  perform public.record_payment_provider_verification(v_settings_fawry_sandbox, true);
  reset role;
  select verified_at into v_verified_at_2 from public.payment_provider_settings where id = v_settings_fawry_sandbox;
  assert v_verified_at_2 is not null, 'FAIL scenario 6c setup: expected re-verification to succeed';

  -- 6c. Re-upsert with a NEW hmac_secret only (api_key left null/unchanged) -> also resets.
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  set local role authenticated;
  perform public.upsert_payment_provider_settings(
    v_org_a, null, 'FAWRY', 'SANDBOX', 'MERCH-FAWRY-SANDBOX-RENAMED', null, null, 'fawry-sandbox-hmac-v2-' || v_run_suffix
  );
  reset role;

  select * into v_row from public.payment_provider_settings where id = v_settings_fawry_sandbox;
  assert v_row.status = 'DRAFT' and v_row.enabled = false and v_row.verified_at is null,
    format('FAIL scenario 6c: changing hmac_secret alone must also reset status/enabled/verified_at, got status=%s enabled=%s verified_at=%s',
      v_row.status, v_row.enabled, v_row.verified_at);

  raise notice 'SCENARIO 6 (secret change resets verification; non-secret change does not): PASS';

  -----------------------------------------------------------------------
  -- SCENARIO 7: org-wide (property_id IS NULL) and resort-specific settings
  -- for the SAME org/provider/environment coexist; resort-specific wins
  -- when both exist, org-wide is the fallback when it doesn't.
  -- v_settings_fawry_prod (property_id = null) is already ENABLED from
  -- scenario 3, with api_key 'fawry-prod-key-<suffix>'.
  -----------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  set local role authenticated;
  select public.upsert_payment_provider_settings(
    v_org_a, v_resort_a1, 'FAWRY', 'PRODUCTION', 'MERCH-FAWRY-PROD-RESORT', null,
    'fawry-prod-resort-key-' || v_run_suffix, 'fawry-prod-resort-hmac-' || v_run_suffix
  ) into v_settings_fawry_prod_resort;
  perform public.record_payment_provider_verification(v_settings_fawry_prod_resort, true);
  perform public.enable_payment_provider(v_settings_fawry_prod_resort);
  reset role;

  -- Both rows coexist -- unique index did not reject the pair.
  assert (select count(*) from public.payment_provider_settings
          where organization_id = v_org_a and provider = 'FAWRY' and environment = 'PRODUCTION') = 2,
    'FAIL scenario 7: expected both the org-wide and resort-specific FAWRY/PRODUCTION rows to coexist';

  -- Resort-specific wins when a property_id with its own row is requested.
  select * into v_cred from public.get_payment_provider_credentials(v_org_a, v_resort_a1, 'FAWRY', 'PRODUCTION');
  assert v_cred.settings_id = v_settings_fawry_prod_resort,
    format('FAIL scenario 7: expected resort-specific row (%s) to win for resort_a1, got %s', v_settings_fawry_prod_resort, v_cred.settings_id);
  assert v_cred.api_key = 'fawry-prod-resort-key-' || v_run_suffix,
    'FAIL scenario 7: resort-specific api_key must not be blended with the org-wide row''s key';

  -- Org-wide is used as fallback for a DIFFERENT resort with no resort-specific row.
  select * into v_cred from public.get_payment_provider_credentials(v_org_a, v_resort_a2, 'FAWRY', 'PRODUCTION');
  assert v_cred.settings_id = v_settings_fawry_prod,
    format('FAIL scenario 7: expected org-wide row (%s) to be used as fallback for resort_a2, got %s', v_settings_fawry_prod, v_cred.settings_id);
  assert v_cred.api_key = 'fawry-prod-key-' || v_run_suffix,
    'FAIL scenario 7: org-wide api_key must not be blended with the resort-specific row''s key';

  raise notice 'SCENARIO 7 (org-wide/resort-specific coexistence and precedence): PASS';

  -----------------------------------------------------------------------
  -- SCENARIO 8: a member of a DIFFERENT organization (v_user_b, who DOES
  -- have finance.online_payments.manage, but only in org B) cannot see or
  -- modify org A's settings rows.
  -----------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  set local role authenticated;

  -- (a) Raw select sees zero rows for org A.
  assert (select count(*) from public.payment_provider_settings where organization_id = v_org_a) = 0,
    'FAIL scenario 8a: org B member should see zero rows for org A via raw select';

  -- (b) list_payment_provider_settings(org_a) returns zero rows too.
  assert (select count(*) from public.list_payment_provider_settings(v_org_a)) = 0,
    'FAIL scenario 8b: list_payment_provider_settings(org_a) should return zero rows for an org B caller';

  -- (c) A direct UPDATE against org A's row affects zero rows (RLS, not a no-op silently "succeeding").
  update public.payment_provider_settings set merchant_identifier = 'HACKED-BY-ORG-B' where id = v_settings_fawry_prod;
  assert not found, 'FAIL scenario 8c: org B member''s UPDATE against an org A row should affect zero rows';

  reset role;
  select merchant_identifier into v_row.merchant_identifier from public.payment_provider_settings where id = v_settings_fawry_prod;
  assert v_row.merchant_identifier <> 'HACKED-BY-ORG-B', 'FAIL scenario 8c: org A row must be unmodified after the cross-org UPDATE attempt';

  -- (d) upsert_payment_provider_settings(org_a, ...) as v_user_b -> FORBIDDEN (42501), the internal has_permission check catches it independently of RLS.
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  set local role authenticated;
  v_error_caught := false;
  begin
    perform public.upsert_payment_provider_settings(v_org_a, null, 'FAWRY', 'SANDBOX', 'X', null, 'x', 'y');
  exception when sqlstate '42501' then
    v_error_caught := true;
  end;
  reset role;
  assert v_error_caught, 'FAIL scenario 8d: org B member calling upsert against org A should get FORBIDDEN (42501)';

  -- (e) enable_payment_provider against an org A row id -> FORBIDDEN.
  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  set local role authenticated;
  v_error_caught := false;
  begin
    perform public.enable_payment_provider(v_settings_fawry_prod_resort);
  exception when sqlstate '42501' then
    v_error_caught := true;
  end;
  reset role;
  assert v_error_caught, 'FAIL scenario 8e: org B member calling enable_payment_provider against an org A row id should get FORBIDDEN (42501)';

  raise notice 'SCENARIO 8 (cross-org isolation, RLS + RPC-internal checks both hold): PASS';

  -----------------------------------------------------------------------
  -- SCENARIO 9 (code review fix): a member of a SUSPENDED organization
  -- cannot call upsert_payment_provider_settings -- organization_is_active()
  -- is checked inside the RPC itself (SECURITY DEFINER bypasses RLS on its
  -- own internal writes, so the RLS policy's organization_is_active clause
  -- alone would be decorative here), same established pattern as
  -- post_payment_internal.
  -----------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_platform_admin::text, true);
  perform public.set_organization_status(v_org_a, 'SUSPENDED', 'phase_payment_provider_settings test: scenario 9 suspend');

  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  set local role authenticated;
  v_error_caught := false;
  begin
    perform public.upsert_payment_provider_settings(v_org_a, null, 'FAWRY', 'SANDBOX', 'X', null, 'x', 'y');
  exception when sqlstate '22023' then
    v_error_caught := true;
    get stacked diagnostics v_sqlerrm = message_text;
    assert v_sqlerrm like 'ORGANIZATION_INACTIVE%', format('FAIL scenario 9: expected ORGANIZATION_INACTIVE, got %s', v_sqlerrm);
  end;
  reset role;
  assert v_error_caught, 'FAIL scenario 9: upsert against a SUSPENDED organization should have been rejected';

  raise notice 'SCENARIO 9 (organization_is_active enforced inside the RPC, not just via RLS): PASS';

  -----------------------------------------------------------------------
  -- Cleanup -- unconditional, archive-only (never hard-delete), matches
  -- this repo's established convention. Idempotent across repeated runs
  -- because every unique value above (org slug, resort code, merchant
  -- identifiers) is clock_timestamp()/epoch-suffixed.
  --
  -- auth.uid() reads request.jwt.claim.sub before request.jwt.claims (see
  -- auth.uid()'s own coalesce), so every impersonation block above set
  -- request.jwt.claim.sub directly (not request.jwt.claims) to actually take
  -- effect -- restore it to the platform admin here since
  -- set_organization_status requires is_platform_admin(auth.uid()).
  -----------------------------------------------------------------------
  perform set_config('request.jwt.claim.sub', v_platform_admin::text, true);
  perform public.set_organization_status(v_org_a, 'ARCHIVED', 'phase_payment_provider_settings test cleanup');
  perform public.set_organization_status(v_org_b, 'ARCHIVED', 'phase_payment_provider_settings test cleanup');

  raise notice 'phase_payment_provider_settings.sql: all 9 scenarios passed, cleanup complete';
end $$;
