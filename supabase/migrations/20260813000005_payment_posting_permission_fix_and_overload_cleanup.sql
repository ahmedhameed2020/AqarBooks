-- P0 fix discovered by the newly-real tests/financial-suite.ts (the old
-- suite was 100% mocked and never caught this): the cashier "pay a due"
-- flow (payDueFromCashierAction -> the 12-arg record_payment overload)
-- posts its own journal entry immediately via create_journal_entry() +
-- post_journal_entry() -- both of which independently re-check the
-- caller's permissions (finance.entries.create / finance.entries.post).
-- CASHIER -- the role that actually operates this flow in production --
-- has neither of those two keys (only receivables.payments.create,
-- cashier.sessions.*, etc.), so every cash payment from an open session
-- has been failing with a bare "not authorized" ever since this function
-- existed. The same gap affects ACCOUNTANT for the same reason.
--
-- Fix (per reviewed design, not a blanket permission grant): split
-- create_journal_entry and post_journal_entry each into a public,
-- permission-checked entry point plus an *_internal variant with the
-- identical body minus the permission check. record_payment's own
-- receivables.payments.create check already authorizes "record this
-- payment and post its accounting entry" as one atomic action, so its
-- auto-generated entry now goes through the _internal path instead of
-- re-deriving authorization from finance.entries.create/finance.entries.post.
-- The public create_journal_entry/post_journal_entry RPCs -- used by the
-- manual journal-entry UI -- are completely unchanged in behavior: they
-- still require finance.entries.create/finance.entries.post exactly as
-- before, for every other caller. The _internal functions are revoked
-- from PUBLIC/authenticated (same pattern as has_financial_permission)
-- so a client can never call them directly to skip the public check.
--
-- Verification query -- run this first if you want to confirm the exact
-- live overload set before applying (matches what this migration assumes):
--
--   select p.proname, pg_get_function_identity_arguments(p.oid) as args,
--          pg_get_function_result(p.oid) as result_type
--   from pg_proc p
--   join pg_namespace n on n.oid = p.pronamespace
--   where n.nspname = 'public'
--     and p.proname in ('issue_dues', 'generate_recurring_dues', 'record_payment', 'post_journal_entry', 'create_journal_entry')
--   order by p.proname, args;
--
-- Confirmed via static analysis of every migration plus live empirical
-- testing this session (not guessed): the app only ever calls
-- record_payment with either the 6-required/5-defaulted jsonb-returning
-- signature (lib/actions/receivables.ts, the member-payment flow -- not
-- touched by this migration, it never posts a journal entry) or the
-- 12-arg uuid-returning signature with p_cashier_session_id (lib/actions/
-- treasury.ts, the cashier flow -- fixed below). The 10-arg and 11-arg
-- record_payment overloads, the 10-arg issue_dues overload (pre-audit-log
-- integration), and the 5-arg generate_recurring_dues overload are dead:
-- grepped across the entire app/ and lib/ trees, zero call sites use them.

-- ---------------------------------------------------------------------
-- 1. Drop dead overloads (superseded, zero call sites in the app).
-- ---------------------------------------------------------------------
drop function if exists public.record_payment(uuid, uuid, uuid, uuid, numeric, text, date, uuid, uuid, jsonb);
drop function if exists public.record_payment(uuid, uuid, uuid, uuid, numeric, text, date, uuid, uuid, jsonb, text);
drop function if exists public.issue_dues(uuid, uuid, uuid[], uuid, uuid, numeric, jsonb, date, date, text);
drop function if exists public.generate_recurring_dues(uuid, uuid, text, uuid, date);

-- ---------------------------------------------------------------------
-- 2. create_journal_entry: split into internal (no permission check) +
--    public (checks finance.entries.create, then delegates).
-- ---------------------------------------------------------------------
create or replace function public.create_journal_entry_internal(
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

revoke all on function public.create_journal_entry_internal(uuid, uuid, uuid, date, text, text, jsonb, text) from public;
revoke all on function public.create_journal_entry_internal(uuid, uuid, uuid, date, text, text, jsonb, text) from authenticated;

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
begin
  if not public.has_financial_permission(p_organization_id, 'finance.entries.create', p_resort_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية إنشاء قيود محاسبية في هذا الموقع' using errcode = '42501';
  end if;

  return public.create_journal_entry_internal(
    p_organization_id, p_resort_id, p_fiscal_period_id, p_entry_date,
    p_description, p_source_type, p_lines, p_idempotency_key
  );
end;
$$;

-- ---------------------------------------------------------------------
-- 3. post_journal_entry: same split, for finance.entries.post.
-- ---------------------------------------------------------------------
create or replace function public.post_journal_entry_internal(p_journal_entry_id uuid)
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

revoke all on function public.post_journal_entry_internal(uuid) from public;
revoke all on function public.post_journal_entry_internal(uuid) from authenticated;

create or replace function public.post_journal_entry(p_journal_entry_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select organization_id into v_org_id from public.journal_entries where id = p_journal_entry_id;
  if v_org_id is null then
    raise exception 'journal entry not found';
  end if;

  if not public.has_permission(auth.uid(), v_org_id, 'finance.entries.post') then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  perform public.post_journal_entry_internal(p_journal_entry_id);
end;
$$;

-- ---------------------------------------------------------------------
-- 4. record_payment (12-arg, cashier path): use the _internal variants so
--    receivables.payments.create alone authorizes the whole atomic
--    "record payment + post its own entry" action, matching every other
--    check in this function already (advisory lock, resort/session
--    validation, bilingual codes) -- unchanged otherwise.
-- ---------------------------------------------------------------------
create or replace function public.record_payment(
  p_organization_id uuid,
  p_resort_id uuid,
  p_member_id uuid,
  p_unit_id uuid,
  p_amount numeric,
  p_method text,
  p_payment_date date,
  p_deposit_account_id uuid,
  p_fiscal_period_id uuid,
  p_allocations jsonb,
  p_idempotency_key text,
  p_cashier_session_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_alloc jsonb;
  v_due public.dues;
  v_allocated_total numeric(19, 4) := 0;
  v_remaining numeric(19, 4);
  v_credit_lines jsonb := '[]'::jsonb;
  v_grouped record;
  v_entry_id uuid;
  v_payment_id uuid;
  v_receipt_number bigint;
  v_paid_so_far numeric(19, 4);
  v_new_status text;
  v_session public.cashier_sessions;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'receivables.payments.create') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية تسجيل دفعات' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'ORGANIZATION_INACTIVE: الكيان غير نشط' using errcode = '22023';
  end if;
  if p_resort_id is null then
    raise exception 'RESORT_REQUIRED: يرجى اختيار الموقع' using errcode = '22023';
  end if;
  if not exists (
    select 1 from public.resorts where id = p_resort_id and organization_id = p_organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;
  if p_amount <= 0 then
    raise exception 'AMOUNT_INVALID: يجب أن يكون المبلغ أكبر من صفر' using errcode = '22023';
  end if;
  if p_allocations is null or jsonb_array_length(p_allocations) < 1 then
    raise exception 'ALLOCATIONS_REQUIRED: يجب توزيع المبلغ على استحقاق واحد على الأقل' using errcode = '22023';
  end if;

  if p_cashier_session_id is not null then
    select * into v_session from public.cashier_sessions where id = p_cashier_session_id;
    if v_session.id is null or v_session.organization_id <> p_organization_id then
      raise exception 'CASHIER_SESSION_NOT_FOUND: جلسة الكاشير غير موجودة في هذا الكيان' using errcode = '22023';
    end if;
    if v_session.status <> 'OPEN' then
      raise exception 'CASHIER_SESSION_NOT_OPEN: جلسة الكاشير غير مفتوحة' using errcode = '22023';
    end if;
    if not exists (
      select 1 from public.cashboxes
      where id = v_session.cashbox_id and gl_account_id = p_deposit_account_id
    ) then
      raise exception 'DEPOSIT_ACCOUNT_MISMATCH: حساب الإيداع لا يطابق صندوق جلسة الكاشير' using errcode = '22023';
    end if;
  end if;

  if p_idempotency_key is not null then
    select id into v_payment_id
    from public.payments
    where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
    if v_payment_id is not null then
      return v_payment_id;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('record_payment_' || p_organization_id::text));

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    select * into v_due from public.dues where id = (v_alloc ->> 'due_id')::uuid for update;
    if v_due.id is null or v_due.organization_id <> p_organization_id then
      raise exception 'DUE_NOT_FOUND: الاستحقاق غير موجود في هذا الكيان' using errcode = '22023';
    end if;
    if v_due.resort_id <> p_resort_id then
      raise exception 'DUE_RESORT_MISMATCH: الاستحقاق % يتبع موقعًا مختلفًا عن موقع الدفعة', v_due.id using errcode = '22023';
    end if;
    if v_due.status = 'VOID' then
      raise exception 'DUE_VOID: لا يمكن سداد استحقاق ملغى' using errcode = '22023';
    end if;

    select coalesce(sum(pa.amount), 0) into v_paid_so_far
    from public.payment_allocations pa
    join public.payments p on p.id = pa.payment_id
    where pa.due_id = v_due.id and p.status = 'POSTED';

    v_remaining := v_due.amount - v_paid_so_far;
    if (v_alloc ->> 'amount')::numeric(19, 4) > v_remaining then
      raise exception 'ALLOCATION_EXCEEDS_REMAINING: المبلغ (%) أكبر من المتبقي (%) على الاستحقاق %', v_alloc ->> 'amount', v_remaining, v_due.id using errcode = '22023';
    end if;

    v_allocated_total := v_allocated_total + (v_alloc ->> 'amount')::numeric(19, 4);
  end loop;

  if v_allocated_total <> p_amount then
    raise exception 'ALLOCATIONS_MISMATCH: مجموع التوزيع (%) يجب أن يساوي مبلغ الدفعة (%)', v_allocated_total, p_amount using errcode = '22023';
  end if;

  for v_grouped in
    select d.receivable_account_id as account_id, sum((a ->> 'amount')::numeric(19, 4)) as total
    from jsonb_array_elements(p_allocations) a
    join public.dues d on d.id = (a ->> 'due_id')::uuid
    group by d.receivable_account_id
  loop
    v_credit_lines := v_credit_lines || jsonb_build_array(
      jsonb_build_object('account_id', v_grouped.account_id, 'debit', 0, 'credit', v_grouped.total)
    );
  end loop;

  -- Uses the _internal variants: receivables.payments.create (checked
  -- above) already authorizes this whole atomic action, so the
  -- auto-generated entry doesn't re-demand finance.entries.create/
  -- finance.entries.post from the same caller.
  v_entry_id := public.create_journal_entry_internal(
    p_organization_id, p_resort_id, p_fiscal_period_id, p_payment_date,
    'Payment received', 'RECEIPT_VOUCHER',
    jsonb_build_array(jsonb_build_object('account_id', p_deposit_account_id, 'debit', p_amount, 'credit', 0)) || v_credit_lines,
    null
  );
  perform public.post_journal_entry_internal(v_entry_id);

  v_receipt_number := public.next_sequence_value(p_organization_id, null, 'receipt');

  insert into public.payments (
    organization_id, resort_id, member_id, unit_id, amount, method, payment_date,
    receipt_number, deposit_account_id, journal_entry_id, idempotency_key, created_by
  ) values (
    p_organization_id, p_resort_id, p_member_id, p_unit_id, p_amount, p_method, p_payment_date,
    v_receipt_number, p_deposit_account_id, v_entry_id, p_idempotency_key, auth.uid()
  )
  returning id into v_payment_id;

  if p_cashier_session_id is not null then
    insert into public.cash_transactions (organization_id, session_id, type, amount, payment_id, created_by)
    values (p_organization_id, p_cashier_session_id, 'RECEIPT', p_amount, v_payment_id, auth.uid());
  end if;

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    insert into public.payment_allocations (payment_id, due_id, amount)
    values (v_payment_id, (v_alloc ->> 'due_id')::uuid, (v_alloc ->> 'amount')::numeric(19, 4));

    select * into v_due from public.dues where id = (v_alloc ->> 'due_id')::uuid;
    select coalesce(sum(pa.amount), 0) into v_paid_so_far
    from public.payment_allocations pa
    join public.payments p on p.id = pa.payment_id
    where pa.due_id = v_due.id and p.status = 'POSTED';

    v_new_status := case when v_paid_so_far >= v_due.amount then 'PAID' else 'PARTIALLY_PAID' end;
    update public.dues set status = v_new_status where id = v_due.id;
  end loop;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'payment.recorded', 'payment', v_payment_id,
    jsonb_build_object('amount', p_amount, 'receipt_number', v_receipt_number, 'cashier_session_id', p_cashier_session_id));

  return v_payment_id;
end;
$$;

notify pgrst, 'reload schema';
