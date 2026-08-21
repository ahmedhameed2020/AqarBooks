-- Phase 2a of the resort -> property domain rename (2026-08-16 decision:
-- gradual rollout with compatibility shims, not a big-bang rename).
--
-- Renames the `resorts` table to `properties` and immediately re-creates
-- `resorts` as an auto-updatable compatibility view over it, so every
-- existing function and app code path that still says `resorts` keeps
-- working completely unchanged. This is deliberately the ONLY object
-- renamed in this migration -- the `resort_id` column that exists on 28
-- other tables is NOT touched here; it's renamed table-by-table in later,
-- smaller migrations alongside the functions/app code that reference it,
-- to avoid a broken window where a column is renamed but its dependent
-- functions aren't updated yet.
--
-- This view qualifies for Postgres's automatic-updatability rules (simple
-- single-table SELECT, no joins/aggregates/DISTINCT/GROUP BY), so INSERT/
-- UPDATE/DELETE against `resorts` transparently apply to `properties` --
-- confirmed empirically for the RLS-enforcement path in this same PR (see
-- the companion integration test), not just assumed from documentation.

alter table public.resorts rename to properties;

create view public.resorts as
select
  id,
  organization_id,
  name,
  code,
  timezone,
  property_type,
  address,
  governorate,
  phone,
  email,
  created_at,
  updated_at,
  created_by,
  updated_by
from public.properties;

comment on view public.resorts is
  'Compatibility shim (2026-08-16): resorts was renamed to properties. '
  'This auto-updatable view exists so unmigrated functions/app code that '
  'still say "resorts" keep working. Do not add new callers of this view '
  '-- use public.properties directly. Tracked for removal once all '
  'resort_id columns and their dependent functions/TS code are migrated '
  '(see docs/superpowers/plans/2026-08-16-resort-to-property-rename-phase2a.md).';
