create table if not exists legacy_import.financial_review_findings (
  id bigint generated always as identity primary key,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  journal_entry_id uuid not null references public.journal_entries(id) on delete restrict,
  finding_type text not null check (finding_type in ('DESCRIPTION_AMOUNT_MISMATCH')),
  severity text not null check (severity in ('LOW', 'MEDIUM', 'HIGH')),
  status text not null default 'OPEN' check (status in ('OPEN', 'RESOLVED', 'DISMISSED')),
  description_amount numeric,
  posted_amount numeric not null,
  difference numeric generated always as (posted_amount - coalesce(description_amount, 0)) stored,
  requested_evidence text not null,
  evidence jsonb not null default '{}'::jsonb,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (organization_id, journal_entry_id, finding_type)
);

create index if not exists financial_review_findings_org_status_idx
  on legacy_import.financial_review_findings (organization_id, status, severity);

alter table legacy_import.financial_review_findings enable row level security;
revoke all on legacy_import.financial_review_findings from public, anon, authenticated;

create or replace function public.list_legacy_financial_review_findings(
  p_organization_id uuid,
  p_status text default null
)
returns table(
  finding_id bigint, entry_id uuid, entry_number bigint, entry_date date,
  entry_description text, finding_type text, severity text, status text,
  description_amount numeric, posted_amount numeric, difference numeric,
  requested_evidence text, evidence jsonb, created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = public
as $function$
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.reports.read') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بالاطلاع على مراجعة البيانات المالية'
      using errcode = '42501';
  end if;

  return query
  select
    f.id, je.id, je.entry_number, je.entry_date, je.description,
    f.finding_type, f.severity, f.status, f.description_amount,
    f.posted_amount, f.difference, f.requested_evidence, f.evidence, f.created_at
  from legacy_import.financial_review_findings f
  inner join public.journal_entries je on je.id = f.journal_entry_id
  where f.organization_id = p_organization_id
    and je.organization_id = p_organization_id
    and (p_status is null or f.status = p_status)
  order by
    case f.severity when 'HIGH' then 1 when 'MEDIUM' then 2 else 3 end,
    je.entry_date,
    je.entry_number;
end;
$function$;

revoke all on function public.list_legacy_financial_review_findings(uuid, text) from public;
grant execute on function public.list_legacy_financial_review_findings(uuid, text) to authenticated;
grant execute on function public.list_legacy_financial_review_findings(uuid, text) to service_role;
