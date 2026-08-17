-- Schema for Design B (void = mark, never delete): payment_allocations keeps
-- every row it ever had; a void only stamps reversed_at/reversed_by on the
-- rows belonging to the voided payment. payments gets the matching
-- reversed_at/reversed_by/reversal_reason trio. No column is dropped, no
-- row is ever deleted by this feature.

alter table public.payments
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid references auth.users (id),
  add column if not exists reversal_reason text;

alter table public.payments
  add constraint payments_reversal_reason_required
    check (status <> 'REVERSED' or (reversal_reason is not null and trim(reversal_reason) <> '')),
  add constraint payments_reversal_reason_length
    check (reversal_reason is null or char_length(reversal_reason) <= 1000),
  add constraint payments_reversed_at_by_together
    check ((reversed_at is null) = (reversed_by is null));

alter table public.payment_allocations
  add column if not exists reversed_at timestamptz,
  add column if not exists reversed_by uuid references auth.users (id);

alter table public.payment_allocations
  add constraint payment_allocations_reversed_at_by_together
    check ((reversed_at is null) = (reversed_by is null));

create index if not exists idx_payment_allocations_payment_reversed
  on public.payment_allocations (payment_id, reversed_at);
create index if not exists idx_payment_allocations_due_reversed
  on public.payment_allocations (due_id, reversed_at);

-- One-way transitions: once a row has been marked reversed, nothing may
-- clear that mark back to "active" -- a correction requires a fresh
-- payment, never resurrecting a voided one, matching the same "archive is
-- terminal" principle used for units earlier in this project.
create or replace function public.prevent_unreverse_payment_allocation()
returns trigger
language plpgsql
as $$
begin
  if old.reversed_at is not null and new.reversed_at is null then
    raise exception 'cannot clear reversed_at on an already-reversed payment allocation';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_unreverse_allocation on public.payment_allocations;
create trigger trg_prevent_unreverse_allocation
  before update on public.payment_allocations
  for each row execute function public.prevent_unreverse_payment_allocation();

create or replace function public.prevent_unreverse_payment()
returns trigger
language plpgsql
as $$
begin
  if old.status = 'REVERSED' and new.status <> 'REVERSED' then
    raise exception 'cannot change the status of an already-reversed payment';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_prevent_unreverse_payment on public.payments;
create trigger trg_prevent_unreverse_payment
  before update on public.payments
  for each row execute function public.prevent_unreverse_payment();
