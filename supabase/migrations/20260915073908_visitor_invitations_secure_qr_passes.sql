-- PR4: Visitor Invitations + Secure QR Passes.
--
-- Scope guard:
-- - No gates, scanner UI, check-in/check-out, access events, vehicles, or gate hardware coupling.
-- - No maintenance/work-order/accounting changes.
-- - QR payloads are bearer credentials; store only the invitation id and a SHA-256 secret hash.

create table if not exists public.visitor_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  property_id uuid not null,
  unit_id uuid not null,
  invited_by_member_id uuid not null,
  invitation_no text not null,
  guest_name text not null,
  guest_phone text,
  guest_note text,
  valid_from timestamptz not null,
  valid_until timestamptz not null,
  usage_policy text not null default 'SINGLE_USE',
  status text not null default 'ACTIVE',
  token_hint text,
  revoked_at timestamptz,
  revoked_by uuid references auth.users(id),
  created_by uuid not null references auth.users(id),
  updated_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint visitor_invitations_guest_name_not_blank check (btrim(guest_name) <> ''),
  constraint visitor_invitations_guest_name_length check (char_length(guest_name) <= 120),
  constraint visitor_invitations_guest_phone_length check (guest_phone is null or char_length(guest_phone) <= 40),
  constraint visitor_invitations_guest_note_length check (guest_note is null or char_length(guest_note) <= 500),
  constraint visitor_invitations_usage_policy_check check (usage_policy in ('SINGLE_USE', 'MULTI_USE')),
  constraint visitor_invitations_status_check check (status in ('ACTIVE', 'REVOKED')),
  constraint visitor_invitations_window_check check (valid_from < valid_until),
  constraint visitor_invitations_max_window_check check (valid_until <= valid_from + interval '30 days'),
  constraint visitor_invitations_revocation_fields check (
    (status <> 'REVOKED' and revoked_at is null and revoked_by is null)
    or (status = 'REVOKED' and revoked_at is not null and revoked_by is not null)
  )
);

create unique index if not exists visitor_invitations_org_invitation_no_key
  on public.visitor_invitations (organization_id, invitation_no);

create unique index if not exists visitor_invitations_org_id_key
  on public.visitor_invitations (organization_id, id);

create index if not exists idx_visitor_invitations_org_status_valid_until
  on public.visitor_invitations (organization_id, status, valid_until desc);

create index if not exists idx_visitor_invitations_org_property_valid_until
  on public.visitor_invitations (organization_id, property_id, valid_until desc);

create index if not exists idx_visitor_invitations_member_created
  on public.visitor_invitations (invited_by_member_id, created_at desc);

create index if not exists idx_visitor_invitations_unit_valid_until
  on public.visitor_invitations (organization_id, unit_id, valid_until desc);

create table if not exists public.visitor_invitation_secrets (
  invitation_id uuid primary key,
  organization_id uuid not null,
  token_hash text not null,
  created_at timestamptz not null default now(),
  constraint visitor_invitation_secrets_hash_shape check (token_hash ~ '^[a-f0-9]{64}$'),
  constraint visitor_invitation_secrets_org_invitation_fkey
    foreign key (organization_id, invitation_id)
    references public.visitor_invitations (organization_id, id)
    on delete cascade
);

create unique index if not exists visitor_invitation_secrets_token_hash_key
  on public.visitor_invitation_secrets (token_hash);

create index if not exists idx_visitor_invitation_secrets_org
  on public.visitor_invitation_secrets (organization_id);

alter table public.visitor_invitations
  add constraint visitor_invitations_org_property_fkey
  foreign key (organization_id, property_id)
  references public.properties (organization_id, id)
  on delete cascade;

alter table public.visitor_invitations
  add constraint visitor_invitations_org_property_unit_fkey
  foreign key (organization_id, property_id, unit_id)
  references public.units (organization_id, property_id, id)
  on delete cascade;

alter table public.visitor_invitations
  add constraint visitor_invitations_org_member_fkey
  foreign key (organization_id, invited_by_member_id)
  references public.members (organization_id, id)
  on delete cascade;

create trigger trg_visitor_invitations_updated_at
  before update on public.visitor_invitations
  for each row execute function public.set_updated_at();

create or replace function public.visitor_management_enabled(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(public.get_entitlement(p_organization_id, 'visitor_management'), 'false'::jsonb) = 'true'::jsonb
    or exists (
      select 1
      from public.tenant_feature_flags tff
      where tff.organization_id = p_organization_id
        and tff.flag_key = 'visitor_management'
        and tff.enabled = true
    );
$$;

create or replace function public.visitor_invitation_staff_can_read(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), p_organization_id, 'operations.visitors.view')
      or public.has_permission(auth.uid(), p_organization_id, 'operations.visitors.manage');
$$;

create or replace function public.visitor_invitation_staff_can_manage(p_organization_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select public.has_permission(auth.uid(), p_organization_id, 'operations.visitors.manage');
$$;

create or replace function public.visitor_invitation_member_can_read(p_invitation public.visitor_invitations)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select p_invitation.invited_by_member_id = public.current_member_id()
    and public.is_current_member_unit_owner(
      public.current_member_id(),
      p_invitation.organization_id,
      p_invitation.unit_id
    );
$$;

create or replace function public.create_visitor_invitation(
  p_unit_id uuid,
  p_token_hash text,
  p_token_hint text,
  p_guest_name text,
  p_guest_phone text,
  p_guest_note text,
  p_valid_from timestamptz,
  p_valid_until timestamptz,
  p_usage_policy text default 'SINGLE_USE'
) returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_member_id uuid := public.current_member_id();
  v_unit public.units;
  v_invitation_id uuid;
  v_invitation_no text;
  v_usage_policy text := coalesce(nullif(btrim(p_usage_policy), ''), 'SINGLE_USE');
  v_guest_name text := nullif(btrim(p_guest_name), '');
  v_guest_phone text := nullif(btrim(p_guest_phone), '');
  v_guest_note text := nullif(btrim(p_guest_note), '');
  v_token_hint text := nullif(btrim(p_token_hint), '');
begin
  if v_user_id is null or v_member_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  if p_token_hash is null or p_token_hash !~ '^[a-f0-9]{64}$' then
    raise exception 'INVALID_VISITOR_TOKEN_HASH' using errcode = '22023';
  end if;

  if v_token_hint is not null and char_length(v_token_hint) > 16 then
    raise exception 'INVALID_VISITOR_TOKEN_HINT' using errcode = '22023';
  end if;

  if v_guest_name is null or char_length(v_guest_name) > 120 then
    raise exception 'INVALID_VISITOR_GUEST_NAME' using errcode = '22023';
  end if;

  if v_guest_phone is not null and char_length(v_guest_phone) > 40 then
    raise exception 'INVALID_VISITOR_GUEST_PHONE' using errcode = '22023';
  end if;

  if v_guest_note is not null and char_length(v_guest_note) > 500 then
    raise exception 'INVALID_VISITOR_GUEST_NOTE' using errcode = '22023';
  end if;

  if v_usage_policy not in ('SINGLE_USE', 'MULTI_USE') then
    raise exception 'INVALID_VISITOR_USAGE_POLICY' using errcode = '22023';
  end if;

  if p_valid_from is null or p_valid_until is null or p_valid_from >= p_valid_until then
    raise exception 'INVALID_VISITOR_VALIDITY_WINDOW' using errcode = '22023';
  end if;

  if p_valid_until <= now() then
    raise exception 'VISITOR_PASS_ALREADY_EXPIRED' using errcode = '22023';
  end if;

  if p_valid_until > p_valid_from + interval '30 days' then
    raise exception 'VISITOR_PASS_WINDOW_TOO_LONG' using errcode = '22023';
  end if;

  select * into v_unit
  from public.units
  where id = p_unit_id
    and is_active = true
    and archived_at is null;

  if v_unit.id is null then
    raise exception 'UNIT_NOT_FOUND' using errcode = '22023';
  end if;

  if not public.organization_is_active(v_unit.organization_id) then
    raise exception 'ORGANIZATION_INACTIVE' using errcode = '42501';
  end if;

  if not public.visitor_management_enabled(v_unit.organization_id) then
    raise exception 'VISITOR_MANAGEMENT_NOT_ENTITLED' using errcode = '42501';
  end if;

  if not public.is_current_member_unit_owner(v_member_id, v_unit.organization_id, v_unit.id) then
    raise exception 'UNIT_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  insert into public.visitor_invitations (
    organization_id,
    property_id,
    unit_id,
    invited_by_member_id,
    invitation_no,
    guest_name,
    guest_phone,
    guest_note,
    valid_from,
    valid_until,
    usage_policy,
    status,
    token_hint,
    created_by,
    updated_by
  ) values (
    v_unit.organization_id,
    v_unit.property_id,
    v_unit.id,
    v_member_id,
    'PENDING',
    v_guest_name,
    v_guest_phone,
    v_guest_note,
    p_valid_from,
    p_valid_until,
    v_usage_policy,
    'ACTIVE',
    v_token_hint,
    v_user_id,
    v_user_id
  )
  returning id into v_invitation_id;

  v_invitation_no := 'VP-' || upper(left(replace(v_invitation_id::text, '-', ''), 10));

  update public.visitor_invitations
  set invitation_no = v_invitation_no
  where id = v_invitation_id;

  insert into public.visitor_invitation_secrets (
    invitation_id,
    organization_id,
    token_hash
  ) values (
    v_invitation_id,
    v_unit.organization_id,
    p_token_hash
  );

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
    v_unit.organization_id,
    v_unit.property_id,
    'visitor_invitation.created',
    'visitor_invitation',
    v_invitation_id,
    jsonb_build_object(
      'invitation_no', v_invitation_no,
      'unit_id', v_unit.id,
      'valid_from', p_valid_from,
      'valid_until', p_valid_until,
      'usage_policy', v_usage_policy
    )
  );

  return v_invitation_id;
end;
$$;

create or replace function public.revoke_visitor_invitation(
  p_invitation_id uuid
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_member_id uuid := public.current_member_id();
  v_invitation public.visitor_invitations;
begin
  if v_user_id is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = '42501';
  end if;

  select * into v_invitation
  from public.visitor_invitations
  where id = p_invitation_id
  for update;

  if v_invitation.id is null then
    raise exception 'VISITOR_INVITATION_NOT_FOUND' using errcode = '22023';
  end if;

  if not public.organization_is_active(v_invitation.organization_id) then
    raise exception 'ORGANIZATION_INACTIVE' using errcode = '42501';
  end if;

  if not public.visitor_management_enabled(v_invitation.organization_id) then
    raise exception 'VISITOR_MANAGEMENT_NOT_ENTITLED' using errcode = '42501';
  end if;

  if not (
    public.visitor_invitation_staff_can_manage(v_invitation.organization_id)
    or (
      v_member_id is not null
      and v_invitation.invited_by_member_id = v_member_id
      and public.is_current_member_unit_owner(v_member_id, v_invitation.organization_id, v_invitation.unit_id)
    )
  ) then
    raise exception 'VISITOR_INVITATION_NOT_AUTHORIZED' using errcode = '42501';
  end if;

  if v_invitation.status = 'REVOKED' then
    return;
  end if;

  update public.visitor_invitations
  set status = 'REVOKED',
      revoked_at = now(),
      revoked_by = v_user_id,
      updated_by = v_user_id
  where id = v_invitation.id;

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
    v_invitation.organization_id,
    v_invitation.property_id,
    'visitor_invitation.revoked',
    'visitor_invitation',
    v_invitation.id,
    jsonb_build_object('invitation_no', v_invitation.invitation_no)
  );
end;
$$;

create or replace function public.validate_visitor_pass_token(
  p_invitation_id uuid,
  p_raw_secret text
) returns table (
  valid boolean,
  reason_code text,
  invitation_id uuid,
  organization_id uuid,
  property_id uuid,
  unit_id uuid,
  usage_policy text,
  valid_from timestamptz,
  valid_until timestamptz,
  guest_name text
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_user_id uuid := auth.uid();
  v_member_id uuid := public.current_member_id();
  v_hash text;
  v_invitation public.visitor_invitations;
begin
  if v_user_id is null or p_invitation_id is null or nullif(p_raw_secret, '') is null then
    return query select false, 'NOT_FOUND_OR_INVALID', null::uuid, null::uuid, null::uuid, null::uuid, null::text, null::timestamptz, null::timestamptz, null::text;
    return;
  end if;

  v_hash := encode(digest(p_raw_secret, 'sha256'), 'hex');

  select vi.* into v_invitation
  from public.visitor_invitations vi
  join public.visitor_invitation_secrets vis
    on vis.invitation_id = vi.id
   and vis.organization_id = vi.organization_id
  where vi.id = p_invitation_id
    and vis.token_hash = v_hash;

  if v_invitation.id is null then
    return query select false, 'NOT_FOUND_OR_INVALID', null::uuid, null::uuid, null::uuid, null::uuid, null::text, null::timestamptz, null::timestamptz, null::text;
    return;
  end if;

  if not (
    public.visitor_invitation_staff_can_read(v_invitation.organization_id)
    or (
      v_member_id is not null
      and v_invitation.invited_by_member_id = v_member_id
      and public.is_current_member_unit_owner(v_member_id, v_invitation.organization_id, v_invitation.unit_id)
    )
  ) then
    return query select false, 'NOT_FOUND_OR_INVALID', null::uuid, null::uuid, null::uuid, null::uuid, null::text, null::timestamptz, null::timestamptz, null::text;
    return;
  end if;

  if not public.organization_is_active(v_invitation.organization_id) then
    return query select false, 'ORGANIZATION_INACTIVE', v_invitation.id, v_invitation.organization_id, v_invitation.property_id, v_invitation.unit_id, v_invitation.usage_policy, v_invitation.valid_from, v_invitation.valid_until, null::text;
    return;
  end if;

  if not public.visitor_management_enabled(v_invitation.organization_id) then
    return query select false, 'FEATURE_DISABLED', v_invitation.id, v_invitation.organization_id, v_invitation.property_id, v_invitation.unit_id, v_invitation.usage_policy, v_invitation.valid_from, v_invitation.valid_until, null::text;
    return;
  end if;

  if v_invitation.status = 'REVOKED' then
    return query select false, 'REVOKED', v_invitation.id, v_invitation.organization_id, v_invitation.property_id, v_invitation.unit_id, v_invitation.usage_policy, v_invitation.valid_from, v_invitation.valid_until, v_invitation.guest_name;
    return;
  end if;

  if now() < v_invitation.valid_from then
    return query select false, 'NOT_YET_VALID', v_invitation.id, v_invitation.organization_id, v_invitation.property_id, v_invitation.unit_id, v_invitation.usage_policy, v_invitation.valid_from, v_invitation.valid_until, v_invitation.guest_name;
    return;
  end if;

  if now() >= v_invitation.valid_until then
    return query select false, 'EXPIRED', v_invitation.id, v_invitation.organization_id, v_invitation.property_id, v_invitation.unit_id, v_invitation.usage_policy, v_invitation.valid_from, v_invitation.valid_until, v_invitation.guest_name;
    return;
  end if;

  return query select true, 'VALID', v_invitation.id, v_invitation.organization_id, v_invitation.property_id, v_invitation.unit_id, v_invitation.usage_policy, v_invitation.valid_from, v_invitation.valid_until, v_invitation.guest_name;
end;
$$;

alter table public.visitor_invitations enable row level security;
alter table public.visitor_invitation_secrets enable row level security;

create policy visitor_invitations_select_staff_or_inviting_member
  on public.visitor_invitations
  for select
  to authenticated
  using (
    public.organization_is_active(organization_id)
    and public.visitor_management_enabled(organization_id)
    and (
      public.visitor_invitation_staff_can_read(organization_id)
      or public.visitor_invitation_member_can_read(visitor_invitations)
    )
  );

insert into public.permissions (id, key, description)
values
  ('4d4f262d-940b-47d7-b8b5-e3eb80f79d37', 'operations.visitors.view', 'View organization-scoped visitor invitations'),
  ('5a5ff52a-7718-4f57-8b77-98335be4d6a6', 'operations.visitors.manage', 'Revoke and manage organization-scoped visitor invitations')
on conflict (key) do nothing;

insert into public.role_template_permissions (role_template_key, permission_key)
values
  ('TENANT_OWNER', 'operations.visitors.view'),
  ('TENANT_OWNER', 'operations.visitors.manage'),
  ('TENANT_ADMIN', 'operations.visitors.view'),
  ('TENANT_ADMIN', 'operations.visitors.manage'),
  ('GENERAL_MANAGER', 'operations.visitors.view'),
  ('GENERAL_MANAGER', 'operations.visitors.manage'),
  ('PROPERTY_MANAGER', 'operations.visitors.view'),
  ('PROPERTY_MANAGER', 'operations.visitors.manage'),
  ('VIEWER', 'operations.visitors.view')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key in ('operations.visitors.view', 'operations.visitors.manage')
where r.key in ('TENANT_OWNER', 'TENANT_ADMIN', 'GENERAL_MANAGER', 'PROPERTY_MANAGER')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.permissions p on p.key = 'operations.visitors.view'
where r.key = 'VIEWER'
on conflict do nothing;

insert into public.plan_entitlements (id, plan_id, key, value)
select gen_random_uuid(), p.id, 'visitor_management',
  case when p.key in ('PROFESSIONAL', 'ENTERPRISE') then 'true'::jsonb else 'false'::jsonb end
from public.plans p
on conflict (plan_id, key) do nothing;

revoke all privileges on table public.visitor_invitations from public, anon, authenticated;
revoke all privileges on table public.visitor_invitation_secrets from public, anon, authenticated;
grant select on table public.visitor_invitations to authenticated;
grant all privileges on table public.visitor_invitations to service_role;
grant all privileges on table public.visitor_invitation_secrets to service_role;

revoke all on function public.visitor_management_enabled(uuid) from public, anon, authenticated, service_role;
revoke all on function public.visitor_invitation_staff_can_read(uuid) from public, anon, authenticated, service_role;
revoke all on function public.visitor_invitation_staff_can_manage(uuid) from public, anon, authenticated, service_role;
revoke all on function public.visitor_invitation_member_can_read(public.visitor_invitations) from public, anon, authenticated, service_role;
revoke all on function public.create_visitor_invitation(uuid, text, text, text, text, text, timestamptz, timestamptz, text) from public, anon, authenticated, service_role;
revoke all on function public.revoke_visitor_invitation(uuid) from public, anon, authenticated, service_role;
revoke all on function public.validate_visitor_pass_token(uuid, text) from public, anon, authenticated, service_role;

grant execute on function public.visitor_management_enabled(uuid) to authenticated, service_role;
grant execute on function public.visitor_invitation_staff_can_read(uuid) to authenticated, service_role;
grant execute on function public.visitor_invitation_staff_can_manage(uuid) to authenticated, service_role;
grant execute on function public.visitor_invitation_member_can_read(public.visitor_invitations) to authenticated, service_role;
grant execute on function public.create_visitor_invitation(uuid, text, text, text, text, text, timestamptz, timestamptz, text) to authenticated;
grant execute on function public.revoke_visitor_invitation(uuid) to authenticated;
grant execute on function public.validate_visitor_pass_token(uuid, text) to authenticated;
