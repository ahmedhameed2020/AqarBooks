-- Migration: organizations.is_demo
--
-- These bytes are the migration. Apply this file VERBATIM, then commit it
-- unchanged under the version the ledger records -- the repository and the
-- ledger have to keep describing the same history, and that only holds if the
-- applied text and the committed text are the same bytes.
--
-- Nothing in this file states whether it has been applied yet. That is
-- deliberate: a status line here would have to be edited after applying, which
-- would change the bytes and break the very correspondence the sha256 pin in
-- tests/migration-directory-guard.test.ts exists to protect. Its location is
-- the status -- under scripts/demo/ it is pending, under supabase/migrations/
-- it is applied.
--
-- ===========================================================================
-- WHY THIS COLUMN EXISTS
-- ===========================================================================
-- The demo tenant must be ACTIVE, because organization_is_active() gates
-- create_unit_lease and the dues RPCs. But ACTIVE is a LIFECYCLE status, and
-- on its own it makes the demo indistinguishable from a paying customer to
-- anything that counts organizations -- billing, revenue reporting, customer
-- KPIs, analytics.
--
-- Two different questions, two fields. `status` answers "may this tenant
-- operate?"; `is_demo` answers "is this a customer?". Overloading `status`
-- with a DEMO value was considered and rejected: organization_is_active()
-- reads `status`, so a DEMO tenant would be inoperable and the RPCs the seed
-- depends on would refuse.
--
-- The application's environment-variable marker (DEMO_ORGANIZATION_ID, see
-- lib/demo/config.ts) stays. It is the right marker for request-path decisions
-- precisely because it lives outside the database the demo session can read.
-- This column answers what reporting and billing should count, which env
-- cannot: a SQL report does not read process.env.
--
-- ===========================================================================
-- WHY A COLUMN AND AN INDEX ARE NOT ENOUGH  -- the reason this file was amended
-- ===========================================================================
-- Measured against the baseline, not assumed:
--
--   CREATE POLICY "organizations_update_authorized" ON public.organizations
--     FOR UPDATE
--     USING      (is_platform_admin(auth.uid())
--                 OR has_permission(auth.uid(), id, 'tenant.settings.manage'))
--     WITH CHECK (same)
--
--   GRANT ALL ON TABLE public.organizations TO authenticated;
--
-- The policy is column-blind. Any tenant admin holding `tenant.settings.manage`
-- may UPDATE their own organization row, and therefore -- once this column
-- exists -- may set `is_demo = true` on it through a direct PostgREST request,
-- whether or not any interface offers the option.
--
-- That is not a cosmetic flaw. A tenant marking itself as the demo would
-- remove itself from every metric that excludes demo rows, which is a billing
-- exemption granted by the customer to themselves. The partial unique index
-- below does not prevent it either: it only stops a SECOND demo row, so
-- whoever sets the flag first wins, and before the real demo tenant exists
-- there is no first.
--
-- So the marker is made immutable in the database. `denyIfDemo()` in the
-- application is irrelevant here -- this attack does not go through the
-- application.
--
-- ===========================================================================
-- HOW TO APPLY (ADR 0004 still prohibits `supabase db push`)
-- ===========================================================================
--   1. Apply through Supabase's apply_migration, name `organizations_is_demo`.
--      It writes a ledger row and no file.
--   2. Copy this file into supabase/migrations/ under the exact version the
--      ledger recorded, e.g. 20260825HHMMSS_organizations_is_demo.sql.
--   3. Add it to MIGRATION_FILES in tests/migration-directory-guard.test.ts,
--      pinned by byte size and sha256; confirm `npm run test:migration-dir`
--      passes. The repository and the ledger must keep describing the same
--      history -- the point of the Step 7 cutover.
--   4. Regenerate lib/supabase/types.ts so `is_demo` is typed.
--   5. Add the fifth check to scripts/demo/demo-guard.ts: target must have
--      is_demo = true. Until then the guard has four checks, not five.
--   6. Run tests/demo-is-demo-immutability.integration.test.ts, which stops
--      skipping once the column exists and proves a `tenant.settings.manage`
--      user cannot toggle the flag.
--
-- Additive only: one column with a default, one index, one trigger. It does
-- not touch a row of business data.

begin;

-- ---------------------------------------------------------------------------
-- 1. The marker.
-- ---------------------------------------------------------------------------
alter table public.organizations
  add column if not exists is_demo boolean not null default false;

comment on column public.organizations.is_demo is
  'True for the public demonstration tenant only. Distinct from status: status '
  'says whether the tenant may operate, is_demo says whether it is a customer. '
  'Billing, revenue reporting and customer KPIs must exclude is_demo rows. '
  'Platform-controlled: enforce_is_demo_immutable() rejects any change made by '
  'a tenant user, including one holding tenant.settings.manage.';

-- ---------------------------------------------------------------------------
-- 2. At most one demo organization, ever.
--
-- Enforced by the database rather than by convention. Two tenants both
-- claiming to be the public demo would make whichever DEMO_ORGANIZATION_ID
-- happened to point at win silently. A unique index on a constant expression
-- is the standard way to express "at most one row satisfying this predicate".
--
-- This is a containment measure, not an authorization one -- see the trigger.
-- ---------------------------------------------------------------------------
create unique index if not exists organizations_single_demo_idx
  on public.organizations ((true))
  where is_demo;

-- ---------------------------------------------------------------------------
-- 3. The marker is platform-controlled, not tenant-controlled.
--
-- WHY THE CHECK IS ON THE JWT AND NOT ON current_user
-- `current_user` is the wrong discriminator: every SECURITY DEFINER function
-- in this schema runs as `postgres`, so "allow when current_user is postgres"
-- would hand the exemption to any such function that ever touched this column.
-- The JWT claims are request-scoped and are NOT changed by SECURITY DEFINER,
-- so they still describe who actually made the request.
--
-- WHO MAY CHANGE IT
--   * no JWT at all      -- migration, psql, a scheduled job. This statement
--                           itself runs in that context.
--   * role = service_role-- trusted server provisioning. That key already
--                           bypasses RLS entirely, so allowing it opens
--                           nothing that was not already open.
--   * platform admin     -- the intended human path.
-- Everyone else is refused, whatever table permission they hold.
--
-- INSERT is covered as well as UPDATE: organizations_insert_platform_admin
-- already restricts inserts to platform admins, but relying on one policy for
-- a security property that has just been shown to be policy-blind would be
-- repeating the mistake this trigger exists to fix.
-- ---------------------------------------------------------------------------
create or replace function public.enforce_is_demo_immutable()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_claims text;
  v_role   text;
begin
  -- Nothing to authorise unless the flag is actually being set or changed.
  if tg_op = 'UPDATE' and new.is_demo is not distinct from old.is_demo then
    return new;
  end if;
  if tg_op = 'INSERT' and new.is_demo is not true then
    return new;
  end if;

  v_claims := current_setting('request.jwt.claims', true);

  -- No PostgREST request context: migration, psql, or a background job.
  if v_claims is null or v_claims = '' then
    return new;
  end if;

  begin
    v_role := (v_claims::jsonb) ->> 'role';
  exception when others then
    -- Unparseable claims are not a licence. Refuse rather than fall through.
    v_role := null;
  end;

  if v_role = 'service_role' then
    return new;
  end if;

  if public.is_platform_admin(auth.uid()) then
    return new;
  end if;

  raise exception
    'FORBIDDEN_IS_DEMO: organizations.is_demo is platform-controlled and cannot be changed by a tenant user'
    using errcode = '42501';
end;
$$;

alter function public.enforce_is_demo_immutable() owner to postgres;

-- Not executable by clients. It is a trigger function; nothing should call it
-- directly, and the security postamble's posture is that anon executes nothing.
revoke all on function public.enforce_is_demo_immutable() from public;
revoke all on function public.enforce_is_demo_immutable() from anon;
revoke all on function public.enforce_is_demo_immutable() from authenticated;

drop trigger if exists trg_organizations_is_demo_immutable on public.organizations;

create trigger trg_organizations_is_demo_immutable
  before insert or update on public.organizations
  for each row
  execute function public.enforce_is_demo_immutable();

-- ---------------------------------------------------------------------------
-- 4. Assert, rather than complete quietly.
--
-- Following the baseline's own posture: a migration that silently fails to
-- harden is the failure being repaired here.
-- ---------------------------------------------------------------------------
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'organizations'
      and column_name = 'is_demo'
  ) then
    raise exception 'IS_DEMO_MIGRATION_FAILED: column was not created';
  end if;

  if not exists (
    select 1 from pg_trigger
    where tgname = 'trg_organizations_is_demo_immutable'
      and tgrelid = 'public.organizations'::regclass
      and not tgisinternal
  ) then
    raise exception 'IS_DEMO_MIGRATION_FAILED: immutability trigger was not created';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'organizations_single_demo_idx'
  ) then
    raise exception 'IS_DEMO_MIGRATION_FAILED: single-demo index was not created';
  end if;

  -- No existing row may already carry the flag.
  if (select count(*) from public.organizations where is_demo) <> 0 then
    raise exception 'IS_DEMO_MIGRATION_FAILED: an organization is already marked is_demo';
  end if;
end
$$;

commit;

-- ===========================================================================
-- VERIFY AFTER APPLYING
-- ===========================================================================
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'organizations'
--     and column_name = 'is_demo';
--
--   select tgname from pg_trigger
--   where tgrelid = 'public.organizations'::regclass and not tgisinternal;
--
--   -- 0 before the demo tenant is created, 1 after
--   select count(*) from public.organizations where is_demo;
--
-- Then run, as a tenant admin holding tenant.settings.manage, and expect 42501:
--   update public.organizations set is_demo = true where id = '<their own org>';
--
-- tests/demo-is-demo-immutability.integration.test.ts does exactly that.
--
-- Note on tenant self-service: update_organization_profile writes a fixed
-- column list that does not include is_demo, so the RPC path was never the
-- exposure -- the direct PostgREST path was. Confirm this remains true if that
-- RPC is ever widened.
