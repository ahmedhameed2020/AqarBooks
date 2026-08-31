-- Legacy financial governance normalization and bank master-data findings.
-- No imported journal entry or journal line is modified by this migration.

-- 1) Normalize historical fiscal metadata for the Bagosh legacy tenant.
-- The migration locates the tenant by stable slug rather than hard-coding generated IDs.
with target_org as (
  select id
  from public.organizations
  where slug = 'marsa-bagoush-north-coast'
)
update public.fiscal_periods fp
set status = 'CLOSED'
from public.fiscal_years fy, target_org o
where fp.fiscal_year_id = fy.id
  and fp.organization_id = o.id
  and fy.organization_id = o.id
  and fy.name like 'Legacy %'
  and fy.end_date < date '2026-01-01'
  and fp.status = 'PLANNED'
  and not exists (
    select 1
    from public.journal_entries je
    where je.fiscal_period_id = fp.id
  );

with target_org as (
  select id
  from public.organizations
  where slug = 'marsa-bagoush-north-coast'
)
update public.fiscal_years fy
set status = 'CLOSED'
from target_org o
where fy.organization_id = o.id
  and fy.name like 'Legacy %'
  and fy.end_date < date '2026-01-01'
  and fy.status = 'PLANNED';

with target_org as (
  select id
  from public.organizations
  where slug = 'marsa-bagoush-north-coast'
)
update public.fiscal_years fy
set status = 'OPEN'
from target_org o
where fy.organization_id = o.id
  and fy.name = 'Legacy 2026'
  and fy.start_date = date '2026-01-01'
  and fy.end_date = date '2026-12-31'
  and fy.status = 'PLANNED';

-- 2) Keep operational-bank setup gaps in a separate, auditable register.
-- We deliberately do not invent account numbers from GL codes or cheque references.
create table if not exists legacy_import.financial_master_data_findings (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  finding_type text not null check (finding_type in ('BANK_ACCOUNT_IDENTIFIER_MISSING')),
  severity text not null check (severity in ('LOW', 'MEDIUM', 'HIGH')),
  status text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED', 'DISMISSED')),
  entity_type text not null,
  entity_key text not null,
  title text not null,
  requested_evidence text not null,
  evidence jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, finding_type, entity_key)
);

create index if not exists financial_master_data_findings_org_status_idx
  on legacy_import.financial_master_data_findings (organization_id, status, severity);

alter table legacy_import.financial_master_data_findings enable row level security;
revoke all on legacy_import.financial_master_data_findings from public, anon, authenticated;

with target_org as (
  select id
  from public.organizations
  where slug = 'marsa-bagoush-north-coast'
), bank_gl as (
  select
    a.organization_id,
    a.id as account_id,
    a.code,
    coalesce(nullif(trim(a.name_ar), ''), nullif(trim(a.name_en), ''), a.code) as account_name,
    a.is_active,
    a.is_used,
    coalesce(sum(case when je.status = 'POSTED' then jel.debit - jel.credit else 0 end), 0)::numeric as gl_balance,
    max(je.entry_date) filter (where je.status = 'POSTED') as last_activity_date
  from public.chart_of_accounts a
  join target_org o on o.id = a.organization_id
  left join public.journal_entry_lines jel on jel.account_id = a.id
  left join public.journal_entries je
    on je.id = jel.journal_entry_id
   and je.organization_id = a.organization_id
  where a.category = 'ASSET'
    and a.is_cash_equivalent
    and a.name_ar ilike '%بنك%'
  group by a.organization_id, a.id, a.code, a.name_ar, a.name_en, a.is_active, a.is_used
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
  g.organization_id,
  'BANK_ACCOUNT_IDENTIFIER_MISSING',
  case when abs(g.gl_balance) > 0.005 then 'HIGH' else 'LOW' end,
  'OPEN',
  'GL_BANK_ACCOUNT',
  g.code,
  'Operational bank account is not configured for legacy GL account ' || g.code,
  'Official bank statement or account-opening confirmation showing bank name, account number or IBAN, currency, and whether the account is still active.',
  jsonb_build_object(
    'gl_account_id', g.account_id,
    'gl_account_code', g.code,
    'gl_account_name', g.account_name,
    'gl_balance', g.gl_balance,
    'last_activity_date', g.last_activity_date,
    'is_active', g.is_active,
    'is_used', g.is_used,
    'legacy_source_account_number_found', false,
    'policy', 'DO_NOT_FABRICATE_BANK_ACCOUNT_IDENTIFIER'
  )
from bank_gl g
where not exists (
  select 1
  from public.bank_accounts ba
  where ba.organization_id = g.organization_id
    and ba.gl_account_id = g.account_id
)
on conflict (organization_id, finding_type, entity_key) do update
set severity = excluded.severity,
    requested_evidence = excluded.requested_evidence,
    evidence = excluded.evidence,
    updated_at = now();

create or replace function public.list_legacy_financial_master_data_findings(
  p_organization_id uuid,
  p_status text default null
)
returns table (
  finding_id bigint,
  finding_type text,
  severity text,
  status text,
  entity_type text,
  entity_key text,
  title text,
  requested_evidence text,
  evidence jsonb,
  created_at timestamptz
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

  return query
  select
    f.id,
    f.finding_type,
    f.severity,
    f.status,
    f.entity_type,
    f.entity_key,
    f.title,
    f.requested_evidence,
    f.evidence,
    f.created_at
  from legacy_import.financial_master_data_findings f
  where f.organization_id = p_organization_id
    and (p_status is null or f.status = p_status)
  order by
    case f.severity when 'HIGH' then 1 when 'MEDIUM' then 2 else 3 end,
    f.entity_key;
end;
$function$;

revoke all on function public.list_legacy_financial_master_data_findings(uuid, text) from public;
revoke all on function public.list_legacy_financial_master_data_findings(uuid, text) from anon;
grant execute on function public.list_legacy_financial_master_data_findings(uuid, text) to authenticated;
grant execute on function public.list_legacy_financial_master_data_findings(uuid, text) to service_role;

-- 3) Extend the existing Production readiness decision without changing its API shape.
-- Existing callers continue to receive the same columns, while counts now include
-- both documentary findings and master-data findings.
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
  v_latest_doc_finding_at timestamptz;
  v_latest_master_finding_at timestamptz;
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
    v_latest_doc_finding_at,
    v_open_total,
    v_open_high,
    v_open_medium,
    v_open_low,
    v_open_difference_total
  from legacy_import.financial_review_findings f
  where f.organization_id = p_organization_id;

  select
    max(f.created_at),
    v_open_total + count(*) filter (where f.status = 'OPEN'),
    v_open_high + count(*) filter (where f.status = 'OPEN' and f.severity = 'HIGH'),
    v_open_medium + count(*) filter (where f.status = 'OPEN' and f.severity = 'MEDIUM'),
    v_open_low + count(*) filter (where f.status = 'OPEN' and f.severity = 'LOW')
  into
    v_latest_master_finding_at,
    v_open_total,
    v_open_high,
    v_open_medium,
    v_open_low
  from legacy_import.financial_master_data_findings f
  where f.organization_id = p_organization_id;

  v_latest_finding_at := case
    when v_latest_doc_finding_at is null then v_latest_master_finding_at
    when v_latest_master_finding_at is null then v_latest_doc_finding_at
    else greatest(v_latest_doc_finding_at, v_latest_master_finding_at)
  end;

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

comment on function public.get_legacy_financial_readiness(uuid)
is 'Production-readiness gate for imported legacy financial data. Counts documentary and financial master-data findings; never mutates imported journals.';
