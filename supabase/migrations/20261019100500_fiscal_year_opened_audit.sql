-- Fiscal year opened: add FISCAL_YEAR_OPENED to the financial audit allow-list.
--
-- Forward-only. Earlier migrations are not edited. This file is NOT applied and NOT tested against a database yet.
-- Apply in the same batch as 20261019100400_fiscal_calendar_draft_and_open_transition.sql, which writes this action.
--
-- Ground truth (read before writing):
--   check_audit_action is a CHECK CONSTRAINT on public.financial_audit_logs, not a function. It has no REVOKE or GRANT.
--   Latest definition: 20261019100100_fiscal_year_close_guards.sql, lines 405-414 (14 values, NOT VALID then VALIDATE).
--   No migration after 20261019100100 names check_audit_action (grep of supabase/migrations).
--
-- Change: the 14 existing values are kept unchanged and FISCAL_YEAR_OPENED is appended. Nothing is removed.
-- Method: DROP CONSTRAINT then a plain ADD CONSTRAINT (no NOT VALID). The table may already hold rows, so the
-- constraint is validated against all of them in the same statement. This takes an ACCESS EXCLUSIVE lock for the
-- duration of the full-table check; run it in a maintenance window on a large table.

ALTER TABLE public.financial_audit_logs DROP CONSTRAINT IF EXISTS check_audit_action;
ALTER TABLE public.financial_audit_logs
  ADD CONSTRAINT check_audit_action CHECK (action = ANY (ARRAY[
    'PAYMENT_CREATED', 'PAYMENT_IDEMPOTENT_REPLAY', 'PAYMENT_ALLOCATION_CREATED', 'PAYMENT_REVERSED',
    'DUE_ISSUED', 'DUE_BATCH_ISSUED', 'RECURRING_DUES_GENERATED', 'RECURRING_DUES_SKIPPED',
    'OPERATION_REJECTED', 'LEASE_RENT_DUE_GENERATED', 'LEASE_RENT_DUE_SKIPPED',
    'OPENING_BALANCE_RECORDED',
    'FISCAL_YEAR_CLOSED', 'FISCAL_PERIOD_STATUS_CHANGED',
    'FISCAL_YEAR_OPENED'
  ]));
