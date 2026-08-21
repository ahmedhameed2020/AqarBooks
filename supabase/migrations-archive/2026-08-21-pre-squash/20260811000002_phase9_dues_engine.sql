-- Migration: Phase 9 Dues Generation Engine (Recurring Schedules & Manual/Bulk Dues Engine)
-- File: supabase/migrations/20260811000002_phase9_dues_engine.sql

-- 1. Table: due_schedules (Recurring Dues Rules)
CREATE TABLE IF NOT EXISTS public.due_schedules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  resort_id uuid NOT NULL REFERENCES public.resorts (id) ON DELETE CASCADE,
  name text NOT NULL,
  description_ar text,
  description_en text,
  due_type_id uuid NOT NULL REFERENCES public.due_types (id),
  receivable_account_id uuid NOT NULL REFERENCES public.chart_of_accounts (id),
  amount numeric(19, 4) NOT NULL CHECK (amount >= 0),
  amount_by_unit_type jsonb DEFAULT NULL, -- Format: {"VILLA": 5000, "CHALET": 3000}
  frequency text NOT NULL CHECK (frequency IN ('MONTHLY', 'YEARLY')),
  day_of_month integer NOT NULL DEFAULT 1 CHECK (day_of_month BETWEEN 1 AND 31),
  month_of_year integer DEFAULT NULL CHECK (month_of_year IS NULL OR month_of_year BETWEEN 1 AND 12),
  scope jsonb NOT NULL DEFAULT '{"all": true}'::jsonb, -- Scope: {"all": true} or {"building_ids": [...]} / {"zone_ids": [...]} / {"unit_types": [...]}
  due_offset_days integer NOT NULL DEFAULT 15 CHECK (due_offset_days >= 0),
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid REFERENCES auth.users (id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_due_schedules_org ON public.due_schedules (organization_id);
CREATE INDEX IF NOT EXISTS idx_due_schedules_resort ON public.due_schedules (resort_id);

-- 2. Table: due_generation_runs (Atomic Generation History for Idempotency)
CREATE TABLE IF NOT EXISTS public.due_generation_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  schedule_id uuid NOT NULL REFERENCES public.due_schedules (id) ON DELETE CASCADE,
  period text NOT NULL, -- Period string: '2026-08' or '2026'
  generated_units_count integer NOT NULL DEFAULT 0,
  total_amount numeric(19, 4) NOT NULL DEFAULT 0,
  generated_by uuid REFERENCES auth.users (id), -- NULL if executed via cron wrapper
  generated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT unique_schedule_period UNIQUE (schedule_id, period)
);

CREATE INDEX IF NOT EXISTS idx_due_generation_runs_schedule ON public.due_generation_runs (schedule_id);

-- 3. Enable RLS and Full Policies for due_schedules & due_generation_runs
ALTER TABLE public.due_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.due_generation_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can select due_schedules"
  ON public.due_schedules FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships
      WHERE organization_id = due_schedules.organization_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can insert due_schedules"
  ON public.due_schedules FOR INSERT
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.organization_memberships
      WHERE organization_id = due_schedules.organization_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can update due_schedules"
  ON public.due_schedules FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships
      WHERE organization_id = due_schedules.organization_id AND user_id = auth.uid()
    )
  );

CREATE POLICY "Org members can view due_generation_runs"
  ON public.due_generation_runs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships
      WHERE organization_id = due_generation_runs.organization_id AND user_id = auth.uid()
    )
  );

-- 4. RPC 1: issue_dues (Manual Single & Bulk Issuance with Explicit Cross-Tenant Error Handling)
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
  p_description text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
BEGIN
  -- أ. التحقق الصريح من الهوية والـ Tenant Membership
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'طلب غير موثق' USING ERRCODE = '42501';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id AND user_id = v_user_id
  ) THEN
    RAISE EXCEPTION 'غير مصرح للوصول لهذه المنظمة' USING ERRCODE = '42501';
  END IF;

  IF p_unit_ids IS NULL OR array_length(p_unit_ids, 1) = 0 THEN
    RAISE EXCEPTION 'يرجى تحديد وحدة واحدة على الأقل لإصدار المستحق' USING ERRCODE = '22023';
  END IF;

  IF p_amount < 0 THEN
    RAISE EXCEPTION 'مبلغ المستحق لا يمكن أن يكون سالباً' USING ERRCODE = '22023';
  END IF;

  IF p_due_date < p_issue_date THEN
    RAISE EXCEPTION 'تاريخ الاستحقاق لا يمكن أن يكون قبل تاريخ الإصدار' USING ERRCODE = '22023';
  END IF;

  -- ب. القفل التزمني لـ Serializing Dues Generation
  PERFORM pg_advisory_xact_lock(hashtext('issue_dues_' || p_organization_id::text));

  -- ج. حلقة إصدار المستحقات لكل وحدة مستهدفة مع فحص Cross-Tenant صريح
  FOREACH v_unit_id IN ARRAY p_unit_ids
  LOOP
    SELECT id, unit_type INTO v_unit_record
    FROM public.units
    WHERE id = v_unit_id AND organization_id = p_organization_id AND resort_id = p_resort_id;

    -- رفض صريح بدلاً من السكوت إذا كانت الوحدة غير تابعة للمنظمة والمنتجع
    IF v_unit_record.id IS NULL THEN
      RAISE EXCEPTION 'الوحدة المحددة (%) غير موجودة أو لا تنتمي لهذه المنظمة والمنتجع', v_unit_id USING ERRCODE = '22023';
    END IF;

    -- حساب المبلغ
    IF p_amount_by_unit_type IS NOT NULL AND p_amount_by_unit_type ? v_unit_record.unit_type THEN
      v_unit_amount := (p_amount_by_unit_type->>v_unit_record.unit_type)::numeric(19, 4);
    ELSE
      v_unit_amount := p_amount;
    END IF;

    -- فحص التكرار المباشر: نفس الوحدة + نفس نوع المستحق + نفس تاريخ الإصدار وتطابق الوصف
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

  RETURN jsonb_build_object(
    'success', true,
    'issued_count', v_issued_count,
    'skipped_count', v_skipped_count,
    'skipped_unit_ids', to_jsonb(v_skipped_unit_ids),
    'total_amount', v_total_amount
  );
END;
$$;

-- 5. RPC 2: generate_recurring_dues (With Security Member Checks & Custom Period Dates)
CREATE OR REPLACE FUNCTION public.generate_recurring_dues(
  p_organization_id uuid,
  p_schedule_id uuid,
  p_period text, -- Format: '2026-08' or '2026'
  p_generated_by uuid DEFAULT NULL,
  p_override_issue_date date DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  -- أ. فحص الأمان والحماية الحرج من ثغرات البراوزر (SECURITY DEFINER Check)
  v_user_id := auth.uid();
  IF v_user_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_memberships
      WHERE organization_id = p_organization_id AND user_id = v_user_id
    ) THEN
      RAISE EXCEPTION 'غير مصرح للوصول لهذه المنظمة' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- ب. جلب بيانات جدول الرسوم التكرارية
  SELECT * INTO v_schedule
  FROM public.due_schedules
  WHERE id = p_schedule_id AND organization_id = p_organization_id;

  IF v_schedule.id IS NULL THEN
    RAISE EXCEPTION 'جدول الرسوم الدوري غير موجود' USING ERRCODE = '22023';
  END IF;

  IF NOT v_schedule.is_active THEN
    RAISE EXCEPTION 'جدول الرسوم الدوري موقوف' USING ERRCODE = '22023';
  END IF;

  -- ج. Advisory Lock لضمان تسلسل توليد كل Schedule
  PERFORM pg_advisory_xact_lock(hashtext('generate_recurring_' || p_schedule_id::text));

  -- د. فحص الإدراج لمنع التكرار (Unique Constraint)
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
      RETURN jsonb_build_object(
        'success', true,
        'idempotent', true,
        'generated_units_count', 0,
        'total_amount', 0,
        'message', 'الدورة المالية تم توليدها سابقاً وتجاوز التكرار بسلام'
      );
  END;

  -- هـ. احتساب تاريخ الإصدار بناءً على تاريخ الدورة بدلاً من تاريخ اليوم التجاري
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

  -- و. حلقة توليد المستحقات لكل وحدة مستهدفة بالنطاق (تستحق على الوحدة حتى لو كانت خالية من المالك)
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

  RETURN jsonb_build_object(
    'success', true,
    'idempotent', false,
    'generated_units_count', v_generated_count,
    'total_amount', v_total_amount
  );
END;
$$;

-- 6. Cron Wrapper Function: run_due_schedules
CREATE OR REPLACE FUNCTION public.run_due_schedules()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_schedule record;
  v_current_day integer := EXTRACT(DAY FROM CURRENT_DATE);
  v_current_month integer := EXTRACT(MONTH FROM CURRENT_DATE);
  v_period text;
  v_res jsonb;
  v_total_runs integer := 0;
BEGIN
  FOR v_schedule IN
    SELECT * FROM public.due_schedules
    WHERE is_active = true
      AND (
        (frequency = 'MONTHLY' AND day_of_month = v_current_day)
        OR (frequency = 'YEARLY' AND day_of_month = v_current_day AND month_of_year = v_current_month)
      )
  LOOP
    IF v_schedule.frequency = 'MONTHLY' THEN
      v_period := to_char(CURRENT_DATE, 'YYYY-MM');
    ELSE
      v_period := to_char(CURRENT_DATE, 'YYYY');
    END IF;

    v_res := public.generate_recurring_dues(
      p_organization_id := v_schedule.organization_id,
      p_schedule_id := v_schedule.id,
      p_period := v_period,
      p_generated_by := NULL
    );

    v_total_runs := v_total_runs + 1;
  END LOOP;

  RETURN jsonb_build_object(
    'success', true,
    'executed_schedules_count', v_total_runs
  );
END;
$$;
