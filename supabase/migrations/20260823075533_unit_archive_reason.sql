-- Adds units.archive_reason.
--
-- This migration was applied to production and is recorded in
-- supabase_migrations.schema_migrations as 20260823075533. It is reproduced
-- here because the repository must replay to the same schema the database
-- actually has -- including steps that were later undone.
--
-- It was a mistake, and 20260823083604 reverts it: archive_unit(p_reason)
-- already existed and records the reason in platform_audit_logs.reason, so the
-- column was redundant and never populated. Keeping the pair rather than
-- silently dropping both is what makes the history honest: the schema did hold
-- this column for roughly forty minutes, and a replay has to pass through that
-- state to end where production stands.

alter table public.units
  add column if not exists archive_reason text;

comment on column public.units.archive_reason is
  'Why this unit was retired. Required by the application when archiving.';
