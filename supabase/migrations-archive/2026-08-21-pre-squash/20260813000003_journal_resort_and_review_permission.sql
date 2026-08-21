-- Journals page review, P0: two independent fixes.
--
-- 1) create_journal_entry never validated that p_resort_id belongs to
--    p_organization_id (confirmed: no check existed at all, unlike
--    record_expense/record_payment/etc which already went through this
--    exact fix). Since the resort is genuinely optional for a manual
--    journal entry (an org-level entry with resort_id = NULL is valid and
--    intentional), the fix is to route the permission check through
--    has_financial_permission(org, key, resort_id) instead of plain
--    has_permission -- it already implements exactly the three rules asked
--    for: resort belongs to the organization, resort-scoped role
--    assignments are respected ("is this resort available to this user"),
--    and organization-active status, while still allowing NULL (skips
--    resort-specific checks entirely, falls back to plain org-level
--    permission) for legitimate general entries.
--
-- 2) submit_journal_entry_for_review checked finance.entries.create instead
--    of the already-seeded-but-unused finance.entries.review -- meaning the
--    "review" step of the lifecycle had no permission boundary distinct
--    from "create". Both FINANCE_MANAGER and ACCOUNTANT already hold
--    finance.entries.review in the original seed
--    (20260810000012_phase2_seed.sql), so switching the check does not
--    lock out any role that currently relies on this action.
--
-- post_journal_entry and reverse_journal_entry already checked
-- finance.entries.post / finance.entries.reverse respectively -- no RPC
-- change needed for those two; the gap there was purely in the frontend
-- rendering Post/Reverse controls without checking those specific keys
-- (fixed in the application layer, not here).

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
  if not public.has_financial_permission(p_organization_id, 'finance.entries.create', p_resort_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية إنشاء قيود محاسبية في هذا الموقع' using errcode = '42501';
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
  if not public.has_permission(auth.uid(), v_entry.organization_id, 'finance.entries.review') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية إرسال القيود للمراجعة' using errcode = '42501';
  end if;
  if v_entry.status <> 'DRAFT' then
    raise exception 'only draft entries can be submitted for review';
  end if;

  update public.journal_entries set status = 'UNDER_REVIEW' where id = p_journal_entry_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id)
  values (auth.uid(), v_entry.organization_id, v_entry.resort_id, 'journal_entry.submitted_for_review', 'journal_entry', p_journal_entry_id);
end;
$$;
