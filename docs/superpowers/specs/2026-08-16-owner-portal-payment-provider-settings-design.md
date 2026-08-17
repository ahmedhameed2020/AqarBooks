# Multi-Tenant Payment Provider Settings — Design

**Date:** 2026-08-16
**Status:** Design, approved by project owner in the same message that specified it — proceeding directly to implementation (per the established pattern in this project when the owner's own message already contains a complete, concrete spec).
**Depends on:** Phase 5 (Fawry verified/complete, Paymob production-blocked) — this design does not change either provider's current guarantees; it adds a per-tenant credential-management layer on top.

## Goal

Every organization (optionally down to the resort/property level) configures its own Paymob/Fawry credentials through an admin-only settings screen, instead of one shared `.env.local`-based configuration for the whole app. Credentials are encrypted at rest via **Supabase Vault** (confirmed installed on the live project, unused until now — not raw `pgcrypto`, since a symmetric key stored in an app-visible env var doesn't meaningfully separate "who can read the encrypted row" from "who can also get the key"; Vault's master key lives outside the application schema entirely). A provider only becomes usable for real traffic after an explicit multi-step verification + admin-confirmation workflow — configuring credentials alone never activates anything.

## Encryption mechanism

`vault.create_secret(secret, name, description)` returns a `uuid`; the plaintext is never stored in `public.*`, only that `uuid` is. Decryption happens exclusively through `vault.decrypted_secrets` (a Vault-provided view), read only from inside a `SECURITY DEFINER` function granted to `service_role` alone — the same trust boundary already established for `record_online_payment`/`expire_stale_online_payment_transactions` in Phase 3/4/5. No authenticated-role RLS policy on `payment_provider_settings` ever exposes the secret UUID columns to a plain `select *` from the client — see §RLS below for the exact column-level enforcement.

## Schema

```sql
create table public.payment_provider_settings (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations (id) on delete cascade,
  resort_id uuid references public.resorts (id) on delete cascade, -- nullable = org-wide
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
  last_verification_error text,             -- generic, non-secret message only -- see §Security

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
```

## RLS — metadata only, secrets never reachable this way

```sql
-- New, narrower permission than finance.accounts.manage -- provider
-- credentials are a materially different risk class from GL account
-- configuration (a compromised finance.accounts.manage grant today can
-- reassign which GL account dues post to; it should NOT also mean "can see
-- which Fawry/Paymob merchant this org is wired to" unless explicitly
-- granted). Reuses the has_permission()/role_permissions machinery already
-- established throughout this project -- no new mechanism, just a new key.
insert into public.permissions (key, description_ar, description_en, category)
values ('finance.online_payments.manage', 'إدارة إعدادات مزودي الدفع الإلكتروني', 'Manage online payment provider settings', 'FINANCE')
on conflict (key) do nothing;

create policy payment_provider_settings_manage
  on public.payment_provider_settings
  for all
  using (public.has_permission(auth.uid(), organization_id, 'finance.online_payments.manage') and public.organization_is_active(organization_id))
  with check (public.has_permission(auth.uid(), organization_id, 'finance.online_payments.manage') and public.organization_is_active(organization_id));
```

**Critical property**: even a member with `finance.online_payments.manage` and full RLS `SELECT` access to this table only ever sees `api_key_secret_id`/`hmac_secret_id` as opaque UUIDs pointing into `vault.secrets` — RLS on `payment_provider_settings` does not and cannot grant access to `vault.decrypted_secrets` (a completely separate table/view with its own, much narrower grant, see below). The settings UI's server action for rendering the list never selects these two columns at all (masked as `••••••••` client-side is the WRONG place to enforce this — the right place is simply never fetching the plaintext-adjacent UUID into a context that could leak it; the client only ever needs to know "is a key configured," a boolean derivable from `api_key_secret_id is not null`).

## RPCs

### Write path — configure credentials (never returns secrets)

```sql
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
```

### Read path for the UI — metadata only, zero secret exposure

```sql
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
```

### Internal read path for actual provider calls — service_role only, the ONLY place plaintext secrets are ever produced

```sql
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
```

### State-machine transitions — explicit, not implicit

```sql
-- Called by the connection-test server action AFTER it has made a real,
-- live call to the provider's sandbox/production endpoint using the
-- decrypted credentials (Postgres cannot make outbound HTTPS calls without
-- pg_net, which is out of scope here -- the actual network probe happens
-- in the Next.js server action, this RPC only records the outcome).
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
  -- (a separate, deliberate code change per the Paymob verification plan --
  -- docs/superpowers/specs/2026-08-16-owner-portal-paymob-verification-plan.md).
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
```

## Adapter refactor — credentials as an explicit parameter, not an internal `getPaymentsEnv()` call

The current `fawryAdapter`/`paymobAdapter` call `getPaymentsEnv()` internally (Phase 5, Tasks 2-3). This design changes both adapters' `createCheckout`/`verifyWebhookSignature` to accept a `credentials` parameter instead:

```typescript
export interface ProviderCredentials {
  merchantIdentifier: string;
  publicKey: string | null;
  apiKey: string;
  hmacSecret: string;
}

// Adapter methods become pure functions of (input, credentials) --
// easier to test (no env-var stubbing needed), and the caller is now
// explicitly responsible for resolving WHICH credentials apply (per-tenant
// settings vs. the existing env-var-based dev/test fallback).
createCheckout(input: CreateCheckoutInput, credentials: ProviderCredentials): Promise<CreateCheckoutResult>
verifyWebhookSignature(ctx: WebhookRequestContext, credentials: ProviderCredentials): boolean
```

**Backward-compatible resolution, so nothing already verified breaks**: a new `lib/payments/resolve-credentials.ts` tries the per-tenant `get_payment_provider_credentials` RPC first; if it raises `PROVIDER_NOT_ENABLED` (no tenant has configured/enabled this provider yet), it falls back to `getPaymentsEnv()`'s existing env-var-based values — this is NOT the "provider fallback" the project owner explicitly forbade (that was about silently trying Fawry when Paymob was requested, or vice versa); this is a credential-*source* fallback for the SAME requested provider, needed only during the migration window before any tenant has configured real settings, and is itself covered by an explicit test proving the two sources never blend (either the tenant row is used in full, or the env vars are used in full, never a mix of fields from both).

## UI — settings screen

`app/[locale]/(app)/finance/payment-providers/page.tsx` (new, gated by `finance.online_payments.manage`, following the exact `has_permission`-check pattern already used by every other `finance/*` staff page). Per provider row: status badge (`غير مُعد`/`يحتاج تحقق`/`تم التحقق`/`مفعّل`/`موقوف` ↔ `DRAFT`/`DRAFT-with-error`/`VERIFIED`/`ENABLED`/`DISABLED`), environment, `merchant_identifier` (plain), masked secret fields (`••••••••` with a "replace" affordance — never round-trips the real value, matching `upsert_payment_provider_settings`'s "empty means unchanged" contract), last verified timestamp, `last_verification_error` (already generic/non-secret per the RPC's own message, safe to render as-is), and three actions: **Test connection**, **Enable** (disabled unless `status = 'VERIFIED'`), **Disable**.

**"Test connection" button** calls a new server action `testPaymentProviderConnectionAction(settingsId)` that: resolves credentials via `get_payment_provider_credentials` (service-role, server-only), makes ONE real lightweight probe against the provider's actual endpoint (Fawry: a harmless `GET`/`POST` against the staging/production base URL appropriate to the row's `environment`; Paymob: an auth-token request against `accept.paymob.com/api/auth/tokens` — cheap, doesn't create a real transaction), then calls `record_payment_provider_verification(settingsId, success, errorMessage)`. The error message surfaced to the UI must be generic (`"تعذر الاتصال بالمزود، تحقق من البيانات"` / `"Could not connect to the provider, check your credentials"`) — never the raw HTTP response body, which could itself carry sensitive request-echo data.

## Explicit non-goals (matching the project owner's "لا ينبغي فعله" list verbatim)

- No `.env`-per-tenant scheme — one shared `.env.local` remains for local dev/the credential-source-fallback path only, never a per-org env file.
- No shared secrets across organizations — every `payment_provider_settings` row is scoped to exactly one `organization_id` (+ optional `resort_id`), enforced by the unique index and the cross-tenant validation trigger.
- No storing keys directly on `organizations` — a dedicated table, Vault-backed.
- No automatic provider fallback (Fawry silently substituting for a misconfigured Paymob or vice versa) — `get_payment_provider_credentials` takes an explicit `p_provider` and raises if that exact provider/environment isn't enabled; it never tries a different provider.
- No picking "the first matching config" ambiguously — the resort-then-org-wide precedence is the ONLY resolution order, deterministic, documented above, and will be tested explicitly.
- No sending credentials to the client — `list_payment_provider_settings` structurally cannot return `api_key`/`hmac_secret`, only `has_api_key`/`has_hmac_secret` booleans; the only function that ever produces plaintext is `service_role`-only and unreachable from any browser session.
- No "credentials exist → enabled" shortcut — `enabled` only ever becomes `true` inside `enable_payment_provider`, which requires `status = 'VERIFIED'` first, which itself requires a real, successful connection test recorded by `record_payment_provider_verification`. Configuring credentials alone leaves a row in `DRAFT`.

## Implementation task breakdown (execution to follow immediately, same subagent-driven review cycle as every prior phase in this project)

1. Schema migration (table, indexes, triggers, RLS, permission seed) + pgTAP-style test (cross-tenant resort rejection, uniqueness, RLS denial for a member without the new permission).
2. Vault-backed RPCs (`upsert_payment_provider_settings`, `list_payment_provider_settings`, `get_payment_provider_credentials`, `record_payment_provider_verification`, `enable_payment_provider`, `disable_payment_provider`) + pgTAP tests (secret-change resets verification, `enable` blocked before `VERIFIED`, Paymob+PRODUCTION structurally blocked even for an explicit admin call, no plaintext ever selectable outside the service-role function).
3. Adapter refactor (`ProviderCredentials` parameter, remove internal `getPaymentsEnv()` calls from `createCheckout`/`verifyWebhookSignature`) + credential-source resolver with the fallback-to-env-vars path, fully re-running Task 1-7's existing test suites to prove zero behavior change for the already-verified Fawry path.
4. `testPaymentProviderConnectionAction` server action + wiring into the webhook route/checkout action to resolve credentials via the new path.
5. Settings UI page + masked-secret form + status badges + the three action buttons.
6. Full regression checkpoint (everything from Phase 5's own checkpoints, plus new pgTAP suites for this feature, plus a live end-to-end settings-to-checkout test using Fawry, since Fawry is the only provider allowed to reach `ENABLED` today).

## Task 3 — closed (2026-08-17)

Task 1 (schema/RLS/RPCs) and Task 2 (resolver) were completed and checkpointed earlier. Task 3 (adapter wiring, commit `7f8d679`) was blocked mid-implementation by an independent branch (`feat/property-id-payments-dues-cluster` and, as later discovered via a full live schema/git investigation, a much larger 29-table `resort_id`→`property_id` rename campaign fully committed on `master`) that had rewritten `post_payment_internal`/`record_online_payment`/`create_online_payment_checkout_transaction` and `payment_provider_settings` itself directly on the shared live database, out of band from this branch's git history.

Resolution: `master` was merged into `fix/units-excel-export` (commit reconciling the merge conflicts), Task 3's own code and ~15 SQL/TS test fixture files were updated from `resort_id` to `property_id` to match the reconciled live contract (commit `430d796`), and a full checkpoint was re-run live: `tsc --noEmit`/`npm run build` (clean except the pre-existing, unrelated `purchasing.ts:258` baseline), `test:sql` 18/18, `test:payment-idempotency` 1/1, `test:member-portal` 5/5, `tests/payments/*` 62/62, and the full Playwright e2e suite 10/10 (including the live checkout→webhook→PAID flow using tenant-resolved credentials).

A spec-compliance + code-quality review of `7f8d679`/`430d796` followed, with no Blocking findings. **Task 3 is approved and closed as of `430d796`.** RPC parameter names (`p_resort_id`) were deliberately kept unchanged from the underlying `property_id` columns across the entire rename campaign — this is the live, confirmed contract, not an oversight.

### Follow-ups opened from the Task 3 review (tracked separately — do not fold into Task 3)

1. **`lib/actions/online-payment-checkout.ts:95-99` (fail-open on re-read error).** The re-fetch of the just-created transaction's `property_id` discards any query error and silently falls back to `null` (org-wide credential resolution) instead of failing the checkout closed. Fix: check the query's `error`/missing-row case explicitly and return `PROVIDER_CHECKOUT_FAILED` rather than defaulting `resortId` to `null`.
2. **Sandbox-only `baseUrl` (`lib/payments/resolve-credentials.ts`, `lib/payments/providers/fawry.ts`).** `online_payment_transactions` has no `environment` column yet, so `resolveProviderCredentials` and both call sites hardcode `"SANDBOX"` and always resolve Fawry's staging base URL regardless of what a tenant's settings row says. Already disclosed in code comments as known debt; must be closed (add the column, thread it through `create_online_payment_checkout_transaction`, read it back in the checkout action and webhook handler) before any tenant's PRODUCTION credentials could be correctly resolved.
3. **`lib/payments/providers/fawry.ts:179` → `lib/actions/online-payment-checkout.ts` catch block (upstream response echoed to client).** `FAWRY_CHARGE_REQUEST_FAILED: ${response.status} ${await response.text()}` is thrown and its `.message` is returned verbatim to the browser on checkout failure. Pre-existing (predates `7f8d679`, untouched by Task 3's diff), so out of scope for the Task 3 review, but is a real potential upstream-information-disclosure surface and needs its own ticket.
4. **`lib/actions/purchasing.ts:258`** — known, pre-existing, already-documented VAT/WHT RPC-signature baseline gap. Unrelated to Task 3 or the rename campaign; not to be conflated with either.

## Task 4 + Task 5 — closed (2026-08-17)

Task 4 (settings UI + connection test) shipped: `app/[locale]/(app)/finance/payment-providers/page.tsx` + `payment-provider-forms.tsx`, `lib/actions/payment-provider-settings.ts` (upsert/enable/disable/test-connection actions), a nav entry under Settings → Organization Settings. All four write paths rely on the RLS `payment_provider_settings_manage` policy (`finance.online_payments.manage`) for authorization -- no app-layer permission check duplicated, matching this codebase's established convention.

**Real gap found and fixed while building the connection-test flow**: `get_payment_provider_credentials` (the payment runtime's own resolver RPC, used by `resolve-credentials.ts`) requires `enabled=true` before it will return anything -- correct for its actual caller, but structurally incompatible with testing a DRAFT row (the entire point of "Test connection" is to verify credentials *before* they can be enabled). Added `get_payment_provider_settings_credentials(p_settings_id)` (migration `20260830000001`) as a separate, narrowly-scoped, self-permission-checked RPC, keyed by `settings_id`, working regardless of status. `get_payment_provider_credentials` itself was not touched.

The "Test connection" probe is honestly scoped as best-effort: for Fawry it's a reachability check only (`GET` against the real staging host; no documented endpoint validates `merchantCode`+`secureKey` without submitting a real charge), while for Paymob it's a genuine credential check (`POST accept.paymob.com/api/auth/tokens` with the real `api_key` -- confirmed live to reject a fake key and never let the row reach VERIFIED).

Task 5's full regression checkpoint, all run live against the reconciled `property_id` schema: `tsc --noEmit`/`npm run build` clean except the pre-existing `purchasing.ts:258` baseline; `test:sql` 18/18; `test:payment-idempotency` 1/1; `test:member-portal` 5/5; `tests/payments/*` 62/62; full Playwright e2e suite 12/12 (including two new live tests -- a complete Fawry sandbox lifecycle through the real UI, and a genuine Paymob fail-closed connection test with a fake credential).

## Task 5 review — STALE_VERIFICATION race found and fixed (2026-08-17)

An independent focused review of `2183390`/`da10fd9` (before final sign-off) found one Blocking issue: `testPaymentProviderConnectionAction` reads credentials, runs a network probe (up to 8s), then records the result with no check that the row hadn't changed in the meantime. If the secret was edited mid-probe, the stale probe's success could be recorded as `VERIFIED` for a secret that was never actually tested -- defeating the entire point of the staged-activation workflow.

**Fix (migration `20260830000002`)**: `record_payment_provider_verification` gained an optional `p_expected_updated_at` parameter -- an optimistic-concurrency check against `payment_provider_settings.updated_at` (reliably bumped by the existing `trg_payment_provider_settings_updated_at` trigger). The write only applies if `updated_at` still matches; otherwise it raises `STALE_VERIFICATION` and leaves whatever state the concurrent edit produced (`DRAFT`/`DISABLED`) completely untouched. Defaults to `NULL` (skip the check), so every pre-existing caller is unaffected. `get_payment_provider_settings_credentials` now also returns `updated_at`, captured atomically alongside the secrets. No advisory lock used -- holding a DB lock across an 8-second external HTTP call is not appropriate; the conditional UPDATE detects the conflict after the fact instead.

**A second real bug was caught applying this fix**: `CREATE OR REPLACE FUNCTION` with an added parameter does not replace a function whose identity-argument list changed -- Postgres treated it as a second overload, making every 3-arg PostgREST call to `record_payment_provider_verification` ambiguous (`PGRST203`). Caught immediately by the new test itself; fixed by explicitly dropping the old 3-arg signature first.

New test `tests/payments/payment-provider-verification-race.test.ts` proves the exact required sequence live: probe A succeeds late (after secret B replaced it) → rejected as stale, row stays `DRAFT`, `Enable` refuses it; only B's own fresh probe reaches `VERIFIED` then `ENABLED`. A second test confirms existing no-version-check callers are unaffected.

Full checkpoint re-run after the fix: `tsc`/`build` clean except the same baseline; `test:sql` 18/18; `test:payment-idempotency` 1/1; `test:member-portal` 5/5; `tests/payments/*` **64/64** (62 + 2 new); full e2e suite 12/12.

**No Blocking findings remain. Task 5 -- and the entire multi-tenant Payment Provider Settings feature (Tasks 1-5) -- is complete.**
