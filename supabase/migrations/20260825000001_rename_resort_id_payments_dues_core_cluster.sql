-- Phase 2g Group 1 of the resort -> property domain rename. First (and by
-- design, largest) group inside the final super-cluster: organization_
-- finance_settings, online_payment_transactions, dues, payments. Renamed
-- together because record_online_payment alone touches all 4 (completing
-- its Phase 2e partial edit) and post_payment_internal touches both dues
-- and payments in one body. payment_provider_settings (newly discovered,
-- self-contained), due_schedules (self-contained), expenses, and
-- financial_audit_logs are deliberately deferred to follow-up groups.

alter table public.organization_finance_settings rename column resort_id to property_id;
alter table public.online_payment_transactions rename column resort_id to property_id;
alter table public.dues rename column resort_id to property_id;
alter table public.payments rename column resort_id to property_id;
