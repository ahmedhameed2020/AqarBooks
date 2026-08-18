-- Service charges / Common Area Maintenance (CAM), part 1 of 2: schema.
--
-- The feature that separates a real-estate accounting system from general
-- accounting: recovering a period's common-area running cost from the units
-- that benefit from it, split on a defensible basis.
--
-- A levy is budget-first, not rate-first. The operator knows the total they
-- must recover (the maintenance budget for the period) and needs it divided;
-- they do not know a per-metre rate in advance. That direction of causation is
-- why total_amount is the input and every unit's share is derived -- and why
-- the derived shares must sum back to exactly the total, which is the whole
-- problem part 2 solves.

create table public.service_charge_levies (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  name text not null,
  period_start date not null,
  period_end date not null,
  -- The amount to recover across the property, in full.
  total_amount numeric(19, 4) not null check (total_amount > 0),
  allocation_basis text not null
    check (allocation_basis in ('AREA', 'EQUAL', 'CUSTOM')),
  due_type_id uuid not null references public.due_types (id),
  receivable_account_id uuid not null references public.chart_of_accounts (id),
  issue_date date not null,
  due_date date not null,
  status text not null default 'DRAFT'
    check (status in ('DRAFT', 'ISSUED', 'CANCELLED')),
  issued_at timestamptz,
  issued_by uuid references auth.users (id),
  note text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint service_charge_levies_period_order check (period_end >= period_start),
  constraint service_charge_levies_due_order check (due_date >= issue_date)
);

create index idx_service_charge_levies_org
  on public.service_charge_levies (organization_id, status);

create trigger trg_service_charge_levies_updated_at
  before update on public.service_charge_levies
  for each row execute function public.set_updated_at();

create table public.service_charge_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  levy_id uuid not null references public.service_charge_levies (id) on delete cascade,
  unit_id uuid not null references public.units (id) on delete cascade,
  -- The weight this unit carries under the levy's basis: its area under AREA,
  -- 1 under EQUAL, an operator-entered figure under CUSTOM. Kept as a column
  -- rather than re-read from units at issue time so a levy stays reproducible
  -- after a unit is re-measured.
  basis_value numeric(14, 4) not null check (basis_value >= 0),
  -- Derived. Sums to the levy total exactly -- see part 2.
  share_amount numeric(19, 4) not null default 0 check (share_amount >= 0),
  due_id uuid references public.dues (id) on delete set null,
  created_at timestamptz not null default now(),
  unique (levy_id, unit_id),
  -- One levy can bill a unit once. Prevents a re-issue from double-charging.
  unique (due_id)
);

create index idx_service_charge_allocations_levy
  on public.service_charge_allocations (levy_id);

alter table public.service_charge_levies enable row level security;
alter table public.service_charge_allocations enable row level security;

insert into public.permissions (key, description) values
  ('finance.service_charges.read', 'الاطلاع على تحصيلات رسوم الخدمة وتوزيعها على الوحدات'),
  ('finance.service_charges.manage', 'إنشاء تحصيلات رسوم الخدمة وحساب التوزيع وإصدارها على الوحدات')
on conflict do nothing;

create policy "service_charge_levies_select"
  on public.service_charge_levies for select
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.service_charges.read')
    or public.has_permission(auth.uid(), organization_id, 'finance.service_charges.manage')
  );

-- Only DRAFT levies are writable from the client. An ISSUED levy has already
-- produced dues and their ledger entries, so editing its total or basis would
-- silently desynchronise the allocation table from what was actually billed.
create policy "service_charge_levies_manage"
  on public.service_charge_levies for all
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.service_charges.manage')
    and public.organization_is_active(organization_id)
    and status = 'DRAFT'
  )
  with check (
    public.has_permission(auth.uid(), organization_id, 'finance.service_charges.manage')
    and public.organization_is_active(organization_id)
  );

create policy "service_charge_allocations_select"
  on public.service_charge_allocations for select
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.service_charges.read')
    or public.has_permission(auth.uid(), organization_id, 'finance.service_charges.manage')
  );

create policy "service_charge_allocations_manage"
  on public.service_charge_allocations for all
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.service_charges.manage')
    and public.organization_is_active(organization_id)
    and exists (
      select 1 from public.service_charge_levies l
      where l.id = levy_id and l.status = 'DRAFT'
    )
  )
  with check (
    public.has_permission(auth.uid(), organization_id, 'finance.service_charges.manage')
    and public.organization_is_active(organization_id)
    and exists (
      select 1 from public.service_charge_levies l
      where l.id = levy_id and l.status = 'DRAFT'
    )
  );

insert into public.role_template_permissions (role_template_key, permission_key)
values
  ('TENANT_OWNER', 'finance.service_charges.read'),
  ('TENANT_OWNER', 'finance.service_charges.manage'),
  ('FINANCE_MANAGER', 'finance.service_charges.read'),
  ('FINANCE_MANAGER', 'finance.service_charges.manage'),
  ('ACCOUNTANT', 'finance.service_charges.read'),
  ('ACCOUNTANT', 'finance.service_charges.manage'),
  ('PROPERTY_MANAGER', 'finance.service_charges.read'),
  ('AUDITOR', 'finance.service_charges.read')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.role_template_permissions rtp on rtp.role_template_key = r.key
join public.permissions p on p.key = rtp.permission_key
where r.organization_id is not null
  and rtp.permission_key in ('finance.service_charges.read', 'finance.service_charges.manage')
on conflict do nothing;
