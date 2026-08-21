-- Phase 2c of the resort -> property domain rename. Surgically updates the
-- 6 functions (of 10 candidates referencing bank_accounts/cashboxes/
-- cashier_sessions/cheques) that actually read the now-renamed resort_id
-- column. Two distinct edit shapes appear in this cluster (new to this
-- rename effort -- prior clusters only needed the first shape):
--
-- 1. Direct INSERT/SELECT column-list edits against one of the 4 treasury
--    tables (create_cashbox, open_cashier_session, record_incoming_cheque).
--
-- 2. Row-typed-variable field-access edits: close_cashier_session and
--    reconcile_cashier_session each declare `v_session public.cashier_sessions;`
--    and read `v_session.resort_id` elsewhere in the body (as the *value*
--    passed into platform_audit_logs' already-renamed `property_id` column
--    -- only the source expression needed updating here, not the target
--    column name again). clear_incoming_cheque has the same shape via
--    `v_cheque public.cheques;` / `v_cheque.resort_id`, passed into
--    record_payment(). This shape is riskier than an INSERT-list miss: since
--    v_session/v_cheque's declared type is one of the 4 renamed tables,
--    referencing the old field name after this migration raises a hard
--    PL/pgSQL error ("record ... has no field ...") the next time the
--    function runs -- not a silent data bug, but also not something a
--    tsc/type-level check would catch, since this is plpgsql, not app code.
--
-- post_payment_internal, record_expense, record_supplier_payment, and
-- set_cheque_status all declare a treasury-table-typed row variable but
-- never read .resort_id off it anywhere in the body -- confirmed via full
-- live-body reads (not regex alone, which over-matches these 4 as false
-- positives), left unchanged.

create or replace function public.clear_incoming_cheque(p_cheque_id uuid, p_clearing_date date, p_fiscal_period_id uuid, p_allocations jsonb)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_cheque public.cheques;
  v_bank_gl_account_id uuid;
  v_payment_id uuid;
begin
  select * into v_cheque from public.cheques where id = p_cheque_id;
  if v_cheque.id is null then
    raise exception 'CHEQUE_NOT_FOUND: الشيك غير موجود' using errcode = '22023';
  end if;
  if v_cheque.direction <> 'INCOMING' then
    raise exception 'CHEQUE_NOT_INCOMING: يمكن تحصيل الشيكات الواردة فقط عبر هذه الوظيفة' using errcode = '22023';
  end if;
  if v_cheque.status <> 'DEPOSITED' then
    raise exception 'CHEQUE_NOT_DEPOSITED: يجب أن يكون الشيك بحالة (مودَع) قبل تحصيله' using errcode = '22023';
  end if;
  if not public.has_permission(auth.uid(), v_cheque.organization_id, 'banking.cheques.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية إدارة الشيكات' using errcode = '42501';
  end if;

  select gl_account_id into v_bank_gl_account_id from public.bank_accounts where id = v_cheque.bank_account_id;

  v_payment_id := public.record_payment(
    v_cheque.organization_id, v_cheque.property_id, v_cheque.member_id, null, v_cheque.amount,
    'CHEQUE', p_clearing_date, v_bank_gl_account_id, p_fiscal_period_id, p_allocations, null, null
  );

  update public.cheques set status = 'CLEARED', payment_id = v_payment_id where id = p_cheque_id;

  insert into public.cheque_status_history (cheque_id, from_status, to_status, changed_by, note)
  values (p_cheque_id, 'DEPOSITED', 'CLEARED', auth.uid(), 'Cleared via payment ' || v_payment_id);

  return v_payment_id;
end;
$function$;

create or replace function public.close_cashier_session(p_session_id uuid, p_actual_closing_balance numeric)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_session public.cashier_sessions;
  v_receipts numeric(19, 4);
  v_payments numeric(19, 4);
  v_expected numeric(19, 4);
begin
  select * into v_session from public.cashier_sessions where id = p_session_id;
  if v_session.id is null then
    raise exception 'CASHIER_SESSION_NOT_FOUND: جلسة الكاشير غير موجودة' using errcode = '22023';
  end if;
  if not public.has_permission(auth.uid(), v_session.organization_id, 'cashier.sessions.close') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية إغلاق جلسات الكاشير' using errcode = '42501';
  end if;
  if v_session.status <> 'OPEN' then
    raise exception 'CASHIER_SESSION_NOT_OPEN: الجلسة ليست مفتوحة، لا يمكن إغلاقها' using errcode = '22023';
  end if;

  select
    coalesce(sum(amount) filter (where type = 'RECEIPT'), 0),
    coalesce(sum(amount) filter (where type = 'PAYMENT'), 0)
  into v_receipts, v_payments
  from public.cash_transactions
  where session_id = p_session_id;

  v_expected := v_session.opening_balance + v_receipts - v_payments;

  update public.cashier_sessions
  set status = 'CLOSED',
      closed_by = auth.uid(),
      closed_at = now(),
      expected_closing_balance = v_expected,
      actual_closing_balance = p_actual_closing_balance,
      variance = p_actual_closing_balance - v_expected
  where id = p_session_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_session.organization_id, v_session.property_id, 'cashier_session.closed', 'cashier_session', p_session_id,
    jsonb_build_object('expected', v_expected, 'actual', p_actual_closing_balance, 'variance', p_actual_closing_balance - v_expected));

  return jsonb_build_object(
    'expected_closing_balance', v_expected,
    'actual_closing_balance', p_actual_closing_balance,
    'variance', p_actual_closing_balance - v_expected
  );
end;
$function$;

create or replace function public.create_cashbox(p_organization_id uuid, p_resort_id uuid, p_name text, p_gl_account_id uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_cashbox_id uuid;
  v_gl_category text;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.accounts.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية إدارة الصناديق' using errcode = '42501';
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

  select category into v_gl_category
  from public.chart_of_accounts
  where id = p_gl_account_id and organization_id = p_organization_id;
  if v_gl_category is null then
    raise exception 'GL_ACCOUNT_NOT_IN_ORGANIZATION: حساب الأستاذ المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;
  if v_gl_category <> 'ASSET' then
    raise exception 'GL_ACCOUNT_NOT_ASSET: يجب اختيار حساب من نوع الأصول لصندوق نقدي' using errcode = '22023';
  end if;

  insert into public.cashboxes (organization_id, property_id, name, gl_account_id)
  values (p_organization_id, p_resort_id, trim(p_name), p_gl_account_id)
  returning id into v_cashbox_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'cashbox.created', 'cashbox', v_cashbox_id, jsonb_build_object('name', p_name));

  return v_cashbox_id;
end;
$function$;

create or replace function public.open_cashier_session(p_organization_id uuid, p_resort_id uuid, p_cashbox_id uuid, p_opening_balance numeric)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_session_id uuid;
  v_cashbox_resort_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'cashier.sessions.open') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية فتح جلسات الكاشير' using errcode = '42501';
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

  select property_id into v_cashbox_resort_id
  from public.cashboxes
  where id = p_cashbox_id and organization_id = p_organization_id and is_active;
  if v_cashbox_resort_id is null then
    raise exception 'CASHBOX_NOT_FOUND: الصندوق غير موجود في هذا الكيان أو غير نشط' using errcode = '22023';
  end if;
  if v_cashbox_resort_id <> p_resort_id then
    raise exception 'CASHBOX_RESORT_MISMATCH: الصندوق المحدد يتبع موقعًا مختلفًا عن الموقع المحدد' using errcode = '22023';
  end if;

  if exists (select 1 from public.cashier_sessions where cashbox_id = p_cashbox_id and status = 'OPEN') then
    raise exception 'OPEN_SESSION_EXISTS: يوجد بالفعل جلسة مفتوحة لهذا الصندوق' using errcode = '22023';
  end if;

  insert into public.cashier_sessions (organization_id, property_id, cashbox_id, opened_by, opening_balance)
  values (p_organization_id, p_resort_id, p_cashbox_id, auth.uid(), coalesce(p_opening_balance, 0))
  returning id into v_session_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'cashier_session.opened', 'cashier_session', v_session_id,
    jsonb_build_object('opening_balance', p_opening_balance));

  return v_session_id;
end;
$function$;

create or replace function public.reconcile_cashier_session(p_session_id uuid, p_note text)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_session public.cashier_sessions;
begin
  select * into v_session from public.cashier_sessions where id = p_session_id;
  if v_session.id is null then
    raise exception 'cashier session not found';
  end if;
  if not public.has_permission(auth.uid(), v_session.organization_id, 'cashier.reconciliations.approve') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if v_session.status <> 'CLOSED' then
    raise exception 'only a closed session can be reconciled';
  end if;

  update public.cashier_sessions set status = 'RECONCILED' where id = p_session_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, reason)
  values (auth.uid(), v_session.organization_id, v_session.property_id, 'cashier_session.reconciled', 'cashier_session', p_session_id, p_note);
end;
$function$;

create or replace function public.record_incoming_cheque(p_organization_id uuid, p_resort_id uuid, p_bank_account_id uuid, p_cheque_number text, p_amount numeric, p_member_id uuid, p_cheque_date date, p_due_date date)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_cheque_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'banking.cheques.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'organization is not active';
  end if;
  if not exists (select 1 from public.bank_accounts where id = p_bank_account_id and organization_id = p_organization_id) then
    raise exception 'bank account does not belong to this organization';
  end if;

  insert into public.cheques (
    organization_id, property_id, bank_account_id, direction, cheque_number, amount,
    member_id, cheque_date, due_date, status, created_by
  ) values (
    p_organization_id, p_resort_id, p_bank_account_id, 'INCOMING', p_cheque_number, p_amount,
    p_member_id, p_cheque_date, p_due_date, 'RECEIVED', auth.uid()
  )
  returning id into v_cheque_id;

  insert into public.cheque_status_history (cheque_id, from_status, to_status, changed_by)
  values (v_cheque_id, null, 'RECEIVED', auth.uid());

  return v_cheque_id;
end;
$function$;
