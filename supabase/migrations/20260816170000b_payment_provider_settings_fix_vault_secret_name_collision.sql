-- Fix: vault.secrets.name has a unique index (secrets_name_idx). The
-- original naming scheme in ...170000_payment_provider_settings_schema.sql
-- (org:provider:env:api_key) collides between an org-wide row (resort_id
-- IS NULL) and a resort-specific row for the SAME org/provider/environment
-- -- confirmed live via a 23505 duplicate key error on secrets_name_idx
-- while testing requirement 7 (org-wide/resort-specific coexistence, see
-- supabase/tests/phase_payment_provider_settings.sql scenario 7). Folds
-- resort_id (or a sentinel for org-wide) into the secret name, matching the
-- exact same scoping the unique index on payment_provider_settings itself
-- already uses (payment_provider_settings_unique_scope).
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
    -- Only touch Vault if the caller actually supplied a new value --
    -- an empty/null p_api_key means "leave the existing key as-is" (the UI
    -- never round-trips the real secret back for editing, so "unchanged"
    -- must be expressible without resending the plaintext).
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
        -- Any secret change invalidates prior verification -- this is the
        -- explicit "changing a secret un-verifies the provider" requirement.
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

notify pgrst, 'reload schema';
