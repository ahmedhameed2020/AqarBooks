-- get_own_organization_display() isolation test (20260814000008).
-- Creates two ephemeral orgs -- one ACTIVE, one ARCHIVED -- each with one
-- member linked to a distinct real auth.users row (FK requirement, same
-- convention as phase_owner_portal_identity_integrity.sql), and proves:
--   (a) a member of the ACTIVE org gets that org's real name/currency back.
--   (b) a member of the ARCHIVED org gets zero rows, not the org's real
--       data -- consistent with the Checkpoint 2 decision (20260814000006)
--       that a suspended/archived owner retains no portal access.
--   (c) an authenticated caller with no members row at all gets zero rows,
--       not an error.
-- anon is not covered by a live call here: EXECUTE on this function is
-- revoked from anon entirely (see the migration), so anon fails at the
-- permission-denied layer before ever reaching the function body -- there
-- is no row-level behavior left to assert for that case.

create temporary table test_results (name text, status text, detail text);

do $$
declare
  v_org_active uuid;
  v_org_archived uuid;
  v_member_active uuid;
  v_member_archived uuid;
  -- Real existing auth.users rows required (FK). Reuses the same two
  -- genuine test/staff accounts as phase_owner_portal_identity_integrity.sql,
  -- plus a third unlinked account for the "no members row" case.
  v_owner_active_user uuid := '11d45b6f-1162-433e-8324-ebaf7cd0e618';
  v_owner_archived_user uuid := 'b66490aa-a3a7-4005-add2-1112c660b0b4';
  v_unlinked_user uuid := '925ebf91-df93-4815-9280-b33defffe59c';
  v_name text;
  v_currency text;
  v_row_count int;
begin
  insert into public.organizations (name, slug, default_currency, status)
  values ('Portal Org Display Test Active', 'portal-org-display-active-' || extract(epoch from now())::bigint, 'EGP', 'ACTIVE')
  returning id into v_org_active;

  insert into public.organizations (name, slug, default_currency, status)
  values ('Portal Org Display Test Archived', 'portal-org-display-archived-' || extract(epoch from now())::bigint, 'USD', 'ARCHIVED')
  returning id into v_org_archived;

  insert into public.members (organization_id, full_name, user_id)
  values (v_org_active, 'Owner Active', v_owner_active_user)
  returning id into v_member_active;

  insert into public.members (organization_id, full_name, user_id)
  values (v_org_archived, 'Owner Archived', v_owner_archived_user)
  returning id into v_member_archived;

  -- TEST 1: active-org owner gets their real org's name/currency.
  perform set_config('request.jwt.claim.sub', v_owner_active_user::text, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  set local role authenticated;
  select name, default_currency into v_name, v_currency from public.get_own_organization_display();
  reset role;
  insert into test_results values (
    'TEST 1 (active org owner gets real name/currency)',
    case when v_name = 'Portal Org Display Test Active' and v_currency = 'EGP' then 'PASS' else 'FAIL' end,
    format('name=%s currency=%s', v_name, v_currency)
  );

  -- TEST 2: archived-org owner gets zero rows, never the org's real data.
  perform set_config('request.jwt.claim.sub', v_owner_archived_user::text, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  set local role authenticated;
  select count(*) into v_row_count from public.get_own_organization_display();
  reset role;
  insert into test_results values (
    'TEST 2 (archived org owner gets zero rows)',
    case when v_row_count = 0 then 'PASS' else 'FAIL' end,
    format('row_count=%s', v_row_count)
  );

  -- TEST 3: authenticated caller with no members row gets zero rows, not
  -- an error (mirrors current_member_id()'s NULL-safe behavior).
  perform set_config('request.jwt.claim.sub', v_unlinked_user::text, false);
  perform set_config('request.jwt.claim.role', 'authenticated', false);
  set local role authenticated;
  select count(*) into v_row_count from public.get_own_organization_display();
  reset role;
  insert into test_results values (
    'TEST 3 (unlinked authenticated caller gets zero rows)',
    case when v_row_count = 0 then 'PASS' else 'FAIL' end,
    format('row_count=%s', v_row_count)
  );

  -- cleanup
  delete from public.members where id in (v_member_active, v_member_archived);
  delete from public.organizations where id in (v_org_active, v_org_archived);
end $$;

select * from test_results order by name;
