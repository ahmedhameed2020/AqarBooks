-- Phase 2g Group 1 of the resort -> property domain rename. Surgically
-- updates the 9 functions that genuinely reference resort_id on
-- organization_finance_settings, online_payment_transactions, dues, or
-- payments. Functions 4 (record_online_payment) and 7
-- (validate_online_payments_clearing_account) COMPLETE partial edits left
-- open since Phase 2e -- their chart_of_accounts-related substitutions
-- (v_clearing_account.property_id, v_account.property_id) were already
-- applied then and are left untouched here; only the new substitutions
-- for THIS migration's 4 tables are applied. After this migration, both
-- functions are fully migrated with no further edits needed in any future
-- phase. due_ids_have_pending_online_checkout,
-- expire_stale_online_payment_transactions, run_due_schedules, archive_unit,
-- and the 12-arg record_payment wrapper (which delegates to
-- post_payment_internal without touching resort_id itself) are confirmed
-- NOT to need any edit -- left unchanged.

create or replace function public.create_online_payment_checkout_transaction(p_due_ids uuid[], p_provider text)
 returns TABLE(transaction_id uuid, amount numeric)
 language plpgsql
 set search_path to 'public'
as $function$
declare
  v_member_id uuid := public.current_member_id();
  v_due record;
  v_organization_id uuid;
  v_resort_id uuid;
  v_total numeric(19,4) := 0;
  v_matched_count integer := 0;
  v_transaction_id uuid;
begin
  if v_member_id is null then
    raise exception 'NOT_A_PORTAL_MEMBER: لست مسجّلاً كمالك في هذا النظام' using errcode = '42501';
  end if;
  if p_provider not in ('FAWRY') then
    raise exception 'INVALID_PROVIDER: مزود الدفع غير معروف أو غير مُفعّل حاليًا' using errcode = '22023';
  end if;
  if p_due_ids is null or array_length(p_due_ids, 1) is null then
    raise exception 'NO_DUES_SELECTED: يرجى اختيار استحقاق واحد على الأقل' using errcode = '22023';
  end if;

  for v_due in
    select d.* from public.dues d
    where d.id = any(p_due_ids)
      and exists (
        select 1 from public.unit_ownerships uo
        where uo.unit_id = d.unit_id and uo.member_id = v_member_id
          and (uo.end_date is null or uo.end_date >= current_date)
      )
  loop
    if v_due.status in ('VOID', 'PAID') then
      raise exception 'DUE_NOT_PAYABLE: الاستحقاق % لم يعد قابلاً للسداد', v_due.id using errcode = '22023';
    end if;
    if v_organization_id is null then
      v_organization_id := v_due.organization_id;
      v_resort_id := v_due.property_id;
    elsif v_due.property_id <> v_resort_id then
      raise exception 'CROSS_RESORT_NOT_ALLOWED: لا يمكن دمج استحقاقات من مواقع مختلفة في عملية دفع واحدة' using errcode = '22023';
    end if;
    v_total := v_total + v_due.amount;
    v_matched_count := v_matched_count + 1;
  end loop;

  if v_matched_count <> array_length(p_due_ids, 1) then
    raise exception 'SOME_DUES_NOT_FOUND_OR_NOT_OWNED: بعض الاستحقاقات غير موجودة أو غير مملوكة لك' using errcode = '22023';
  end if;

  -- Double-booking guard (Task 4 fix) -- placed AFTER the ownership/status/
  -- cross-resort loop so a due that's VOID/PAID/not-owned still surfaces
  -- its own specific error first, but BEFORE the insert below.
  if public.due_ids_have_pending_online_checkout(p_due_ids) then
    raise exception 'DUE_HAS_PENDING_CHECKOUT: يوجد بالفعل عملية دفع معلّقة لأحد الاستحقاقات المختارة، يرجى الانتظار أو إعادة المحاولة لاحقًا' using errcode = '22023';
  end if;

  insert into public.online_payment_transactions (
    organization_id, property_id, member_id, client_request_id, provider, amount, expires_at
  ) values (
    v_organization_id, v_resort_id, v_member_id, gen_random_uuid()::text, p_provider, v_total, now() + interval '20 minutes'
  )
  returning id into v_transaction_id;

  insert into public.online_payment_transaction_allocations (transaction_id, due_id, amount)
  select v_transaction_id, d.id, d.amount from public.dues d where d.id = any(p_due_ids);

  return query select v_transaction_id, v_total;
end;
$function$;

create or replace function public.issue_dues(p_organization_id uuid, p_resort_id uuid, p_unit_ids uuid[], p_due_type_id uuid, p_receivable_account_id uuid, p_amount numeric, p_amount_by_unit_type jsonb DEFAULT NULL::jsonb, p_issue_date date DEFAULT CURRENT_DATE, p_due_date date DEFAULT (CURRENT_DATE + '15 days'::interval), p_description text DEFAULT NULL::text, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
DECLARE
  v_user_id uuid;
  v_unit_id uuid;
  v_unit_record record;
  v_unit_amount numeric(19, 4);
  v_issued_count integer := 0;
  v_skipped_count integer := 0;
  v_total_amount numeric(19, 4) := 0;
  v_skipped_unit_ids uuid[] := ARRAY[]::uuid[];
  v_action text;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION: طلب غير موثق' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_financial_permission(p_organization_id, 'finance.dues.issue', p_resort_id) THEN
    RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإصدار المستحقات' USING ERRCODE = '42501';
  END IF;

  IF p_unit_ids IS NULL OR array_length(p_unit_ids, 1) = 0 THEN
    RAISE EXCEPTION 'يرجى تحديد وحدة واحدة على الأقل لإصدار المستحق' USING ERRCODE = '22023';
  END IF;

  IF p_amount < 0 THEN
    RAISE EXCEPTION 'مبلغ المستحق لا يمكن أن يكون سالباً' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('issue_dues_' || p_organization_id::text));

  FOREACH v_unit_id IN ARRAY p_unit_ids
  LOOP
    SELECT id, unit_type INTO v_unit_record
    FROM public.units
    WHERE id = v_unit_id AND organization_id = p_organization_id AND property_id = p_resort_id;

    IF v_unit_record.id IS NULL THEN
      RAISE EXCEPTION 'الوحدة المحددة (%) غير موجودة أو لا تنتمي لهذه المنظمة والمنتجع', v_unit_id USING ERRCODE = '22023';
    END IF;

    IF p_amount_by_unit_type IS NOT NULL AND p_amount_by_unit_type ? v_unit_record.unit_type THEN
      v_unit_amount := (p_amount_by_unit_type->>v_unit_record.unit_type)::numeric(19, 4);
    ELSE
      v_unit_amount := p_amount;
    END IF;

    IF EXISTS (
      SELECT 1 FROM public.dues
      WHERE unit_id = v_unit_id
        AND due_type_id = p_due_type_id
        AND issue_date = p_issue_date
        AND COALESCE(description, '') = COALESCE(p_description, '')
        AND status <> 'VOID'
    ) THEN
      v_skipped_count := v_skipped_count + 1;
      v_skipped_unit_ids := array_append(v_skipped_unit_ids, v_unit_id);
    ELSE
      INSERT INTO public.dues (
        organization_id,
        property_id,
        unit_id,
        due_type_id,
        receivable_account_id,
        amount,
        issue_date,
        due_date,
        description,
        status,
        created_by
      ) VALUES (
        p_organization_id,
        p_resort_id,
        v_unit_id,
        p_due_type_id,
        p_receivable_account_id,
        v_unit_amount,
        p_issue_date,
        p_due_date,
        p_description,
        'ISSUED',
        v_user_id
      );

      v_issued_count := v_issued_count + 1;
      v_total_amount := v_total_amount + v_unit_amount;
    END IF;
  END LOOP;

  v_action := CASE WHEN array_length(p_unit_ids, 1) = 1 THEN 'DUE_ISSUED' ELSE 'DUE_BATCH_ISSUED' END;

  PERFORM public.append_financial_audit_event(
    p_organization_id := p_organization_id,
    p_action := v_action,
    p_entity_type := 'DUE',
    p_resort_id := p_resort_id,
    p_entity_id := NULL,
    p_request_id := NULL,
    p_ip_address := p_ip_address,
    p_user_agent := p_user_agent,
    p_metadata := jsonb_build_object(
      'target_units_count', array_length(p_unit_ids, 1),
      'issued_count', v_issued_count,
      'skipped_count', v_skipped_count,
      'total_amount', v_total_amount,
      'due_type_id', p_due_type_id,
      'issue_date', p_issue_date,
      'due_date', p_due_date
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'issued_count', v_issued_count,
    'skipped_count', v_skipped_count,
    'skipped_unit_ids', to_jsonb(v_skipped_unit_ids),
    'total_amount', v_total_amount
  );
END;
$function$;

create or replace function public.post_payment_internal(p_organization_id uuid, p_resort_id uuid, p_member_id uuid, p_unit_id uuid, p_amount numeric, p_method text, p_payment_date date, p_deposit_account_id uuid, p_fiscal_period_id uuid, p_allocations jsonb, p_idempotency_key text, p_cashier_session_id uuid, p_actor_id uuid)
 returns TABLE(payment_id uuid, allocated_amount numeric, unallocated_amount numeric, affected_due_ids uuid[])
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_alloc jsonb;
  v_due public.dues;
  v_allocated_total numeric(19,4) := 0;
  v_remaining numeric(19,4);
  v_credit_lines jsonb := '[]'::jsonb;
  v_grouped record;
  v_entry_id uuid;
  v_payment_id uuid;
  v_existing_payment_id uuid;
  v_receipt_number bigint;
  v_paid_so_far numeric(19,4);
  v_new_status text;
  v_session public.cashier_sessions;
  v_affected_due_ids uuid[] := '{}';
begin
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
      return query
        select v_payment_id, p_amount, 0::numeric(19,4),
          array(select pa.due_id from public.payment_allocations pa where pa.payment_id = v_payment_id);
      return;
    end if;
  end if;

  perform pg_advisory_xact_lock(hashtext('record_payment_' || p_organization_id::text));

  if p_idempotency_key is not null then
    select id into v_payment_id
    from public.payments
    where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
    if v_payment_id is not null then
      return query
        select v_payment_id, p_amount, 0::numeric(19,4),
          array(select pa.due_id from public.payment_allocations pa where pa.payment_id = v_payment_id);
      return;
    end if;
  end if;

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    select * into v_due from public.dues where id = (v_alloc ->> 'due_id')::uuid for update;
    if v_due.id is null or v_due.organization_id <> p_organization_id then
      raise exception 'DUE_NOT_FOUND: الاستحقاق غير موجود في هذا الكيان' using errcode = '22023';
    end if;
    if v_due.property_id <> p_resort_id then
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
    if (v_alloc ->> 'amount')::numeric(19,4) > v_remaining then
      raise exception 'ALLOCATION_EXCEEDS_REMAINING: المبلغ (%) أكبر من المتبقي (%) على الاستحقاق %', v_alloc ->> 'amount', v_remaining, v_due.id using errcode = '22023';
    end if;

    v_allocated_total := v_allocated_total + (v_alloc ->> 'amount')::numeric(19,4);
  end loop;

  if v_allocated_total <> p_amount then
    raise exception 'ALLOCATIONS_MISMATCH: مجموع التوزيع (%) يجب أن يساوي مبلغ الدفعة (%)', v_allocated_total, p_amount using errcode = '22023';
  end if;

  for v_grouped in
    select d.receivable_account_id as account_id, sum((a ->> 'amount')::numeric(19,4)) as total
    from jsonb_array_elements(p_allocations) a
    join public.dues d on d.id = (a ->> 'due_id')::uuid
    group by d.receivable_account_id
  loop
    v_credit_lines := v_credit_lines || jsonb_build_array(
      jsonb_build_object('account_id', v_grouped.account_id, 'debit', 0, 'credit', v_grouped.total)
    );
  end loop;

  v_entry_id := public.create_journal_entry_internal(
    p_organization_id, p_resort_id, p_fiscal_period_id, p_payment_date,
    'Payment received', 'RECEIPT_VOUCHER',
    jsonb_build_array(jsonb_build_object('account_id', p_deposit_account_id, 'debit', p_amount, 'credit', 0)) || v_credit_lines,
    null
  );
  perform public.post_journal_entry_internal(v_entry_id);

  v_receipt_number := public.next_sequence_value(p_organization_id, null, 'receipt');

  begin
    insert into public.payments (
      organization_id, property_id, member_id, unit_id, amount, method, payment_date,
      receipt_number, deposit_account_id, journal_entry_id, idempotency_key, created_by
    ) values (
      p_organization_id, p_resort_id, p_member_id, p_unit_id, p_amount, p_method, p_payment_date,
      v_receipt_number, p_deposit_account_id, v_entry_id, p_idempotency_key, p_actor_id
    )
    returning id into v_payment_id;
  exception
    when unique_violation then
      if p_idempotency_key is not null then
        select id into v_existing_payment_id
        from public.payments
        where organization_id = p_organization_id and idempotency_key = p_idempotency_key;
        if v_existing_payment_id is null then raise; end if;
        return query
          select v_existing_payment_id, p_amount, 0::numeric(19,4),
            array(select pa.due_id from public.payment_allocations pa where pa.payment_id = v_existing_payment_id);
        return;
      else
        raise;
      end if;
  end;

  if p_cashier_session_id is not null then
    insert into public.cash_transactions (organization_id, session_id, type, amount, payment_id, created_by)
    values (p_organization_id, p_cashier_session_id, 'RECEIPT', p_amount, v_payment_id, p_actor_id);
  end if;

  for v_alloc in select * from jsonb_array_elements(p_allocations) loop
    insert into public.payment_allocations (payment_id, due_id, amount)
    values (v_payment_id, (v_alloc ->> 'due_id')::uuid, (v_alloc ->> 'amount')::numeric(19,4));

    select * into v_due from public.dues where id = (v_alloc ->> 'due_id')::uuid;
    select coalesce(sum(pa.amount), 0) into v_paid_so_far
    from public.payment_allocations pa
    join public.payments p on p.id = pa.payment_id
    where pa.due_id = v_due.id and p.status = 'POSTED';

    v_new_status := case when v_paid_so_far >= v_due.amount then 'PAID' else 'PARTIALLY_PAID' end;
    update public.dues set status = v_new_status where id = v_due.id;
    v_affected_due_ids := v_affected_due_ids || v_due.id;
  end loop;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (p_actor_id, p_organization_id, p_resort_id, 'payment.recorded', 'payment', v_payment_id,
    jsonb_build_object('amount', p_amount, 'receipt_number', v_receipt_number, 'cashier_session_id', p_cashier_session_id));

  return query select v_payment_id, v_allocated_total, (p_amount - v_allocated_total), v_affected_due_ids;
end;
$function$;

create or replace function public.record_online_payment(p_transaction_id uuid, p_webhook_event_id text, p_provider_payload jsonb DEFAULT NULL::jsonb)
 returns TABLE(status text, payment_id uuid, failure_code text, failure_message text)
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_txn public.online_payment_transactions;
  v_alloc record;
  v_due public.dues;
  v_paid_so_far numeric(19,4);
  v_result record;
  v_allocations_jsonb jsonb := '[]'::jsonb;
  v_clearing_account_id uuid;
  v_clearing_account public.chart_of_accounts;
  v_fiscal_period_id uuid;
  v_failure_message text;
begin
  select * into v_txn from public.online_payment_transactions
  where id = p_transaction_id for update;

  if v_txn.id is null then
    raise exception 'ONLINE_TXN_NOT_FOUND: transaction % not found', p_transaction_id using errcode = '22023';
  end if;

  if v_txn.status = 'PAID' then
    return query select 'PAID'::text, v_txn.payment_id, null::text, null::text;
    return;
  end if;

  if v_txn.status <> 'PENDING' then
    raise exception 'ONLINE_TXN_NOT_PENDING: cannot post a % transaction', v_txn.status using errcode = '22023';
  end if;

  perform pg_advisory_xact_lock(hashtext('record_payment_' || v_txn.organization_id::text));

  select ofs.online_payments_clearing_account_id into v_clearing_account_id
  from public.organization_finance_settings ofs
  where ofs.organization_id = v_txn.organization_id and ofs.property_id = v_txn.property_id;

  if v_clearing_account_id is not null then
    select * into v_clearing_account from public.chart_of_accounts where id = v_clearing_account_id;
  end if;

  if v_clearing_account_id is null
    or v_clearing_account.id is null
    or v_clearing_account.category <> 'ASSET'
    or v_clearing_account.is_group
    or not v_clearing_account.is_active
    or (v_clearing_account.property_id is not null and v_clearing_account.property_id <> v_txn.property_id)
  then
    v_failure_message := format('No valid online-payments clearing account configured for resort %s', v_txn.property_id);
    update public.online_payment_transactions
    set status = 'FAILED', failed_at = now(),
        failure_code = 'CLEARING_ACCOUNT_NOT_CONFIGURED',
        failure_message = v_failure_message
    where id = p_transaction_id;
    return query select 'FAILED'::text, null::uuid, 'CLEARING_ACCOUNT_NOT_CONFIGURED'::text, v_failure_message;
    return;
  end if;

  select fp.id into v_fiscal_period_id
  from public.fiscal_periods fp
  where fp.organization_id = v_txn.organization_id
    and fp.status = 'OPEN'
    and current_date between fp.start_date and fp.end_date
  order by fp.start_date desc
  limit 1;

  if v_fiscal_period_id is null then
    v_failure_message := format('No open fiscal period covers %s for organization %s', current_date, v_txn.organization_id);
    update public.online_payment_transactions
    set failure_code = 'OPEN_PERIOD_REQUIRED',
        failure_message = v_failure_message
    where id = p_transaction_id;
    return query select 'PENDING'::text, null::uuid, 'OPEN_PERIOD_REQUIRED'::text, v_failure_message;
    return;
  end if;

  for v_alloc in
    select due_id, amount from public.online_payment_transaction_allocations
    where transaction_id = p_transaction_id
    order by due_id
  loop
    select * into v_due from public.dues where id = v_alloc.due_id for update;

    if v_due.id is null or v_due.organization_id <> v_txn.organization_id or v_due.property_id <> v_txn.property_id then
      v_failure_message := format('Due %s is outside this transaction''s organization/resort', v_alloc.due_id);
      update public.online_payment_transactions
      set status = 'FAILED', failed_at = now(), failure_code = 'DUE_OUT_OF_SCOPE', failure_message = v_failure_message
      where id = p_transaction_id;
      return query select 'FAILED'::text, null::uuid, 'DUE_OUT_OF_SCOPE'::text, v_failure_message;
      return;
    end if;

    if not exists (
      select 1 from public.unit_ownerships uo
      where uo.unit_id = v_due.unit_id
        and uo.member_id = v_txn.member_id
        and (uo.end_date is null or uo.end_date >= current_date)
    ) then
      v_failure_message := format('Due %s''s unit is not owned by member %s', v_alloc.due_id, v_txn.member_id);
      update public.online_payment_transactions
      set status = 'FAILED', failed_at = now(), failure_code = 'DUE_NOT_OWNED_BY_MEMBER', failure_message = v_failure_message
      where id = p_transaction_id;
      return query select 'FAILED'::text, null::uuid, 'DUE_NOT_OWNED_BY_MEMBER'::text, v_failure_message;
      return;
    end if;

    if v_due.status = 'VOID' then
      v_failure_message := format('Due %s is no longer payable (void)', v_alloc.due_id);
      update public.online_payment_transactions
      set status = 'FAILED', failed_at = now(), failure_code = 'DUE_ALREADY_SETTLED', failure_message = v_failure_message
      where id = p_transaction_id;
      return query select 'FAILED'::text, null::uuid, 'DUE_ALREADY_SETTLED'::text, v_failure_message;
      return;
    end if;

    select coalesce(sum(pa.amount), 0) into v_paid_so_far
    from public.payment_allocations pa
    join public.payments p on p.id = pa.payment_id
    where pa.due_id = v_due.id and p.status = 'POSTED';

    if v_alloc.amount > (v_due.amount - v_paid_so_far) then
      v_failure_message := format('Due %s no longer has enough remaining balance for %s', v_alloc.due_id, v_alloc.amount);
      update public.online_payment_transactions
      set status = 'FAILED', failed_at = now(), failure_code = 'DUE_ALREADY_SETTLED', failure_message = v_failure_message
      where id = p_transaction_id;
      return query select 'FAILED'::text, null::uuid, 'DUE_ALREADY_SETTLED'::text, v_failure_message;
      return;
    end if;

    v_allocations_jsonb := v_allocations_jsonb || jsonb_build_array(jsonb_build_object('due_id', v_alloc.due_id, 'amount', v_alloc.amount));
  end loop;

  select * into v_result from public.post_payment_internal(
    p_organization_id => v_txn.organization_id,
    p_resort_id => v_txn.property_id,
    p_member_id => v_txn.member_id,
    p_unit_id => null,
    p_amount => v_txn.amount,
    p_method => 'ONLINE',
    p_payment_date => current_date,
    p_deposit_account_id => v_clearing_account_id,
    p_fiscal_period_id => v_fiscal_period_id,
    p_allocations => v_allocations_jsonb,
    p_idempotency_key => 'online:' || p_transaction_id::text,
    p_cashier_session_id => null,
    p_actor_id => null
  );

  update public.online_payment_transactions
  set status = 'PAID',
      payment_id = v_result.payment_id,
      paid_at = now(),
      webhook_event_id = p_webhook_event_id,
      provider_payload = coalesce(p_provider_payload, provider_payload)
  where id = p_transaction_id;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (null, v_txn.organization_id, v_txn.property_id, 'online_payment.posted', 'online_payment_transaction', p_transaction_id,
    jsonb_build_object('payment_id', v_result.payment_id, 'amount', v_txn.amount, 'provider', v_txn.provider));

  return query select 'PAID'::text, v_result.payment_id, null::text, null::text;
end;
$function$;

create or replace function public.record_payment(p_organization_id uuid, p_member_id uuid, p_amount numeric, p_payment_date date, p_method text, p_resort_id uuid DEFAULT NULL::uuid, p_memo text DEFAULT NULL::text, p_allocations jsonb DEFAULT '[]'::jsonb, p_client_request_id text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
DECLARE
  v_user_id uuid;
  v_payment_id uuid;
  v_existing_payment_id uuid;
  v_existing_receipt_no text;
  v_seq_num bigint;
  v_receipt_no text;
  v_total_allocated numeric(19, 4) := 0;
  v_unallocated_amount numeric(19, 4) := 0;
  v_alloc_item jsonb;
  v_due_id uuid;
  v_alloc_amount numeric(19, 4);
  v_due_record record;
BEGIN
  -- أ. التحقق من الهوية والصلاحيات لـ Tenant
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'طلب غير موثق' USING ERRCODE = '42501';
  END IF;

  -- TODO: يمكن ربطها بنظام RBAC لاحقاً للتحقق من صلاحية receivables.payments.create
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'غير مصرح للوصول لهذه المنظمة' USING ERRCODE = '42501';
  END IF;

  -- ب. فحص عدم التكرار الأولي (Idempotency Check)
  IF p_client_request_id IS NOT NULL AND trim(p_client_request_id) <> '' THEN
    SELECT id, receipt_no INTO v_existing_payment_id, v_existing_receipt_no
    FROM public.payments
    WHERE organization_id = p_organization_id AND idempotency_key = p_client_request_id
    LIMIT 1;

    IF v_existing_payment_id IS NOT NULL THEN
      RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_existing_payment_id,
        'receipt_no', v_existing_receipt_no,
        'idempotent', true
      );
    END IF;
  END IF;

  -- ج. القفل التزمني الفوري على مستوى المنظمة لـ Serializing Payment Transactions
  PERFORM pg_advisory_xact_lock(hashtext('record_payment_' || p_organization_id::text));

  -- د. التحقق من صحة المدخلات الأساسية
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ الدفعة يجب أن يكون أكبر من صفر' USING ERRCODE = '22023';
  END IF;

  IF p_payment_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'لا يمكن تسجيل دفعة بتاريخ مستقبلي' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.members
    WHERE id = p_member_id AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'العضو المحدد غير موجود أو لا ينتمي لهذه المنظمة' USING ERRCODE = '22023';
  END IF;

  IF p_resort_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.resorts
    WHERE id = p_resort_id AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'المنتجع المحدد غير تابع لهذه المنظمة' USING ERRCODE = '22023';
  END IF;

  -- هـ. رفض تكرار نفس due_id داخل مصفوفة التوزيعات
  IF p_allocations IS NOT NULL AND jsonb_array_length(p_allocations) > 0 THEN
    IF (SELECT count(*) FROM jsonb_array_elements(p_allocations))
       <> (SELECT count(DISTINCT elem->>'due_id') FROM jsonb_array_elements(p_allocations) AS elem) THEN
      RAISE EXCEPTION 'لا يمكن تكرار نفس الاستحقاق في التوزيع' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- و. التحقق من التوزيعات والمبالغ المتبقية
  IF p_allocations IS NOT NULL AND jsonb_array_length(p_allocations) > 0 THEN
    FOR v_alloc_item IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
      v_due_id := (v_alloc_item->>'due_id')::uuid;
      v_alloc_amount := (v_alloc_item->>'amount')::numeric(19, 4);

      IF v_alloc_amount < 0 THEN
        RAISE EXCEPTION 'مبلغ التوزيع لا يمكن أن يكون سالباً' USING ERRCODE = '22023';
      END IF;

      IF v_alloc_amount > 0 THEN
        v_total_allocated := v_total_allocated + v_alloc_amount;

        SELECT d.id, d.amount, d.organization_id, d.unit_id,
               d.amount - COALESCE(SUM(pa.amount), 0) AS unpaid_amount
        INTO v_due_record
        FROM public.dues d
        JOIN public.unit_ownerships uo ON uo.unit_id = d.unit_id
        LEFT JOIN public.payment_allocations pa ON pa.due_id = d.id
        WHERE d.id = v_due_id
          AND d.organization_id = p_organization_id
          AND uo.member_id = p_member_id
          AND uo.is_active = true
        GROUP BY d.id, d.amount, d.organization_id, d.unit_id;

        IF v_due_record.id IS NULL THEN
          RAISE EXCEPTION 'الاستحقاق المحدد غير موجود أو لا ينتمي لوحدات هذا العضو' USING ERRCODE = '22023';
        END IF;

        IF v_alloc_amount > (v_due_record.unpaid_amount + 0.001) THEN
          RAISE EXCEPTION 'مبلغ التوزيع (%s) يتجاوز المبلغ المتبقي على الاستحقاق (%s)', v_alloc_amount, v_due_record.unpaid_amount
          USING ERRCODE = '22023';
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- ز. التثبت من شرط مجموع التوزيع ≤ مبلغ الدفعة الكلي
  IF v_total_allocated > (p_amount + 0.001) THEN
    RAISE EXCEPTION 'إجمالي المبالغ الموزعة (%s) يتجاوز مبلغ الدفعة الكلي (%s)', v_total_allocated, p_amount
    USING ERRCODE = '22023';
  END IF;

  v_unallocated_amount := p_amount - v_total_allocated;

  -- ح. توليد رقم الإيصال التسلسلي للمنظمة
  SELECT COALESCE(
    MAX(
      NULLIF(regexp_replace(receipt_no, '\D', '', 'g'), '')::bigint
    ), 0) + 1
  INTO v_seq_num
  FROM public.payments
  WHERE organization_id = p_organization_id;

  v_receipt_no := 'REC-' || lpad(v_seq_num::text, 6, '0');

  -- ط. إدراج سطر الدفعة في جدول payments مع تحصين unique_violation
  BEGIN
    INSERT INTO public.payments (
      organization_id,
      property_id,
      member_id,
      unit_id,
      amount,
      method,
      payment_date,
      receipt_no,
      memo,
      unallocated_amount,
      idempotency_key,
      status,
      created_by
    ) VALUES (
      p_organization_id,
      p_resort_id,
      p_member_id,
      NULL,
      p_amount,
      p_method,
      p_payment_date,
      v_receipt_no,
      p_memo,
      v_unallocated_amount,
      p_client_request_id,
      'POSTED',
      v_user_id
    )
    RETURNING id INTO v_payment_id;
  EXCEPTION
    WHEN unique_violation THEN
      IF p_client_request_id IS NOT NULL THEN
        SELECT id, receipt_no INTO v_existing_payment_id, v_existing_receipt_no
        FROM public.payments
        WHERE organization_id = p_organization_id AND idempotency_key = p_client_request_id;

        IF NOT FOUND THEN
          RAISE; -- التصادم ليس على idempotency_key بل على receipt_no — أعد رمي الخطأ الحقيقي
        END IF;

        RETURN jsonb_build_object(
          'success', true,
          'payment_id', v_existing_payment_id,
          'receipt_no', v_existing_receipt_no,
          'idempotent', true
        );
      ELSE
        RAISE;
      END IF;
  END;

  -- ي. إدراج التوزيعات في payment_allocations وتحديث حالة الاستحقاق
  IF p_allocations IS NOT NULL AND jsonb_array_length(p_allocations) > 0 THEN
    FOR v_alloc_item IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
      v_due_id := (v_alloc_item->>'due_id')::uuid;
      v_alloc_amount := (v_alloc_item->>'amount')::numeric(19, 4);

      IF v_alloc_amount > 0 THEN
        INSERT INTO public.payment_allocations (
          payment_id,
          due_id,
          amount
        ) VALUES (
          v_payment_id,
          v_due_id,
          v_alloc_amount
        );

        UPDATE public.dues
        SET status = CASE
          WHEN (
            amount - (
              SELECT COALESCE(SUM(amount), 0)
              FROM public.payment_allocations
              WHERE due_id = v_due_id
            )
          ) <= 0.001 THEN 'PAID'
          ELSE 'PARTIALLY_PAID'
        END
        WHERE id = v_due_id;
      END IF;
    END LOOP;
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'receipt_no', v_receipt_no,
    'allocated_amount', v_total_allocated,
    'unallocated_amount', v_unallocated_amount,
    'idempotent', false
  );
END;
$function$;

create or replace function public.record_payment(p_organization_id uuid, p_member_id uuid, p_amount numeric, p_payment_date date, p_method text, p_resort_id uuid DEFAULT NULL::uuid, p_memo text DEFAULT NULL::text, p_allocations jsonb DEFAULT '[]'::jsonb, p_client_request_id text DEFAULT NULL::text, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
DECLARE
  v_user_id uuid;
  v_payment_id uuid;
  v_existing_payment_id uuid;
  v_existing_receipt_no text;
  v_seq_num bigint;
  v_receipt_no text;
  v_total_allocated numeric(19, 4) := 0;
  v_unallocated_amount numeric(19, 4) := 0;
  v_alloc_item jsonb;
  v_due_id uuid;
  v_alloc_amount numeric(19, 4);
  v_due_record record;
  v_meta jsonb;
BEGIN
  -- أ. التحقق من الهوية والصلاحيات المالية المزامنة لـ Tenant والمنتجع (RBAC Security Check)
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION: طلب غير موثق' USING ERRCODE = '42501';
  END IF;

  IF NOT public.has_financial_permission(p_organization_id, 'finance.payments.create', p_resort_id) THEN
    RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بتسجيل التحصيلات والدفعات' USING ERRCODE = '42501';
  END IF;

  -- ب. فحص عدم التكرار الأولي (Idempotency Check)
  IF p_client_request_id IS NOT NULL AND trim(p_client_request_id) <> '' THEN
    SELECT id, receipt_no INTO v_existing_payment_id, v_existing_receipt_no
    FROM public.payments
    WHERE organization_id = p_organization_id AND idempotency_key = p_client_request_id
    LIMIT 1;

    IF v_existing_payment_id IS NOT NULL THEN
      -- تسجيل حدث الإعادة المكررة (Idempotent Replay)
      PERFORM public.append_financial_audit_event(
        p_organization_id := p_organization_id,
        p_action := 'PAYMENT_IDEMPOTENT_REPLAY',
        p_entity_type := 'PAYMENT',
        p_resort_id := p_resort_id,
        p_entity_id := v_existing_payment_id,
        p_request_id := p_client_request_id,
        p_ip_address := p_ip_address,
        p_user_agent := p_user_agent,
        p_metadata := jsonb_build_object(
          'receipt_no', v_existing_receipt_no,
          'amount', p_amount
        )
      );

      RETURN jsonb_build_object(
        'success', true,
        'payment_id', v_existing_payment_id,
        'receipt_no', v_existing_receipt_no,
        'idempotent', true
      );
    END IF;
  END IF;

  -- ج. القفل التزمني الفوري للمنظمة
  PERFORM pg_advisory_xact_lock(hashtext('record_payment_' || p_organization_id::text));

  -- د. التحقق من صحة المدخلات
  IF p_amount <= 0 THEN
    RAISE EXCEPTION 'مبلغ الدفعة يجب أن يكون أكبر من صفر' USING ERRCODE = '22023';
  END IF;

  IF p_payment_date > CURRENT_DATE THEN
    RAISE EXCEPTION 'لا يمكن تسجيل دفعة بتاريخ مستقبلي' USING ERRCODE = '22023';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.members
    WHERE id = p_member_id AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'العضو المحدد غير موجود أو لا ينتمي لهذه المنظمة' USING ERRCODE = '22023';
  END IF;

  IF p_resort_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.resorts
    WHERE id = p_resort_id AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'المنتجع المحدد غير تابع لهذه المنظمة' USING ERRCODE = '22023';
  END IF;

  -- هـ. التوزيعات وحساب إجمالي الموزع
  IF p_allocations IS NOT NULL AND jsonb_array_length(p_allocations) > 0 THEN
    IF (SELECT count(*) FROM jsonb_array_elements(p_allocations))
       <> (SELECT count(DISTINCT elem->>'due_id') FROM jsonb_array_elements(p_allocations) AS elem) THEN
      RAISE EXCEPTION 'لا يمكن تكرار نفس الاستحقاق في التوزيع' USING ERRCODE = '22023';
    END IF;

    FOR v_alloc_item IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
      v_due_id := (v_alloc_item->>'due_id')::uuid;
      v_alloc_amount := (v_alloc_item->>'amount')::numeric(19, 4);

      IF v_alloc_amount < 0 THEN
        RAISE EXCEPTION 'مبلغ التوزيع لا يمكن أن يكون سالباً' USING ERRCODE = '22023';
      END IF;

      IF v_alloc_amount > 0 THEN
        v_total_allocated := v_total_allocated + v_alloc_amount;

        SELECT d.id, d.amount, d.organization_id, d.unit_id,
               d.amount - COALESCE(SUM(pa.amount) FILTER (WHERE pa.reversed_at IS NULL AND p2.status = 'POSTED'), 0) AS unpaid_amount
        INTO v_due_record
        FROM public.dues d
        JOIN public.unit_ownerships uo ON uo.unit_id = d.unit_id
        LEFT JOIN public.payment_allocations pa ON pa.due_id = d.id
        LEFT JOIN public.payments p2 ON p2.id = pa.payment_id
        WHERE d.id = v_due_id
          AND d.organization_id = p_organization_id
          AND uo.member_id = p_member_id
          AND uo.end_date IS NULL
        GROUP BY d.id, d.amount, d.organization_id, d.unit_id;

        IF v_due_record.id IS NULL THEN
          RAISE EXCEPTION 'الاستحقاق المحدد غير موجود أو لا ينتمي لوحدات هذا العضو' USING ERRCODE = '22023';
        END IF;

        IF v_alloc_amount > (v_due_record.unpaid_amount + 0.001) THEN
          RAISE EXCEPTION 'مبلغ التوزيع (%s) يتجاوز المبلغ المتبقي على الاستحقاق (%s)', v_alloc_amount, v_due_record.unpaid_amount
          USING ERRCODE = '22023';
        END IF;
      END IF;
    END LOOP;
  END IF;

  IF v_total_allocated > (p_amount + 0.001) THEN
    RAISE EXCEPTION 'إجمالي المبالغ الموزعة (%s) يتجاوز مبلغ الدفعة الكلي (%s)', v_total_allocated, p_amount
    USING ERRCODE = '22023';
  END IF;

  v_unallocated_amount := p_amount - v_total_allocated;

  -- و. توليد رقم الإيصال
  SELECT COALESCE(
    MAX(
      NULLIF(regexp_replace(receipt_no, '\D', '', 'g'), '')::bigint
    ), 0) + 1
  INTO v_seq_num
  FROM public.payments
  WHERE organization_id = p_organization_id;

  v_receipt_no := 'REC-' || lpad(v_seq_num::text, 6, '0');

  -- ز. الإدراج وتسجيل التدقيق الذري
  BEGIN
    INSERT INTO public.payments (
      organization_id,
      property_id,
      member_id,
      unit_id,
      amount,
      method,
      payment_date,
      receipt_no,
      memo,
      unallocated_amount,
      idempotency_key,
      status,
      created_by
    ) VALUES (
      p_organization_id,
      p_resort_id,
      p_member_id,
      NULL,
      p_amount,
      p_method,
      p_payment_date,
      v_receipt_no,
      p_memo,
      v_unallocated_amount,
      p_client_request_id,
      'POSTED',
      v_user_id
    )
    RETURNING id INTO v_payment_id;
  EXCEPTION
    WHEN unique_violation THEN
      IF p_client_request_id IS NOT NULL THEN
        SELECT id, receipt_no INTO v_existing_payment_id, v_existing_receipt_no
        FROM public.payments
        WHERE organization_id = p_organization_id AND idempotency_key = p_client_request_id;

        IF NOT FOUND THEN RAISE; END IF;

        PERFORM public.append_financial_audit_event(
          p_organization_id := p_organization_id,
          p_action := 'PAYMENT_IDEMPOTENT_REPLAY',
          p_entity_type := 'PAYMENT',
          p_resort_id := p_resort_id,
          p_entity_id := v_existing_payment_id,
          p_request_id := p_client_request_id,
          p_ip_address := p_ip_address,
          p_user_agent := p_user_agent,
          p_metadata := jsonb_build_object('receipt_no', v_existing_receipt_no)
        );

        RETURN jsonb_build_object(
          'success', true,
          'payment_id', v_existing_payment_id,
          'receipt_no', v_existing_receipt_no,
          'idempotent', true
        );
      ELSE
        RAISE;
      END IF;
  END;

  -- ح. إدراج التوزيعات والتحديث
  IF p_allocations IS NOT NULL AND jsonb_array_length(p_allocations) > 0 THEN
    FOR v_alloc_item IN SELECT * FROM jsonb_array_elements(p_allocations)
    LOOP
      v_due_id := (v_alloc_item->>'due_id')::uuid;
      v_alloc_amount := (v_alloc_item->>'amount')::numeric(19, 4);

      IF v_alloc_amount > 0 THEN
        INSERT INTO public.payment_allocations (
          payment_id,
          due_id,
          amount
        ) VALUES (
          v_payment_id,
          v_due_id,
          v_alloc_amount
        );

        SELECT d.id, d.amount,
               COALESCE(SUM(pa.amount) FILTER (WHERE pa.reversed_at IS NULL AND p2.status = 'POSTED'), 0) AS total_paid
        INTO v_due_record
        FROM public.dues d
        LEFT JOIN public.payment_allocations pa ON pa.due_id = d.id
        LEFT JOIN public.payments p2 ON p2.id = pa.payment_id
        WHERE d.id = v_due_id
        GROUP BY d.id, d.amount;

        IF v_due_record.total_paid >= v_due_record.amount THEN
          UPDATE public.dues SET status = 'PAID' WHERE id = v_due_id;
        ELSE
          UPDATE public.dues SET status = 'PARTIALLY_PAID' WHERE id = v_due_id;
        END IF;
      END IF;
    END LOOP;
  END IF;

  -- ط. تسجيل حدث إنشاء الدفعة الذري (PAYMENT_CREATED Audit Event)
  v_meta := jsonb_build_object(
    'receipt_no', v_receipt_no,
    'member_id', p_member_id,
    'amount', p_amount,
    'method', p_method,
    'payment_date', p_payment_date,
    'allocated_amount', v_total_allocated,
    'unallocated_amount', v_unallocated_amount,
    'allocation_count', jsonb_array_length(p_allocations)
  );

  PERFORM public.append_financial_audit_event(
    p_organization_id := p_organization_id,
    p_action := 'PAYMENT_CREATED',
    p_entity_type := 'PAYMENT',
    p_resort_id := p_resort_id,
    p_entity_id := v_payment_id,
    p_request_id := p_client_request_id,
    p_ip_address := p_ip_address,
    p_user_agent := p_user_agent,
    p_metadata := v_meta
  );

  RETURN jsonb_build_object(
    'success', true,
    'payment_id', v_payment_id,
    'receipt_no', v_receipt_no,
    'allocated_amount', v_total_allocated,
    'unallocated_amount', v_unallocated_amount,
    'idempotent', false
  );
END;
$function$;

create or replace function public.validate_online_payments_clearing_account()
 returns trigger
 language plpgsql
as $function$
declare
  v_account public.chart_of_accounts;
begin
  if not exists (
    select 1 from public.resorts where id = new.property_id and organization_id = new.organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;

  select * into v_account
  from public.chart_of_accounts
  where id = new.online_payments_clearing_account_id;

  if v_account.id is null or v_account.organization_id <> new.organization_id then
    raise exception 'CLEARING_ACCOUNT_NOT_IN_ORGANIZATION: الحساب المحدد لا يتبع هذا الكيان' using errcode = '22023';
  end if;
  if v_account.category <> 'ASSET' then
    raise exception 'CLEARING_ACCOUNT_NOT_ASSET: حساب المقاصة يجب أن يكون من نوع أصول' using errcode = '22023';
  end if;
  if v_account.is_group then
    raise exception 'CLEARING_ACCOUNT_IS_GROUP: لا يمكن استخدام حساب تجميعي كحساب مقاصة' using errcode = '22023';
  end if;
  if not v_account.is_active then
    raise exception 'CLEARING_ACCOUNT_INACTIVE: حساب المقاصة غير نشط' using errcode = '22023';
  end if;
  if v_account.property_id is not null and v_account.property_id <> new.property_id then
    raise exception 'CLEARING_ACCOUNT_RESORT_MISMATCH: حساب المقاصة يتبع موقعًا مختلفًا' using errcode = '22023';
  end if;

  return new;
end;
$function$;

create or replace function public.void_payment(p_organization_id uuid, p_payment_id uuid, p_reason text, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text)
 returns jsonb
 language plpgsql
 security definer
 set search_path to 'public', 'extensions'
as $function$
declare
  v_user_id uuid;
  v_payment record;
  v_reason text;
  v_affected_due_ids uuid[];
  v_allocation_snapshot jsonb;
  v_due_id uuid;
  v_due record;
  v_total_paid numeric(19, 4);
  v_new_status text;
  v_today date := current_date;
begin
  -- 1. Identity + input shape (permission is re-checked in step 4 once the
  -- payment's own resort_id is known, for resort-scoped roles).
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: طلب غير موثق' using errcode = '42501';
  end if;

  v_reason := trim(coalesce(p_reason, ''));
  if v_reason = '' then
    raise exception 'REASON_REQUIRED: سبب الإلغاء مطلوب' using errcode = '22023';
  end if;
  if char_length(v_reason) > 1000 then
    raise exception 'REASON_TOO_LONG: سبب الإلغاء طويل جدًا (الحد 1000 حرف)' using errcode = '22023';
  end if;

  -- 2. Organization-scoped advisory lock -- the SAME key record_payment
  -- takes, so the two RPCs serialize against each other for this
  -- organization instead of racing on the same due's computed status.
  perform pg_advisory_xact_lock(hashtext('record_payment_' || p_organization_id::text));

  -- 3. Fetch + row-lock the payment. FOR UPDATE so a second concurrent
  -- void_payment call on the same payment blocks here (not just on the
  -- advisory lock, which is organization-wide and coarser) until the
  -- first transaction commits or rolls back.
  select * into v_payment
  from public.payments
  where id = p_payment_id and organization_id = p_organization_id
  for update;

  if v_payment.id is null then
    raise exception 'PAYMENT_NOT_FOUND: الدفعة غير موجودة في هذا الكيان' using errcode = '22023';
  end if;

  -- 4. Permission, now that the payment's real resort_id is known (never
  -- trust a client-supplied resort_id for a permission check).
  if not public.has_financial_permission(p_organization_id, 'finance.payments.void', v_payment.property_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإلغاء الدفعات' using errcode = '42501';
  end if;

  -- 5. (reason already validated in step 1)

  -- 6. Status guard -- idempotent-safe: a second click gets a clear
  -- rejection, never a silent no-op or a duplicate reversal.
  if v_payment.status = 'REVERSED' then
    raise exception 'ALREADY_REVERSED: هذه الدفعة ملغاة بالفعل بتاريخ %', v_payment.reversed_at using errcode = '22023';
  end if;
  if v_payment.status <> 'POSTED' then
    raise exception 'NOT_VOIDABLE: لا يمكن إلغاء دفعة بحالة %', v_payment.status using errcode = '22023';
  end if;

  -- 7. Snapshot the still-active allocations for this payment (due_id +
  -- amount) before anything is mutated -- feeds both the due-recompute
  -- loop below and the audit event's "what exactly was reversed" record.
  select array_agg(distinct due_id), jsonb_agg(jsonb_build_object('due_id', due_id, 'amount', amount, 'allocation_id', id))
  into v_affected_due_ids, v_allocation_snapshot
  from public.payment_allocations
  where payment_id = p_payment_id and reversed_at is null;

  -- 8. Lock the affected dues in a fixed order (by id) before touching
  -- any of them, so a hypothetical future concurrent path that locks the
  -- same dues (without going through the record_payment/void_payment
  -- advisory lock) can never deadlock against this transaction.
  if v_affected_due_ids is not null then
    perform 1 from public.dues where id = any(v_affected_due_ids) order by id for update;
  end if;

  -- 9. Reverse the allocations (mark, never delete).
  update public.payment_allocations
  set reversed_at = now(), reversed_by = v_user_id
  where payment_id = p_payment_id and reversed_at is null;

  -- 10. Recompute each affected due's status from its remaining active
  -- allocations on POSTED payments only -- same rule record_payment uses
  -- to mark PAID/PARTIALLY_PAID, extended with the OVERDUE/ISSUED split
  -- per the approved design (no independent job reclassifies a due once
  -- its payment disappears).
  if v_affected_due_ids is not null then
    foreach v_due_id in array v_affected_due_ids loop
      select d.id, d.amount, d.due_date, d.status into v_due
      from public.dues d
      where d.id = v_due_id;

      if v_due.id is not null and v_due.status <> 'VOID' then
        select coalesce(sum(pa.amount) filter (where pa.reversed_at is null and p2.status = 'POSTED'), 0)
        into v_total_paid
        from public.payment_allocations pa
        join public.payments p2 on p2.id = pa.payment_id
        where pa.due_id = v_due_id;

        if v_total_paid >= v_due.amount then
          v_new_status := 'PAID';
        elsif v_total_paid > 0 then
          v_new_status := 'PARTIALLY_PAID';
        elsif v_due.due_date < v_today then
          v_new_status := 'OVERDUE';
        else
          v_new_status := 'ISSUED';
        end if;

        update public.dues set status = v_new_status where id = v_due_id;
      end if;
    end loop;
  end if;

  -- 11. Reverse the payment itself. unallocated_amount is zeroed: a
  -- reversed payment no longer represents spendable credit.
  update public.payments
  set status = 'REVERSED',
      reversed_at = now(),
      reversed_by = v_user_id,
      reversal_reason = v_reason,
      unallocated_amount = 0
  where id = p_payment_id;

  -- 12. Audit event -- includes the pre-reversal snapshot (original
  -- amount, unallocated amount, and exactly which allocations were
  -- reversed) so the hash-chained record is self-contained even if
  -- someone later reads only the audit log.
  perform public.append_financial_audit_event(
    p_organization_id := p_organization_id,
    p_action := 'PAYMENT_REVERSED',
    p_entity_type := 'PAYMENT',
    p_resort_id := v_payment.property_id,
    p_entity_id := p_payment_id,
    p_request_id := null,
    p_ip_address := p_ip_address,
    p_user_agent := p_user_agent,
    p_metadata := jsonb_build_object(
      'reason', v_reason,
      'original_amount', v_payment.amount,
      'previous_unallocated_amount', v_payment.unallocated_amount,
      'receipt_no', coalesce(v_payment.receipt_no, v_payment.receipt_number::text),
      'affected_due_ids', to_jsonb(coalesce(v_affected_due_ids, array[]::uuid[])),
      'reversed_allocations', coalesce(v_allocation_snapshot, '[]'::jsonb)
    )
  );

  -- 13/14. Result; commit happens implicitly when the calling transaction
  -- ends (this whole function body already runs inside one).
  return jsonb_build_object(
    'success', true,
    'payment_id', p_payment_id,
    'affected_due_count', coalesce(array_length(v_affected_due_ids, 1), 0),
    'affected_due_ids', to_jsonb(coalesce(v_affected_due_ids, array[]::uuid[]))
  );
end;
$function$;

create or replace function public.forbid_online_txn_mutation_after_pending()
 returns trigger
 language plpgsql
as $function$
begin
  if old.status <> 'PENDING' and (
    new.amount <> old.amount or
    new.organization_id <> old.organization_id or
    new.property_id <> old.property_id or
    new.member_id <> old.member_id or
    new.provider <> old.provider
  ) then
    raise exception 'ONLINE_TXN_IMMUTABLE: cannot modify a settled transaction''s identity or amount' using errcode = '22023';
  end if;

  if old.status <> 'PENDING' and new.status <> old.status then
    raise exception 'ONLINE_TXN_INVALID_TRANSITION: cannot change status of a % transaction', old.status using errcode = '22023';
  end if;

  return new;
end;
$function$;
