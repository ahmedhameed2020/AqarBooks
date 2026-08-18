-- Narrow profile creation to jurisdictions that actually have an adapter.
--
-- upsert_einvoice_profile accepted AE_PEPPOL because the column's CHECK does.
-- The screen never offered it, but relying on a UI not to show something is not
-- a control: an API caller could create an Emirati profile that no adapter can
-- ever file for. It was inert — no adapter means no verification, and
-- claim_einvoice_document refuses a non-ACTIVE profile — but inert is not the
-- same as refused, and a settings row that can never do anything is a support
-- ticket waiting to happen.
--
-- The column CHECK deliberately still permits AE_PEPPOL. Widening the write
-- path later should be a one-line change here plus an adapter, not a schema
-- migration; the schema describes what the ledger CAN hold, this function
-- decides what may be created today.
--
-- Single source of truth on the TypeScript side is lib/einvoice/registry.ts,
-- whose supportedJurisdictions() is derived from the adapter map itself and now
-- drives the settings screen. These two lists must be changed together, and the
-- e2e spec asserts an API session cannot get ahead of this one.

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

  -- Only jurisdictions with a working adapter. Keep in step with
  -- lib/einvoice/registry.ts.
  if p_jurisdiction not in ('EG_ETA', 'SA_ZATCA') then
    raise exception
      'EINVOICE_JURISDICTION_UNSUPPORTED: لا يوجد محوّل لهذه الولاية الضريبية بعد (%)', p_jurisdiction
      using errcode = '22023';
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
