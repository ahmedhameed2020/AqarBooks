-- Reverts 20260823000003, which should never have been written.
--
-- units.archive_reason was added on the assumption that units had no way to
-- record why they were retired. They already did: archive_unit(p_organization_id,
-- p_unit_id, p_reason) has existed in production all along and writes the reason
-- into platform_audit_logs.reason, alongside a permission check and two guards
-- the hand-written version lacked (it refuses to archive a unit that still has
-- an active ownership, or open dues).
--
-- The column was never populated -- verified zero non-null rows before dropping.
-- Leaving it would have implied a field that is always empty.

alter table public.units drop column if exists archive_reason;
