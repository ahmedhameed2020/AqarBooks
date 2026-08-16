-- Root cause of the persistent FORBIDDEN_FINANCE_PERMISSION error (deeper
-- than the earlier EXECUTE grant fix):
--
-- 20260810000012_phase2_seed.sql seeded role_template_permissions for
-- TENANT_OWNER with a one-time snapshot:
--   insert into role_template_permissions select 'TENANT_OWNER', key
--   from permissions where key not like 'platform.%'
-- That ran before 20260811000005_phase11_financial_rbac.sql existed, so none
-- of the finance.* permission keys it later added (finance.reports.read,
-- finance.payments.read, ...) were ever attached to the TENANT_OWNER
-- template. That later migration tried to backfill finance permissions onto
-- roles keyed 'ORG_OWNER'/'ORG_ADMIN'/etc with organization_id IS NULL, but
-- no such global system roles exist -- every tenant's actual owner role is a
-- per-organization clone of the TENANT_OWNER *template* (see
-- clone_tenant_role_templates in 20260810000010_role_templates.sql). So the
-- backfill silently affected zero rows, and no organization's owner role
-- (old or new) has ever had any finance.* permission.
--
-- Fix in two parts:
--   1. Add the missing finance.* keys (and anything else added since the
--      original snapshot) to the TENANT_OWNER template, so orgs created from
--      now on clone correctly.
--   2. Backfill role_permissions for every already-cloned per-org role from
--      its template, so organizations created before this fix (including
--      existing ones) catch up without needing to be recreated.

insert into public.role_template_permissions (role_template_key, permission_key)
select 'TENANT_OWNER', key
from public.permissions
where key not like 'platform.%'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.role_template_permissions rtp on rtp.role_template_key = r.key
join public.permissions p on p.key = rtp.permission_key
where r.organization_id is not null
on conflict do nothing;
