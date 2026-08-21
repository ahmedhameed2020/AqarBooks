-- Security deposits, brought on-books.
--
-- 20260831000003 created unit_lease_deposit_events as a deliberately off-books
-- event log and flagged the ledger question as an open accounting decision.
-- This resolves it: deposits post.
--
-- WHY THEY MUST POST. A deposit received is cash the organization now holds and
-- must one day hand back. Leaving it off-books means the cash exists in the
-- till or bank with nothing on the other side of the balance sheet -- the
-- organization looks that much richer than it is, and at scale a property
-- manager holding deposits for hundreds of units is misstating its position by
-- a material amount. The deposit is a LIABILITY on receipt and never revenue,
-- which is exactly the distinction the ledger has to carry.
--
-- The event log stays append-only and untouched in shape; this migration only
-- adds the columns needed to tie each event to its entry.

alter table public.organization_finance_settings
  add column if not exists security_deposit_liability_account_id uuid
    references public.chart_of_accounts (id);

comment on column public.organization_finance_settings.security_deposit_liability_account_id is
  'LIABILITY account holding tenant security deposits. Credited on receipt, debited on refund or deduction.';

-- organization_finance_settings previously required an online-payments
-- clearing account -- NOT NULL on the column and validated unconditionally by
-- the trigger. That was coherent while the table held nothing but online
-- payment configuration, but its name promises general finance settings and it
-- now also carries deposit configuration. As it stood, an organization that
-- takes security deposits but not card payments could not configure one at
-- all, because it had no clearing account to supply.
--
-- So the clearing account becomes optional, and the trigger validates it only
-- when supplied. Safe on three counts: all 230 existing rows already set it, so
-- no existing row changes validity; record_online_payment() already checks for
-- a missing clearing account and raises at the point of use, so the guarantee
-- moves rather than disappears; and no application code reads the column --
-- only database functions do.
alter table public.organization_finance_settings
  alter column online_payments_clearing_account_id drop not null;
create or replace function public.validate_online_payments_clearing_account()
returns trigger
language plpgsql
as $$
declare
  v_account public.chart_of_accounts;
begin
  if not exists (
    select 1 from public.resorts where id = new.property_id and organization_id = new.organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;

  if new.online_payments_clearing_account_id is not null then
    select * into v_account
    from public.chart_of_accounts
    where id = new.online_payments_clearing_account_id;

    if v_account.id is null or v_account.organization_id <> new.organization_id then
      raise exception 'CLEARING_ACCOUNT_NOT_IN_ORGANIZATION: الحساب المحدد لا يتبع هذا الكيان' using errcode = '22023';
    end if;
    if v_account.category <> 'ASSET' then
      raise exception 'CLEARING_ACCOUNT_NOT_ASSET: حساب المقاصة يجب أن يكون من نوع أصول' using errcode = '22023';
    end if;
    if v_account.is_group then
      raise exception 'CLEARING_ACCOUNT_IS_GROUP: لا يمكن استخدام حساب تجميعي كحساب مقاصة' using errcode = '22023';
    end if;
    if not v_account.is_active then
      raise exception 'CLEARING_ACCOUNT_INACTIVE: حساب المقاصة غير نشط' using errcode = '22023';
    end if;
    if v_account.property_id is not null and v_account.property_id <> new.property_id then
      raise exception 'CLEARING_ACCOUNT_RESORT_MISMATCH: حساب المقاصة يتبع موقعًا مختلفًا' using errcode = '22023';
    end if;
  end if;

  -- The deposit liability account, when set, must be a real non-group
  -- LIABILITY account in the same organization -- a deposit posted to an
  -- asset or revenue account would be the exact error this feature exists
  -- to prevent.
  if new.security_deposit_liability_account_id is not null then
    select * into v_account
    from public.chart_of_accounts
    where id = new.security_deposit_liability_account_id;

    if v_account.id is null or v_account.organization_id <> new.organization_id then
      raise exception 'DEPOSIT_ACCOUNT_NOT_IN_ORGANIZATION: حساب الودائع لا يتبع هذا الكيان' using errcode = '22023';
    end if;
    if v_account.category <> 'LIABILITY' then
      raise exception 'DEPOSIT_ACCOUNT_NOT_LIABILITY: حساب ودائع التأمين يجب أن يكون من نوع خصوم' using errcode = '22023';
    end if;
    if v_account.is_group then
      raise exception 'DEPOSIT_ACCOUNT_IS_GROUP: لا يمكن استخدام حساب تجميعي لودائع التأمين' using errcode = '22023';
    end if;
  end if;

  return new;
end;
$$;

alter table public.unit_lease_deposit_events
  add column if not exists event_date date not null default current_date,
  add column if not exists journal_entry_id uuid references public.journal_entries (id),
  -- The other leg of the entry. Its meaning follows event_type: the cash or
  -- bank account the money actually moved through for RECEIVED and REFUNDED,
  -- and the account that recognises the deduction for DEDUCTED. One column
  -- rather than three nullable ones, because exactly one is ever relevant.
  add column if not exists settlement_account_id uuid references public.chart_of_accounts (id);

comment on column public.unit_lease_deposit_events.settlement_account_id is
  'Counter-account to the deposit liability: the cash/bank account for RECEIVED and REFUNDED, or the account recognising the deduction for DEDUCTED.';

-- Record a deposit event and post it in the same transaction.
--
-- Postings, with the deposit liability always the opposite leg:
--   RECEIVED  Dr cash/bank        Cr deposit liability
--   REFUNDED  Dr deposit liability Cr cash/bank
--   DEDUCTED  Dr deposit liability Cr settlement (damage recovery, etc.)
--
-- Settling unpaid rent out of a deposit is deliberately NOT a DEDUCTED event:
-- the rent is already a receivable, so it should be cleared through the normal
-- payment path against that due. Modelling it here would recognise the income
-- twice -- once when the rent due was raised, once again as a deduction.
create or replace function public.record_lease_deposit_event(
  p_lease_id uuid,
  p_event_type text,
  p_amount numeric,
  p_settlement_account_id uuid,
  p_reason text default null,
  p_event_date date default current_date
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lease record;
  v_liability_account uuid;
  v_fiscal_period_id uuid;
  v_received numeric;
  v_returned numeric;
  v_held numeric;
  v_entry_id uuid;
  v_event_id uuid;
  v_debit uuid;
  v_credit uuid;
begin
  select l.*, u.id as unit_ref
  into v_lease
  from public.unit_leases l
  join public.units u on u.id = l.unit_id
  where l.id = p_lease_id;

  if v_lease.id is null then
    raise exception 'LEASE_NOT_FOUND: عقد الإيجار غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_lease.organization_id, 'property.leases.manage') then
    raise exception 'FORBIDDEN_PROPERTY_PERMISSION: غير مصرح لك بإدارة عقود الإيجار' using errcode = '42501';
  end if;

  if not public.organization_is_active(v_lease.organization_id) then
    raise exception 'ORGANIZATION_NOT_ACTIVE: المؤسسة غير نشطة' using errcode = 'P0001';
  end if;

  if p_event_type not in ('RECEIVED', 'REFUNDED', 'DEDUCTED') then
    raise exception 'INVALID_DEPOSIT_EVENT_TYPE: نوع حركة الوديعة غير صحيح' using errcode = '22023';
  end if;

  if p_amount is null or p_amount <= 0 then
    raise exception 'INVALID_AMOUNT: مبلغ حركة الوديعة يجب أن يكون موجبًا' using errcode = '22023';
  end if;

  if p_event_type <> 'RECEIVED' and (p_reason is null or btrim(p_reason) = '') then
    raise exception 'DEPOSIT_REASON_REQUIRED: يجب ذكر سبب الرد أو الخصم' using errcode = '22023';
  end if;

  -- You cannot hand back, or deduct from, money you are not holding. Checked
  -- against the event log rather than the lease's headline deposit figure, so
  -- partial refunds compose correctly.
  select
    coalesce(sum(amount) filter (where event_type = 'RECEIVED'), 0),
    coalesce(sum(amount) filter (where event_type in ('REFUNDED', 'DEDUCTED')), 0)
  into v_received, v_returned
  from public.unit_lease_deposit_events
  where lease_id = p_lease_id;

  v_held := v_received - v_returned;

  if p_event_type in ('REFUNDED', 'DEDUCTED') and p_amount > v_held then
    raise exception
      'DEPOSIT_EXCEEDS_HELD: المبلغ (%) يتجاوز الوديعة المحتفظ بها (%)', p_amount, v_held
      using errcode = 'P0001';
  end if;

  select security_deposit_liability_account_id into v_liability_account
  from public.organization_finance_settings
  where organization_id = v_lease.organization_id
  order by (property_id = v_lease.property_id) desc nulls last
  limit 1;

  if v_liability_account is null then
    raise exception
      'DEPOSIT_LIABILITY_ACCOUNT_NOT_SET: لم يُحدَّد حساب التزام ودائع التأمين في إعدادات المالية'
      using errcode = 'P0001';
  end if;

  if p_settlement_account_id is null then
    raise exception 'SETTLEMENT_ACCOUNT_REQUIRED: يجب تحديد الحساب المقابل' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.chart_of_accounts
    where id = p_settlement_account_id
      and organization_id = v_lease.organization_id
      and not is_group
  ) then
    raise exception 'SETTLEMENT_ACCOUNT_INVALID: الحساب المقابل لا ينتمي لهذه المؤسسة' using errcode = '22023';
  end if;

  select fp.id into v_fiscal_period_id
  from public.fiscal_periods fp
  where fp.organization_id = v_lease.organization_id
    and fp.status = 'OPEN'
    and p_event_date between fp.start_date and fp.end_date
  order by fp.start_date
  limit 1;

  -- Unlike a due, a deposit movement is cash that has already changed hands.
  -- There is no honest way to defer it, so refuse rather than record a cash
  -- movement the ledger cannot see.
  if v_fiscal_period_id is null then
    raise exception
      'NO_OPEN_FISCAL_PERIOD: لا توجد فترة مالية مفتوحة تغطي تاريخ الحركة (%)', p_event_date
      using errcode = 'P0001';
  end if;

  if p_event_type = 'RECEIVED' then
    v_debit := p_settlement_account_id;
    v_credit := v_liability_account;
  else
    v_debit := v_liability_account;
    v_credit := p_settlement_account_id;
  end if;

  insert into public.unit_lease_deposit_events
    (lease_id, event_type, amount, reason, event_date, settlement_account_id, created_by)
  values
    (p_lease_id, p_event_type, p_amount, p_reason, p_event_date, p_settlement_account_id, auth.uid())
  returning id into v_event_id;

  v_entry_id := public.create_journal_entry_internal(
    v_lease.organization_id,
    v_lease.property_id,
    v_fiscal_period_id,
    p_event_date,
    case p_event_type
      when 'RECEIVED' then 'Security deposit received'
      when 'REFUNDED' then 'Security deposit refunded'
      else 'Security deposit deduction'
    end || coalesce(' — ' || p_reason, ''),
    'JOURNAL_VOUCHER',
    jsonb_build_array(
      jsonb_build_object('account_id', v_debit, 'debit', p_amount, 'credit', 0),
      jsonb_build_object('account_id', v_credit, 'debit', 0, 'credit', p_amount)
    ),
    'deposit_event:' || v_event_id::text
  );

  perform public.post_journal_entry_internal(v_entry_id);

  update public.unit_lease_deposit_events
  set journal_entry_id = v_entry_id where id = v_event_id;

  insert into public.platform_audit_logs (
    actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary
  ) values (
    auth.uid(), v_lease.organization_id, v_lease.property_id,
    'lease_deposit.' || lower(p_event_type), 'unit_lease_deposit_event', v_event_id,
    jsonb_build_object('lease_id', p_lease_id, 'amount', p_amount, 'held_after',
                       case when p_event_type = 'RECEIVED' then v_held + p_amount else v_held - p_amount end)
  );

  return v_event_id;
end;
$$;

-- Running deposit position for a lease, derived from the event log rather than
-- a stored balance so it cannot drift from its own history.
create or replace function public.get_lease_deposit_summary(
  p_lease_id uuid
)
returns table (
  received_total numeric,
  refunded_total numeric,
  deducted_total numeric,
  held_total numeric,
  agreed_amount numeric,
  event_count int
)
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_org uuid;
  v_agreed numeric;
begin
  select organization_id, security_deposit_amount into v_org, v_agreed
  from public.unit_leases where id = p_lease_id;

  if v_org is null then
    raise exception 'LEASE_NOT_FOUND: عقد الإيجار غير موجود' using errcode = 'P0002';
  end if;

  if not (
    public.has_permission(auth.uid(), v_org, 'property.leases.view')
    or public.has_permission(auth.uid(), v_org, 'property.leases.manage')
  ) then
    raise exception 'FORBIDDEN_PROPERTY_PERMISSION: غير مصرح لك بالاطلاع على عقود الإيجار' using errcode = '42501';
  end if;

  return query
  select
    coalesce(sum(e.amount) filter (where e.event_type = 'RECEIVED'), 0),
    coalesce(sum(e.amount) filter (where e.event_type = 'REFUNDED'), 0),
    coalesce(sum(e.amount) filter (where e.event_type = 'DEDUCTED'), 0),
    coalesce(sum(e.amount) filter (where e.event_type = 'RECEIVED'), 0)
      - coalesce(sum(e.amount) filter (where e.event_type in ('REFUNDED', 'DEDUCTED')), 0),
    coalesce(v_agreed, 0),
    count(e.id)::int
  from public.unit_lease_deposit_events e
  where e.lease_id = p_lease_id;
end;
$$;
