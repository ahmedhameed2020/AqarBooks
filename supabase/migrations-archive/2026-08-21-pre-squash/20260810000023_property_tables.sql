-- Phase 4: property structure and members.
-- Simplification from the master spec's full Zone -> Building -> Floor ->
-- Unit hierarchy: floor is kept as an attribute on the unit rather than its
-- own table, since a standalone floors table added no behavior beyond a
-- number in this phase. Zones and buildings remain optional groupings.

create table public.zones (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid not null references public.resorts (id) on delete cascade,
  name_ar text not null,
  name_en text not null,
  created_at timestamptz not null default now()
);

create index idx_zones_resort on public.zones (resort_id);

create table public.buildings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid not null references public.resorts (id) on delete cascade,
  zone_id uuid references public.zones (id) on delete set null,
  code text not null,
  name_ar text not null,
  name_en text not null,
  created_at timestamptz not null default now(),
  unique (resort_id, code)
);

create index idx_buildings_resort on public.buildings (resort_id);

create table public.units (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid not null references public.resorts (id) on delete cascade,
  building_id uuid references public.buildings (id) on delete set null,
  zone_id uuid references public.zones (id) on delete set null,
  code text not null,
  unit_type text not null default 'VILLA'
    check (unit_type in ('VILLA', 'CHALET', 'APARTMENT', 'SHOP', 'OFFICE', 'SERVICE', 'OTHER')),
  floor_number int,
  area numeric(10, 2),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (resort_id, code)
);

create index idx_units_resort on public.units (resort_id);
create index idx_units_building on public.units (building_id);

create trigger trg_units_updated_at
  before update on public.units
  for each row execute function public.set_updated_at();

-- A member can own units across multiple resorts within the same
-- organization (spec §15), so members are organization-scoped, not
-- resort-scoped.
create table public.members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  full_name text not null,
  is_company boolean not null default false,
  email text,
  phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_members_organization on public.members (organization_id);

create trigger trg_members_updated_at
  before update on public.members
  for each row execute function public.set_updated_at();

create table public.unit_ownerships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  unit_id uuid not null references public.units (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  share_percentage numeric(5, 2) not null default 100 check (share_percentage > 0 and share_percentage <= 100),
  is_primary_contact boolean not null default true,
  start_date date not null default current_date,
  end_date date,
  created_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create index idx_unit_ownerships_unit on public.unit_ownerships (unit_id);
create index idx_unit_ownerships_member on public.unit_ownerships (member_id);
