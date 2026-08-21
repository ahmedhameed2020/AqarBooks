-- Foundation RLS. Default-deny: RLS is enabled with no permissive policy
-- until explicitly granted below.

alter table public.profiles enable row level security;
alter table public.organizations enable row level security;
alter table public.organization_memberships enable row level security;
alter table public.resorts enable row level security;
alter table public.resort_memberships enable row level security;
alter table public.roles enable row level security;
alter table public.permissions enable row level security;
alter table public.role_permissions enable row level security;
alter table public.user_role_assignments enable row level security;
alter table public.platform_audit_logs enable row level security;

-- profiles: a user manages their own profile; platform admins can view all.
create policy "profiles_select_own_or_platform_admin"
  on public.profiles for select
  using (id = auth.uid() or public.is_platform_admin(auth.uid()));

create policy "profiles_insert_own"
  on public.profiles for insert
  with check (id = auth.uid());

create policy "profiles_update_own"
  on public.profiles for update
  using (id = auth.uid())
  with check (id = auth.uid());

-- organizations: visible to members and platform admins.
create policy "organizations_select_member"
  on public.organizations for select
  using (public.is_org_member(auth.uid(), id));

create policy "organizations_insert_platform_admin"
  on public.organizations for insert
  with check (public.is_platform_admin(auth.uid()));

create policy "organizations_update_authorized"
  on public.organizations for update
  using (
    public.is_platform_admin(auth.uid())
    or public.has_permission(auth.uid(), id, 'tenant.settings.manage')
  )
  with check (
    public.is_platform_admin(auth.uid())
    or public.has_permission(auth.uid(), id, 'tenant.settings.manage')
  );

-- organization_memberships
create policy "org_memberships_select_member"
  on public.organization_memberships for select
  using (public.is_org_member(auth.uid(), organization_id));

create policy "org_memberships_manage"
  on public.organization_memberships for all
  using (public.has_permission(auth.uid(), organization_id, 'tenant.users.manage'))
  with check (public.has_permission(auth.uid(), organization_id, 'tenant.users.manage'));

-- resorts: visible to org members; managed by tenant admins. Writes blocked
-- for suspended/archived organizations.
create policy "resorts_select_member"
  on public.resorts for select
  using (public.is_org_member(auth.uid(), organization_id));

create policy "resorts_manage"
  on public.resorts for all
  using (
    public.has_permission(auth.uid(), organization_id, 'tenant.settings.manage')
    and public.organization_is_active(organization_id)
  )
  with check (
    public.has_permission(auth.uid(), organization_id, 'tenant.settings.manage')
    and public.organization_is_active(organization_id)
  );

-- resort_memberships
create policy "resort_memberships_select_member"
  on public.resort_memberships for select
  using (public.is_org_member(auth.uid(), organization_id));

create policy "resort_memberships_manage"
  on public.resort_memberships for all
  using (public.has_permission(auth.uid(), organization_id, 'tenant.users.manage'))
  with check (public.has_permission(auth.uid(), organization_id, 'tenant.users.manage'));

-- roles: system roles (organization_id null) are a shared readable catalog;
-- org-specific roles are visible to org members and managed by tenant.roles.manage.
create policy "roles_select_system_or_member"
  on public.roles for select
  using (
    organization_id is null
    or public.is_org_member(auth.uid(), organization_id)
  );

create policy "roles_manage_tenant"
  on public.roles for all
  using (
    organization_id is not null
    and public.has_permission(auth.uid(), organization_id, 'tenant.roles.manage')
  )
  with check (
    organization_id is not null
    and public.has_permission(auth.uid(), organization_id, 'tenant.roles.manage')
  );

-- permissions: global read-only catalog for authenticated users.
create policy "permissions_select_authenticated"
  on public.permissions for select
  using (auth.uid() is not null);

-- role_permissions: readable alongside roles; only platform admins manage
-- system-role grants, tenant admins manage their own roles' grants.
create policy "role_permissions_select_authenticated"
  on public.role_permissions for select
  using (auth.uid() is not null);

create policy "role_permissions_manage"
  on public.role_permissions for all
  using (
    exists (
      select 1 from public.roles r
      where r.id = role_id
        and (
          (r.organization_id is null and public.is_platform_admin(auth.uid()))
          or (r.organization_id is not null and public.has_permission(auth.uid(), r.organization_id, 'tenant.roles.manage'))
        )
    )
  )
  with check (
    exists (
      select 1 from public.roles r
      where r.id = role_id
        and (
          (r.organization_id is null and public.is_platform_admin(auth.uid()))
          or (r.organization_id is not null and public.has_permission(auth.uid(), r.organization_id, 'tenant.roles.manage'))
        )
    )
  );

-- user_role_assignments
create policy "user_role_assignments_select_member"
  on public.user_role_assignments for select
  using (
    user_id = auth.uid()
    or (organization_id is not null and public.is_org_member(auth.uid(), organization_id))
  );

create policy "user_role_assignments_manage"
  on public.user_role_assignments for all
  using (
    organization_id is not null
    and public.has_permission(auth.uid(), organization_id, 'tenant.users.manage')
  )
  with check (
    organization_id is not null
    and public.has_permission(auth.uid(), organization_id, 'tenant.users.manage')
  );

-- platform_audit_logs: platform admins only.
create policy "platform_audit_logs_select_admin"
  on public.platform_audit_logs for select
  using (public.is_platform_admin(auth.uid()));

create policy "platform_audit_logs_insert_admin"
  on public.platform_audit_logs for insert
  with check (public.is_platform_admin(auth.uid()));
