-- Phase 3 (widened scope) of the /finance/accounts security review: the
-- inventory of chart_of_accounts/get_trial_balance/get_account_ledger
-- consumers found that these two reporting RPCs only checked
-- is_org_member(), not finance.reports.read -- meaning any authenticated
-- org member (any role, including ones with zero finance permissions)
-- could call them directly via the API and pull the full trial balance /
-- account ledger for the organization, regardless of which page they were
-- on. finance.reports.read already exists, is already granted to the
-- correct operational roles (see 20260812000011_backfill_finance_permissions_for_roles.sql),
-- and is already tested for export-permission separation in
-- tests/financial-suite.ts -- it was simply never enforced by these two
-- functions. Converting them from `language sql` to `language plpgsql` so
-- they can raise the same bilingual, stable-coded exception every other
-- financial RPC in this schema uses on a permission failure.

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
    and not a.is_group
  group by a.id, a.code, a.name_ar, a.name_en, a.category, a.normal_balance
  order by a.code;
end;
$$;

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
    and je.status = 'POSTED'
    and je.entry_date between p_start_date and p_end_date
  order by je.entry_date, je.entry_number, l.id;
end;
$$;
