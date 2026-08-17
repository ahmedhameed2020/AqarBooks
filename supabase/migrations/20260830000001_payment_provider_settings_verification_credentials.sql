-- Task 4 (Payment Provider Settings UI) -- "Test connection" needs to read
-- decrypted credentials for a settings row BEFORE it's enabled (that's the
-- entire point of testing it), but get_payment_provider_credentials
-- deliberately requires enabled=true (its only caller is the payment
-- runtime resolver, lib/payments/resolve-credentials.ts, which must never
-- return credentials for a not-yet-enabled row). Rather than weaken that
-- function's contract, this is a separate, narrowly-scoped RPC used only
-- by the connection-test flow: keyed by settings_id (not
-- org/resort/provider/environment), self-permission-checked (unlike
-- get_payment_provider_credentials, which is service-role-only and trusts
-- its caller), and works regardless of status.
create or replace function public.get_payment_provider_settings_credentials(p_settings_id uuid)
returns table(api_key text, hmac_secret text)
language plpgsql
security definer
set search_path = public, vault
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

  return query
    select
      (select decrypted_secret from vault.decrypted_secrets where id = v_row.api_key_secret_id),
      (select decrypted_secret from vault.decrypted_secrets where id = v_row.hmac_secret_id);
end;
$$;

revoke all on function public.get_payment_provider_settings_credentials(uuid) from public, anon;
grant execute on function public.get_payment_provider_settings_credentials(uuid) to authenticated;
