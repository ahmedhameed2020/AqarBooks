-- Pre-existing schema gap found while writing live integration coverage
-- for the supplier posting-permission fix (20260813000008): calling
-- post_supplier_invoice fails with "column net_amount of relation
-- supplier_invoices does not exist". The live database has the CURRENT
-- (VAT/WHT-aware, 15-arg) post_supplier_invoice/record_supplier_payment
-- FUNCTION bodies -- confirmed by the earlier 17-call-site audit and by
-- 20260813000008 cleanly CREATE OR REPLACE-ing the same signature -- but
-- never actually got the ALTER TABLE from
-- 20260812000025_supplier_invoice_vat_wht.sql that those function bodies
-- depend on. That whole file is NOT re-run here: its own
-- post_supplier_invoice definition still calls the PUBLIC create_journal_
-- entry/post_journal_entry (the bug 20260813000008 just fixed) -- running
-- it now would silently revert that fix. This migration carries over only
-- the column additions, verbatim, so both migrations end up applied
-- without one undoing the other.

alter table public.supplier_invoices
  add column if not exists net_amount numeric(19, 4),
  add column if not exists discount_amount numeric(19, 4) not null default 0,
  add column if not exists vat_rate numeric(5, 2) not null default 0,
  add column if not exists vat_amount numeric(19, 4) not null default 0,
  add column if not exists vat_account_id uuid references public.chart_of_accounts (id),
  add column if not exists wht_rate numeric(5, 2) not null default 0,
  add column if not exists wht_amount numeric(19, 4) not null default 0,
  add column if not exists wht_account_id uuid references public.chart_of_accounts (id);

-- Existing invoices predate tax tracking: treat them as net-only (no
-- VAT/WHT), matching the original migration's own backfill.
update public.supplier_invoices set net_amount = amount where net_amount is null;

alter table public.supplier_invoices alter column net_amount set not null;

alter table public.supplier_payments
  add column if not exists wht_amount numeric(19, 4) not null default 0,
  add column if not exists wht_account_id uuid references public.chart_of_accounts (id);

-- Also carrying over 20260812000027_supplier_void_schema.sql verbatim --
-- same situation (columns/constraints/triggers the live cancel_supplier_
-- invoice/void_supplier_payment function bodies already depend on, but
-- with no schema backing them). This file has no CREATE OR REPLACE
-- FUNCTION that touches create_journal_entry/post_journal_entry, so
-- there's no fix-reverting risk bundling it here -- and it's needed before
-- the upcoming cancel/void hardening task regardless.

alter table public.supplier_invoices
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid references auth.users (id),
  add column if not exists reversal_reason text;

alter table public.supplier_invoices
  drop constraint if exists supplier_invoices_reversal_reason_required,
  drop constraint if exists supplier_invoices_reversal_reason_length,
  drop constraint if exists supplier_invoices_reversed_at_by_together;
alter table public.supplier_invoices
  add constraint supplier_invoices_reversal_reason_required
    check (status <> 'CANCELLED' or (reversal_reason is not null and trim(reversal_reason) <> '')),
  add constraint supplier_invoices_reversal_reason_length
    check (reversal_reason is null or char_length(reversal_reason) <= 1000),
  add constraint supplier_invoices_reversed_at_by_together
    check ((reversed_at is null) = (reversed_by is null));

alter table public.supplier_payments
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid references auth.users (id),
  add column if not exists reversal_reason text;

alter table public.supplier_payments
  drop constraint if exists supplier_payments_reversal_reason_required,
  drop constraint if exists supplier_payments_reversal_reason_length,
  drop constraint if exists supplier_payments_reversed_at_by_together;
alter table public.supplier_payments
  add constraint supplier_payments_reversal_reason_required
    check (reversed_at is null or (reversal_reason is not null and trim(reversal_reason) <> '')),
  add constraint supplier_payments_reversal_reason_length
    check (reversal_reason is null or char_length(reversal_reason) <= 1000),
  add constraint supplier_payments_reversed_at_by_together
    check ((reversed_at is null) = (reversed_by is null));

alter table public.supplier_payment_allocations
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid references auth.users (id);

alter table public.supplier_payment_allocations
  drop constraint if exists supplier_payment_allocations_reversed_at_by_together;
alter table public.supplier_payment_allocations
  add constraint supplier_payment_allocations_reversed_at_by_together
    check ((reversed_at is null) = (reversed_by is null));

create index if not exists idx_supplier_payment_allocations_payment_reversed
  on public.supplier_payment_allocations (payment_id, reversed_at);
create index if not exists idx_supplier_payment_allocations_invoice_reversed
  on public.supplier_payment_allocations (invoice_id, reversed_at);

create or replace function public.prevent_unreverse_supplier_payment_allocation()
returns trigger
language plpgsql
as $$
begin
  if old.reversed_at is not null and new.reversed_at is null then
    raise exception 'cannot clear reversed_at on an already-reversed supplier payment allocation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_unreverse_supplier_payment_allocation on public.supplier_payment_allocations;
create trigger trg_prevent_unreverse_supplier_payment_allocation
  before update on public.supplier_payment_allocations
  for each row execute function public.prevent_unreverse_supplier_payment_allocation();

create or replace function public.prevent_unreverse_supplier_payment()
returns trigger
language plpgsql
as $$
begin
  if old.reversed_at is not null and new.reversed_at is null then
    raise exception 'cannot clear reversed_at on an already-reversed supplier payment';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_unreverse_supplier_payment on public.supplier_payments;
create trigger trg_prevent_unreverse_supplier_payment
  before update on public.supplier_payments
  for each row execute function public.prevent_unreverse_supplier_payment();

create or replace function public.prevent_uncancel_supplier_invoice()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'CANCELLED' and new.status <> 'CANCELLED' then
    raise exception 'cannot change the status of an already-cancelled supplier invoice';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_uncancel_supplier_invoice on public.supplier_invoices;
create trigger trg_prevent_uncancel_supplier_invoice
  before update on public.supplier_invoices
  for each row execute function public.prevent_uncancel_supplier_invoice();

notify pgrst, 'reload schema';
