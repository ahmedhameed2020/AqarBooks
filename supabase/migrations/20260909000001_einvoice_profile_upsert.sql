-- E-invoicing profile upsert. FUNCTIONS ONLY -- no new columns, and nothing
-- here reads, writes or accepts a certificate or a secret.
--
-- einvoice_profiles deliberately carries no client write policy: profiles gate
-- statutory filing, so they are written through a checked function rather than
-- by whatever the client sends. This is that function, and it handles metadata
-- exclusively: jurisdiction, environment, and the taxpayer identifiers that
-- appear on the invoice itself. The Vault secret-id columns are untouched, and
-- will be populated by a separate credential path once credentials exist.
--
-- RE-VERIFICATION RULE. Changing WHO is filing, WHERE, or under WHICH
-- jurisdiction invalidates any previous verification -- a profile verified as
-- one taxpayer in sandbox must not silently remain ACTIVE after being pointed
-- at a different taxpayer or at production. So those changes drop the profile
-- back to DRAFT and disable it. Same rule, and the same reasoning, as the
-- payment-provider fix in 14a85a1 where changing a merchant identifier forces
-- re-verification.

create or replace function public.upsert_einvoice_profile(
  p_organization_id uuid,
  p_jurisdiction text,
  p_environment text,
  p_taxpayer_id text default null,
  p_branch_code text default null,
  p_activity_code text default null,
  p_property_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_existing record;
  v_id uuid;
  v_identity_changed boolean := false;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.einvoice.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإدارة إعدادات الفوترة الإلكترونية'
      using errcode = '42501';
  end if;

  if not public.organization_is_active(p_organization_id) then
    raise exception 'ORGANIZATION_NOT_ACTIVE: المؤسسة غير نشطة' using errcode = 'P0001';
  end if;

  if p_jurisdiction not in ('EG_ETA', 'SA_ZATCA', 'AE_PEPPOL') then
    raise exception 'EINVOICE_JURISDICTION_INVALID: ولاية ضريبية غير مدعومة' using errcode = '22023';
  end if;

  if p_environment not in ('SANDBOX', 'PRODUCTION') then
    raise exception 'EINVOICE_ENVIRONMENT_INVALID: بيئة غير صحيحة' using errcode = '22023';
  end if;

  select * into v_existing
  from public.einvoice_profiles
  where organization_id = p_organization_id
    and jurisdiction = p_jurisdiction
    and environment = p_environment;

  if v_existing.id is null then
    insert into public.einvoice_profiles (
      organization_id, property_id, jurisdiction, environment,
      taxpayer_id, branch_code, activity_code, status, enabled, created_by, updated_by
    ) values (
      p_organization_id, p_property_id, p_jurisdiction, p_environment,
      p_taxpayer_id, p_branch_code, p_activity_code, 'DRAFT', false, auth.uid(), auth.uid()
    )
    returning id into v_id;
    return v_id;
  end if;

  -- Only the taxpayer's own identity counts as an identity change. Editing a
  -- branch or activity code is a correction, not a different filer, so it must
  -- not throw away a verification that is still true.
  v_identity_changed := coalesce(v_existing.taxpayer_id, '') <> coalesce(p_taxpayer_id, '');

  update public.einvoice_profiles
  set taxpayer_id = p_taxpayer_id,
      branch_code = p_branch_code,
      activity_code = p_activity_code,
      property_id = coalesce(p_property_id, property_id),
      updated_by = auth.uid(),
      status = case when v_identity_changed then 'DRAFT' else status end,
      enabled = case when v_identity_changed then false else enabled end,
      verified_at = case when v_identity_changed then null else verified_at end,
      last_verification_error = case
        when v_identity_changed
        then 'تغيّر الرقم الضريبي؛ يلزم إعادة التحقق'
        else last_verification_error end
  where id = v_existing.id
  returning id into v_id;

  return v_id;
end;
$$;

-- Enabling is separate from verifying on purpose: verification proves the
-- credentials work, enabling is the human decision to start filing with them.
-- Collapsing the two would mean a successful connection test silently begins
-- submitting statutory documents.
create or replace function public.set_einvoice_profile_enabled(
  p_profile_id uuid,
  p_enabled boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
begin
  select * into v_profile from public.einvoice_profiles where id = p_profile_id;
  if v_profile.id is null then
    raise exception 'EINVOICE_PROFILE_NOT_FOUND: ملف التسجيل غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_profile.organization_id, 'finance.einvoice.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإدارة إعدادات الفوترة الإلكترونية'
      using errcode = '42501';
  end if;

  -- An unverified profile cannot be switched on. Without this, ACTIVE would be
  -- a claim anyone could make about an untested connection.
  if p_enabled and (v_profile.status <> 'ACTIVE' or v_profile.verified_at is null) then
    raise exception
      'EINVOICE_NOT_VERIFIED: لا يمكن تفعيل الإرسال قبل التحقق الفعلي من بيانات الاعتماد'
      using errcode = 'P0001';
  end if;

  update public.einvoice_profiles
  set enabled = p_enabled, updated_by = auth.uid()
  where id = p_profile_id;
end;
$$;
