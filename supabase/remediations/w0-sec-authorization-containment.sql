-- ==============================================================================
-- W0-SEC REMEDIATION: DATABASE AUTHORIZATION CONTAINMENT
-- ==============================================================================
-- IMPORTANT NOTICE:
--   DO NOT APPLY THIS SCRIPT DIRECTLY TO PRODUCTION!
--   This file is staged in supabase/remediations/ per strict remediation rules.
--   It will be incorporated into migrations ONLY after DB-01 reconciliation.
--
-- TARGET FINDINGS:
--   - SEC-01: Harden public.is_platform_admin() against tenant-scoped role assignment escalation.
--   - SEC-02: Prevent assigning PLATFORM_SUPER_ADMIN with non-null organization_id.
--   - SEC-02: Prevent creating tenant-owned roles (organization_id IS NOT NULL) with PLATFORM_SUPER_ADMIN.
--   - SEC-02: Prevent assigning platform-scoped permissions (key LIKE 'platform.%') to tenant roles.
-- ==============================================================================

-- 1. HARDEN is_platform_admin()
-- Ensure user_role_assignments row MUST have organization_id IS NULL.
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
      AND ura.organization_id IS NULL
      AND r.key = 'PLATFORM_SUPER_ADMIN'
      AND r.organization_id IS NULL
  );
$$;

-- 2. STRUCTURAL TRIGGER GUARD: user_role_assignments
-- Rejects any attempt to assign PLATFORM_SUPER_ADMIN with a non-null organization_id
CREATE OR REPLACE FUNCTION public.guard_user_role_assignments_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role_key text;
  v_role_org_id uuid;
BEGIN
  SELECT key, organization_id INTO v_role_key, v_role_org_id
  FROM public.roles
  WHERE id = NEW.role_id;

  IF v_role_key = 'PLATFORM_SUPER_ADMIN' THEN
    IF NEW.organization_id IS NOT NULL THEN
      RAISE EXCEPTION 'PLATFORM_SUPER_ADMIN role cannot be assigned to an organization scope'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_user_role_assignments_security_guard ON public.user_role_assignments;
CREATE TRIGGER trg_user_role_assignments_security_guard
BEFORE INSERT OR UPDATE ON public.user_role_assignments
FOR EACH ROW
EXECUTE FUNCTION public.guard_user_role_assignments_security();

-- 3. STRUCTURAL TRIGGER GUARD: roles
-- Rejects creating or updating tenant roles with reserved PLATFORM_SUPER_ADMIN key
CREATE OR REPLACE FUNCTION public.guard_roles_security()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  IF NEW.key = 'PLATFORM_SUPER_ADMIN' AND NEW.organization_id IS NOT NULL THEN
    RAISE EXCEPTION 'Cannot create organization-scoped role with reserved key PLATFORM_SUPER_ADMIN'
      USING ERRCODE = 'P0001';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_roles_security_guard ON public.roles;
CREATE TRIGGER trg_roles_security_guard
BEFORE INSERT OR UPDATE ON public.roles
FOR EACH ROW
EXECUTE FUNCTION public.guard_roles_security();

-- 4. STRUCTURAL TRIGGER GUARD: role_permissions
-- Prevents tenant roles from being granted platform-scoped permissions
CREATE OR REPLACE FUNCTION public.guard_role_permissions_scope()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role_org_id uuid;
  v_perm_key text;
BEGIN
  SELECT organization_id INTO v_role_org_id
  FROM public.roles
  WHERE id = NEW.role_id;

  IF v_role_org_id IS NOT NULL THEN
    SELECT key INTO v_perm_key
    FROM public.permissions
    WHERE id = NEW.permission_id;

    IF v_perm_key LIKE 'platform.%' THEN
      RAISE EXCEPTION 'Platform permissions cannot be granted to organization roles'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_role_permissions_scope_guard ON public.role_permissions;
CREATE TRIGGER trg_role_permissions_scope_guard
BEFORE INSERT OR UPDATE ON public.role_permissions
FOR EACH ROW
EXECUTE FUNCTION public.guard_role_permissions_scope();
