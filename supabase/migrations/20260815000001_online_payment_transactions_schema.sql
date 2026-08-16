-- Phase 3 (transaction data model only -- no checkout/webhook/provider code
-- exists yet; see docs/superpowers/specs/2026-08-14-owner-portal-and-online-payments-design.md,
-- "Online Payment Flow" -> "Schema"). This table can be created and
-- inspected but nothing in the app can create a real payment from it until
-- Phase 4 ships record_online_payment.

create table public.online_payment_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid not null references public.resorts (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  client_request_id text not null,     -- generated once client-side, forwarded unchanged on retry
  provider text not null check (provider in ('PAYMOB', 'FAWRY')),
  provider_reference text,             -- set once the provider returns a session/order id
  provider_payload jsonb,              -- last raw provider response/event, for audit (redacted of secrets)
  amount numeric(19,4) not null check (amount > 0),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PAID', 'FAILED', 'EXPIRED')),
  failure_code text,
  failure_message text,
  payment_id uuid references public.payments (id),
  webhook_event_id text,               -- provider's event/notification id, for replay dedup
  webhook_received_at timestamptz,
  paid_at timestamptz,
  failed_at timestamptz,
  expires_at timestamptz not null,     -- checkout session TTL; stale PENDING rows past this are swept to EXPIRED
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index idx_online_txn_client_request
  on public.online_payment_transactions (organization_id, client_request_id);

create unique index idx_online_txn_provider_ref
  on public.online_payment_transactions (provider, provider_reference)
  where provider_reference is not null;

create unique index idx_online_txn_webhook_event
  on public.online_payment_transactions (provider, webhook_event_id)
  where webhook_event_id is not null;

create index idx_online_txn_member on public.online_payment_transactions (member_id);
create index idx_online_txn_expires_at on public.online_payment_transactions (expires_at) where status = 'PENDING';

-- Identity/amount fields (organization_id, resort_id, member_id, provider,
-- amount) are frozen once a transaction leaves PENDING -- a checkout session
-- was already created against these exact values with the provider, so
-- changing them afterward would desync the DB row from what the provider
-- actually has on file. Status transitions are one-directional out of
-- PENDING: PENDING -> {PAID, FAILED, EXPIRED}, and never back -- a terminal
-- state can never move to any other state, including back to PENDING (e.g.
-- a delayed/replayed webhook must never "un-fail" or "un-expire" a
-- transaction; Phase 4's idempotent-replay handling for a PAID transaction
-- is a read of the existing row, not an UPDATE that changes its status).
create or replace function public.forbid_online_txn_mutation_after_pending()
returns trigger
language plpgsql
as $$
begin
  if old.status <> 'PENDING' and (
    new.amount <> old.amount or
    new.organization_id <> old.organization_id or
    new.resort_id <> old.resort_id or
    new.member_id <> old.member_id or
    new.provider <> old.provider
  ) then
    raise exception 'ONLINE_TXN_IMMUTABLE: cannot modify a settled transaction''s identity or amount' using errcode = '22023';
  end if;

  if old.status <> 'PENDING' and new.status <> old.status then
    raise exception 'ONLINE_TXN_INVALID_TRANSITION: cannot change status of a % transaction', old.status using errcode = '22023';
  end if;

  return new;
end;
$$;

create trigger trg_online_txn_immutable
  before update on public.online_payment_transactions
  for each row execute function public.forbid_online_txn_mutation_after_pending();

create trigger trg_online_txn_updated_at
  before update on public.online_payment_transactions
  for each row execute function public.set_updated_at();

create table public.online_payment_transaction_allocations (
  id uuid primary key default gen_random_uuid(),
  transaction_id uuid not null references public.online_payment_transactions (id) on delete cascade,
  due_id uuid not null references public.dues (id),
  amount numeric(19,4) not null check (amount > 0),
  created_at timestamptz not null default now(),
  unique (transaction_id, due_id)
);

create index idx_online_txn_alloc_transaction on public.online_payment_transaction_allocations (transaction_id);
create index idx_online_txn_alloc_due on public.online_payment_transaction_allocations (due_id);

-- Note: "sum of this transaction's allocation rows equals online_payment_transactions.amount"
-- is NOT enforced by a DB constraint here (a cross-table CHECK isn't
-- expressible directly in Postgres). Phase 4's checkout server action must
-- enforce this at the point it inserts both the transaction and its
-- allocations, inside the same DB transaction, before either commits -- see
-- the spec's "Schema" section note on this. Not re-litigated in Phase 3
-- since there is no insert path yet to enforce it in.

alter table public.online_payment_transactions enable row level security;
alter table public.online_payment_transaction_allocations enable row level security;
-- No policies yet in this migration -- Task 2 adds them. RLS is enabled
-- here so the tables are never briefly open between this migration and the
-- next one being applied.
