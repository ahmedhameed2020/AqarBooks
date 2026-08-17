-- Task 4 review fix -- close a real race: testPaymentProviderConnectionAction
-- reads credentials, runs a network probe (up to 8s), then calls this RPC to
-- record the result. If the settings row is edited (secret changed, disabled,
-- etc.) while that probe is in flight, the probe's eventual result was for
-- CREDENTIALS THAT NO LONGER APPLY -- writing VERIFIED unconditionally in that
-- case would mark a never-tested secret as verified, defeating the entire
-- point of the staged-activation workflow.
--
-- Fix: optional optimistic-concurrency check via updated_at (reliably bumped
-- on every write by the existing trg_payment_provider_settings_updated_at
-- trigger, confirmed live). p_expected_updated_at defaults to NULL so every
-- existing caller (supabase/tests/phase_payment_provider_settings.sql,
-- tests/pgtap.integration.test.ts's scenario 16) keeps working unchanged --
-- NULL means "skip the staleness check", exactly today's behavior. Only the
-- connection-test action is required to pass it.
--
-- No advisory lock: a lock only helps if held for the whole network probe,
-- which would mean holding a DB lock across an 8-second external HTTP call --
-- not appropriate here. The conditional UPDATE approach detects the
-- conflict after the fact without ever blocking a concurrent edit.
--
-- Adding a parameter (even with a default) changes this function's
-- identity-argument list, so CREATE OR REPLACE alone does NOT replace the
-- original 3-arg version -- it silently creates a second overload, which
-- then makes every 3-arg PostgREST call ambiguous (PGRST203, confirmed
-- live). Drop the old signature explicitly first.
drop function if exists public.record_payment_provider_verification(uuid, boolean, text);

create or replace function public.record_payment_provider_verification(
  p_settings_id uuid,
  p_success boolean,
  p_error_message text default null,
  p_expected_updated_at timestamptz default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org_id uuid;
  v_updated_rows int;
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
  where id = p_settings_id
    and (p_expected_updated_at is null or updated_at = p_expected_updated_at);

  get diagnostics v_updated_rows = row_count;
  if v_updated_rows = 0 and p_expected_updated_at is not null then
    -- The row changed after the probe started (secret edited, disabled,
    -- etc.) -- whatever state that concurrent write produced (DRAFT,
    -- DISABLED, ...) is left completely untouched. This probe's result is
    -- for credentials that no longer apply and must not be recorded.
    raise exception 'STALE_VERIFICATION: تغيّر الإعداد أثناء فحص الاتصال، يرجى إعادة المحاولة' using errcode = '22023';
  end if;
end;
$$;

-- Also return updated_at (captured atomically in the same SELECT as the
-- secrets themselves, the tightest possible window) so
-- testPaymentProviderConnectionAction can pass it straight into
-- record_payment_provider_verification above as p_expected_updated_at.
-- Still no secrets returned beyond what this function already returned;
-- this is purely additive.
drop function if exists public.get_payment_provider_settings_credentials(uuid);

create function public.get_payment_provider_settings_credentials(p_settings_id uuid)
returns table(api_key text, hmac_secret text, updated_at timestamptz)
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
      (select decrypted_secret from vault.decrypted_secrets where id = v_row.hmac_secret_id),
      v_row.updated_at;
end;
$$;

revoke all on function public.get_payment_provider_settings_credentials(uuid) from public, anon;
grant execute on function public.get_payment_provider_settings_credentials(uuid) to authenticated;
