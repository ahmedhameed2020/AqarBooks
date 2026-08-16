-- Phase 4, Task 2: ONLINE method for Paymob/Fawry-originated payments. No
-- existing row has this value, so this is purely additive -- see design doc
-- Decision 3 for why not OTHER (would make online payments invisible to
-- method-based reporting/reconciliation).
alter table public.payments drop constraint payments_method_check;
alter table public.payments add constraint payments_method_check
  check (method in ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER', 'ONLINE'));

notify pgrst, 'reload schema';
