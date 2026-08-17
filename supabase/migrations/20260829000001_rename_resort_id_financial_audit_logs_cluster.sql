-- Phase 2g Group 4 of the resort -> property domain rename -- the final
-- deferred group. A single self-contained table, financial_audit_logs.
-- After this migration, no table anywhere in the schema has a literal
-- resort_id column left.

alter table public.financial_audit_logs rename column resort_id to property_id;
