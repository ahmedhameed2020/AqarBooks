-- Batch navigation authorization without changing has_permission semantics.
-- The caller may only resolve its own grants; SECURITY DEFINER is required
-- because authorization metadata is intentionally not exposed through RLS.
CREATE OR REPLACE FUNCTION public.get_navigation_permissions(
  p_user_id uuid,
  p_organization_id uuid,
  p_permission_keys text[]
)
RETURNS text[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT CASE
    WHEN auth.uid() IS DISTINCT FROM p_user_id THEN ARRAY[]::text[]
    WHEN public.is_platform_admin(p_user_id) THEN COALESCE(p_permission_keys, ARRAY[]::text[])
    WHEN NOT EXISTS (
      SELECT 1
      FROM public.organization_memberships om
      WHERE om.user_id = p_user_id
        AND om.organization_id = p_organization_id
        AND om.status = 'active'
    ) THEN ARRAY[]::text[]
    ELSE COALESCE(ARRAY(
      SELECT DISTINCT p.key
      FROM public.user_role_assignments ura
      JOIN public.roles r ON r.id = ura.role_id
      JOIN public.role_permissions rp ON rp.role_id = r.id
      JOIN public.permissions p ON p.id = rp.permission_id
      WHERE ura.user_id = p_user_id
        AND ura.organization_id = p_organization_id
        AND p.key = ANY(COALESCE(p_permission_keys, ARRAY[]::text[]))
        AND (
          r.organization_id = p_organization_id
          OR (r.organization_id IS NULL AND r.key != 'PLATFORM_SUPER_ADMIN')
        )
    ), ARRAY[]::text[])
  END;
$$;

REVOKE ALL ON FUNCTION public.get_navigation_permissions(uuid, uuid, text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_navigation_permissions(uuid, uuid, text[]) TO authenticated;
