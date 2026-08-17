-- The dues.source_type/source_id contract, locked in the implementation
-- plan's Phase 4 (section 4.1), added only now that Phase 3's RPCs exist to
-- produce something worth attributing. Nullable/additive -- every existing
-- dues row keeps source_type = NULL, meaning "not sourced from an
-- automated engine" (issued manually via issue_due/issue_dues), same as
-- today. No FK on source_id: dues already has no FK enforcement pointing
-- at some of its other logical sources elsewhere in this schema, so this
-- stays consistent rather than being the one exception.
alter table public.dues
  add column source_type text check (source_type in ('LEASE_RENT')),
  add column source_id uuid;

create index idx_dues_source on public.dues (source_type, source_id) where source_type is not null;
