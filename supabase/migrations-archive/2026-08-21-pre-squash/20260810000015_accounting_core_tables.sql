-- Phase 3: accounting core schema -- document sequences, cost centers,
-- projects, chart of accounts, fiscal years/periods, the journal engine.

create table public.document_sequences (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid references public.resorts (id) on delete cascade,
  sequence_type text not null,
  next_value bigint not null default 1,
  unique (organization_id, resort_id, sequence_type)
);

-- Concurrency-safe: locks the row for the duration of the caller's
-- transaction so two simultaneous postings can never receive the same
-- number (spec §13 rule 13, §17 "receipt numbering is concurrency-safe").
create or replace function public.next_sequence_value(
  p_organization_id uuid,
  p_resort_id uuid,
  p_sequence_type text
)
returns bigint
language plpgsql
security definer
set search_path = public
as $$
declare
  v_value bigint;
begin
  insert into public.document_sequences (organization_id, resort_id, sequence_type, next_value)
  values (p_organization_id, p_resort_id, p_sequence_type, 1)
  on conflict (organization_id, resort_id, sequence_type) do nothing;

  update public.document_sequences
  set next_value = next_value + 1
  where organization_id = p_organization_id
    and (resort_id = p_resort_id or (resort_id is null and p_resort_id is null))
    and sequence_type = p_sequence_type
  returning next_value - 1 into v_value;

  return v_value;
end;
$$;

create table public.cost_centers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid references public.resorts (id) on delete cascade,
  code text not null,
  name_ar text not null,
  name_en text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid references public.resorts (id) on delete cascade,
  code text not null,
  name_ar text not null,
  name_en text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, code)
);

create table public.chart_of_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid references public.resorts (id) on delete cascade,
  code text not null,
  name_ar text not null,
  name_en text not null,
  parent_id uuid references public.chart_of_accounts (id),
  category text not null check (category in ('ASSET', 'LIABILITY', 'EQUITY', 'REVENUE', 'EXPENSE')),
  normal_balance text not null check (normal_balance in ('DEBIT', 'CREDIT')),
  is_group boolean not null default false,
  requires_cost_center boolean not null default false,
  is_active boolean not null default true,
  is_used boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, code)
);

create index idx_chart_of_accounts_org on public.chart_of_accounts (organization_id);
create index idx_chart_of_accounts_parent on public.chart_of_accounts (parent_id);

create trigger trg_chart_of_accounts_updated_at
  before update on public.chart_of_accounts
  for each row execute function public.set_updated_at();

-- No hierarchy loops: a parent can't be its own descendant.
create or replace function public.check_coa_no_loop()
returns trigger
language plpgsql
as $$
declare
  v_ancestor uuid;
begin
  if new.parent_id is null then
    return new;
  end if;
  v_ancestor := new.parent_id;
  while v_ancestor is not null loop
    if v_ancestor = new.id then
      raise exception 'chart_of_accounts hierarchy loop detected';
    end if;
    select parent_id into v_ancestor from public.chart_of_accounts where id = v_ancestor;
  end loop;
  return new;
end;
$$;

create trigger trg_coa_no_loop
  before insert or update of parent_id on public.chart_of_accounts
  for each row execute function public.check_coa_no_loop();

-- Once an account has been referenced by any journal line, its category and
-- posting/group status become immutable (spec §11: "account category changes
-- are restricted after use"). Deletion of a used account is blocked entirely.
create or replace function public.lock_coa_after_use()
returns trigger
language plpgsql
as $$
begin
  if old.is_used then
    if new.category is distinct from old.category or new.is_group is distinct from old.is_group then
      raise exception 'cannot change category or group status of an account already used in postings';
    end if;
  end if;
  return new;
end;
$$;

create trigger trg_coa_lock_after_use
  before update on public.chart_of_accounts
  for each row execute function public.lock_coa_after_use();

create or replace function public.prevent_delete_used_coa()
returns trigger
language plpgsql
as $$
begin
  if old.is_used then
    raise exception 'cannot delete an account already used in postings';
  end if;
  return old;
end;
$$;

create trigger trg_coa_prevent_delete_used
  before delete on public.chart_of_accounts
  for each row execute function public.prevent_delete_used_coa();

create table public.fiscal_years (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'PLANNED' check (status in ('PLANNED', 'OPEN', 'CLOSED', 'LOCKED')),
  created_at timestamptz not null default now(),
  check (end_date > start_date)
);

create index idx_fiscal_years_org on public.fiscal_years (organization_id);

create table public.fiscal_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  fiscal_year_id uuid not null references public.fiscal_years (id) on delete cascade,
  period_number int not null,
  name text not null,
  start_date date not null,
  end_date date not null,
  status text not null default 'PLANNED' check (status in ('PLANNED', 'OPEN', 'CLOSED', 'LOCKED')),
  created_at timestamptz not null default now(),
  unique (fiscal_year_id, period_number),
  check (end_date > start_date)
);

create index idx_fiscal_periods_org on public.fiscal_periods (organization_id);
create index idx_fiscal_periods_year on public.fiscal_periods (fiscal_year_id);
