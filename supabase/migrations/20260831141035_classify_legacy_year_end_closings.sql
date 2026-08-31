create table if not exists legacy_import.financial_entry_classifications (
  organization_id uuid not null references public.organizations(id) on delete restrict,
  journal_entry_id uuid not null references public.journal_entries(id) on delete restrict,
  classification text not null check (classification in ('YEAR_END_CLOSE')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  primary key (organization_id, journal_entry_id)
);

alter table legacy_import.financial_entry_classifications enable row level security;
revoke all on legacy_import.financial_entry_classifications from public, anon, authenticated;

insert into legacy_import.financial_entry_classifications (
  organization_id,
  journal_entry_id,
  classification,
  evidence
)
select
  je.organization_id,
  je.id,
  'YEAR_END_CLOSE',
  jsonb_build_object(
    'basis', 'legacy_description_and_balancing_pattern',
    'entry_number', je.entry_number,
    'entry_date', je.entry_date,
    'description', je.description
  )
from public.journal_entries je
where je.organization_id = '7ae0f08d-b15c-4af7-95df-c08931a400e2'
  and (
    (je.entry_number in (14778, 14779) and je.entry_date = date '2025-01-01' and je.description = 'تسوية قيود اقفال عام 2024')
    or
    (je.entry_number = 15740 and je.entry_date = date '2026-01-01' and je.description = 'قيد اقفال عام 2025')
  )
on conflict (organization_id, journal_entry_id) do update
set classification = excluded.classification,
    evidence = excluded.evidence;

create or replace function public.get_income_statement(
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
    coalesce(sum(period_lines.debit), 0) as total_debit,
    coalesce(sum(period_lines.credit), 0) as total_credit,
    case
      when a.normal_balance = 'DEBIT'
        then coalesce(sum(period_lines.debit), 0) - coalesce(sum(period_lines.credit), 0)
      else coalesce(sum(period_lines.credit), 0) - coalesce(sum(period_lines.debit), 0)
    end as balance
  from public.chart_of_accounts a
  left join (
    select l.account_id, l.debit, l.credit
    from public.journal_entry_lines l
    inner join public.journal_entries je on je.id = l.journal_entry_id
    where je.organization_id = p_organization_id
      and je.status = 'POSTED'
      and je.entry_date between p_start_date and p_end_date
      and not exists (
        select 1
        from legacy_import.financial_entry_classifications c
        where c.organization_id = p_organization_id
          and c.journal_entry_id = je.id
          and c.classification = 'YEAR_END_CLOSE'
      )
  ) period_lines on period_lines.account_id = a.id
  where a.organization_id = p_organization_id
    and not a.is_group
    and a.category in ('REVENUE', 'EXPENSE')
  group by a.id, a.code, a.name_ar, a.name_en, a.category, a.normal_balance
  order by a.code;
end;
$function$;

revoke all on function public.get_income_statement(uuid, date, date) from public;
grant execute on function public.get_income_statement(uuid, date, date) to authenticated;
grant execute on function public.get_income_statement(uuid, date, date) to service_role;

