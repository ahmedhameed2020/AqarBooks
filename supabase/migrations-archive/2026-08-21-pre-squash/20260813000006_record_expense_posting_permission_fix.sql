-- Same bug class as 20260813000005 (record_payment): record_expense does
-- its own resort-scoped finance.entries.create check up front, then calls
-- the PUBLIC create_journal_entry (fine, same permission, redundant but
-- harmless) followed by the PUBLIC post_journal_entry -- which requires
-- finance.entries.post independently. ACCOUNTANT (and any other role whose
-- only route to recording an expense is finance.entries.create without
-- finance.entries.post) would get "not authorized" trying to record any
-- expense at all, exactly like the record_payment bug.
--
-- NOTE (documented for the follow-up, not fixed here): a broader grep of
-- "perform public.post_journal_entry(" across the migration history shows
-- 17 call sites sharing this same pattern -- supplier invoice/payment
-- RPCs, purchasing, bank reconciliation, and void operations, in addition
-- to record_payment (already fixed) and record_expense (fixed below).
-- Those need the same kind of scoped audit (confirm which are the live,
-- non-superseded definition; confirm each already gates on its own
-- resort-scoped permission before delegating) before applying the same
-- _internal swap -- out of scope for this migration.

create or replace function public.record_expense(
  p_organization_id uuid,
  p_resort_id uuid,
  p_expense_category_id uuid,
  p_description text,
  p_amount numeric,
  p_expense_date date,
  p_payment_account_id uuid,
  p_fiscal_period_id uuid,
  p_cashier_session_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_expense_account_id uuid;
  v_entry_id uuid;
  v_expense_id uuid;
  v_voucher_number bigint;
  v_session public.cashier_sessions;
begin
  if p_resort_id is null then
    raise exception 'RESORT_REQUIRED: يرجى اختيار الموقع' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.resorts where id = p_resort_id and organization_id = p_organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;

  if not public.has_financial_permission(p_organization_id, 'finance.entries.create', p_resort_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية تسجيل مصروف في هذا الموقع' using errcode = '42501';
  end if;

  if p_amount <= 0 then
    raise exception 'مبلغ يجب أن يكون أكبر من صفر';
  end if;

  select default_expense_account_id into v_expense_account_id
  from public.expense_categories where id = p_expense_category_id and organization_id = p_organization_id;
  if v_expense_account_id is null then
    raise exception 'expense category does not belong to this organization';
  end if;

  if p_cashier_session_id is not null then
    select * into v_session from public.cashier_sessions where id = p_cashier_session_id;
    if v_session.id is null or v_session.organization_id <> p_organization_id then
      raise exception 'cashier session does not belong to this organization';
    end if;
    if v_session.status <> 'OPEN' then
      raise exception 'cashier session is not open';
    end if;
    if not exists (
      select 1 from public.cashboxes where id = v_session.cashbox_id and gl_account_id = p_payment_account_id
    ) then
      raise exception 'payment account does not match this cashier session''s cashbox';
    end if;
  end if;

  -- Uses the _internal variants (see 20260813000005): the
  -- finance.entries.create check above already authorizes this whole
  -- atomic "record expense + post its own entry" action, so it doesn't
  -- re-demand finance.entries.post from the same caller.
  v_entry_id := public.create_journal_entry_internal(
    p_organization_id, p_resort_id, p_fiscal_period_id, p_expense_date,
    coalesce(p_description, 'Expense'), 'JOURNAL_VOUCHER',
    jsonb_build_array(
      jsonb_build_object('account_id', v_expense_account_id, 'debit', p_amount, 'credit', 0),
      jsonb_build_object('account_id', p_payment_account_id, 'debit', 0, 'credit', p_amount)
    ),
    null
  );
  perform public.post_journal_entry_internal(v_entry_id);

  v_voucher_number := public.next_sequence_value(p_organization_id, null, 'expense');

  insert into public.expenses (
    organization_id, resort_id, expense_category_id, description, amount, expense_date,
    payment_account_id, voucher_number, journal_entry_id, cashier_session_id, created_by
  ) values (
    p_organization_id, p_resort_id, p_expense_category_id, p_description, p_amount, p_expense_date,
    p_payment_account_id, v_voucher_number, v_entry_id, p_cashier_session_id, auth.uid()
  )
  returning id into v_expense_id;

  if p_cashier_session_id is not null then
    insert into public.cash_transactions (organization_id, session_id, type, amount, description, created_by)
    values (p_organization_id, p_cashier_session_id, 'PAYMENT', p_amount, 'Expense ' || v_expense_id, auth.uid());
  end if;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'expense.recorded', 'expense', v_expense_id,
    jsonb_build_object('amount', p_amount, 'voucher_number', v_voucher_number));

  return v_expense_id;
end;
$$;

notify pgrst, 'reload schema';
