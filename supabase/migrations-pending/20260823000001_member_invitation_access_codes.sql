-- Owner portal: passwordless entry via link + one-time access code.
--
-- WHY
-- The portal previously forced an owner to invent a password on first use. The
-- Supabase magic link in the invitation already establishes the session before
-- that form is ever shown, so the password added friction without adding a
-- factor. It is removed entirely.
--
-- Removing it alone would leave the link as the sole credential, and that link
-- travels over WhatsApp: anyone it is forwarded to would reach a full financial
-- position. So a six-digit access code becomes the second factor. The link
-- proves possession of the message; the code proves the holder was the intended
-- recipient. Staff send them separately.
--
-- The code gates the *linking* step (members.user_id = auth.uid()), not the
-- session. An unlinked session sees nothing: every portal policy resolves
-- through current_member_id(), which stays NULL until this function succeeds.
--
-- NOTE ON THIS FILE'S LOCATION
-- It lives in supabase/migrations-pending/, not supabase/migrations/.
-- tests/migration-directory-guard.test.ts pins that directory to exactly one
-- file (the squashed baseline) by name, size and SHA-256, and a second file
-- there fails the guard. This file is the authored artifact of what was applied.

begin;

-- 1. Code material on the invitation ---------------------------------------
-- code_hash is salted with the invitation id so the same six digits issued for
-- two different invitations never share a digest.
alter table public.member_invitations
  add column if not exists code_hash text,
  add column if not exists code_attempts integer not null default 0,
  add column if not exists code_locked_until timestamptz;

comment on column public.member_invitations.code_hash is
  'sha256 of invitation_id, a colon, and the six-digit code. Salted per invitation.';
comment on column public.member_invitations.code_attempts is
  'Failed code attempts on this invitation; cleared once it is accepted.';
comment on column public.member_invitations.code_locked_until is
  'Set when attempts reach the limit; blocks verification until it passes.';

-- 2. create_member_invitation -----------------------------------------------
-- The signature gains raw_code in its OUT columns, so the old function must be
-- dropped rather than replaced. Grants do not survive a drop and are restored
-- verbatim below (authenticated + service_role, never anon) -- the exact set
-- read off pg_proc.proacl before this migration ran.
drop function if exists public.create_member_invitation(uuid);

create function public.create_member_invitation(p_member_id uuid)
returns table(
  invitation_id uuid,
  raw_token uuid,
  raw_code text,
  invite_email text,
  member_email text,
  member_phone text,
  is_synthetic_email boolean
)
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_member public.members;
  v_token uuid;
  v_code text;
  v_bytes bytea;
  v_invitation_id uuid;
  v_invite_email text;
  v_is_synthetic boolean := false;
begin
  select * into v_member from public.members where id = p_member_id;
  if v_member.id is null then
    raise exception 'MEMBER_NOT_FOUND: العضو غير موجود' using errcode = '22023';
  end if;

  if not public.has_permission(auth.uid(), v_member.organization_id, 'members.portal.invite') then
    raise exception 'FORBIDDEN_PORTAL_INVITE: لا تملك صلاحية دعوة الأعضاء للبوابة' using errcode = '42501';
  end if;

  if (v_member.email is null or btrim(v_member.email) = '')
     and (v_member.phone is null or btrim(v_member.phone) = '') then
    raise exception 'MEMBER_CONTACT_REQUIRED: يجب أن يكون للعضو بريد إلكتروني أو رقم هاتف مسجل قبل الدعوة' using errcode = '22023';
  end if;

  if v_member.user_id is not null then
    raise exception 'MEMBER_ALREADY_LINKED: هذا العضو لديه حساب بوابة بالفعل' using errcode = '22023';
  end if;

  if v_member.email is not null and btrim(v_member.email) <> '' then
    v_invite_email := lower(btrim(v_member.email));
  else
    -- Deterministic per-member placeholder; never sent anywhere, only used
    -- as the auth.users identity behind the WhatsApp-delivered link.
    v_invite_email := 'member-' || replace(p_member_id::text, '-', '') || '@invite.aqarbooks.local';
    v_is_synthetic := true;
  end if;

  update public.member_invitations
  set status = 'revoked'
  where member_id = p_member_id and status = 'pending';

  v_token := gen_random_uuid();

  -- The id is generated up front rather than read back from RETURNING, because
  -- the code digest is salted with it and has to be known at insert time.
  v_invitation_id := gen_random_uuid();

  -- Six digits from the CSPRNG, not random(): this is a credential. Composed
  -- arithmetically from four bytes rather than with bit operators so the
  -- intent stays readable.
  v_bytes := extensions.gen_random_bytes(4);
  v_code := lpad(
    ((  get_byte(v_bytes, 0)::bigint * 16777216
      + get_byte(v_bytes, 1)::bigint * 65536
      + get_byte(v_bytes, 2)::bigint * 256
      + get_byte(v_bytes, 3)::bigint) % 1000000)::text,
    6, '0');

  insert into public.member_invitations (
    id, organization_id, member_id, email, token_hash, code_hash, expires_at, invited_by
  ) values (
    v_invitation_id, v_member.organization_id, p_member_id, v_invite_email,
    encode(digest(v_token::text, 'sha256'), 'hex'),
    encode(digest(v_invitation_id::text || ':' || v_code, 'sha256'), 'hex'),
    now() + interval '72 hours',
    auth.uid()
  );

  return query select v_invitation_id, v_token, v_code, v_invite_email,
                      v_member.email, v_member.phone, v_is_synthetic;
end;
$function$;

revoke all on function public.create_member_invitation(uuid) from public;
grant execute on function public.create_member_invitation(uuid) to authenticated;
grant execute on function public.create_member_invitation(uuid) to service_role;

-- 3. accept_member_invitation -----------------------------------------------
-- Gains p_code, and returns jsonb instead of raising.
--
-- Returning rather than raising is load-bearing, not a style choice: a raised
-- exception rolls the transaction back, which would roll back the failed-attempt
-- counter with it and leave the lockout unenforceable. Every outcome is a value.
--
-- The two-argument overload is dropped. Leaving both would make the call
-- ambiguous to PostgREST (PGRST203) and would also leave a code-free path to
-- linking an account -- the exact thing this migration exists to close.
drop function if exists public.accept_member_invitation(uuid, uuid);
drop function if exists public.accept_member_invitation(uuid, uuid, text);

create function public.accept_member_invitation(
  p_invitation_id uuid,
  p_token uuid,
  p_code text
)
returns jsonb
language plpgsql
security definer
set search_path to 'public', 'extensions'
as $function$
declare
  v_invitation public.member_invitations;
  v_session_email text;
  v_member public.members;
  v_normalized_code text;
  v_attempts integer;
  v_locked_until timestamptz;
  v_max_attempts constant integer := 5;
  v_lock_minutes constant integer := 15;
begin
  if auth.uid() is null then
    return jsonb_build_object('ok', false, 'reason', 'NOT_AUTHENTICATED');
  end if;

  select * into v_invitation from public.member_invitations where id = p_invitation_id for update;
  if v_invitation.id is null then
    return jsonb_build_object('ok', false, 'reason', 'INVITATION_NOT_FOUND');
  end if;

  select * into v_member from public.members where id = v_invitation.member_id for update;

  -- Already accepted by this same now-authenticated user: idempotent no-op, and
  -- deliberately code-free. Re-opening the link on the same device must not
  -- demand the code again.
  if v_invitation.status = 'accepted' and v_member.user_id = auth.uid() then
    return jsonb_build_object('ok', true, 'member_id', v_member.id);
  end if;

  if v_invitation.status <> 'pending' then
    return jsonb_build_object('ok', false, 'reason', 'INVITATION_NOT_PENDING');
  end if;

  if v_invitation.expires_at < now() then
    update public.member_invitations set status = 'expired' where id = p_invitation_id;
    return jsonb_build_object('ok', false, 'reason', 'INVITATION_EXPIRED');
  end if;

  if encode(digest(p_token::text, 'sha256'), 'hex') <> v_invitation.token_hash then
    return jsonb_build_object('ok', false, 'reason', 'INVITATION_TOKEN_INVALID');
  end if;

  v_session_email := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  if v_session_email = '' or v_session_email <> v_invitation.email then
    return jsonb_build_object('ok', false, 'reason', 'INVITATION_EMAIL_MISMATCH');
  end if;

  -- Code gate ---------------------------------------------------------------
  if v_invitation.code_locked_until is not null and v_invitation.code_locked_until > now() then
    return jsonb_build_object(
      'ok', false, 'reason', 'CODE_LOCKED',
      'locked_until', v_invitation.code_locked_until
    );
  end if;

  if v_invitation.code_hash is null then
    -- An invitation minted before this migration carries no code. It cannot be
    -- accepted; staff must re-invite. Failing closed is the only safe reading.
    return jsonb_build_object('ok', false, 'reason', 'CODE_NOT_SET');
  end if;

  -- Digits only: an owner reads the code off a message and retypes it with
  -- spaces or Arabic-Indic numerals as often as not.
  v_normalized_code := translate(coalesce(p_code, ''), '٠١٢٣٤٥٦٧٨٩', '0123456789');
  v_normalized_code := regexp_replace(v_normalized_code, '[^0-9]', '', 'g');

  if encode(digest(p_invitation_id::text || ':' || v_normalized_code, 'sha256'), 'hex')
     <> v_invitation.code_hash then
    update public.member_invitations
    set code_attempts = code_attempts + 1,
        code_locked_until = case
          when code_attempts + 1 >= v_max_attempts
          then now() + make_interval(mins => v_lock_minutes)
          else code_locked_until
        end
    where id = p_invitation_id
    returning code_attempts, code_locked_until into v_attempts, v_locked_until;

    if v_locked_until is not null and v_locked_until > now() then
      return jsonb_build_object(
        'ok', false, 'reason', 'CODE_LOCKED',
        'locked_until', v_locked_until
      );
    end if;

    return jsonb_build_object(
      'ok', false, 'reason', 'INVALID_CODE',
      'attempts_left', greatest(v_max_attempts - v_attempts, 0)
    );
  end if;

  -- Structural checks that survive the code gate ------------------------------
  if v_member.id is null then
    return jsonb_build_object('ok', false, 'reason', 'MEMBER_NOT_FOUND');
  end if;

  if v_member.user_id is not null then
    return jsonb_build_object('ok', false, 'reason', 'MEMBER_ALREADY_LINKED');
  end if;

  update public.members set user_id = auth.uid() where id = v_member.id;
  update public.member_invitations
  set status = 'accepted',
      accepted_at = now(),
      accepted_user_id = auth.uid(),
      code_attempts = 0,
      code_locked_until = null
  where id = p_invitation_id;

  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_member.organization_id, 'member_portal.invitation_accepted', 'member', v_member.id,
    jsonb_build_object('invitation_id', p_invitation_id, 'second_factor', 'access_code'));

  return jsonb_build_object('ok', true, 'member_id', v_member.id);
end;
$function$;

revoke all on function public.accept_member_invitation(uuid, uuid, text) from public;
grant execute on function public.accept_member_invitation(uuid, uuid, text) to authenticated;
grant execute on function public.accept_member_invitation(uuid, uuid, text) to service_role;

commit;
