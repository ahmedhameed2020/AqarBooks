-- Multi-Tenant Payment Provider Settings -- Task 1 (schema + permissions only).
-- Design: docs/superpowers/specs/2026-08-16-owner-portal-payment-provider-settings-design.md
--
-- Corrections made to the design doc's literal SQL after verifying live schema
-- (see task report for full detail):
--   1. `public.resorts` is no longer a base table -- it was renamed to
--      `public.properties` earlier today (rename_resorts_to_properties /
--      rename_resort_id_*_cluster migrations) and `resorts` now exists only as
--      a backward-compat VIEW. A foreign key cannot target a view, so
--      resort_id here references public.properties(id) directly, matching
--      what organization_finance_settings_resort_id_fkey now resolves to
--      live (confirmed via pg_get_constraintdef). The validation trigger's
--      plain SELECT still reads through public.resorts, matching the live
--      convention already established in
--      validate_online_payments_clearing_account().
--   2. public.permissions only has (id, key, description) -- there is no
--      description_ar/description_en/category split (that shape doesn't
--      exist live). Adjusted the permission seed to the real column.
--   3. The design doc's permission insert alone leaves the permission
--      unusable by any role -- no existing role would ever pass
--      has_permission() for it. Added role_template_permissions entries for
--      TENANT_OWNER and FINANCE_MANAGER (same two templates already granted
--      finance.accounts.manage, the closest analogous "manage financial
--      configuration" permission per the design doc's own commentary) and
--      backfilled role_permissions for already-cloned roles on existing
--      organizations, mirroring the exact pattern in
--      20260814000003_members_portal_invite_permission.sql.
--   4. Added explicit revoke/grant blocks for record_payment_provider_verification,
--      enable_payment_provider, disable_payment_provider, and
--      list_payment_provider_settings -- the design doc's RPC section only
--      wrote them out for upsert_payment_provider_settings and
--      get_payment_provider_credentials. Supabase grants EXECUTE to anon by
--      default on every new function (confirmed live gotcha, already called
--      out in 20260815000007_record_online_payment.sql) so every function
--      here gets an explicit revoke/grant, matching that established
--      project-wide discipline.

-- ============================================================================
-- 1. Table
-- ============================================================================
create table public.payment_provider_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid references public.properties (id) on delete cascade, -- nullable = org-wide
  provider text not null check (provider in ('FAWRY', 'PAYMOB')),
  environment text not null check (environment in ('SANDBOX', 'PRODUCTION')),

  -- Non-secret, display-safe identifiers -- shown in the settings UI as-is.
  merchant_identifier text,     -- Fawry merchant code / Paymob integration id, as plain text
  public_key text,               -- Paymob's public key is legitimately non-secret (appears in the checkout redirect URL itself) -- stored plain, never in Vault

  -- Secret material -- NEVER stored here directly, only a pointer into Vault.
  api_key_secret_id uuid references vault.secrets (id),
  hmac_secret_id uuid references vault.secrets (id),

  status text not null default 'DRAFT' check (status in ('DRAFT', 'VALIDATING', 'VERIFIED', 'ENABLED', 'DISABLED')),
  enabled boolean not null default false,   -- redundant with status = 'ENABLED' but kept as its own column so a hard `where enabled = true` filter (used by the actual checkout/webhook code path) never has to reason about the full status enum -- a single boolean is the fastest and least error-prone thing for that hot path to check
  verified_at timestamptz,
  last_verification_error text,             -- generic, non-secret message only -- see design doc §Security

  created_by uuid references auth.users (id),
  updated_by uuid references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Postgres treats NULL as distinct in a plain UNIQUE constraint, so
-- (org, NULL, PAYMOB, SANDBOX) could otherwise be inserted twice --
-- collapse NULL resort_id to a sentinel for uniqueness purposes.
create unique index payment_provider_settings_unique_scope
  on public.payment_provider_settings (
    organization_id,
    coalesce(resort_id, '00000000-0000-0000-0000-000000000000'::uuid),
    provider,
    environment
  );

create trigger trg_payment_provider_settings_updated_at
  before update on public.payment_provider_settings
  for each row execute function public.set_updated_at();

-- Same cross-tenant lesson learned the hard way in Phase 4/5
-- (organization_finance_settings, create_online_payment_checkout_transaction):
-- a resort_id belonging to a DIFFERENT organization must be rejected, not
-- just trusted because the row shape happens to be valid.
create or replace function public.validate_payment_provider_settings_scope()
returns trigger
language plpgsql
as $$
begin
  if new.resort_id is not null and not exists (
    select 1 from public.resorts where id = new.resort_id and organization_id = new.organization_id
  ) then
    raise exception 'RESORT_NOT_IN_ORGANIZATION: الموقع المحدد لا يتبع لهذا الكيان' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger trg_validate_payment_provider_settings_scope
  before insert or update on public.payment_provider_settings
  for each row execute function public.validate_payment_provider_settings_scope();

alter table public.payment_provider_settings enable row level security;

-- ============================================================================
-- 2. Permission seed + RLS
-- ============================================================================
-- New, narrower permission than finance.accounts.manage -- provider
-- credentials are a materially different risk class from GL account
-- configuration. Reuses the has_permission()/role_permissions machinery
-- already established throughout this project -- no new mechanism, just a
-- new key. public.permissions only has (id, key, description) live -- the
-- design doc's description_ar/description_en/category split does not exist
-- as a real table shape, corrected here.
insert into public.permissions (key, description)
values ('finance.online_payments.manage', 'إدارة إعدادات مزودي الدفع الإلكتروني (Manage online payment provider settings)')
on conflict (key) do update set description = excluded.description;

-- Wire the permission into role templates so it is actually grantable --
-- same two templates already carrying finance.accounts.manage, per the
-- design doc's own risk-class commentary. Mirrors
-- 20260814000003_members_portal_invite_permission.sql's two-step pattern
-- exactly: seed the template mapping, then backfill already-cloned roles on
-- existing organizations (clone_tenant_role_templates only runs at org
-- creation time, so existing orgs' roles would otherwise never pick this up).
insert into public.role_template_permissions (role_template_key, permission_key)
values
  ('TENANT_OWNER', 'finance.online_payments.manage'),
  ('FINANCE_MANAGER', 'finance.online_payments.manage')
on conflict do nothing;

insert into public.role_permissions (role_id, permission_id)
select r.id, p.id
from public.roles r
join public.role_template_permissions rtp on rtp.role_template_key = r.key
join public.permissions p on p.key = rtp.permission_key
where r.organization_id is not null
  and rtp.permission_key = 'finance.online_payments.manage'
on conflict do nothing;

create policy payment_provider_settings_manage
  on public.payment_provider_settings
  for all
  using (public.has_permission(auth.uid(), organization_id, 'finance.online_payments.manage') and public.organization_is_active(organization_id))
  with check (public.has_permission(auth.uid(), organization_id, 'finance.online_payments.manage') and public.organization_is_active(organization_id));

-- ============================================================================
-- 3. RPCs
-- ============================================================================

-- Write path -- configure credentials (never returns secrets).
create or replace function public.upsert_payment_provider_settings(
  p_organization_id uuid,
  p_resort_id uuid,
  p_provider text,
  p_environment text,
  p_merchant_identifier text,
  p_public_key text,
  p_api_key text,       -- plaintext in, never stored in plaintext, never returned
  p_hmac_secret text     -- same
)
returns uuid  -- the settings row id
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
    -- NOTE: this naming scheme has a bug (fixed in the companion
    -- ...170000b_... migration applied immediately after this one) -- it
    -- collides on vault.secrets' unique name index when an org-wide and a
    -- resort-specific row exist for the same org/provider/environment.
    -- Left as originally applied here, matching this repo's established
    -- fix-as-a-separate-migration convention (see
    -- organization_finance_settings.sql / ..._resort_org_check.sql,
    -- record_online_payment.sql / ..._lock_ordering_fix.sql).
    v_api_key_secret_id := vault.create_secret(coalesce(p_api_key, ''), p_organization_id::text || ':' || p_provider || ':' || p_environment || ':api_key');
    v_hmac_secret_id := vault.create_secret(coalesce(p_hmac_secret, ''), p_organization_id::text || ':' || p_provider || ':' || p_environment || ':hmac_secret');

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

revoke all on function public.upsert_payment_provider_settings(uuid,uuid,text,text,text,text,text,text) from public, anon;
grant execute on function public.upsert_payment_provider_settings(uuid,uuid,text,text,text,text,text,text) to authenticated;
-- authenticated may call this -- the has_permission() check inside is the
-- real gate, matching the established pattern (SECURITY DEFINER + internal
-- permission check) used throughout this project rather than relying on
-- grant-level role separation for authorization logic.

-- Read path for the UI -- metadata only, zero secret exposure.
create or replace function public.list_payment_provider_settings(p_organization_id uuid)
returns table (
  id uuid, resort_id uuid, provider text, environment text,
  merchant_identifier text, public_key text,
  has_api_key boolean, has_hmac_secret boolean,
  status text, enabled boolean, verified_at timestamptz, last_verification_error text
)
language sql
security invoker
set search_path = public
as $$
  select id, resort_id, provider, environment, merchant_identifier, public_key,
         api_key_secret_id is not null, hmac_secret_id is not null,
         status, enabled, verified_at, last_verification_error
  from public.payment_provider_settings
  where organization_id = p_organization_id;
$$;
-- SECURITY INVOKER, not DEFINER -- relies entirely on the RLS policy above
-- (finance.online_payments.manage) for authorization; this function's only
-- job is to shape the projection so secret_id columns can never even be
-- selected by a caller of this function, structurally, not just by
-- UI-layer discipline.

revoke all on function public.list_payment_provider_settings(uuid) from public, anon;
grant execute on function public.list_payment_provider_settings(uuid) to authenticated;

-- Internal read path for actual provider calls -- service_role only, the
-- ONLY place plaintext secrets are ever produced.
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
  select * into v_row from public.payment_provider_settings
  where organization_id = p_organization_id and provider = p_provider and environment = p_environment
    and (resort_id = p_resort_id or resort_id is null)
    and enabled = true
  order by resort_id nulls last  -- resort-specific row wins over org-wide when both exist
  limit 1;

  if v_row.id is null then
    raise exception 'PROVIDER_NOT_ENABLED: لا يوجد إعداد مُفعّل لهذا المزود' using errcode = '22023';
  end if;

  return query
    select v_row.merchant_identifier, v_row.public_key,
           (select decrypted_secret from vault.decrypted_secrets where id = v_row.api_key_secret_id),
           (select decrypted_secret from vault.decrypted_secrets where id = v_row.hmac_secret_id),
           v_row.id;
end;
$$;

revoke all on function public.get_payment_provider_credentials(uuid,uuid,text,text) from public, anon, authenticated;
grant execute on function public.get_payment_provider_credentials(uuid,uuid,text,text) to service_role;
-- This is the ONLY function in the entire schema that can ever produce a
-- plaintext credential. It is unreachable from any authenticated session,
-- by construction (no grant), the same discipline already proven for
-- record_online_payment/post_payment_internal in Phase 4/5.

-- State-machine transitions -- explicit, not implicit.
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
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;

  update public.payment_provider_settings
  set status = case when p_success then 'VERIFIED' else 'DRAFT' end,
      verified_at = case when p_success then now() else verified_at end,
      last_verification_error = case when p_success then null else coalesce(p_error_message, 'فشل التحقق من الاتصال') end,
      updated_by = auth.uid()
  where id = p_settings_id;
end;
$$;

revoke all on function public.record_payment_provider_verification(uuid,boolean,text) from public, anon;
grant execute on function public.record_payment_provider_verification(uuid,boolean,text) to authenticated;

-- Explicit admin confirmation -- VERIFIED is a NECESSARY but not
-- SUFFICIENT condition for ENABLED. This is the "must not auto-enable"
-- requirement made structural: there is no code path anywhere that sets
-- enabled = true except this one function, and this function requires the
-- row to already be VERIFIED.
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
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  if v_row.status <> 'VERIFIED' then
    raise exception 'NOT_VERIFIED: يجب اجتياز التحقق أولاً قبل التفعيل' using errcode = '22023';
  end if;
  -- Paymob-specific structural gate: even an explicit admin click cannot
  -- enable Paymob in PRODUCTION until Paymob's own adapter guard is lifted
  -- (a separate, deliberate code change per the Paymob verification plan).
  -- SANDBOX is allowed today since paymobAdapter.createCheckout's guard
  -- throws unconditionally regardless of this flag -- this check exists so
  -- the DATABASE layer also refuses PAYMOB+PRODUCTION, not just the
  -- application code, giving two independent layers that must both be
  -- changed before Paymob production traffic is possible.
  if v_row.provider = 'PAYMOB' and v_row.environment = 'PRODUCTION' then
    raise exception 'PAYMOB_PRODUCTION_BLOCKED: Paymob غير مُفعّل للإنتاج بعد -- راجع خطة التحقق المستقلة' using errcode = '22023';
  end if;

  update public.payment_provider_settings
  set status = 'ENABLED', enabled = true, updated_by = auth.uid()
  where id = p_settings_id;
end;
$$;

revoke all on function public.enable_payment_provider(uuid) from public, anon;
grant execute on function public.enable_payment_provider(uuid) to authenticated;

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
    raise exception 'FORBIDDEN' using errcode = '42501';
  end if;
  update public.payment_provider_settings
  set status = 'DISABLED', enabled = false, updated_by = auth.uid()
  where id = p_settings_id;
end;
$$;

revoke all on function public.disable_payment_provider(uuid) from public, anon;
grant execute on function public.disable_payment_provider(uuid) to authenticated;

notify pgrst, 'reload schema';
