-- Phase 6: suppliers, expense categories, and the purchasing workflow
-- (Purchase Request -> Approval -> Purchase Order -> Receipt). No automatic
-- purchase commitments without approval (spec §20): a purchase_order only
-- becomes real once explicitly APPROVED, never auto-created from a
-- submitted request.

create table public.suppliers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  contact_email text,
  contact_phone text,
  payable_account_id uuid not null references public.chart_of_accounts (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_suppliers_organization on public.suppliers (organization_id);

create table public.expense_categories (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name_ar text not null,
  name_en text not null,
  default_expense_account_id uuid not null references public.chart_of_accounts (id),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create index idx_expense_categories_organization on public.expense_categories (organization_id);

-- purchase_requests / purchase_orders get no client write policy -- every
-- status transition goes through the functions in the next migration, same
-- "functions are the only writer" pattern as every other workflow table.
create table public.purchase_requests (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid not null references public.resorts (id) on delete cascade,
  description text not null,
  estimated_amount numeric(19, 4) not null check (estimated_amount > 0),
  status text not null default 'SUBMITTED' check (status in ('SUBMITTED', 'APPROVED', 'REJECTED')),
  requested_by uuid references auth.users (id),
  approved_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create index idx_purchase_requests_organization on public.purchase_requests (organization_id, status);

create table public.purchase_orders (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid not null references public.resorts (id) on delete cascade,
  supplier_id uuid not null references public.suppliers (id),
  purchase_request_id uuid references public.purchase_requests (id),
  order_number bigint,
  description text not null,
  amount numeric(19, 4) not null check (amount > 0),
  order_date date not null,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'APPROVED', 'RECEIVED', 'CANCELLED')),
  created_by uuid references auth.users (id),
  approved_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

create unique index idx_purchase_orders_number
  on public.purchase_orders (organization_id, order_number) where order_number is not null;
create index idx_purchase_orders_organization on public.purchase_orders (organization_id, status);
