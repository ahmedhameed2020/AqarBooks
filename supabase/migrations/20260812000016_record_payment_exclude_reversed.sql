-- record_payment previously summed payment_allocations with no regard for
-- whether the allocating payment was itself later reversed (reversed_at
-- IS NULL) or whether the payment row is still POSTED. Design B keeps
-- reversed allocations in place rather than deleting them, so both of
-- record_payment's SUM(...) computations must now exclude them explicitly
-- -- otherwise recording a new payment against a due that had a prior
-- payment voided would understate what's actually still owed. Everything
-- else in this function is unchanged from 20260811000004.
CREATE OR REPLACE FUNCTION public.record_payment(
  p_organization_id uuid,
  p_member_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_method text,
  p_resort_id uuid DEFAULT NULL,
  p_memo text DEFAULT NULL,
  p_allocations jsonb DEFAULT '[]'::jsonb,
  p_client_request_id text DEFAULT NULL,
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
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
      resort_id,
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
$$;
