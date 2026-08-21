-- ADR 0002 — organizations.tax_id becomes the tax identity source.
--
-- Functions and one trigger only. No columns, no tables, no data migration —
-- and none is needed: at implementation time the database held zero profiles,
-- zero documents, zero organizations with a tax id and zero profiles with a
-- taxpayer id, which is precisely why this was scheduled before the first
-- profile rather than after.
--
-- WHAT WAS WRONG. upsert_einvoice_profile treated einvoice_profiles.taxpayer_id
-- as the identity: changing it dropped the profile to DRAFT and cleared
-- verification. Right in intent — a change of taxpayer must void a verification
-- — and wrong in reference, because it measured the change against an
-- integration row rather than against the entity's legal identity. A tax
-- registration number exists before ETA and survives it; a profile is
-- operational and can be deleted and recreated.
--
-- WHAT IT BECOMES.
--   organizations.tax_id           legal identity, the source
--   einvoice_profiles.taxpayer_id  the number used with one authority
--
-- For a single authority the two must agree. The model permits divergence
-- across authorities, but there is deliberately NO mechanism to record a
-- documented legal exception yet, so no exception can be granted: equality is
-- enforced unconditionally. Building an exception path before anyone has asked
-- for one would be inventing a requirement.

-- Reject a profile whose identity is absent or conflicting, and inherit the
-- organization's identity when none is supplied.
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
  v_org_tax_id text;
  v_effective_tax_id text;
  v_identity_changed boolean := false;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.einvoice.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإدارة إعدادات الفوترة الإلكترونية'
      using errcode = '42501';
  end if;

  if not public.organization_is_active(p_organization_id) then
    raise exception 'ORGANIZATION_NOT_ACTIVE: المؤسسة غير نشطة' using errcode = 'P0001';
  end if;

  if p_jurisdiction not in ('EG_ETA', 'SA_ZATCA') then
    raise exception
      'EINVOICE_JURISDICTION_UNSUPPORTED: لا يوجد محوّل لهذه الولاية الضريبية بعد (%)', p_jurisdiction
      using errcode = '22023';
  end if;

  if p_environment not in ('SANDBOX', 'PRODUCTION') then
    raise exception 'EINVOICE_ENVIRONMENT_INVALID: بيئة غير صحيحة' using errcode = '22023';
  end if;

  -- The legal identity must exist before an integration profile may reference
  -- it. Without this the profile becomes the de-facto source again, which is
  -- exactly what this migration exists to stop.
  select nullif(btrim(tax_id), '') into v_org_tax_id
  from public.organizations where id = p_organization_id;

  if v_org_tax_id is null then
    raise exception
      'EINVOICE_LEGAL_IDENTITY_MISSING: لم يُسجَّل الرقم الضريبي للمؤسسة؛ سجّله أولًا قبل إعداد الفوترة الإلكترونية'
      using errcode = 'P0001';
  end if;

  -- Supplying nothing inherits the legal identity; supplying something must
  -- agree with it. No documented-exception mechanism exists yet, so a mismatch
  -- is refused rather than accepted with a warning.
  v_effective_tax_id := coalesce(nullif(btrim(p_taxpayer_id), ''), v_org_tax_id);

  if v_effective_tax_id <> v_org_tax_id then
    raise exception
      'EINVOICE_IDENTITY_CONFLICT: الرقم الضريبي للملف (%) يخالف الرقم المسجّل للمؤسسة (%)',
      v_effective_tax_id, v_org_tax_id
      using errcode = '22023';
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
      v_effective_tax_id, p_branch_code, p_activity_code, 'DRAFT', false, auth.uid(), auth.uid()
    )
    returning id into v_id;
    return v_id;
  end if;

  -- Invalidation now keys off the EFFECTIVE identity. In practice the
  -- organization trigger below already handles a legal-identity change; this
  -- remains as the local guard for the same property.
  v_identity_changed := coalesce(v_existing.taxpayer_id, '') <> v_effective_tax_id;

  update public.einvoice_profiles
  set taxpayer_id = v_effective_tax_id,
      branch_code = p_branch_code,
      activity_code = p_activity_code,
      property_id = coalesce(p_property_id, property_id),
      updated_by = auth.uid(),
      status = case when v_identity_changed then 'DRAFT' else status end,
      enabled = case when v_identity_changed then false else enabled end,
      verified_at = case when v_identity_changed then null else verified_at end,
      last_verification_error = case
        when v_identity_changed
        then 'تغيّرت الهوية الضريبية؛ يلزم إعادة التحقق'
        else last_verification_error end
  where id = v_existing.id
  returning id into v_id;

  return v_id;
end;
$$;

-- Reactive invalidation. A verification proves that a specific taxpayer's
-- credentials work; changing who the taxpayer IS must void it, and that change
-- happens on the organization, not on the profile. Without this a profile could
-- stay ACTIVE while pointing at an identity nobody verified.
create or replace function public.trg_organizations_tax_identity_changed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  update public.einvoice_profiles
  set taxpayer_id = nullif(btrim(NEW.tax_id), ''),
      status = 'DRAFT',
      enabled = false,
      verified_at = null,
      last_verification_error = 'تغيّر الرقم الضريبي للمؤسسة؛ يلزم إعادة التحقق'
  where organization_id = NEW.id;

  return NEW;
end;
$$;

drop trigger if exists trg_organizations_tax_identity_changed on public.organizations;
-- WHEN clause keeps this free for the overwhelming majority of organization
-- updates, which never touch tax_id.
create trigger trg_organizations_tax_identity_changed
  after update on public.organizations
  for each row
  when (OLD.tax_id is distinct from NEW.tax_id)
  execute function public.trg_organizations_tax_identity_changed();

-- The submission gate. Refuses a document whose profile identity no longer
-- agrees with the organization's, in addition to the existing ACTIVE check.
--
-- NOT IMPLEMENTED HERE, and deliberately so: refusing on a REVIEW_REQUIRED
-- classification or service provider. Revenue-nature classification does not
-- exist yet (decision 0008 is unapproved), so there is nothing to read. Adding
-- a check against a table that does not exist would be theatre; the rule stays
-- recorded in ADR 0002 and lands with the classification itself.
create or replace function public.claim_einvoice_document(
  p_profile_id uuid,
  p_source_type text,
  p_source_id uuid,
  p_document_type text default 'INVOICE'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_profile record;
  v_org_tax_id text;
  v_id uuid;
  v_status text;
begin
  select * into v_profile from public.einvoice_profiles where id = p_profile_id;
  if v_profile.id is null then
    raise exception 'EINVOICE_PROFILE_NOT_FOUND: ملف التسجيل غير موجود' using errcode = 'P0002';
  end if;

  if not public.has_permission(auth.uid(), v_profile.organization_id, 'finance.einvoice.manage') then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: غير مصرح لك بإرسال الفواتير الإلكترونية' using errcode = '42501';
  end if;

  if v_profile.status <> 'ACTIVE' or not v_profile.enabled then
    raise exception
      'EINVOICE_PROFILE_NOT_ACTIVE: لم يُفعَّل التسجيل لدى مصلحة الضرائب بعد؛ تحقّق من بيانات الاعتماد أولًا'
      using errcode = 'P0001';
  end if;

  select nullif(btrim(tax_id), '') into v_org_tax_id
  from public.organizations where id = v_profile.organization_id;

  if v_org_tax_id is null then
    raise exception
      'EINVOICE_LEGAL_IDENTITY_MISSING: لا يمكن الإرسال بلا رقم ضريبي مسجّل للمؤسسة'
      using errcode = 'P0001';
  end if;

  if coalesce(v_profile.taxpayer_id, '') <> v_org_tax_id then
    raise exception
      'EINVOICE_IDENTITY_CONFLICT: هوية الملف الضريبية تخالف هوية المؤسسة؛ لا يمكن الإرسال'
      using errcode = 'P0001';
  end if;

  select id, status into v_id, v_status
  from public.einvoice_documents
  where profile_id = p_profile_id and source_type = p_source_type and source_id = p_source_id;

  if v_id is not null then
    if v_status in ('ACCEPTED', 'SUBMITTED') then
      raise exception
        'EINVOICE_ALREADY_FILED: هذا المستند مُرسَل بالفعل (%)', v_status using errcode = 'P0001';
    end if;
    return v_id;
  end if;

  insert into public.einvoice_documents (
    organization_id, profile_id, source_type, source_id, document_type,
    idempotency_key, created_by
  ) values (
    v_profile.organization_id, p_profile_id, p_source_type, p_source_id, p_document_type,
    p_profile_id::text || ':' || p_source_type || ':' || p_source_id::text,
    auth.uid()
  )
  returning id into v_id;

  return v_id;
end;
$$;
