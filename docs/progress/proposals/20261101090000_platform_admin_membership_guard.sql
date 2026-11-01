-- F1 remediation (proposal, r6 only; NOT a production migration until owner sign-off).
-- has_permission() returns true for a platform admin without membership; add the same active-membership
-- guard close_fiscal_year already carries (owner decision), to reverse_journal_entry, create_fiscal_year and
-- designate_retained_earnings_account. Each guard keeps that function's own error code: 'not authorized' (42501)
-- for create_fiscal_year/reverse_journal_entry, FORBIDDEN_CLOSE_PERMISSION (42501) for designate.
-- RED evidence: f1-platform-admin-guard-red.txt (all three succeeded before this patch).

CREATE OR REPLACE FUNCTION public.create_fiscal_year(p_organization_id uuid, p_name text, p_start_date date, p_end_date date)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
declare
  v_year_id uuid;
  v_period_start date;
  v_period_number int := 0;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.periods.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- has_permission returns true for platform admins without a membership in this
  -- organization; require an ACTIVE membership as well (owner decision, matching
  -- close_fiscal_year). A platform admin who is not a member must not act on a tenant.
  if not exists (
    select 1 from public.organization_memberships om
     where om.user_id = auth.uid()
       and om.organization_id = p_organization_id
       and om.status = 'active'
  ) then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'organization is not active';
  end if;
  if p_end_date <= p_start_date then
    raise exception 'end date must be after start date';
  end if;

  perform set_config('aqar.fiscal_write_context', 'create_fiscal_year', true);

  insert into public.fiscal_years (organization_id, name, start_date, end_date)
  values (p_organization_id, p_name, p_start_date, p_end_date)
  returning id into v_year_id;

  v_period_start := p_start_date;
  while v_period_start <= p_end_date loop
    v_period_number := v_period_number + 1;
    insert into public.fiscal_periods (
      organization_id, fiscal_year_id, period_number, name, start_date, end_date
    ) values (
      p_organization_id,
      v_year_id,
      v_period_number,
      to_char(v_period_start, 'YYYY-MM'),
      v_period_start,
      least((v_period_start + interval '1 month' - interval '1 day')::date, p_end_date)
    );
    v_period_start := (v_period_start + interval '1 month')::date;
  end loop;

  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, 'fiscal_year.created', 'fiscal_year', v_year_id,
    jsonb_build_object('name', p_name, 'periods', v_period_number));

  return v_year_id;
end;
$function$;

CREATE OR REPLACE FUNCTION public.designate_retained_earnings_account(p_organization_id uuid, p_account_id uuid)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_uid uuid := auth.uid();
BEGIN
  -- Authentication and authorization failures RAISE (SQLSTATE 42501); the messages are fixed codes, never SQL text.
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'AUTHENTICATION_REQUIRED' USING ERRCODE = '42501';
  END IF;
  IF NOT public.has_permission(v_uid, p_organization_id, 'finance.years.close') THEN
    RAISE EXCEPTION 'FORBIDDEN_CLOSE_PERMISSION' USING ERRCODE = '42501';
  END IF;

  -- has_permission returns true for platform admins without a membership in this
  -- organization; require an ACTIVE membership as well (owner decision, matching
  -- close_fiscal_year). A platform admin who is not a member must not act on a tenant.
  if not exists (
    select 1 from public.organization_memberships om
     where om.user_id = auth.uid()
       and om.organization_id = p_organization_id
       and om.status = 'active'
  ) then
    raise exception 'FORBIDDEN_CLOSE_PERMISSION' USING ERRCODE = '42501';
  end if;

  IF p_organization_id IS NULL OR p_account_id IS NULL THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'INVALID_INPUT');
  END IF;
  IF NOT public.organization_is_active(p_organization_id) THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'ORG_NOT_ACTIVE');
  END IF;

  -- Serialize designations for this organization so two concurrent calls cannot both clear and set in an interleaved way
  -- (which would violate the partial unique index with a raw error instead of a clean result).
  PERFORM pg_advisory_xact_lock(hashtext('retained_earnings_designation:' || p_organization_id::text));

  -- The target must be an active, non-group EQUITY account of this organization.
  PERFORM 1
    FROM public.chart_of_accounts coa
   WHERE coa.id = p_account_id
     AND coa.organization_id = p_organization_id
     AND coa.category = 'EQUITY'
     AND coa.is_active
     AND NOT coa.is_group
   FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('ok', false, 'error_code', 'RE_ACCOUNT_INVALID');
  END IF;

  -- Clear first (unique index), then set.
  UPDATE public.chart_of_accounts
     SET is_retained_earnings = false
   WHERE organization_id = p_organization_id
     AND is_retained_earnings
     AND id <> p_account_id;

  UPDATE public.chart_of_accounts
     SET is_retained_earnings = true
   WHERE id = p_account_id
     AND organization_id = p_organization_id;

  RETURN jsonb_build_object('ok', true, 'account_id', p_account_id);
END;
$function$;

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

  -- has_permission returns true for platform admins without a membership in this
  -- organization; require an ACTIVE membership as well (owner decision, matching
  -- close_fiscal_year). A platform admin who is not a member must not act on a tenant.
  if not exists (
    select 1 from public.organization_memberships om
     where om.user_id = auth.uid()
       and om.organization_id = v_original.organization_id
       and om.status = 'active'
  ) then
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
$function$;
