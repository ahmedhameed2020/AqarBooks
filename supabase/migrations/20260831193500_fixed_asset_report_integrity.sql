-- Integrity hardening for the fixed-asset report.
-- The report must be sourced from the operational fixed-assets subledger only.
-- No fixed asset is synthesized from GL names, templates, or inferred values.

alter table legacy_import.financial_master_data_findings
  drop constraint if exists financial_master_data_findings_finding_type_check;

alter table legacy_import.financial_master_data_findings
  add constraint financial_master_data_findings_finding_type_check
  check (finding_type in (
    'BANK_ACCOUNT_IDENTIFIER_MISSING',
    'RECEIVABLE_ACCOUNT_OUTSIDE_PROPERTY_MASTER',
    'PAYABLE_COUNTERPARTY_OUTSIDE_SUPPLIER_MASTER',
    'FIXED_ASSET_REGISTER_NOT_MIGRATED'
  ));

create or replace function public.get_fixed_assets_report(
  p_organization_id uuid
)
returns table (
  id uuid,
  code text,
  name_ar text,
  name_en text,
  status text,
  acquisition_date date,
  acquisition_cost numeric,
  salvage_value numeric,
  useful_life_months integer,
  accumulated_depreciation numeric,
  net_book_value numeric,
  periods_posted bigint
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public
as $function$
begin
  if auth.uid() is null or not (
    public.has_permission(auth.uid(), p_organization_id, 'finance.reports.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.audit.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.assets.read')
    or public.has_permission(auth.uid(), p_organization_id, 'finance.assets.manage')
  ) then
    raise exception 'permission denied' using errcode='42501';
  end if;

  return query
  select
    a.id,
    a.code,
    a.name_ar,
    a.name_en,
    a.status,
    a.acquisition_date,
    a.acquisition_cost,
    a.salvage_value,
    a.useful_life_months,
    coalesce(d.total,0)::numeric,
    (a.acquisition_cost-coalesce(d.total,0))::numeric,
    coalesce(d.periods,0)::bigint
  from public.fixed_assets a
  left join lateral (
    select sum(x.amount)::numeric as total,count(*)::bigint as periods
    from public.fixed_asset_depreciation x
    where x.organization_id=p_organization_id
      and x.fixed_asset_id=a.id
  ) d on true
  where a.organization_id=p_organization_id
  order by (a.status <> 'ACTIVE'),a.code;
end;
$function$;

revoke all on function public.get_fixed_assets_report(uuid) from public;
revoke all on function public.get_fixed_assets_report(uuid) from anon;
grant execute on function public.get_fixed_assets_report(uuid) to authenticated;
grant execute on function public.get_fixed_assets_report(uuid) to service_role;

comment on function public.get_fixed_assets_report(uuid)
is 'Fixed-asset report source. Returns only persisted fixed_assets and posted depreciation data; never synthesizes report assets.';

with target_org as (
  select id
  from public.organizations
  where slug='marsa-bagoush-north-coast'
), evidence_base as (
  select
    o.id as organization_id,
    (select count(*) from public.fixed_assets fa where fa.organization_id=o.id) as fixed_asset_count,
    (select coalesce(sum(jel.credit-jel.debit),0)
       from public.chart_of_accounts a
       join public.journal_entry_lines jel on jel.account_id=a.id
       join public.journal_entries je on je.id=jel.journal_entry_id
      where a.organization_id=o.id
        and a.code='2240002'
        and je.organization_id=o.id
        and je.status='POSTED')::numeric as legacy_accumulated_depreciation,
    (select max(je.entry_date)
       from public.chart_of_accounts a
       join public.journal_entry_lines jel on jel.account_id=a.id
       join public.journal_entries je on je.id=jel.journal_entry_id
      where a.organization_id=o.id
        and a.code='2240002'
        and je.organization_id=o.id
        and je.status='POSTED') as last_depreciation_activity
  from target_org o
)
insert into legacy_import.financial_master_data_findings (
  organization_id,
  finding_type,
  severity,
  status,
  entity_type,
  entity_key,
  title,
  requested_evidence,
  evidence
)
select
  e.organization_id,
  'FIXED_ASSET_REGISTER_NOT_MIGRATED',
  'HIGH',
  'OPEN',
  'FIXED_ASSET_SUBLEDGER',
  'FIXED_ASSET_REGISTER',
  'Legacy fixed-asset balances exist in the GL but the operational fixed-assets register is empty',
  'Approved fixed-asset register containing asset code/name, acquisition date, historical cost, useful life, salvage value where applicable, status, and explicit GL mappings. Do not derive individual assets or depreciation schedules solely from aggregate GL balances.',
  jsonb_build_object(
    'fixed_asset_count',e.fixed_asset_count,
    'legacy_accumulated_depreciation_account','2240002',
    'legacy_accumulated_depreciation_balance',e.legacy_accumulated_depreciation,
    'last_depreciation_activity',e.last_depreciation_activity,
    'policy','NO_SYNTHETIC_FIXED_ASSETS_FROM_GL_OR_TEMPLATES'
  )
from evidence_base e
where e.fixed_asset_count=0
  and abs(e.legacy_accumulated_depreciation)>0.005
on conflict (organization_id,finding_type,entity_key) do update
set severity=excluded.severity,
    requested_evidence=excluded.requested_evidence,
    evidence=excluded.evidence,
    updated_at=now();
