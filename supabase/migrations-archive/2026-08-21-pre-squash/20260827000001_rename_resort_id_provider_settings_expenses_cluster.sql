-- Phase 2g Group 2 of the resort -> property domain rename. Two small,
-- self-contained tables bundled together (neither is functionally
-- entangled with the other, nor with any other remaining deferred group):
-- payment_provider_settings and expenses. due_schedules and
-- financial_audit_logs are deliberately deferred to follow-up groups.

alter table public.payment_provider_settings rename column resort_id to property_id;
alter table public.expenses rename column resort_id to property_id;
