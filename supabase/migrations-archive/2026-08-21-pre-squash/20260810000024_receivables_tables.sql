-- Phase 4: dues and payments. Like the journal engine, dues/payments/
-- allocations get NO client INSERT/UPDATE/DELETE RLS policy -- every write
-- goes through issue_due() / record_payment() so the linked journal entry
-- and the receivable's balance can never drift out of sync with the ledger
-- (spec §17: "Payment and journal creation are atomic").
--
-- Scope cuts made explicit here rather than left implicit:
--  - No due_installments table yet -- a due is a single payable amount.
--    Splitting into installments is a straightforward follow-up (create N
--    dues linked by a shared parent reference) but wasn't needed to prove
--    the payment/allocation/posting invariants this phase targets.
--  - No unallocated/advance credit -- a payment's allocations must sum to
--    exactly the payment amount. Advance-credit handling is deferred.
--  - No member_account_adjustments (waivers) yet -- deferred with the above.

create table public.due_types (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name_ar text not null,
  name_en text not null,
  default_revenue_account_id uuid not null references public.chart_of_accounts (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_due_types_organization on public.due_types (organization_id);

create table public.dues (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid not null references public.resorts (id) on delete cascade,
  unit_id uuid not null references public.units (id),
  due_type_id uuid not null references public.due_types (id),
  receivable_account_id uuid not null references public.chart_of_accounts (id),
  amount numeric(19, 4) not null check (amount > 0),
  issue_date date not null,
  due_date date not null,
  description text,
  status text not null default 'ISSUED'
    check (status in ('DRAFT', 'ISSUED', 'PARTIALLY_PAID', 'PAID', 'OVERDUE', 'VOID')),
  journal_entry_id uuid references public.journal_entries (id),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  check (due_date >= issue_date)
);

create index idx_dues_organization on public.dues (organization_id);
create index idx_dues_unit on public.dues (unit_id);
create index idx_dues_status on public.dues (organization_id, status);

create table public.payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid not null references public.resorts (id) on delete cascade,
  member_id uuid references public.members (id),
  unit_id uuid references public.units (id),
  amount numeric(19, 4) not null check (amount > 0),
  method text not null check (method in ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER')),
  payment_date date not null,
  receipt_number bigint,
  deposit_account_id uuid not null references public.chart_of_accounts (id),
  journal_entry_id uuid references public.journal_entries (id),
  status text not null default 'POSTED' check (status in ('POSTED', 'REVERSED')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create unique index idx_payments_receipt_number
  on public.payments (organization_id, receipt_number) where receipt_number is not null;

create index idx_payments_organization on public.payments (organization_id);

create table public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.payments (id) on delete cascade,
  due_id uuid not null references public.dues (id),
  amount numeric(19, 4) not null check (amount > 0)
);

create index idx_payment_allocations_payment on public.payment_allocations (payment_id);
create index idx_payment_allocations_due on public.payment_allocations (due_id);
