-- Code review fixes for Task 1 (payment_provider_settings):
--
-- 1. organization_is_active() was never checked inside the 4 write RPCs.
--    SECURITY DEFINER functions bypass RLS on their own internal
--    reads/writes, so the RLS policy's organization_is_active(organization_id)
--    clause (already present in payment_provider_settings_manage's
--    USING/WITH CHECK) is effectively decorative for writes routed through
--    these RPCs -- a member of a SUSPENDED/ARCHIVED organization could still
--    configure/verify/enable/disable payment credentials. Same established
--    pattern as post_payment_internal
--    (supabase/migrations/20260815000006_post_payment_internal.sql:49).
-- 2. last_verification_error had no length cap -- the "generic message
--    only, never raw provider response" guarantee currently lives entirely
--    in the not-yet-written Task 2 server action, with zero enforcement at
--    the RPC layer that actually persists it (RLS-readable to anyone with
--    finance.online_payments.manage). Capped defensively with left(..., 500)
--    rather than a table CHECK constraint, since truncation is the right
--    behavior here, not outright rejection of the whole call.
-- 3. Minor: normalized the bare 'FORBIDDEN' raises to the same bilingual
--    style already used in upsert_payment_provider_settings.

create or replace function public.upsert_payment_provider_settings(
  p_organization_id uuid,
  p_resort_id uuid,
  p_provider text,
  p_environment text,
  p_merchant_identifier text,
  p_public_key text,
  p_api_key text,
  p_hmac_secret text
)
returns uuid
language plpgsql
security definer
set search_path = public, extensions, vault
as $$
declare
  v_settings_id uuid;
  v_existing public.payment_provider_settings;
  v_api_key_secret_id uuid;
  v_hmac_secret_id uuid;
  v_secrets_changed boolean := false;
begin
  if not public.has_permission(auth.uid(), p_organization_id, 'finance.online_payments.manage') then
    raise exception 'FORBIDDEN: لا تملك صلاحية إدارة مزودي الدفع' using errcode = '42501';
  end if;
  if not public.organization_is_active(p_organization_id) then
    raise exception 'ORGANIZATION_INACTIVE: الكيان غير نشط' using errcode = '22023';
  end if;
  if p_provider not in ('FAWRY', 'PAYMOB') then
    raise exception 'INVALID_PROVIDER' using errcode = '22023';
  end if;
  if p_environment not in ('SANDBOX', 'PRODUCTION') then
    raise exception 'INVALID_ENVIRONMENT' using errcode = '22023';
  end if;

  select * into v_existing from public.payment_provider_settings
  where organization_id = p_organization_id
    and coalesce(resort_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_resort_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and provider = p_provider and environment = p_environment;

  if v_existing.id is not null then
    v_settings_id := v_existing.id;
    if p_api_key is not null and p_api_key <> '' then
      perform vault.update_secret(v_existing.api_key_secret_id, p_api_key);
      v_secrets_changed := true;
    end if;
    if p_hmac_secret is not null and p_hmac_secret <> '' then
      perform vault.update_secret(v_existing.hmac_secret_id, p_hmac_secret);
      v_secrets_changed := true;
    end if;

    update public.payment_provider_settings
    set merchant_identifier = p_merchant_identifier,
        public_key = p_public_key,
        updated_by = auth.uid(),
        status = case when v_secrets_changed then 'DRAFT' else status end,
        enabled = case when v_secrets_changed then false else enabled end,
        verified_at = case when v_secrets_changed then null else verified_at end
    where id = v_settings_id;
  else
    v_api_key_secret_id := vault.create_secret(coalesce(p_api_key, ''), p_organization_id::text || ':' || coalesce(p_resort_id::text, '00000000-0000-0000-0000-000000000000') || ':' || p_provider || ':' || p_environment || ':api_key');
    v_hmac_secret_id := vault.create_secret(coalesce(p_hmac_secret, ''), p_organization_id::text || ':' || coalesce(p_resort_id::text, '00000000-0000-0000-0000-000000000000') || ':' || p_provider || ':' || p_environment || ':hmac_secret');

    insert into public.payment_provider_settings (
      organization_id, resort_id, provider, environment, merchant_identifier, public_key,
      api_key_secret_id, hmac_secret_id, status, enabled, created_by, updated_by
    ) values (
      p_organization_id, p_resort_id, p_provider, p_environment, p_merchant_identifier, p_public_key,
      v_api_key_secret_id, v_hmac_secret_id, 'DRAFT', false, auth.uid(), auth.uid()
    )
    returning id into v_settings_id;
  end if;

  return v_settings_id;
end;
$$;

create or replace function public.record_payment_provider_verification(
  p_settings_id uuid,
  p_success boolean,
  p_error_message text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select organization_id into v_org_id from public.payment_provider_settings where id = p_settings_id;
  if v_org_id is null or not public.has_permission(auth.uid(), v_org_id, 'finance.online_payments.manage') then
    raise exception 'FORBIDDEN: لا تملك صلاحية إدارة مزودي الدفع' using errcode = '42501';
  end if;
  if not public.organization_is_active(v_org_id) then
    raise exception 'ORGANIZATION_INACTIVE: الكيان غير نشط' using errcode = '22023';
  end if;

  update public.payment_provider_settings
  set status = case when p_success then 'VERIFIED' else 'DRAFT' end,
      verified_at = case when p_success then now() else verified_at end,
      last_verification_error = case when p_success then null else coalesce(left(p_error_message, 500), 'فشل التحقق من الاتصال') end,
      updated_by = auth.uid()
  where id = p_settings_id;
end;
$$;

create or replace function public.enable_payment_provider(p_settings_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.payment_provider_settings;
begin
  select * into v_row from public.payment_provider_settings where id = p_settings_id;
  if v_row.id is null or not public.has_permission(auth.uid(), v_row.organization_id, 'finance.online_payments.manage') then
    raise exception 'FORBIDDEN: لا تملك صلاحية إدارة مزودي الدفع' using errcode = '42501';
  end if;
  if not public.organization_is_active(v_row.organization_id) then
    raise exception 'ORGANIZATION_INACTIVE: الكيان غير نشط' using errcode = '22023';
  end if;
  if v_row.status <> 'VERIFIED' then
    raise exception 'NOT_VERIFIED: يجب اجتياز التحقق أولاً قبل التفعيل' using errcode = '22023';
  end if;
  if v_row.provider = 'PAYMOB' and v_row.environment = 'PRODUCTION' then
    raise exception 'PAYMOB_PRODUCTION_BLOCKED: Paymob غير مُفعّل للإنتاج بعد -- راجع خطة التحقق المستقلة' using errcode = '22023';
  end if;

  update public.payment_provider_settings
  set status = 'ENABLED', enabled = true, updated_by = auth.uid()
  where id = p_settings_id;
end;
$$;

create or replace function public.disable_payment_provider(p_settings_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
begin
  select organization_id into v_org_id from public.payment_provider_settings where id = p_settings_id;
  if v_org_id is null or not public.has_permission(auth.uid(), v_org_id, 'finance.online_payments.manage') then
    raise exception 'FORBIDDEN: لا تملك صلاحية إدارة مزودي الدفع' using errcode = '42501';
  end if;
  if not public.organization_is_active(v_org_id) then
    raise exception 'ORGANIZATION_INACTIVE: الكيان غير نشط' using errcode = '22023';
  end if;
  update public.payment_provider_settings
  set status = 'DISABLED', enabled = false, updated_by = auth.uid()
  where id = p_settings_id;
end;
$$;

notify pgrst, 'reload schema';
