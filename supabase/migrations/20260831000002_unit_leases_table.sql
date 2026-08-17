-- Unit rental/occupancy: a unit_leases row is a time-bounded tenancy,
-- independent of unit_ownerships. A unit can have zero, one, or (co-owned)
-- multiple rows in unit_ownerships and, separately, zero or one ACTIVE lease
-- here at a time. No FK/trigger links the two tables -- see
-- docs/superpowers/plans/2026-08-17-unit-rental-occupancy-implementation-plan.md
-- Phase 1 for the full contract.
--
-- Named unit_leases (not unit_occupancies, the original design spec's
-- working name) because units_with_financials.occupancy_status already
-- means "has an owner" -- reusing "occupancy" here would collide with that
-- existing, UI-facing meaning.
--
-- No client-facing INSERT/UPDATE/DELETE RLS policy is added in this
-- migration (see the RLS migration): every write goes through a
-- security-definer RPC, matching the dues/payments convention.
create table public.unit_leases (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  -- Always derived server-side from units.property_id at creation time by
  -- the create_unit_lease() RPC, never trusted from client input, so it can
  -- never disagree with the unit's actual property.
  property_id uuid not null references public.properties (id) on delete cascade,
  unit_id uuid not null references public.units (id) on delete cascade,
  tenant_member_id uuid not null references public.members (id),
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'ACTIVE', 'ENDED', 'CANCELLED')),
  starts_on date not null,
  ends_on date,
  rent_amount numeric(19, 4) not null check (rent_amount > 0),
  rent_frequency text not null
    check (rent_frequency in ('MONTHLY', 'QUARTERLY', 'YEARLY')),
  security_deposit_amount numeric(19, 4) not null default 0
    check (security_deposit_amount >= 0),
  billing_recipient text not null
    check (billing_recipient in ('OWNER', 'TENANT')),
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  -- Mirrors payments.reversed_at/reversed_by/reversal_reason -- set only
  -- when status transitions to ENDED (via end_unit_lease()).
  ended_by uuid references auth.users (id),
  ended_at timestamptz,
  end_reason text,
  check (ends_on is null or ends_on >= starts_on),
  check ((ended_at is null) = (ended_by is null)),
  check (status <> 'ENDED' or (end_reason is not null and trim(end_reason) <> ''))
);

create index idx_unit_leases_organization on public.unit_leases (organization_id);
create index idx_unit_leases_property on public.unit_leases (property_id);
create index idx_unit_leases_unit on public.unit_leases (unit_id);
create index idx_unit_leases_tenant_member on public.unit_leases (tenant_member_id);
create index idx_unit_leases_active_unit on public.unit_leases (unit_id) where status = 'ACTIVE';

-- Only ACTIVE leases are constrained to non-overlapping date ranges per
-- unit -- DRAFT rows are intentionally unconstrained, so staff can draft
-- multiple competing offers for the same unit/period. The hard block
-- happens at activation (activate_unit_lease()), where a second overlapping
-- ACTIVE lease raises this exclusion violation, translated by the RPC into
-- a friendly error rather than a raw Postgres message.
alter table public.unit_leases
  add constraint unit_leases_no_overlapping_active
  exclude using gist (
    unit_id with =,
    daterange(starts_on, coalesce(ends_on, 'infinity'::date), '[]') with &&
  ) where (status = 'ACTIVE');

create trigger trg_unit_leases_updated_at
  before update on public.unit_leases
  for each row execute function public.set_updated_at();

alter table public.unit_leases enable row level security;
