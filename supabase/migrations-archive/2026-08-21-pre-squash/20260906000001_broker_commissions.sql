-- Broker commissions: what the business owes an agent for closing a lease or
-- a sale, accrued when it is earned rather than when it is paid.
--
-- WHY ACCRUE AND NOT JUST PAY. A commission is earned the moment the contract
-- is signed, but usually paid weeks later. Recording it only on payment
-- understates both the expense and the liability for the whole period in
-- between -- the same accrual failure that dues had before
-- 20260902000001. So earning posts the expense and the payable; paying only
-- settles the payable.
--
-- WITHHOLDING TAX IS PART OF THE ACCRUAL, NOT AN AFTERTHOUGHT. In Egypt,
-- commission paid to an agent is subject to withholding: the business pays the
-- agent the net and remits the withheld portion to the tax authority. Both
-- obligations are created by the same event, so a single entry records all
-- three legs:
--
--   Dr Commission expense    gross
--     Cr Withholding payable   withheld     (only when a rate applies)
--     Cr Commission payable    net
--
-- Gulf jurisdictions generally have no domestic withholding on this, so the
-- rate simply comes through as zero and the entry collapses to two legs. The
-- shape is deliberately the same either way rather than branching per country.

alter table public.organization_finance_settings
  add column if not exists commission_expense_account_id uuid
    references public.chart_of_accounts (id),
  add column if not exists commission_payable_account_id uuid
    references public.chart_of_accounts (id);

comment on column public.organization_finance_settings.commission_expense_account_id is
  'EXPENSE account debited when a broker commission is earned.';
comment on column public.organization_finance_settings.commission_payable_account_id is
  'LIABILITY account credited with the net commission owed to brokers until it is paid.';

create table public.brokers (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  name text not null,
  -- An in-house agent and an outside agency are both paid commission, but only
  -- the latter is a third-party supplier for tax purposes, so the distinction
  -- has to survive into reporting.
  broker_type text not null default 'EXTERNAL'
    check (broker_type in ('INTERNAL', 'EXTERNAL')),
  tax_id text,
  phone text,
  email text,
  -- Default withholding rate for this broker; each commission may still
  -- override it, because rates change and old commissions must keep theirs.
  default_wht_rate numeric(5, 2) not null default 0
    check (default_wht_rate >= 0 and default_wht_rate <= 100),
  is_active boolean not null default true,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, name)
);

create index idx_brokers_org on public.brokers (organization_id) where is_active;

create trigger trg_brokers_updated_at
  before update on public.brokers
  for each row execute function public.set_updated_at();

create table public.commissions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  property_id uuid not null references public.properties (id) on delete cascade,
  broker_id uuid not null references public.brokers (id),
  unit_id uuid references public.units (id) on delete set null,
  -- What the commission was earned on. Exactly one reference is set, enforced
  -- below, so a commission can always be traced back to its contract.
  source_type text not null check (source_type in ('LEASE', 'INSTALLMENT_PLAN', 'MANUAL')),
  lease_id uuid references public.unit_leases (id) on delete set null,
  installment_plan_id uuid references public.installment_plans (id) on delete set null,

  -- The contract value the rate was applied to, kept so the figure can be
  -- re-derived and argued with later.
  basis_amount numeric(19, 4) not null check (basis_amount >= 0),
  rate_percent numeric(6, 3) check (rate_percent is null or (rate_percent >= 0 and rate_percent <= 100)),
  gross_amount numeric(19, 4) not null check (gross_amount > 0),
  wht_rate numeric(5, 2) not null default 0 check (wht_rate >= 0 and wht_rate <= 100),
  wht_amount numeric(19, 4) not null default 0 check (wht_amount >= 0),
  net_amount numeric(19, 4) not null check (net_amount >= 0),

  earned_date date not null,
  status text not null default 'ACCRUED'
    check (status in ('ACCRUED', 'PAID', 'CANCELLED')),
  accrual_journal_entry_id uuid references public.journal_entries (id),
  payment_journal_entry_id uuid references public.journal_entries (id),
  paid_date date,
  note text,
  created_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint commissions_net_adds_up check (abs(gross_amount - wht_amount - net_amount) < 0.0005),
  constraint commissions_source_reference check (
    (source_type = 'LEASE' and lease_id is not null and installment_plan_id is null)
    or (source_type = 'INSTALLMENT_PLAN' and installment_plan_id is not null and lease_id is null)
    or (source_type = 'MANUAL' and lease_id is null and installment_plan_id is null)
  ),
  -- A contract earns its broker one commission. Prevents the same lease being
  -- accrued twice by two people on the same day.
  unique (broker_id, lease_id),
  unique (broker_id, installment_plan_id)
);

create index idx_commissions_org_status on public.commissions (organization_id, status);
create index idx_commissions_broker on public.commissions (broker_id);

create trigger trg_commissions_updated_at
  before update on public.commissions
  for each row execute function public.set_updated_at();

alter table public.brokers enable row level security;
alter table public.commissions enable row level security;

insert into public.permissions (key, description) values
  ('finance.commissions.read', 'الاطلاع على الوسطاء وعمولاتهم'),
  ('finance.commissions.manage', 'إضافة الوسطاء وتسجيل استحقاق العمولات وسدادها')
on conflict do nothing;

create policy "brokers_select"
  on public.brokers for select
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.commissions.read')
    or public.has_permission(auth.uid(), organization_id, 'finance.commissions.manage')
  );

create policy "brokers_manage"
  on public.brokers for all
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.commissions.manage')
    and public.organization_is_active(organization_id)
  )
  with check (
    public.has_permission(auth.uid(), organization_id, 'finance.commissions.manage')
    and public.organization_is_active(organization_id)
  );

create policy "commissions_select"
  on public.commissions for select
  using (
    public.has_permission(auth.uid(), organization_id, 'finance.commissions.read')
    or public.has_permission(auth.uid(), organization_id, 'finance.commissions.manage')
  );

-- No client write policy: commissions carry ledger entries, so they are
-- created and settled only through the RPCs below, exactly like cheques.

insert into public.role_template_permissions (role_template_key, permission_key)
values
  ('TENANT_OWNER', 'finance.commissions.read'),
  ('TENANT_OWNER', 'finance.commissions.manage'),
  ('FINANCE_MANAGER', 'finance.commissions.read'),
  ('FINANCE_MANAGER', 'finance.commissions.manage'),
  ('ACCOUNTANT', 'finance.commissions.read'),
  ('ACCOUNTANT', 'finance.commissions.manage'),
  ('PROPERTY_MANAGER', 'finance.commissions.read'),
  ('AUDITOR', 'finance.commissions.read')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.role_template_permissions rtp on rtp.role_template_key = r.key
join public.permissions p on p.key = rtp.permission_key
where r.organization_id is not null
  and rtp.permission_key in ('finance.commissions.read', 'finance.commissions.manage')
on conflict do nothing;

-- Accrue a commission and post it. Amount may be given directly, or derived
-- from a rate on a basis -- rounded to the organization's currency, never to
-- an assumed two decimals (see currency_decimals).
create or replace function public.accrue_commission(
  p_organization_id uuid,
  p_broker_id uuid,
  p_property_id uuid,
  p_source_type text,
  p_basis_amount numeric,
  p_rate_percent numeric default null,
  p_gross_amount numeric default null,
  p_wht_rate numeric default null,
  p_wht_account_id uuid default null,
  p_unit_id uuid default null,
  p_lease_id uuid default null,
  p_installment_plan_id uuid default null,
  p_earned_date date default current_date,
  p_note text default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_decimals int;
  v_expense_account uuid;
  v_payable_account uuid;
  v_fiscal_period_id uuid;
  v_broker record;
  v_gross numeric;
  v_wht_rate numeric;
  v_wht numeric;
  v_net numeric;
  v_entry_id uuid;
  v_commission_id uuid;
  v_lines jsonb;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.commissions.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإدارة العمولات' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'ORGANIZATION_NOT_ACTIVE: المؤسسة غير نشطة' using errcode = 'P0001';
  end if;

  select * into v_broker from public.brokers
  where id = p_broker_id and organization_id = p_organization_id;
  if v_broker.id is null then
    raise exception 'BROKER_NOT_FOUND: الوسيط غير موجود' using errcode = 'P0002';
  end if;
  if not v_broker.is_active then
    raise exception 'BROKER_INACTIVE: الوسيط غير نشط' using errcode = 'P0001';
  end if;

  select public.currency_decimals(default_currency) into v_decimals
  from public.organizations where id = p_organization_id;
  v_decimals := coalesce(v_decimals, 2);

  -- Either an explicit amount or a rate on the basis; never both silently
  -- disagreeing.
  if p_gross_amount is not null then
    v_gross := round(p_gross_amount, v_decimals);
  elsif p_rate_percent is not null then
    v_gross := round(coalesce(p_basis_amount, 0) * p_rate_percent / 100, v_decimals);
  else
    raise exception 'COMMISSION_AMOUNT_REQUIRED: حدّد نسبة العمولة أو مبلغها' using errcode = '22023';
  end if;

  if v_gross <= 0 then
    raise exception 'COMMISSION_AMOUNT_INVALID: مبلغ العمولة يجب أن يكون موجبًا' using errcode = '22023';
  end if;

  v_wht_rate := coalesce(p_wht_rate, v_broker.default_wht_rate, 0);
  v_wht := round(v_gross * v_wht_rate / 100, v_decimals);
  v_net := v_gross - v_wht;

  if v_wht > 0 and p_wht_account_id is null then
    raise exception 'WHT_ACCOUNT_REQUIRED: يجب تحديد حساب ضريبة الخصم عند وجود نسبة خصم' using errcode = '22023';
  end if;

  select commission_expense_account_id, commission_payable_account_id
  into v_expense_account, v_payable_account
  from public.organization_finance_settings
  where organization_id = p_organization_id
  order by (property_id = p_property_id) desc nulls last
  limit 1;

  if v_expense_account is null or v_payable_account is null then
    raise exception
      'COMMISSION_ACCOUNTS_NOT_SET: لم تُحدَّد حسابات مصروف العمولة والتزامها في إعدادات المالية'
      using errcode = 'P0001';
  end if;

  select fp.id into v_fiscal_period_id
  from public.fiscal_periods fp
  where fp.organization_id = p_organization_id
    and fp.status = 'OPEN'
    and p_earned_date between fp.start_date and fp.end_date
  order by fp.start_date
  limit 1;

  if v_fiscal_period_id is null then
    raise exception
      'NO_OPEN_FISCAL_PERIOD: لا توجد فترة مالية مفتوحة تغطي تاريخ استحقاق العمولة (%)', p_earned_date
      using errcode = 'P0001';
  end if;

  insert into public.commissions (
    organization_id, property_id, broker_id, unit_id, source_type,
    lease_id, installment_plan_id, basis_amount, rate_percent,
    gross_amount, wht_rate, wht_amount, net_amount,
    earned_date, status, note, created_by
  ) values (
    p_organization_id, p_property_id, p_broker_id, p_unit_id, p_source_type,
    p_lease_id, p_installment_plan_id, coalesce(p_basis_amount, 0), p_rate_percent,
    v_gross, v_wht_rate, v_wht, v_net,
    p_earned_date, 'ACCRUED', p_note, auth.uid()
  )
  returning id into v_commission_id;

  v_lines := jsonb_build_array(
    jsonb_build_object('account_id', v_expense_account, 'debit', v_gross, 'credit', 0),
    jsonb_build_object('account_id', v_payable_account, 'debit', 0, 'credit', v_net)
  );
  if v_wht > 0 then
    v_lines := v_lines || jsonb_build_array(
      jsonb_build_object('account_id', p_wht_account_id, 'debit', 0, 'credit', v_wht)
    );
  end if;

  v_entry_id := public.create_journal_entry_internal(
    p_organization_id, p_property_id, v_fiscal_period_id, p_earned_date,
    'Broker commission — ' || v_broker.name,
    'JOURNAL_VOUCHER', v_lines,
    'commission_accrual:' || v_commission_id::text
  );
  perform public.post_journal_entry_internal(v_entry_id);

  update public.commissions set accrual_journal_entry_id = v_entry_id where id = v_commission_id;

  insert into public.platform_audit_logs (
    actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary
  ) values (
    auth.uid(), p_organization_id, p_property_id,
    'commission.accrued', 'commission', v_commission_id,
    jsonb_build_object('broker', v_broker.name, 'gross', v_gross, 'wht', v_wht, 'net', v_net)
  );

  return v_commission_id;
end;
$$;

-- Settle an accrued commission: Dr commission payable / Cr cash. Only the net
-- moves -- the withheld portion stays a liability to the tax authority until
-- it is remitted separately, which is the whole point of withholding it.
create or replace function public.pay_commission(
  p_commission_id uuid,
  p_cash_account_id uuid,
  p_paid_date date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_c record;
  v_payable_account uuid;
  v_fiscal_period_id uuid;
  v_entry_id uuid;
  v_broker_name text;
begin
  select * into v_c from public.commissions where id = p_commission_id for update;
  if v_c.id is null then
    raise exception 'COMMISSION_NOT_FOUND: العمولة غير موجودة' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_c.organization_id, 'finance.commissions.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بسداد العمولات' using errcode = '42501';
  end if;

  if v_c.status <> 'ACCRUED' then
    raise exception 'COMMISSION_NOT_ACCRUED: لا يمكن سداد عمولة غير مستحقة أو مسددة بالفعل' using errcode = 'P0001';
  end if;

  select commission_payable_account_id into v_payable_account
  from public.organization_finance_settings
  where organization_id = v_c.organization_id
  order by (property_id = v_c.property_id) desc nulls last
  limit 1;

  if v_payable_account is null then
    raise exception 'COMMISSION_ACCOUNTS_NOT_SET: لم يُحدَّد حساب التزام العمولات' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.chart_of_accounts
    where id = p_cash_account_id and organization_id = v_c.organization_id and not is_group
  ) then
    raise exception 'CASH_ACCOUNT_INVALID: حساب النقدية لا ينتمي لهذه المؤسسة' using errcode = '22023';
  end if;

  select fp.id into v_fiscal_period_id
  from public.fiscal_periods fp
  where fp.organization_id = v_c.organization_id
    and fp.status = 'OPEN'
    and p_paid_date between fp.start_date and fp.end_date
  order by fp.start_date
  limit 1;

  if v_fiscal_period_id is null then
    raise exception
      'NO_OPEN_FISCAL_PERIOD: لا توجد فترة مالية مفتوحة تغطي تاريخ السداد (%)', p_paid_date
      using errcode = 'P0001';
  end if;

  select name into v_broker_name from public.brokers where id = v_c.broker_id;

  v_entry_id := public.create_journal_entry_internal(
    v_c.organization_id, v_c.property_id, v_fiscal_period_id, p_paid_date,
    'Commission paid — ' || coalesce(v_broker_name, ''),
    'PAYMENT_VOUCHER',
    jsonb_build_array(
      jsonb_build_object('account_id', v_payable_account, 'debit', v_c.net_amount, 'credit', 0),
      jsonb_build_object('account_id', p_cash_account_id, 'debit', 0, 'credit', v_c.net_amount)
    ),
    'commission_payment:' || p_commission_id::text
  );
  perform public.post_journal_entry_internal(v_entry_id);

  update public.commissions
  set status = 'PAID', paid_date = p_paid_date, payment_journal_entry_id = v_entry_id
  where id = p_commission_id;

  insert into public.platform_audit_logs (
    actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary
  ) values (
    auth.uid(), v_c.organization_id, v_c.property_id,
    'commission.paid', 'commission', p_commission_id,
    jsonb_build_object('broker', v_broker_name, 'net_paid', v_c.net_amount)
  );

  return v_entry_id;
end;
$$;
