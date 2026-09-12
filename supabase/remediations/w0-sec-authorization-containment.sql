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
--   - SEC-01: Harden public.has_permission() to require ACTIVE membership for tenant permissions.
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
-- Enforces explicit structural scoping:
--   - For tenant-owned roles (r.organization_id IS NOT NULL):
--       ura.organization_id MUST equal r.organization_id (blocks cross-tenant role assignments).
--   - For PLATFORM_SUPER_ADMIN:
--       role organization must be NULL AND assignment organization must be NULL.
--   - For global system template roles (r.organization_id IS NULL, e.g. TENANT_ADMIN / TENANT_OWNER):
--       Allowed in tenant scopes (NEW.organization_id IS NOT NULL) for temporary legacy compatibility.
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

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Referenced role does not exist'
      USING ERRCODE = 'P0001';
  END IF;

  -- Invariant A: PLATFORM_SUPER_ADMIN can only exist globally
  IF v_role_key = 'PLATFORM_SUPER_ADMIN' THEN
    IF NEW.organization_id IS NOT NULL OR v_role_org_id IS NOT NULL THEN
      RAISE EXCEPTION 'PLATFORM_SUPER_ADMIN role cannot be assigned to an organization scope'
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  -- Invariant B: Tenant-owned roles must match the assignment organization exactly
  IF v_role_org_id IS NOT NULL THEN
    IF NEW.organization_id IS NULL OR NEW.organization_id != v_role_org_id THEN
      RAISE EXCEPTION 'Tenant-owned role (org: %) cannot be assigned to different scope (org: %)',
        v_role_org_id, NEW.organization_id
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

-- 5. HARDEN public.has_permission() FOR ACTIVE MEMBERSHIP
-- Required semantics:
--   - Canonical platform admin may continue through the hardened is_platform_admin() path.
--   - Ordinary tenant authorization requires:
--       * matching organization_memberships row
--       * exact organization
--       * status = 'active'
--       * matching tenant-scoped role assignment (ura.organization_id = p_organization_id)
--       * matching permission
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
    -- 1. Canonical platform admin bypass (hardened is_platform_admin)
    public.is_platform_admin(p_user_id)
    OR (
      -- 2. Ordinary tenant authorization: requires ACTIVE membership in exact organization
      EXISTS (
        SELECT 1
        FROM public.organization_memberships om
        WHERE om.user_id = p_user_id
          AND om.organization_id = p_organization_id
          AND om.status = 'active'
      )
      AND
      -- 3. Tenant-scoped role assignment granting the requested permission
      EXISTS (
        SELECT 1
        FROM public.user_role_assignments ura
        JOIN public.roles r ON r.id = ura.role_id
        JOIN public.role_permissions rp ON rp.role_id = r.id
        JOIN public.permissions p ON p.id = rp.permission_id
        WHERE ura.user_id = p_user_id
          AND ura.organization_id = p_organization_id
          AND p.key = p_permission_key
          AND (r.organization_id = p_organization_id OR (r.organization_id IS NULL AND r.key != 'PLATFORM_SUPER_ADMIN'))
      )
    )
  );
$$;
