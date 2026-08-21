-- Phase 1 of the resort -> property domain rename (2026-08-16 decision).
-- Adds a classifier column to the existing `resorts` table only. No rename,
-- no RLS change: RLS on resorts filters on organization_id alone, and no
-- RPC branches on this column yet. Backward-safe -- every existing row
-- becomes 'resort' via the column default.
--
-- 'owners_association' is deliberately NOT a value here: per the 2026-08-16
-- decision it will be its own table/entity in a later phase, not a
-- property_type. Building/unit hierarchy already exists as separate
-- `buildings` and `units` tables (see 20260810000023_property_tables.sql),
-- so this column classifies what the *resorts* row itself represents when
-- it is the top-level entity (a standalone resort, a standalone building,
-- or a standalone unit registered without a parent complex).

alter table public.resorts
  add column if not exists property_type text not null default 'resort';

alter table public.resorts
  drop constraint if exists resorts_property_type_check;

alter table public.resorts
  add constraint resorts_property_type_check
    check (property_type in ('resort', 'building', 'residential_unit', 'commercial_unit'));
