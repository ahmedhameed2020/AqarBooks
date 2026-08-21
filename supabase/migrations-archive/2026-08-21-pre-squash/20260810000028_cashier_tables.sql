-- Phase 5: cashier & treasury. cashier_sessions and cash_transactions get
-- no client write policy, same pattern as journal_entries/dues/payments --
-- every write goes through open_cashier_session() / close_cashier_session(),
-- and cash_transactions are only ever inserted internally by record_payment()
-- when it's called with a session (see 20260810000030).

create table public.cashboxes (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid not null references public.resorts (id) on delete cascade,
  name text not null,
  gl_account_id uuid not null references public.chart_of_accounts (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_cashboxes_resort on public.cashboxes (resort_id);

create table public.cashier_sessions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid not null references public.resorts (id) on delete cascade,
  cashbox_id uuid not null references public.cashboxes (id),
  opened_by uuid not null references auth.users (id),
  opening_balance numeric(19, 4) not null default 0,
  status text not null default 'OPEN' check (status in ('OPEN', 'CLOSED', 'RECONCILED')),
  expected_closing_balance numeric(19, 4),
  actual_closing_balance numeric(19, 4),
  variance numeric(19, 4),
  opened_at timestamptz not null default now(),
  closed_by uuid references auth.users (id),
  closed_at timestamptz
);

-- A cashbox can only have one OPEN session at a time -- this is what makes
-- "cashier cannot transact without an open session" and "cashier cannot use
-- another session" enforceable rather than aspirational.
create unique index idx_cashier_sessions_one_open_per_cashbox
  on public.cashier_sessions (cashbox_id) where status = 'OPEN';

create index idx_cashier_sessions_organization on public.cashier_sessions (organization_id);

create table public.cash_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  session_id uuid not null references public.cashier_sessions (id),
  type text not null check (type in ('RECEIPT', 'PAYMENT')),
  amount numeric(19, 4) not null check (amount > 0),
  payment_id uuid references public.payments (id),
  description text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index idx_cash_transactions_session on public.cash_transactions (session_id);
