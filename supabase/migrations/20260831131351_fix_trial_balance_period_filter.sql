create or replace function public.get_trial_balance(
  p_organization_id uuid,
  p_start_date date,
  p_end_date date
)
returns table(
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
as $function$
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.reports.read') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على التقارير المالية'
      using errcode = '42501';
  end if;

  return query
  select
    a.id,
    a.code,
    a.name_ar,
    a.name_en,
    a.category,
    a.normal_balance,
    coalesce(sum(posted_lines.debit), 0) as total_debit,
    coalesce(sum(posted_lines.credit), 0) as total_credit,
    case
      when a.normal_balance = 'DEBIT'
        then coalesce(sum(posted_lines.debit), 0) - coalesce(sum(posted_lines.credit), 0)
      else coalesce(sum(posted_lines.credit), 0) - coalesce(sum(posted_lines.debit), 0)
    end as balance
  from public.chart_of_accounts a
  left join (
    select
      l.account_id,
      l.debit,
      l.credit
    from public.journal_entry_lines l
    inner join public.journal_entries je
      on je.id = l.journal_entry_id
    where je.organization_id = p_organization_id
      and je.status = 'POSTED'
      and je.entry_date between p_start_date and p_end_date
  ) posted_lines
    on posted_lines.account_id = a.id
  where a.organization_id = p_organization_id
    and not a.is_group
  group by a.id, a.code, a.name_ar, a.name_en, a.category, a.normal_balance
  order by a.code;
end;
$function$;

revoke all on function public.get_trial_balance(uuid, date, date) from public;
grant execute on function public.get_trial_balance(uuid, date, date) to authenticated;
grant execute on function public.get_trial_balance(uuid, date, date) to service_role;
