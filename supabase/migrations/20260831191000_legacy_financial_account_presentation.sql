-- Presentation-only classification for legacy financial accounts.
-- This does not change chart-of-accounts category, normal balance, or any journal.

create table if not exists legacy_import.financial_account_presentations (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  presentation_class text not null check (presentation_class in ('CONTRA_ASSET')),
  reason text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, account_id, presentation_class)
);

create index if not exists financial_account_presentations_org_class_idx
  on legacy_import.financial_account_presentations (organization_id, presentation_class, account_id);

alter table legacy_import.financial_account_presentations enable row level security;
revoke all on legacy_import.financial_account_presentations from public, anon, authenticated;

with target_org as (
  select id
  from public.organizations
  where slug = 'marsa-bagoush-north-coast'
), target_account as (
  select a.organization_id,a.id,a.code,a.name_ar,a.category,a.normal_balance
  from public.chart_of_accounts a
  join target_org o on o.id=a.organization_id
  where a.code='2240002'
    and a.name_ar ilike '%اهلاك%'
    and a.category='LIABILITY'
    and a.normal_balance='CREDIT'
)
insert into legacy_import.financial_account_presentations (
  organization_id,account_id,presentation_class,reason,evidence
)
select
  a.organization_id,
  a.id,
  'CONTRA_ASSET',
  'Legacy accumulated depreciation is preserved in the imported chart as a credit-balance liability account, but must be presented as a deduction from gross assets in the statement of financial position.',
  jsonb_build_object(
    'account_code',a.code,
    'account_name',a.name_ar,
    'stored_category',a.category,
    'stored_normal_balance',a.normal_balance,
    'policy','PRESENTATION_ONLY_DO_NOT_RECLASSIFY_GL'
  )
from target_account a
on conflict (organization_id,account_id,presentation_class) do nothing;

create or replace function public.get_financial_account_presentations(
  p_organization_id uuid
)
returns table (
  account_id uuid,
  presentation_class text,
  reason text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, legacy_import
as $function$
begin
  if auth.uid() is null
     or not public.has_permission(auth.uid(), p_organization_id, 'finance.reports.read') then
    raise exception 'permission denied' using errcode='42501';
  end if;

  return query
  select p.account_id,p.presentation_class,p.reason
  from legacy_import.financial_account_presentations p
  join public.chart_of_accounts a
    on a.id=p.account_id
   and a.organization_id=p_organization_id
  where p.organization_id=p_organization_id
  order by a.code;
end;
$function$;

revoke all on function public.get_financial_account_presentations(uuid) from public;
revoke all on function public.get_financial_account_presentations(uuid) from anon;
grant execute on function public.get_financial_account_presentations(uuid) to authenticated;
grant execute on function public.get_financial_account_presentations(uuid) to service_role;

comment on function public.get_financial_account_presentations(uuid)
is 'Permission-checked presentation metadata for financial statements. Does not alter ledger classification or balances.';
