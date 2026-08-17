-- deferred_payment_provider_merchant_identifier_reverify: upsert_payment_provider_settings
-- only reset status/enabled/verified_at when a SECRET changed
-- (v_secrets_changed). Editing merchant_identifier or public_key alone on an
-- already-ENABLED row left status/enabled untouched -- but merchant_identifier
-- is a real field sent in live Fawry charge requests (merchantCode), so a
-- change to it should require re-verification just like a secret change.
--
-- Renamed v_secrets_changed -> v_needs_reverify and folded in a comparison
-- against the existing row's merchant_identifier/public_key (IS DISTINCT
-- FROM, so NULL-safe). Secret handling, the DRAFT-on-create path, Vault
-- calls, and every other branch are unchanged.
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
set search_path to 'public', 'extensions', 'vault'
as $$
declare
  v_settings_id uuid;
  v_existing public.payment_provider_settings;
  v_api_key_secret_id uuid;
  v_hmac_secret_id uuid;
  v_needs_reverify boolean := false;
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
    and coalesce(property_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_resort_id, '00000000-0000-0000-0000-000000000000'::uuid)
    and provider = p_provider and environment = p_environment;

  if v_existing.id is not null then
    v_settings_id := v_existing.id;
    if p_api_key is not null and p_api_key <> '' then
      perform vault.update_secret(v_existing.api_key_secret_id, p_api_key);
      v_needs_reverify := true;
    end if;
    if p_hmac_secret is not null and p_hmac_secret <> '' then
      perform vault.update_secret(v_existing.hmac_secret_id, p_hmac_secret);
      v_needs_reverify := true;
    end if;
    if p_merchant_identifier is distinct from v_existing.merchant_identifier then
      v_needs_reverify := true;
    end if;
    if p_public_key is distinct from v_existing.public_key then
      v_needs_reverify := true;
    end if;

    update public.payment_provider_settings
    set merchant_identifier = p_merchant_identifier,
        public_key = p_public_key,
        updated_by = auth.uid(),
        status = case when v_needs_reverify then 'DRAFT' else status end,
        enabled = case when v_needs_reverify then false else enabled end,
        verified_at = case when v_needs_reverify then null else verified_at end
    where id = v_settings_id;
  else
    v_api_key_secret_id := vault.create_secret(coalesce(p_api_key, ''), p_organization_id::text || ':' || coalesce(p_resort_id::text, '00000000-0000-0000-0000-000000000000') || ':' || p_provider || ':' || p_environment || ':api_key');
    v_hmac_secret_id := vault.create_secret(coalesce(p_hmac_secret, ''), p_organization_id::text || ':' || coalesce(p_resort_id::text, '00000000-0000-0000-0000-000000000000') || ':' || p_provider || ':' || p_environment || ':hmac_secret');

    insert into public.payment_provider_settings (
      organization_id, property_id, provider, environment, merchant_identifier, public_key,
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
