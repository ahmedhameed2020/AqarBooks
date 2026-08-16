-- Phase 2b-3 of the resort -> property domain rename. platform_audit_logs
-- is the near-universal audit-log target -- 24 functions insert into it.
-- Isolated deliberately, per 2026-08-16 direction, before other clusters
-- (treasury, purchasing, receivables) accumulate further drift that would
-- make this table harder to isolate later.

alter table public.platform_audit_logs rename column resort_id to property_id;
