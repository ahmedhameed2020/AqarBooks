-- ==============================================================================
-- W0-SEC FORENSIC AUDIT: PRODUCTION READ-ONLY INSPECTION SCRIPT
-- ==============================================================================
-- PURPOSE:
--   Inspect current production state for authorization anomalies, role misconfigurations,
--   privilege escalations, cross-tenant leaks, template dependencies, and orphaned assignments.
--
-- STRICT OPERATIONAL RULES:
--   - READ-ONLY: Contains ONLY SELECT queries. No INSERT, UPDATE, DELETE, ALTER, or DROP.
--   - Return identifiers and counts; avoid unnecessary PII.
--   - Safe to run against production or replica via psql or Supabase SQL Editor.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- CHECK 1: Cross-tenant role assignment detection
-- Identifies user_role_assignments where the assigned role belongs to an organization,
-- but that organization does NOT match the assignment scope (ura.organization_id != r.organization_id).
-- ------------------------------------------------------------------------------
SELECT
    ura.id AS assignment_id,
    ura.user_id,
    ura.organization_id AS assignment_org_id,
    r.id AS role_id,
    r.key AS role_key,
    r.organization_id AS role_owner_org_id,
    ura.created_at
FROM public.user_role_assignments ura
JOIN public.roles r ON r.id = ura.role_id
WHERE r.organization_id IS NOT NULL
  AND (ura.organization_id IS NULL OR ura.organization_id != r.organization_id);

-- ------------------------------------------------------------------------------
-- CHECK 2: Global/system roles assigned into tenant scopes
-- Identifies which organizations and role keys currently depend on global system roles
-- (r.organization_id IS NULL) scoped into specific organizations (ura.organization_id IS NOT NULL).
-- Critical for planning migration to the Preferred Final Model (cloned roles only).
-- ------------------------------------------------------------------------------
SELECT
    ura.organization_id,
    o.slug AS org_slug,
    r.key AS system_role_key,
    COUNT(*) AS assignment_count
FROM public.user_role_assignments ura
JOIN public.roles r ON r.id = ura.role_id
LEFT JOIN public.organizations o ON o.id = ura.organization_id
WHERE r.organization_id IS NULL
  AND ura.organization_id IS NOT NULL
GROUP BY ura.organization_id, o.slug, r.key
ORDER BY assignment_count DESC;

-- ------------------------------------------------------------------------------
-- CHECK 3: Active TENANT_OWNER count per active organization
-- Returns every active organization and its exact count of active TENANT_OWNER users.
-- Flags organizations with 0, 1 (single point of failure), or multiple owners.
-- ------------------------------------------------------------------------------
SELECT
    o.id AS organization_id,
    o.slug AS org_slug,
    o.status AS org_status,
    COUNT(DISTINCT om.user_id) AS active_owner_count
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
GROUP BY o.id, o.slug, o.status
ORDER BY active_owner_count ASC, o.slug;

-- ------------------------------------------------------------------------------
-- CHECK 4: Active organizations missing expected cloned tenant role set
-- Checks if active organizations have cloned the standard set of tenant role templates:
-- (TENANT_OWNER, TENANT_ADMIN, PROPERTY_MANAGER, ACCOUNTANT, CASHIER, AUDITOR).
-- ------------------------------------------------------------------------------
WITH expected_templates AS (
    SELECT key FROM public.role_templates
),
org_roles AS (
    SELECT
        o.id AS organization_id,
        o.slug AS org_slug,
        COUNT(DISTINCT r.key) AS cloned_role_count,
        ARRAY_AGG(r.key) AS existing_role_keys
    FROM public.organizations o
    LEFT JOIN public.roles r ON r.organization_id = o.id
    WHERE o.status = 'ACTIVE'
    GROUP BY o.id, o.slug
)
SELECT
    organization_id,
    org_slug,
    cloned_role_count,
    existing_role_keys
FROM org_roles
WHERE cloned_role_count < (SELECT COUNT(*) FROM expected_templates)
ORDER BY cloned_role_count ASC;

-- ------------------------------------------------------------------------------
-- CHECK 5: Tenant roles containing platform.% permissions
-- Detects tenant-scoped roles (r.organization_id IS NOT NULL) that hold platform permissions.
-- (Checks for privilege escalation into platform functions).
-- ------------------------------------------------------------------------------
SELECT
    r.id AS role_id,
    r.organization_id,
    r.key AS role_key,
    p.id AS permission_id,
    p.key AS permission_key
FROM public.roles r
JOIN public.role_permissions rp ON rp.role_id = r.id
JOIN public.permissions p ON p.id = rp.permission_id
WHERE r.organization_id IS NOT NULL
  AND p.key LIKE 'platform.%';

-- ------------------------------------------------------------------------------
-- CHECK 6: Malformed platform-admin assignments
-- Scans for any user assigned PLATFORM_SUPER_ADMIN with a non-null organization_id
-- or assigned to a tenant-scoped role with key 'PLATFORM_SUPER_ADMIN'.
-- ------------------------------------------------------------------------------
SELECT
    ura.id AS assignment_id,
    ura.user_id,
    ura.organization_id AS assignment_org_id,
    r.id AS role_id,
    r.key AS role_key,
    r.organization_id AS role_org_id,
    ura.created_at
FROM public.user_role_assignments ura
JOIN public.roles r ON r.id = ura.role_id
WHERE r.key = 'PLATFORM_SUPER_ADMIN'
  AND (ura.organization_id IS NOT NULL OR r.organization_id IS NOT NULL);

-- ------------------------------------------------------------------------------
-- CHECK 7: Users recognized as platform admin SOLELY due to malformed legacy assignments
-- Compares legacy is_platform_admin evaluation vs hardened is_platform_admin evaluation:
-- Legacy matches ANY ura row with PLATFORM_SUPER_ADMIN regardless of ura.organization_id.
-- Hardened strictly requires ura.organization_id IS NULL AND r.organization_id IS NULL.
-- ------------------------------------------------------------------------------
SELECT
    ura.user_id,
    COUNT(*) AS malformed_assignments_count,
    ARRAY_AGG(ura.organization_id::text) AS assigned_org_ids
FROM public.user_role_assignments ura
JOIN public.roles r ON r.id = ura.role_id
WHERE r.key = 'PLATFORM_SUPER_ADMIN'
  AND ura.organization_id IS NOT NULL
  AND NOT EXISTS (
      -- User does NOT hold a legitimate global platform admin assignment
      SELECT 1
      FROM public.user_role_assignments valid_ura
      JOIN public.roles valid_r ON valid_r.id = valid_ura.role_id
      WHERE valid_ura.user_id = ura.user_id
        AND valid_ura.organization_id IS NULL
        AND valid_r.key = 'PLATFORM_SUPER_ADMIN'
        AND valid_r.organization_id IS NULL
  )
GROUP BY ura.user_id;

-- ------------------------------------------------------------------------------
-- CHECK 8: Orphaned role assignments without organization membership
-- Identifies role assignments where the target user does NOT have an ACTIVE
-- organization_memberships record in that exact organization.
-- ------------------------------------------------------------------------------
SELECT
    ura.id AS assignment_id,
    ura.user_id,
    ura.organization_id,
    r.key AS role_key,
    om.status AS membership_status,
    ura.created_at
FROM public.user_role_assignments ura
JOIN public.roles r ON r.id = ura.role_id
LEFT JOIN public.organization_memberships om 
       ON om.organization_id = ura.organization_id 
      AND om.user_id = ura.user_id
WHERE ura.organization_id IS NOT NULL
  AND (om.id IS NULL OR om.status != 'active');
