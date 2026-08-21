-- Unit purchase installment plans. Phase 1 of
-- docs/superpowers/plans/2026-08-17-unit-installment-plans-implementation-plan.md.
--
-- Unlike unit_leases' rent generation (a lazy sweep, since a lease's end is
-- open-ended), an installment plan's total count and every due date are
-- fully known at creation time -- there is nothing to sweep for. All N
-- dues are generated eagerly, inside create_installment_plan() (Phase 3),
-- in one transaction -- no *_generation_runs idempotency table exists here
-- because there is no periodic re-invocation to guard against.
--
-- No DRAFT status (approved decision, 2026-08-17): creation IS activation.
create table public.installment_plans (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  unit_id uuid not null references public.units (id) on delete cascade,
  buyer_member_id uuid not null references public.members (id),
  due_type_id uuid not null references public.due_types (id),
  receivable_account_id uuid not null references public.chart_of_accounts (id),
  status text not null default 'ACTIVE'
    check (status in ('ACTIVE', 'COMPLETED', 'CANCELLED')),
  total_price numeric(19, 4) not null check (total_price > 0),
  down_payment numeric(19, 4) not null default 0 check (down_payment >= 0),
  installment_count int not null check (installment_count > 0),
  installment_frequency text not null
    check (installment_frequency in ('MONTHLY', 'QUARTERLY', 'YEARLY')),
  starts_on date not null,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Mirrors unit_leases.ended_by/ended_at/end_reason -- set only on
  -- ACTIVE -> CANCELLED.
  cancelled_by uuid references auth.users (id),
  cancelled_at timestamptz,
  cancel_reason text,
  check (down_payment <= total_price),
  check ((cancelled_at is null) = (cancelled_by is null)),
  check (status <> 'CANCELLED' or (cancel_reason is not null and trim(cancel_reason) <> ''))
);

create index idx_installment_plans_organization on public.installment_plans (organization_id);
create index idx_installment_plans_property on public.installment_plans (property_id);
create index idx_installment_plans_unit on public.installment_plans (unit_id);
create index idx_installment_plans_buyer_member on public.installment_plans (buyer_member_id);

-- At most one ACTIVE plan per unit -- a unit can't be mid-sale under two
-- simultaneous financing arrangements. A plain unique index, not an
-- EXCLUDE constraint: there's no date-range overlap concept here, just
-- "at most one ACTIVE row per unit."
create unique index idx_installment_plans_one_active_per_unit
  on public.installment_plans (unit_id) where (status = 'ACTIVE');

create trigger trg_installment_plans_updated_at
  before update on public.installment_plans
  for each row execute function public.set_updated_at();

alter table public.installment_plans enable row level security;

-- One row per installment (sequence_no = 0 for the down payment, if any;
-- 1..N for regular installments), each linked to the real payable due.
-- principal_amount is kept here (not just read off dues.amount) so the
-- plan's own breakdown survives independent of whatever the due's amount
-- later becomes through VOID/edits.
create table public.plan_installments (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.installment_plans (id) on delete cascade,
  due_id uuid not null references public.dues (id),
  sequence_no int not null check (sequence_no >= 0),
  principal_amount numeric(19, 4) not null check (principal_amount > 0),
  created_at timestamptz not null default now(),
  unique (plan_id, sequence_no)
);

create index idx_plan_installments_plan on public.plan_installments (plan_id);
create index idx_plan_installments_due on public.plan_installments (due_id);

alter table public.plan_installments enable row level security;

-- dues.source_type = 'INSTALLMENT_PLAN', source_id = plan_installments.id
-- (the specific installment row, not installment_plans.id directly) --
-- mirrors the lease pattern's "source_id points at the one generating
-- record" shape while still giving an O(1) join from a due to its plan
-- via plan_installments.plan_id.
alter table public.dues drop constraint dues_source_type_check;
alter table public.dues add constraint dues_source_type_check
  check (source_type in ('LEASE_RENT', 'INSTALLMENT_PLAN'));
