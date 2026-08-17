-- Close the accrual gap: issuing a receivable must hit the general ledger.
--
-- THE PROBLEM. Four functions insert into public.dues -- issue_dues,
-- generate_recurring_dues, generate_lease_rent_dues, create_installment_plan --
-- and none of them posted a journal entry. Only 15 of 827 dues carried a
-- journal_entry_id, all from the long-since-replaced singular issue_due().
-- The consequence: Accounts Receivable and revenue were both understated on
-- the balance sheet and income statement, so the system behaved as cash-basis
-- for receivables despite carrying full accrual machinery. This contradicts
-- the original spec §17 intent, which the singular issue_due() honoured:
-- "there is no path where a due exists without its accounting effect".
--
-- WHY A TRIGGER, NOT FOUR EDITS. Patching each of the four call sites leaves
-- the invariant depending on whoever writes the fifth. A trigger makes it
-- structural: no insert path, present or future, can produce a due without
-- its ledger effect.
--
-- WHY RECOGNITION IS DEFERRED, NOT IMMEDIATE. An installment plan writes all
-- its dues up front, dated up to two years out -- 182 existing dues already
-- sit outside any open period. Posting them on creation would recognise two
-- years of revenue today, which is precisely the overstatement accrual
-- accounting exists to prevent. So a due is recognised only when an OPEN
-- fiscal period actually covers its issue_date; the rest wait, and
-- recognize_pending_dues() sweeps them in when their period opens.

-- Posts one due as Dr Receivable / Cr Revenue. Returns the entry id, or null
-- when the due is not yet recognisable.
--
-- No permission gate by design: authorization already happened when the due
-- was issued, and the ledger entry is a mechanical consequence of that act,
-- not a separately-authorised one. A collector with finance.dues.issue but
-- without finance.entries.create must still produce a correct ledger. This
-- mirrors record_payment(), which posts its own entry the same way, and is
-- why it calls the *_internal journal functions rather than the gated ones.
create or replace function public.post_due_to_ledger(p_due_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_due record;
  v_revenue_account_id uuid;
  v_fiscal_period_id uuid;
  v_entry_id uuid;
begin
  select d.*, dt.default_revenue_account_id
  into v_due
  from public.dues d
  join public.due_types dt on dt.id = d.due_type_id
  where d.id = p_due_id;

  if v_due.id is null then
    return null;
  end if;

  -- A draft is not yet a claim, and a void one never was.
  if v_due.status in ('DRAFT', 'VOID') then
    return null;
  end if;

  -- Already recognised. Makes the whole function safe to re-run, which is
  -- what lets recognize_pending_dues() be swept repeatedly without risk.
  if v_due.journal_entry_id is not null then
    return v_due.journal_entry_id;
  end if;

  v_revenue_account_id := v_due.default_revenue_account_id;
  if v_revenue_account_id is null then
    raise exception 'DUE_TYPE_HAS_NO_REVENUE_ACCOUNT: نوع المستحق لا يحمل حساب إيراد' using errcode = 'P0001';
  end if;

  select fp.id into v_fiscal_period_id
  from public.fiscal_periods fp
  where fp.organization_id = v_due.organization_id
    and fp.status = 'OPEN'
    and v_due.issue_date between fp.start_date and fp.end_date
  order by fp.start_date
  limit 1;

  -- Deferred, not failed: a future-dated installment is a real due that is
  -- simply not this period's revenue yet.
  if v_fiscal_period_id is null then
    return null;
  end if;

  v_entry_id := public.create_journal_entry_internal(
    v_due.organization_id,
    v_due.property_id,
    v_fiscal_period_id,
    v_due.issue_date,
    coalesce(v_due.description, 'Due issued'),
    'JOURNAL_VOUCHER',
    jsonb_build_array(
      jsonb_build_object('account_id', v_due.receivable_account_id, 'debit', v_due.amount, 'credit', 0),
      jsonb_build_object('account_id', v_revenue_account_id, 'debit', 0, 'credit', v_due.amount)
    ),
    -- Idempotency key doubles as the second line of defence against
    -- double-recognition, independent of the journal_entry_id check above.
    'due:' || p_due_id::text
  );

  perform public.post_journal_entry_internal(v_entry_id);

  update public.dues set journal_entry_id = v_entry_id where id = p_due_id;

  return v_entry_id;
end;
$$;

create or replace function public.trg_dues_post_to_ledger()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.post_due_to_ledger(NEW.id);
  return null;  -- AFTER trigger; return value is ignored
end;
$$;

-- AFTER, not BEFORE: post_due_to_ledger writes journal_entry_id back onto the
-- row, so the row has to exist first. The write is an UPDATE and cannot
-- re-enter this INSERT trigger.
drop trigger if exists trg_dues_post_to_ledger on public.dues;
create trigger trg_dues_post_to_ledger
  after insert on public.dues
  for each row execute function public.trg_dues_post_to_ledger();

-- Sweep the backlog when a period opens. Safe to run repeatedly: every due it
-- touches is already recognised or still deferred.
create or replace function public.recognize_pending_dues(
  p_organization_id uuid,
  p_fiscal_period_id uuid
)
returns int
language plpgsql
security definer
set search_path = public
as $$
declare
  v_period record;
  v_due_id uuid;
  v_count int := 0;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.entries.post') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بترحيل القيود' using errcode = '42501';
  end if;

  select * into v_period
  from public.fiscal_periods
  where id = p_fiscal_period_id and organization_id = p_organization_id;

  if v_period.id is null then
    raise exception 'FISCAL_PERIOD_NOT_FOUND: الفترة المالية غير موجودة' using errcode = 'P0002';
  end if;

  if v_period.status <> 'OPEN' then
    raise exception 'FISCAL_PERIOD_NOT_OPEN: لا يمكن الاعتراف بالمستحقات في فترة غير مفتوحة' using errcode = 'P0001';
  end if;

  for v_due_id in
    select d.id from public.dues d
    where d.organization_id = p_organization_id
      and d.journal_entry_id is null
      and d.status not in ('DRAFT', 'VOID')
      and d.issue_date between v_period.start_date and v_period.end_date
    order by d.issue_date, d.id
  loop
    if public.post_due_to_ledger(v_due_id) is not null then
      v_count := v_count + 1;
    end if;
  end loop;

  return v_count;
end;
$$;

-- Visibility: what has been issued but not yet recognised, so a deferred
-- balance is a number someone can see rather than a silent omission.
create or replace function public.get_unrecognized_dues_summary(
  p_organization_id uuid
)
returns table (
  pending_count int,
  pending_total numeric,
  earliest_issue_date date,
  latest_issue_date date
)
language plpgsql
stable
security definer
set search_path = public
as $$
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.reports.read') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على التقارير المالية' using errcode = '42501';
  end if;

  return query
  select count(*)::int, coalesce(sum(d.amount), 0), min(d.issue_date), max(d.issue_date)
  from public.dues d
  where d.organization_id = p_organization_id
    and d.journal_entry_id is null
    and d.status not in ('DRAFT', 'VOID');
end;
$$;
