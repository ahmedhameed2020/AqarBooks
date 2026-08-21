-- Phase 5: banks and cheques. Cheques get no client write policy -- every
-- status transition goes through set_cheque_status() / clear_incoming_cheque()
-- so cheque_status_history is a complete, un-skippable audit trail (spec
-- §19: "Every status transition must be validated and audited").

create table public.banks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name_ar text not null,
  name_en text not null,
  created_at timestamptz not null default now()
);

create table public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid not null references public.resorts (id) on delete cascade,
  bank_id uuid not null references public.banks (id),
  account_name text not null,
  account_number text not null,
  gl_account_id uuid not null references public.chart_of_accounts (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (bank_id, account_number)
);

create index idx_bank_accounts_organization on public.bank_accounts (organization_id);

create table public.cheques (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid not null references public.resorts (id) on delete cascade,
  bank_account_id uuid not null references public.bank_accounts (id),
  direction text not null check (direction in ('INCOMING', 'OUTGOING')),
  cheque_number text not null,
  amount numeric(19, 4) not null check (amount > 0),
  member_id uuid references public.members (id),
  cheque_date date not null,
  due_date date not null,
  status text not null default 'RECEIVED'
    check (status in ('DRAFT', 'ISSUED', 'RECEIVED', 'DEPOSITED', 'CLEARED', 'RETURNED', 'CANCELLED')),
  payment_id uuid references public.payments (id),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  unique (bank_account_id, cheque_number)
);

create index idx_cheques_organization on public.cheques (organization_id, status);

create table public.cheque_status_history (
  id uuid primary key default gen_random_uuid(),
  cheque_id uuid not null references public.cheques (id) on delete cascade,
  from_status text,
  to_status text not null,
  changed_by uuid references auth.users (id),
  changed_at timestamptz not null default now(),
  note text
);

create index idx_cheque_status_history_cheque on public.cheque_status_history (cheque_id);
