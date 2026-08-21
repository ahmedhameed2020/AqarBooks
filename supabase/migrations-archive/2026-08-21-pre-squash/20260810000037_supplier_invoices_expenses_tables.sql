-- Phase 6: supplier invoices, supplier payments, and direct expense
-- vouchers. All three post real journal entries; none get a client write
-- policy (functions only), same pattern as every financial table so far.

create table public.supplier_invoices (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid not null references public.resorts (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id),
  purchase_order_id uuid references public.purchase_orders (id),
  invoice_number text not null,
  expense_account_id uuid not null references public.chart_of_accounts (id),
  payable_account_id uuid not null references public.chart_of_accounts (id),
  amount numeric(19, 4) not null check (amount > 0),
  invoice_date date not null,
  due_date date not null,
  status text not null default 'POSTED' check (status in ('POSTED', 'PARTIALLY_PAID', 'PAID', 'CANCELLED')),
  journal_entry_id uuid references public.journal_entries (id),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (organization_id, supplier_id, invoice_number)
);

create index idx_supplier_invoices_organization on public.supplier_invoices (organization_id, status);

create table public.supplier_payments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid not null references public.resorts (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id),
  amount numeric(19, 4) not null check (amount > 0),
  method text not null check (method in ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER')),
  payment_date date not null,
  voucher_number bigint,
  payment_account_id uuid not null references public.chart_of_accounts (id),
  journal_entry_id uuid references public.journal_entries (id),
  cashier_session_id uuid references public.cashier_sessions (id),
  idempotency_key text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create unique index idx_supplier_payments_voucher_number
  on public.supplier_payments (organization_id, voucher_number) where voucher_number is not null;
create unique index idx_supplier_payments_idempotency
  on public.supplier_payments (organization_id, idempotency_key) where idempotency_key is not null;

create table public.supplier_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid not null references public.supplier_payments (id) on delete cascade,
  invoice_id uuid not null references public.supplier_invoices (id),
  amount numeric(19, 4) not null check (amount > 0)
);

create index idx_supplier_payment_allocations_payment on public.supplier_payment_allocations (payment_id);
create index idx_supplier_payment_allocations_invoice on public.supplier_payment_allocations (invoice_id);

create table public.expenses (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid not null references public.resorts (id) on delete cascade,
  expense_category_id uuid not null references public.expense_categories (id),
  description text not null,
  amount numeric(19, 4) not null check (amount > 0),
  expense_date date not null,
  payment_account_id uuid not null references public.chart_of_accounts (id),
  voucher_number bigint,
  journal_entry_id uuid references public.journal_entries (id),
  cashier_session_id uuid references public.cashier_sessions (id),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create unique index idx_expenses_voucher_number
  on public.expenses (organization_id, voucher_number) where voucher_number is not null;
create index idx_expenses_organization on public.expenses (organization_id);
