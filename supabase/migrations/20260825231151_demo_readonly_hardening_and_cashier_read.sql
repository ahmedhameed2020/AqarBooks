-- Release A security stage.
-- Closes D1-D5 and introduces a genuine cashier read permission.
-- All demo restrictions key off organizations.is_demo -- never a hardcoded
-- user id or email -- so no tenant is special-cased in application code.

-- ---------------------------------------------------------------------------
-- 0. Semantic demo marker. Already present in production, added out-of-band
--    and never captured by a migration; re-added idempotently so the
--    repository can describe the database again.
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column if not exists is_demo boolean not null default false;

comment on column public.organizations.is_demo is
  'Marks a tenant as a public demo tenant whose data is frozen and read-only. '
  'Demo restrictions key off this flag only -- never off a hardcoded user id or email.';

-- ---------------------------------------------------------------------------
-- 1. Helpers. SECURITY DEFINER so policy evaluation can read organizations and
--    organization_memberships without recursing through their own RLS.
-- ---------------------------------------------------------------------------
create or replace function public.is_demo_organization(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select o.is_demo from public.organizations o where o.id = p_organization_id),
    false
  );
$$;

create or replace function public.is_demo_principal(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships m
    join public.organizations o on o.id = m.organization_id
    where m.user_id = p_user_id
      and o.is_demo
  );
$$;

revoke execute on function public.is_demo_organization(uuid) from public;
revoke execute on function public.is_demo_principal(uuid) from public;
grant execute on function public.is_demo_organization(uuid) to anon, authenticated, service_role;
grant execute on function public.is_demo_principal(uuid)    to anon, authenticated, service_role;

-- ---------------------------------------------------------------------------
-- 2. D1 -- property_import_logs: require the import permission, not mere
--    membership. Matches the gate the import screen already enforces
--    (app/[locale]/(app)/import/page.tsx). No application code writes this
--    table today, so this restores intent without changing a working flow.
-- ---------------------------------------------------------------------------
drop policy if exists property_import_logs_insert_member on public.property_import_logs;

create policy property_import_logs_insert_permission
  on public.property_import_logs
  for insert
  with check (
    public.has_permission(auth.uid(), organization_id, 'property.units.manage')
  );

-- ---------------------------------------------------------------------------
-- 3. D2 -- alert_dismissals: reads preserved, persistent writes denied for
--    demo tenants. Split from FOR ALL so a demo visitor can still read.
-- ---------------------------------------------------------------------------
drop policy if exists alert_dismissals_own on public.alert_dismissals;

create policy alert_dismissals_select_own
  on public.alert_dismissals
  for select
  using (
    user_id = auth.uid()
    and public.is_org_member(auth.uid(), organization_id)
  );

create policy alert_dismissals_insert_own
  on public.alert_dismissals
  for insert
  with check (
    user_id = auth.uid()
    and public.is_org_member(auth.uid(), organization_id)
    and not public.is_demo_organization(organization_id)
  );

create policy alert_dismissals_update_own
  on public.alert_dismissals
  for update
  using (
    user_id = auth.uid()
    and public.is_org_member(auth.uid(), organization_id)
    and not public.is_demo_organization(organization_id)
  )
  with check (
    user_id = auth.uid()
    and public.is_org_member(auth.uid(), organization_id)
    and not public.is_demo_organization(organization_id)
  );

create policy alert_dismissals_delete_own
  on public.alert_dismissals
  for delete
  using (
    user_id = auth.uid()
    and public.is_org_member(auth.uid(), organization_id)
    and not public.is_demo_organization(organization_id)
  );

-- ---------------------------------------------------------------------------
-- 4. D3 -- profiles: the shared demo principal may not mutate its identity.
--    handle_new_user() is SECURITY DEFINER and still creates profiles at signup.
-- ---------------------------------------------------------------------------
drop policy if exists profiles_insert_own on public.profiles;
drop policy if exists profiles_update_own on public.profiles;

create policy profiles_insert_own
  on public.profiles
  for insert
  with check (
    id = auth.uid()
    and not public.is_demo_principal(auth.uid())
  );

create policy profiles_update_own
  on public.profiles
  for update
  using (
    id = auth.uid()
    and not public.is_demo_principal(auth.uid())
  )
  with check (
    id = auth.uid()
    and not public.is_demo_principal(auth.uid())
  );

-- ---------------------------------------------------------------------------
-- 5. D5 -- never generate rent dues into a frozen demo tenant. Byte-for-byte
--    the production definition plus the organizations join and `not o.is_demo`.
--    Volatility, language, SECURITY DEFINER and search_path preserved exactly.
--    This is the authoritative guard: rendering any page can no longer advance
--    the frozen demo ledger, whichever caller invokes the sweep.
-- ---------------------------------------------------------------------------
create or replace function public.run_lease_rent_generation()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_lease record;
  v_period text;
  v_result jsonb;
  v_generated int := 0;
  v_idempotent int := 0;
  v_blocked int := 0;
  v_skipped int := 0;
  v_errored int := 0;
begin
  for v_lease in
    select l.id, l.organization_id, l.rent_frequency
    from public.unit_leases l
    join public.organizations o on o.id = l.organization_id
    where l.status = 'ACTIVE'
      and l.starts_on <= current_date
      and (l.ends_on is null or l.ends_on >= current_date)
      and not o.is_demo
  loop
    v_period := public.lease_rent_period_key(v_lease.rent_frequency, current_date);
    begin
      v_result := public.generate_lease_rent_dues(v_lease.organization_id, v_lease.id, v_period);
      if (v_result ->> 'generated')::boolean is true then
        v_generated := v_generated + 1;
      elsif (v_result ->> 'idempotent')::boolean is true then
        v_idempotent := v_idempotent + 1;
      elsif (v_result ->> 'blocked')::boolean is true then
        v_blocked := v_blocked + 1;
      elsif (v_result ->> 'skipped')::boolean is true then
        v_skipped := v_skipped + 1;
      end if;
    exception when others then
      v_errored := v_errored + 1;
    end;
  end loop;

  return jsonb_build_object(
    'generated', v_generated, 'idempotent', v_idempotent,
    'blocked', v_blocked, 'skipped', v_skipped, 'errored', v_errored
  );
end;
$function$;

-- ---------------------------------------------------------------------------
-- 6. D4 -- close unrestricted tenant provisioning. service_role is retained
--    deliberately: Release B's approval-gated provisioner runs server-side
--    under service_role after Super Admin approval, and a future payment
--    confirmation becomes a second authorized producer of that same event.
-- ---------------------------------------------------------------------------
revoke execute on function
  public.create_organization_onboarding(text, text, text, text, text, text, text)
  from public, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 7. Cashier read permission.
--    The cashier screen previously gated viewing on cashier.transactions.create
--    -- a write key -- so no read-only role could see reconciled cashier state.
--    A semantic read key fixes that without a demo-specific bypass and without
--    granting any role a mutation capability.
-- ---------------------------------------------------------------------------
insert into public.permissions (key, description)
select 'cashier.transactions.read',
       'View cashier sessions, cash transactions, balances and reconciliation state (read-only).'
where not exists (
  select 1 from public.permissions where key = 'cashier.transactions.read'
);

-- Templates that already hold a cashier permission MUST receive the read key
-- or they would lose access to the screen once the guard changes. AUDITOR and
-- VIEWER are read-only roles that already hold finance.payments.read, so
-- cashier visibility is the consistent posture for them.
insert into public.role_template_permissions (role_template_key, permission_key)
select v.k, 'cashier.transactions.read'
from (values
  ('TENANT_OWNER'), ('GENERAL_MANAGER'), ('FINANCE_MANAGER'),
  ('CASHIER'), ('AUDITOR'), ('VIEWER')
) as v(k)
where not exists (
  select 1 from public.role_template_permissions rtp
  where rtp.role_template_key = v.k
    and rtp.permission_key = 'cashier.transactions.read'
);

-- Backfill the already-cloned per-tenant roles. Templates only affect future
-- clones; without this every existing tenant's Cashier/Finance Manager/General
-- Manager/Tenant Owner would lose the screen.
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
cross join public.permissions p
where p.key = 'cashier.transactions.read'
  and r.key in (
    'TENANT_OWNER', 'GENERAL_MANAGER', 'FINANCE_MANAGER',
    'CASHIER', 'AUDITOR', 'VIEWER'
  )
  and not exists (
    select 1 from public.role_permissions rp
    where rp.role_id = r.id and rp.permission_id = p.id
  );
