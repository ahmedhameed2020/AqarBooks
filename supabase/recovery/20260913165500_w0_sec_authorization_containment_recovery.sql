-- ==============================================================================
-- COMPENSATING RECOVERY ARTIFACT (ADR 0005: Rollback Class R1)
-- Target Migration: 20260913165500_w0_sec_authorization_containment.sql
-- NOTICE: DO NOT APPLY THIS SCRIPT UNLESS AUTHORIZED FOR EMERGENCY ROLLBACK!
-- ==============================================================================

-- 1. Revert is_platform_admin() to baseline definition
CREATE OR REPLACE FUNCTION public.is_platform_admin(p_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_role_assignments ura
    JOIN public.roles r ON r.id = ura.role_id
    WHERE ura.user_id = p_user_id
      AND r.key = 'PLATFORM_SUPER_ADMIN'
  );
$$;

-- 2. Drop triggers and security guard functions
DROP TRIGGER IF EXISTS trg_user_role_assignments_security_guard ON public.user_role_assignments;
DROP FUNCTION IF EXISTS public.guard_user_role_assignments_security();

DROP TRIGGER IF EXISTS trg_roles_security_guard ON public.roles;
DROP FUNCTION IF EXISTS public.guard_roles_security();

DROP TRIGGER IF EXISTS trg_role_permissions_scope_guard ON public.role_permissions;
DROP FUNCTION IF EXISTS public.guard_role_permissions_scope();

-- 3. Revert has_permission() to baseline definition
CREATE OR REPLACE FUNCTION public.has_permission(
  p_user_id uuid,
  p_organization_id uuid,
  p_permission_key text
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT (
    public.is_platform_admin(p_user_id)
    OR EXISTS (
      SELECT 1
      FROM public.user_role_assignments ura
      JOIN public.roles r ON r.id = ura.role_id
      JOIN public.role_permissions rp ON rp.role_id = r.id
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE ura.user_id = p_user_id
        AND ura.organization_id = p_organization_id
        AND p.key = p_permission_key
    )
  );
$$;
