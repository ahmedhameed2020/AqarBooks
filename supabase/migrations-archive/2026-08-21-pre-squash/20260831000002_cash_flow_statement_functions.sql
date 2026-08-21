-- Cash Flow Statement, part 2 of 2: the reporting functions.
--
-- DIRECT METHOD. Because every cash movement in this system already exists as
-- a posted journal line, we can report actual receipts and payments instead of
-- reconstructing them indirectly from net income plus working-capital deltas.
--
-- How a cash movement is attributed to an account:
--   Take every POSTED entry in the period that touches at least one
--   is_cash_equivalent account. Within such an entry, the NON-cash lines are
--   by definition the counterparts of the cash movement, and because the entry
--   balances, (credit - debit) on those lines equals the cash effect they
--   caused -- positive for an inflow, negative for an outflow.
--
--     Dr Cash 100 / Cr Revenue 100   -> Revenue line (credit-debit) = +100 in
--     Dr Expense 50 / Cr Cash 50     -> Expense line (credit-debit) =  -50 out
--     Dr Bank 990, Dr Fee 10 / Cr Till 1000
--                                    -> Fee line = -10; the Bank/Till legs are
--                                       both cash, so the internal transfer
--                                       correctly nets to zero movement.
--
-- Entries with no cash leg (a pure accrual: Dr Receivable / Cr Revenue) are
-- excluded entirely -- which is exactly the accrual-vs-cash distinction the
-- statement exists to draw.
--
-- Guaranteed to reconcile: opening cash + sum(all rows) = closing cash, for
-- any period. The report page asserts this and shows the reader the proof.

-- Cash and cash equivalents held as of the end of p_as_of_date. Cash accounts
-- are DEBIT-normal assets, so the balance is debit - credit.
create or replace function public.get_cash_position(
  p_organization_id uuid,
  p_as_of_date date
)
returns numeric
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_balance numeric;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.reports.read') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على التقارير المالية' using errcode = '42501';
  end if;

  select coalesce(sum(l.debit - l.credit), 0)
  into v_balance
  from public.journal_entry_lines l
  join public.journal_entries je on je.id = l.journal_entry_id
  join public.chart_of_accounts a on a.id = l.account_id
  where a.organization_id = p_organization_id
    and a.is_cash_equivalent
    and je.status = 'POSTED'
    and je.entry_date <= p_as_of_date;

  return v_balance;
end;
$$;

-- One row per counterpart account that moved cash in the period, tagged with
-- its activity section. net_amount > 0 is an inflow, < 0 an outflow.
create or replace function public.get_cash_flow_statement(
  p_organization_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  section text,
  account_id uuid,
  code text,
  name_ar text,
  name_en text,
  category text,
  is_classified boolean,
  net_amount numeric
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
  with cash_entries as (
    select distinct je.id
    from public.journal_entries je
    join public.journal_entry_lines l on l.journal_entry_id = je.id
    join public.chart_of_accounts a on a.id = l.account_id
    where je.organization_id = p_organization_id
      and je.status = 'POSTED'
      and je.entry_date between p_start_date and p_end_date
      and a.is_cash_equivalent
  )
  select
    -- Unclassified accounts fall back to OPERATING (the safe default for
    -- working capital) but are flagged via is_classified so the report can
    -- ask for a decision rather than pass the guess off as settled.
    coalesce(
      a.cash_flow_section,
      case when a.category = 'EQUITY' then 'FINANCING' else 'OPERATING' end
    )::text as section,
    a.id as account_id,
    a.code,
    a.name_ar,
    a.name_en,
    a.category::text,
    (a.cash_flow_section is not null) as is_classified,
    sum(l.credit - l.debit) as net_amount
  from public.journal_entry_lines l
  join cash_entries ce on ce.id = l.journal_entry_id
  join public.chart_of_accounts a on a.id = l.account_id
  where a.organization_id = p_organization_id
    and not a.is_cash_equivalent
  group by a.id, a.code, a.name_ar, a.name_en, a.category, a.cash_flow_section
  having sum(l.credit - l.debit) <> 0
  order by 1, a.code;
end;
$$;
