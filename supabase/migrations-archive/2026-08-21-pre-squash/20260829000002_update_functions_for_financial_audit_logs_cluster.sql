-- Phase 2g Group 4: update the 2 functions with genuine column
-- references for the financial_audit_logs property_id rename.
--
-- append_financial_audit_event's p_resort_id parameter itself stays
-- unchanged -- it's called via named-argument syntax from ~35+ other
-- functions across the codebase (generate_recurring_dues, record_expense,
-- record_online_payment, etc.), all deliberately deferred per Issue #15.
--
-- verify_financial_audit_chain's v_rec.resort_id -> v_rec.property_id is
-- the one substitution in this migration that matters most: it's part of
-- the SHA-256 hash-chain reconstruction used for tamper-evidence
-- verification. The rename only changes the column NAME, not the stored
-- UUID VALUE, so the hash payload string is byte-identical before and
-- after for both old and new rows -- verified live against a real
-- production audit chain (418 rows) both before and after this migration.

CREATE OR REPLACE FUNCTION public.append_financial_audit_event(p_organization_id uuid, p_action text, p_entity_type text, p_resort_id uuid DEFAULT NULL::uuid, p_entity_id uuid DEFAULT NULL::uuid, p_request_id text DEFAULT NULL::text, p_ip_address inet DEFAULT NULL::inet, p_user_agent text DEFAULT NULL::text, p_metadata jsonb DEFAULT '{}'::jsonb)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
    property_id,
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
$function$;

CREATE OR REPLACE FUNCTION public.verify_financial_audit_chain(p_organization_id uuid)
 RETURNS TABLE(log_id uuid, action text, occurred_at timestamp with time zone, stored_hash text, calculated_hash text, is_valid boolean)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
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
      COALESCE(v_rec.property_id::text, ''),
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
$function$;
