-- Phase 7: reporting functions. Read-only, SECURITY DEFINER only so a
-- single call can aggregate across journal_entries + journal_entry_lines
-- without exposing those tables' full row set through RLS-filtered
-- multi-query round trips -- but every function still re-checks
-- authorization itself, exactly like the write-side functions.

-- Per-account debit/credit totals for POSTED entries with entry_date in
-- [p_start_date, p_end_date]. Used two ways by the UI:
--   - Trial Balance / Balance Sheet: p_start_date = organization inception,
--     p_end_date = as-of date (cumulative balance).
--   - Income Statement: p_start_date/p_end_date = the reporting period
--     (flow, not cumulative).
create or replace function public.get_trial_balance(
  p_organization_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  account_id uuid,
  code text,
  name_ar text,
  name_en text,
  category text,
  normal_balance text,
  total_debit numeric,
  total_credit numeric,
  balance numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    a.id,
    a.code,
    a.name_ar,
    a.name_en,
    a.category,
    a.normal_balance,
    coalesce(sum(l.debit), 0) as total_debit,
    coalesce(sum(l.credit), 0) as total_credit,
    case when a.normal_balance = 'DEBIT'
      then coalesce(sum(l.debit), 0) - coalesce(sum(l.credit), 0)
      else coalesce(sum(l.credit), 0) - coalesce(sum(l.debit), 0)
    end as balance
  from public.chart_of_accounts a
  left join public.journal_entry_lines l on l.account_id = a.id
  left join public.journal_entries je on je.id = l.journal_entry_id
    and je.status = 'POSTED'
    and je.entry_date between p_start_date and p_end_date
  where a.organization_id = p_organization_id
    and public.is_org_member(auth.uid(), p_organization_id)
    and not a.is_group
  group by a.id, a.code, a.name_ar, a.name_en, a.category, a.normal_balance
  order by a.code;
$$;

-- Account movement detail with a running balance, for the General Ledger
-- account-detail view.
create or replace function public.get_account_ledger(
  p_organization_id uuid,
  p_account_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  entry_id uuid,
  entry_number bigint,
  entry_date date,
  description text,
  debit numeric,
  credit numeric,
  running_balance numeric
)
language sql
stable
security definer
set search_path = public
as $$
  select
    je.id,
    je.entry_number,
    je.entry_date,
    coalesce(l.description, je.description),
    l.debit,
    l.credit,
    sum(
      case when a.normal_balance = 'DEBIT' then l.debit - l.credit else l.credit - l.debit end
    ) over (order by je.entry_date, je.entry_number, l.id) as running_balance
  from public.journal_entry_lines l
  join public.journal_entries je on je.id = l.journal_entry_id
  join public.chart_of_accounts a on a.id = l.account_id
  where a.id = p_account_id
    and a.organization_id = p_organization_id
    and public.is_org_member(auth.uid(), p_organization_id)
    and je.status = 'POSTED'
    and je.entry_date between p_start_date and p_end_date
  order by je.entry_date, je.entry_number, l.id;
$$;
