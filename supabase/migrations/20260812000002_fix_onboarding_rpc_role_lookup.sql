-- Fix: The onboarding RPC searched for key='ORG_OWNER' in public.roles with
-- organization_id IS NULL, but this global role was never seeded.
-- The correct pattern (matching the rest of the system) is TENANT_OWNER,
-- which is cloned per-organization via clone_tenant_role_templates().
--
-- This migration replaces the RPC body so it:
--   1. Looks up TENANT_OWNER *after* cloning role templates (tenant-scoped row).
--   2. Assigns that cloned role to the founder.
--   3. Keeps all other logic (advisory lock, validation, audit) unchanged.

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
  -- أ. التحقق من هوية المستخدم
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

  -- ب. منع التكرار
  IF EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE user_id = v_actor_id AND status IN ('active', 'invited')
  ) THEN
    RAISE EXCEPTION 'ALREADY_HAS_ORGANIZATION: الحساب ينتمي لكيان مؤسسي بالفعل' USING ERRCODE = '42501';
  END IF;

  -- ج. تطهير وفحص المدخلات
  v_clean_org_name := trim(COALESCE(p_org_name, ''));
  IF char_length(v_clean_org_name) < 2 OR char_length(v_clean_org_name) > 150 THEN
    RAISE EXCEPTION 'INVALID_ORG_NAME: اسم الكيان يجب أن يكون بين 2 و 150 حرفاً' USING ERRCODE = '22023';
  END IF;

  v_clean_entity_type := upper(trim(COALESCE(p_entity_type, '')));
  IF v_clean_entity_type NOT IN (
    'DEVELOPER', 'FACILITY_MANAGEMENT', 'OWNERS_ASSOCIATION', 'INDIVIDUAL_OWNER',
    'TOURIST_RESORT', 'TOURIST_VILLAGE', 'RESIDENTIAL_COMPOUND', 'OTHER'
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

  -- د. قفل تزمني لمنع Double-Submit
  PERFORM pg_advisory_xact_lock(hashtext('onboarding_' || v_actor_id::text));

  -- هـ. توليد Slug فريد
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

  -- و. 1. إدراج الكيان
  INSERT INTO public.organizations (
    name, slug, default_currency, entity_type,
    entity_type_custom_label, status, created_by, updated_by
  ) VALUES (
    v_clean_org_name, v_slug,
    COALESCE(p_default_currency, 'EGP'),
    v_clean_entity_type, v_clean_custom_label,
    'ACTIVE', v_actor_id, v_actor_id
  )
  RETURNING id INTO v_org_id;

  -- ز. 2. استنساخ قوالب الأدوار للكيان الجديد
  --       (هذا يُنشئ صف TENANT_OWNER مرتبطاً بـ v_org_id)
  PERFORM public.clone_tenant_role_templates(v_org_id);

  -- ح. 3. إدراج الأصل / المشروع الأول
  INSERT INTO public.resorts (
    organization_id, name, code, timezone, created_by, updated_by
  ) VALUES (
    v_org_id, v_clean_resort_name, v_clean_resort_code,
    COALESCE(p_timezone, 'Africa/Cairo'), v_actor_id, v_actor_id
  )
  RETURNING id INTO v_resort_id;

  -- ط. 4. إدراج عضوية المؤسس
  INSERT INTO public.organization_memberships (organization_id, user_id, status)
  VALUES (v_org_id, v_actor_id, 'active');

  -- ي. 5. جلب دور TENANT_OWNER الذي تم استنساخه للتو لهذا الكيان
  --       (يُبحث عنه بعد clone وليس قبله)
  SELECT id INTO v_owner_role_id
  FROM public.roles
  WHERE key = 'TENANT_OWNER'
    AND organization_id = v_org_id
  LIMIT 1;

  IF v_owner_role_id IS NULL THEN
    RAISE EXCEPTION 'ROLE_CLONE_FAILED: فشل استنساخ أدوار الكيان — تواصل مع الدعم الفني' USING ERRCODE = '50000';
  END IF;

  -- ك. 6. إسناد دور المالك للمؤسس
  INSERT INTO public.user_role_assignments (
    user_id, role_id, organization_id, resort_id, created_by
  ) VALUES (
    v_actor_id, v_owner_role_id, v_org_id, NULL, v_actor_id
  );

  -- ل. 7. تسجيل حدث الأمان في سجل التدقيق
  INSERT INTO public.platform_audit_logs (
    actor_id, organization_id, action, entity_type, entity_id, safe_change_summary
  ) VALUES (
    v_actor_id, v_org_id,
    'organization.onboarding_completed',
    'organization', v_org_id,
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

-- إعادة منح صلاحية التنفيذ للمستخدمين المسجّلين
REVOKE ALL ON FUNCTION public.create_organization_onboarding(text, text, text, text, text, text, text) FROM PUBLIC;
GRANT EXECUTE
  ON FUNCTION public.create_organization_onboarding(text, text, text, text, text, text, text)
  TO authenticated;
