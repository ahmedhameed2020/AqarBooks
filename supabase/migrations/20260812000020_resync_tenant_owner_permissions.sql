-- 20260812000005 gave TENANT_OWNER every non-platform permission that
-- existed AT THAT TIME (a one-time snapshot: "insert ... select key from
-- permissions where key not like 'platform.%'"). It was never meant to be
-- a standing rule -- any permission key created afterwards (finance.
-- payments.void in 20260812000014, finance.expenses.read in
-- 20260812000019, and presumably more later) was never added to
-- TENANT_OWNER's template, so the org owner silently lost access to every
-- feature gated by a permission introduced after that date. Confirmed live:
-- a real TENANT_OWNER account was missing finance.expenses.read and got
-- redirected out of /finance/expenses.
--
-- Fix: re-run the exact same snapshot logic (idempotent via ON CONFLICT),
-- catching up TENANT_OWNER's template to every permission that exists
-- today, then backfill role_permissions for every already-cloned per-org
-- TENANT_OWNER role from the now-current template. This is the same
-- two-part pattern as 20260812000005/20260812000011 -- if a *future*
-- permission is added, it will need this same catch-up again, since
-- there's no trigger auto-syncing the template on every permissions insert.

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
  and r.key = 'TENANT_OWNER'
on conflict do nothing;
