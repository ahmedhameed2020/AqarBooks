-- ==============================================================================
-- W0-SEC FORENSIC AUDIT: PRODUCTION READ-ONLY INSPECTION SCRIPT
-- ==============================================================================
-- PURPOSE:
--   Inspect current production state for authorization anomalies, role misconfigurations,
--   privilege escalations, and template dependencies across platform and tenant boundaries.
--
-- STRICT OPERATIONAL RULES:
--   - READ-ONLY: Contains ONLY SELECT queries. No INSERT, UPDATE, DELETE, ALTER, or DROP.
--   - Run against production or replica via psql or Supabase SQL Editor.
-- ==============================================================================

-- 1. Scan for any user assigned PLATFORM_SUPER_ADMIN with a non-null organization_id
-- (Checks for SEC-01 vulnerability exploitation where org-scoped assignment grants platform admin)
SELECT
    ura.id AS assignment_id,
    ura.user_id,
    ura.organization_id,
    r.id AS role_id,
    r.key AS role_key,
    r.organization_id AS role_org_id,
    ura.created_at
FROM public.user_role_assignments ura
JOIN public.roles r ON r.id = ura.role_id
WHERE r.key = 'PLATFORM_SUPER_ADMIN'
  AND ura.organization_id IS NOT NULL;

-- 2. Scan for any roles created with key = 'PLATFORM_SUPER_ADMIN' having non-null organization_id
-- (Checks for tenant-created fake super admin roles)
SELECT
    r.id AS role_id,
    r.organization_id,
    r.key,
    r.name_en,
    r.is_system,
    r.created_at
FROM public.roles r
WHERE r.key = 'PLATFORM_SUPER_ADMIN'
  AND r.organization_id IS NOT NULL;

-- 3. Scan for tenant roles (organization_id IS NOT NULL) that hold platform-scoped permissions (key LIKE 'platform.%')
-- (Checks for tenant privilege escalation into platform functions)
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

-- 4. Count organization memberships by status across all organizations
-- (Reveals unconfirmed, suspended, or anomalous invitation states)
SELECT
    om.status,
    COUNT(*) AS total_count
FROM public.organization_memberships om
GROUP BY om.status
ORDER BY total_count DESC;

-- 5. Identify organizations with ZERO active TENANT_OWNER memberships
-- (Identifies orphaned tenants or locked out organizations)
SELECT
    o.id AS organization_id,
    o.name AS organization_name,
    o.status AS org_status
FROM public.organizations o
WHERE NOT EXISTS (
    SELECT 1
    FROM public.organization_memberships om
    JOIN public.user_role_assignments ura 
      ON ura.user_id = om.user_id 
     AND ura.organization_id = om.organization_id
    JOIN public.roles r 
      ON r.id = ura.role_id 
     AND (r.organization_id = o.id OR (r.organization_id IS NULL AND r.key = 'TENANT_OWNER'))
    WHERE om.organization_id = o.id
      AND om.status = 'active'
      AND r.key = 'TENANT_OWNER'
);

-- 6. Check for active user_role_assignments referencing system template roles directly (r.organization_id IS NULL)
-- (Crucial for determining whether UI role dropdown scoping can be enabled immediately or requires migration)
SELECT
    r.key AS system_role_key,
    r.name_en AS system_role_name,
    COUNT(*) AS assignment_count
FROM public.user_role_assignments ura
JOIN public.roles r ON r.id = ura.role_id
WHERE r.organization_id IS NULL
GROUP BY r.key, r.name_en
ORDER BY assignment_count DESC;

-- 7. Audit log coverage check: count user and role administrative events in platform_audit_logs over last 90 days
-- (Measures OBS-02 severity and historical audit logging gaps)
SELECT
    action,
    entity_type,
    COUNT(*) AS event_count,
    MIN(created_at) AS earliest_event,
    MAX(created_at) AS latest_event
FROM public.platform_audit_logs
WHERE created_at >= NOW() - INTERVAL '90 days'
  AND (
      entity_type IN ('user', 'organization_membership', 'user_role_assignment', 'role', 'role_permission')
      OR action LIKE 'user.%'
      OR action LIKE 'role.%'
      OR action LIKE 'member.%'
  )
GROUP BY action, entity_type
ORDER BY event_count DESC;

-- 8. Identify users holding active memberships across multiple organizations with differing role keys
-- (Checks multi-tenant user profile configurations and cross-tenant footprints)
SELECT
    om.user_id,
    COUNT(DISTINCT om.organization_id) AS distinct_org_count,
    ARRAY_AGG(DISTINCT om.organization_id::text) AS organization_ids,
    ARRAY_AGG(DISTINCT r.key) AS role_keys
FROM public.organization_memberships om
LEFT JOIN public.user_role_assignments ura 
       ON ura.user_id = om.user_id 
      AND ura.organization_id = om.organization_id
LEFT JOIN public.roles r 
       ON r.id = ura.role_id
WHERE om.status = 'active'
GROUP BY om.user_id
HAVING COUNT(DISTINCT om.organization_id) > 1;
