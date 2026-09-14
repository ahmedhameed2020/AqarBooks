-- ==============================================================================
-- COMPENSATING RECOVERY ARTIFACT (ADR 0005: Rollback Class R1)
-- Target Migration: 20260913165500_w0_sec_authorization_containment.sql
-- NOTICE: DO NOT APPLY THIS SCRIPT UNLESS AUTHORIZED FOR EMERGENCY ROLLBACK!
-- ==============================================================================

-- 1. Revert is_platform_admin() to exact PRE-W0 baseline definition
CREATE OR REPLACE FUNCTION "public"."is_platform_admin"("p_user_id" "uuid") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select exists (
    select 1
    from public.user_role_assignments ura
    join public.roles r on r.id = ura.role_id
    where ura.user_id = p_user_id
      and r.key = 'PLATFORM_SUPER_ADMIN'
      and r.organization_id is null
  );
$$;

ALTER FUNCTION "public"."is_platform_admin"("p_user_id" "uuid") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."is_platform_admin"("p_user_id" "uuid") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."is_platform_admin"("p_user_id" "uuid") TO "authenticated";
GRANT ALL ON FUNCTION "public"."is_platform_admin"("p_user_id" "uuid") TO "service_role";

-- 2. Drop triggers and security guard functions added by W0-SEC
DROP TRIGGER IF EXISTS trg_user_role_assignments_security_guard ON public.user_role_assignments;
DROP FUNCTION IF EXISTS public.guard_user_role_assignments_security();

DROP TRIGGER IF EXISTS trg_roles_security_guard ON public.roles;
DROP FUNCTION IF EXISTS public.guard_roles_security();

DROP TRIGGER IF EXISTS trg_role_permissions_scope_guard ON public.role_permissions;
DROP FUNCTION IF EXISTS public.guard_role_permissions_scope();

-- 3. Revert has_permission() to exact PRE-W0 baseline definition
CREATE OR REPLACE FUNCTION "public"."has_permission"("p_user_id" "uuid", "p_organization_id" "uuid", "p_permission_key" "text") RETURNS boolean
    LANGUAGE "sql" STABLE SECURITY DEFINER
    SET "search_path" TO 'public'
    AS $$
  select public.is_platform_admin(p_user_id)
  or exists (
    select 1
    from public.user_role_assignments ura
    join public.role_permissions rp on rp.role_id = ura.role_id
    join public.permissions p on p.id = rp.permission_id
    where ura.user_id = p_user_id
      and ura.organization_id = p_organization_id
      and p.key = p_permission_key
  );
$$;

ALTER FUNCTION "public"."has_permission"("p_user_id" "uuid", "p_organization_id" "uuid", "p_permission_key" "text") OWNER TO "postgres";
REVOKE ALL ON FUNCTION "public"."has_permission"("p_user_id" "uuid", "p_organization_id" "uuid", "p_permission_key" "text") FROM PUBLIC;
GRANT ALL ON FUNCTION "public"."has_permission"("p_user_id" "uuid", "p_organization_id" "uuid", "p_permission_key" "text") TO "authenticated";
GRANT ALL ON FUNCTION "public"."has_permission"("p_user_id" "uuid", "p_organization_id" "uuid", "p_permission_key" "text") TO "service_role";
