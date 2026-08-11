-- Phase 2: tenant feature flags and branding.

create table public.tenant_feature_flags (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  flag_key text not null,
  enabled boolean not null default false,
  created_at timestamptz not null default now(),
  unique (organization_id, flag_key)
);

create table public.tenant_branding (
  organization_id uuid primary key references public.organizations (id) on delete cascade,
  logo_url text,
  primary_color text,
  secondary_color text,
  updated_at timestamptz not null default now()
);

create trigger trg_tenant_branding_updated_at
  before update on public.tenant_branding
  for each row execute function public.set_updated_at();
