-- Flag material legacy payable counterparties that exist in the GL but are not
-- represented in the operational Supplier/AP master. No supplier is auto-created
-- from an account name, and no journal is changed.

alter table legacy_import.financial_master_data_findings
  drop constraint if exists financial_master_data_findings_finding_type_check;

alter table legacy_import.financial_master_data_findings
  add constraint financial_master_data_findings_finding_type_check
  check (finding_type in (
    'BANK_ACCOUNT_IDENTIFIER_MISSING',
    'RECEIVABLE_ACCOUNT_OUTSIDE_PROPERTY_MASTER',
    'PAYABLE_COUNTERPARTY_OUTSIDE_SUPPLIER_MASTER'
  ));

with target_org as (
  select id
  from public.organizations
  where slug = 'marsa-bagoush-north-coast'
), target_accounts as (
  select unnest(array['2110001','2150002','2160001'])::text as account_code
), balances as (
  select
    a.organization_id,
    a.id as account_id,
    a.code,
    coalesce(nullif(trim(a.name_ar), ''), nullif(trim(a.name_en), ''), a.code) as account_name,
    p.code as parent_code,
    coalesce(nullif(trim(p.name_ar), ''), nullif(trim(p.name_en), ''), p.code) as parent_name,
    coalesce(sum(case when je.status = 'POSTED' then jel.credit - jel.debit else 0 end), 0)::numeric as payable_balance,
    max(je.entry_date) filter (where je.status = 'POSTED') as last_activity_date
  from public.chart_of_accounts a
  join target_org o on o.id = a.organization_id
  join target_accounts t on t.account_code = a.code
  left join public.chart_of_accounts p on p.id = a.parent_id
  left join public.journal_entry_lines jel on jel.account_id = a.id
  left join public.journal_entries je
    on je.id = jel.journal_entry_id
   and je.organization_id = a.organization_id
  where a.category = 'LIABILITY'
    and not a.is_group
  group by a.organization_id, a.id, a.code, a.name_ar, a.name_en, p.code, p.name_ar, p.name_en
), source_totals as (
  select
    trim(r.payload->>'AC#') as account_code,
    sum(coalesce(nullif(r.payload->>'DB','')::numeric,0))::numeric as source_debit,
    sum(coalesce(nullif(r.payload->>'CR','')::numeric,0))::numeric as source_credit,
    count(*) as source_lines,
    count(*) filter (
      where coalesce(nullif(r.payload->>'DB','')::numeric,0)=0
        and coalesce(nullif(r.payload->>'CR','')::numeric,0)=0
    ) as source_zero_lines
  from legacy_import.rows r
  join target_org o on o.id = r.organization_id
  join target_accounts t on t.account_code = trim(r.payload->>'AC#')
  where r.source_table = 'قيد فرعي'
  group by trim(r.payload->>'AC#')
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
  b.organization_id,
  'PAYABLE_COUNTERPARTY_OUTSIDE_SUPPLIER_MASTER',
  'HIGH',
  'OPEN',
  'GL_PAYABLE_COUNTERPARTY',
  b.code,
  'Material legacy payable counterparty is outside the operational Supplier/AP master',
  'Approved counterparty/supplier master or management confirmation. If this liability remains operational, provide the legal counterparty identity and required supplier details for explicit Supplier/AP setup. If it is intentionally GL-only or historical, approve that classification without fabricating supplier data.',
  jsonb_build_object(
    'gl_account_id', b.account_id,
    'gl_account_code', b.code,
    'gl_account_name', b.account_name,
    'parent_code', b.parent_code,
    'parent_name', b.parent_name,
    'gl_balance', b.payable_balance,
    'last_activity_date', b.last_activity_date,
    'source_debit', s.source_debit,
    'source_credit', s.source_credit,
    'source_lines', s.source_lines,
    'source_zero_lines', s.source_zero_lines,
    'source_amount_verified', true,
    'current_supplier_master_count', 0,
    'policy', 'NO_AUTOMATIC_SUPPLIER_CREATION_FROM_GL_NAME'
  )
from balances b
left join source_totals s on s.account_code = b.code
where abs(b.payable_balance) > 0.005
  and not exists (
    select 1
    from public.suppliers sp
    where sp.organization_id = b.organization_id
      and sp.payable_account_id = b.account_id
  )
on conflict (organization_id, finding_type, entity_key) do update
set severity = excluded.severity,
    requested_evidence = excluded.requested_evidence,
    evidence = excluded.evidence,
    updated_at = now();
