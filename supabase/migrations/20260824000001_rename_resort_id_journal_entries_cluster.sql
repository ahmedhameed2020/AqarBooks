-- Phase 2f of the resort -> property domain rename. Second of three
-- sub-phases splitting the final "payments/dues" super-cluster: 2e (done,
-- merged) = chart_of_accounts + user_role_assignments, 2f (this one) =
-- journal_entries (the shared accounting core every other cluster already
-- calls into via create_journal_entry_internal/post_journal_entry_internal),
-- 2g (last, highest risk) = dues/due_schedules/payments/
-- online_payment_transactions/organization_finance_settings/expenses/
-- financial_audit_logs.

alter table public.journal_entries rename column resort_id to property_id;
