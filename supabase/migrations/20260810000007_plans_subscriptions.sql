-- Phase 2: SaaS plans, entitlements, subscriptions.

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  key text not null unique check (key in ('STARTER', 'PROFESSIONAL', 'ENTERPRISE')),
  name_ar text not null,
  name_en text not null,
  sort_order int not null default 0,
  created_at timestamptz not null default now()
);

-- Entitlement value is stored as jsonb so both booleans (module access) and
-- numbers (resort/user/unit limits) fit the same table without a schema per type.
create table public.plan_entitlements (
  id uuid primary key default gen_random_uuid(),
  plan_id uuid not null references public.plans (id) on delete cascade,
  key text not null,
  value jsonb not null,
  unique (plan_id, key)
);

create table public.subscriptions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  plan_id uuid not null references public.plans (id),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'CANCELED', 'PAST_DUE')),
  current_period_start timestamptz not null default now(),
  current_period_end timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id)
);

create unique index idx_subscriptions_one_active_per_org
  on public.subscriptions (organization_id) where status = 'ACTIVE';

create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();

-- Effective entitlement lookup: the organization's active plan's entitlement value.
create or replace function public.get_entitlement(p_organization_id uuid, p_key text)
returns jsonb
language sql
stable
security definer
set search_path = public
as $$
  select pe.value
  from public.subscriptions s
  join public.plan_entitlements pe on pe.plan_id = s.plan_id
  where s.organization_id = p_organization_id
    and s.status = 'ACTIVE'
    and pe.key = p_key
  limit 1;
$$;
