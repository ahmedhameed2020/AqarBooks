-- Phase 2: add an already-created auth user (invited via the Supabase Admin
-- API, which must run in application code, not SQL) to an organization with
-- a role, atomically with the audit trail.

create or replace function public.add_organization_member(
  p_organization_id uuid,
  p_user_id uuid,
  p_role_key text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'tenant.users.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'organization is not active';
  end if;

  select id into v_role_id
  from public.roles
  where organization_id = p_organization_id and key = p_role_key;

  if v_role_id is null then
    raise exception 'unknown role for this organization: %', p_role_key;
  end if;

  insert into public.organization_memberships (organization_id, user_id, status)
  values (p_organization_id, p_user_id, 'invited')
  on conflict (organization_id, user_id) do update set status = 'invited';

  insert into public.user_role_assignments (user_id, role_id, organization_id, created_by)
  values (p_user_id, v_role_id, p_organization_id, auth.uid())
  on conflict (user_id, role_id, organization_id, resort_id) do nothing;

  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, 'organization_member.added', 'user', p_user_id,
    jsonb_build_object('role_key', p_role_key));
end;
$$;
