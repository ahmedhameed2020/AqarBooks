-- Flag non-zero legacy receivable accounts that are not represented by the
-- current property/member master. This is an audit classification only;
-- it never creates units, members, ownerships, or journal corrections.

alter table legacy_import.financial_master_data_findings
  drop constraint if exists financial_master_data_findings_finding_type_check;

alter table legacy_import.financial_master_data_findings
  add constraint financial_master_data_findings_finding_type_check
  check (finding_type in (
    'BANK_ACCOUNT_IDENTIFIER_MISSING',
    'RECEIVABLE_ACCOUNT_OUTSIDE_PROPERTY_MASTER'
  ));

with target_org as (
  select id
  from public.organizations
  where slug = 'marsa-bagoush-north-coast'
), account_balances as (
  select
    a.organization_id,
    a.id as account_id,
    a.code,
    coalesce(nullif(trim(a.name_ar), ''), nullif(trim(a.name_en), ''), a.code) as account_name,
    coalesce(sum(case when je.status = 'POSTED' then jel.debit - jel.credit else 0 end), 0)::numeric as net_balance,
    max(je.entry_date) filter (where je.status = 'POSTED') as last_activity_date
  from public.chart_of_accounts a
  join target_org o on o.id = a.organization_id
  left join public.journal_entry_lines jel on jel.account_id = a.id
  left join public.journal_entries je
    on je.id = jel.journal_entry_id
   and je.organization_id = a.organization_id
  where a.code like '142%'
    and not a.is_group
  group by a.organization_id, a.id, a.code, a.name_ar, a.name_en
), source_accounts as (
  select distinct on (r.organization_id, trim(r.payload->>'حم4'))
    r.organization_id,
    trim(r.payload->>'حم4') as account_code,
    nullif(trim(r.payload->>'قطاع'), '') as source_sector,
    nullif(trim(r.payload->>'الوحدة'), '') as source_unit,
    nullif(trim(r.payload->>'اسم ح4'), '') as source_name,
    r.source_row_number
  from legacy_import.rows r
  join target_org o on o.id = r.organization_id
  where r.source_table = 'حم4'
    and nullif(trim(r.payload->>'حم4'), '') is not null
  order by r.organization_id, trim(r.payload->>'حم4'), r.source_row_number
), source_sectors as (
  select distinct on (r.organization_id, trim(r.payload->>'Sect'))
    r.organization_id,
    trim(r.payload->>'Sect') as sector_code,
    nullif(trim(r.payload->>'SecTitle'), '') as sector_title
  from legacy_import.rows r
  join target_org o on o.id = r.organization_id
  where r.source_table = 'قطاعات'
    and nullif(trim(r.payload->>'Sect'), '') is not null
  order by r.organization_id, trim(r.payload->>'Sect'), r.source_row_number
), candidates as (
  select
    b.*,
    s.source_sector,
    s.source_unit,
    coalesce(s.source_name, b.account_name) as source_name,
    s.source_row_number,
    ss.sector_title
  from account_balances b
  left join source_accounts s
    on s.organization_id = b.organization_id
   and s.account_code = b.code
  left join source_sectors ss
    on ss.organization_id = b.organization_id
   and ss.sector_code = s.source_sector
  where abs(b.net_balance) > 0.005
    and not exists (
      select 1
      from legacy_import.member_financial_links m
      where m.organization_id = b.organization_id
        and m.legacy_account_code = b.code
    )
    and not exists (
      select 1
      from legacy_import.unit_financial_account_links u
      where u.organization_id = b.organization_id
        and u.legacy_account_code = b.code
    )
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
  c.organization_id,
  'RECEIVABLE_ACCOUNT_OUTSIDE_PROPERTY_MASTER',
  'HIGH',
  'OPEN',
  'GL_RECEIVABLE_ACCOUNT',
  c.code,
  'Non-zero legacy receivable account is outside the current property/member master',
  'Approved property/ownership master or management confirmation identifying whether this legacy sector/unit remains in the managed scope. If in scope, provide the current unit and owner/member identity for explicit linking. If out of scope, approve classification as a historical or external receivable without creating a current ownership link.',
  jsonb_build_object(
    'gl_account_id', c.account_id,
    'gl_account_code', c.code,
    'gl_account_name', c.account_name,
    'gl_balance', c.net_balance,
    'last_activity_date', c.last_activity_date,
    'legacy_source_table', 'حم4',
    'legacy_source_row_number', c.source_row_number,
    'legacy_source_sector', c.source_sector,
    'legacy_source_sector_title', c.sector_title,
    'legacy_source_unit', c.source_unit,
    'legacy_source_name', c.source_name,
    'current_property_master_link_found', false,
    'policy', 'NO_AUTOMATIC_UNIT_OR_OWNER_CREATION_FROM_FINANCIAL_ACCOUNT'
  )
from candidates c
on conflict (organization_id, finding_type, entity_key) do update
set severity = excluded.severity,
    requested_evidence = excluded.requested_evidence,
    evidence = excluded.evidence,
    updated_at = now();
