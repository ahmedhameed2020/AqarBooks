-- create_member_invitation: staff-facing. Checks members.portal.invite,
-- revokes any existing pending invitation for this member (one pending per
-- member, enforced further by the partial unique index from Task 1), mints
-- a random token, stores only its sha256 hash, and returns the raw token
-- exactly once -- it is never persisted or logged anywhere else.
create or replace function public.create_member_invitation(
  p_member_id uuid
)
returns table (invitation_id uuid, raw_token uuid, member_email text, member_phone text)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_member public.members;
  v_token uuid;
  v_invitation_id uuid;
begin
  select * into v_member from public.members where id = p_member_id;
  if v_member.id is null then
    raise exception 'MEMBER_NOT_FOUND: العضو غير موجود' using errcode = '22023';
  end if;

  if not public.has_permission(auth.uid(), v_member.organization_id, 'members.portal.invite') then
    raise exception 'FORBIDDEN_PORTAL_INVITE: لا تملك صلاحية دعوة الأعضاء للبوابة' using errcode = '42501';
  end if;

  if v_member.email is null or btrim(v_member.email) = '' then
    raise exception 'MEMBER_EMAIL_REQUIRED: يجب أن يكون للعضو بريد إلكتروني مسجل قبل الدعوة' using errcode = '22023';
  end if;

  if v_member.user_id is not null then
    raise exception 'MEMBER_ALREADY_LINKED: هذا العضو لديه حساب بوابة بالفعل' using errcode = '22023';
  end if;

  update public.member_invitations
  set status = 'revoked'
  where member_id = p_member_id and status = 'pending';

  v_token := gen_random_uuid();

  insert into public.member_invitations (
    organization_id, member_id, email, token_hash, expires_at, invited_by
  ) values (
    v_member.organization_id, p_member_id, lower(btrim(v_member.email)),
    encode(digest(v_token::text, 'sha256'), 'hex'),
    now() + interval '72 hours',
    auth.uid()
  )
  returning id into v_invitation_id;

  return query select v_invitation_id, v_token, v_member.email, v_member.phone;
end;
$$;

-- accept_member_invitation: invitee-facing. Runs as the just-authenticated
-- invitee (auth.uid() is the new/linked auth user, established client-side
-- via Supabase's invite-link session before this is called). Validates our
-- own token independently of whatever Supabase link mechanism was used to
-- get here, confirms the invited email matches the authenticated session's
-- email, and performs the members.user_id link -- the ONLY step that
-- actually grants portal access. Idempotent-safe to call twice with an
-- already-accepted token for the SAME now-linked user (returns success,
-- matching how a page refresh after acceptance should behave); any other
-- mismatch raises and changes nothing.
create or replace function public.accept_member_invitation(
  p_invitation_id uuid,
  p_token uuid
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_invitation public.member_invitations;
  v_session_email text;
  v_member public.members;
begin
  if auth.uid() is null then
    raise exception 'NOT_AUTHENTICATED: يجب تسجيل الدخول عبر رابط الدعوة أولاً' using errcode = '42501';
  end if;

  select * into v_invitation from public.member_invitations where id = p_invitation_id for update;
  if v_invitation.id is null then
    raise exception 'INVITATION_NOT_FOUND: رابط الدعوة غير صالح' using errcode = '22023';
  end if;

  select * into v_member from public.members where id = v_invitation.member_id for update;

  -- Already accepted by this same now-authenticated user: idempotent no-op.
  if v_invitation.status = 'accepted' and v_member.user_id = auth.uid() then
    return v_member.id;
  end if;

  if v_invitation.status <> 'pending' then
    raise exception 'INVITATION_NOT_PENDING: رابط الدعوة لم يعد صالحًا (تم استخدامه أو إلغاؤه)' using errcode = '22023';
  end if;

  if v_invitation.expires_at < now() then
    update public.member_invitations set status = 'expired' where id = p_invitation_id;
    raise exception 'INVITATION_EXPIRED: انتهت صلاحية رابط الدعوة، يرجى طلب دعوة جديدة' using errcode = '22023';
  end if;

  if encode(digest(p_token::text, 'sha256'), 'hex') <> v_invitation.token_hash then
    raise exception 'INVITATION_TOKEN_INVALID: رابط الدعوة غير صحيح' using errcode = '22023';
  end if;

  v_session_email := lower(btrim(coalesce(auth.jwt() ->> 'email', '')));
  if v_session_email = '' or v_session_email <> v_invitation.email then
    raise exception 'INVITATION_EMAIL_MISMATCH: البريد الإلكتروني لهذا الحساب لا يطابق بريد الدعوة' using errcode = '42501';
  end if;

  if v_member.id is null then
    raise exception 'MEMBER_NOT_FOUND: العضو غير موجود' using errcode = '22023';
  end if;

  if v_member.user_id is not null then
    raise exception 'MEMBER_ALREADY_LINKED: تم ربط هذا العضو بحساب آخر بالفعل' using errcode = '22023';
  end if;

  update public.members set user_id = auth.uid() where id = v_member.id;
  update public.member_invitations
  set status = 'accepted', accepted_at = now(), accepted_user_id = auth.uid()
  where id = p_invitation_id;

  insert into public.platform_audit_logs (actor_id, organization_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), v_member.organization_id, 'member_portal.invitation_accepted', 'member', v_member.id,
    jsonb_build_object('invitation_id', p_invitation_id));

  return v_member.id;
end;
$$;

-- expire_stale_member_invitations: sweep function, called lazily (Task 5's
-- server action calls this before creating a new invitation) rather than
-- via a cron job -- this project has no pg_cron extension enabled, and a
-- lazy sweep is sufficient since expiry is also checked directly inside
-- accept_member_invitation regardless of whether this has run recently.
create or replace function public.expire_stale_member_invitations()
returns integer
language sql
security definer
set search_path = public
as $$
  with expired as (
    update public.member_invitations
    set status = 'expired'
    where status = 'pending' and expires_at < now()
    returning id
  )
  select count(*)::integer from expired;
$$;

revoke execute on function public.create_member_invitation from public, anon;
revoke execute on function public.accept_member_invitation from public, anon;
revoke execute on function public.expire_stale_member_invitations from public, anon;
grant execute on function public.create_member_invitation to authenticated;
grant execute on function public.accept_member_invitation to authenticated;
grant execute on function public.expire_stale_member_invitations to authenticated;

notify pgrst, 'reload schema';
