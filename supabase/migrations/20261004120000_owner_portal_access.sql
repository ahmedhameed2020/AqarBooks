-- Owner portal access: provisioning, first activation, suspension.
--
-- WHAT THIS ADDS
-- Staff can give an owner (members row) portal access from the web in one of
-- two ways, and later suspend, reactivate or sign that access out:
--   * email  -- an activation link (one-time, expiring, member- and
--               organization-bound, revocable). The owner opens it, chooses a
--               password, and an Auth identity is created and linked.
--   * client_id -- for owners with no usable email: a client number (MB-10482)
--               plus a temporary password. The password lives only in Supabase
--               Auth; nothing here can recover it. The first sign-in is forced
--               through a password change.
--
-- WHY THE STATE LIVES IN ITS OWN TABLES
-- members.user_id says "this identity is this owner" and nothing else. It can
-- not say pending, suspended, temporary or when. member_invitations (the older
-- passwordless flow) is untouched and keeps working for links already issued;
-- an owner linked through it shows up here as `active` without a row.
--
-- SECURITY MODEL (read before editing)
--  * The two new tables have RLS on and NO policies: no client can read or
--    write them. Staff reach them only through the SECURITY DEFINER functions
--    below, each of which checks has_permission(auth.uid(), <member's org>, ..)
--    itself. A member of organization A therefore cannot act on organization B.
--  * Raw activation tokens are never stored -- only their sha256. A token is
--    returned exactly once, to the SERVER, by a service-role-only function, and
--    it is delivered to the owner by email only. No staff-callable function
--    ever returns a token, and staff never see one: a link that staff could
--    hold would let them complete an activation, and therefore claim the
--    owner's email address, on the owner's behalf.
--  * An email address becomes a verified Auth identity only when a token that
--    was DELIVERED to that very address (delivery_status = 'sent', recorded by
--    the server, and bound to the email it was sent to) is presented. If the
--    email cannot be sent, the email path stays pending_email_verification;
--    nothing here can mark an address verified administratively.
--  * An email that already has a verified Auth identity is never duplicated:
--    the activation links the existing identity, and only after that identity
--    proves itself by signing in.
--  * Sessions are ended through the Auth Admin API (see lib/portal-access),
--    never by writing to managed auth tables from SQL.
--  * Temporary passwords never reach this database. finish_member_temp_access
--    stores only a sha256 *fingerprint* of the Auth password hash, so that
--    complete_portal_first_login can prove the password really changed.
--  * current_member_id() -- the single choke point every portal policy and
--    owner RPC resolves through -- now returns NULL while a member is suspended
--    or has a pending forced password change. That makes both states
--    authoritative in the database, not merely in the app.
--  * Functions that must act with service-role authority (activation
--    completion, Auth lookups) are granted to service_role only.
--
-- NOT APPLIED ANYWHERE BY THIS FILE'S AUTHOR. Verified by replaying the whole
-- migration history on a throwaway local PostgreSQL (scripts/local-db). It must
-- still be applied to the hosted project deliberately, followed by the Supabase
-- security advisor.

begin;

-- 1. Permission ---------------------------------------------------------------
-- members.portal.invite already gates issuing access. Suspending, reactivating
-- and signing people out is a different, more consequential power, so it gets
-- its own key. Every role that can invite today receives it, so nobody loses
-- anything and nobody gains anything they could not already do.
insert into public.permissions (key, description)
values ('members.portal.manage', 'Suspend, reactivate and sign out an owner''s portal access')
on conflict (key) do nothing;

insert into public.role_template_permissions (role_template_key, permission_key)
select distinct role_template_key, 'members.portal.manage'
from public.role_template_permissions
where permission_key = 'members.portal.invite'
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select rp.role_id, manage.id
from public.role_permissions rp
join public.permissions invite on invite.id = rp.permission_id and invite.key = 'members.portal.invite'
cross join (select id from public.permissions where key = 'members.portal.manage') manage
on conflict do nothing;

-- 2. Tables -------------------------------------------------------------------
create sequence if not exists public.member_client_id_seq start with 10001 minvalue 10001;

create table public.member_portal_access (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null unique references public.members (id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'active', 'suspended')),
  login_method text not null check (login_method in ('email', 'client_id')),
  client_id text unique check (client_id ~ '^MB-[0-9]{5,}$'),
  -- The Auth identity this access resolves to, and who owns its password:
  -- 'provisioned' = created here for the owner alone; 'linked_existing' = a
  -- pre-existing identity (typically staff) that now also acts as the owner.
  auth_user_id uuid,
  auth_origin text check (auth_origin in ('provisioned', 'linked_existing')),
  must_change_password boolean not null default false,
  temp_password_expires_at timestamptz,
  temp_pw_fingerprint text,
  confirmed_phone text,
  phone_confirmed_at timestamptz,
  activated_at timestamptz,
  suspended_at timestamptz,
  suspended_by uuid,
  suspend_reason text,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint member_portal_access_client_id_required
    check (login_method <> 'client_id' or client_id is not null)
);

create index member_portal_access_org_idx on public.member_portal_access (organization_id);
create index member_portal_access_auth_user_idx on public.member_portal_access (auth_user_id);

create table public.member_activation_tokens (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  member_id uuid not null references public.members (id) on delete cascade,
  token_hash text not null unique,
  -- The address the token was minted for. Completion requires it to still be
  -- the member's email AND the email of the identity being activated, so a
  -- token can never be redirected to a different address or a different member.
  email text not null,
  expires_at timestamptz not null,
  used_at timestamptz,
  revoked_at timestamptz,
  delivery_status text not null default 'not_sent' check (delivery_status in ('not_sent', 'sent', 'failed')),
  delivery_detail text,
  delivered_at timestamptz,
  created_by uuid,
  created_at timestamptz not null default now()
);

create index member_activation_tokens_member_idx on public.member_activation_tokens (member_id, created_at desc);

alter table public.member_portal_access enable row level security;
alter table public.member_activation_tokens enable row level security;
revoke all on table public.member_portal_access from public, anon, authenticated;
revoke all on table public.member_activation_tokens from public, anon, authenticated;
grant select, insert, update, delete on table public.member_portal_access to service_role;
grant select, insert, update, delete on table public.member_activation_tokens to service_role;
revoke all on sequence public.member_client_id_seq from public, anon, authenticated;

-- 3. Internal helpers (not callable by any client role) -------------------------
create or replace function public._member_portal_log(
  p_organization_id uuid,
  p_member_id uuid,
  p_action text,
  p_summary jsonb default '{}'::jsonb,
  p_actor uuid default null
) returns void
language sql
security definer
set search_path to 'public'
as $$
  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (coalesce(p_actor, auth.uid()), p_organization_id, p_action, 'member', p_member_id, coalesce(p_summary, '{}'::jsonb));
$$;
revoke all on function public._member_portal_log(uuid, uuid, text, jsonb, uuid) from public, anon, authenticated;

create or replace function public._member_active_unit_count(p_member_id uuid)
returns integer
language sql
stable
security definer
set search_path to 'public'
as $$
  select count(*)::integer
  from public.unit_ownerships
  where member_id = p_member_id
    and start_date <= current_date
    and (end_date is null or end_date >= current_date);
$$;
revoke all on function public._member_active_unit_count(uuid) from public, anon, authenticated;

create or replace function public._is_plausible_email(p_email text)
returns boolean
language sql
immutable
as $$
  select p_email is not null and btrim(p_email) ~* '^[^@[:space:]]+@[^@[:space:]]+\.[^@[:space:]]+$'
$$;
revoke all on function public._is_plausible_email(text) from public, anon, authenticated;

-- Loads the member and enforces the caller's permission in the MEMBER'S OWN
-- organization. "Not found" and "not permitted" are deliberately the same
-- error, so the function cannot be used to probe ids belonging to other tenants.
create or replace function public._member_portal_authorize(p_member_id uuid, p_permission text)
returns public.members
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_member public.members;
begin
  select * into v_member from public.members where id = p_member_id;
  if v_member.id is null
     or not public.has_permission(auth.uid(), v_member.organization_id, p_permission) then
    raise exception 'FORBIDDEN_PORTAL_ACCESS: لا تملك صلاحية إدارة وصول هذا المالك' using errcode = '42501';
  end if;
  return v_member;
end;
$$;
revoke all on function public._member_portal_authorize(uuid, text) from public, anon, authenticated;

-- 4. current_member_id(): suspension and forced password change are enforced here
-- Body is the original (`select id from members where user_id = auth.uid()`)
-- plus two exclusions. Signature, language, volatility, security and
-- search_path are unchanged, so every dependent policy keeps working.
create or replace function public.current_member_id()
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select m.id
  from public.members m
  where m.user_id = auth.uid()
    and not exists (
      select 1
      from public.member_portal_access a
      where a.member_id = m.id
        and (a.status = 'suspended' or a.must_change_password)
    );
$$;

-- 5. Staff: read the state ------------------------------------------------------
create or replace function public.get_member_portal_access(p_member_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_member public.members;
  v_access public.member_portal_access;
  v_token public.member_activation_tokens;
  v_status text;
  v_uid uuid;
  v_last_sign_in timestamptz;
  v_units integer;
  v_shared boolean := false;
begin
  v_member := public._member_portal_authorize(p_member_id, 'members.portal.invite');
  -- Anyone who may invite may also see the state; reading it is not a power of
  -- its own.

  select * into v_access from public.member_portal_access where member_id = p_member_id;
  -- Only a link that was really emailed counts: a token that was minted but
  -- never delivered is unusable and must not be shown as an outstanding link.
  select * into v_token
  from public.member_activation_tokens
  where member_id = p_member_id and used_at is null and revoked_at is null and delivery_status = 'sent'
  order by created_at desc
  limit 1;

  v_status := case
    when v_access.id is not null then v_access.status
    when v_member.user_id is not null then 'active'
    else 'not_activated'
  end;

  v_uid := coalesce(v_access.auth_user_id, v_member.user_id);
  if v_uid is not null then
    select last_sign_in_at into v_last_sign_in from auth.users where id = v_uid;
    v_shared := coalesce(v_access.auth_origin = 'linked_existing', false)
      or exists (
        select 1 from public.organization_memberships om
        where om.user_id = v_uid and om.status = 'active'
      );
  end if;

  v_units := public._member_active_unit_count(p_member_id);

  return jsonb_build_object(
    'status', v_status,
    'login_method', case
      when v_access.id is not null then v_access.login_method
      when v_member.user_id is not null then 'email'
      else null end,
    'client_id', v_access.client_id,
    'activated_at', v_access.activated_at,
    'last_sign_in_at', v_last_sign_in,
    'units_count', v_units,
    'eligible', v_units > 0,
    'has_email', public._is_plausible_email(v_member.email),
    'member_email', nullif(btrim(coalesce(v_member.email, '')), ''),
    'member_phone', nullif(btrim(coalesce(v_member.phone, '')), ''),
    'must_change_password', coalesce(v_access.must_change_password, false),
    'temp_password_expires_at', v_access.temp_password_expires_at,
    'temp_expired', coalesce(v_access.must_change_password
      and v_access.temp_password_expires_at is not null
      and v_access.temp_password_expires_at < now(), false),
    'suspended_at', v_access.suspended_at,
    'pending_activation_expires_at', case when v_token.expires_at > now() then v_token.expires_at else null end,
    'activation_link_expired', v_token.id is not null and v_token.expires_at <= now(),
    'last_delivery_status', v_token.delivery_status,
    -- The email path is not complete until the owner proves the address: a
    -- pending email activation is, by definition, pending_email_verification.
    'email_verification', case
      when v_status = 'active' and coalesce(v_access.login_method, 'email') = 'email' then 'verified'
      when v_status = 'pending' and coalesce(v_access.login_method, 'email') = 'email' then 'pending_email_verification'
      else null end,
    'shared_identity', v_shared,
    'legacy_linked', v_access.id is null and v_member.user_id is not null,
    'can_manage', public.has_permission(auth.uid(), v_member.organization_id, 'members.portal.manage')
  );
end;
$$;

-- 6. Staff: email activation ----------------------------------------------------
-- Three steps, on purpose, and the token only ever exists on the server:
--   request_member_activation  (staff, permission-checked)  -> may we, and for whom?
--   mint_member_activation_token (service role only)        -> the token, to the server
--   mark_member_activation_delivery (service role only)     -> was it really emailed?
-- The server mails the link and returns nothing but the outcome to staff.
create or replace function public.request_member_activation(p_member_id uuid)
returns table(member_email text, member_name text, organization_id uuid)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_member public.members;
  v_access public.member_portal_access;
begin
  v_member := public._member_portal_authorize(p_member_id, 'members.portal.invite');

  if not public.organization_is_active(v_member.organization_id) then
    raise exception 'ORGANIZATION_INACTIVE: المنظمة غير نشطة' using errcode = '22023';
  end if;
  if not public._is_plausible_email(v_member.email) then
    raise exception 'MEMBER_EMAIL_REQUIRED: يجب تسجيل بريد إلكتروني صالح للمالك أولًا' using errcode = '22023';
  end if;
  if public._member_active_unit_count(p_member_id) = 0 then
    raise exception 'NO_ACTIVE_OWNERSHIP: لا توجد وحدة مملوكة حاليًا لهذا العضو' using errcode = '22023';
  end if;

  select * into v_access from public.member_portal_access where member_id = p_member_id for update;
  if v_access.id is not null then
    if v_access.status = 'suspended' then
      raise exception 'PORTAL_SUSPENDED: الوصول موقوف — أعد التفعيل أولًا' using errcode = '22023';
    end if;
    if v_access.login_method = 'client_id' then
      raise exception 'CLIENT_ID_ACCOUNT: هذا الحساب يعمل برقم العميل — أصدر بيانات دخول مؤقتة جديدة بدل رابط التفعيل' using errcode = '22023';
    end if;
    if v_access.status = 'active' then
      raise exception 'ALREADY_ACTIVE: المالك مُفعّل بالفعل' using errcode = '22023';
    end if;
  elsif v_member.user_id is not null then
    raise exception 'ALREADY_ACTIVE: المالك مُفعّل بالفعل' using errcode = '22023';
  end if;

  -- Whatever happens next, an earlier link must stop working now.
  update public.member_activation_tokens
  set revoked_at = now()
  where member_id = p_member_id and used_at is null and revoked_at is null;

  insert into public.member_portal_access (organization_id, member_id, status, login_method, created_by)
  values (v_member.organization_id, p_member_id, 'pending', 'email', auth.uid())
  on conflict (member_id) do update set status = 'pending', updated_at = now();

  return query select btrim(v_member.email), v_member.full_name, v_member.organization_id;
end;
$$;

create or replace function public.mint_member_activation_token(p_member_id uuid, p_actor uuid, p_valid_hours integer default 72)
returns table(token_id uuid, raw_token text, expires_at timestamptz, member_email text, member_name text, organization_id uuid)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_member public.members;
  v_access public.member_portal_access;
  v_raw text;
  v_token_id uuid;
  v_expires timestamptz;
  v_hours integer := least(greatest(coalesce(p_valid_hours, 72), 1), 168);
begin
  select * into v_member from public.members where id = p_member_id;
  select * into v_access from public.member_portal_access where member_id = p_member_id for update;
  -- Everything request_member_activation checked is re-checked here: the
  -- address may have been edited, or access suspended, in between.
  if v_member.id is null
     or v_access.id is null
     or v_access.status <> 'pending'
     or v_access.login_method <> 'email'
     or v_member.user_id is not null
     or not public._is_plausible_email(v_member.email)
     or not public.organization_is_active(v_member.organization_id)
     or public._member_active_unit_count(p_member_id) = 0 then
    raise exception 'ACTIVATION_NOT_ALLOWED' using errcode = '22023';
  end if;

  update public.member_activation_tokens
  set revoked_at = now()
  where member_id = p_member_id and used_at is null and revoked_at is null;

  v_raw := translate(encode(gen_random_bytes(32), 'base64'), '+/=' || chr(10), '-_');
  v_expires := now() + make_interval(hours => v_hours);

  insert into public.member_activation_tokens (organization_id, member_id, token_hash, email, expires_at, created_by)
  values (v_member.organization_id, p_member_id, encode(digest(v_raw, 'sha256'), 'hex'),
          lower(btrim(v_member.email)), v_expires, p_actor)
  returning id into v_token_id;

  perform public._member_portal_log(v_member.organization_id, p_member_id, 'member_portal.activation_created',
    jsonb_build_object('token_id', v_token_id, 'method', 'email', 'valid_hours', v_hours), p_actor);

  return query select v_token_id, v_raw, v_expires, btrim(v_member.email), v_member.full_name, v_member.organization_id;
end;
$$;

-- Only 'sent' makes a token usable. A token whose email was not accepted by the
-- trusted channel is revoked on the spot: it must not exist as a live credential
-- that someone could be handed some other way.
create or replace function public.mark_member_activation_delivery(p_token_id uuid, p_status text, p_detail text default null)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_token public.member_activation_tokens;
begin
  if p_status not in ('sent', 'failed', 'not_sent') then
    raise exception 'INVALID_DELIVERY_STATUS' using errcode = '22023';
  end if;
  select * into v_token from public.member_activation_tokens where id = p_token_id for update;
  if v_token.id is null then
    raise exception 'TOKEN_NOT_FOUND' using errcode = '22023';
  end if;

  update public.member_activation_tokens
  set delivery_status = p_status,
      delivery_detail = left(p_detail, 200),
      delivered_at = case when p_status = 'sent' then now() else delivered_at end,
      revoked_at = case when p_status = 'sent' then revoked_at else coalesce(revoked_at, now()) end
  where id = p_token_id;

  if p_status = 'sent' then
    perform public._member_portal_log(v_token.organization_id, v_token.member_id, 'member_portal.invitation_sent',
      jsonb_build_object('token_id', p_token_id, 'channel', 'email'), v_token.created_by);
  elsif p_status = 'failed' then
    perform public._member_portal_log(v_token.organization_id, v_token.member_id, 'member_portal.invitation_failed',
      jsonb_build_object('token_id', p_token_id, 'channel', 'email'), v_token.created_by);
  end if;
end;
$$;

create or replace function public.revoke_member_activation(p_member_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_member public.members;
  v_count integer;
begin
  v_member := public._member_portal_authorize(p_member_id, 'members.portal.invite');
  update public.member_activation_tokens
  set revoked_at = now()
  where member_id = p_member_id and used_at is null and revoked_at is null;
  get diagnostics v_count = row_count;
  if v_count > 0 then
    perform public._member_portal_log(v_member.organization_id, p_member_id, 'member_portal.activation_revoked',
      jsonb_build_object('tokens', v_count));
  end if;
  return v_count;
end;
$$;

-- 7. Staff: client number + temporary password ----------------------------------
-- Two steps because the password is set in Supabase Auth, which only the
-- server (service role) can do. begin_ authorizes and reserves the client
-- number; the server then creates or updates the Auth user; finish_ commits.
-- If the server fails in between nothing changes for an existing owner: a
-- regeneration does not touch must_change_password until finish_.
create or replace function public.begin_member_temp_access(p_member_id uuid)
returns table(client_id text, alias_email text, auth_user_id uuid, organization_id uuid, member_name text, is_regeneration boolean)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_member public.members;
  v_access public.member_portal_access;
  v_client_id text;
begin
  v_member := public._member_portal_authorize(p_member_id, 'members.portal.invite');

  if not public.organization_is_active(v_member.organization_id) then
    raise exception 'ORGANIZATION_INACTIVE: المنظمة غير نشطة' using errcode = '22023';
  end if;
  if public._member_active_unit_count(p_member_id) = 0 then
    raise exception 'NO_ACTIVE_OWNERSHIP: لا توجد وحدة مملوكة حاليًا لهذا العضو' using errcode = '22023';
  end if;

  select * into v_access from public.member_portal_access where member_id = p_member_id for update;

  if v_access.id is null then
    if v_member.user_id is not null then
      raise exception 'ALREADY_ACTIVE: المالك مرتبط بحساب بالفعل' using errcode = '22023';
    end if;
    v_client_id := 'MB-' || nextval('public.member_client_id_seq');
    insert into public.member_portal_access (organization_id, member_id, status, login_method, client_id, created_by)
    values (v_member.organization_id, p_member_id, 'pending', 'client_id', v_client_id, auth.uid())
    returning * into v_access;
  else
    if v_access.status = 'suspended' then
      raise exception 'PORTAL_SUSPENDED: الوصول موقوف — أعد التفعيل أولًا' using errcode = '22023';
    end if;
    if v_access.login_method <> 'client_id' then
      -- The fallback for an email activation that never completed (typically
      -- because the email could not be sent): nobody has signed in yet, so the
      -- pending email path can be replaced by a client number. An email account
      -- that is already active is not converted.
      if v_access.status <> 'pending' or v_member.user_id is not null then
        raise exception 'EMAIL_ACCOUNT: هذا الحساب يعمل بالبريد الإلكتروني — لا تُصدر بيانات مؤقتة له' using errcode = '22023';
      end if;
      v_client_id := 'MB-' || nextval('public.member_client_id_seq');
      update public.member_portal_access
      set login_method = 'client_id', client_id = v_client_id, auth_user_id = null, auth_origin = null, updated_at = now()
      where id = v_access.id
      returning * into v_access;
    else
      v_client_id := v_access.client_id;
    end if;
  end if;

  -- A pending email link must not survive next to a temporary password.
  update public.member_activation_tokens
  set revoked_at = now()
  where member_id = p_member_id and used_at is null and revoked_at is null;

  return query select v_client_id, lower(v_client_id) || '@client.aqarbooks.local',
                      v_access.auth_user_id, v_member.organization_id, v_member.full_name,
                      v_access.auth_user_id is not null;
end;
$$;

create or replace function public.finish_member_temp_access(
  p_member_id uuid,
  p_auth_user_id uuid,
  p_valid_hours integer default 72
) returns timestamptz
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_member public.members;
  v_access public.member_portal_access;
  v_auth_email text;
  v_hash text;
  v_expires timestamptz;
  v_regen boolean;
  v_hours integer := least(greatest(coalesce(p_valid_hours, 72), 1), 168);
begin
  v_member := public._member_portal_authorize(p_member_id, 'members.portal.invite');

  select * into v_access from public.member_portal_access where member_id = p_member_id for update;
  if v_access.id is null or v_access.login_method <> 'client_id' then
    raise exception 'TEMP_ACCESS_NOT_STARTED' using errcode = '22023';
  end if;
  if v_access.status = 'suspended' then
    raise exception 'PORTAL_SUSPENDED: الوصول موقوف — أعد التفعيل أولًا' using errcode = '22023';
  end if;

  -- The identity must be the alias reserved for THIS client number. Without
  -- this check a caller holding the invite permission could attach their
  -- member to any Auth user id they happened to know.
  select email, encrypted_password into v_auth_email, v_hash from auth.users where id = p_auth_user_id;
  if v_auth_email is null or lower(v_auth_email) <> lower(v_access.client_id) || '@client.aqarbooks.local' then
    raise exception 'AUTH_USER_MISMATCH' using errcode = '22023';
  end if;
  if v_member.user_id is not null and v_member.user_id <> p_auth_user_id then
    raise exception 'ALREADY_ACTIVE: المالك مرتبط بحساب آخر' using errcode = '22023';
  end if;

  v_regen := v_access.auth_user_id is not null;
  v_expires := now() + make_interval(hours => v_hours);

  update public.members set user_id = p_auth_user_id where id = p_member_id and user_id is null;
  update public.member_portal_access
  set auth_user_id = p_auth_user_id,
      auth_origin = 'provisioned',
      must_change_password = true,
      temp_password_expires_at = v_expires,
      temp_pw_fingerprint = encode(digest(coalesce(v_hash, ''), 'sha256'), 'hex'),
      status = case when v_access.activated_at is null then 'pending' else 'active' end,
      updated_at = now()
  where id = v_access.id;

  perform public._member_portal_log(
    v_member.organization_id, p_member_id,
    case when v_regen then 'member_portal.temp_access_regenerated' else 'member_portal.temp_access_issued' end,
    jsonb_build_object('client_id', v_access.client_id, 'valid_hours', v_hours));

  return v_expires;
end;
$$;

-- 8. Staff: suspend / reactivate / sign out ------------------------------------
create or replace function public.suspend_member_portal(p_member_id uuid, p_reason text default null)
returns table(auth_user_id uuid, should_ban boolean)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_member public.members;
  v_access public.member_portal_access;
  v_uid uuid;
  v_ban boolean;
begin
  v_member := public._member_portal_authorize(p_member_id, 'members.portal.manage');

  select * into v_access from public.member_portal_access where member_id = p_member_id for update;
  if v_access.id is null then
    if v_member.user_id is null then
      raise exception 'NOT_PROVISIONED: لا يوجد وصول لإيقافه' using errcode = '22023';
    end if;
    -- Linked through the older invitation flow: record the identity so the
    -- suspension has something to attach to.
    insert into public.member_portal_access
      (organization_id, member_id, status, login_method, auth_user_id, auth_origin, activated_at, created_by)
    values (v_member.organization_id, p_member_id, 'active', 'email', v_member.user_id, 'linked_existing', now(), auth.uid())
    returning * into v_access;
  end if;

  v_uid := coalesce(v_access.auth_user_id, v_member.user_id);

  if v_access.status <> 'suspended' then
    update public.member_portal_access
    set status = 'suspended', suspended_at = now(), suspended_by = auth.uid(),
        suspend_reason = left(p_reason, 200), updated_at = now()
    where id = v_access.id;
    update public.member_activation_tokens
    set revoked_at = now()
    where member_id = p_member_id and used_at is null and revoked_at is null;
    perform public._member_portal_log(v_member.organization_id, p_member_id, 'member_portal.suspended',
      jsonb_build_object('reason_given', p_reason is not null and btrim(p_reason) <> ''));
  end if;

  -- Only an identity created for this owner alone may be banned outright. A
  -- shared identity (a staff member who is also an owner) must keep working as
  -- staff; for them suspension is enforced by current_member_id().
  v_ban := v_uid is not null
    and coalesce(v_access.auth_origin, 'linked_existing') = 'provisioned'
    and not exists (
      select 1 from public.organization_memberships om where om.user_id = v_uid and om.status = 'active'
    );

  return query select v_uid, v_ban;
end;
$$;

create or replace function public.reactivate_member_portal(p_member_id uuid)
returns table(auth_user_id uuid, should_unban boolean)
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_member public.members;
  v_access public.member_portal_access;
begin
  v_member := public._member_portal_authorize(p_member_id, 'members.portal.manage');

  select * into v_access from public.member_portal_access where member_id = p_member_id for update;
  if v_access.id is null or v_access.status <> 'suspended' then
    raise exception 'NOT_SUSPENDED: الوصول غير موقوف' using errcode = '22023';
  end if;

  update public.member_portal_access
  set status = case when v_access.activated_at is not null then 'active' else 'pending' end,
      suspended_at = null, suspended_by = null, suspend_reason = null, updated_at = now()
  where id = v_access.id;

  perform public._member_portal_log(v_member.organization_id, p_member_id, 'member_portal.reactivated', '{}'::jsonb);

  return query select coalesce(v_access.auth_user_id, v_member.user_id),
                      coalesce(v_access.auth_origin, 'linked_existing') = 'provisioned';
end;
$$;

-- Ending sessions is the Auth Admin API's job (lib/portal-access: mint a
-- one-off session for the identity, then admin.signOut(jwt, 'global')), not
-- ours: this function only decides whether the caller may, and for whom. The
-- outcome is then recorded by log_member_portal_event.
create or replace function public.begin_member_signout(p_member_id uuid)
returns table(auth_user_id uuid, is_banned boolean)
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_member public.members;
  v_access public.member_portal_access;
  v_uid uuid;
begin
  v_member := public._member_portal_authorize(p_member_id, 'members.portal.manage');
  select * into v_access from public.member_portal_access where member_id = p_member_id;
  v_uid := coalesce(v_access.auth_user_id, v_member.user_id);
  if v_uid is null then
    raise exception 'NOT_PROVISIONED: لا يوجد حساب لتسجيل خروجه' using errcode = '22023';
  end if;
  return query select v_uid, coalesce(v_access.status = 'suspended', false);
end;
$$;

-- Service role only: records an outcome the server observed. The action list is
-- closed so this cannot be used to write arbitrary audit entries.
create or replace function public.log_member_portal_event(p_member_id uuid, p_action text, p_actor uuid, p_summary jsonb default '{}'::jsonb)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_member public.members;
begin
  if p_action not in ('member_portal.sessions_revoked', 'member_portal.sessions_revoke_failed') then
    raise exception 'INVALID_PORTAL_EVENT' using errcode = '22023';
  end if;
  select * into v_member from public.members where id = p_member_id;
  if v_member.id is null then
    raise exception 'MEMBER_NOT_FOUND' using errcode = '22023';
  end if;
  perform public._member_portal_log(v_member.organization_id, p_member_id, p_action, p_summary, p_actor);
end;
$$;

-- 9. Service role: activation by link --------------------------------------------
create or replace function public._activation_token_state(p_token public.member_activation_tokens)
returns text
language sql
stable
as $$
  select case
    when p_token.id is null then 'not_found'
    when p_token.used_at is not null then 'used'
    when p_token.revoked_at is not null then 'revoked'
    when p_token.expires_at <= now() then 'expired'
    else 'valid' end
$$;
revoke all on function public._activation_token_state(public.member_activation_tokens) from public, anon, authenticated;

create or replace function public.inspect_member_activation(p_token text)
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_token public.member_activation_tokens;
  v_member public.members;
  v_org_name text;
  v_state text;
  v_access public.member_portal_access;
  v_identity record;
begin
  if p_token is null or length(p_token) < 20 or length(p_token) > 128 then
    return jsonb_build_object('state', 'not_found');
  end if;
  select * into v_token from public.member_activation_tokens
  where token_hash = encode(digest(p_token, 'sha256'), 'hex');
  v_state := public._activation_token_state(v_token);
  if v_state = 'not_found' then
    return jsonb_build_object('state', 'not_found');
  end if;

  select * into v_member from public.members where id = v_token.member_id;
  select * into v_access from public.member_portal_access where member_id = v_token.member_id;
  if v_state = 'valid' then
    -- A token that was never delivered, or whose address is no longer the
    -- member's, proves nothing about the mailbox: treat it as cancelled.
    if v_token.delivery_status <> 'sent'
       or lower(btrim(coalesce(v_member.email, ''))) <> v_token.email
       or (v_access.id is not null and v_access.status = 'suspended') then
      v_state := 'revoked';
    end if;
  end if;
  if v_state <> 'valid' then
    return jsonb_build_object('state', v_state);
  end if;

  select name into v_org_name from public.organizations where id = v_token.organization_id;
  select u.id, (u.email_confirmed_at is not null) as confirmed into v_identity
  from auth.users u where lower(u.email) = v_token.email limit 1;

  return jsonb_build_object(
    'state', 'valid',
    'member_name', v_member.full_name,
    'organization_name', v_org_name,
    'email', v_token.email,
    -- Only a VERIFIED identity is linked (after it signs in). An unverified one
    -- is not trusted: the mailbox holder who presents this token replaces it.
    'existing_account', coalesce(v_identity.confirmed, false),
    'existing_unverified', v_identity.id is not null and not coalesce(v_identity.confirmed, false),
    -- An unverified identity that already belongs to an organization (an invited
    -- colleague) is never taken over; the server checks this BEFORE it touches it.
    'existing_in_use', v_identity.id is not null and exists (
      select 1 from public.organization_memberships om where om.user_id = v_identity.id
    ),
    'expires_at', v_token.expires_at
  );
end;
$$;

create or replace function public.complete_member_activation(p_token text, p_auth_user_id uuid, p_origin text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_token public.member_activation_tokens;
  v_member public.members;
  v_access public.member_portal_access;
  v_state text;
  v_auth_email text;
  v_auth_confirmed timestamptz;
begin
  if p_origin not in ('provisioned', 'linked_existing') then
    return jsonb_build_object('ok', false, 'reason', 'invalid_origin');
  end if;
  if p_token is null or length(p_token) < 20 or length(p_token) > 128 then
    return jsonb_build_object('ok', false, 'reason', 'invalid_token');
  end if;

  -- The row lock makes "one time" real: two concurrent completions of the same
  -- link serialize here, and the second one sees used_at already set.
  select * into v_token from public.member_activation_tokens
  where token_hash = encode(digest(p_token, 'sha256'), 'hex')
  for update;
  v_state := public._activation_token_state(v_token);
  if v_state <> 'valid' then
    return jsonb_build_object('ok', false, 'reason', case v_state when 'not_found' then 'invalid_token' else v_state end);
  end if;
  -- Proof of the mailbox: the token must have been delivered by email.
  if v_token.delivery_status <> 'sent' then
    return jsonb_build_object('ok', false, 'reason', 'revoked');
  end if;

  select * into v_member from public.members where id = v_token.member_id for update;
  if v_member.id is null or v_member.organization_id <> v_token.organization_id then
    return jsonb_build_object('ok', false, 'reason', 'invalid_token');
  end if;
  if lower(btrim(coalesce(v_member.email, ''))) <> v_token.email then
    return jsonb_build_object('ok', false, 'reason', 'revoked');
  end if;
  if not public.organization_is_active(v_member.organization_id) then
    return jsonb_build_object('ok', false, 'reason', 'org_inactive');
  end if;

  select * into v_access from public.member_portal_access where member_id = v_member.id for update;
  if v_access.id is not null and v_access.status = 'suspended' then
    return jsonb_build_object('ok', false, 'reason', 'revoked');
  end if;

  select email, email_confirmed_at into v_auth_email, v_auth_confirmed from auth.users where id = p_auth_user_id;
  if v_auth_email is null or lower(v_auth_email) <> v_token.email then
    return jsonb_build_object('ok', false, 'reason', 'email_mismatch');
  end if;

  -- An existing identity may be linked only if its address was verified; an
  -- unverified one would hand the owner's data to whoever registered it first.
  if p_origin = 'linked_existing' and v_auth_confirmed is null then
    return jsonb_build_object('ok', false, 'reason', 'identity_unverified');
  end if;
  -- An identity we call "provisioned" must be one that belongs to nobody else.
  if p_origin = 'provisioned'
     and exists (select 1 from public.organization_memberships om where om.user_id = p_auth_user_id) then
    return jsonb_build_object('ok', false, 'reason', 'identity_in_use');
  end if;
  if v_member.user_id is not null and v_member.user_id <> p_auth_user_id then
    return jsonb_build_object('ok', false, 'reason', 'already_linked');
  end if;
  -- One identity, one member: current_member_id() assumes it.
  if exists (select 1 from public.members m where m.user_id = p_auth_user_id and m.id <> v_member.id) then
    return jsonb_build_object('ok', false, 'reason', 'already_linked');
  end if;

  update public.members set user_id = p_auth_user_id where id = v_member.id;
  update public.member_activation_tokens set used_at = now() where id = v_token.id;
  insert into public.member_portal_access
    (organization_id, member_id, status, login_method, auth_user_id, auth_origin, activated_at, created_by)
  values (v_member.organization_id, v_member.id, 'active', 'email', p_auth_user_id, p_origin, now(), v_token.created_by)
  on conflict (member_id) do update
    set status = 'active', login_method = 'email', auth_user_id = excluded.auth_user_id,
        auth_origin = excluded.auth_origin, activated_at = now(),
        must_change_password = false, temp_password_expires_at = null, temp_pw_fingerprint = null,
        updated_at = now();

  perform public._member_portal_log(v_member.organization_id, v_member.id, 'member_portal.activation_completed',
    jsonb_build_object('token_id', v_token.id, 'method', 'email', 'identity', p_origin, 'email_proof', 'delivered_link'),
    v_token.created_by);
  return jsonb_build_object('ok', true, 'member_id', v_member.id);
end;
$$;

create or replace function public.portal_find_auth_user(p_email text)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select id from auth.users where lower(email) = lower(btrim(p_email)) limit 1
$$;

-- 10. The signed-in owner: where do I stand, and finishing a first login ---------
create or replace function public.my_portal_access()
returns jsonb
language plpgsql
stable
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_member public.members;
  v_access public.member_portal_access;
  v_digits text;
begin
  if v_uid is null then
    return jsonb_build_object('linked', false, 'status', 'none', 'must_change_password', false,
      'temp_expired', false, 'login_method', null, 'client_id', null, 'phone_hint', null,
      'has_recovery_email', false, 'has_staff_access', false);
  end if;

  select * into v_member from public.members where user_id = v_uid order by created_at limit 1;
  if v_member.id is null then
    return jsonb_build_object('linked', false, 'status', 'none', 'must_change_password', false,
      'temp_expired', false, 'login_method', null, 'client_id', null, 'phone_hint', null,
      'has_recovery_email', false,
      'has_staff_access', exists (select 1 from public.organization_memberships om where om.user_id = v_uid and om.status = 'active'));
  end if;

  select * into v_access from public.member_portal_access where member_id = v_member.id;
  v_digits := regexp_replace(coalesce(v_access.confirmed_phone, v_member.phone, ''), '[^0-9]', '', 'g');

  return jsonb_build_object(
    'linked', true,
    'status', coalesce(v_access.status, 'active'),
    'must_change_password', coalesce(v_access.must_change_password, false),
    'temp_expired', coalesce(v_access.must_change_password
      and v_access.temp_password_expires_at is not null
      and v_access.temp_password_expires_at < now(), false),
    'login_method', coalesce(v_access.login_method, 'email'),
    'client_id', v_access.client_id,
    'phone_hint', case when length(v_digits) >= 4 then '•••• ' || right(v_digits, 4) else null end,
    'has_recovery_email', false,
    'has_staff_access', exists (select 1 from public.organization_memberships om where om.user_id = v_uid and om.status = 'active')
  );
end;
$$;

create or replace function public.complete_portal_first_login(p_phone text)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $$
declare
  v_uid uuid := auth.uid();
  v_member public.members;
  v_access public.member_portal_access;
  v_phone text;
  v_hash text;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'reason', 'NOT_AUTHENTICATED');
  end if;

  select * into v_member from public.members where user_id = v_uid order by created_at limit 1;
  if v_member.id is null then
    return jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  end if;
  select * into v_access from public.member_portal_access where member_id = v_member.id for update;
  if v_access.id is null then
    return jsonb_build_object('ok', false, 'reason', 'NOT_FOUND');
  end if;
  if v_access.status = 'suspended' then
    return jsonb_build_object('ok', false, 'reason', 'SUSPENDED');
  end if;
  if not v_access.must_change_password then
    return jsonb_build_object('ok', false, 'reason', 'NOT_REQUIRED');
  end if;
  if v_access.temp_password_expires_at is not null and v_access.temp_password_expires_at < now() then
    return jsonb_build_object('ok', false, 'reason', 'TEMP_EXPIRED');
  end if;

  v_phone := translate(coalesce(p_phone, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789');
  v_phone := regexp_replace(v_phone, '[^0-9+]', '', 'g');
  if length(regexp_replace(v_phone, '[^0-9]', '', 'g')) not between 8 and 15 then
    return jsonb_build_object('ok', false, 'reason', 'INVALID_PHONE');
  end if;

  select encode(digest(coalesce(encrypted_password, ''), 'sha256'), 'hex') into v_hash
  from auth.users where id = v_uid;
  if v_hash is null or v_hash = v_access.temp_pw_fingerprint then
    return jsonb_build_object('ok', false, 'reason', 'PASSWORD_NOT_CHANGED');
  end if;

  update public.member_portal_access
  set must_change_password = false,
      temp_password_expires_at = null,
      temp_pw_fingerprint = null,
      confirmed_phone = v_phone,
      phone_confirmed_at = now(),
      status = 'active',
      activated_at = coalesce(activated_at, now()),
      updated_at = now()
  where id = v_access.id;

  perform public._member_portal_log(v_member.organization_id, v_member.id, 'member_portal.activation_completed',
    jsonb_build_object('method', 'client_id', 'identity', 'provisioned'));
  return jsonb_build_object('ok', true);
end;
$$;

-- 11. Grants ---------------------------------------------------------------------
-- Same posture as the rest of the schema: nothing is executable by anon, and
-- each function is granted to exactly the roles that call it.
do $$
declare
  fn text;
begin
  foreach fn in array array[
    'public.get_member_portal_access(uuid)',
    'public.request_member_activation(uuid)',
    'public.revoke_member_activation(uuid)',
    'public.begin_member_temp_access(uuid)',
    'public.finish_member_temp_access(uuid, uuid, integer)',
    'public.suspend_member_portal(uuid, text)',
    'public.reactivate_member_portal(uuid)',
    'public.begin_member_signout(uuid)',
    'public.my_portal_access()',
    'public.complete_portal_first_login(text)'
  ] loop
    execute format('revoke all on function %s from public, anon', fn);
    execute format('grant execute on function %s to authenticated, service_role', fn);
  end loop;

  foreach fn in array array[
    'public.mint_member_activation_token(uuid, uuid, integer)',
    'public.mark_member_activation_delivery(uuid, text, text)',
    'public.log_member_portal_event(uuid, text, uuid, jsonb)',
    'public.inspect_member_activation(text)',
    'public.complete_member_activation(text, uuid, text)',
    'public.portal_find_auth_user(text)'
  ] loop
    execute format('revoke all on function %s from public, anon, authenticated', fn);
    execute format('grant execute on function %s to service_role', fn);
  end loop;
end $$;

commit;
