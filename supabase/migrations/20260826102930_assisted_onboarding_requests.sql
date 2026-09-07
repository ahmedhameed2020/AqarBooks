
-- Release B: assisted onboarding request queue + canonical approval-gated provisioner.
--
-- WHY THIS EXISTS
-- Release A closed unrestricted self-service provisioning: create_organization_onboarding's
-- authenticated EXECUTE grant was revoked (20260825231151_demo_readonly_hardening_and_cashier_read.sql),
-- with that migration's own comment predicting exactly this follow-up. This migration adds the
-- replacement commercial path: a public visitor submits a company-activation request, it sits
-- PENDING_APPROVAL, and only a platform Super Admin's approval provisions the real tenant -- via
-- one canonical, idempotent, SECURITY DEFINER function that reuses the same
-- clone_tenant_role_templates() + TENANT_OWNER assignment idiom create_organization_onboarding
-- already used, but takes the owner as an explicit parameter instead of deriving it from
-- auth.uid() (the caller here is the approving admin, not the future tenant owner -- see
-- tests/onboarding.integration.test.ts's documented finding that the original function cannot be
-- reused unmodified for this).
--
-- NO PAYMENT PROVIDER: nothing here integrates Stripe/Kashier/Paymob/Fawry, and nothing about the
-- request/provisioning shape assumes one. A future payment-confirmation webhook becomes a second
-- authorized producer of the same "approve this request" event without any redesign here -- it
-- would call the same approve_onboarding_request() this migration adds.

create table if not exists public.onboarding_requests (
  id uuid primary key default gen_random_uuid(),
  status text not null default 'PENDING_APPROVAL'
    check (status in ('DRAFT','PENDING_APPROVAL','APPROVED','REJECTED','PROVISIONING','ACTIVE','FAILED')),

  requester_user_id uuid not null references auth.users(id),
  full_name text not null,
  work_email text not null,
  phone text,

  organization_name text not null,
  entity_type text not null
    check (entity_type in ('DEVELOPER','FACILITY_MANAGEMENT','OWNERS_ASSOCIATION','INDIVIDUAL_OWNER','TOURIST_RESORT','TOURIST_VILLAGE','RESIDENTIAL_COMPOUND','OTHER')),
  entity_type_custom_label text,
  country text,
  city text,
  expected_properties_count integer,
  expected_units_count integer,
  notes text,

  -- Same three canonical keys the `plans` table enforces (plans_key_check) --
  -- checked independently here (not FK'd to plans.key, which carries no
  -- unique constraint) so a request can be validated before any plan lookup.
  requested_plan_key text not null check (requested_plan_key in ('STARTER','PROFESSIONAL','ENTERPRISE')),

  organization_id uuid references public.organizations(id),
  failure_reason text,

  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id),
  review_notes text,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists onboarding_requests_status_idx on public.onboarding_requests (status, submitted_at desc);
create index if not exists onboarding_requests_requester_idx on public.onboarding_requests (requester_user_id);

create trigger trg_onboarding_requests_updated_at
  before update on public.onboarding_requests
  for each row execute function public.set_updated_at();

alter table public.onboarding_requests enable row level security;

-- Same shape as demo_leads / contact_requests: no anon/authenticated INSERT
-- policy at all (the public submission action writes via the service-role
-- admin client, matching lib/actions/leads.ts), platform admins can read
-- every request directly through RLS the same way /platform/leads already
-- does, and there is deliberately no direct UPDATE policy for anyone --
-- every status transition goes through approve_onboarding_request() /
-- reject_onboarding_request() below so it is always locked and audited.
create policy onboarding_requests_select_platform_admin
  on public.onboarding_requests for select
  using (public.is_platform_admin(auth.uid()));

-- Append-only per-request timeline, shown in the admin detail view. Separate
-- from platform_audit_logs (which requires a real actor and reads oddly for
-- "the public visitor who submitted this" or a system-initiated step) but
-- approve/reject still also write into platform_audit_logs, matching every
-- other platform-admin-triggered mutation in this schema.
create table if not exists public.onboarding_request_events (
  id bigint generated always as identity primary key,
  request_id uuid not null references public.onboarding_requests(id),
  event_type text not null
    check (event_type in ('SUBMITTED','APPROVED','REJECTED','PROVISIONING_STARTED','PROVISIONED','PROVISIONING_FAILED')),
  actor_id uuid,
  notes text,
  metadata jsonb,
  created_at timestamptz not null default now()
);

create index if not exists onboarding_request_events_request_idx on public.onboarding_request_events (request_id, created_at);

alter table public.onboarding_request_events enable row level security;

create policy onboarding_request_events_select_platform_admin
  on public.onboarding_request_events for select
  using (public.is_platform_admin(auth.uid()));

-- No INSERT/UPDATE/DELETE policy on either table for anon/authenticated:
-- every write happens inside a SECURITY DEFINER function body (which runs
-- with the function owner's privileges regardless of caller, exactly like
-- create_organization/assign_subscription/set_organization_status already
-- do), or via the service-role client for the public submission insert.

-- ---------------------------------------------------------------------
-- approve_onboarding_request -- the ONE canonical provisioner.
--
-- Idempotent: a second call after a successful first call (double-click,
-- retry) returns the same organization_id without provisioning anything a
-- second time. A call while status is anything other than PENDING_APPROVAL
-- or the already-ACTIVE terminal state raises, rather than silently
-- re-running. On any failure inside the provisioning steps, the request is
-- left in FAILED with failure_reason set (via a savepoint, so the failure
-- is actually persisted rather than rolled back along with the attempt) --
-- callers must re-check the row, not assume a thrown exception always means
-- nothing happened.
-- ---------------------------------------------------------------------
create or replace function public.approve_onboarding_request(
  p_request_id uuid,
  p_review_notes text default null
) returns uuid
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_request record;
  v_org_id uuid;
  v_plan_id uuid;
  v_owner_role_id uuid;
  v_base_slug text;
  v_slug text;
  v_counter integer := 1;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  -- Serializes concurrent approve/reject calls for the same request -- the
  -- same advisory-lock idiom create_organization_onboarding and
  -- check_and_record_rate_limit already use in this schema.
  perform pg_advisory_xact_lock(hashtext('onboarding_request_' || p_request_id::text));

  select * into v_request from public.onboarding_requests where id = p_request_id;
  if v_request.id is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_request.status = 'ACTIVE' and v_request.organization_id is not null then
    return v_request.organization_id;
  end if;

  if v_request.status <> 'PENDING_APPROVAL' then
    raise exception 'request % is in status % and cannot be approved', p_request_id, v_request.status
      using errcode = '55000';
  end if;

  update public.onboarding_requests
  set status = 'PROVISIONING', reviewed_at = now(), reviewed_by = auth.uid(), review_notes = p_review_notes
  where id = p_request_id;

  insert into public.onboarding_request_events (request_id, event_type, actor_id, notes)
  values (p_request_id, 'APPROVED', auth.uid(), p_review_notes);
  insert into public.onboarding_request_events (request_id, event_type, actor_id)
  values (p_request_id, 'PROVISIONING_STARTED', auth.uid());

  begin
    v_base_slug := trim(both '-' from lower(regexp_replace(v_request.organization_name, '[^a-zA-Z0-9]+', '-', 'g')));
    if v_base_slug is null or char_length(v_base_slug) < 2 then
      v_base_slug := 'entity-' || lower(substr(md5(random()::text), 1, 8));
    end if;

    v_slug := v_base_slug;
    while exists (select 1 from public.organizations where slug = v_slug) loop
      v_counter := v_counter + 1;
      v_slug := v_base_slug || '-' || v_counter::text;
    end loop;

    insert into public.organizations (
      name, slug, default_currency, entity_type, entity_type_custom_label, status, created_by, updated_by
    ) values (
      v_request.organization_name, v_slug, 'EGP', v_request.entity_type, v_request.entity_type_custom_label,
      'ACTIVE', auth.uid(), auth.uid()
    ) returning id into v_org_id;

    perform public.clone_tenant_role_templates(v_org_id);

    select id into v_plan_id from public.plans where key = v_request.requested_plan_key;
    if v_plan_id is not null then
      insert into public.subscriptions (organization_id, plan_id, created_by)
      values (v_org_id, v_plan_id, auth.uid());
    end if;

    insert into public.organization_memberships (organization_id, user_id, status)
    values (v_org_id, v_request.requester_user_id, 'active');

    select id into v_owner_role_id
    from public.roles
    where key = 'TENANT_OWNER' and organization_id = v_org_id
    limit 1;

    if v_owner_role_id is null then
      raise exception 'role clone failed for organization %', v_org_id using errcode = '50000';
    end if;

    insert into public.user_role_assignments (user_id, role_id, organization_id, property_id, created_by)
    values (v_request.requester_user_id, v_owner_role_id, v_org_id, null, auth.uid());

    update public.onboarding_requests
    set status = 'ACTIVE', organization_id = v_org_id
    where id = p_request_id;

    insert into public.onboarding_request_events (request_id, event_type, actor_id, metadata)
    values (p_request_id, 'PROVISIONED', auth.uid(), jsonb_build_object('organization_id', v_org_id, 'slug', v_slug));

    insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
    values (auth.uid(), v_org_id, 'onboarding_request.approved', 'onboarding_request', p_request_id,
      jsonb_build_object('organization_id', v_org_id, 'plan_key', v_request.requested_plan_key));
  exception when others then
    -- The nested BEGIN above is an implicit savepoint: this rolls back only
    -- the provisioning attempt (org row, cloned roles, membership, etc.),
    -- not the PROVISIONING-status update made before entering it. Returning
    -- (rather than re-raising) lets the FAILED write below actually commit --
    -- an uncaught exception here would abort the whole outer transaction and
    -- silently erase this failure's own trail.
    update public.onboarding_requests
    set status = 'FAILED', failure_reason = sqlerrm
    where id = p_request_id;

    insert into public.onboarding_request_events (request_id, event_type, actor_id, notes)
    values (p_request_id, 'PROVISIONING_FAILED', auth.uid(), sqlerrm);

    return null;
  end;

  return v_org_id;
end;
$$;

revoke all on function public.approve_onboarding_request(uuid, text) from public, anon;
grant execute on function public.approve_onboarding_request(uuid, text) to authenticated;

-- ---------------------------------------------------------------------
-- reject_onboarding_request -- provisions nothing, records reviewer + reason.
-- ---------------------------------------------------------------------
create or replace function public.reject_onboarding_request(
  p_request_id uuid,
  p_review_notes text
) returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_status text;
begin
  if not public.is_platform_admin(auth.uid()) then
    raise exception 'not authorized' using errcode = '42501';
  end if;

  perform pg_advisory_xact_lock(hashtext('onboarding_request_' || p_request_id::text));

  select status into v_status from public.onboarding_requests where id = p_request_id;
  if v_status is null then
    raise exception 'request not found' using errcode = 'P0002';
  end if;

  if v_status <> 'PENDING_APPROVAL' then
    raise exception 'request % is in status % and cannot be rejected', p_request_id, v_status
      using errcode = '55000';
  end if;

  update public.onboarding_requests
  set status = 'REJECTED', reviewed_at = now(), reviewed_by = auth.uid(), review_notes = p_review_notes
  where id = p_request_id;

  insert into public.onboarding_request_events (request_id, event_type, actor_id, notes)
  values (p_request_id, 'REJECTED', auth.uid(), p_review_notes);

  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, reason, safe_change_summary)
  values (auth.uid(), null, 'onboarding_request.rejected', 'onboarding_request', p_request_id, p_review_notes, '{}'::jsonb);
end;
$$;

revoke all on function public.reject_onboarding_request(uuid, text) from public, anon;
grant execute on function public.reject_onboarding_request(uuid, text) to authenticated;
