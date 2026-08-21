-- Let a member with a phone number but no registered email still receive a
-- portal invitation, delivered by hand over WhatsApp instead of email.
--
-- generateLink() (called from lib/actions/member-portal.ts) always needs an
-- email identity to mint the underlying auth.users row, but that email is
-- never actually used to *deliver* anything -- the app already hands the
-- resulting action_link to staff, who deliver it themselves via the
-- mailto:/wa.me buttons in invite-to-portal-dialog.tsx. So a phone-only
-- member gets a deterministic, never-emailed placeholder address solely to
-- satisfy that identity requirement; accept_member_invitation's later
-- email-match check (against the Supabase session established by clicking
-- the link) is completely unaffected, since it just compares whatever
-- email ended up on the invitation row against the session's -- real or
-- placeholder, the two always match by construction.
--
-- Return shape changes (new invite_email + is_synthetic_email columns), so
-- this must be a drop + recreate rather than create-or-replace.
drop function if exists public.create_member_invitation(uuid);

create function public.create_member_invitation(
  p_member_id uuid
)
returns table (
  invitation_id uuid,
  raw_token uuid,
  invite_email text,
  member_email text,
  member_phone text,
  is_synthetic_email boolean
)
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_member public.members;
  v_token uuid;
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

  insert into public.member_invitations (
    organization_id, member_id, email, token_hash, expires_at, invited_by
  ) values (
    v_member.organization_id, p_member_id, v_invite_email,
    encode(digest(v_token::text, 'sha256'), 'hex'),
    now() + interval '72 hours',
    auth.uid()
  )
  returning id into v_invitation_id;

  return query select v_invitation_id, v_token, v_invite_email, v_member.email, v_member.phone, v_is_synthetic;
end;
$$;

revoke execute on function public.create_member_invitation(uuid) from public, anon;
grant execute on function public.create_member_invitation(uuid) to authenticated;

notify pgrst, 'reload schema';
