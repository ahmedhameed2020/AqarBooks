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
--   - Safe to run against production or replica via psql or Supabase SQL Editor.
-- ==============================================================================

-- CHECK 1: Cross-tenant role assignment count
SELECT
    COUNT(*) AS cross_tenant_assignments_count
FROM public.user_role_assignments ura
JOIN public.roles r ON r.id = ura.role_id
WHERE r.organization_id IS NOT NULL
  AND (ura.organization_id IS NULL OR ura.organization_id != r.organization_id);

-- CHECK 2: Global/system roles assigned into tenant scopes count
SELECT
    COUNT(*) AS global_system_role_tenant_assignments_count
FROM public.user_role_assignments ura
JOIN public.roles r ON r.id = ura.role_id
WHERE r.organization_id IS NULL
  AND ura.organization_id IS NOT NULL;

-- CHECK 3: Active TENANT_OWNER coverage counts per active organization
WITH owner_counts AS (
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
)
SELECT
    COUNT(*) FILTER (WHERE active_owner_count = 0) AS active_orgs_without_active_owner_count,
    COUNT(*) FILTER (WHERE active_owner_count = 1) AS active_orgs_with_single_active_owner_count,
    COUNT(*) FILTER (WHERE active_owner_count > 1) AS active_orgs_with_multiple_active_owners_count
FROM owner_counts;

-- CHECK 4: Active organizations missing expected cloned tenant role set count
WITH expected_templates AS (
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
)
SELECT
    COUNT(*) AS active_orgs_missing_expected_cloned_roles_count
FROM org_roles
WHERE cloned_role_count < (SELECT COUNT(*) FROM expected_templates);

-- CHECK 5: Tenant roles containing platform.% permissions count
SELECT
    COUNT(*) AS tenant_roles_with_platform_perms_count
FROM public.roles r
JOIN public.role_permissions rp ON rp.role_id = r.id
JOIN public.permissions p ON p.id = rp.permission_id
WHERE r.organization_id IS NOT NULL
  AND p.key LIKE 'platform.%';

-- CHECK 6: Malformed platform-admin assignments count
SELECT
    COUNT(*) AS malformed_platform_admin_assignments_count
FROM public.user_role_assignments ura
JOIN public.roles r ON r.id = ura.role_id
WHERE r.key = 'PLATFORM_SUPER_ADMIN'
  AND (ura.organization_id IS NOT NULL OR r.organization_id IS NOT NULL);

-- CHECK 7: Users recognized as platform admin solely due to malformed legacy assignments count
WITH malformed_only_admins AS (
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
)
SELECT
    COUNT(*) AS malformed_only_platform_admin_users_count
FROM malformed_only_admins;

-- CHECK 8: Orphaned role assignments without active organization membership count
SELECT
    COUNT(*) AS orphaned_role_assignments_without_active_membership_count
FROM public.user_role_assignments ura
LEFT JOIN public.organization_memberships om
       ON om.organization_id = ura.organization_id
      AND om.user_id = ura.user_id
WHERE ura.organization_id IS NOT NULL
  AND (om.id IS NULL OR om.status != 'active');
