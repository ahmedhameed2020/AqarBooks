create or replace function public.get_account_ledger(
  p_organization_id uuid,
  p_account_id uuid,
  p_start_date date,
  p_end_date date
)
returns table(
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
as $function$
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.reports.read') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على التقارير المالية'
      using errcode = '42501';
  end if;

  return query
  select
    ledger.entry_id,
    ledger.entry_number,
    ledger.entry_date,
    ledger.description,
    ledger.debit,
    ledger.credit,
    ledger.running_balance
  from (
    select
      je.id as entry_id,
      l.id as line_id,
      je.entry_number,
      je.entry_date,
      coalesce(l.description, je.description) as description,
      l.debit,
      l.credit,
      sum(
        case
          when a.normal_balance = 'DEBIT' then l.debit - l.credit
          else l.credit - l.debit
        end
      ) over (order by je.entry_date, je.entry_number, l.id) as running_balance
    from public.journal_entry_lines l
    inner join public.journal_entries je
      on je.id = l.journal_entry_id
    inner join public.chart_of_accounts a
      on a.id = l.account_id
    where a.id = p_account_id
      and a.organization_id = p_organization_id
      and je.organization_id = p_organization_id
      and je.status = 'POSTED'
      and je.entry_date <= p_end_date
  ) ledger
  where ledger.entry_date between p_start_date and p_end_date
  order by ledger.entry_date, ledger.entry_number, ledger.line_id;
end;
$function$;

revoke all on function public.get_account_ledger(uuid, uuid, date, date) from public;
grant execute on function public.get_account_ledger(uuid, uuid, date, date) to authenticated;
grant execute on function public.get_account_ledger(uuid, uuid, date, date) to service_role;

