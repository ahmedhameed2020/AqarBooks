-- Phase 2: transactional lifecycle functions. Each bundles a multi-table
-- write (create org + clone roles + subscribe, or status change + audit)
-- into one atomic call instead of several independent client requests, and
-- performs its own authorization check since SECURITY DEFINER bypasses RLS.

create or replace function public.create_organization(
  p_name text,
  p_slug text,
  p_default_currency text,
  p_plan_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_plan_id uuid;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  insert into public.organizations (name, slug, default_currency, created_by, updated_by)
  values (p_name, p_slug, coalesce(p_default_currency, 'EGP'), auth.uid(), auth.uid())
  returning id into v_org_id;

  perform public.clone_tenant_role_templates(v_org_id);

  if p_plan_key is not null then
    select id into v_plan_id from public.plans where key = p_plan_key;
    if v_plan_id is not null then
      insert into public.subscriptions (organization_id, plan_id, created_by)
      values (v_org_id, v_plan_id, auth.uid());
    end if;
  end if;

  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_org_id, 'organization.created', 'organization', v_org_id,
    jsonb_build_object('name', p_name, 'slug', p_slug, 'plan_key', p_plan_key));

  return v_org_id;
end;
$$;

create or replace function public.set_organization_status(
  p_organization_id uuid,
  p_status text,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  if p_status not in ('TRIAL', 'ACTIVE', 'SUSPENDED', 'ARCHIVED') then
    raise exception 'invalid status: %', p_status;
  end if;

  update public.organizations
  set status = p_status, updated_by = auth.uid()
  where id = p_organization_id;

  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (auth.uid(), p_organization_id, 'organization.status_changed', 'organization', p_organization_id, p_reason,
    jsonb_build_object('new_status', p_status));
end;
$$;

create or replace function public.assign_subscription(
  p_organization_id uuid,
  p_plan_key text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan_id uuid;
  v_subscription_id uuid;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  select id into v_plan_id from public.plans where key = p_plan_key;
  if v_plan_id is null then
    raise exception 'unknown plan: %', p_plan_key;
  end if;

  update public.subscriptions
  set status = 'CANCELED'
  where organization_id = p_organization_id and status = 'ACTIVE';

  insert into public.subscriptions (organization_id, plan_id, created_by)
  values (p_organization_id, v_plan_id, auth.uid())
  returning id into v_subscription_id;

  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, 'subscription.assigned', 'subscription', v_subscription_id,
    jsonb_build_object('plan_key', p_plan_key));

  return v_subscription_id;
end;
$$;

create or replace function public.create_resort(
  p_organization_id uuid,
  p_name text,
  p_code text,
  p_timezone text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_resort_id uuid;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'tenant.settings.manage') then
    raise exception 'not authorized' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'organization is not active';
  end if;

  insert into public.resorts (organization_id, name, code, timezone, created_by, updated_by)
  values (p_organization_id, p_name, p_code, coalesce(p_timezone, 'Africa/Cairo'), auth.uid(), auth.uid())
  returning id into v_resort_id;

  insert into public.platform_audit_logs (actor_id, organization_id, resort_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, v_resort_id, 'resort.created', 'resort', v_resort_id,
    jsonb_build_object('name', p_name, 'code', p_code));

  return v_resort_id;
end;
$$;
