-- Prepared locally; NOT executed. SELECT-only incident audit.
-- DBA must use an already-provisioned, genuinely read-only role.
-- Do not use postgres/service_role, Auth Admin, or Dashboard SQL editor.
-- No SELECT *, RPCs, secrets, token values, user metadata, or audit payloads.
-- If missing relations/permissions, stop: do not grant privileges in this file.
-- Stage A: match known synthetic names AND generated slug format.
SELECT id, name, slug, status, to_jsonb(o)->>'created_at' AS created_at,
       count(*) OVER () AS candidate_count
FROM public.organizations o
WHERE (name = 'Resolve Credentials Test Org' AND slug ~ '^rcred-[0-9]{13}-[0-9]{1,6}$')
   OR (name = 'Resolve Credentials Test Org (no settings)' AND slug ~ '^rcred-empty-[0-9]{13}-[0-9]{1,6}$')
ORDER BY slug LIMIT 20;
-- More than one suffix: STOP and reconcile execution time before Stage B.
-- A suffix is evidence of Date.now() at test execution, not a DB creation time.

-- Stage B: replace REPLACE_CONFIRMED_RUN_SUFFIX in EVERY block below.
-- Cross-check the exact organization/user UUIDs returned before further work.
-- Synthetic account metadata only
WITH incident_orgs AS (
 SELECT id FROM public.organizations
 WHERE (name='Resolve Credentials Test Org' AND slug='rcred-REPLACE_CONFIRMED_RUN_SUFFIX')
    OR (name='Resolve Credentials Test Org (no settings)' AND slug='rcred-empty-REPLACE_CONFIRMED_RUN_SUFFIX')
), incident_user AS (
 SELECT id FROM auth.users WHERE email='rcred-staff-REPLACE_CONFIRMED_RUN_SUFFIX@resortos-test.local'
)
SELECT u.id, u.created_at, u.updated_at, u.last_sign_in_at,
 (to_jsonb(u)->>'email_confirmed_at') IS NOT NULL AS email_confirmed,
 to_jsonb(u)->>'banned_until' AS banned_until,
 to_jsonb(u)->>'deleted_at' AS deleted_at
FROM auth.users u JOIN incident_user x ON x.id=u.id;

-- Property exact marker and incident organization
WITH incident_orgs AS (
 SELECT id FROM public.organizations
 WHERE (name='Resolve Credentials Test Org' AND slug='rcred-REPLACE_CONFIRMED_RUN_SUFFIX')
    OR (name='Resolve Credentials Test Org (no settings)' AND slug='rcred-empty-REPLACE_CONFIRMED_RUN_SUFFIX')
), incident_user AS (
 SELECT id FROM auth.users WHERE email='rcred-staff-REPLACE_CONFIRMED_RUN_SUFFIX@resortos-test.local'
)
SELECT p.id,p.organization_id,p.code,to_jsonb(p)->>'created_at' AS created_at
FROM public.properties p JOIN incident_orgs o ON o.id=p.organization_id
WHERE p.name='RCred Resort' AND p.code='RCRED-REPLACE_CONFIRMED_RUN_SUFFIX';

-- Cloned roles and grant counts
WITH incident_orgs AS (
 SELECT id FROM public.organizations
 WHERE (name='Resolve Credentials Test Org' AND slug='rcred-REPLACE_CONFIRMED_RUN_SUFFIX')
    OR (name='Resolve Credentials Test Org (no settings)' AND slug='rcred-empty-REPLACE_CONFIRMED_RUN_SUFFIX')
), incident_user AS (
 SELECT id FROM auth.users WHERE email='rcred-staff-REPLACE_CONFIRMED_RUN_SUFFIX@resortos-test.local'
)
SELECT r.id,r.organization_id,r.key,to_jsonb(r)->>'created_at' AS created_at,
 (SELECT count(*) FROM public.role_permissions rp WHERE rp.role_id=r.id) AS permission_count
FROM public.roles r JOIN incident_orgs o ON o.id=r.organization_id;

-- Assignment scope; outside-scope IDs suppressed
WITH incident_orgs AS (
 SELECT id FROM public.organizations
 WHERE (name='Resolve Credentials Test Org' AND slug='rcred-REPLACE_CONFIRMED_RUN_SUFFIX')
    OR (name='Resolve Credentials Test Org (no settings)' AND slug='rcred-empty-REPLACE_CONFIRMED_RUN_SUFFIX')
), incident_user AS (
 SELECT id FROM auth.users WHERE email='rcred-staff-REPLACE_CONFIRMED_RUN_SUFFIX@resortos-test.local'
)
SELECT a.user_id,
 CASE WHEN a.organization_id IN (SELECT id FROM incident_orgs) THEN a.organization_id END AS incident_organization_id,
 CASE WHEN a.organization_id IN (SELECT id FROM incident_orgs) THEN a.role_id END AS incident_role_id,
 a.organization_id IN (SELECT id FROM incident_orgs) AS inside_incident_scope,
 to_jsonb(a)->>'created_at' AS created_at
FROM public.user_role_assignments a JOIN incident_user u ON u.id=a.user_id;

-- Effective assigned permission keys within incident only
WITH incident_orgs AS (
 SELECT id FROM public.organizations
 WHERE (name='Resolve Credentials Test Org' AND slug='rcred-REPLACE_CONFIRMED_RUN_SUFFIX')
    OR (name='Resolve Credentials Test Org (no settings)' AND slug='rcred-empty-REPLACE_CONFIRMED_RUN_SUFFIX')
), incident_user AS (
 SELECT id FROM auth.users WHERE email='rcred-staff-REPLACE_CONFIRMED_RUN_SUFFIX@resortos-test.local'
)
SELECT r.key AS role_key,p.key AS permission_key
FROM public.user_role_assignments a JOIN incident_user u ON u.id=a.user_id
JOIN public.roles r ON r.id=a.role_id JOIN public.role_permissions rp ON rp.role_id=r.id
JOIN public.permissions p ON p.id=rp.permission_id
WHERE a.organization_id IN (SELECT id FROM incident_orgs);

-- Membership count and scoped status; potential trigger effects
WITH incident_orgs AS (
 SELECT id FROM public.organizations
 WHERE (name='Resolve Credentials Test Org' AND slug='rcred-REPLACE_CONFIRMED_RUN_SUFFIX')
    OR (name='Resolve Credentials Test Org (no settings)' AND slug='rcred-empty-REPLACE_CONFIRMED_RUN_SUFFIX')
), incident_user AS (
 SELECT id FROM auth.users WHERE email='rcred-staff-REPLACE_CONFIRMED_RUN_SUFFIX@resortos-test.local'
)
SELECT m.user_id,
 m.organization_id IN (SELECT id FROM incident_orgs) AS inside_incident_scope,
 m.status, to_jsonb(m)->>'created_at' AS created_at
FROM public.organization_memberships m JOIN incident_user u ON u.id=m.user_id;

-- Sessions: no session IDs, tokens, IPs or user agents
WITH incident_orgs AS (
 SELECT id FROM public.organizations
 WHERE (name='Resolve Credentials Test Org' AND slug='rcred-REPLACE_CONFIRMED_RUN_SUFFIX')
    OR (name='Resolve Credentials Test Org (no settings)' AND slug='rcred-empty-REPLACE_CONFIRMED_RUN_SUFFIX')
), incident_user AS (
 SELECT id FROM auth.users WHERE email='rcred-staff-REPLACE_CONFIRMED_RUN_SUFFIX@resortos-test.local'
)
SELECT count(*) AS session_rows,min(s.created_at) AS first_created_at,max(s.created_at) AS last_created_at,
 max(to_jsonb(s)->>'not_after') AS latest_not_after
FROM auth.sessions s JOIN incident_user u ON u.id=s.user_id;

-- Refresh tokens: counts only; no token values
WITH incident_orgs AS (
 SELECT id FROM public.organizations
 WHERE (name='Resolve Credentials Test Org' AND slug='rcred-REPLACE_CONFIRMED_RUN_SUFFIX')
    OR (name='Resolve Credentials Test Org (no settings)' AND slug='rcred-empty-REPLACE_CONFIRMED_RUN_SUFFIX')
), incident_user AS (
 SELECT id FROM auth.users WHERE email='rcred-staff-REPLACE_CONFIRMED_RUN_SUFFIX@resortos-test.local'
)
SELECT count(*) AS token_rows,
 count(*) FILTER (WHERE to_jsonb(t)->>'revoked'='true') AS revoked_rows,
 count(*) FILTER (WHERE to_jsonb(t)->>'revoked'='false') AS not_marked_revoked_rows,
 min(to_jsonb(t)->>'created_at') AS first_created_at,
 max(to_jsonb(t)->>'updated_at') AS last_updated_at
FROM auth.refresh_tokens t JOIN incident_user u ON u.id::text=t.user_id::text;

-- Auth identities and MFA enrollment: counts only
WITH incident_orgs AS (
 SELECT id FROM public.organizations
 WHERE (name='Resolve Credentials Test Org' AND slug='rcred-REPLACE_CONFIRMED_RUN_SUFFIX')
    OR (name='Resolve Credentials Test Org (no settings)' AND slug='rcred-empty-REPLACE_CONFIRMED_RUN_SUFFIX')
), incident_user AS (
 SELECT id FROM auth.users WHERE email='rcred-staff-REPLACE_CONFIRMED_RUN_SUFFIX@resortos-test.local'
)
SELECT (SELECT count(*) FROM auth.identities i JOIN incident_user u ON u.id=i.user_id) AS identity_rows,
 (SELECT count(*) FROM auth.mfa_factors f JOIN incident_user u ON u.id=f.user_id) AS mfa_factor_rows;

-- Provider settings metadata only; do not select credentials
WITH incident_orgs AS (
 SELECT id FROM public.organizations
 WHERE (name='Resolve Credentials Test Org' AND slug='rcred-REPLACE_CONFIRMED_RUN_SUFFIX')
    OR (name='Resolve Credentials Test Org (no settings)' AND slug='rcred-empty-REPLACE_CONFIRMED_RUN_SUFFIX')
), incident_user AS (
 SELECT id FROM auth.users WHERE email='rcred-staff-REPLACE_CONFIRMED_RUN_SUFFIX@resortos-test.local'
)
SELECT s.id,s.organization_id,to_jsonb(s)->>'provider' AS provider,
 to_jsonb(s)->>'environment' AS environment,to_jsonb(s)->>'enabled' AS enabled,
 to_jsonb(s)->>'created_at' AS created_at
FROM public.payment_provider_settings s JOIN incident_orgs o ON o.id=s.organization_id;

-- Online transaction counts only; no financial contents
WITH incident_orgs AS (
 SELECT id FROM public.organizations
 WHERE (name='Resolve Credentials Test Org' AND slug='rcred-REPLACE_CONFIRMED_RUN_SUFFIX')
    OR (name='Resolve Credentials Test Org (no settings)' AND slug='rcred-empty-REPLACE_CONFIRMED_RUN_SUFFIX')
), incident_user AS (
 SELECT id FROM auth.users WHERE email='rcred-staff-REPLACE_CONFIRMED_RUN_SUFFIX@resortos-test.local'
)
SELECT t.organization_id,count(*) AS transaction_rows
FROM public.online_payment_transactions t JOIN incident_orgs o ON o.id=t.organization_id
GROUP BY t.organization_id;

-- Platform audit metadata only; no safe_change_summary/payload
WITH incident_orgs AS (
 SELECT id FROM public.organizations
 WHERE (name='Resolve Credentials Test Org' AND slug='rcred-REPLACE_CONFIRMED_RUN_SUFFIX')
    OR (name='Resolve Credentials Test Org (no settings)' AND slug='rcred-empty-REPLACE_CONFIRMED_RUN_SUFFIX')
), incident_user AS (
 SELECT id FROM auth.users WHERE email='rcred-staff-REPLACE_CONFIRMED_RUN_SUFFIX@resortos-test.local'
)
SELECT l.action,l.entity_type,count(*) AS event_count,
 min(to_jsonb(l)->>'created_at') AS first_created_at,
 max(to_jsonb(l)->>'created_at') AS last_created_at
FROM public.platform_audit_logs l
WHERE l.organization_id IN (SELECT id FROM incident_orgs)
   OR l.actor_id IN (SELECT id FROM incident_user)
GROUP BY l.action,l.entity_type LIMIT 100;

-- FK metadata inventory; returns schema metadata only, NOT rows.
-- DBA must review each dependency before preparing any further targeted SELECT.
SELECT ns.nspname AS child_schema,c.relname AS child_table,con.conname,
 pg_get_constraintdef(con.oid) AS definition
FROM pg_constraint con JOIN pg_class c ON c.oid=con.conrelid
JOIN pg_namespace ns ON ns.oid=c.relnamespace
WHERE con.contype='f' AND con.confrelid IN
 ('public.organizations'::regclass,'public.properties'::regclass,
  'public.roles'::regclass,'auth.users'::regclass)
ORDER BY child_schema,child_table,con.conname;
