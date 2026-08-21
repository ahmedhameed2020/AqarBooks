-- Phase 2 seed: plans + entitlements, tenant role templates + grants.
-- No prices are seeded anywhere (spec: do not invent prices).

insert into public.plans (key, name_ar, name_en, sort_order) values
  ('STARTER', 'الأساسية', 'Starter', 1),
  ('PROFESSIONAL', 'الاحترافية', 'Professional', 2),
  ('ENTERPRISE', 'المؤسسية', 'Enterprise', 3);

-- Entitlement numeric limits use -1 to mean "unlimited" by convention.
insert into public.plan_entitlements (plan_id, key, value)
select p.id, e.key, e.value
from public.plans p
cross join lateral (
  values
    ('max_resorts', case p.key when 'STARTER' then '1' when 'PROFESSIONAL' then '3' else '-1' end::jsonb),
    ('max_users', case p.key when 'STARTER' then '5' when 'PROFESSIONAL' then '25' else '-1' end::jsonb),
    ('max_units', case p.key when 'STARTER' then '100' when 'PROFESSIONAL' then '1000' else '-1' end::jsonb),
    ('finance_module', 'true'::jsonb),
    ('cashier_module', 'true'::jsonb),
    ('banking_module', case p.key when 'STARTER' then 'false' else 'true' end::jsonb),
    ('fixed_assets_module', case p.key when 'STARTER' then 'false' else 'true' end::jsonb),
    ('inventory_module', case p.key when 'STARTER' then 'false' else 'true' end::jsonb),
    ('purchasing_module', case p.key when 'ENTERPRISE' then 'true' else 'false' end::jsonb),
    ('advanced_reports', case p.key when 'STARTER' then 'false' else 'true' end::jsonb),
    ('white_label', case p.key when 'ENTERPRISE' then 'true' else 'false' end::jsonb),
    ('api_access', case p.key when 'ENTERPRISE' then 'true' else 'false' end::jsonb),
    ('audit_retention_days', case p.key when 'STARTER' then '30' when 'PROFESSIONAL' then '180' else '365' end::jsonb),
    ('priority_support', case p.key when 'ENTERPRISE' then 'true' else 'false' end::jsonb)
) as e(key, value);

-- Tenant role templates (spec §8), excluding PLATFORM_SUPER_ADMIN which is
-- platform-level and seeded separately in the foundation migration.
insert into public.role_templates (key, name_ar, name_en, sort_order) values
  ('TENANT_OWNER', 'مالك المنظمة', 'Tenant Owner', 1),
  ('TENANT_ADMIN', 'مدير النظام', 'Tenant Admin', 2),
  ('GENERAL_MANAGER', 'المدير العام', 'General Manager', 3),
  ('FINANCE_MANAGER', 'المدير المالي', 'Finance Manager', 4),
  ('ACCOUNTANT', 'محاسب', 'Accountant', 5),
  ('CASHIER', 'أمين خزينة', 'Cashier', 6),
  ('COLLECTOR', 'محصّل', 'Collector', 7),
  ('AUDITOR', 'مراجع', 'Auditor', 8),
  ('PROPERTY_MANAGER', 'مدير أملاك', 'Property Manager', 9),
  ('STOREKEEPER', 'أمين مخزن', 'Storekeeper', 10),
  ('PURCHASING_MANAGER', 'مدير مشتريات', 'Purchasing Manager', 11),
  ('VIEWER', 'مشاهد', 'Viewer', 12);

-- TENANT_OWNER: everything except platform.* permissions.
insert into public.role_template_permissions (role_template_key, permission_key)
select 'TENANT_OWNER', key from public.permissions where key not like 'platform.%';

insert into public.role_template_permissions (role_template_key, permission_key) values
  ('TENANT_ADMIN', 'tenant.settings.manage'),
  ('TENANT_ADMIN', 'tenant.users.manage'),
  ('TENANT_ADMIN', 'tenant.roles.manage'),
  ('TENANT_ADMIN', 'property.units.view'),
  ('TENANT_ADMIN', 'property.members.view'),
  ('TENANT_ADMIN', 'finance.reports.view'),

  ('GENERAL_MANAGER', 'property.units.view'),
  ('GENERAL_MANAGER', 'property.members.view'),
  ('GENERAL_MANAGER', 'finance.reports.view'),
  ('GENERAL_MANAGER', 'finance.reports.export'),
  ('GENERAL_MANAGER', 'receivables.dues.create'),
  ('GENERAL_MANAGER', 'receivables.payments.create'),
  ('GENERAL_MANAGER', 'cashier.reconciliations.approve'),
  ('GENERAL_MANAGER', 'banking.accounts.view'),
  ('GENERAL_MANAGER', 'inventory.adjustments.approve'),
  ('GENERAL_MANAGER', 'purchasing.orders.approve'),

  ('FINANCE_MANAGER', 'finance.accounts.view'),
  ('FINANCE_MANAGER', 'finance.accounts.manage'),
  ('FINANCE_MANAGER', 'finance.entries.create'),
  ('FINANCE_MANAGER', 'finance.entries.review'),
  ('FINANCE_MANAGER', 'finance.entries.post'),
  ('FINANCE_MANAGER', 'finance.entries.reverse'),
  ('FINANCE_MANAGER', 'finance.periods.manage'),
  ('FINANCE_MANAGER', 'finance.reports.view'),
  ('FINANCE_MANAGER', 'finance.reports.export'),
  ('FINANCE_MANAGER', 'receivables.dues.create'),
  ('FINANCE_MANAGER', 'receivables.payments.create'),
  ('FINANCE_MANAGER', 'receivables.allocations.manage'),
  ('FINANCE_MANAGER', 'banking.accounts.view'),
  ('FINANCE_MANAGER', 'banking.cheques.manage'),
  ('FINANCE_MANAGER', 'banking.reconciliations.manage'),
  ('FINANCE_MANAGER', 'cashier.reconciliations.approve'),

  ('ACCOUNTANT', 'finance.accounts.view'),
  ('ACCOUNTANT', 'finance.entries.create'),
  ('ACCOUNTANT', 'finance.entries.review'),
  ('ACCOUNTANT', 'finance.reports.view'),
  ('ACCOUNTANT', 'receivables.dues.create'),
  ('ACCOUNTANT', 'receivables.payments.create'),
  ('ACCOUNTANT', 'receivables.allocations.manage'),

  ('CASHIER', 'cashier.sessions.open'),
  ('CASHIER', 'cashier.sessions.close'),
  ('CASHIER', 'cashier.transactions.create'),
  ('CASHIER', 'receivables.payments.create'),

  ('COLLECTOR', 'property.units.view'),
  ('COLLECTOR', 'property.members.view'),
  ('COLLECTOR', 'receivables.payments.create'),

  ('AUDITOR', 'finance.accounts.view'),
  ('AUDITOR', 'finance.reports.view'),
  ('AUDITOR', 'finance.reports.export'),
  ('AUDITOR', 'property.units.view'),
  ('AUDITOR', 'property.members.view'),
  ('AUDITOR', 'banking.accounts.view'),

  ('PROPERTY_MANAGER', 'property.units.view'),
  ('PROPERTY_MANAGER', 'property.units.manage'),
  ('PROPERTY_MANAGER', 'property.members.view'),
  ('PROPERTY_MANAGER', 'property.members.manage'),

  ('STOREKEEPER', 'inventory.items.manage'),
  ('STOREKEEPER', 'inventory.transactions.create'),

  ('PURCHASING_MANAGER', 'purchasing.requests.create'),
  ('PURCHASING_MANAGER', 'purchasing.orders.approve'),

  ('VIEWER', 'finance.reports.view'),
  ('VIEWER', 'property.units.view'),
  ('VIEWER', 'property.members.view');
