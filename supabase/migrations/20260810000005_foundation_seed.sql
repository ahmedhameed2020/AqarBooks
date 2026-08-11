-- Foundation seed: permission catalog + system-level roles.
-- Tenant-level roles (TENANT_OWNER, FINANCE_MANAGER, ...) are cloned per
-- organization at org-creation time (Phase 2), not seeded globally here,
-- since role_permissions grants may be customized per tenant.

insert into public.permissions (key, description) values
  ('platform.organizations.manage', 'Create, suspend, reactivate organizations'),
  ('platform.subscriptions.manage', 'Assign plans and manage entitlements'),
  ('platform.audit.view', 'View platform-wide audit logs'),
  ('tenant.settings.manage', 'Manage organization profile, resorts, branding, financial settings'),
  ('tenant.users.manage', 'Manage organization users, invitations, memberships'),
  ('tenant.roles.manage', 'Manage organization roles and permission grants'),
  ('property.units.view', 'View property units'),
  ('property.units.manage', 'Manage property units'),
  ('property.members.view', 'View owners/members'),
  ('property.members.manage', 'Manage owners/members'),
  ('finance.accounts.view', 'View chart of accounts'),
  ('finance.accounts.manage', 'Manage chart of accounts'),
  ('finance.entries.create', 'Create journal entries'),
  ('finance.entries.review', 'Review journal entries'),
  ('finance.entries.post', 'Post journal entries'),
  ('finance.entries.reverse', 'Reverse posted journal entries'),
  ('finance.periods.manage', 'Manage fiscal years and periods'),
  ('finance.reports.view', 'View financial reports'),
  ('finance.reports.export', 'Export financial reports'),
  ('receivables.dues.create', 'Create dues'),
  ('receivables.payments.create', 'Create payments'),
  ('receivables.allocations.manage', 'Manage payment allocations'),
  ('cashier.sessions.open', 'Open cashier sessions'),
  ('cashier.sessions.close', 'Close cashier sessions'),
  ('cashier.transactions.create', 'Create cashier transactions'),
  ('cashier.reconciliations.approve', 'Approve cashier reconciliations'),
  ('banking.accounts.view', 'View bank accounts'),
  ('banking.cheques.manage', 'Manage cheques'),
  ('banking.reconciliations.manage', 'Manage bank reconciliations'),
  ('inventory.items.manage', 'Manage inventory items'),
  ('inventory.transactions.create', 'Create inventory transactions'),
  ('inventory.adjustments.approve', 'Approve inventory adjustments'),
  ('purchasing.requests.create', 'Create purchase requests'),
  ('purchasing.orders.approve', 'Approve purchase orders');

-- System-level role: platform super admin. organization_id null marks it as
-- a platform role rather than a tenant-owned one (see is_platform_admin()).
insert into public.roles (organization_id, key, name_ar, name_en, is_system)
values (null, 'PLATFORM_SUPER_ADMIN', 'مدير المنصة العام', 'Platform Super Admin', true);

-- Platform Super Admin implicitly bypasses all checks via is_platform_admin()
-- and has_permission(); it is not granted explicit role_permissions rows
-- because its authority is platform-wide by definition, not permission-scoped.
