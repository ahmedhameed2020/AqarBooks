-- Phase 2 RLS. Default-deny, then explicit grants.

alter table public.plans enable row level security;
alter table public.plan_entitlements enable row level security;
alter table public.subscriptions enable row level security;
alter table public.tenant_feature_flags enable row level security;
alter table public.tenant_branding enable row level security;
alter table public.demo_leads enable row level security;
alter table public.contact_requests enable row level security;
alter table public.role_templates enable row level security;
alter table public.role_template_permissions enable row level security;

-- plans / plan_entitlements: readable catalog for any authenticated user
-- (tenant admins need to see what they can upgrade to); only platform admins
-- manage them.
create policy "plans_select_authenticated"
  on public.plans for select
  using (auth.uid() is not null);

create policy "plans_manage_platform_admin"
  on public.plans for all
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

create policy "plan_entitlements_select_authenticated"
  on public.plan_entitlements for select
  using (auth.uid() is not null);

create policy "plan_entitlements_manage_platform_admin"
  on public.plan_entitlements for all
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- subscriptions: visible to org members; only platform admins manage (assign
-- plans) since pricing/entitlements are a platform-controlled decision.
create policy "subscriptions_select_member"
  on public.subscriptions for select
  using (public.is_org_member(auth.uid(), organization_id));

create policy "subscriptions_manage_platform_admin"
  on public.subscriptions for all
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- tenant_feature_flags: visible to org members; managed by platform admins
-- (spec: "enable approved feature flags" is a platform capability).
create policy "tenant_feature_flags_select_member"
  on public.tenant_feature_flags for select
  using (public.is_org_member(auth.uid(), organization_id));

create policy "tenant_feature_flags_manage_platform_admin"
  on public.tenant_feature_flags for all
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- tenant_branding: visible to org members; managed by tenant admins.
create policy "tenant_branding_select_member"
  on public.tenant_branding for select
  using (public.is_org_member(auth.uid(), organization_id));

create policy "tenant_branding_manage"
  on public.tenant_branding for all
  using (public.has_permission(auth.uid(), organization_id, 'tenant.settings.manage'))
  with check (public.has_permission(auth.uid(), organization_id, 'tenant.settings.manage'));

-- demo_leads / contact_requests: platform admins only. No anon/public policy
-- exists at all -- inserts happen exclusively through a server route using
-- the service-role client, after validation and rate limiting (Phase 8).
create policy "demo_leads_select_platform_admin"
  on public.demo_leads for select
  using (public.is_platform_admin(auth.uid()));

create policy "demo_leads_update_platform_admin"
  on public.demo_leads for update
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

create policy "contact_requests_select_platform_admin"
  on public.contact_requests for select
  using (public.is_platform_admin(auth.uid()));

create policy "contact_requests_update_platform_admin"
  on public.contact_requests for update
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

-- role_templates / role_template_permissions: readable catalog, platform-admin managed.
create policy "role_templates_select_authenticated"
  on public.role_templates for select
  using (auth.uid() is not null);

create policy "role_templates_manage_platform_admin"
  on public.role_templates for all
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));

create policy "role_template_permissions_select_authenticated"
  on public.role_template_permissions for select
  using (auth.uid() is not null);

create policy "role_template_permissions_manage_platform_admin"
  on public.role_template_permissions for all
  using (public.is_platform_admin(auth.uid()))
  with check (public.is_platform_admin(auth.uid()));
