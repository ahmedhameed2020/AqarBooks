-- Foundation: profiles, organizations, resorts, memberships, RBAC catalog, audit log.
-- Every tenant-owned table carries organization_id; resort-scoped tables also carry resort_id.

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text,
  avatar_url text,
  locale text not null default 'ar' check (locale in ('ar', 'en')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text not null unique,
  status text not null default 'TRIAL' check (status in ('TRIAL', 'ACTIVE', 'SUSPENDED', 'ARCHIVED')),
  default_currency text not null default 'EGP',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id)
);

create trigger trg_organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

create table public.organization_memberships (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'invited', 'suspended')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id)
);

create index idx_organization_memberships_user on public.organization_memberships (user_id);

create table public.resorts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  code text not null,
  timezone text not null default 'Africa/Cairo',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  unique (organization_id, code)
);

create index idx_resorts_organization on public.resorts (organization_id);

create trigger trg_resorts_updated_at
  before update on public.resorts
  for each row execute function public.set_updated_at();

create table public.resort_memberships (
  id uuid primary key default gen_random_uuid(),
  resort_id uuid not null references public.resorts (id) on delete cascade,
  organization_id uuid not null references public.organizations (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  created_at timestamptz not null default now(),
  unique (resort_id, user_id)
);

create index idx_resort_memberships_user on public.resort_memberships (user_id);
create index idx_resort_memberships_organization on public.resort_memberships (organization_id);

-- RBAC catalog. organization_id null = system/platform-level role (e.g. PLATFORM_SUPER_ADMIN),
-- shared across the whole platform rather than owned by a tenant.
create table public.roles (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid references public.organizations (id) on delete cascade,
  key text not null,
  name_ar text not null,
  name_en text not null,
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create unique index idx_roles_system_key on public.roles (key) where organization_id is null;
create unique index idx_roles_org_key on public.roles (organization_id, key) where organization_id is not null;

create table public.permissions (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  description text
);

create table public.role_permissions (
  role_id uuid not null references public.roles (id) on delete cascade,
  permission_id uuid not null references public.permissions (id) on delete cascade,
  primary key (role_id, permission_id)
);

create table public.user_role_assignments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  role_id uuid not null references public.roles (id) on delete cascade,
  organization_id uuid references public.organizations (id) on delete cascade,
  resort_id uuid references public.resorts (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users (id),
  unique (user_id, role_id, organization_id, resort_id)
);

create index idx_user_role_assignments_user on public.user_role_assignments (user_id);
create index idx_user_role_assignments_org on public.user_role_assignments (organization_id);

create table public.platform_audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users (id),
  organization_id uuid references public.organizations (id),
  resort_id uuid references public.resorts (id),
  action text not null,
  entity_type text not null,
  entity_id uuid,
  reason text,
  safe_change_summary jsonb,
  correlation_id uuid,
  created_at timestamptz not null default now()
);

create index idx_platform_audit_logs_org on public.platform_audit_logs (organization_id);
create index idx_platform_audit_logs_actor on public.platform_audit_logs (actor_id);
