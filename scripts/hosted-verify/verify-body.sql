-- Hosted acceptance checks for the owner portal access migration.
--
-- NOT meant to be run on its own: build.mjs prepends the migration (without its
-- BEGIN/COMMIT) and wraps everything in ONE transaction that always ends with
-- an exception, so NOTHING is ever committed -- no objects, no rows, no Auth
-- users. The results travel back in the exception message
-- ("VERIFICATION_ROLLED_BACK: {...}"). Fixtures use fixed throwaway ids and
-- touch no real customer row.
--
-- It exercises the six contracts that the mocked clients cannot prove:
-- member eligibility, organization isolation, activation-token lifecycle,
-- client-ID access, the portal suspension check, and the staff+owner identity.

create temp table verify_results (at timestamptz default clock_timestamp(), name text, ok boolean, detail text) on commit drop;
grant all on verify_results to public;

create function pg_temp.check(p_name text, p_ok boolean, p_detail text default null) returns void
language sql as $$ insert into verify_results (name, ok, detail) values (p_name, coalesce(p_ok, false), p_detail) $$;

create function pg_temp.as_user(p_uid uuid) returns void language plpgsql as $$
begin
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', p_uid, 'role', 'authenticated')::text, true);
end $$;

create function pg_temp.as_service() returns void language plpgsql as $$
begin
  execute 'set local role service_role';
  perform set_config('request.jwt.claims', json_build_object('role', 'service_role')::text, true);
end $$;

create function pg_temp.as_owner() returns void language plpgsql as $$
begin
  execute 'reset role';
  perform set_config('request.jwt.claims', '', true);
end $$;

-- ---------------------------------------------------------------- fixtures
do $$
declare
  org_a constant uuid := '00000000-0000-4000-8000-00000000a001';
  org_b constant uuid := '00000000-0000-4000-8000-00000000b001';
begin
  insert into public.organizations (id, name, slug, status) values
    (org_a, 'Verify Org A', 'verify-org-a-portal', 'ACTIVE'), (org_b, 'Verify Org B', 'verify-org-b-portal', 'ACTIVE');
  perform public.clone_tenant_role_templates(org_a);
  perform public.clone_tenant_role_templates(org_b);
  insert into auth.users (id, email, encrypted_password, email_confirmed_at) values
    ('00000000-0000-4000-8000-00000000c001', 'verify-staff-a@example.invalid', 'x', now()),
    ('00000000-0000-4000-8000-00000000c002', 'verify-staff-b@example.invalid', 'x', now());
  insert into public.organization_memberships (organization_id, user_id, status) values
    (org_a, '00000000-0000-4000-8000-00000000c001', 'active'), (org_b, '00000000-0000-4000-8000-00000000c002', 'active');
  insert into public.user_role_assignments (user_id, role_id, organization_id)
    select '00000000-0000-4000-8000-00000000c001', id, organization_id from public.roles where key = 'TENANT_OWNER' and organization_id = org_a;
  insert into public.user_role_assignments (user_id, role_id, organization_id)
    select '00000000-0000-4000-8000-00000000c002', id, organization_id from public.roles where key = 'TENANT_OWNER' and organization_id = org_b;
  insert into public.properties (id, organization_id, name, code) values ('00000000-0000-4000-8000-00000000d001', org_a, 'Verify Prop', 'VP');
  insert into public.units (id, organization_id, property_id, code) values
    ('00000000-0000-4000-8000-00000000e001', org_a, '00000000-0000-4000-8000-00000000d001', 'V-1'),
    ('00000000-0000-4000-8000-00000000e002', org_a, '00000000-0000-4000-8000-00000000d001', 'V-2'),
    ('00000000-0000-4000-8000-00000000e003', org_a, '00000000-0000-4000-8000-00000000d001', 'V-3');
  insert into public.members (id, organization_id, full_name, email, phone) values
    ('00000000-0000-4000-8000-00000000f001', org_a, 'Verify Owner', 'verify-owner@example.invalid', '01000000001'),
    ('00000000-0000-4000-8000-00000000f002', org_a, 'Verify No Unit', 'verify-nounit@example.invalid', null),
    ('00000000-0000-4000-8000-00000000f003', org_a, 'Verify Client Id', null, '01000000003'),
    ('00000000-0000-4000-8000-00000000f004', org_a, 'Verify Staff Owner', 'verify-staff-a@example.invalid', null);
  insert into public.unit_ownerships (organization_id, unit_id, member_id, start_date) values
    (org_a, '00000000-0000-4000-8000-00000000e001', '00000000-0000-4000-8000-00000000f001', '2020-01-01'),
    (org_a, '00000000-0000-4000-8000-00000000e002', '00000000-0000-4000-8000-00000000f003', '2020-01-01'),
    (org_a, '00000000-0000-4000-8000-00000000e003', '00000000-0000-4000-8000-00000000f004', '2020-01-01');
end $$;

-- ---------------------------------------------------------------- the contracts
do $$
declare
  staff_a constant uuid := '00000000-0000-4000-8000-00000000c001';
  staff_b constant uuid := '00000000-0000-4000-8000-00000000c002';
  m_owner constant uuid := '00000000-0000-4000-8000-00000000f001';
  m_nounit constant uuid := '00000000-0000-4000-8000-00000000f002';
  m_client constant uuid := '00000000-0000-4000-8000-00000000f003';
  m_staffowner constant uuid := '00000000-0000-4000-8000-00000000f004';
  v_err text; v_json jsonb; v_raw text; v_token_id uuid; v_uid uuid;
  v_alias text; v_cid text; v_bool boolean; v_count integer;
begin
  -- 1. eligibility ------------------------------------------------------------
  perform pg_temp.as_user(staff_a);
  begin perform * from public.request_member_activation(m_nounit); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform pg_temp.check('eligibility: no active ownership is refused', v_err like 'NO_ACTIVE_OWNERSHIP%', v_err);
  perform pg_temp.check('eligibility: an owner is eligible', (public.get_member_portal_access(m_owner) ->> 'eligible')::boolean);

  -- 2. organization isolation ---------------------------------------------------
  perform pg_temp.as_user(staff_b);
  begin perform public.get_member_portal_access(m_owner); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform pg_temp.check('isolation: another organization cannot read the member', v_err like 'FORBIDDEN_PORTAL_ACCESS%', v_err);
  begin perform * from public.request_member_activation(m_owner); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform pg_temp.check('isolation: another organization cannot request activation', v_err like 'FORBIDDEN_PORTAL_ACCESS%', v_err);
  begin perform * from public.suspend_member_portal(m_owner); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform pg_temp.check('isolation: another organization cannot suspend', v_err like 'FORBIDDEN_PORTAL_ACCESS%', v_err);

  -- 3. activation token lifecycle -------------------------------------------------
  perform pg_temp.as_user(staff_a);
  perform * from public.request_member_activation(m_owner);
  begin perform * from public.mint_member_activation_token(m_owner, staff_a); v_err := null;
  exception when others then v_err := sqlerrm; end;
  perform pg_temp.check('token: staff cannot mint (service role only)', v_err like 'permission denied%', v_err);
  perform pg_temp.as_service();
  select raw_token, token_id into v_raw, v_token_id from public.mint_member_activation_token(m_owner, staff_a);
  perform pg_temp.check('token: undelivered token is unusable', public.inspect_member_activation(v_raw) ->> 'state' = 'revoked');
  perform public.mark_member_activation_delivery(v_token_id, 'sent');
  perform pg_temp.check('token: delivered token is valid', public.inspect_member_activation(v_raw) ->> 'state' = 'valid');
  perform pg_temp.as_owner();
  v_uid := '00000000-0000-4000-8000-00000000c010';
  insert into auth.users (id, email, encrypted_password, email_confirmed_at) values (v_uid, 'verify-owner@example.invalid', 'x', now());
  perform pg_temp.as_service();
  v_json := public.complete_member_activation(v_raw, v_uid, 'provisioned');
  perform pg_temp.check('token: completes once', (v_json ->> 'ok')::boolean, v_json::text);
  v_json := public.complete_member_activation(v_raw, v_uid, 'provisioned');
  perform pg_temp.check('token: second use is refused', v_json ->> 'reason' = 'used', v_json::text);

  -- 4. client id lookup ------------------------------------------------------------
  perform pg_temp.as_user(staff_a);
  select client_id, alias_email into v_cid, v_alias from public.begin_member_temp_access(m_client);
  perform pg_temp.check('client id: number and alias reserved', v_cid ~ '^MB-[0-9]{5,}$' and v_alias = lower(v_cid) || '@client.aqarbooks.local', v_cid);
  perform pg_temp.as_owner();
  v_uid := '00000000-0000-4000-8000-00000000c020';
  insert into auth.users (id, email, encrypted_password, email_confirmed_at) values (v_uid, v_alias, 'temp-hash', now());
  perform pg_temp.as_user(staff_a);
  perform public.finish_member_temp_access(m_client, v_uid, 72);
  perform pg_temp.as_user(v_uid);
  v_json := public.my_portal_access();
  perform pg_temp.check('client id: first login is forced', (v_json ->> 'must_change_password')::boolean and v_json ->> 'client_id' = v_cid, v_json::text);
  perform pg_temp.check('client id: the portal is closed until the password changes', public.current_member_id() is null);

  -- 5. portal suspension check ------------------------------------------------------
  perform pg_temp.as_user(staff_a);
  perform * from public.suspend_member_portal(m_owner, 'verification');
  perform pg_temp.as_user('00000000-0000-4000-8000-00000000c010');
  v_json := public.my_portal_access();
  perform pg_temp.check('suspension: reported to the owner', v_json ->> 'status' = 'suspended', v_json::text);
  perform pg_temp.check('suspension: current_member_id() is NULL', public.current_member_id() is null);
  select count(*) into v_count from public.members;
  perform pg_temp.check('suspension: the owner can no longer read member rows', v_count = 0, v_count::text);

  -- 6. staff + owner dual context ------------------------------------------------------
  perform pg_temp.as_user(staff_a);
  perform * from public.request_member_activation(m_staffowner);
  perform pg_temp.as_service();
  select raw_token, token_id into v_raw, v_token_id from public.mint_member_activation_token(m_staffowner, staff_a);
  perform public.mark_member_activation_delivery(v_token_id, 'sent');
  v_json := public.complete_member_activation(v_raw, staff_a, 'linked_existing');
  perform pg_temp.check('dual: the existing verified staff identity is linked', (v_json ->> 'ok')::boolean, v_json::text);
  perform pg_temp.as_owner();
  select count(*) into v_count from auth.users where lower(email) = 'verify-staff-a@example.invalid';
  perform pg_temp.check('dual: no second identity was created', v_count = 1, v_count::text);
  perform pg_temp.as_user(staff_a);
  perform pg_temp.check('dual: active owner context works', public.current_member_id() = m_staffowner);
  select should_ban into v_bool from public.suspend_member_portal(m_staffowner, 'verification');
  perform pg_temp.check('dual: suspending the owner side never asks for a ban', v_bool = false, v_bool::text);
  perform pg_temp.check('dual: owner context is closed', public.current_member_id() is null);
  perform pg_temp.check('dual: staff permission is untouched', public.has_permission(staff_a, '00000000-0000-4000-8000-00000000a001', 'members.portal.manage'));

  -- 7. structure -----------------------------------------------------------------------
  perform pg_temp.as_owner();
  select count(*) into v_count from pg_class where relname in ('member_portal_access', 'member_activation_tokens') and relrowsecurity;
  perform pg_temp.check('structure: RLS enabled on both tables', v_count = 2, v_count::text);
  select count(*) into v_count from pg_policies where tablename in ('member_portal_access', 'member_activation_tokens');
  perform pg_temp.check('structure: no client policies on those tables', v_count = 0, v_count::text);
  select count(*) into v_count from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.proname in (
      'get_member_portal_access','request_member_activation','mint_member_activation_token','mark_member_activation_delivery',
      'revoke_member_activation','begin_member_temp_access','finish_member_temp_access','suspend_member_portal',
      'reactivate_member_portal','begin_member_signout','log_member_portal_event','inspect_member_activation',
      'complete_member_activation','portal_find_auth_user','my_portal_access','complete_portal_first_login')
      and has_function_privilege('anon', p.oid, 'execute');
  perform pg_temp.check('structure: no new function is executable by anon', v_count = 0, v_count::text);
  select count(*) into v_count from pg_proc p
    where p.pronamespace = 'public'::regnamespace and p.prosecdef
      and p.proname in ('get_member_portal_access','request_member_activation','mint_member_activation_token','mark_member_activation_delivery',
        'begin_member_temp_access','finish_member_temp_access','suspend_member_portal','reactivate_member_portal','begin_member_signout',
        'log_member_portal_event','inspect_member_activation','complete_member_activation','portal_find_auth_user','my_portal_access',
        'complete_portal_first_login','current_member_id')
      and not exists (select 1 from unnest(coalesce(p.proconfig, '{}')) c where c like 'search_path=%');
  perform pg_temp.check('structure: every SECURITY DEFINER function pins search_path', v_count = 0, v_count::text);
  select count(*) into v_count from pg_proc p
    where p.pronamespace = 'public'::regnamespace
      and p.proname in ('mint_member_activation_token','mark_member_activation_delivery','log_member_portal_event','inspect_member_activation','complete_member_activation','portal_find_auth_user')
      and has_function_privilege('authenticated', p.oid, 'execute');
  perform pg_temp.check('structure: service-only functions are not executable by authenticated', v_count = 0, v_count::text);
end $$;

-- ---------------------------------------------------------------- report and roll back
do $$
declare
  v_rows jsonb; v_failed integer;
begin
  execute 'reset role';
  select jsonb_agg(jsonb_build_object('name', name, 'ok', ok, 'detail', detail) order by at), count(*) filter (where not ok)
    into v_rows, v_failed from verify_results;
  raise exception 'VERIFICATION_ROLLED_BACK: %', jsonb_build_object('failed', v_failed, 'checks', v_rows)::text;
end $$;
