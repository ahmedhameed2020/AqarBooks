-- Real budgeting module, replacing the fabricated "budget = actual * 1.1"
-- placeholder that previously shipped on /finance/reports/budget-vs-actual
-- (that page invented target figures instead of reading an approved
-- budget -- there was no budgets table at all until this migration).
--
-- Granularity: one budget line per (organization, fiscal_period, account),
-- matching the report's existing per-period selector. Not resort-scoped --
-- the report never actually filtered by resort either, so this doesn't
-- remove real capability.

create table public.budgets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  fiscal_period_id uuid not null references public.fiscal_periods (id) on delete cascade,
  account_id uuid not null references public.chart_of_accounts (id),
  amount numeric(19, 4) not null default 0 check (amount >= 0),
  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, fiscal_period_id, account_id)
);

create index idx_budgets_org_period on public.budgets (organization_id, fiscal_period_id);

create trigger trg_budgets_updated_at
  before update on public.budgets
  for each row execute function public.set_updated_at();

alter table public.budgets enable row level security;

create policy "budgets_select_member"
  on public.budgets for select
  using (public.is_org_member(auth.uid(), organization_id));

create policy "budgets_manage"
  on public.budgets for all
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.budgets.manage')
    and public.organization_is_active(organization_id)
  )
  with check (
    public.has_permission(auth.uid(), organization_id, 'finance.budgets.manage')
    and public.organization_is_active(organization_id)
  );

insert into public.permissions (key, description) values
  ('finance.budgets.manage', 'إدارة الميزانيات التقديرية للحسابات لكل فترة مالية')
on conflict do nothing;

-- Same two-part pattern as every other permission backfill in this schema
-- (see 20260812000005/20260812000011): attach to templates so orgs created
-- from now on clone correctly, then backfill role_permissions for every
-- already-cloned per-organization role.
insert into public.role_template_permissions (role_template_key, permission_key)
values
  ('TENANT_OWNER', 'finance.budgets.manage'),
  ('FINANCE_MANAGER', 'finance.budgets.manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.role_template_permissions rtp on rtp.role_template_key = r.key
join public.permissions p on p.key = rtp.permission_key
where r.organization_id is not null
  and rtp.permission_key = 'finance.budgets.manage'
on conflict do nothing;
