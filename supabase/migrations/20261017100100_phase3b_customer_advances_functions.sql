-- Phase 3b: customer advances — approved account setter, advance receipt, credit application, application reversal,
-- and a void_payment that knows about applications.
--
-- Design: docs/superpowers/specs/2026-10-11-customer-advances-design.md (revision 3), plan task 3. Builds on
-- 20261017100000_phase3a_customer_advances_schema.sql. Nothing here changes record_payment / post_payment_internal /
-- record_online_payment. Public functions are granted to `authenticated` only where authorized; the internal ones are
-- explicitly revoked from PUBLIC, anon AND authenticated (Supabase default privileges would otherwise grant them).

-- 0. helpers (internal) -----------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.recompute_due_payment_status(p_due_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_due public.dues;
  v_paid numeric(19,4);
BEGIN
  SELECT * INTO v_due FROM public.dues WHERE id = p_due_id;
  IF v_due.id IS NULL OR v_due.status = 'VOID' THEN RETURN; END IF;
  SELECT COALESCE(SUM(pa.amount), 0) INTO v_paid
  FROM public.payment_allocations pa JOIN public.payments p ON p.id = pa.payment_id
  WHERE pa.due_id = p_due_id AND pa.reversed_at IS NULL AND p.status = 'POSTED';
  UPDATE public.dues SET status = CASE
      WHEN v_paid >= v_due.amount THEN 'PAID'
      WHEN v_paid > 0 THEN 'PARTIALLY_PAID'
      WHEN v_due.due_date < current_date THEN 'OVERDUE'
      ELSE 'ISSUED' END
  WHERE id = p_due_id;
END;
$$;
REVOKE ALL ON FUNCTION public.recompute_due_payment_status(uuid) FROM PUBLIC, anon, authenticated;

-- the period must belong to the organization, be OPEN and contain the date
CREATE OR REPLACE FUNCTION public.assert_posting_period(p_organization_id uuid, p_period_id uuid, p_date date)
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.assert_open_fiscal_period_for_date(p_organization_id, p_date);
  IF NOT EXISTS (
    SELECT 1 FROM public.fiscal_periods fp
    WHERE fp.id = p_period_id AND fp.organization_id = p_organization_id AND fp.status = 'OPEN'
      AND p_date BETWEEN fp.start_date AND fp.end_date
  ) THEN
    RAISE EXCEPTION 'FISCAL_PERIOD_MISMATCH: الفترة المحددة ليست فترة مفتوحة تغطي التاريخ %', p_date USING ERRCODE = '22023';
  END IF;
END;
$$;
REVOKE ALL ON FUNCTION public.assert_posting_period(uuid, uuid, date) FROM PUBLIC, anon, authenticated;

-- a canonical fingerprint of a request: jsonb text is key-ordered and numerics are cast to 4 decimals by the callers
CREATE OR REPLACE FUNCTION public.credit_request_hash(p_payload jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public', 'extensions'
AS $$ SELECT encode(extensions.digest(convert_to(p_payload::text, 'UTF8'), 'sha256'), 'hex'); $$;
REVOKE ALL ON FUNCTION public.credit_request_hash(jsonb) FROM PUBLIC, anon, authenticated;

-- normalised allocations: [{due_id, amount}] sorted by due_id, amounts to 4 decimals; rejects bad shapes and duplicate dues
CREATE OR REPLACE FUNCTION public.normalize_credit_allocations(p_allocations jsonb, p_allow_empty boolean)
RETURNS jsonb
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO 'public'
AS $$
DECLARE
  v_out jsonb;
BEGIN
  IF p_allocations IS NULL OR jsonb_typeof(p_allocations) <> 'array' THEN
    IF p_allow_empty AND p_allocations IS NULL THEN RETURN '[]'::jsonb; END IF;
    RAISE EXCEPTION 'ALLOCATIONS_INVALID: التوزيع يجب أن يكون قائمة' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_allocations) = 0 THEN
    IF p_allow_empty THEN RETURN '[]'::jsonb; END IF;
    RAISE EXCEPTION 'ALLOCATIONS_REQUIRED: يجب تحديد استحقاق واحد على الأقل' USING ERRCODE = '22023';
  END IF;
  BEGIN
    SELECT jsonb_agg(jsonb_build_object('due_id', due_id, 'amount', amount) ORDER BY due_id)
    INTO v_out
    FROM (SELECT (e ->> 'due_id')::uuid AS due_id, (e ->> 'amount')::numeric(19,4) AS amount FROM jsonb_array_elements(p_allocations) e) x;
  EXCEPTION WHEN others THEN
    RAISE EXCEPTION 'ALLOCATIONS_INVALID: كل بند يحتاج due_id صالحًا ومبلغًا رقميًا' USING ERRCODE = '22023';
  END;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(v_out) e WHERE (e ->> 'due_id') IS NULL OR (e ->> 'amount') IS NULL OR (e ->> 'amount')::numeric <= 0) THEN
    RAISE EXCEPTION 'ALLOCATION_AMOUNT_INVALID: يجب أن يكون كل مبلغ أكبر من صفر' USING ERRCODE = '22023';
  END IF;
  IF (SELECT count(DISTINCT e ->> 'due_id') FROM jsonb_array_elements(v_out) e) <> jsonb_array_length(v_out) THEN
    RAISE EXCEPTION 'DUPLICATE_DUE_IN_REQUEST: الاستحقاق نفسه مكرر داخل الطلب' USING ERRCODE = '22023';
  END IF;
  RETURN v_out;
END;
$$;
REVOKE ALL ON FUNCTION public.normalize_credit_allocations(jsonb, boolean) FROM PUBLIC, anon, authenticated;

-- 1. approved account setter (same shape as set_default_receivable_account) ---------------------------------------------

CREATE OR REPLACE FUNCTION public.set_default_customer_advance_account(p_organization_id uuid, p_property_id uuid, p_account_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_old uuid;
BEGIN
  IF auth.uid() IS NULL
     OR p_organization_id IS NULL
     OR NOT public.has_permission(auth.uid(), p_organization_id, 'finance.accounts.manage') THEN
    RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION' USING errcode = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.properties p WHERE p.id = p_property_id AND p.organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'PROPERTY_NOT_FOUND' USING errcode = '22023';
  END IF;
  SELECT customer_advance_account_id INTO v_old FROM public.organization_finance_settings
  WHERE organization_id = p_organization_id AND property_id = p_property_id;

  -- the validation trigger refuses a foreign / non-liability / group / inactive account. Receipts already recorded keep the
  -- account they were received into (payments.advance_account_id); this only affects NEW advance receipts.
  INSERT INTO public.organization_finance_settings (organization_id, property_id, customer_advance_account_id)
  VALUES (p_organization_id, p_property_id, p_account_id)
  ON CONFLICT (organization_id, property_id) DO UPDATE SET customer_advance_account_id = EXCLUDED.customer_advance_account_id;

  INSERT INTO public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  VALUES (auth.uid(), p_organization_id, p_property_id, 'finance.customer_advance_account.set', 'organization_finance_settings', p_property_id,
          jsonb_build_object('old', v_old, 'new', p_account_id));
END;
$$;
REVOKE ALL ON FUNCTION public.set_default_customer_advance_account(uuid, uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_default_customer_advance_account(uuid, uuid, uuid) TO authenticated;

-- 2. advance receipt ---------------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.post_advance_payment_internal(
  p_organization_id uuid, p_resort_id uuid, p_member_id uuid, p_unit_id uuid, p_amount numeric, p_method text,
  p_payment_date date, p_deposit_account_id uuid, p_fiscal_period_id uuid, p_allocations jsonb,
  p_idempotency_key text, p_cashier_session_id uuid, p_actor_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_alloc jsonb;
  v_allocs jsonb;
  v_due public.dues;
  v_due_entry_status text;
  v_amount numeric(19,4) := p_amount;
  v_allocated numeric(19,4) := 0;
  v_advance numeric(19,4);
  v_remaining numeric(19,4);
  v_advance_account uuid;
  v_credit_lines jsonb := '[]'::jsonb;
  v_grouped record;
  v_entry_id uuid;
  v_payment_id uuid;
  v_existing public.payments;
  v_receipt_number bigint;
  v_session public.cashier_sessions;
  v_hash text;
BEGIN
  IF p_actor_id IS NULL THEN RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION' USING errcode = '42501'; END IF;
  IF NOT public.organization_is_active(p_organization_id) THEN
    RAISE EXCEPTION 'ORGANIZATION_INACTIVE: الكيان غير نشط' USING errcode = '22023';
  END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED: مفتاح منع التكرار إلزامي للدفعة المقدمة' USING errcode = '22023';
  END IF;
  IF p_resort_id IS NULL OR NOT EXISTS (SELECT 1 FROM public.resorts WHERE id = p_resort_id AND organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' USING errcode = '22023';
  END IF;
  IF v_amount IS NULL OR v_amount <= 0 THEN
    RAISE EXCEPTION 'AMOUNT_INVALID: يجب أن يكون المبلغ أكبر من صفر' USING errcode = '22023';
  END IF;
  IF p_payment_date IS NULL OR p_payment_date > current_date THEN
    RAISE EXCEPTION 'FUTURE_DATE_NOT_ALLOWED: لا يمكن تسجيل دفعة بتاريخ مستقبلي' USING errcode = '22023';
  END IF;
  IF p_member_id IS NULL OR p_unit_id IS NULL THEN
    RAISE EXCEPTION 'MEMBER_AND_UNIT_REQUIRED: الدفعة المقدمة تتطلب عضوًا ووحدة معروفين' USING errcode = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.units u WHERE u.id = p_unit_id AND u.organization_id = p_organization_id AND u.property_id = p_resort_id)
     OR NOT EXISTS (SELECT 1 FROM public.members m WHERE m.id = p_member_id AND m.organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'MEMBER_OR_UNIT_NOT_FOUND: العضو أو الوحدة غير موجودة في هذا الكيان والموقع' USING errcode = '22023';
  END IF;
  v_allocs := public.normalize_credit_allocations(p_allocations, true);
  v_hash := public.credit_request_hash(jsonb_build_object(
    'op', 'RECORD_ADVANCE', 'org', p_organization_id, 'resort', p_resort_id, 'member', p_member_id, 'unit', p_unit_id,
    'amount', v_amount, 'method', p_method, 'date', p_payment_date, 'deposit', p_deposit_account_id,
    'period', p_fiscal_period_id, 'cashier', p_cashier_session_id, 'allocations', v_allocs));

  PERFORM pg_advisory_xact_lock(hashtext('record_payment_' || p_organization_id::text));

  -- idempotency by CONTENT: same key + same request = the same receipt; same key + different request = refused
  SELECT * INTO v_existing FROM public.payments WHERE organization_id = p_organization_id AND idempotency_key = p_idempotency_key;
  IF v_existing.id IS NOT NULL THEN
    IF v_existing.request_hash IS DISTINCT FROM v_hash THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED: المفتاح استُخدم سابقًا بمحتوى مختلف' USING errcode = '22023';
    END IF;
    RETURN jsonb_build_object('payment_id', v_existing.id, 'allocated_amount', v_existing.amount - v_existing.advance_amount,
      'advance_amount', v_existing.advance_amount, 'replay', true);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.unit_ownerships uo
    WHERE uo.organization_id = p_organization_id AND uo.member_id = p_member_id AND uo.unit_id = p_unit_id
      AND (uo.start_date IS NULL OR uo.start_date <= p_payment_date) AND (uo.end_date IS NULL OR uo.end_date >= p_payment_date)
  ) THEN
    RAISE EXCEPTION 'MEMBER_NOT_LINKED_TO_UNIT: العضو ليس مالكًا فعّالًا للوحدة بتاريخ الدفعة' USING errcode = '22023';
  END IF;
  IF p_method NOT IN ('CASH', 'BANK_TRANSFER', 'CHEQUE', 'OTHER') THEN
    RAISE EXCEPTION 'METHOD_INVALID: طريقة الدفع غير مسموحة للدفعة المقدمة' USING errcode = '22023';
  END IF;
  PERFORM public.assert_posting_period(p_organization_id, p_fiscal_period_id, p_payment_date);

  SELECT s.customer_advance_account_id INTO v_advance_account
  FROM public.organization_finance_settings s WHERE s.organization_id = p_organization_id AND s.property_id = p_resort_id;
  IF v_advance_account IS NULL THEN
    RAISE EXCEPTION 'ADVANCE_ACCOUNT_NOT_CONFIGURED: لم يُعتمد حساب سلف العملاء لهذا الموقع' USING errcode = '22023';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.chart_of_accounts a WHERE a.id = v_advance_account AND a.organization_id = p_organization_id AND a.is_active AND NOT a.is_group AND a.category = 'LIABILITY') THEN
    RAISE EXCEPTION 'ADVANCE_ACCOUNT_INACTIVE: حساب سلف العملاء المعتمد غير فعّال' USING errcode = '22023';
  END IF;

  IF p_cashier_session_id IS NOT NULL THEN
    SELECT * INTO v_session FROM public.cashier_sessions WHERE id = p_cashier_session_id;
    IF v_session.id IS NULL OR v_session.organization_id <> p_organization_id THEN
      RAISE EXCEPTION 'CASHIER_SESSION_NOT_FOUND: جلسة الكاشير غير موجودة في هذا الكيان' USING errcode = '22023';
    END IF;
    IF v_session.status <> 'OPEN' THEN
      RAISE EXCEPTION 'CASHIER_SESSION_NOT_OPEN: جلسة الكاشير غير مفتوحة' USING errcode = '22023';
    END IF;
    IF NOT EXISTS (SELECT 1 FROM public.cashboxes WHERE id = v_session.cashbox_id AND gl_account_id = p_deposit_account_id) THEN
      RAISE EXCEPTION 'DEPOSIT_ACCOUNT_MISMATCH: حساب الإيداع لا يطابق صندوق جلسة الكاشير' USING errcode = '22023';
    END IF;
  END IF;

  -- receipt-time allocations (optional): same unit, a posted due entry, within what is still owed
  FOR v_alloc IN SELECT * FROM jsonb_array_elements(v_allocs) LOOP
    SELECT * INTO v_due FROM public.dues WHERE id = (v_alloc ->> 'due_id')::uuid FOR UPDATE;
    IF v_due.id IS NULL OR v_due.organization_id <> p_organization_id THEN
      RAISE EXCEPTION 'DUE_NOT_FOUND: الاستحقاق غير موجود في هذا الكيان' USING errcode = '22023';
    END IF;
    IF v_due.property_id <> p_resort_id THEN
      RAISE EXCEPTION 'DUE_RESORT_MISMATCH: الاستحقاق % يتبع موقعًا مختلفًا عن موقع الدفعة', v_due.id USING errcode = '22023';
    END IF;
    IF v_due.unit_id IS DISTINCT FROM p_unit_id THEN
      RAISE EXCEPTION 'DUE_UNIT_MISMATCH: الاستحقاق % يتبع وحدة غير وحدة الدفعة', v_due.id USING errcode = '22023';
    END IF;
    IF v_due.status = 'VOID' THEN
      RAISE EXCEPTION 'DUE_VOID: لا يمكن سداد استحقاق ملغى' USING errcode = '22023';
    END IF;
    SELECT je.status INTO v_due_entry_status FROM public.journal_entries je WHERE je.id = v_due.journal_entry_id;
    IF v_due.journal_entry_id IS NULL OR v_due_entry_status IS DISTINCT FROM 'POSTED' THEN
      RAISE EXCEPTION 'DUE_NOT_POSTED: الاستحقاق % لا قيد مرحَّل له', v_due.id USING errcode = '22023';
    END IF;
    v_remaining := public.due_outstanding(v_due.id);
    IF (v_alloc ->> 'amount')::numeric(19,4) > v_remaining THEN
      RAISE EXCEPTION 'ALLOCATION_EXCEEDS_REMAINING: المبلغ (%) أكبر من المتبقي (%) على الاستحقاق %', v_alloc ->> 'amount', v_remaining, v_due.id USING errcode = '22023';
    END IF;
    v_allocated := v_allocated + (v_alloc ->> 'amount')::numeric(19,4);
  END LOOP;

  v_advance := v_amount - v_allocated;
  IF v_advance <= 0 THEN
    RAISE EXCEPTION 'NOT_AN_ADVANCE: لا يوجد باقٍ بعد التوزيع — استخدم تسجيل الدفعة العادي' USING errcode = '22023';
  END IF;

  FOR v_grouped IN
    SELECT d.receivable_account_id AS account_id, sum((a ->> 'amount')::numeric(19,4)) AS total
    FROM jsonb_array_elements(v_allocs) a JOIN public.dues d ON d.id = (a ->> 'due_id')::uuid
    GROUP BY d.receivable_account_id
  LOOP
    v_credit_lines := v_credit_lines || jsonb_build_array(jsonb_build_object('account_id', v_grouped.account_id, 'debit', 0, 'credit', v_grouped.total));
  END LOOP;
  v_credit_lines := v_credit_lines || jsonb_build_array(jsonb_build_object(
    'account_id', v_advance_account, 'debit', 0, 'credit', v_advance, 'description', 'Customer advance'));

  v_entry_id := public.create_journal_entry_internal(
    p_organization_id, p_resort_id, p_fiscal_period_id, p_payment_date, 'Payment received (with customer advance)', 'RECEIPT_VOUCHER',
    jsonb_build_array(jsonb_build_object('account_id', p_deposit_account_id, 'debit', v_amount, 'credit', 0)) || v_credit_lines, NULL);
  PERFORM public.post_journal_entry_internal(v_entry_id);

  v_receipt_number := public.next_sequence_value(p_organization_id, NULL, 'receipt');
  INSERT INTO public.payments (
    organization_id, property_id, member_id, unit_id, amount, method, payment_date, receipt_number, deposit_account_id,
    journal_entry_id, idempotency_key, created_by, unallocated_amount, advance_amount, advance_account_id, request_hash)
  VALUES (
    p_organization_id, p_resort_id, p_member_id, p_unit_id, v_amount, p_method, p_payment_date, v_receipt_number, p_deposit_account_id,
    v_entry_id, p_idempotency_key, p_actor_id, v_advance, v_advance, v_advance_account, v_hash)
  RETURNING id INTO v_payment_id;

  IF p_cashier_session_id IS NOT NULL THEN
    INSERT INTO public.cash_transactions (organization_id, session_id, type, amount, payment_id, created_by)
    VALUES (p_organization_id, p_cashier_session_id, 'RECEIPT', v_amount, v_payment_id, p_actor_id);
  END IF;

  FOR v_alloc IN SELECT * FROM jsonb_array_elements(v_allocs) LOOP
    INSERT INTO public.payment_allocations (payment_id, due_id, amount, created_by)
    VALUES (v_payment_id, (v_alloc ->> 'due_id')::uuid, (v_alloc ->> 'amount')::numeric(19,4), p_actor_id);
    PERFORM public.recompute_due_payment_status((v_alloc ->> 'due_id')::uuid);
  END LOOP;

  INSERT INTO public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  VALUES (p_actor_id, p_organization_id, p_resort_id, 'payment.advance_recorded', 'payment', v_payment_id,
    jsonb_build_object('amount', v_amount, 'allocated', v_allocated, 'advance', v_advance, 'advance_account_id', v_advance_account,
                       'receipt_number', v_receipt_number, 'unit_id', p_unit_id, 'member_id', p_member_id, 'cashier_session_id', p_cashier_session_id));

  RETURN jsonb_build_object('payment_id', v_payment_id, 'allocated_amount', v_allocated, 'advance_amount', v_advance, 'replay', false);
END;
$$;
REVOKE ALL ON FUNCTION public.post_advance_payment_internal(uuid, uuid, uuid, uuid, numeric, text, date, uuid, uuid, jsonb, text, uuid, uuid)
  FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.record_advance_payment(
  p_organization_id uuid, p_resort_id uuid, p_member_id uuid, p_unit_id uuid, p_amount numeric, p_method text,
  p_payment_date date, p_deposit_account_id uuid, p_fiscal_period_id uuid, p_allocations jsonb,
  p_idempotency_key text, p_cashier_session_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_financial_permission(p_organization_id, 'receivables.payments.create', p_resort_id) THEN
    RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية تسجيل دفعات' USING errcode = '42501';
  END IF;
  RETURN public.post_advance_payment_internal(p_organization_id, p_resort_id, p_member_id, p_unit_id, p_amount, p_method, p_payment_date,
    p_deposit_account_id, p_fiscal_period_id, p_allocations, p_idempotency_key, p_cashier_session_id, auth.uid());
END;
$$;
REVOKE ALL ON FUNCTION public.record_advance_payment(uuid, uuid, uuid, uuid, numeric, text, date, uuid, uuid, jsonb, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_advance_payment(uuid, uuid, uuid, uuid, numeric, text, date, uuid, uuid, jsonb, text, uuid) TO authenticated;

-- 3. apply credit to dues of the same unit -----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.apply_payment_credit(
  p_organization_id uuid, p_payment_id uuid, p_allocations jsonb, p_application_date date,
  p_fiscal_period_id uuid, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_payment public.payments;
  v_allocs jsonb;
  v_alloc jsonb;
  v_due public.dues;
  v_due_entry_status text;
  v_hash text;
  v_prior public.payment_credit_requests;
  v_remaining_credit numeric(19,4);
  v_due_remaining numeric(19,4);
  v_total numeric(19,4) := 0;
  v_amount numeric(19,4);
  v_entry_id uuid;
  v_alloc_id uuid;
  v_results jsonb := '[]'::jsonb;
  v_result jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION' USING errcode = '42501'; END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED: مفتاح منع التكرار إلزامي' USING errcode = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('record_payment_' || p_organization_id::text));

  SELECT * INTO v_payment FROM public.payments WHERE id = p_payment_id AND organization_id = p_organization_id FOR UPDATE;
  IF v_payment.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING errcode = '22023'; END IF;
  IF NOT public.has_financial_permission(p_organization_id, 'receivables.allocations.manage', v_payment.property_id) THEN
    RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION' USING errcode = '42501';
  END IF;

  v_allocs := public.normalize_credit_allocations(p_allocations, false);
  v_hash := public.credit_request_hash(jsonb_build_object('op', 'APPLY_CREDIT', 'org', p_organization_id, 'payment', p_payment_id,
    'date', p_application_date, 'period', p_fiscal_period_id, 'allocations', v_allocs));

  SELECT * INTO v_prior FROM public.payment_credit_requests WHERE organization_id = p_organization_id AND idempotency_key = p_idempotency_key;
  IF v_prior.idempotency_key IS NOT NULL THEN
    IF v_prior.operation <> 'APPLY_CREDIT' OR v_prior.request_hash <> v_hash THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED: المفتاح استُخدم سابقًا بمحتوى مختلف' USING errcode = '22023';
    END IF;
    RETURN v_prior.result || jsonb_build_object('replay', true);
  END IF;

  IF v_payment.status <> 'POSTED' THEN RAISE EXCEPTION 'PAYMENT_NOT_POSTED: الإيصال غير مرحَّل' USING errcode = '22023'; END IF;
  IF v_payment.advance_amount <= 0 THEN RAISE EXCEPTION 'NOT_AN_ADVANCE_RECEIPT: هذا الإيصال ليس دفعة مقدمة' USING errcode = '22023'; END IF;
  IF NOT EXISTS (SELECT 1 FROM public.journal_entries je WHERE je.id = v_payment.journal_entry_id AND je.status = 'POSTED') THEN
    RAISE EXCEPTION 'PAYMENT_JOURNAL_ENTRY_MISSING' USING errcode = '22023';
  END IF;
  IF p_application_date IS NULL OR p_application_date > current_date THEN
    RAISE EXCEPTION 'FUTURE_DATE_NOT_ALLOWED: لا يمكن التطبيق بتاريخ مستقبلي' USING errcode = '22023';
  END IF;
  IF p_application_date < v_payment.payment_date THEN
    RAISE EXCEPTION 'APPLICATION_BEFORE_RECEIPT: تاريخ التطبيق يسبق تاريخ الإيصال' USING errcode = '22023';
  END IF;
  PERFORM public.assert_posting_period(p_organization_id, p_fiscal_period_id, p_application_date);
  IF NOT EXISTS (SELECT 1 FROM public.chart_of_accounts a WHERE a.id = v_payment.advance_account_id AND a.organization_id = p_organization_id AND a.is_active) THEN
    RAISE EXCEPTION 'ADVANCE_ACCOUNT_INACTIVE: حساب السلف الذي استُلمت فيه الدفعة غير فعّال — أعد تفعيله أولًا' USING errcode = '22023';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.unit_ownerships uo
    WHERE uo.organization_id = p_organization_id AND uo.member_id = v_payment.member_id AND uo.unit_id = v_payment.unit_id
      AND (uo.start_date IS NULL OR uo.start_date <= p_application_date) AND (uo.end_date IS NULL OR uo.end_date >= p_application_date)
  ) THEN
    RAISE EXCEPTION 'MEMBER_NOT_LINKED_TO_UNIT: صاحب الرصيد لم يعد مرتبطًا بالوحدة بتاريخ التطبيق' USING errcode = '22023';
  END IF;

  SELECT v_payment.advance_amount - COALESCE(SUM(pa.amount), 0) INTO v_remaining_credit
  FROM public.payment_allocations pa WHERE pa.payment_id = p_payment_id AND pa.kind = 'CREDIT_APPLICATION' AND pa.reversed_at IS NULL;
  IF v_remaining_credit IS DISTINCT FROM v_payment.unallocated_amount THEN
    RAISE EXCEPTION 'CREDIT_BALANCE_INCONSISTENT: رصيد الإيصال المخزَّن لا يطابق تطبيقاته الفعّالة' USING errcode = 'XX001';
  END IF;

  -- validate every due first (sorted by id: stable lock order), then write
  FOR v_alloc IN SELECT * FROM jsonb_array_elements(v_allocs) LOOP
    SELECT * INTO v_due FROM public.dues WHERE id = (v_alloc ->> 'due_id')::uuid FOR UPDATE;
    IF v_due.id IS NULL OR v_due.organization_id <> p_organization_id THEN
      RAISE EXCEPTION 'DUE_NOT_FOUND: الاستحقاق غير موجود في هذا الكيان' USING errcode = '22023';
    END IF;
    IF v_due.property_id <> v_payment.property_id THEN
      RAISE EXCEPTION 'DUE_RESORT_MISMATCH: الاستحقاق % يتبع موقعًا مختلفًا', v_due.id USING errcode = '22023';
    END IF;
    IF v_due.unit_id IS DISTINCT FROM v_payment.unit_id THEN
      RAISE EXCEPTION 'DUE_UNIT_MISMATCH: الاستحقاق % يتبع وحدة غير وحدة الإيصال', v_due.id USING errcode = '22023';
    END IF;
    IF v_due.status = 'VOID' THEN RAISE EXCEPTION 'DUE_VOID: لا يمكن سداد استحقاق ملغى' USING errcode = '22023'; END IF;
    SELECT je.status INTO v_due_entry_status FROM public.journal_entries je WHERE je.id = v_due.journal_entry_id;
    IF v_due.journal_entry_id IS NULL OR v_due_entry_status IS DISTINCT FROM 'POSTED' THEN
      RAISE EXCEPTION 'DUE_NOT_POSTED: الاستحقاق % لا قيد مرحَّل له', v_due.id USING errcode = '22023';
    END IF;
    v_due_remaining := public.due_outstanding(v_due.id);
    v_amount := (v_alloc ->> 'amount')::numeric(19,4);
    IF v_amount > v_due_remaining THEN
      RAISE EXCEPTION 'ALLOCATION_EXCEEDS_REMAINING: المبلغ (%) أكبر من المتبقي (%) على الاستحقاق %', v_amount, v_due_remaining, v_due.id USING errcode = '22023';
    END IF;
    v_total := v_total + v_amount;
  END LOOP;
  IF v_total > v_remaining_credit THEN
    RAISE EXCEPTION 'CREDIT_EXCEEDED: المبلغ (%) أكبر من الرصيد المتاح (%)', v_total, v_remaining_credit USING errcode = '22023';
  END IF;

  -- one journal entry per application (so that each can be reversed on its own)
  FOR v_alloc IN SELECT * FROM jsonb_array_elements(v_allocs) LOOP
    SELECT * INTO v_due FROM public.dues WHERE id = (v_alloc ->> 'due_id')::uuid;
    v_amount := (v_alloc ->> 'amount')::numeric(19,4);
    v_entry_id := public.create_journal_entry_internal(
      p_organization_id, v_payment.property_id, p_fiscal_period_id, p_application_date,
      'Credit application: receipt ' || COALESCE(v_payment.receipt_no, v_payment.receipt_number::text, p_payment_id::text),
      'RECEIPT_VOUCHER',
      jsonb_build_array(
        jsonb_build_object('account_id', v_payment.advance_account_id, 'debit', v_amount, 'credit', 0, 'description', 'Customer advance applied'),
        jsonb_build_object('account_id', v_due.receivable_account_id, 'debit', 0, 'credit', v_amount)), NULL);
    PERFORM public.post_journal_entry_internal(v_entry_id);
    INSERT INTO public.payment_allocations (payment_id, due_id, amount, kind, applied_on, journal_entry_id, credit_account_id, created_by)
    VALUES (p_payment_id, v_due.id, v_amount, 'CREDIT_APPLICATION', p_application_date, v_entry_id, v_payment.advance_account_id, v_user)
    RETURNING id INTO v_alloc_id;
    PERFORM public.recompute_due_payment_status(v_due.id);
    v_results := v_results || jsonb_build_array(jsonb_build_object('allocation_id', v_alloc_id, 'due_id', v_due.id, 'amount', v_amount, 'journal_entry_id', v_entry_id));
  END LOOP;

  UPDATE public.payments SET unallocated_amount = unallocated_amount - v_total WHERE id = p_payment_id;

  INSERT INTO public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  VALUES (v_user, p_organization_id, v_payment.property_id, 'payment.credit_applied', 'payment', p_payment_id,
    jsonb_build_object('applied_total', v_total, 'remaining', v_remaining_credit - v_total, 'application_date', p_application_date,
                       'advance_account_id', v_payment.advance_account_id, 'allocations', v_results));

  v_result := jsonb_build_object('payment_id', p_payment_id, 'applied_total', v_total, 'remaining', v_remaining_credit - v_total,
                                 'allocations', v_results, 'replay', false);
  INSERT INTO public.payment_credit_requests (organization_id, idempotency_key, operation, request_hash, result, created_by)
  VALUES (p_organization_id, p_idempotency_key, 'APPLY_CREDIT', v_hash, v_result, v_user);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.apply_payment_credit(uuid, uuid, jsonb, date, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.apply_payment_credit(uuid, uuid, jsonb, date, uuid, text) TO authenticated;

-- 4. reverse one application ------------------------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.reverse_credit_application(
  p_organization_id uuid, p_allocation_id uuid, p_reason text, p_reversal_date date,
  p_fiscal_period_id uuid, p_idempotency_key text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'extensions'
AS $$
DECLARE
  v_user uuid := auth.uid();
  v_reason text := btrim(COALESCE(p_reason, ''));
  v_alloc public.payment_allocations;
  v_payment public.payments;
  v_original public.journal_entries;
  v_hash text;
  v_prior public.payment_credit_requests;
  v_lines jsonb;
  v_reversal_id uuid;
  v_result jsonb;
BEGIN
  IF v_user IS NULL THEN RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION' USING errcode = '42501'; END IF;
  IF v_reason = '' THEN RAISE EXCEPTION 'REASON_REQUIRED: سبب العكس إلزامي' USING errcode = '22023'; END IF;
  IF char_length(v_reason) > 1000 THEN RAISE EXCEPTION 'REASON_TOO_LONG' USING errcode = '22023'; END IF;
  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'IDEMPOTENCY_KEY_REQUIRED: مفتاح منع التكرار إلزامي' USING errcode = '22023';
  END IF;
  PERFORM pg_advisory_xact_lock(hashtext('record_payment_' || p_organization_id::text));

  SELECT pa.* INTO v_alloc FROM public.payment_allocations pa JOIN public.payments p ON p.id = pa.payment_id
  WHERE pa.id = p_allocation_id AND p.organization_id = p_organization_id FOR UPDATE OF pa;
  IF v_alloc.id IS NULL THEN RAISE EXCEPTION 'ALLOCATION_NOT_FOUND' USING errcode = '22023'; END IF;
  SELECT * INTO v_payment FROM public.payments WHERE id = v_alloc.payment_id FOR UPDATE;
  IF NOT public.has_financial_permission(p_organization_id, 'receivables.allocations.manage', v_payment.property_id) THEN
    RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION' USING errcode = '42501';
  END IF;

  v_hash := public.credit_request_hash(jsonb_build_object('op', 'REVERSE_APPLICATION', 'org', p_organization_id,
    'allocation', p_allocation_id, 'reason', v_reason, 'date', p_reversal_date, 'period', p_fiscal_period_id));
  SELECT * INTO v_prior FROM public.payment_credit_requests WHERE organization_id = p_organization_id AND idempotency_key = p_idempotency_key;
  IF v_prior.idempotency_key IS NOT NULL THEN
    IF v_prior.operation <> 'REVERSE_APPLICATION' OR v_prior.request_hash <> v_hash THEN
      RAISE EXCEPTION 'IDEMPOTENCY_KEY_REUSED: المفتاح استُخدم سابقًا بمحتوى مختلف' USING errcode = '22023';
    END IF;
    RETURN v_prior.result || jsonb_build_object('replay', true);
  END IF;

  IF v_alloc.kind <> 'CREDIT_APPLICATION' THEN
    RAISE EXCEPTION 'NOT_A_CREDIT_APPLICATION: تخصيصات الاستلام تُلغى بإلغاء الإيصال' USING errcode = '22023';
  END IF;
  IF v_alloc.reversed_at IS NOT NULL THEN RAISE EXCEPTION 'ALREADY_REVERSED' USING errcode = '22023'; END IF;
  IF v_payment.status <> 'POSTED' THEN RAISE EXCEPTION 'PAYMENT_NOT_POSTED: الإيصال غير مرحَّل' USING errcode = '22023'; END IF;
  IF p_reversal_date IS NULL OR p_reversal_date > current_date THEN
    RAISE EXCEPTION 'FUTURE_DATE_NOT_ALLOWED: لا يمكن العكس بتاريخ مستقبلي' USING errcode = '22023';
  END IF;
  IF p_reversal_date < v_alloc.applied_on THEN
    RAISE EXCEPTION 'REVERSAL_BEFORE_APPLICATION: تاريخ العكس يسبق تاريخ التطبيق' USING errcode = '22023';
  END IF;
  PERFORM public.assert_posting_period(p_organization_id, p_fiscal_period_id, p_reversal_date);
  IF NOT EXISTS (SELECT 1 FROM public.chart_of_accounts a WHERE a.id = v_alloc.credit_account_id AND a.organization_id = p_organization_id AND a.is_active) THEN
    RAISE EXCEPTION 'ADVANCE_ACCOUNT_INACTIVE: حساب السلف الذي استُخدم في التطبيق غير فعّال — أعد تفعيله أولًا' USING errcode = '22023';
  END IF;

  SELECT * INTO v_original FROM public.journal_entries WHERE id = v_alloc.journal_entry_id AND organization_id = p_organization_id FOR UPDATE;
  IF v_original.id IS NULL OR v_original.status <> 'POSTED' THEN
    RAISE EXCEPTION 'APPLICATION_JOURNAL_ENTRY_MISSING' USING errcode = '22023';
  END IF;
  PERFORM 1 FROM public.dues WHERE id = v_alloc.due_id FOR UPDATE;

  SELECT jsonb_agg(jsonb_build_object('account_id', account_id, 'debit', credit, 'credit', debit,
           'description', COALESCE(description, 'Credit application reversal')) ORDER BY line_number)
    INTO v_lines FROM public.journal_entry_lines WHERE journal_entry_id = v_original.id;
  v_reversal_id := public.create_journal_entry_internal(
    p_organization_id, v_original.property_id, p_fiscal_period_id, p_reversal_date,
    'Credit application reversal: ' || v_reason, 'PAYMENT_VOUCHER', v_lines, NULL);
  PERFORM public.post_journal_entry_internal(v_reversal_id);
  UPDATE public.journal_entries SET status = 'REVERSED' WHERE id = v_original.id;
  UPDATE public.journal_entries SET reversed_entry_id = v_original.id WHERE id = v_reversal_id;

  UPDATE public.payment_allocations
  SET reversed_at = now(), reversed_by = v_user, reversed_on = p_reversal_date, reversal_journal_entry_id = v_reversal_id
  WHERE id = p_allocation_id;
  UPDATE public.payments SET unallocated_amount = unallocated_amount + v_alloc.amount WHERE id = v_payment.id;
  PERFORM public.recompute_due_payment_status(v_alloc.due_id);

  INSERT INTO public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  VALUES (v_user, p_organization_id, v_payment.property_id, 'payment.credit_application_reversed', 'payment', v_payment.id,
    jsonb_build_object('allocation_id', p_allocation_id, 'due_id', v_alloc.due_id, 'amount', v_alloc.amount, 'reason', v_reason,
                       'reversal_date', p_reversal_date, 'reversal_journal_entry_id', v_reversal_id,
                       'remaining_after', v_payment.unallocated_amount + v_alloc.amount));

  v_result := jsonb_build_object('payment_id', v_payment.id, 'allocation_id', p_allocation_id, 'due_id', v_alloc.due_id, 'amount', v_alloc.amount,
                                 'reversal_journal_entry_id', v_reversal_id, 'remaining', v_payment.unallocated_amount + v_alloc.amount, 'replay', false);
  INSERT INTO public.payment_credit_requests (organization_id, idempotency_key, operation, request_hash, result, created_by)
  VALUES (p_organization_id, p_idempotency_key, 'REVERSE_APPLICATION', v_hash, v_result, v_user);
  RETURN v_result;
END;
$$;
REVOKE ALL ON FUNCTION public.reverse_credit_application(uuid, uuid, text, date, uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reverse_credit_application(uuid, uuid, text, date, uuid, text) TO authenticated;

-- 5. void_payment (regenerated from its live definition; see the two marked changes) -----------------------------------

CREATE OR REPLACE FUNCTION public.void_payment(p_organization_id uuid, p_payment_id uuid, p_reason text, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid := auth.uid();
  v_payment public.payments;
  v_original public.journal_entries;
  v_reversal_entry_id uuid;
  v_period_id uuid;
  v_reason text := trim(COALESCE(p_reason, ''));
  v_affected_due_ids uuid[];
  v_allocation_snapshot jsonb;
  v_due_id uuid;
  v_due public.dues;
  v_total_paid numeric(19,4);
  v_new_status text;
  v_reversal_lines jsonb;
BEGIN
  IF v_user_id IS NULL THEN RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION' USING errcode = '42501'; END IF;
  IF v_reason = '' THEN RAISE EXCEPTION 'REASON_REQUIRED' USING errcode = '22023'; END IF;
  IF char_length(v_reason) > 1000 THEN RAISE EXCEPTION 'REASON_TOO_LONG' USING errcode = '22023'; END IF;
  PERFORM pg_advisory_xact_lock(hashtext('record_payment_' || p_organization_id::text));

  SELECT * INTO v_payment FROM public.payments
  WHERE id = p_payment_id AND organization_id = p_organization_id FOR UPDATE;
  IF v_payment.id IS NULL THEN RAISE EXCEPTION 'PAYMENT_NOT_FOUND' USING errcode = '22023'; END IF;
  IF NOT public.has_financial_permission(p_organization_id, 'finance.payments.void', v_payment.property_id) THEN
    RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION' USING errcode = '42501';
  END IF;
  IF v_payment.status = 'REVERSED' THEN RAISE EXCEPTION 'ALREADY_REVERSED' USING errcode = '22023'; END IF;
  IF v_payment.status <> 'POSTED' THEN RAISE EXCEPTION 'NOT_VOIDABLE' USING errcode = '22023'; END IF;

  SELECT * INTO v_original FROM public.journal_entries
  WHERE id = v_payment.journal_entry_id AND organization_id = p_organization_id FOR UPDATE;
  IF v_original.id IS NULL OR v_original.status <> 'POSTED' THEN
    RAISE EXCEPTION 'PAYMENT_JOURNAL_ENTRY_MISSING' USING errcode = '22023';
  END IF;
  SELECT id INTO v_period_id FROM public.fiscal_periods
  WHERE organization_id = p_organization_id AND status = 'OPEN'
    AND current_date BETWEEN start_date AND end_date
  ORDER BY start_date DESC LIMIT 1;
  IF v_period_id IS NULL THEN RAISE EXCEPTION 'NO_OPEN_REVERSAL_PERIOD' USING errcode = '22023'; END IF;

  -- CHANGE 1 (customer advances): a receipt with a credit application still in force cannot be voided; reverse the
  -- applications first. Applications that were already reversed do not block (their entry and its reversal net to zero).
  IF EXISTS (SELECT 1 FROM public.payment_allocations pa WHERE pa.payment_id = p_payment_id AND pa.kind = 'CREDIT_APPLICATION' AND pa.reversed_at IS NULL) THEN
    RAISE EXCEPTION 'CREDIT_APPLICATIONS_ACTIVE: لا يمكن إلغاء إيصال له تطبيقات رصيد فعّالة (%) — اعكسها أولًا',
      (SELECT count(*) FROM public.payment_allocations pa WHERE pa.payment_id = p_payment_id AND pa.kind = 'CREDIT_APPLICATION' AND pa.reversed_at IS NULL)
      USING errcode = '22023';
  END IF;
  SELECT array_agg(DISTINCT due_id), jsonb_agg(jsonb_build_object('due_id', due_id, 'amount', amount, 'allocation_id', id))
    INTO v_affected_due_ids, v_allocation_snapshot
  FROM public.payment_allocations WHERE payment_id = p_payment_id AND reversed_at IS NULL;
  IF v_affected_due_ids IS NOT NULL THEN
    PERFORM 1 FROM public.dues WHERE id = ANY(v_affected_due_ids) ORDER BY id FOR UPDATE;
  END IF;
  -- CHANGE 2: the reversal date is the date of the reversal entry created below (current_date). Only allocations that are
  -- still in force are touched, so the reversal date of an earlier-reversed application is preserved.
  UPDATE public.payment_allocations SET reversed_at = now(), reversed_by = v_user_id, reversed_on = current_date
  WHERE payment_id = p_payment_id AND reversed_at IS NULL;

  IF v_affected_due_ids IS NOT NULL THEN
    FOREACH v_due_id IN ARRAY v_affected_due_ids LOOP
      SELECT * INTO v_due FROM public.dues WHERE id = v_due_id;
      IF v_due.id IS NOT NULL AND v_due.status <> 'VOID' THEN
        SELECT COALESCE(SUM(pa.amount) FILTER (WHERE pa.reversed_at IS NULL AND p2.status = 'POSTED'), 0)
          INTO v_total_paid FROM public.payment_allocations pa JOIN public.payments p2 ON p2.id = pa.payment_id
          WHERE pa.due_id = v_due_id;
        v_new_status := CASE WHEN v_total_paid >= v_due.amount THEN 'PAID'
          WHEN v_total_paid > 0 THEN 'PARTIALLY_PAID'
          WHEN v_due.due_date < current_date THEN 'OVERDUE' ELSE 'ISSUED' END;
        UPDATE public.dues SET status = v_new_status WHERE id = v_due_id;
      END IF;
    END LOOP;
  END IF;

  SELECT jsonb_agg(jsonb_build_object('account_id', account_id, 'debit', credit, 'credit', debit,
    'description', COALESCE(description, 'Payment reversal')) ORDER BY line_number)
    INTO v_reversal_lines FROM public.journal_entry_lines WHERE journal_entry_id = v_original.id;
  v_reversal_entry_id := public.create_journal_entry_internal(
    p_organization_id, v_original.property_id, v_period_id, current_date,
    'Payment reversal: ' || COALESCE(v_payment.receipt_no, v_payment.receipt_number::text, p_payment_id::text),
    'PAYMENT_VOUCHER', v_reversal_lines, 'payment-reversal:' || p_payment_id::text);
  PERFORM public.post_journal_entry_internal(v_reversal_entry_id);
  UPDATE public.journal_entries SET status = 'REVERSED' WHERE id = v_original.id;
  UPDATE public.journal_entries SET reversed_entry_id = v_original.id WHERE id = v_reversal_entry_id;
  UPDATE public.payments SET status = 'REVERSED', reversed_at = now(), reversed_by = v_user_id,
    reversal_reason = v_reason, unallocated_amount = 0, reversal_journal_entry_id = v_reversal_entry_id
  WHERE id = p_payment_id;

  PERFORM public.append_financial_audit_event(
    p_organization_id := p_organization_id, p_action := 'PAYMENT_REVERSED',
    p_entity_type := 'PAYMENT', p_resort_id := v_payment.property_id, p_entity_id := p_payment_id,
    p_request_id := NULL, p_ip_address := p_ip_address, p_user_agent := p_user_agent,
    p_metadata := jsonb_build_object('reason', v_reason, 'original_amount', v_payment.amount,
      'previous_unallocated_amount', v_payment.unallocated_amount, 'reversal_journal_entry_id', v_reversal_entry_id,
      'affected_due_ids', to_jsonb(COALESCE(v_affected_due_ids, ARRAY[]::uuid[])),
      'reversed_allocations', COALESCE(v_allocation_snapshot, '[]'::jsonb)));
  RETURN jsonb_build_object('success', true, 'payment_id', p_payment_id,
    'reversal_journal_entry_id', v_reversal_entry_id,
    'affected_due_ids', to_jsonb(COALESCE(v_affected_due_ids, ARRAY[]::uuid[])));
END;
$function$;
