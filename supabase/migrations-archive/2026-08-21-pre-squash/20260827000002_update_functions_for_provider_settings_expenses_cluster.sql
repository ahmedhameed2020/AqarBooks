-- Phase 2g Group 2: update the index, trigger function, and the 4
-- functions with genuine column references for the
-- payment_provider_settings/expenses property_id rename.
--
-- enable_payment_provider, disable_payment_provider, and
-- record_payment_provider_verification also touch payment_provider_settings
-- but key entirely off id/organization_id and contain zero resort_id
-- references -- confirmed live, intentionally left unmodified.

-- 1) Rebuild the unique index (column-only change, name kept as-is per the
--    established convention of not renaming index/constraint names in
--    column-rename phases -- tracked separately as parameter/naming debt).
drop index if exists public.payment_provider_settings_unique_scope;
create unique index payment_provider_settings_unique_scope
  on public.payment_provider_settings
  using btree (organization_id, coalesce(property_id, '00000000-0000-0000-0000-000000000000'::uuid), provider, environment);

-- 2) Trigger function
create or replace function public.validate_payment_provider_settings_scope()
 returns trigger
 language plpgsql
as $function$
begin
  if new.property_id is not null and not exists (
    select 1 from public.resorts where id = new.property_id and organization_id = new.organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;
  return new;
end;
$function$;

-- 3) record_expense: only the INSERT column list changes. Every other
--    resort_id occurrence is the p_resort_id parameter name (unchanged,
--    matches Issue #15 convention) or the public.resorts compatibility-view
--    lookup (matches post_payment_internal precedent).
create or replace function public.record_expense(p_organization_id uuid, p_resort_id uuid, p_expense_category_id uuid, p_description text, p_amount numeric, p_expense_date date, p_payment_account_id uuid, p_fiscal_period_id uuid, p_cashier_session_id uuid DEFAULT NULL::uuid)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_expense_account_id uuid;
  v_entry_id uuid;
  v_expense_id uuid;
  v_voucher_number bigint;
  v_session public.cashier_sessions;
begin
  if p_resort_id is null then
    raise exception 'RESORT_REQUIRED: يرجى اختيار الموقع' using errcode = '22023';
  end if;

  if not exists (
    select 1 from public.resorts where id = p_resort_id and organization_id = p_organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;

  if not public.has_financial_permission(p_organization_id, 'finance.entries.create', p_resort_id) then
    raise exception 'FORBIDDEN_FINANCE_PERMISSION: لا تملك صلاحية تسجيل مصروف في هذا الموقع' using errcode = '42501';
  end if;

  if p_amount <= 0 then
    raise exception 'مبلغ يجب أن يكون أكبر من صفر';
  end if;

  select default_expense_account_id into v_expense_account_id
  from public.expense_categories where id = p_expense_category_id and organization_id = p_organization_id;
  if v_expense_account_id is null then
    raise exception 'expense category does not belong to this organization';
  end if;

  if p_cashier_session_id is not null then
    select * into v_session from public.cashier_sessions where id = p_cashier_session_id;
    if v_session.id is null or v_session.organization_id <> p_organization_id then
      raise exception 'cashier session does not belong to this organization';
    end if;
    if v_session.status <> 'OPEN' then
      raise exception 'cashier session is not open';
    end if;
    if not exists (
      select 1 from public.cashboxes where id = v_session.cashbox_id and gl_account_id = p_payment_account_id
    ) then
      raise exception 'payment account does not match this cashier session''s cashbox';
    end if;
  end if;

  -- Uses the _internal variants (see 20260813000005): the
  -- finance.entries.create check above already authorizes this whole
  -- atomic "record expense + post its own entry" action, so it doesn't
  -- re-demand finance.entries.post from the same caller.
  v_entry_id := public.create_journal_entry_internal(
    p_organization_id, p_resort_id, p_fiscal_period_id, p_expense_date,
    coalesce(p_description, 'Expense'), 'JOURNAL_VOUCHER',
    jsonb_build_array(
      jsonb_build_object('account_id', v_expense_account_id, 'debit', p_amount, 'credit', 0),
      jsonb_build_object('account_id', p_payment_account_id, 'debit', 0, 'credit', p_amount)
    ),
    null
  );
  perform public.post_journal_entry_internal(v_entry_id);

  v_voucher_number := public.next_sequence_value(p_organization_id, null, 'expense');

  insert into public.expenses (
    organization_id, property_id, expense_category_id, description, amount, expense_date,
    payment_account_id, voucher_number, journal_entry_id, cashier_session_id, created_by
  ) values (
    p_organization_id, p_resort_id, p_expense_category_id, p_description, p_amount, p_expense_date,
    p_payment_account_id, v_voucher_number, v_entry_id, p_cashier_session_id, auth.uid()
  )
  returning id into v_expense_id;

  if p_cashier_session_id is not null then
    insert into public.cash_transactions (organization_id, session_id, type, amount, description, created_by)
    values (p_organization_id, p_cashier_session_id, 'PAYMENT', p_amount, 'Expense ' || v_expense_id, auth.uid());
  end if;

  insert into public.platform_audit_logs (actor_id, organization_id, property_id, action, entity_type, entity_id, safe_change_summary)
  values (auth.uid(), p_organization_id, p_resort_id, 'expense.recorded', 'expense', v_expense_id,
    jsonb_build_object('amount', p_amount, 'voucher_number', v_voucher_number));

  return v_expense_id;
end;
$function$;

-- 4) upsert_payment_provider_settings: the lookup coalesce() and the
--    INSERT column list change. vault.create_secret's p_resort_id::text
--    usages (secret-naming strings) are parameter references, unchanged.
create or replace function public.upsert_payment_provider_settings(p_organization_id uuid, p_resort_id uuid, p_provider text, p_environment text, p_merchant_identifier text, p_public_key text, p_api_key text, p_hmac_secret text)
 returns uuid
 language plpgsql
 security definer
 set search_path to 'public', 'extensions', 'vault'
as $function$
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
    and coalesce(property_id, '00000000-0000-0000-0000-000000000000'::uuid) = coalesce(p_resort_id, '00000000-0000-0000-0000-000000000000'::uuid)
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
$function$;

-- 5) get_payment_provider_credentials: the lookup condition and ORDER BY
--    change.
create or replace function public.get_payment_provider_credentials(p_organization_id uuid, p_resort_id uuid, p_provider text, p_environment text)
 returns table(merchant_identifier text, public_key text, api_key text, hmac_secret text, settings_id uuid)
 language plpgsql
 security definer
 set search_path to 'public', 'vault'
as $function$
declare
  v_row public.payment_provider_settings;
begin
  select * into v_row from public.payment_provider_settings
  where organization_id = p_organization_id and provider = p_provider and environment = p_environment
    and (property_id = p_resort_id or property_id is null)
  order by property_id nulls last
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
$function$;

-- 6) list_payment_provider_settings: RETURNS TABLE column name and the
--    select list change. Zero app-code callers currently exist (confirmed
--    via repo-wide grep), so renaming the return column is safe.
create or replace function public.list_payment_provider_settings(p_organization_id uuid)
 returns table(id uuid, property_id uuid, provider text, environment text, merchant_identifier text, public_key text, has_api_key boolean, has_hmac_secret boolean, status text, enabled boolean, verified_at timestamp with time zone, last_verification_error text)
 language sql
 set search_path to 'public'
as $function$
  select id, property_id, provider, environment, merchant_identifier, public_key,
         api_key_secret_id is not null, hmac_secret_id is not null,
         status, enabled, verified_at, last_verification_error
  from public.payment_provider_settings
  where organization_id = p_organization_id;
$function$;
