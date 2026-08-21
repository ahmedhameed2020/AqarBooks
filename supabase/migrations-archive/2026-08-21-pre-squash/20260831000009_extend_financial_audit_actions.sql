-- Rent-due generation is money-generation, same category as
-- RECURRING_DUES_GENERATED/RECURRING_DUES_SKIPPED -- goes to
-- financial_audit_logs (tamper-evident, hash-chained), not
-- platform_audit_logs, per the implementation plan's audit-log split
-- (section 3.4). The "blocked, no current owner" case reuses the existing
-- OPERATION_REJECTED value rather than adding a third new action.
alter table public.financial_audit_logs drop constraint check_audit_action;
alter table public.financial_audit_logs add constraint check_audit_action
  check (action = any (array[
    'PAYMENT_CREATED', 'PAYMENT_IDEMPOTENT_REPLAY', 'PAYMENT_ALLOCATION_CREATED',
    'DUE_ISSUED', 'DUE_BATCH_ISSUED', 'RECURRING_DUES_GENERATED', 'RECURRING_DUES_SKIPPED',
    'OPERATION_REJECTED', 'LEASE_RENT_DUE_GENERATED', 'LEASE_RENT_DUE_SKIPPED'
  ]));
