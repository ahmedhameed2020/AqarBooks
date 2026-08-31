create or replace function public.get_unit_legacy_financial_accounts(
  p_organization_id uuid,
  p_unit_id uuid
)
returns table (
  account_id uuid,
  account_code text,
  legacy_account_name text,
  current_member_name text,
  source_debit numeric,
  source_credit numeric,
  source_net numeric,
  staging_debit numeric,
  staging_credit numeric,
  staging_net numeric
)
language plpgsql
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
    l.legacy_account_id,
    l.legacy_account_code,
    coalesce(a.name_ar, a.name_en, l.legacy_account_code),
    coalesce(m.full_name, ''),
    l.source_debit,
    l.source_credit,
    l.source_net,
    l.staging_debit,
    l.staging_credit,
    l.staging_net
  from legacy_import.member_financial_links l
  join public.chart_of_accounts a
    on a.id = l.legacy_account_id
   and a.organization_id = p_organization_id
  left join public.members m
    on m.id = l.member_id
   and m.organization_id = p_organization_id
  where l.organization_id = p_organization_id
    and l.unit_id = p_unit_id
    and l.match_status in ('AUTO_CONFIRMED', 'REVIEW_REQUIRED')
    and l.resolution_status in ('NOT_APPLICABLE', 'APPROVED')
  order by l.legacy_account_code;
end;
$function$;

revoke all on function public.get_unit_legacy_financial_accounts(uuid, uuid) from public;
revoke all on function public.get_unit_legacy_financial_accounts(uuid, uuid) from anon;
grant execute on function public.get_unit_legacy_financial_accounts(uuid, uuid) to authenticated;
grant execute on function public.get_unit_legacy_financial_accounts(uuid, uuid) to service_role;

comment on function public.get_unit_legacy_financial_accounts(uuid, uuid)
is 'Returns accepted legacy financial-account links for a unit. Financial audit reference only; not ownership evidence.';
