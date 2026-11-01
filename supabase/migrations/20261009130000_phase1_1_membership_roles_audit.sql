-- Phase 1.1: role-management re-authorization in the database, active-membership-only
-- data policies, and the financial audit action allow-list.
-- Forward-only; no earlier migration is edited. See
-- docs/audits/Phase1-Financial-Report-Authz-Report-2026-10-09.md (updated for 1.1).

-- ---------------------------------------------------------------------------
-- 1. replace_role_permissions_atomic: the database now verifies the REQUESTER.
--    Phase 1 restricted EXECUTE to service_role, but the function still trusted whatever the
--    server passed. It now takes the acting user and re-proves, inside the transaction:
--      * the actor is an ACTIVE member of the exact organization,
--      * the actor holds tenant.roles.manage through a tenant-scoped role assignment
--        (org-owned role or global template, never PLATFORM_SUPER_ADMIN; no platform-admin bypass),
--      * the target role belongs to that organization and is not a system role,
--      * only a TENANT_OWNER may touch or empty the TENANT_OWNER role,
--      * the permission ids are tenant-assignable (no platform.*, must appear in a role template),
--      * a non-owner can grant only keys the actor holds (no privilege amplification).
--    The old 3-argument signature is dropped so nothing can bypass the new checks.
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.replace_role_permissions_atomic(uuid, uuid, uuid[]);

CREATE OR REPLACE FUNCTION public.replace_role_permissions_atomic(
  p_organization_id uuid,
  p_role_id uuid,
  p_permission_ids uuid[],
  p_actor_user_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_role public.roles;
  v_requested uuid[];
  v_requested_keys text[];
  v_invalid_count integer;
  v_actor_roles uuid[];
  v_actor_is_owner boolean;
  v_actor_keys text[];
BEGIN
  IF p_actor_user_id IS NULL OR p_organization_id IS NULL OR p_role_id IS NULL THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING errcode = '42501';
  END IF;

  -- Active membership in exactly this organization.
  IF NOT EXISTS (
    SELECT 1 FROM public.organization_memberships om
    WHERE om.organization_id = p_organization_id
      AND om.user_id = p_actor_user_id
      AND om.status = 'active'
  ) THEN
    RAISE EXCEPTION 'UNAUTHORIZED' USING errcode = '42501';
  END IF;

  -- Tenant-scoped roles of the actor (assignment pinned to this organization).
  SELECT array_agg(DISTINCT r.id), coalesce(bool_or(r.key = 'TENANT_OWNER'), false)
    INTO v_actor_roles, v_actor_is_owner
  FROM public.user_role_assignments ura
  JOIN public.roles r ON r.id = ura.role_id
  WHERE ura.user_id = p_actor_user_id
    AND ura.organization_id = p_organization_id
    AND r.key <> 'PLATFORM_SUPER_ADMIN'
    AND (r.organization_id = p_organization_id OR r.organization_id IS NULL);

  SELECT coalesce(array_agg(DISTINCT p.key), ARRAY[]::text[]) INTO v_actor_keys
  FROM public.role_permissions rp
  JOIN public.permissions p ON p.id = rp.permission_id
  WHERE rp.role_id = ANY (coalesce(v_actor_roles, ARRAY[]::uuid[]));

  IF NOT ('tenant.roles.manage' = ANY (v_actor_keys)) THEN
    RAISE EXCEPTION 'FORBIDDEN' USING errcode = '42501';
  END IF;

  SELECT * INTO v_role
  FROM public.roles
  WHERE id = p_role_id
    AND organization_id = p_organization_id
  FOR UPDATE;
  IF v_role.id IS NULL OR v_role.is_system THEN
    RAISE EXCEPTION 'CANNOT_MODIFY_SYSTEM_ROLE' USING errcode = '42501';
  END IF;

  v_requested := ARRAY(SELECT DISTINCT unnest(coalesce(p_permission_ids, ARRAY[]::uuid[])));

  IF v_role.key = 'TENANT_OWNER' THEN
    IF NOT v_actor_is_owner THEN
      RAISE EXCEPTION 'CANNOT_MANAGE_OWNER_ROLE' USING errcode = '42501';
    END IF;
    IF coalesce(array_length(v_requested, 1), 0) = 0 THEN
      RAISE EXCEPTION 'CANNOT_CLEAR_OWNER_PERMISSIONS' USING errcode = '42501';
    END IF;
  END IF;

  SELECT count(*) INTO v_invalid_count
  FROM unnest(v_requested) AS requested(id)
  LEFT JOIN public.permissions p ON p.id = requested.id
  WHERE p.id IS NULL
     OR p.key LIKE 'platform.%'
     OR NOT EXISTS (SELECT 1 FROM public.role_template_permissions rtp WHERE rtp.permission_key = p.key);
  IF v_invalid_count > 0 THEN
    RAISE EXCEPTION 'INVALID_PERMISSION_SCOPE' USING errcode = '42501';
  END IF;

  IF NOT v_actor_is_owner THEN
    SELECT array_agg(p.key) INTO v_requested_keys FROM public.permissions p WHERE p.id = ANY (v_requested);
    IF EXISTS (
      SELECT 1 FROM unnest(coalesce(v_requested_keys, ARRAY[]::text[])) AS k(key)
      WHERE NOT (k.key = ANY (v_actor_keys))
    ) THEN
      RAISE EXCEPTION 'PERMISSION_AMPLIFICATION_DENIED' USING errcode = '42501';
    END IF;
  END IF;

  PERFORM pg_advisory_xact_lock(hashtext('replace_role_permissions_' || p_role_id::text));
  DELETE FROM public.role_permissions WHERE role_id = p_role_id;
  INSERT INTO public.role_permissions(role_id, permission_id)
  SELECT p_role_id, permission_id FROM unnest(v_requested) AS requested(permission_id);
END;
$$;
ALTER FUNCTION public.replace_role_permissions_atomic(uuid, uuid, uuid[], uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.replace_role_permissions_atomic(uuid, uuid, uuid[], uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_role_permissions_atomic(uuid, uuid, uuid[], uuid) TO service_role;

-- ---------------------------------------------------------------------------
-- 2. Membership statuses. is_org_member() treated `invited` as a member (status <> 'suspended'),
--    so every read policy built on it (chart of accounts, journal lines, members, units, ...)
--    was open to users who had only been invited. It now requires an ACTIVE membership (or
--    platform admin), matching has_permission().
--
--    The invitation path is preserved: an invited user must still be able to see their own
--    membership row and the organization shell, otherwise onboarding/dashboard routing
--    (app/[locale]/onboarding, lib/auth/org-context) would lose its anchor. A separate
--    is_org_participant() (active or invited) is used for exactly those three policies.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.is_org_participant(p_user_id uuid, p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select exists (
    select 1
    from public.organization_memberships om
    where om.user_id = p_user_id
      and om.organization_id = p_organization_id
      and om.status in ('active', 'invited')
  ) or public.is_platform_admin(p_user_id);
$$;
ALTER FUNCTION public.is_org_participant(uuid, uuid) OWNER TO postgres;
REVOKE ALL ON FUNCTION public.is_org_participant(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_org_participant(uuid, uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_org_member(p_user_id uuid, p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  select exists (
    select 1
    from public.organization_memberships om
    where om.user_id = p_user_id
      and om.organization_id = p_organization_id
      and om.status = 'active'
  ) or public.is_platform_admin(p_user_id);
$$;

ALTER POLICY organizations_select_member ON public.organizations
  USING (public.is_org_participant(auth.uid(), id));
ALTER POLICY tenant_branding_select_member ON public.tenant_branding
  USING (public.is_org_participant(auth.uid(), organization_id));
ALTER POLICY org_memberships_select_member ON public.organization_memberships
  USING (user_id = auth.uid() OR public.is_org_member(auth.uid(), organization_id));

-- ---------------------------------------------------------------------------
-- 3. check_audit_action. 20261001123000 rebuilt the constraint from an 11-item list that
--    omitted OPENING_BALANCE_RECORDED (added by 20260903172101), so
--    record_member_opening_balance failed with 23514. The allow-list is the union of every
--    action the current writers emit plus the historical baseline values, and still rejects
--    anything else:
--      baseline: PAYMENT_CREATED, PAYMENT_IDEMPOTENT_REPLAY, PAYMENT_ALLOCATION_CREATED,
--                DUE_ISSUED, DUE_BATCH_ISSUED, RECURRING_DUES_GENERATED, RECURRING_DUES_SKIPPED,
--                OPERATION_REJECTED, LEASE_RENT_DUE_GENERATED, LEASE_RENT_DUE_SKIPPED
--      20260903172101: OPENING_BALANCE_RECORDED   (record_member_opening_balance)
--      20261001123000: PAYMENT_REVERSED           (void_payment)
--    issue_dues emits DUE_ISSUED / DUE_BATCH_ISSUED; generate_recurring_dues the RECURRING_*
--    pair; generate_lease_rent_dues the LEASE_RENT_* pair and OPERATION_REJECTED.
-- ---------------------------------------------------------------------------
ALTER TABLE public.financial_audit_logs DROP CONSTRAINT IF EXISTS check_audit_action;
ALTER TABLE public.financial_audit_logs
  ADD CONSTRAINT check_audit_action CHECK (action = ANY (ARRAY[
    'PAYMENT_CREATED', 'PAYMENT_IDEMPOTENT_REPLAY', 'PAYMENT_ALLOCATION_CREATED', 'PAYMENT_REVERSED',
    'DUE_ISSUED', 'DUE_BATCH_ISSUED', 'RECURRING_DUES_GENERATED', 'RECURRING_DUES_SKIPPED',
    'OPERATION_REJECTED', 'LEASE_RENT_DUE_GENERATED', 'LEASE_RENT_DUE_SKIPPED',
    'OPENING_BALANCE_RECORDED'
  ]));
