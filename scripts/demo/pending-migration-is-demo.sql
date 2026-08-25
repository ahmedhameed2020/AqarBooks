-- PREPARED, NOT APPLIED.
--
-- This file is deliberately NOT in supabase/migrations/. That directory is
-- pinned by tests/migration-directory-guard.test.ts, which fails if any .sql
-- appears there outside its name+size+sha256 allowlist. Dropping an unapplied
-- file in would turn the guard red and, worse, would imply to the next reader
-- that this had been applied. It lives here until someone with migration
-- access runs it.
--
-- ---------------------------------------------------------------------------
-- WHY THIS COLUMN EXISTS
-- ---------------------------------------------------------------------------
-- The demo tenant must be ACTIVE, because create_unit_lease and the dues RPCs
-- call organization_is_active() and refuse otherwise. But ACTIVE is a
-- LIFECYCLE status, and on its own it makes the demo indistinguishable from a
-- paying customer to anything that counts organizations -- billing, revenue
-- reporting, customer KPIs, analytics.
--
-- Those two facts must not be carried by one field. `status` answers "can this
-- tenant operate?"; `is_demo` answers "is this a customer?". Overloading
-- `status` with a DEMO value would have been the cheaper change and the wrong
-- one: organization_is_active() checks status, so a DEMO status would make the
-- demo inoperable and break the very RPCs the seed depends on.
--
-- The application already has an environment-variable marker
-- (DEMO_ORGANIZATION_ID, see lib/demo/config.ts) and that stays. It is the
-- right marker for request-path decisions precisely because it lives outside
-- the database the demo session can read. This column is for the other
-- question -- what reporting and billing should count -- which env cannot
-- answer, because a SQL report does not read process.env.
--
-- ---------------------------------------------------------------------------
-- HOW TO APPLY (ADR 0004 still prohibits `supabase db push`)
-- ---------------------------------------------------------------------------
--   1. Apply through Supabase's apply_migration with the name
--      `organizations_is_demo`. It writes a ledger row and no file.
--   2. Copy this file into supabase/migrations/ under the exact version the
--      ledger recorded, e.g. 20260825HHMMSS_organizations_is_demo.sql.
--   3. Add it to MIGRATION_FILES in tests/migration-directory-guard.test.ts,
--      pinned by byte size and sha256, and confirm `npm run test:migration-dir`
--      passes. The repository and the ledger must keep describing the same
--      history -- that is the whole point of the Step 7 cutover.
--   4. Regenerate lib/supabase/types.ts so `is_demo` is typed.
--   5. Add the fifth check to scripts/demo/demo-guard.ts: the seed target must
--      have is_demo = true. Until then the guard has four checks, not five,
--      and the docs say so.
--
-- Nothing here is destructive: one additive column with a default, and one
-- index. It does not touch a row of business data.

begin;

alter table public.organizations
  add column if not exists is_demo boolean not null default false;

comment on column public.organizations.is_demo is
  'True for the public demonstration tenant only. Distinct from status: status '
  'says whether the tenant may operate, is_demo says whether it is a customer. '
  'Billing, revenue reporting and customer KPIs must exclude is_demo rows. '
  'Never set on a real tenant.';

-- At most one demo organization, ever, enforced by the database rather than by
-- convention. A second one would mean two tenants both claiming to be the
-- public demo, and whichever DEMO_ORGANIZATION_ID pointed at would win
-- silently. The unique index on a constant expression is the standard way to
-- express "at most one row satisfying this predicate".
create unique index if not exists organizations_single_demo
  on public.organizations ((true))
  where is_demo;

commit;

-- ---------------------------------------------------------------------------
-- VERIFY AFTER APPLYING
-- ---------------------------------------------------------------------------
--   select column_name, data_type, is_nullable, column_default
--   from information_schema.columns
--   where table_schema = 'public' and table_name = 'organizations'
--     and column_name = 'is_demo';
--
--   -- must be 0 before the demo tenant is created, and 1 after
--   select count(*) from public.organizations where is_demo;
--
-- Note on tenant self-service: update_organization_profile writes a fixed list
-- of columns, so adding this one does not expose it to a tenant holding
-- tenant.settings.manage. Confirm that remains true if that RPC is ever
-- widened.
