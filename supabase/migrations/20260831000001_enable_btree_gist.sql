-- Enables the exclusion-constraint machinery unit_leases needs (see
-- 20260831000002_unit_leases_table.sql) to reject two ACTIVE leases with
-- overlapping date ranges on the same unit at the database level, not just
-- in application code. First use of this extension and of EXCLUDE USING gist
-- anywhere in this codebase -- see
-- docs/superpowers/plans/2026-08-17-unit-rental-occupancy-implementation-plan.md
-- Phase 1 / section 1.1 for why unit_ownerships (which allows overlapping
-- co-ownership rows by design) is not a precedent for this constraint.
create extension if not exists btree_gist;
