-- Migration: Phase 11.2 Fine-Grained Financial RBAC & Permission Catalog
-- File: supabase/migrations/20260811000005_phase11_financial_rbac.sql

-- 1. Insert Financial Permissions into public.permissions
INSERT INTO public.permissions (key, description)
VALUES
  ('finance.payments.read', 'قراءة سجل الدفعات والإيصالات المالية'),
  ('finance.payments.create', 'تسجيل الدفعات وتحصيل الرسوم وتوزيعها'),
  ('finance.dues.read', 'قراءة كشوف المستحقات ورصيد الديون'),
  ('finance.dues.issue', 'إصدار المستحقات اليدوية الفردية والجماعية'),
  ('finance.schedules.read', 'قراءة الجداول والرسوم الدورية'),
  ('finance.schedules.manage', 'إنشاء وتعديل وتفعيل الجداول الدورية'),
  ('finance.schedules.generate', 'التوليد الفوري للدورة المالية الآن'),
  ('finance.reports.read', 'قراءة التقارير المالية وكشوف الحساب والميزانيات'),
  ('finance.reports.export', 'تصدير التقارير المالية بصيغة CSV أو PDF'),
  ('finance.audit.read', 'قراءة سجل التدقيق المالي المشفّر'),
  ('finance.audit.verify', 'تشغيل فحص سلامة سلسلة التشفير SHA-256')
ON CONFLICT (key) DO UPDATE SET description = EXCLUDED.description;

-- 2. Bind Financial Permissions to System Roles in role_permissions
DO $$
DECLARE
  v_role_owner uuid;
  v_role_admin uuid;
  v_role_fin_mgr uuid;
  v_role_chief_acc uuid;
  v_role_cashier uuid;
  v_perm_id uuid;
  v_perm_key text;
BEGIN
  -- Fetch Role IDs (System Roles where organization_id IS NULL)
  SELECT id INTO v_role_owner FROM public.roles WHERE key = 'ORG_OWNER' AND organization_id IS NULL LIMIT 1;
  SELECT id INTO v_role_admin FROM public.roles WHERE key = 'ORG_ADMIN' AND organization_id IS NULL LIMIT 1;
  SELECT id INTO v_role_fin_mgr FROM public.roles WHERE key = 'FINANCE_MANAGER' AND organization_id IS NULL LIMIT 1;
  SELECT id INTO v_role_chief_acc FROM public.roles WHERE key = 'CHIEF_ACCOUNTANT' AND organization_id IS NULL LIMIT 1;
  SELECT id INTO v_role_cashier FROM public.roles WHERE key = 'CASHIER' AND organization_id IS NULL LIMIT 1;

  -- Array of all financial permission keys
  FOR v_perm_key IN
    SELECT key FROM public.permissions WHERE key LIKE 'finance.%'
  LOOP
    SELECT id INTO v_perm_id FROM public.permissions WHERE key = v_perm_key;

    -- ORG_OWNER & ORG_ADMIN get all finance permissions
    IF v_role_owner IS NOT NULL THEN
      INSERT INTO public.role_permissions (role_id, permission_id) VALUES (v_role_owner, v_perm_id) ON CONFLICT DO NOTHING;
    END IF;
    IF v_role_admin IS NOT NULL THEN
      INSERT INTO public.role_permissions (role_id, permission_id) VALUES (v_role_admin, v_perm_id) ON CONFLICT DO NOTHING;
    END IF;

    -- FINANCE_MANAGER gets all finance permissions except audit.verify
    IF v_role_fin_mgr IS NOT NULL AND v_perm_key <> 'finance.audit.verify' THEN
      INSERT INTO public.role_permissions (role_id, permission_id) VALUES (v_role_fin_mgr, v_perm_id) ON CONFLICT DO NOTHING;
    END IF;

    -- CHIEF_ACCOUNTANT gets all except schedules.manage
    IF v_role_chief_acc IS NOT NULL AND v_perm_key <> 'finance.schedules.manage' THEN
      INSERT INTO public.role_permissions (role_id, permission_id) VALUES (v_role_chief_acc, v_perm_id) ON CONFLICT DO NOTHING;
    END IF;

    -- CASHIER gets only payments.read, payments.create, dues.read, schedules.read, reports.read
    IF v_role_cashier IS NOT NULL AND v_perm_key IN (
      'finance.payments.read',
      'finance.payments.create',
      'finance.dues.read',
      'finance.schedules.read',
      'finance.reports.read'
    ) THEN
      INSERT INTO public.role_permissions (role_id, permission_id) VALUES (v_role_cashier, v_perm_id) ON CONFLICT DO NOTHING;
    END IF;
  END LOOP;
END $$;

-- 3. Core PostgreSQL Security Check Function: has_financial_permission
CREATE OR REPLACE FUNCTION public.has_financial_permission(
  p_organization_id uuid,
  p_permission_key text,
  p_resort_id uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_actor_id uuid;
  v_org_status text;
  v_has_perm boolean := false;
BEGIN
  -- أ. الاعتماد حصراً على auth.uid() ومنع الاستدعاء كمنفذ آخر
  v_actor_id := auth.uid();
  IF v_actor_id IS NULL THEN
    RETURN false;
  END IF;

  -- ب. فحص حالة المنظمة (العمليات المالية تُرفض إذا كانت SUSPENDED أو ARCHIVED)
  SELECT status INTO v_org_status
  FROM public.organizations
  WHERE id = p_organization_id;

  IF v_org_status IS NULL OR v_org_status IN ('SUSPENDED', 'ARCHIVED') THEN
    RETURN false;
  END IF;

  -- ج. التحقق من صحة المنتجع وتبعيته للمنظمة إن تم تزويده
  IF p_resort_id IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.resorts
      WHERE id = p_resort_id AND organization_id = p_organization_id
    ) THEN
      RETURN false;
    END IF;
  END IF;

  -- د. التحقق من العضوية النشطة للمستخدم في المنظمة
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships
    WHERE organization_id = p_organization_id
      AND user_id = v_actor_id
      AND status = 'active'
  ) THEN
    RETURN false;
  END IF;

  -- هـ. استثناء منشئ/مالك المنظمة (Owner Bypass) بشرط حالة المنظمة النشطة
  IF EXISTS (
    SELECT 1 FROM public.organizations
    WHERE id = p_organization_id AND created_by = v_actor_id
  ) THEN
    RETURN true;
  END IF;

  -- و. فحص التعيينات والأدوار والصلاحيات المربوطة مع مراعاة نطاق المنتجع (Resort Scope)
  SELECT EXISTS (
    SELECT 1
    FROM public.user_role_assignments ura
    JOIN public.roles r ON r.id = ura.role_id
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE ura.user_id = v_actor_id
      AND ura.organization_id = p_organization_id
      AND (r.organization_id IS NULL OR r.organization_id = p_organization_id)
      AND (
        ura.resort_id IS NULL
        OR p_resort_id IS NULL
        OR ura.resort_id = p_resort_id
      )
      AND p.key = p_permission_key
  ) INTO v_has_perm;

  RETURN COALESCE(v_has_perm, false);
END;
$$;

-- 4. سحب الصلاحية المباشرة لمنع الاستدعاء عبر HTTP Client
REVOKE ALL ON FUNCTION public.has_financial_permission(uuid, text, uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.has_financial_permission(uuid, text, uuid) FROM authenticated;
