begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'work_orders_org_id_unique'
  ) then
    alter table public.work_orders
      add constraint work_orders_org_id_unique unique (organization_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'expenses_org_id_unique'
  ) then
    alter table public.expenses
      add constraint expenses_org_id_unique unique (organization_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'supplier_invoices_org_id_unique'
  ) then
    alter table public.supplier_invoices
      add constraint supplier_invoices_org_id_unique unique (organization_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'dues_org_id_unique'
  ) then
    alter table public.dues
      add constraint dues_org_id_unique unique (organization_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'expense_categories_org_id_unique'
  ) then
    alter table public.expense_categories
      add constraint expense_categories_org_id_unique unique (organization_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'due_types_org_id_unique'
  ) then
    alter table public.due_types
      add constraint due_types_org_id_unique unique (organization_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'chart_of_accounts_org_id_unique'
  ) then
    alter table public.chart_of_accounts
      add constraint chart_of_accounts_org_id_unique unique (organization_id, id);
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'fiscal_periods_org_id_unique'
  ) then
    alter table public.fiscal_periods
      add constraint fiscal_periods_org_id_unique unique (organization_id, id);
  end if;
end $$;

alter table public.dues drop constraint if exists dues_source_type_check;
alter table public.dues add constraint dues_source_type_check
  check (
    source_type = any (
      array[
        'LEASE_RENT'::text,
        'INSTALLMENT_PLAN'::text,
        'OPENING_BALANCE'::text,
        'MAINTENANCE_WORK_ORDER_COST'::text
      ]
    )
  );

create table if not exists public.work_order_costs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  work_order_id uuid not null,
  cost_type text not null,
  description text not null,
  quantity numeric(19, 4) not null,
  unit_cost numeric(19, 4) not null,
  total_cost numeric(19, 4) not null,
  currency text not null,
  supplier_id uuid null,
  source_reference text null,
  financial_status text not null default 'UNPOSTED',
  owner_charge_status text not null default 'NOT_CHARGED',
  expense_id uuid null,
  supplier_invoice_id uuid null,
  owner_due_id uuid null,
  created_by uuid not null references auth.users(id),
  updated_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  posted_at timestamptz null,
  owner_charged_at timestamptz null,
  voided_at timestamptz null,
  constraint work_order_costs_type_check check (cost_type in ('LABOR', 'SUPPLIER', 'MATERIAL', 'OTHER')),
  constraint work_order_costs_financial_status_check check (financial_status in ('UNPOSTED', 'POSTED_EXPENSE', 'POSTED_SUPPLIER_INVOICE', 'VOIDED')),
  constraint work_order_costs_owner_charge_status_check check (owner_charge_status in ('NOT_CHARGED', 'OWNER_CHARGED')),
  constraint work_order_costs_description_not_blank check (btrim(description) <> ''),
  constraint work_order_costs_quantity_positive check (quantity > 0),
  constraint work_order_costs_unit_cost_nonnegative check (unit_cost >= 0),
  constraint work_order_costs_total_matches check (total_cost = round(quantity * unit_cost, 4)),
  constraint work_order_costs_total_positive check (total_cost > 0),
  constraint work_order_costs_currency_check check (currency ~ '^[A-Z]{3}$'),
  constraint work_order_costs_supplier_required check ((cost_type = 'SUPPLIER') = (supplier_id is not null)),
  constraint work_order_costs_reference_length check (source_reference is null or char_length(source_reference) <= 160),
  constraint work_order_costs_description_length check (char_length(description) <= 1000),
  constraint work_order_costs_company_posting_exclusive check (num_nonnulls(expense_id, supplier_invoice_id) <= 1),
  constraint work_order_costs_expense_status_consistent check ((financial_status = 'POSTED_EXPENSE') = (expense_id is not null)),
  constraint work_order_costs_invoice_status_consistent check ((financial_status = 'POSTED_SUPPLIER_INVOICE') = (supplier_invoice_id is not null)),
  constraint work_order_costs_owner_charge_consistent check ((owner_charge_status = 'OWNER_CHARGED') = (owner_due_id is not null and owner_charged_at is not null)),
  constraint work_order_costs_posted_timestamp_consistent check ((financial_status in ('POSTED_EXPENSE', 'POSTED_SUPPLIER_INVOICE')) = (posted_at is not null)),
  constraint work_order_costs_voided_timestamp_consistent check ((financial_status = 'VOIDED') = (voided_at is not null)),
  constraint work_order_costs_org_work_order_fkey foreign key (organization_id, work_order_id)
    references public.work_orders (organization_id, id) on delete cascade,
  constraint work_order_costs_org_supplier_fkey foreign key (organization_id, supplier_id)
    references public.suppliers (organization_id, id),
  constraint work_order_costs_org_expense_fkey foreign key (organization_id, expense_id)
    references public.expenses (organization_id, id),
  constraint work_order_costs_org_supplier_invoice_fkey foreign key (organization_id, supplier_invoice_id)
    references public.supplier_invoices (organization_id, id),
  constraint work_order_costs_org_owner_due_fkey foreign key (organization_id, owner_due_id)
    references public.dues (organization_id, id)
);

create unique index if not exists work_order_costs_expense_once
  on public.work_order_costs (expense_id)
  where expense_id is not null;
create unique index if not exists work_order_costs_supplier_invoice_once
  on public.work_order_costs (supplier_invoice_id)
  where supplier_invoice_id is not null;
create unique index if not exists work_order_costs_owner_due_once
  on public.work_order_costs (owner_due_id)
  where owner_due_id is not null;
create unique index if not exists work_order_costs_source_reference_once
  on public.work_order_costs (organization_id, source_reference)
  where source_reference is not null;
create index if not exists idx_work_order_costs_order_created
  on public.work_order_costs (organization_id, work_order_id, created_at desc);
create index if not exists idx_work_order_costs_status
  on public.work_order_costs (organization_id, financial_status, created_at desc);
create index if not exists idx_work_order_costs_supplier
  on public.work_order_costs (organization_id, supplier_id)
  where supplier_id is not null;

comment on table public.work_order_costs is
  'Operational maintenance work-order cost evidence. Financial postings remain explicit links to canonical expenses, supplier invoices, and dues.';
comment on column public.work_order_costs.financial_status is
  'Company-side posting status only. Owner charging is tracked separately because internal cost and owner charge are not necessarily equal.';

create or replace function public.work_order_cost_staff_can_read(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), p_organization_id, 'operations.maintenance.costs.view')
      or public.has_permission(auth.uid(), p_organization_id, 'operations.maintenance.costs.manage')
      or public.has_permission(auth.uid(), p_organization_id, 'operations.maintenance.costs.post')
      or public.has_permission(auth.uid(), p_organization_id, 'operations.maintenance.owner_charge');
$$;

create or replace function public.work_order_cost_staff_can_manage(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), p_organization_id, 'operations.maintenance.costs.manage');
$$;

create or replace function public.work_order_cost_staff_can_post(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), p_organization_id, 'operations.maintenance.costs.post');
$$;

create or replace function public.work_order_cost_staff_can_charge_owner(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), p_organization_id, 'operations.maintenance.owner_charge');
$$;

create or replace function public.work_order_cost_member_can_read_due(p_due public.dues)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_due.source_type = 'MAINTENANCE_WORK_ORDER_COST'
    and exists (
      select 1
      from public.work_order_costs woc
      join public.work_orders wo
        on wo.id = woc.work_order_id
       and wo.organization_id = woc.organization_id
      join public.maintenance_requests mr
        on mr.id = wo.maintenance_request_id
       and mr.organization_id = wo.organization_id
      where woc.id = p_due.source_id
        and woc.organization_id = p_due.organization_id
        and woc.owner_due_id = p_due.id
        and p_due.unit_id = wo.unit_id
        and p_due.property_id = wo.property_id
        and mr.requester_member_id = public.current_member_id()
        and public.is_current_member_unit_owner(public.current_member_id(), p_due.organization_id, p_due.unit_id)
        and public.organization_is_active(p_due.organization_id)
    );
$$;

create or replace function public.assert_work_order_cost_currency(
  p_organization_id uuid,
  p_currency text
) returns text
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_default_currency text;
  v_currency text := upper(nullif(btrim(p_currency), ''));
begin
  select upper(default_currency) into v_default_currency
  from public.organizations
  where id = p_organization_id;

  if v_default_currency is null then
    raise exception 'ORGANIZATION_NOT_FOUND' using errcode = 'P0001';
  end if;

  if v_currency is null or v_currency !~ '^[A-Z]{3}$' then
    raise exception 'INVALID_COST_CURRENCY' using errcode = '22023';
  end if;

  if v_currency <> v_default_currency then
    raise exception 'UNSUPPORTED_COST_CURRENCY: maintenance PR3 supports organization base currency only' using errcode = '22023';
  end if;

  return v_currency;
end;
$$;

create or replace function public.audit_work_order_cost_action(
  p_cost public.work_order_costs,
  p_actor_user_id uuid,
  p_action text,
  p_summary jsonb default '{}'::jsonb
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_work_order public.work_orders;
begin
  select * into v_work_order
  from public.work_orders
  where id = p_cost.work_order_id
    and organization_id = p_cost.organization_id;

  insert into public.platform_audit_logs (
    actor_id,
    organization_id,
    property_id,
    action,
    entity_type,
    entity_id,
    safe_change_summary
  ) values (
    p_actor_user_id,
    p_cost.organization_id,
    v_work_order.property_id,
    p_action,
    'work_order_cost',
    p_cost.id,
    coalesce(p_summary, '{}'::jsonb)
  );
end;
$$;

create or replace function public.add_work_order_cost(
  p_work_order_id uuid,
  p_cost_type text,
  p_description text,
  p_quantity numeric,
  p_unit_cost numeric,
  p_currency text,
  p_supplier_id uuid default null,
  p_source_reference text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_work_order public.work_orders;
  v_cost public.work_order_costs;
  v_cost_type text := upper(nullif(btrim(p_cost_type), ''));
  v_description text := nullif(btrim(p_description), '');
  v_currency text;
  v_quantity numeric(19, 4) := round(p_quantity, 4);
  v_unit_cost numeric(19, 4) := round(p_unit_cost, 4);
  v_total numeric(19, 4);
  v_reference text := nullif(btrim(p_source_reference), '');
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_work_order
  from public.work_orders
  where id = p_work_order_id
  for update;

  if v_work_order.id is null then
    raise exception 'WORK_ORDER_NOT_FOUND' using errcode = '22023';
  end if;

  if not public.organization_is_active(v_work_order.organization_id)
    or not public.maintenance_module_enabled(v_work_order.organization_id)
  then
    raise exception 'MAINTENANCE_NOT_ENTITLED' using errcode = '42501';
  end if;

  if not public.work_order_cost_staff_can_manage(v_work_order.organization_id) then
    raise exception 'FORBIDDEN_WORK_ORDER_COST_MANAGE' using errcode = '42501';
  end if;

  if v_work_order.status = 'CANCELLED' then
    raise exception 'WORK_ORDER_COST_NOT_ACCEPTED' using errcode = '22023';
  end if;

  if v_cost_type not in ('LABOR', 'SUPPLIER', 'MATERIAL', 'OTHER') then
    raise exception 'INVALID_WORK_ORDER_COST_TYPE' using errcode = '22023';
  end if;

  if v_description is null or char_length(v_description) > 1000 then
    raise exception 'INVALID_WORK_ORDER_COST_DESCRIPTION' using errcode = '22023';
  end if;

  if v_quantity is null or v_quantity <= 0 or v_unit_cost is null or v_unit_cost < 0 then
    raise exception 'INVALID_WORK_ORDER_COST_AMOUNT' using errcode = '22023';
  end if;

  v_total := round(v_quantity * v_unit_cost, 4);
  if v_total <= 0 then
    raise exception 'INVALID_WORK_ORDER_COST_AMOUNT' using errcode = '22023';
  end if;

  v_currency := public.assert_work_order_cost_currency(v_work_order.organization_id, p_currency);

  if (v_cost_type = 'SUPPLIER') <> (p_supplier_id is not null) then
    raise exception 'INVALID_WORK_ORDER_COST_SUPPLIER' using errcode = '22023';
  end if;

  if p_supplier_id is not null and not exists (
    select 1
    from public.suppliers
    where id = p_supplier_id
      and organization_id = v_work_order.organization_id
      and is_active = true
  ) then
    raise exception 'INVALID_WORK_ORDER_COST_SUPPLIER' using errcode = '22023';
  end if;

  if v_reference is not null and char_length(v_reference) > 160 then
    raise exception 'INVALID_WORK_ORDER_COST_REFERENCE' using errcode = '22023';
  end if;

  if v_reference is not null then
    select * into v_cost
    from public.work_order_costs
    where organization_id = v_work_order.organization_id
      and source_reference = v_reference
    for update;

    if v_cost.id is not null then
      return v_cost.id;
    end if;
  end if;

  insert into public.work_order_costs (
    organization_id,
    work_order_id,
    cost_type,
    description,
    quantity,
    unit_cost,
    total_cost,
    currency,
    supplier_id,
    source_reference,
    created_by,
    updated_by
  ) values (
    v_work_order.organization_id,
    v_work_order.id,
    v_cost_type,
    v_description,
    v_quantity,
    v_unit_cost,
    v_total,
    v_currency,
    p_supplier_id,
    v_reference,
    v_user_id,
    v_user_id
  )
  returning * into v_cost;

  perform public.audit_work_order_cost_action(
    v_cost,
    v_user_id,
    'work_order_cost.created',
    jsonb_build_object('work_order_id', v_work_order.id, 'cost_type', v_cost.cost_type, 'total_cost', v_cost.total_cost, 'currency', v_cost.currency)
  );

  return v_cost.id;
end;
$$;

create or replace function public.update_unposted_work_order_cost(
  p_cost_id uuid,
  p_cost_type text,
  p_description text,
  p_quantity numeric,
  p_unit_cost numeric,
  p_currency text,
  p_supplier_id uuid default null,
  p_source_reference text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_cost public.work_order_costs;
  v_cost_type text := upper(nullif(btrim(p_cost_type), ''));
  v_description text := nullif(btrim(p_description), '');
  v_currency text;
  v_quantity numeric(19, 4) := round(p_quantity, 4);
  v_unit_cost numeric(19, 4) := round(p_unit_cost, 4);
  v_total numeric(19, 4);
  v_reference text := nullif(btrim(p_source_reference), '');
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_cost
  from public.work_order_costs
  where id = p_cost_id
  for update;

  if v_cost.id is null then
    raise exception 'WORK_ORDER_COST_NOT_FOUND' using errcode = '22023';
  end if;

  if not public.work_order_cost_staff_can_manage(v_cost.organization_id) then
    raise exception 'FORBIDDEN_WORK_ORDER_COST_MANAGE' using errcode = '42501';
  end if;

  if v_cost.financial_status <> 'UNPOSTED' or v_cost.owner_charge_status <> 'NOT_CHARGED' then
    raise exception 'WORK_ORDER_COST_IMMUTABLE' using errcode = '22023';
  end if;

  if not public.organization_is_active(v_cost.organization_id)
    or not public.maintenance_module_enabled(v_cost.organization_id)
  then
    raise exception 'MAINTENANCE_NOT_ENTITLED' using errcode = '42501';
  end if;

  if v_cost_type not in ('LABOR', 'SUPPLIER', 'MATERIAL', 'OTHER') then
    raise exception 'INVALID_WORK_ORDER_COST_TYPE' using errcode = '22023';
  end if;

  if v_description is null or char_length(v_description) > 1000 then
    raise exception 'INVALID_WORK_ORDER_COST_DESCRIPTION' using errcode = '22023';
  end if;

  if v_quantity is null or v_quantity <= 0 or v_unit_cost is null or v_unit_cost < 0 then
    raise exception 'INVALID_WORK_ORDER_COST_AMOUNT' using errcode = '22023';
  end if;

  v_total := round(v_quantity * v_unit_cost, 4);
  if v_total <= 0 then
    raise exception 'INVALID_WORK_ORDER_COST_AMOUNT' using errcode = '22023';
  end if;

  v_currency := public.assert_work_order_cost_currency(v_cost.organization_id, p_currency);

  if (v_cost_type = 'SUPPLIER') <> (p_supplier_id is not null) then
    raise exception 'INVALID_WORK_ORDER_COST_SUPPLIER' using errcode = '22023';
  end if;

  if p_supplier_id is not null and not exists (
    select 1 from public.suppliers
    where id = p_supplier_id
      and organization_id = v_cost.organization_id
      and is_active = true
  ) then
    raise exception 'INVALID_WORK_ORDER_COST_SUPPLIER' using errcode = '22023';
  end if;

  update public.work_order_costs
  set cost_type = v_cost_type,
      description = v_description,
      quantity = v_quantity,
      unit_cost = v_unit_cost,
      total_cost = v_total,
      currency = v_currency,
      supplier_id = p_supplier_id,
      source_reference = v_reference,
      updated_by = v_user_id,
      updated_at = now()
  where id = v_cost.id
  returning * into v_cost;

  perform public.audit_work_order_cost_action(
    v_cost,
    v_user_id,
    'work_order_cost.updated',
    jsonb_build_object('work_order_id', v_cost.work_order_id, 'cost_type', v_cost.cost_type, 'total_cost', v_cost.total_cost, 'currency', v_cost.currency)
  );
end;
$$;

create or replace function public.void_unposted_work_order_cost(
  p_cost_id uuid,
  p_reason text default null
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_cost public.work_order_costs;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_cost
  from public.work_order_costs
  where id = p_cost_id
  for update;

  if v_cost.id is null then
    raise exception 'WORK_ORDER_COST_NOT_FOUND' using errcode = '22023';
  end if;

  if not public.work_order_cost_staff_can_manage(v_cost.organization_id) then
    raise exception 'FORBIDDEN_WORK_ORDER_COST_MANAGE' using errcode = '42501';
  end if;

  if v_cost.financial_status <> 'UNPOSTED' or v_cost.owner_charge_status <> 'NOT_CHARGED' then
    raise exception 'WORK_ORDER_COST_IMMUTABLE' using errcode = '22023';
  end if;

  update public.work_order_costs
  set financial_status = 'VOIDED',
      voided_at = now(),
      updated_by = v_user_id,
      updated_at = now()
  where id = v_cost.id
  returning * into v_cost;

  perform public.audit_work_order_cost_action(
    v_cost,
    v_user_id,
    'work_order_cost.voided',
    jsonb_build_object('work_order_id', v_cost.work_order_id, 'reason_supplied', nullif(btrim(p_reason), '') is not null)
  );
end;
$$;

create or replace function public.post_work_order_cost_as_expense(
  p_cost_id uuid,
  p_expense_category_id uuid,
  p_payment_account_id uuid,
  p_fiscal_period_id uuid,
  p_expense_date date default current_date,
  p_cashier_session_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_cost public.work_order_costs;
  v_work_order public.work_orders;
  v_expense_id uuid;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_cost
  from public.work_order_costs
  where id = p_cost_id
  for update;

  if v_cost.id is null then
    raise exception 'WORK_ORDER_COST_NOT_FOUND' using errcode = '22023';
  end if;

  if v_cost.financial_status = 'POSTED_EXPENSE' then
    return v_cost.expense_id;
  end if;

  if v_cost.financial_status <> 'UNPOSTED' then
    raise exception 'WORK_ORDER_COST_ALREADY_POSTED' using errcode = '22023';
  end if;

  if not public.work_order_cost_staff_can_post(v_cost.organization_id) then
    raise exception 'FORBIDDEN_WORK_ORDER_COST_POST' using errcode = '42501';
  end if;

  if not public.organization_is_active(v_cost.organization_id)
    or not public.maintenance_module_enabled(v_cost.organization_id)
  then
    raise exception 'MAINTENANCE_NOT_ENTITLED' using errcode = '42501';
  end if;

  if not public.has_financial_permission(v_cost.organization_id, 'finance.entries.create', null) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION' using errcode = '42501';
  end if;

  select * into v_work_order
  from public.work_orders
  where id = v_cost.work_order_id
    and organization_id = v_cost.organization_id;

  if v_work_order.id is null or v_work_order.status = 'CANCELLED' then
    raise exception 'WORK_ORDER_COST_NOT_POSTABLE' using errcode = '22023';
  end if;

  if v_cost.currency <> (
    select upper(default_currency) from public.organizations where id = v_cost.organization_id
  ) then
    raise exception 'UNSUPPORTED_COST_CURRENCY' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.expense_categories
    where id = p_expense_category_id
      and organization_id = v_cost.organization_id
      and is_active = true
  ) then
    raise exception 'INVALID_EXPENSE_CATEGORY' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.chart_of_accounts
    where id = p_payment_account_id
      and organization_id = v_cost.organization_id
  ) then
    raise exception 'INVALID_PAYMENT_ACCOUNT' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.fiscal_periods
    where id = p_fiscal_period_id
      and organization_id = v_cost.organization_id
      and status = 'OPEN'
  ) then
    raise exception 'INVALID_FISCAL_PERIOD' using errcode = '22023';
  end if;

  v_expense_id := public.record_expense(
    v_cost.organization_id,
    v_work_order.property_id,
    p_expense_category_id,
    'Maintenance ' || v_work_order.work_order_no || ': ' || v_cost.description,
    v_cost.total_cost,
    coalesce(p_expense_date, current_date),
    p_payment_account_id,
    p_fiscal_period_id,
    p_cashier_session_id
  );

  update public.work_order_costs
  set financial_status = 'POSTED_EXPENSE',
      expense_id = v_expense_id,
      posted_at = now(),
      updated_by = v_user_id,
      updated_at = now()
  where id = v_cost.id
  returning * into v_cost;

  perform public.audit_work_order_cost_action(
    v_cost,
    v_user_id,
    'work_order_cost.expense_posted',
    jsonb_build_object('work_order_id', v_cost.work_order_id, 'expense_id', v_expense_id, 'total_cost', v_cost.total_cost)
  );

  return v_expense_id;
end;
$$;

create or replace function public.post_work_order_cost_as_supplier_invoice(
  p_cost_id uuid,
  p_invoice_number text,
  p_expense_account_id uuid,
  p_fiscal_period_id uuid,
  p_invoice_date date default current_date,
  p_due_date date default (current_date + 15),
  p_discount_amount numeric default 0,
  p_vat_rate numeric default 0,
  p_vat_account_id uuid default null,
  p_wht_rate numeric default 0,
  p_wht_account_id uuid default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_cost public.work_order_costs;
  v_work_order public.work_orders;
  v_invoice_id uuid;
  v_invoice_number text := nullif(btrim(p_invoice_number), '');
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_cost
  from public.work_order_costs
  where id = p_cost_id
  for update;

  if v_cost.id is null then
    raise exception 'WORK_ORDER_COST_NOT_FOUND' using errcode = '22023';
  end if;

  if v_cost.financial_status = 'POSTED_SUPPLIER_INVOICE' then
    return v_cost.supplier_invoice_id;
  end if;

  if v_cost.financial_status <> 'UNPOSTED' then
    raise exception 'WORK_ORDER_COST_ALREADY_POSTED' using errcode = '22023';
  end if;

  if v_cost.cost_type <> 'SUPPLIER' or v_cost.supplier_id is null then
    raise exception 'WORK_ORDER_COST_NOT_SUPPLIER' using errcode = '22023';
  end if;

  if v_invoice_number is null or char_length(v_invoice_number) > 80 then
    raise exception 'INVALID_SUPPLIER_INVOICE_NUMBER' using errcode = '22023';
  end if;

  if not public.work_order_cost_staff_can_post(v_cost.organization_id) then
    raise exception 'FORBIDDEN_WORK_ORDER_COST_POST' using errcode = '42501';
  end if;

  if not public.organization_is_active(v_cost.organization_id)
    or not public.maintenance_module_enabled(v_cost.organization_id)
  then
    raise exception 'MAINTENANCE_NOT_ENTITLED' using errcode = '42501';
  end if;

  if not public.has_financial_permission(v_cost.organization_id, 'finance.entries.create', null) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION' using errcode = '42501';
  end if;

  select * into v_work_order
  from public.work_orders
  where id = v_cost.work_order_id
    and organization_id = v_cost.organization_id;

  if v_work_order.id is null or v_work_order.status = 'CANCELLED' then
    raise exception 'WORK_ORDER_COST_NOT_POSTABLE' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.chart_of_accounts
    where id = p_expense_account_id
      and organization_id = v_cost.organization_id
  ) then
    raise exception 'INVALID_EXPENSE_ACCOUNT' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.fiscal_periods
    where id = p_fiscal_period_id
      and organization_id = v_cost.organization_id
      and status = 'OPEN'
  ) then
    raise exception 'INVALID_FISCAL_PERIOD' using errcode = '22023';
  end if;

  v_invoice_id := public.post_supplier_invoice_in_currency(
    v_cost.organization_id,
    v_work_order.property_id,
    v_cost.supplier_id,
    null,
    v_invoice_number,
    p_expense_account_id,
    v_cost.total_cost,
    coalesce(p_discount_amount, 0),
    coalesce(p_vat_rate, 0),
    p_vat_account_id,
    coalesce(p_wht_rate, 0),
    p_wht_account_id,
    coalesce(p_invoice_date, current_date),
    coalesce(p_due_date, current_date + 15),
    p_fiscal_period_id,
    v_cost.currency,
    null
  );

  update public.work_order_costs
  set financial_status = 'POSTED_SUPPLIER_INVOICE',
      supplier_invoice_id = v_invoice_id,
      posted_at = now(),
      updated_by = v_user_id,
      updated_at = now()
  where id = v_cost.id
  returning * into v_cost;

  perform public.audit_work_order_cost_action(
    v_cost,
    v_user_id,
    'work_order_cost.supplier_invoice_posted',
    jsonb_build_object('work_order_id', v_cost.work_order_id, 'supplier_invoice_id', v_invoice_id, 'total_cost', v_cost.total_cost)
  );

  return v_invoice_id;
end;
$$;

create or replace function public.charge_work_order_cost_to_owner(
  p_cost_id uuid,
  p_due_type_id uuid,
  p_receivable_account_id uuid,
  p_amount numeric default null,
  p_issue_date date default current_date,
  p_due_date date default (current_date + 15),
  p_description text default null
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_cost public.work_order_costs;
  v_work_order public.work_orders;
  v_due_id uuid;
  v_amount numeric(19, 4);
  v_description text;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_cost
  from public.work_order_costs
  where id = p_cost_id
  for update;

  if v_cost.id is null then
    raise exception 'WORK_ORDER_COST_NOT_FOUND' using errcode = '22023';
  end if;

  if v_cost.owner_charge_status = 'OWNER_CHARGED' then
    return v_cost.owner_due_id;
  end if;

  if v_cost.financial_status = 'VOIDED' then
    raise exception 'WORK_ORDER_COST_VOIDED' using errcode = '22023';
  end if;

  if not public.work_order_cost_staff_can_charge_owner(v_cost.organization_id) then
    raise exception 'FORBIDDEN_WORK_ORDER_OWNER_CHARGE' using errcode = '42501';
  end if;

  if not public.has_financial_permission(v_cost.organization_id, 'finance.dues.issue', null) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION' using errcode = '42501';
  end if;

  if not public.organization_is_active(v_cost.organization_id)
    or not public.maintenance_module_enabled(v_cost.organization_id)
  then
    raise exception 'MAINTENANCE_NOT_ENTITLED' using errcode = '42501';
  end if;

  select * into v_work_order
  from public.work_orders
  where id = v_cost.work_order_id
    and organization_id = v_cost.organization_id;

  if v_work_order.id is null or v_work_order.status = 'CANCELLED' then
    raise exception 'WORK_ORDER_COST_NOT_CHARGEABLE' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.due_types
    where id = p_due_type_id
      and organization_id = v_cost.organization_id
      and is_active = true
  ) then
    raise exception 'INVALID_DUE_TYPE' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.chart_of_accounts
    where id = p_receivable_account_id
      and organization_id = v_cost.organization_id
  ) then
    raise exception 'INVALID_RECEIVABLE_ACCOUNT' using errcode = '22023';
  end if;

  if coalesce(p_due_date, current_date + 15) < coalesce(p_issue_date, current_date) then
    raise exception 'INVALID_DUE_DATE' using errcode = '22023';
  end if;

  v_amount := round(coalesce(p_amount, v_cost.total_cost), 4);
  if v_amount <= 0 then
    raise exception 'INVALID_OWNER_CHARGE_AMOUNT' using errcode = '22023';
  end if;

  v_description := coalesce(nullif(btrim(p_description), ''), 'Maintenance charge for work order ' || v_work_order.work_order_no);

  insert into public.dues (
    organization_id,
    property_id,
    unit_id,
    due_type_id,
    receivable_account_id,
    amount,
    issue_date,
    due_date,
    description,
    status,
    created_by,
    source_type,
    source_id
  ) values (
    v_cost.organization_id,
    v_work_order.property_id,
    v_work_order.unit_id,
    p_due_type_id,
    p_receivable_account_id,
    v_amount,
    coalesce(p_issue_date, current_date),
    coalesce(p_due_date, current_date + 15),
    v_description,
    'ISSUED',
    v_user_id,
    'MAINTENANCE_WORK_ORDER_COST',
    v_cost.id
  )
  returning id into v_due_id;

  update public.work_order_costs
  set owner_charge_status = 'OWNER_CHARGED',
      owner_due_id = v_due_id,
      owner_charged_at = now(),
      updated_by = v_user_id,
      updated_at = now()
  where id = v_cost.id
  returning * into v_cost;

  perform public.audit_work_order_cost_action(
    v_cost,
    v_user_id,
    'work_order_cost.owner_charged',
    jsonb_build_object('work_order_id', v_cost.work_order_id, 'due_id', v_due_id, 'owner_charge_amount', v_amount)
  );

  return v_due_id;
end;
$$;

alter table public.work_order_costs enable row level security;

create policy work_order_costs_select_staff_only
  on public.work_order_costs
  for select
  to authenticated
  using (
    public.organization_is_active(organization_id)
    and public.maintenance_module_enabled(organization_id)
    and public.work_order_cost_staff_can_read(organization_id)
  );

create policy dues_select_own_via_maintenance_cost
  on public.dues
  for select
  to authenticated
  using (
    public.work_order_cost_member_can_read_due(dues)
  );

insert into public.permissions (id, key, description)
values
  ('e61f3cdd-38b5-45cf-b82b-2c8f3cad2730', 'operations.maintenance.costs.view', 'View organization-scoped maintenance work-order costs'),
  ('f0e1d7f4-8f5a-4bc9-9919-ae92f0d49481', 'operations.maintenance.costs.manage', 'Create, edit, and void unposted maintenance work-order costs'),
  ('0ea22ed3-40bc-44bc-90b6-260293f7aab2', 'operations.maintenance.costs.post', 'Post maintenance work-order costs to canonical accounting records'),
  ('82c773cd-96bd-460a-8ac7-eac820fb6730', 'operations.maintenance.owner_charge', 'Create explicit owner charges from maintenance work-order costs')
on conflict (key) do nothing;

insert into public.role_template_permissions (role_template_key, permission_key)
values
  ('TENANT_OWNER', 'operations.maintenance.costs.view'),
  ('TENANT_OWNER', 'operations.maintenance.costs.manage'),
  ('TENANT_OWNER', 'operations.maintenance.costs.post'),
  ('TENANT_OWNER', 'operations.maintenance.owner_charge'),
  ('TENANT_ADMIN', 'operations.maintenance.costs.view'),
  ('TENANT_ADMIN', 'operations.maintenance.costs.manage'),
  ('TENANT_ADMIN', 'operations.maintenance.costs.post'),
  ('TENANT_ADMIN', 'operations.maintenance.owner_charge'),
  ('GENERAL_MANAGER', 'operations.maintenance.costs.view'),
  ('GENERAL_MANAGER', 'operations.maintenance.costs.manage'),
  ('GENERAL_MANAGER', 'operations.maintenance.costs.post'),
  ('GENERAL_MANAGER', 'operations.maintenance.owner_charge'),
  ('FINANCE_MANAGER', 'operations.maintenance.costs.view'),
  ('FINANCE_MANAGER', 'operations.maintenance.costs.post'),
  ('FINANCE_MANAGER', 'operations.maintenance.owner_charge'),
  ('ACCOUNTANT', 'operations.maintenance.costs.view'),
  ('ACCOUNTANT', 'operations.maintenance.costs.post'),
  ('ACCOUNTANT', 'operations.maintenance.owner_charge'),
  ('PROPERTY_MANAGER', 'operations.maintenance.costs.view'),
  ('PROPERTY_MANAGER', 'operations.maintenance.costs.manage'),
  ('VIEWER', 'operations.maintenance.costs.view')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'operations.maintenance.costs.view',
  'operations.maintenance.costs.manage',
  'operations.maintenance.costs.post',
  'operations.maintenance.owner_charge'
)
where r.key in ('TENANT_OWNER', 'TENANT_ADMIN', 'GENERAL_MANAGER')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'operations.maintenance.costs.view',
  'operations.maintenance.costs.post',
  'operations.maintenance.owner_charge'
)
where r.key in ('FINANCE_MANAGER', 'ACCOUNTANT')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in (
  'operations.maintenance.costs.view',
  'operations.maintenance.costs.manage'
)
where r.key = 'PROPERTY_MANAGER'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'operations.maintenance.costs.view'
where r.key = 'VIEWER'
on conflict do nothing;

revoke all privileges on table public.work_order_costs from public, anon, authenticated;
grant select on table public.work_order_costs to authenticated;
grant all privileges on table public.work_order_costs to service_role;

revoke all on function public.work_order_cost_staff_can_read(uuid) from public, anon, authenticated, service_role;
revoke all on function public.work_order_cost_staff_can_manage(uuid) from public, anon, authenticated, service_role;
revoke all on function public.work_order_cost_staff_can_post(uuid) from public, anon, authenticated, service_role;
revoke all on function public.work_order_cost_staff_can_charge_owner(uuid) from public, anon, authenticated, service_role;
revoke all on function public.work_order_cost_member_can_read_due(public.dues) from public, anon, authenticated, service_role;
revoke all on function public.assert_work_order_cost_currency(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.audit_work_order_cost_action(public.work_order_costs, uuid, text, jsonb) from public, anon, authenticated, service_role;
revoke all on function public.add_work_order_cost(uuid, text, text, numeric, numeric, text, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.update_unposted_work_order_cost(uuid, text, text, numeric, numeric, text, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.void_unposted_work_order_cost(uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.post_work_order_cost_as_expense(uuid, uuid, uuid, uuid, date, uuid) from public, anon, authenticated, service_role;
revoke all on function public.post_work_order_cost_as_supplier_invoice(uuid, text, uuid, uuid, date, date, numeric, numeric, uuid, numeric, uuid) from public, anon, authenticated, service_role;
revoke all on function public.charge_work_order_cost_to_owner(uuid, uuid, uuid, numeric, date, date, text) from public, anon, authenticated, service_role;

grant execute on function public.work_order_cost_staff_can_read(uuid) to authenticated, service_role;
grant execute on function public.work_order_cost_staff_can_manage(uuid) to authenticated, service_role;
grant execute on function public.work_order_cost_staff_can_post(uuid) to authenticated, service_role;
grant execute on function public.work_order_cost_staff_can_charge_owner(uuid) to authenticated, service_role;
grant execute on function public.work_order_cost_member_can_read_due(public.dues) to authenticated, service_role;
grant execute on function public.add_work_order_cost(uuid, text, text, numeric, numeric, text, uuid, text) to authenticated;
grant execute on function public.update_unposted_work_order_cost(uuid, text, text, numeric, numeric, text, uuid, text) to authenticated;
grant execute on function public.void_unposted_work_order_cost(uuid, text) to authenticated;
grant execute on function public.post_work_order_cost_as_expense(uuid, uuid, uuid, uuid, date, uuid) to authenticated;
grant execute on function public.post_work_order_cost_as_supplier_invoice(uuid, text, uuid, uuid, date, date, numeric, numeric, uuid, numeric, uuid) to authenticated;
grant execute on function public.charge_work_order_cost_to_owner(uuid, uuid, uuid, numeric, date, date, text) to authenticated;

commit;
