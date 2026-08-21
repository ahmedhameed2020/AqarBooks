-- Phase 3: the double-entry journal engine. Three entry points cover the
-- entire lifecycle; nothing else may write to journal_entries/
-- journal_entry_lines (enforced by RLS in the next migration).
--
-- Design notes:
--  - Rules that only apply once an entry is POSTED (balance, >=2 lines, no
--    group-account postings, ...) are validated in post_journal_entry, not
--    create_journal_entry -- a DRAFT is allowed to be incomplete/unbalanced
--    work in progress, matching spec §13's "Posted entry ..." phrasing.
--  - Entry numbers are assigned only at posting time (via
--    next_sequence_value, organization-wide regardless of resort) so drafts
--    never burn a number that then shows a gap in the sequence.
--  - Idempotency is enforced both by the unique (organization_id,
--    idempotency_key) constraint and by create_journal_entry returning the
--    existing row instead of erroring on a retried call.

create or replace function public.create_journal_entry(
  p_organization_id uuid,
  p_resort_id uuid,
  p_fiscal_period_id uuid,
  p_entry_date date,
  p_description text,
  p_source_type text,
  p_lines jsonb,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry_id uuid;
  v_line jsonb;
  v_line_number int := 0;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.entries.create') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'organization is not active';
  end if;

  if p_idempotency_key is not null then
    select id into v_entry_id
    from public.journal_entries
    where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
    if v_entry_id is not null then
      return v_entry_id;
    end if;
  end if;

  if not exists (
    select 1 from public.fiscal_periods
    where id = p_fiscal_period_id and organization_id = p_organization_id
  ) then
    raise exception 'fiscal period does not belong to this organization';
  end if;

  if p_lines is null or jsonb_array_length(p_lines) < 1 then
    raise exception 'at least one line is required';
  end if;

  insert into public.journal_entries (
    organization_id, resort_id, fiscal_period_id, entry_date, description,
    source_type, idempotency_key, created_by
  ) values (
    p_organization_id, p_resort_id, p_fiscal_period_id, p_entry_date, p_description,
    coalesce(p_source_type, 'JOURNAL_VOUCHER'), p_idempotency_key, auth.uid()
  )
  returning id into v_entry_id;

  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_line_number := v_line_number + 1;

    if not exists (
      select 1 from public.chart_of_accounts
      where id = (v_line ->> 'account_id')::uuid and organization_id = p_organization_id
    ) then
      raise exception 'account does not belong to this organization';
    end if;

    insert into public.journal_entry_lines (
      journal_entry_id, line_number, account_id, description, debit, credit, cost_center_id, project_id
    ) values (
      v_entry_id,
      v_line_number,
      (v_line ->> 'account_id')::uuid,
      v_line ->> 'description',
      coalesce((v_line ->> 'debit')::numeric(19, 4), 0),
      coalesce((v_line ->> 'credit')::numeric(19, 4), 0),
      nullif(v_line ->> 'cost_center_id', '')::uuid,
      nullif(v_line ->> 'project_id', '')::uuid
    );
  end loop;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'journal_entry.created', 'journal_entry', v_entry_id,
    jsonb_build_object('line_count', v_line_number));

  return v_entry_id;
end;
$$;

create or replace function public.submit_journal_entry_for_review(p_journal_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.journal_entries;
begin
  select * into v_entry from public.journal_entries where id = p_journal_entry_id;
  if v_entry.id is null then
    raise exception 'journal entry not found';
  end if;
  if not public.has_permission(auth.uid(), v_entry.organization_id, 'finance.entries.create') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_entry.status <> 'DRAFT' then
    raise exception 'only draft entries can be submitted for review';
  end if;

  update public.journal_entries
  set status = 'UNDER_REVIEW', reviewed_by = null
  where id = p_journal_entry_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id)
  values (auth.uid(), v_entry.organization_id, v_entry.resort_id, 'journal_entry.submitted_for_review', 'journal_entry', p_journal_entry_id);
end;
$$;

create or replace function public.post_journal_entry(p_journal_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_entry public.journal_entries;
  v_period public.fiscal_periods;
  v_line_count int;
  v_total_debit numeric(19, 4);
  v_total_credit numeric(19, 4);
  v_bad_account_count int;
  v_missing_cost_center_count int;
  v_entry_number bigint;
begin
  select * into v_entry from public.journal_entries where id = p_journal_entry_id;
  if v_entry.id is null then
    raise exception 'journal entry not found';
  end if;

  if not public.has_permission(auth.uid(), v_entry.organization_id, 'finance.entries.post') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(v_entry.organization_id) then
    raise exception 'organization is not active';
  end if;
  if v_entry.status not in ('DRAFT', 'UNDER_REVIEW') then
    raise exception 'only draft or under-review entries can be posted';
  end if;

  select * into v_period from public.fiscal_periods where id = v_entry.fiscal_period_id;
  if v_period.status <> 'OPEN' then
    raise exception 'fiscal period is not open';
  end if;
  if v_entry.entry_date < v_period.start_date or v_entry.entry_date > v_period.end_date then
    raise exception 'entry date does not belong to the selected period';
  end if;

  select count(*), coalesce(sum(debit), 0), coalesce(sum(credit), 0)
  into v_line_count, v_total_debit, v_total_credit
  from public.journal_entry_lines
  where journal_entry_id = p_journal_entry_id;

  if v_line_count < 2 then
    raise exception 'a posted entry requires at least two lines';
  end if;
  if v_total_debit <> v_total_credit then
    raise exception 'unbalanced entry: total debit % does not equal total credit %', v_total_debit, v_total_credit;
  end if;

  select count(*) into v_bad_account_count
  from public.journal_entry_lines l
  join public.chart_of_accounts a on a.id = l.account_id
  where l.journal_entry_id = p_journal_entry_id
    and (a.is_group or not a.is_active or a.organization_id <> v_entry.organization_id);

  if v_bad_account_count > 0 then
    raise exception 'entry contains lines posted to a group, inactive, or cross-tenant account';
  end if;

  select count(*) into v_missing_cost_center_count
  from public.journal_entry_lines l
  join public.chart_of_accounts a on a.id = l.account_id
  where l.journal_entry_id = p_journal_entry_id
    and a.requires_cost_center
    and l.cost_center_id is null;

  if v_missing_cost_center_count > 0 then
    raise exception 'one or more lines are missing a required cost center';
  end if;

  v_entry_number := public.next_sequence_value(v_entry.organization_id, null, 'journal_entry');

  update public.journal_entries
  set status = 'POSTED', posted_by = auth.uid(), posted_at = now(), entry_number = v_entry_number
  where id = p_journal_entry_id;

  update public.chart_of_accounts
  set is_used = true
  where id in (
    select account_id from public.journal_entry_lines where journal_entry_id = p_journal_entry_id
  ) and not is_used;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_entry.organization_id, v_entry.resort_id, 'journal_entry.posted', 'journal_entry', p_journal_entry_id,
    jsonb_build_object('entry_number', v_entry_number, 'total', v_total_debit));
end;
$$;

create or replace function public.reverse_journal_entry(
  p_journal_entry_id uuid,
  p_reversal_fiscal_period_id uuid,
  p_reversal_date date,
  p_reason text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
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

  select * into v_period from public.fiscal_periods where id = p_reversal_fiscal_period_id;
  if v_period.id is null or v_period.organization_id <> v_original.organization_id then
    raise exception 'reversal fiscal period does not belong to this organization';
  end if;
  if v_period.status <> 'OPEN' then
    raise exception 'reversal fiscal period is not open';
  end if;

  insert into public.journal_entries (
    organization_id, resort_id, fiscal_period_id, entry_date, description,
    source_type, status, reversed_entry_id, created_by, posted_by, posted_at
  ) values (
    v_original.organization_id, v_original.resort_id, p_reversal_fiscal_period_id, p_reversal_date,
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

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (auth.uid(), v_original.organization_id, v_original.resort_id, 'journal_entry.reversed', 'journal_entry', p_journal_entry_id, p_reason,
    jsonb_build_object('reversal_entry_id', v_new_entry_id, 'reversal_entry_number', v_entry_number));

  return v_new_entry_id;
end;
$$;
