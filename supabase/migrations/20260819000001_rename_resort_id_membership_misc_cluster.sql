-- Phase 2b-2 of the resort -> property domain rename. Smallest remaining
-- cluster: only 2 functions (is_resort_member, next_sequence_value)
-- reference resort_id on these 4 tables at all; cost_centers and projects
-- have zero function references. Zero TS/TSX app code references resort_id
-- on any of these 4 tables (full-text search, 2026-08-16) -- this is a
-- DB-only migration.

alter table public.resort_memberships rename column resort_id to property_id;
alter table public.document_sequences rename column resort_id to property_id;
alter table public.cost_centers rename column resort_id to property_id;
alter table public.projects rename column resort_id to property_id;
