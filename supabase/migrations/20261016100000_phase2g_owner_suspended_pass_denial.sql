-- Phase 2g (G3): a suspended owner's passes no longer admit visitors.
--
-- Before: suspending an owner's portal access (member_portal_access.status = 'suspended') left already-issued passes valid,
-- so the owner's visitors kept entering until the pass expired (up to 30 days). After: an ENTRY scan of a pass whose issuing
-- member is suspended is denied with the new reason OWNER_SUSPENDED, recorded in the ledger like every other denial. Exits are
-- unaffected, passes are not revoked or edited (reactivation restores them), and nothing else about the scan changes.
--
-- 1. allow the new reason code, keeping every code the constraint currently allows;
-- 2. regenerate process_visitor_gate_scan_core from its live definition with one added branch.

DO $$
DECLARE
  v_def   text;
  v_codes text[];
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.access_events'::regclass AND c.conname = 'access_events_reason_code_check';

  IF v_def IS NULL THEN
    RAISE EXCEPTION 'access_events_reason_code_check is missing';
  END IF;

  SELECT coalesce(array_agg(DISTINCT m[1]), ARRAY[]::text[]) INTO v_codes
  FROM regexp_matches(v_def, '''([^'']+)''', 'g') AS m;

  IF NOT ('OWNER_SUSPENDED' = ANY (v_codes)) THEN
    v_codes := array_append(v_codes, 'OWNER_SUSPENDED');
  END IF;

  ALTER TABLE public.access_events DROP CONSTRAINT access_events_reason_code_check;
  EXECUTE format(
    'ALTER TABLE public.access_events ADD CONSTRAINT access_events_reason_code_check CHECK (reason_code IN (%s))',
    (SELECT string_agg(quote_literal(c), ', ' ORDER BY c) FROM unnest(v_codes) AS c)
  );
END
$$;

CREATE OR REPLACE FUNCTION public.process_visitor_gate_scan_core(p_gate_id uuid, p_invitation_id uuid, p_raw_secret text, p_direction text, p_client_scan_id uuid)
 RETURNS TABLE(decision text, reason_code text, event_id uuid, guest_name text, invitation_no text, unit_id uuid, invitation_id uuid, usage_policy text, valid_until timestamp with time zone, is_inside boolean, gate_id uuid, property_id uuid, occurred_at timestamp with time zone)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
declare
  v_user_id uuid := auth.uid();
  v_gate public.gates;
  v_hash text;
  v_invitation public.visitor_invitations;
  v_state public.visitor_access_state;
  v_direction text := upper(nullif(btrim(p_direction), ''));
  v_decision text := 'DENY';
  v_reason text := 'INVALID_PASS';
  v_event_id uuid;
  v_existing public.access_events;
  v_inside_after boolean;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if p_gate_id is null or p_client_scan_id is null or v_direction not in ('ENTRY', 'EXIT') then
    raise exception 'INVALID_GATE_SCAN_INPUT' using errcode = '22023';
  end if;

  select * into v_gate
  from public.gates
  where id = p_gate_id;

  if v_gate.id is null then
    raise exception 'GATE_NOT_FOUND' using errcode = '22023';
  end if;

  if not public.gate_staff_can_scan(v_gate.organization_id) then
    raise exception 'GATE_SCAN_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  select * into v_existing
  from public.access_events
  where organization_id = v_gate.organization_id
    and client_scan_id = p_client_scan_id;

  if v_existing.id is not null then
    return query
      select
        v_existing.decision,
        v_existing.reason_code,
        v_existing.id,
        v_existing.guest_name,
        v_existing.invitation_no,
        v_existing.unit_id,
        v_existing.visitor_invitation_id,
        v_existing.usage_policy,
        vi.valid_until,
        v_existing.is_inside_after,
        v_existing.gate_id,
        v_existing.property_id,
        v_existing.occurred_at
      from public.visitor_invitations vi
      where vi.id = v_existing.visitor_invitation_id
      union all
      select
        v_existing.decision,
        v_existing.reason_code,
        v_existing.id,
        v_existing.guest_name,
        v_existing.invitation_no,
        v_existing.unit_id,
        v_existing.visitor_invitation_id,
        v_existing.usage_policy,
        null::timestamptz,
        v_existing.is_inside_after,
        v_existing.gate_id,
        v_existing.property_id,
        v_existing.occurred_at
      where v_existing.visitor_invitation_id is null
      limit 1;
    return;
  end if;

  if not public.organization_is_active(v_gate.organization_id) then
    v_reason := 'ORGANIZATION_INACTIVE';
  elsif not public.gate_operations_enabled(v_gate.organization_id) then
    v_reason := 'FEATURE_DISABLED';
  elsif not v_gate.is_active then
    v_reason := 'GATE_INACTIVE';
  elsif v_gate.direction_mode <> 'BOTH' and v_gate.direction_mode <> v_direction then
    v_reason := 'DIRECTION_NOT_ALLOWED';
  elsif p_invitation_id is null or nullif(p_raw_secret, '') is null then
    v_reason := 'INVALID_PASS';
  else
    v_hash := encode(digest(p_raw_secret, 'sha256'), 'hex');

    select vi.* into v_invitation
    from public.visitor_invitations vi
    join public.visitor_invitation_secrets vis
      on vis.organization_id = vi.organization_id
     and vis.invitation_id = vi.id
    where vi.id = p_invitation_id
      and vis.token_hash = v_hash
    for update of vi;

    if v_invitation.id is null then
      v_reason := 'INVALID_PASS';
    elsif v_invitation.organization_id <> v_gate.organization_id then
      -- G1: a pass of another organization is indistinguishable from an unknown pass. Drop everything read from it so the
      -- denial row (recorded in the guard's organization) carries no reference to, and no detail of, the foreign pass.
      v_invitation := null;
      v_reason := 'INVALID_PASS';
    elsif v_invitation.property_id <> v_gate.property_id then
      v_reason := 'PROPERTY_MISMATCH';
    elsif v_invitation.status = 'REVOKED' then
      v_reason := 'REVOKED';
    elsif v_direction = 'ENTRY' and exists (
      select 1 from public.member_portal_access mpa
      where mpa.organization_id = v_invitation.organization_id
        and mpa.member_id = v_invitation.invited_by_member_id
        and mpa.status = 'suspended'
    ) then
      -- G3: a pass issued by an owner whose portal access is now suspended does not admit anyone. Exits are not blocked (a
      -- visitor already inside must be able to leave and be recorded). The pass is untouched, so reactivating the owner
      -- restores it with no other action. The visitor state is not modified by this denial.
      v_reason := 'OWNER_SUSPENDED';
      select coalesce(vas.is_inside, false) into v_inside_after
      from public.visitor_access_state vas where vas.visitor_invitation_id = v_invitation.id;
      v_inside_after := coalesce(v_inside_after, false);
    elsif clock_timestamp() < v_invitation.valid_from then
      v_reason := 'NOT_YET_VALID';
    elsif clock_timestamp() >= v_invitation.valid_until then
      v_reason := 'EXPIRED';
    else
      insert into public.visitor_access_state (
        visitor_invitation_id,
        organization_id,
        property_id,
        unit_id
      ) values (
        v_invitation.id,
        v_invitation.organization_id,
        v_invitation.property_id,
        v_invitation.unit_id
      )
      on conflict (visitor_invitation_id) do nothing;

      select * into v_state
      from public.visitor_access_state
      where visitor_invitation_id = v_invitation.id
      for update;

      if v_direction = 'ENTRY' then
        if v_invitation.usage_policy = 'SINGLE_USE' and v_state.entry_count > 0 then
          v_reason := 'PASS_ALREADY_USED';
          v_inside_after := v_state.is_inside;
        elsif v_state.is_inside then
          v_reason := 'ALREADY_INSIDE';
          v_inside_after := true;
        else
          v_decision := 'ALLOW';
          v_reason := 'VALID_ENTRY';
          update public.visitor_access_state
          set is_inside = true,
              entry_count = entry_count + 1,
              last_entry_at = clock_timestamp(),
              last_gate_id = v_gate.id,
              updated_at = clock_timestamp()
          where visitor_invitation_id = v_invitation.id
          returning * into v_state;
          v_inside_after := true;
        end if;
      else
        if not v_state.is_inside then
          v_reason := 'NOT_INSIDE';
          v_inside_after := false;
        else
          v_decision := 'ALLOW';
          v_reason := 'VALID_EXIT';
          update public.visitor_access_state
          set is_inside = false,
              exit_count = exit_count + 1,
              last_exit_at = clock_timestamp(),
              last_gate_id = v_gate.id,
              updated_at = clock_timestamp()
          where visitor_invitation_id = v_invitation.id
          returning * into v_state;
          v_inside_after := false;
        end if;
      end if;
    end if;
  end if;

  if v_invitation.id is null then
    v_inside_after := null;
  elsif v_inside_after is null then
    v_inside_after := coalesce(v_state.is_inside, false);
  end if;

  insert into public.access_events (
    organization_id,
    property_id,
    gate_id,
    visitor_invitation_id,
    unit_id,
    direction,
    decision,
    reason_code,
    client_scan_id,
    operator_user_id,
    usage_policy,
    guest_name,
    invitation_no,
    is_inside_after
  ) values (
    v_gate.organization_id,
    v_gate.property_id,
    v_gate.id,
    v_invitation.id,
    case when v_invitation.property_id = v_gate.property_id then v_invitation.unit_id else null end,
    v_direction,
    v_decision,
    v_reason,
    p_client_scan_id,
    v_user_id,
    v_invitation.usage_policy,
    v_invitation.guest_name,
    v_invitation.invitation_no,
    v_inside_after
  )
  on conflict (organization_id, client_scan_id) do nothing
  returning id into v_event_id;

  if v_event_id is null then
    select * into v_existing
    from public.access_events
    where organization_id = v_gate.organization_id
      and client_scan_id = p_client_scan_id;

    return query
      select
        v_existing.decision,
        v_existing.reason_code,
        v_existing.id,
        v_existing.guest_name,
        v_existing.invitation_no,
        v_existing.unit_id,
        v_existing.visitor_invitation_id,
        v_existing.usage_policy,
        vi.valid_until,
        v_existing.is_inside_after,
        v_existing.gate_id,
        v_existing.property_id,
        v_existing.occurred_at
      from public.visitor_invitations vi
      where vi.id = v_existing.visitor_invitation_id
      union all
      select
        v_existing.decision,
        v_existing.reason_code,
        v_existing.id,
        v_existing.guest_name,
        v_existing.invitation_no,
        v_existing.unit_id,
        v_existing.visitor_invitation_id,
        v_existing.usage_policy,
        null::timestamptz,
        v_existing.is_inside_after,
        v_existing.gate_id,
        v_existing.property_id,
        v_existing.occurred_at
      where v_existing.visitor_invitation_id is null
      limit 1;
    return;
  end if;

  if v_decision = 'ALLOW' then
    insert into public.platform_audit_logs (
      actor_id,
      organization_id,
      property_id,
      action,
      entity_type,
      entity_id,
      safe_change_summary
    ) values (
      v_user_id,
      v_gate.organization_id,
      v_gate.property_id,
      case when v_direction = 'ENTRY' then 'visitor_gate.entry_allowed' else 'visitor_gate.exit_allowed' end,
      'access_event',
      v_event_id,
      jsonb_build_object(
        'gate_id', v_gate.id,
        'direction', v_direction,
        'reason_code', v_reason,
        'visitor_invitation_id', v_invitation.id,
        'unit_id', v_invitation.unit_id
      )
    );
  end if;

  return query
    select
      v_decision,
      v_reason,
      e.id,
      e.guest_name,
      e.invitation_no,
      e.unit_id,
      e.visitor_invitation_id,
      e.usage_policy,
      v_invitation.valid_until,
      e.is_inside_after,
      e.gate_id,
      e.property_id,
      e.occurred_at
    from public.access_events e
    where e.id = v_event_id;
end;
$function$;
