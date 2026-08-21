-- Phase 2c of the resort -> property domain rename. Treasury cluster:
-- bank_accounts, cashboxes, cashier_sessions, cheques. Second cluster in
-- the agreed order (treasury -> purchasing -> payments/dues), chosen for
-- being interlinked but smaller in scope than accounting/receivables.

alter table public.bank_accounts rename column resort_id to property_id;
alter table public.cashboxes rename column resort_id to property_id;
alter table public.cashier_sessions rename column resort_id to property_id;
alter table public.cheques rename column resort_id to property_id;
