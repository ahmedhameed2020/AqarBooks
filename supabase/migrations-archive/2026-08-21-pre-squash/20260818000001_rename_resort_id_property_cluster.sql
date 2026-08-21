-- Phase 2b-1 of the resort -> property domain rename (2026-08-16 decision:
-- rename by real FK-dependency cluster, not by business domain -- research
-- showed import_property_csv and the recurring-dues functions couple
-- units/zones/buildings/property_import_logs together regardless of which
-- "domain" they were originally grouped into for the 2026-08-16 schema
-- audit).
--
-- Unlike Phase 2a's resorts->properties table rename, there is no free
-- compatibility shim at the column level (no "column alias" feature in
-- Postgres), so this migration's app-code updates (companion migration
-- 20260818000002 plus TS changes in the same PR) must land together, not
-- as a follow-up.

alter table public.zones rename column resort_id to property_id;
alter table public.buildings rename column resort_id to property_id;
alter table public.units rename column resort_id to property_id;
alter table public.property_import_logs rename column resort_id to property_id;

-- Views do NOT automatically rename their own declared output column just
-- because the underlying base-table column was renamed (the dependency is
-- tracked internally by attnum, but the view's exposed name stays frozen
-- at creation time unless explicitly renamed here too).
alter view public.units_with_financials rename column resort_id to property_id;
