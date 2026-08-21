-- Security deposit ledger for unit_leases. A deposit is a liability, never
-- revenue on receipt -- it is never a `dues` row and never flows through
-- the rent-due generation engine (see the implementation plan, Phase 4).
--
-- Modeled as an append-only event log rather than a single mutable balance
-- column on unit_leases, so partial refunds/deductions carry their own
-- audited trail instead of overwriting a running total.
--
-- v1 is deliberately off-books: no journal_entry_id / chart_of_accounts
-- link exists yet. Whether a deposit should ever post to the GL is a real
-- accounting decision (flagged explicitly in the implementation plan,
-- section 1.3) -- this table is additive-only, so a journal_entry_id
-- column can be added later without reshaping anything if that changes.
create table public.unit_lease_deposit_events (
  id uuid primary key default gen_random_uuid(),
  lease_id uuid not null references public.unit_leases (id) on delete cascade,
  event_type text not null
    check (event_type in ('RECEIVED', 'REFUNDED', 'DEDUCTED')),
  amount numeric(19, 4) not null check (amount > 0),
  reason text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  check (event_type = 'RECEIVED' or (reason is not null and trim(reason) <> ''))
);

create index idx_unit_lease_deposit_events_lease on public.unit_lease_deposit_events (lease_id);

alter table public.unit_lease_deposit_events enable row level security;
