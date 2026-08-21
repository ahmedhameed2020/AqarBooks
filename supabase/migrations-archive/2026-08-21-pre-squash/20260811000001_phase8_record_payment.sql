-- Migration: Phase 8 Payment Recording Engine & Hardened RPC with Waterfall Allocation
-- File: supabase/migrations/20260811000001_phase8_record_payment.sql

-- 1. Add missing columns safely
ALTER TABLE public.payments 
  ADD COLUMN IF NOT EXISTS memo text,
  ADD COLUMN IF NOT EXISTS unallocated_amount numeric(19, 4) NOT NULL DEFAULT 0 CHECK (unallocated_amount >= 0),
  ADD COLUMN IF NOT EXISTS receipt_no text,
  ADD COLUMN IF NOT EXISTS idempotency_key text;

-- 2. Create Unique Indexes for idempotency and receipt numbers
DROP INDEX IF EXISTS public.idx_payments_idempotency;
CREATE UNIQUE INDEX idx_payments_idempotency 
  ON public.payments (organization_id, idempotency_key) 
  WHERE idempotency_key IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_payments_receipt_no 
  ON public.payments (organization_id, receipt_no) 
  WHERE receipt_no IS NOT NULL;

-- 3. Hardened record_payment RPC Procedure
CREATE OR REPLACE FUNCTION public.record_payment(
  p_organization_id uuid,
  p_member_id uuid,
  p_amount numeric,
  p_payment_date date,
  p_method text,
  p_resort_id uuid DEFAULT NULL,
  p_memo text DEFAULT NULL,
  p_allocations jsonb DEFAULT '[]'::jsonb,
  p_client_request_id text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
$$;
