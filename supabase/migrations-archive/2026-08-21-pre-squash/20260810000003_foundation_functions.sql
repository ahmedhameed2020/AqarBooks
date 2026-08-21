-- Authorization helper functions used by RLS policies across every module.
-- SECURITY DEFINER so they can read membership/role tables without recursing
-- into the RLS policies defined on those same tables.

create or replace function public.is_platform_admin(p_user_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_role_assignments ura
    join public.roles r on r.id = ura.role_id
    where ura.user_id = p_user_id
      and r.key = 'PLATFORM_SUPER_ADMIN'
      and r.organization_id is null
  );
$$;

create or replace function public.is_org_member(p_user_id uuid, p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.organization_memberships om
    where om.user_id = p_user_id
      and om.organization_id = p_organization_id
      and om.status = 'active'
  ) or public.is_platform_admin(p_user_id);
$$;

create or replace function public.is_resort_member(p_user_id uuid, p_resort_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.resort_memberships rm
    where rm.user_id = p_user_id
      and rm.resort_id = p_resort_id
  ) or public.is_platform_admin(p_user_id);
$$;

create or replace function public.organization_is_active(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.organizations o
    where o.id = p_organization_id and o.status = 'ACTIVE'
  );
$$;

create or replace function public.has_permission(p_user_id uuid, p_organization_id uuid, p_permission_key text)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.is_platform_admin(p_user_id)
  or exists (
    select 1
    from public.user_role_assignments ura
    join public.role_permissions rp on rp.role_id = ura.role_id
    join public.permissions p on p.id = rp.permission_id
    where ura.user_id = p_user_id
      and ura.organization_id = p_organization_id
      and p.key = p_permission_key
  );
$$;
