-- Fixes a pre-existing gap discovered while auditing /finance/payments:
-- every finance.* permission key introduced by
-- 20260811000005_phase11_financial_rbac.sql was granted to role rows keyed
-- 'ORG_OWNER' / 'ORG_ADMIN' / 'FINANCE_MANAGER' / 'CHIEF_ACCOUNTANT' /
-- 'CASHIER' with organization_id IS NULL -- but no such rows exist. Real
-- roles are per-organization clones of role TEMPLATES seeded in
-- 20260810000012_phase2_seed.sql under different keys (TENANT_OWNER,
-- TENANT_ADMIN, FINANCE_MANAGER, ACCOUNTANT, CASHIER, COLLECTOR, AUDITOR,
-- PROPERTY_MANAGER, ...). That grant loop therefore affected zero rows.
-- 20260812000005 already fixed this for TENANT_OWNER specifically (granting
-- it every non-platform permission). This migration does the equivalent for
-- every other role template that plausibly needs finance.* visibility,
-- since without it these roles can't read dues/schedules/payments at all
-- (RLS now requires the matching finance.* permission -- see
-- 20260812000009) and can't call issue_dues/generate_recurring_dues/
-- void_due/record_payment (they check the same keys).
--
-- Mapping below is deliberately conservative: it restores what each role's
-- *original* (pre-phase11) grant list already implied it should be able to
-- do, translated to the new finance.* keys, rather than guessing a broader
-- set. TENANT_ADMIN in particular only gets read-level finance access here
-- (matching its old finance.reports.view-only footprint) even though the
-- dead phase11 script's comment suggests "admin gets everything" -- that's
-- a real permission expansion, not a regression fix, so it's left for a
-- deliberate follow-up decision rather than bundled into this backfill.
--
-- Same two-part pattern as 20260812000005: (1) add to role_template_permissions
-- so organizations created from now on clone correctly, (2) backfill
-- role_permissions for every already-cloned per-organization role.

insert into public.role_template_permissions (role_template_key, permission_key)
values
  -- TENANT_ADMIN: read-only across finance (was finance.reports.view only)
  ('TENANT_ADMIN', 'finance.reports.read'),
  ('TENANT_ADMIN', 'finance.dues.read'),
  ('TENANT_ADMIN', 'finance.schedules.read'),
  ('TENANT_ADMIN', 'finance.payments.read'),
  ('TENANT_ADMIN', 'finance.audit.read'),

  -- GENERAL_MANAGER: mirrors its old receivables.dues.create /
  -- receivables.payments.create / finance.reports.* grants
  ('GENERAL_MANAGER', 'finance.reports.read'),
  ('GENERAL_MANAGER', 'finance.reports.export'),
  ('GENERAL_MANAGER', 'finance.dues.read'),
  ('GENERAL_MANAGER', 'finance.dues.issue'),
  ('GENERAL_MANAGER', 'finance.payments.read'),
  ('GENERAL_MANAGER', 'finance.payments.create'),
  ('GENERAL_MANAGER', 'finance.schedules.read'),

  -- FINANCE_MANAGER: broadest operational finance role, matches its own
  -- old grants (accounts.manage, entries.*, periods.manage, reports.*,
  -- receivables.*, banking.*) -- everything except audit.verify
  ('FINANCE_MANAGER', 'finance.payments.read'),
  ('FINANCE_MANAGER', 'finance.payments.create'),
  ('FINANCE_MANAGER', 'finance.dues.read'),
  ('FINANCE_MANAGER', 'finance.dues.issue'),
  ('FINANCE_MANAGER', 'finance.schedules.read'),
  ('FINANCE_MANAGER', 'finance.schedules.manage'),
  ('FINANCE_MANAGER', 'finance.schedules.generate'),
  ('FINANCE_MANAGER', 'finance.reports.read'),
  ('FINANCE_MANAGER', 'finance.audit.read'),

  -- ACCOUNTANT: mirrors its old finance.entries.create/review +
  -- receivables.dues.create/payments.create/allocations.manage grants --
  -- no entries.post/reverse, no schedules.manage, no audit.* (narrower
  -- than FINANCE_MANAGER, matching its old narrower footprint)
  ('ACCOUNTANT', 'finance.reports.read'),
  ('ACCOUNTANT', 'finance.dues.read'),
  ('ACCOUNTANT', 'finance.dues.issue'),
  ('ACCOUNTANT', 'finance.payments.read'),
  ('ACCOUNTANT', 'finance.payments.create'),
  ('ACCOUNTANT', 'finance.schedules.read'),

  -- CASHIER: exactly what 20260811000005 already intended for this role
  -- key (it just never reached a real row)
  ('CASHIER', 'finance.payments.read'),
  ('CASHIER', 'finance.payments.create'),
  ('CASHIER', 'finance.dues.read'),
  ('CASHIER', 'finance.schedules.read'),
  ('CASHIER', 'finance.reports.read'),

  -- COLLECTOR: old grant was just receivables.payments.create -- needs to
  -- see what's owed (dues.read) to collect against it
  ('COLLECTOR', 'finance.dues.read'),
  ('COLLECTOR', 'finance.payments.read'),
  ('COLLECTOR', 'finance.payments.create'),

  -- AUDITOR: read-only everywhere financial, plus the audit-specific keys
  -- that exist specifically for this role's job
  ('AUDITOR', 'finance.reports.read'),
  ('AUDITOR', 'finance.dues.read'),
  ('AUDITOR', 'finance.schedules.read'),
  ('AUDITOR', 'finance.payments.read'),
  ('AUDITOR', 'finance.audit.read'),
  ('AUDITOR', 'finance.audit.verify'),

  -- PROPERTY_MANAGER: had zero finance.* permissions before, but
  -- units_with_financials / members_with_financials (security_invoker
  -- views this role's pages depend on) need finance.dues.read /
  -- finance.payments.read to compute non-zero balances -- read-only,
  -- matching that this role never had transactional finance rights
  ('PROPERTY_MANAGER', 'finance.dues.read'),
  ('PROPERTY_MANAGER', 'finance.schedules.read'),
  ('PROPERTY_MANAGER', 'finance.payments.read'),

  -- VIEWER: read-only, matches its old finance.reports.view-only grant
  ('VIEWER', 'finance.reports.read'),
  ('VIEWER', 'finance.dues.read'),
  ('VIEWER', 'finance.schedules.read'),
  ('VIEWER', 'finance.payments.read')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.role_template_permissions rtp on rtp.role_template_key = r.key
join public.permissions p on p.key = rtp.permission_key
where r.organization_id is not null
on conflict do nothing;
