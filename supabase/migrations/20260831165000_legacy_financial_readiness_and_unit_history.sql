-- Current legacy-finance readiness gate plus auditable historical unit-account links.
-- This migration never changes imported journal entries or ownership records.

create table if not exists legacy_import.unit_financial_account_links (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  unit_id uuid not null references public.units(id) on delete restrict,
  account_id uuid not null references public.chart_of_accounts(id) on delete restrict,
  legacy_account_code text not null,
  historical_name text not null,
  source_sector text,
  source_unit text,
  link_type text not null default 'HISTORICAL_UNIT_ONLY'
    check (link_type in ('HISTORICAL_UNIT_ONLY')),
  link_reason text not null,
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (organization_id, unit_id, account_id)
);

create index if not exists unit_financial_account_links_org_unit_idx
  on legacy_import.unit_financial_account_links (organization_id, unit_id, legacy_account_code);

alter table legacy_import.unit_financial_account_links enable row level security;
revoke all on legacy_import.unit_financial_account_links from public, anon, authenticated;

-- Build only deterministic unit-level links from the preserved raw legacy account master.
-- Accounts already accepted as member financial links are deliberately excluded so a
-- former owner's history can never be reassigned to a current owner by this layer.
with source_accounts as (
  select distinct on (r.organization_id, nullif(trim(r.payload->>'حم4'), ''))
    r.organization_id,
    nullif(trim(r.payload->>'حم4'), '') as account_code,
    coalesce(nullif(trim(r.payload->>'اسم ح4'), ''), nullif(trim(r.payload->>'حم4'), '')) as historical_name,
    nullif(trim(r.payload->>'قطاع'), '') as source_sector,
    nullif(trim(r.payload->>'الوحدة'), '') as source_unit,
    r.source_row_number,
    case
      when nullif(trim(r.payload->>'قطاع'), '') is not null
       and nullif(regexp_replace(coalesce(r.payload->>'الوحدة', ''), '[^0-9]', '', 'g'), '') is not null
      then upper(regexp_replace(trim(r.payload->>'قطاع'), '[[:space:]]+', '', 'g'))
           || lpad(regexp_replace(trim(r.payload->>'الوحدة'), '[^0-9]', '', 'g'), 2, '0')
      else null
    end as derived_unit_code
  from legacy_import.rows r
  where r.source_table = 'حم4'
    and nullif(trim(r.payload->>'حم4'), '') is not null
  order by r.organization_id, nullif(trim(r.payload->>'حم4'), ''), r.source_row_number
)
insert into legacy_import.unit_financial_account_links (
  organization_id,
  unit_id,
  account_id,
  legacy_account_code,
  historical_name,
  source_sector,
  source_unit,
  link_type,
  link_reason,
  evidence
)
select
  s.organization_id,
  u.id,
  a.id,
  s.account_code,
  coalesce(nullif(s.historical_name, ''), a.name_ar, a.name_en, s.account_code),
  s.source_sector,
  s.source_unit,
  'HISTORICAL_UNIT_ONLY',
  'Deterministic legacy account-master coordinates match the current unit code; account is intentionally not linked to a current member.',
  jsonb_build_object(
    'source_table', 'حم4',
    'source_row_number', s.source_row_number,
    'derived_unit_code', s.derived_unit_code,
    'link_policy', 'UNIT_HISTORY_ONLY_NO_OWNER_INHERITANCE'
  )
from source_accounts s
join public.chart_of_accounts a
  on a.organization_id = s.organization_id
 and a.code = s.account_code
 and not a.is_group
join public.units u
  on u.organization_id = s.organization_id
 and upper(trim(u.code)) = s.derived_unit_code
where s.account_code like '142%'
  and s.derived_unit_code is not null
  and not exists (
    select 1
    from legacy_import.member_financial_links m
    where m.organization_id = s.organization_id
      and m.legacy_account_code = s.account_code
  )
on conflict (organization_id, unit_id, account_id) do nothing;

create or replace function public.get_unit_legacy_historical_accounts(
  p_organization_id uuid,
  p_unit_id uuid
)
returns table (
  account_id uuid,
  account_code text,
  legacy_account_name text,
  posted_debit numeric,
  posted_credit numeric,
  posted_net numeric,
  last_activity_date date,
  link_scope text,
  warning_text text
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, legacy_import
as $function$
begin
  if auth.uid() is null
     or not public.has_permission(auth.uid(), p_organization_id, 'finance.reports.read') then
    raise exception 'permission denied'
      using errcode = '42501';
  end if;

  if not exists (
    select 1
    from public.units u
    where u.id = p_unit_id
      and u.organization_id = p_organization_id
  ) then
    raise exception 'unit not found'
      using errcode = 'P0002';
  end if;

  return query
  select
    l.account_id,
    l.legacy_account_code,
    l.historical_name,
    coalesce(sum(jel.debit) filter (where je.id is not null), 0)::numeric,
    coalesce(sum(jel.credit) filter (where je.id is not null), 0)::numeric,
    coalesce(sum(jel.debit - jel.credit) filter (where je.id is not null), 0)::numeric,
    max(je.entry_date) filter (where je.id is not null),
    l.link_type,
    'Historical unit account only; it does not automatically represent the current owner''s debt or credit.'::text
  from legacy_import.unit_financial_account_links l
  join public.chart_of_accounts a
    on a.id = l.account_id
   and a.organization_id = p_organization_id
  left join public.journal_entry_lines jel
    on jel.account_id = l.account_id
  left join public.journal_entries je
    on je.id = jel.journal_entry_id
   and je.organization_id = p_organization_id
   and je.status = 'POSTED'
  where l.organization_id = p_organization_id
    and l.unit_id = p_unit_id
  group by l.account_id, l.legacy_account_code, l.historical_name, l.link_type
  order by l.legacy_account_code;
end;
$function$;

revoke all on function public.get_unit_legacy_historical_accounts(uuid, uuid) from public;
revoke all on function public.get_unit_legacy_historical_accounts(uuid, uuid) from anon;
grant execute on function public.get_unit_legacy_historical_accounts(uuid, uuid) to authenticated;
grant execute on function public.get_unit_legacy_historical_accounts(uuid, uuid) to service_role;

comment on function public.get_unit_legacy_historical_accounts(uuid, uuid)
is 'Returns deterministic former/historical unit-level legacy accounts that are intentionally not inherited by the current owner.';

create or replace function public.get_legacy_financial_readiness(
  p_organization_id uuid
)
returns table (
  readiness_status text,
  ready_for_production boolean,
  open_total bigint,
  open_high bigint,
  open_medium bigint,
  open_low bigint,
  open_difference_total numeric,
  latest_audit_at timestamptz,
  latest_finding_at timestamptz,
  audit_is_stale boolean
)
language plpgsql
stable
security definer
set search_path = pg_catalog, public, legacy_import
as $function$
declare
  v_latest_audit_at timestamptz;
  v_latest_finding_at timestamptz;
  v_open_total bigint;
  v_open_high bigint;
  v_open_medium bigint;
  v_open_low bigint;
  v_open_difference_total numeric;
  v_audit_is_stale boolean;
begin
  if auth.uid() is null
     or not public.has_permission(auth.uid(), p_organization_id, 'finance.reports.read') then
    raise exception 'permission denied'
      using errcode = '42501';
  end if;

  if not exists (
    select 1 from public.organizations o where o.id = p_organization_id
  ) then
    raise exception 'organization not found'
      using errcode = 'P0002';
  end if;

  select max(a.executed_at)
    into v_latest_audit_at
  from legacy_import.audit_runs a
  where a.organization_id = p_organization_id;

  select
    max(f.created_at),
    count(*) filter (where f.status = 'OPEN'),
    count(*) filter (where f.status = 'OPEN' and f.severity = 'HIGH'),
    count(*) filter (where f.status = 'OPEN' and f.severity = 'MEDIUM'),
    count(*) filter (where f.status = 'OPEN' and f.severity = 'LOW'),
    coalesce(sum(abs(f.difference)) filter (where f.status = 'OPEN'), 0)
  into
    v_latest_finding_at,
    v_open_total,
    v_open_high,
    v_open_medium,
    v_open_low,
    v_open_difference_total
  from legacy_import.financial_review_findings f
  where f.organization_id = p_organization_id;

  v_audit_is_stale := v_latest_audit_at is null
    or (v_latest_finding_at is not null and v_latest_finding_at > v_latest_audit_at);

  return query
  select
    case when v_open_total = 0 and not v_audit_is_stale then 'READY' else 'HOLD' end::text,
    (v_open_total = 0 and not v_audit_is_stale),
    v_open_total,
    v_open_high,
    v_open_medium,
    v_open_low,
    v_open_difference_total,
    v_latest_audit_at,
    v_latest_finding_at,
    v_audit_is_stale;
end;
$function$;

revoke all on function public.get_legacy_financial_readiness(uuid) from public;
revoke all on function public.get_legacy_financial_readiness(uuid) from anon;
grant execute on function public.get_legacy_financial_readiness(uuid) to authenticated;
grant execute on function public.get_legacy_financial_readiness(uuid) to service_role;

comment on function public.get_legacy_financial_readiness(uuid)
is 'Current production-readiness gate for imported legacy financial data. Any open documentary finding or a stale audit gate returns HOLD.';
