-- Treat any finding state/evidence update as a readiness-changing event.
-- No journal entry, journal line, ownership record, supplier, bank account, or asset is modified.

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
    max(greatest(f.created_at, f.updated_at)),
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
    max(greatest(f.created_at, f.updated_at)),
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

revoke all on function public.get_legacy_financial_readiness(uuid) from public;
revoke all on function public.get_legacy_financial_readiness(uuid) from anon;
grant execute on function public.get_legacy_financial_readiness(uuid) to authenticated;
grant execute on function public.get_legacy_financial_readiness(uuid) to service_role;

comment on function public.get_legacy_financial_readiness(uuid)
is 'Production-readiness gate for imported legacy financial data. Any creation or state/evidence update to documentary or master-data findings after the latest audit marks the audit stale; never mutates imported journals.';
