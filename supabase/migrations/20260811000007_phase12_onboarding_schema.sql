-- Migration: Phase 12 Onboarding Schema Updates & Hardened Atomic RPC
-- File: supabase/migrations/20260811000007_phase12_onboarding_schema.sql

-- 1. Safely add/update entity_type and entity_type_custom_label columns on public.organizations
DO $$
BEGIN
  -- Drop entity_type_other column if it exists from older draft
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'entity_type_other'
  ) THEN
    ALTER TABLE public.organizations DROP COLUMN entity_type_other;
  END IF;

  -- Add entity_type_custom_label if it doesn't exist
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' AND table_name = 'organizations' AND column_name = 'entity_type_custom_label'
  ) THEN
    ALTER TABLE public.organizations ADD COLUMN entity_type_custom_label text;
  END IF;

  -- Drop existing entity_type check constraint if present
  IF EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'organizations_entity_type_check'
  ) THEN
    ALTER TABLE public.organizations DROP CONSTRAINT organizations_entity_type_check;
  END IF;
END $$;

-- Add updated CHECK constraint on entity_type supporting all 8 approved values
ALTER TABLE public.organizations
  ADD CONSTRAINT organizations_entity_type_check
  CHECK (
    entity_type IS NULL OR entity_type IN (
      'DEVELOPER',
      'FACILITY_MANAGEMENT',
      'OWNERS_ASSOCIATION',
      'INDIVIDUAL_OWNER',
      'TOURIST_RESORT',
      'TOURIST_VILLAGE',
      'RESIDENTIAL_COMPOUND',
      'OTHER'
    )
  );

-- 2. Hardened Atomic Onboarding RPC Function
CREATE OR REPLACE FUNCTION public.create_organization_onboarding(
  p_org_name text,
  p_entity_type text,
  p_entity_type_custom_label text DEFAULT NULL,
  p_resort_name text DEFAULT NULL,
  p_resort_code text DEFAULT NULL,
  p_timezone text DEFAULT 'Africa/Cairo',
  p_default_currency text DEFAULT 'EGP'
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor_id uuid;
  v_user_record record;
  v_clean_org_name text;
  v_clean_entity_type text;
  v_clean_custom_label text;
  v_clean_resort_name text;
  v_clean_resort_code text;
  v_slug text;
  v_base_slug text;
  v_counter integer := 1;
  v_org_id uuid;
  v_resort_id uuid;
  v_owner_role_id uuid;
BEGIN
  -- أ. استخدام auth.uid() والتحقق الصريح من هويّة المستخدم
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: يرجى تسجيل الدخول أولاً' USING ERRCODE = '42501';
  END IF;

  SELECT id, email, email_confirmed_at INTO v_user_record
  FROM auth.users
  WHERE id = v_actor_id;

  IF v_user_record.id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED: حساب المستخدم غير موجود' USING ERRCODE = '42501';
  END IF;

  -- ب. فحص العضويات السابقة لمنع التكرار
  IF EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE user_id = v_actor_id AND status IN ('active', 'invited')
  ) THEN
    RAISE EXCEPTION 'ALREADY_HAS_ORGANIZATION: الحساب ينتمي لكيان مؤسسي بالفعل' USING ERRCODE = '42501';
  END IF;

  -- ج. تطهير وفحص المدخلات (Input Trimming & Validation)
  v_clean_org_name := trim(COALESCE(p_org_name, ''));
  IF char_length(v_clean_org_name) < 2 OR char_length(v_clean_org_name) > 150 THEN
    RAISE EXCEPTION 'INVALID_ORG_NAME: اسم الكيان يجب أن يكون بين 2 و 150 حرفاً' USING ERRCODE = '22023';
  END IF;

  v_clean_entity_type := upper(trim(COALESCE(p_entity_type, '')));
  IF v_clean_entity_type NOT IN (
    'DEVELOPER',
    'FACILITY_MANAGEMENT',
    'OWNERS_ASSOCIATION',
    'INDIVIDUAL_OWNER',
    'TOURIST_RESORT',
    'TOURIST_VILLAGE',
    'RESIDENTIAL_COMPOUND',
    'OTHER'
  ) THEN
    RAISE EXCEPTION 'INVALID_ENTITY_TYPE: نوع الكيان المحدد غير مدعوم' USING ERRCODE = '22023';
  END IF;

  IF v_clean_entity_type = 'OTHER' THEN
    v_clean_custom_label := trim(COALESCE(p_entity_type_custom_label, ''));
    IF char_length(v_clean_custom_label) < 2 THEN
      RAISE EXCEPTION 'CUSTOM_LABEL_REQUIRED: يرجى إدخال وصف نوع الكيان المخصص عند اختيار "أخرى"' USING ERRCODE = '22023';
    END IF;
  ELSE
    v_clean_custom_label := NULL;
  END IF;

  v_clean_resort_name := trim(COALESCE(p_resort_name, ''));
  IF char_length(v_clean_resort_name) < 2 THEN
    RAISE EXCEPTION 'INVALID_RESORT_NAME: اسم المشروع/المنتجع الأول مطلوب (حرفان على الأقل)' USING ERRCODE = '22023';
  END IF;

  v_clean_resort_code := upper(trim(COALESCE(p_resort_code, '')));
  IF char_length(v_clean_resort_code) < 2 THEN
    v_clean_resort_code := 'RES-01';
  END IF;

  -- د. قفل تزمني لـ User ID لمنع التشغيل المتزامن الـ Double-Submit
  PERFORM pg_advisory_xact_lock(hashtext('onboarding_' || v_actor_id::text));

  -- هـ. التحقق الإلزامي من وجود دور النظام ORG_OWNER
  SELECT id INTO v_owner_role_id
  FROM public.roles
  WHERE key = 'ORG_OWNER' AND organization_id IS NULL AND is_system = true
  LIMIT 1;

  IF v_owner_role_id IS NULL THEN
    RAISE EXCEPTION 'OWNER_ROLE_NOT_CONFIGURED: دور مالك النظام ORG_OWNER غير مجهز في قاعدة البيانات' USING ERRCODE = '50000';
  END IF;

  -- و. توليد الـ Slug بطريقة آمنة وبثبات الفرادة (Slug Uniqueness & Collisions)
  v_base_slug := lower(regexp_replace(v_clean_org_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_base_slug := trim(both '-' from v_base_slug);
  IF v_base_slug IS NULL OR char_length(v_base_slug) < 2 THEN
    v_base_slug := 'entity-' || lower(substr(md5(random()::text), 1, 8));
  END IF;

  v_slug := v_base_slug;
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) LOOP
    v_counter := v_counter + 1;
    v_slug := v_base_slug || '-' || v_counter::text;
  END LOOP;

  -- ز. 1. إدراج الكيان (public.organizations)
  INSERT INTO public.organizations (
    name,
    slug,
    default_currency,
    entity_type,
    entity_type_custom_label,
    status,
    created_by,
    updated_by
  ) VALUES (
    v_clean_org_name,
    v_slug,
    COALESCE(p_default_currency, 'EGP'),
    v_clean_entity_type,
    v_clean_custom_label,
    'ACTIVE',
    v_actor_id,
    v_actor_id
  )
  RETURNING id INTO v_org_id;

  -- ح. 2. نسخ قالب الأدوار النظامية للكيان الجديد
  PERFORM public.clone_tenant_role_templates(v_org_id);

  -- ط. 3. إدراج الأصل / المشروع الأول (public.resorts)
  INSERT INTO public.resorts (
    organization_id,
    name,
    code,
    timezone,
    created_by,
    updated_by
  ) VALUES (
    v_org_id,
    v_clean_resort_name,
    v_clean_resort_code,
    COALESCE(p_timezone, 'Africa/Cairo'),
    v_actor_id,
    v_actor_id
  )
  RETURNING id INTO v_resort_id;

  -- ي. 4. إدراج عضوية مالك الكيان (public.organization_memberships)
  INSERT INTO public.organization_memberships (
    organization_id,
    user_id,
    status
  ) VALUES (
    v_org_id,
    v_actor_id,
    'active'
  );

  -- ك. 5. إسناد دور المالك (public.user_role_assignments)
  INSERT INTO public.user_role_assignments (
    user_id,
    role_id,
    organization_id,
    resort_id,
    created_by
  ) VALUES (
    v_actor_id,
    v_owner_role_id,
    v_org_id,
    NULL,
    v_actor_id
  );

  -- ل. 6. تسجيل حدث الأمان في platform_audit_logs (ضمن نفس الـ Transaction)
  INSERT INTO public.platform_audit_logs (
    actor_id,
    organization_id,
    action,
    entity_type,
    entity_id,
    safe_change_summary
  ) VALUES (
    v_actor_id,
    v_org_id,
    'organization.onboarding_completed',
    'organization',
    v_org_id,
    jsonb_build_object(
      'name', v_clean_org_name,
      'entity_type', v_clean_entity_type,
      'resort_id', v_resort_id,
      'slug', v_slug
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'organization_id', v_org_id,
    'resort_id', v_resort_id,
    'slug', v_slug
  );
END;
$$;

-- 5. حجب الاستدعاء المباشر عن العميل
REVOKE ALL ON FUNCTION public.create_organization_onboarding(text, text, text, text, text, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.create_organization_onboarding(text, text, text, text, text, text, text) FROM authenticated;
