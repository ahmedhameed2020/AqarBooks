-- Design B (mark, never delete) for supplier invoices/payments, mirroring
-- the member-payment void schema (20260812000013): reversed_at/reversed_by
-- stamped on the row, allocations get the same trio (no reversal_reason on
-- the allocation itself -- the reason lives once on the parent payment).
-- Unlike member payments.status, supplier_payments never had a status
-- column at all -- reversed_at IS NOT NULL is the single source of truth,
-- no redundant status field to keep in sync.

alter table public.supplier_invoices
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid references auth.users (id),
  add column if not exists reversal_reason text;

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
  add constraint supplier_payment_allocations_reversed_at_by_together
    check ((reversed_at is null) = (reversed_by is null));

create index if not exists idx_supplier_payment_allocations_payment_reversed
  on public.supplier_payment_allocations (payment_id, reversed_at);
create index if not exists idx_supplier_payment_allocations_invoice_reversed
  on public.supplier_payment_allocations (invoice_id, reversed_at);

-- One-way transitions: a voided payment or a cancelled invoice can never
-- be un-voided/un-cancelled -- a correction requires a fresh transaction,
-- same "archive is terminal" principle used everywhere else in this app.
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
