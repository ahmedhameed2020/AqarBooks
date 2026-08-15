-- current_member_id() + members self-select RLS isolation test.
-- Creates two ephemeral orgs, each with one member linked to a distinct
-- auth user, and proves: (a) current_member_id() resolves to the caller's
-- own member id, (b) the members_select_self RLS policy itself -- not just
-- the security-definer helper -- actually grants a real `select` on the
-- caller's own row (a bug in the policy expression would slip past a test
-- that only calls the function), (c) a different owner is denied even
-- across orgs, (d) a plain staff user with no members.user_id gets NULL
-- from current_member_id() and genuinely sees zero members rows through
-- this policy (a real `select`, not just an inference from (a)).

select set_config('request.jwt.claim.sub', 'b66490aa-a3a7-4005-add2-1112c660b0b4', false);
select set_config('request.jwt.claim.role', 'authenticated', false);
set local role authenticated;

create temporary table test_results (name text, status text, detail text);

do $$
declare
  v_org_a uuid;
  v_org_b uuid;
  v_member_a uuid;
  v_member_b uuid;
  -- Real existing auth.users rows are required (FK), same convention as
  -- units_with_financials_integrity.sql. Two distinct genuine test/staff
  -- accounts already present in this project's auth.users table.
  v_owner_a_user uuid := '11d45b6f-1162-433e-8324-ebaf7cd0e618';
  v_owner_b_user uuid := 'b66490aa-a3a7-4005-add2-1112c660b0b4';
  v_seen_id uuid;
  v_pass boolean;
begin
  v_org_a := public.create_organization('Portal Identity Test A', 'portal-id-a-' || extract(epoch from now())::bigint, 'EGP', 'STARTER');
  v_org_b := public.create_organization('Portal Identity Test B', 'portal-id-b-' || extract(epoch from now())::bigint, 'EGP', 'STARTER');

  insert into public.members (organization_id, full_name, user_id)
  values (v_org_a, 'Owner A', v_owner_a_user)
  returning id into v_member_a;

  insert into public.members (organization_id, full_name, user_id)
  values (v_org_b, 'Owner B', v_owner_b_user)
  returning id into v_member_b;

  -- TEST 1: owner A sees exactly their own members row.
  perform set_config('request.jwt.claim.sub', v_owner_a_user::text, false);
  select current_member_id() into v_seen_id;
  v_pass := v_seen_id = v_member_a;
  insert into test_results values (
    'TEST 1 (current_member_id resolves to own member)',
    case when v_pass then 'PASS' else 'FAIL' end,
    format('expected=%s got=%s', v_member_a, v_seen_id)
  );

  -- TEST 2: the members_select_self RLS policy itself grants a real
  -- `select` on owner A's own row -- exercising the actual policy
  -- expression (id = current_member_id()), not just the security-definer
  -- helper function, which bypasses RLS internally and so cannot by
  -- itself prove the policy grants anything.
  declare v_count int;
  begin
    select count(*) into v_count from public.members where id = v_member_a;
    v_pass := v_count = 1;
    insert into test_results values (
      'TEST 2 (owner A can select own row via RLS policy)',
      case when v_pass then 'PASS' else 'FAIL' end,
      format('visible_rows=%s', v_count)
    );
  end;

  declare v_count int;
  begin
    select count(*) into v_count from public.members where id = v_member_b;
    v_pass := v_count = 0;
    insert into test_results values (
      'TEST 3 (owner A cannot see owner B row, cross-org)',
      case when v_pass then 'PASS' else 'FAIL' end,
      format('visible_rows=%s', v_count)
    );
  end;

  -- TEST 4: a genuine staff user with no members.user_id link gets NULL.
  -- The unlink itself must be done as an identity permitted to UPDATE
  -- members (the "members_manage" has_permission-gated policy) -- the
  -- unlinked user we're about to test has no such permission, and the
  -- self-select policy is read-only, so performing the UPDATE while
  -- impersonating them would silently affect 0 rows under RLS.
  perform set_config('request.jwt.claim.sub', 'b66490aa-a3a7-4005-add2-1112c660b0b4', false);
  update public.members set user_id = null where id = v_member_a;

  perform set_config('request.jwt.claim.sub', '11d45b6f-1162-433e-8324-ebaf7cd0e618', false);
  select current_member_id() into v_seen_id;
  v_pass := v_seen_id is null;
  insert into test_results values (
    'TEST 4 (unlinked user gets NULL, not an error)',
    case when v_pass then 'PASS' else 'FAIL' end,
    format('got=%s', v_seen_id)
  );

  -- TEST 5: the unlinked user genuinely sees zero members rows through
  -- members_select_self -- a real `select`, not just an inference from
  -- current_member_id() returning NULL in TEST 4. Scoped to the two test
  -- org member ids (not a bare `select count(*) from members`) so this
  -- test can't accidentally pass because it happens to return 0 for
  -- unrelated reasons in a database with other data.
  declare v_count int;
  begin
    select count(*) into v_count from public.members where id in (v_member_a, v_member_b);
    v_pass := v_count = 0;
    insert into test_results values (
      'TEST 5 (unlinked user sees zero members rows via RLS policy)',
      case when v_pass then 'PASS' else 'FAIL' end,
      format('visible_rows=%s', v_count)
    );
  end;

  -- Unlink real auth accounts from these throwaway test members before
  -- archiving -- members.user_id is globally UNIQUE, so leaving it linked
  -- would block any future run of this same script (and leave real staff
  -- accounts pointing at an archived fake org in the meantime).
  perform set_config('request.jwt.claim.sub', 'b66490aa-a3a7-4005-add2-1112c660b0b4', false);
  update public.members set user_id = null where id in (v_member_a, v_member_b);

  perform public.set_organization_status(v_org_a, 'ARCHIVED', 'portal identity test cleanup');
  perform public.set_organization_status(v_org_b, 'ARCHIVED', 'portal identity test cleanup');
  insert into test_results values ('cleanup', 'INFO', 'both test orgs archived');
end $$;

select name, status, detail from test_results order by name;
