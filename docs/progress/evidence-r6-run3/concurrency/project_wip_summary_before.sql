CREATE OR REPLACE FUNCTION public.project_wip_summary(p_project_id uuid)
 RETURNS TABLE(capitalised numeric, released numeric, wip_balance numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_wip uuid;
begin
  select pr.wip_account_id into v_wip from public.projects pr where pr.id = p_project_id;

  return query
  select
    coalesce(sum(l.debit) filter (where l.account_id = v_wip), 0),
    coalesce(sum(l.credit) filter (where l.account_id = v_wip), 0),
    coalesce(sum(l.debit) filter (where l.account_id = v_wip), 0)
      - coalesce(sum(l.credit) filter (where l.account_id = v_wip), 0)
  from public.journal_entry_lines l
  join public.journal_entries je on je.id = l.journal_entry_id
  where l.project_id = p_project_id and je.status IN ('POSTED', 'REVERSED');
end;
$function$

