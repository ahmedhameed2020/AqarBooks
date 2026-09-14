-- ==============================================================================
-- W0-SEC FORENSIC AUDIT: PRODUCTION READ-ONLY COUNT CHECKS
-- ==============================================================================
-- PURPOSE:
--   Inspect current production state for authorization anomalies, role misconfigurations,
--   privilege escalations, cross-tenant leaks, template dependencies, and orphaned assignments.
--
-- STRICT OPERATIONAL RULES:
--   - READ-ONLY: Contains ONLY SELECT queries. No INSERT, UPDATE, DELETE, ALTER, or DROP.
--   - COUNT-ONLY: Returns aggregate counts only; no user, role, assignment, or organization identifiers.
--   - SINGLE RESULT SET: Returns one row so Supabase CLI and SQL Editor show every check consistently.
-- ==============================================================================

WITH
cross_tenant AS (
    SELECT COUNT(*) AS count
    FROM public.user_role_assignments ura
    JOIN public.roles r ON r.id = ura.role_id
    WHERE r.organization_id IS NOT NULL
      AND (ura.organization_id IS NULL OR ura.organization_id != r.organization_id)
),
global_system_tenant AS (
    SELECT COUNT(*) AS count
    FROM public.user_role_assignments ura
    JOIN public.roles r ON r.id = ura.role_id
    WHERE r.organization_id IS NULL
      AND ura.organization_id IS NOT NULL
),
owner_counts AS (
    SELECT
        o.id AS organization_id,
        COUNT(DISTINCT om.user_id) FILTER (WHERE r.id IS NOT NULL) AS active_owner_count
    FROM public.organizations o
    LEFT JOIN public.organization_memberships om
           ON om.organization_id = o.id
          AND om.status = 'active'
    LEFT JOIN public.user_role_assignments ura
           ON ura.user_id = om.user_id
          AND ura.organization_id = o.id
    LEFT JOIN public.roles r
           ON r.id = ura.role_id
          AND (r.organization_id = o.id OR (r.organization_id IS NULL AND r.key = 'TENANT_OWNER'))
          AND r.key = 'TENANT_OWNER'
    WHERE o.status = 'ACTIVE'
    GROUP BY o.id
),
owner_summary AS (
    SELECT
        COUNT(*) FILTER (WHERE active_owner_count = 0) AS without_owner,
        COUNT(*) FILTER (WHERE active_owner_count = 1) AS single_owner,
        COUNT(*) FILTER (WHERE active_owner_count > 1) AS multiple_owners
    FROM owner_counts
),
expected_templates AS (
    SELECT key FROM public.role_templates
),
org_roles AS (
    SELECT
        o.id AS organization_id,
        COUNT(DISTINCT r.key) AS cloned_role_count
    FROM public.organizations o
    LEFT JOIN public.roles r ON r.organization_id = o.id
    WHERE o.status = 'ACTIVE'
    GROUP BY o.id
),
missing_cloned_roles AS (
    SELECT COUNT(*) AS count
    FROM org_roles
    WHERE cloned_role_count < (SELECT COUNT(*) FROM expected_templates)
),
tenant_platform_perms AS (
    SELECT COUNT(*) AS count
    FROM public.roles r
    JOIN public.role_permissions rp ON rp.role_id = r.id
    JOIN public.permissions p ON p.id = rp.permission_id
    WHERE r.organization_id IS NOT NULL
      AND p.key LIKE 'platform.%'
),
malformed_platform_admin AS (
    SELECT COUNT(*) AS count
    FROM public.user_role_assignments ura
    JOIN public.roles r ON r.id = ura.role_id
    WHERE r.key = 'PLATFORM_SUPER_ADMIN'
      AND (ura.organization_id IS NOT NULL OR r.organization_id IS NOT NULL)
),
malformed_only_admins AS (
    SELECT COUNT(*) AS count
    FROM (
        SELECT ura.user_id
        FROM public.user_role_assignments ura
        JOIN public.roles r ON r.id = ura.role_id
        WHERE r.key = 'PLATFORM_SUPER_ADMIN'
          AND ura.organization_id IS NOT NULL
          AND NOT EXISTS (
              SELECT 1
              FROM public.user_role_assignments valid_ura
              JOIN public.roles valid_r ON valid_r.id = valid_ura.role_id
              WHERE valid_ura.user_id = ura.user_id
                AND valid_ura.organization_id IS NULL
                AND valid_r.key = 'PLATFORM_SUPER_ADMIN'
                AND valid_r.organization_id IS NULL
          )
        GROUP BY ura.user_id
    ) users
),
orphaned_assignments AS (
    SELECT COUNT(*) AS count
    FROM public.user_role_assignments ura
    LEFT JOIN public.organization_memberships om
           ON om.organization_id = ura.organization_id
          AND om.user_id = ura.user_id
    WHERE ura.organization_id IS NOT NULL
      AND (om.id IS NULL OR om.status != 'active')
)
SELECT
    (SELECT count FROM cross_tenant) AS cross_tenant_assignments_count,
    (SELECT count FROM global_system_tenant) AS global_system_role_tenant_assignments_count,
    (SELECT without_owner FROM owner_summary) AS active_orgs_without_active_owner_count,
    (SELECT single_owner FROM owner_summary) AS active_orgs_with_single_active_owner_count,
    (SELECT multiple_owners FROM owner_summary) AS active_orgs_with_multiple_active_owners_count,
    (SELECT count FROM missing_cloned_roles) AS active_orgs_missing_expected_cloned_roles_count,
    (SELECT count FROM tenant_platform_perms) AS tenant_roles_with_platform_perms_count,
    (SELECT count FROM malformed_platform_admin) AS malformed_platform_admin_assignments_count,
    (SELECT count FROM malformed_only_admins) AS malformed_only_platform_admin_users_count,
    (SELECT count FROM orphaned_assignments) AS orphaned_role_assignments_without_active_membership_count;
