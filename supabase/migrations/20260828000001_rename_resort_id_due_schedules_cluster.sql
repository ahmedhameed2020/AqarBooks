-- Phase 2g Group 3 of the resort -> property domain rename. A single
-- self-contained table, due_schedules. financial_audit_logs remains
-- deferred to the final follow-up group.

alter table public.due_schedules rename column resort_id to property_id;
