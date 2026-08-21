-- property.leases.view / property.leases.manage -- matches the
-- property.units.*/property.members.* convention (not a finance.* domain,
-- which doesn't exist elsewhere in this schema). See
-- docs/superpowers/plans/2026-08-17-unit-rental-occupancy-implementation-plan.md
-- Phase 2 for the full permission matrix and rationale.
insert into public.permissions (key, description)
values
  ('property.leases.view', 'عرض عقود الإيجار والإشغال'),
  ('property.leases.manage', 'إدارة عقود الإيجار والإشغال (إنشاء، تفعيل، إنهاء)')
on conflict (key) do update set description = excluded.description;

insert into public.role_template_permissions (role_template_key, permission_key)
values
  ('TENANT_OWNER', 'property.leases.view'),
  ('TENANT_OWNER', 'property.leases.manage'),
  ('TENANT_ADMIN', 'property.leases.view'),
  ('GENERAL_MANAGER', 'property.leases.view'),
  ('PROPERTY_MANAGER', 'property.leases.view'),
  ('PROPERTY_MANAGER', 'property.leases.manage'),
  ('FINANCE_MANAGER', 'property.leases.view'),
  ('ACCOUNTANT', 'property.leases.view'),
  ('COLLECTOR', 'property.leases.view'),
  ('AUDITOR', 'property.leases.view'),
  ('VIEWER', 'property.leases.view')
on conflict do nothing;

-- Retroactive grant for organizations whose roles were already cloned
-- before this migration -- clone_tenant_role_templates() only reads
-- role_template_permissions at clone time, so existing tenants need this
-- explicit backfill (same pattern as 20260814000003_members_portal_invite_permission.sql).
insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.role_template_permissions rtp on rtp.role_template_key = r.key
join public.permissions p on p.key = rtp.permission_key
where r.organization_id is not null
  and rtp.permission_key in ('property.leases.view', 'property.leases.manage')
on conflict do nothing;
