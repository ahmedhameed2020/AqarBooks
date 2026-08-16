-- Phase 2e of the resort -> property domain rename. First of three
-- sub-phases splitting the final "payments/dues" super-cluster by risk:
-- 2e (this one) = chart_of_accounts + user_role_assignments (near-universal
-- but small edit surface, has_permission itself confirmed untouched by this
-- column), 2f = journal_entries (shared accounting core), 2g (last, highest
-- risk) = dues/due_schedules/payments/online_payment_transactions/
-- organization_finance_settings/expenses/financial_audit_logs.

alter table public.chart_of_accounts rename column resort_id to property_id;
alter table public.user_role_assignments rename column resort_id to property_id;
