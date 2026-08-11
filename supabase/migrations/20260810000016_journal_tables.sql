-- Phase 3: journal engine tables. Deliberately no INSERT/UPDATE/DELETE RLS
-- policy is granted to the authenticated role on either table (see
-- 20260810000018_accounting_rls.sql) -- every write must go through
-- create_journal_entry / post_journal_entry / reverse_journal_entry, which
-- run as SECURITY DEFINER and enforce every invariant in one transaction.

create table public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid references public.resorts (id) on delete cascade,
  fiscal_period_id uuid not null references public.fiscal_periods (id),
  entry_number bigint,
  entry_date date not null,
  description text not null,
  source_type text not null default 'JOURNAL_VOUCHER'
    check (source_type in ('JOURNAL_VOUCHER', 'RECEIPT_VOUCHER', 'PAYMENT_VOUCHER')),
  source_id uuid,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'UNDER_REVIEW', 'POSTED', 'REVERSED')),
  idempotency_key text,
  reversed_entry_id uuid references public.journal_entries (id),
  created_by uuid references auth.users (id),
  reviewed_by uuid references auth.users (id),
  posted_by uuid references auth.users (id),
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, idempotency_key)
);

create unique index idx_journal_entries_number
  on public.journal_entries (organization_id, entry_number) where entry_number is not null;

create index idx_journal_entries_org on public.journal_entries (organization_id);
create index idx_journal_entries_period on public.journal_entries (fiscal_period_id);
create index idx_journal_entries_status on public.journal_entries (organization_id, status);

create table public.journal_entry_lines (
  id uuid primary key default gen_random_uuid(),
  journal_entry_id uuid not null references public.journal_entries (id) on delete cascade,
  line_number int not null,
  account_id uuid not null references public.chart_of_accounts (id),
  description text,
  debit numeric(19, 4) not null default 0,
  credit numeric(19, 4) not null default 0,
  cost_center_id uuid references public.cost_centers (id),
  project_id uuid references public.projects (id),
  unique (journal_entry_id, line_number),
  check (debit >= 0 and credit >= 0),
  check (not (debit > 0 and credit > 0)),
  check (debit > 0 or credit > 0)
);

create index idx_journal_entry_lines_entry on public.journal_entry_lines (journal_entry_id);
create index idx_journal_entry_lines_account on public.journal_entry_lines (account_id);
