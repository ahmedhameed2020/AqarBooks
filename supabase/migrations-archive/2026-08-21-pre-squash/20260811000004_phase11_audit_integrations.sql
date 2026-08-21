-- Migration: Phase 11.1 Financial Audit Integration into Core Financial RPCs
-- File: supabase/migrations/20260811000004_phase11_audit_integrations.sql

-- 1. Integration into record_payment RPC (IP & User Agent optional parameters)
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
               d.amount - COALESCE(SUM(pa.amount), 0) AS unpaid_amount
        INTO v_due_record
        FROM public.dues d
        JOIN public.unit_ownerships uo ON uo.unit_id = d.unit_id
        LEFT JOIN public.payment_allocations pa ON pa.due_id = d.id
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
               COALESCE(SUM(pa.amount), 0) AS total_paid
        INTO v_due_record
        FROM public.dues d
        LEFT JOIN public.payment_allocations pa ON pa.due_id = d.id
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

-- 2. Integration into issue_dues RPC
CREATE OR REPLACE FUNCTION public.issue_dues(
  p_organization_id uuid,
  p_resort_id uuid,
  p_unit_ids uuid[],
  p_due_type_id uuid,
  p_receivable_account_id uuid,
  p_amount numeric,
  p_amount_by_unit_type jsonb DEFAULT NULL,
  p_issue_date date DEFAULT CURRENT_DATE,
  p_due_date date DEFAULT CURRENT_DATE + INTERVAL '15 days',
  p_description text DEFAULT NULL,
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
    WHERE id = v_unit_id AND organization_id = p_organization_id AND resort_id = p_resort_id;

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
        resort_id,
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
$$;

-- 3. Integration into generate_recurring_dues RPC
CREATE OR REPLACE FUNCTION public.generate_recurring_dues(
  p_organization_id uuid,
  p_schedule_id uuid,
  p_period text,
  p_generated_by uuid DEFAULT NULL,
  p_override_issue_date date DEFAULT NULL,
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
  v_schedule record;
  v_unit_record record;
  v_unit_amount numeric(19, 4);
  v_issue_date date;
  v_due_date date;
  v_run_id uuid;
  v_generated_count integer := 0;
  v_total_amount numeric(19, 4) := 0;
  v_building_ids jsonb;
  v_zone_ids jsonb;
  v_unit_types jsonb;
BEGIN
  SELECT * INTO v_schedule
  FROM public.due_schedules
  WHERE id = p_schedule_id AND organization_id = p_organization_id;

  IF v_schedule.id IS NULL THEN
    RAISE EXCEPTION 'جدول الرسوم الدوري غير موجود' USING ERRCODE = '22023';
  END IF;

  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    IF NOT public.has_financial_permission(p_organization_id, 'finance.schedules.generate', v_schedule.resort_id) THEN
      RAISE EXCEPTION 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بتوليد الرسوم الدورية' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT v_schedule.is_active THEN
    RAISE EXCEPTION 'جدول الرسوم الدوري موقوف' USING ERRCODE = '22023';
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('generate_recurring_' || p_schedule_id::text));

  BEGIN
    INSERT INTO public.due_generation_runs (
      organization_id,
      schedule_id,
      period,
      generated_units_count,
      total_amount,
      generated_by
    ) VALUES (
      p_organization_id,
      p_schedule_id,
      p_period,
      0,
      0,
      COALESCE(p_generated_by, v_user_id)
    )
    RETURNING id INTO v_run_id;
  EXCEPTION
    WHEN unique_violation THEN
      PERFORM public.append_financial_audit_event(
        p_organization_id := p_organization_id,
        p_action := 'RECURRING_DUES_SKIPPED',
        p_entity_type := 'DUE_SCHEDULE',
        p_resort_id := v_schedule.resort_id,
        p_entity_id := p_schedule_id,
        p_request_id := NULL,
        p_ip_address := p_ip_address,
        p_user_agent := p_user_agent,
        p_metadata := jsonb_build_object(
          'period', p_period,
          'schedule_name', v_schedule.name,
          'reason', 'idempotent_replay'
        )
      );

      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'generated_units_count', 0,
        'total_amount', 0,
        'message', 'الدورة المالية تم توليدها سابقاً وتجاوز التكرار بسلام'
      );
  END;

  IF p_override_issue_date IS NOT NULL THEN
    v_issue_date := p_override_issue_date;
  ELSE
    IF v_schedule.frequency = 'MONTHLY' THEN
      v_issue_date := to_date(p_period || '-01', 'YYYY-MM-DD');
    ELSE
      v_issue_date := to_date(p_period || '-01-01', 'YYYY-MM-DD');
    END IF;
  END IF;

  v_due_date := v_issue_date + (v_schedule.due_offset_days || ' days')::interval;
  v_building_ids := v_schedule.scope->'building_ids';
  v_zone_ids := v_schedule.scope->'zone_ids';
  v_unit_types := v_schedule.scope->'unit_types';

  FOR v_unit_record IN
    SELECT u.id, u.unit_type, u.building_id, u.zone_id
    FROM public.units u
    WHERE u.organization_id = p_organization_id
      AND u.resort_id = v_schedule.resort_id
      AND (
        (v_schedule.scope->>'all')::boolean = true
        OR (v_building_ids IS NOT NULL AND v_building_ids ? u.building_id::text)
        OR (v_zone_ids IS NOT NULL AND v_zone_ids ? u.zone_id::text)
        OR (v_unit_types IS NOT NULL AND v_unit_types ? u.unit_type)
      )
  LOOP
    IF v_schedule.amount_by_unit_type IS NOT NULL AND v_schedule.amount_by_unit_type ? v_unit_record.unit_type THEN
      v_unit_amount := (v_schedule.amount_by_unit_type->>v_unit_record.unit_type)::numeric(19, 4);
    ELSE
      v_unit_amount := v_schedule.amount;
    END IF;

    INSERT INTO public.dues (
      organization_id,
      resort_id,
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
      v_schedule.resort_id,
      v_unit_record.id,
      v_schedule.due_type_id,
      v_schedule.receivable_account_id,
      v_unit_amount,
      v_issue_date,
      v_due_date,
      v_schedule.name || ' (' || p_period || ')',
      'ISSUED',
      COALESCE(p_generated_by, v_user_id)
    );

    v_generated_count := v_generated_count + 1;
    v_total_amount := v_total_amount + v_unit_amount;
  END LOOP;

  UPDATE public.due_generation_runs
  SET generated_units_count = v_generated_count,
      total_amount = v_total_amount
  WHERE id = v_run_id;

  PERFORM public.append_financial_audit_event(
    p_organization_id := p_organization_id,
    p_action := 'RECURRING_DUES_GENERATED',
    p_entity_type := 'DUE_SCHEDULE',
    p_resort_id := v_schedule.resort_id,
    p_entity_id := p_schedule_id,
    p_request_id := NULL,
    p_ip_address := p_ip_address,
    p_user_agent := p_user_agent,
    p_metadata := jsonb_build_object(
      'period', p_period,
      'run_id', v_run_id,
      'generated_units_count', v_generated_count,
      'total_amount', v_total_amount
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'generated_units_count', v_generated_count,
    'total_amount', v_total_amount
  );
END;
$$;
