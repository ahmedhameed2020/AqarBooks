-- Task 2 (resolver) prerequisite: get_payment_provider_credentials must be
-- able to distinguish "no row exists at all for this scope" from "a row
-- exists but isn't enabled" -- the resolver's fallback-to-legacy-env rule
-- (docs/superpowers/specs/2026-08-16-owner-portal-payment-provider-settings-design.md)
-- depends on this distinction: a tenant that configured (even incompletely)
-- their own credentials must NEVER silently fall back to someone else's
-- legacy env-var credentials, but a tenant with genuinely zero rows for
-- this scope legitimately should.
--
-- The previous version of this function (20260816170000_..._schema.sql)
-- filtered `and enabled = true` directly in the lookup query, so a DRAFT/
-- VERIFIED-but-not-ENABLED row and a genuinely absent row were
-- indistinguishable -- both raised PROVIDER_NOT_ENABLED. Fixed here per this
-- project's established "new migration file for a fix, don't edit the
-- applied one" convention (see 20260816170000b/c on this same table).
--
-- New behavior:
--   1. Lookup no longer filters on `enabled` -- finds ANY matching row,
--      resort-specific-then-org-wide precedence unchanged.
--   2. No row found at all -> NO_TENANT_SETTING (new error code; this is
--      the ONLY case the resolver may treat as "fall back to legacy env").
--   3. Row found but enabled = false -> PROVIDER_NOT_ENABLED (same message
--      as before, now only fires when a row genuinely exists).
--   4. Row found and enabled = true -> unchanged, decrypt and return.
create or replace function public.get_payment_provider_credentials(
  p_organization_id uuid,
  p_resort_id uuid,
  p_provider text,
  p_environment text
)
returns table (
  merchant_identifier text, public_key text, api_key text, hmac_secret text, settings_id uuid
)
language plpgsql
security definer
set search_path = public, vault
as $$
declare
  v_row public.payment_provider_settings;
begin
  -- Falls back from resort-specific to org-wide (resort_id is null) if no
  -- resort-specific row exists -- mirrors organization_finance_settings'
  -- own resort-or-org-wide account model from Phase 4/5, not a new pattern.
  -- No `enabled` filter here anymore -- see migration header comment.
  select * into v_row from public.payment_provider_settings
  where organization_id = p_organization_id and provider = p_provider and environment = p_environment
    and (resort_id = p_resort_id or resort_id is null)
  order by resort_id nulls last  -- resort-specific row wins over org-wide when both exist
  limit 1;

  if v_row.id is null then
    raise exception 'NO_TENANT_SETTING: لا يوجد إعداد لهذا الكيان' using errcode = '22023';
  end if;

  if not v_row.enabled then
    raise exception 'PROVIDER_NOT_ENABLED: لم يُفعّل هذا المزود بعد' using errcode = '22023';
  end if;

  return query
    select v_row.merchant_identifier, v_row.public_key,
           (select decrypted_secret from vault.decrypted_secrets where id = v_row.api_key_secret_id),
           (select decrypted_secret from vault.decrypted_secrets where id = v_row.hmac_secret_id),
           v_row.id;
end;
$$;

-- Signature is unchanged, so the existing revoke/grant (service_role only)
-- from 20260816170000_..._schema.sql still applies -- restated here for
-- clarity and to guard against a future migration accidentally widening it.
revoke all on function public.get_payment_provider_credentials(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.get_payment_provider_credentials(uuid,uuid,text,text) to service_role;

notify pgrst, 'reload schema';
