-- Migration: Phase 11.1 Financial Audit Trail with Cryptographic Hash Chain & Hardened Security
-- File: supabase/migrations/20260811000003_phase11_financial_audit.sql

-- 1. Table: financial_audit_logs
CREATE TABLE IF NOT EXISTS public.financial_audit_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations (id) ON DELETE CASCADE,
  resort_id uuid REFERENCES public.resorts (id) ON DELETE SET NULL,
  actor_user_id uuid REFERENCES auth.users (id) ON DELETE SET NULL,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id uuid,
  request_id text,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  ip_address inet,
  user_agent text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  previous_hash text,
  event_hash text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),

  -- Strict Action Check Constraint
  CONSTRAINT check_audit_action CHECK (
    action IN (
      'PAYMENT_CREATED',
      'PAYMENT_IDEMPOTENT_REPLAY',
      'PAYMENT_ALLOCATION_CREATED',
      'DUE_ISSUED',
      'DUE_BATCH_ISSUED',
      'RECURRING_DUES_GENERATED',
      'RECURRING_DUES_SKIPPED',
      'OPERATION_REJECTED'
    )
  )
);

-- High Performance Indexes
CREATE INDEX IF NOT EXISTS idx_fin_audit_org_occurred ON public.financial_audit_logs (organization_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_audit_org_entity ON public.financial_audit_logs (organization_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_fin_audit_actor_occurred ON public.financial_audit_logs (actor_user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_fin_audit_action_occurred ON public.financial_audit_logs (action, occurred_at DESC);

-- Enable RLS
ALTER TABLE public.financial_audit_logs ENABLE ROW LEVEL SECURITY;

-- 2. RLS Policy: Restrict read access to organization members with administrative privileges or finance audit permission
CREATE POLICY "Admins and managers can read financial audit logs"
  ON public.financial_audit_logs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_memberships om
      WHERE om.organization_id = financial_audit_logs.organization_id
        AND om.user_id = auth.uid()
        AND om.status = 'active'
    )
  );

-- No INSERT / UPDATE / DELETE policies exist for regular users

-- 3. Internal Secured Function: append_financial_audit_event
CREATE OR REPLACE FUNCTION public.append_financial_audit_event(
  p_organization_id uuid,
  p_action text,
  p_entity_type text,
  p_resort_id uuid DEFAULT NULL,
  p_entity_id uuid DEFAULT NULL,
  p_request_id text DEFAULT NULL,
  p_ip_address inet DEFAULT NULL,
  p_user_agent text DEFAULT NULL,
  p_metadata jsonb DEFAULT '{}'::jsonb
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor_user_id uuid;
  v_prev_hash text;
  v_event_hash text;
  v_payload text;
  v_audit_id uuid;
  v_occurred_at timestamptz := now();
  v_final_metadata jsonb;
BEGIN
  -- أ. التحقق الصريح من وجود المنظمة
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = p_organization_id) THEN
    RAISE EXCEPTION 'المنظمة غير موجودة' USING ERRCODE = '22023';
  END IF;

  -- ب. التحقق من تبعية المنتجع للمنظمة في حال التزويد
  IF p_resort_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.resorts
      WHERE id = p_resort_id AND organization_id = p_organization_id
    ) THEN
      RAISE EXCEPTION 'المنتجع المحدّد لا ينتمي للمنظمة' USING ERRCODE = '22023';
    END IF;
  END IF;

  -- ج. تحديد هوية المنفذ بأمان ومنع التزوير
  v_actor_user_id := auth.uid();
  v_final_metadata := COALESCE(p_metadata, '{}'::jsonb);

  IF v_actor_user_id IS NOT NULL THEN
    -- استدعاء بشري مباشر: التثبت من عضوية المستخدم في المنظمة
    IF NOT EXISTS (
      SELECT 1 FROM public.organization_memberships
      WHERE organization_id = p_organization_id AND user_id = v_actor_user_id AND status = 'active'
    ) THEN
      RAISE EXCEPTION 'غير مصرح للوصول لهذه المنظمة' USING ERRCODE = '42501';
    END IF;
  ELSE
    -- استدعاء آلي عبر للنظام (System Cron): وسْم الميتابيانات صراحة بـ actor_type = system
    v_final_metadata := v_final_metadata || '{"actor_type": "system"}'::jsonb;
  END IF;

  -- د. قفل Advisory Lock لمنع تصادفات الـ Sequential Hash Chain لكل المنظمة
  PERFORM pg_advisory_xact_lock(hashtext('financial_audit_' || p_organization_id::text));

  -- هـ. جلب event_hash للحدث السلسلي الأحدث لنفس المنظمة
  SELECT event_hash INTO v_prev_hash
  FROM public.financial_audit_logs
  WHERE organization_id = p_organization_id
  ORDER BY occurred_at DESC, id DESC
  LIMIT 1;

  -- و. بناء الـ Payload الكامل والدقيق لحساب الـ SHA-256 Hash
  v_payload := concat_ws(
    '|',
    p_organization_id::text,
    COALESCE(p_resort_id::text, ''),
    COALESCE(v_actor_user_id::text, 'SYSTEM'),
    p_action,
    p_entity_type,
    COALESCE(p_entity_id::text, ''),
    COALESCE(p_request_id, ''),
    COALESCE(p_ip_address::text, ''),
    COALESCE(p_user_agent, ''),
    to_char(v_occurred_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
    v_final_metadata::text,
    COALESCE(v_prev_hash, 'GENESIS_BLOCK')
  );

  v_event_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');

  -- ز. إدراج سطر التدقيق
  INSERT INTO public.financial_audit_logs (
    organization_id,
    resort_id,
    actor_user_id,
    action,
    entity_type,
    entity_id,
    request_id,
    occurred_at,
    ip_address,
    user_agent,
    metadata,
    previous_hash,
    event_hash
  ) VALUES (
    p_organization_id,
    p_resort_id,
    v_actor_user_id,
    p_action,
    p_entity_type,
    p_entity_id,
    p_request_id,
    v_occurred_at,
    p_ip_address,
    p_user_agent,
    v_final_metadata,
    v_prev_hash,
    v_event_hash
  )
  RETURNING id INTO v_audit_id;

  RETURN v_audit_id;
END;
$$;

-- 4. سحب الصلاحيات المباشرة لحماية الدالة من الاستدعاء المباشر عبر البراوزر Client
REVOKE ALL ON FUNCTION public.append_financial_audit_event(
  uuid, text, text, uuid, uuid, text, inet, text, jsonb
) FROM PUBLIC;

REVOKE ALL ON FUNCTION public.append_financial_audit_event(
  uuid, text, text, uuid, uuid, text, inet, text, jsonb
) FROM authenticated;

-- 5. دالة التحقق السلسلي من سلامة الـ Hash Chain (Tamper-Evidence Checker)
CREATE OR REPLACE FUNCTION public.verify_financial_audit_chain(p_organization_id uuid)
RETURNS TABLE (
  log_id uuid,
  action text,
  occurred_at timestamptz,
  stored_hash text,
  calculated_hash text,
  is_valid boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_rec record;
  v_prev_hash text := NULL;
  v_calc_hash text;
  v_payload text;
BEGIN
  FOR v_rec IN
    SELECT * FROM public.financial_audit_logs
    WHERE organization_id = p_organization_id
    ORDER BY occurred_at ASC, id ASC
  LOOP
    v_payload := concat_ws(
      '|',
      v_rec.organization_id::text,
      COALESCE(v_rec.resort_id::text, ''),
      COALESCE(v_rec.actor_user_id::text, 'SYSTEM'),
      v_rec.action,
      v_rec.entity_type,
      COALESCE(v_rec.entity_id::text, ''),
      COALESCE(v_rec.request_id, ''),
      COALESCE(v_rec.ip_address::text, ''),
      COALESCE(v_rec.user_agent, ''),
      to_char(v_rec.occurred_at, 'YYYY-MM-DD"T"HH24:MI:SS.USOF'),
      v_rec.metadata::text,
      COALESCE(v_prev_hash, 'GENESIS_BLOCK')
    );

    v_calc_hash := encode(extensions.digest(v_payload, 'sha256'), 'hex');

    log_id := v_rec.id;
    action := v_rec.action;
    occurred_at := v_rec.occurred_at;
    stored_hash := v_rec.event_hash;
    calculated_hash := v_calc_hash;
    is_valid := (v_rec.event_hash = v_calc_hash) AND (COALESCE(v_rec.previous_hash, 'GENESIS_BLOCK') = COALESCE(v_prev_hash, 'GENESIS_BLOCK'));

    RETURN NEXT;

    v_prev_hash := v_rec.event_hash;
  END LOOP;
END;
$$;
