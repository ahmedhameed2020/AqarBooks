CREATE OR REPLACE FUNCTION public.reverse_journal_entry(p_journal_entry_id uuid, p_reversal_fiscal_period_id uuid, p_reversal_date date, p_reason text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_original public.journal_entries;
  v_new_entry_id uuid;
  v_entry_number bigint;
  v_period public.fiscal_periods;
begin
  select * into v_original from public.journal_entries where id = p_journal_entry_id;
  if v_original.id is null then
    raise exception 'journal entry not found';
  end if;
  if v_original.status <> 'POSTED' then
    raise exception 'only posted entries can be reversed';
  end if;

  if not public.has_permission(auth.uid(), v_original.organization_id, 'finance.entries.reverse') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(v_original.organization_id) then
    raise exception 'organization is not active';
  end if;

  if v_original.source_type = 'YEAR_END_CLOSING' then
    raise exception 'CLOSING_ENTRY_NOT_REVERSIBLE';
  end if;

  -- Lock the original entry's period (by id and by entry date), then refuse if any is CLOSED or LOCKED.
  perform 1 from public.fiscal_periods p
  where p.organization_id = v_original.organization_id
    and (p.id = v_original.fiscal_period_id or v_original.entry_date between p.start_date and p.end_date)
  for share;
  if exists (
    select 1 from public.fiscal_periods p
    where p.organization_id = v_original.organization_id
      and p.status in ('CLOSED', 'LOCKED')
      and (p.id = v_original.fiscal_period_id or v_original.entry_date between p.start_date and p.end_date)
  ) then
    raise exception 'ENTRY_IN_CLOSED_PERIOD';
  end if;

  select * into v_period from public.fiscal_periods where id = p_reversal_fiscal_period_id for share;
  if v_period.id is null or v_period.organization_id <> v_original.organization_id then
    raise exception 'reversal fiscal period does not belong to this organization';
  end if;
  if v_period.status <> 'OPEN' then
    raise exception 'FISCAL_PERIOD_NOT_OPEN: reversal fiscal period is not open' using errcode = 'P0001';
  end if;

  insert into public.journal_entries (
    organization_id, property_id, fiscal_period_id, entry_date, description,
    source_type, status, reversed_entry_id, created_by, posted_by, posted_at
  ) values (
    v_original.organization_id, v_original.property_id, p_reversal_fiscal_period_id, p_reversal_date,
    coalesce(p_reason, 'Reversal of entry ' || coalesce(v_original.entry_number::text, v_original.id::text)),
    v_original.source_type, 'POSTED', v_original.id, auth.uid(), auth.uid(), now()
  )
  returning id into v_new_entry_id;

  v_entry_number := public.next_sequence_value(v_original.organization_id, null, 'journal_entry');
  update public.journal_entries set entry_number = v_entry_number where id = v_new_entry_id;

  insert into public.journal_entry_lines (journal_entry_id, line_number, account_id, description, debit, credit, cost_center_id, project_id)
  select v_new_entry_id, line_number, account_id, description, credit, debit, cost_center_id, project_id
  from public.journal_entry_lines
  where journal_entry_id = p_journal_entry_id;

  update public.journal_entries set status = 'REVERSED' where id = p_journal_entry_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (auth.uid(), v_original.organization_id, v_original.property_id, 'journal_entry.reversed', 'journal_entry', p_journal_entry_id, p_reason,
    jsonb_build_object('reversal_entry_id', v_new_entry_id, 'reversal_entry_number', v_entry_number));

  return v_new_entry_id;
end;
$function$

