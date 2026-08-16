/**
 * Task 2 (resolver): real, non-mocked integration coverage against the live
 * Supabase project -- proves resolveProviderCredentials' exact fallback
 * rule (docs/superpowers/specs/2026-08-16-owner-portal-payment-provider-settings-design.md):
 *
 *   - A tenant setting row EXISTS for this org/resort/provider/environment
 *     (any status) -> use it if enabled, else throw
 *     TenantProviderUnusableError. NEVER fall back to legacy env in this
 *     case.
 *   - NO row exists at all for this scope -> fall back to legacy env vars
 *     (getPaymentsEnv()), a transitional path only.
 *
 * Mirrors the real upsert -> verify -> enable RPC flow Task 1's own pgTAP
 * suite (supabase/tests/phase_payment_provider_settings.sql) used, and the
 * real-auth-session pattern already established in
 * tests/member-portal-invitation.integration.test.ts (a service-role client
 * cannot itself call these has_permission()-gated RPCs -- auth.uid() is
 * null for a service-role JWT -- so a genuinely signed-in staff user is
 * required for every write RPC call below).
 */
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";
// Type-only import -- erased at compile time, so it does NOT trigger the
// eager-module-evaluation-before-dotenv hazard described below; it's only
// here to give `catch (err)` blocks a real type to narrow `err` to.
import type { TenantProviderUnusableError as TenantProviderUnusableErrorType } from "@/lib/payments/resolve-credentials";

// `lib/payments/resolve-credentials.ts` (transitively, via
// lib/supabase/admin.ts and lib/payments/env.ts) imports the `server-only`
// package, which throws unconditionally when loaded under plain Node/vitest
// (its guard only becomes a no-op under Next.js's bundler) -- same reason
// tests/payments/fawry-adapter.test.ts stubs it.
vi.mock("server-only", () => ({}));

config({ path: ".env.local" });

const TEST_PASSWORD = "E2E_Test_P@ssw0rd_2026!";

// Deliberately NOT a static top-level import: lib/env/server.ts parses
// process.env EAGERLY at module-evaluation time (unlike lib/payments/env.ts,
// which caches lazily on first call), and static imports are hoisted ahead
// of this file's own `config({ path: ".env.local" })` call above -- a
// static import here would evaluate lib/env/server.ts (via
// lib/supabase/admin.ts) before .env.local is loaded into process.env.
// Importing dynamically inside beforeAll, after config() has already run,
// avoids that ordering hazard.
let resolveProviderCredentials: typeof import("@/lib/payments/resolve-credentials").resolveProviderCredentials;
let TenantProviderUnusableError: typeof import("@/lib/payments/resolve-credentials").TenantProviderUnusableError;

describe("resolveProviderCredentials (real Supabase, no mocks)", () => {
  let admin: SupabaseClient;
  let url: string;
  let anonKey: string;
  let orgId: string;
  let orgNoSettingsId: string;
  let resortId: string;
  let staffClient: SupabaseClient;
  const runSuffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    const mod = await import("@/lib/payments/resolve-credentials");
    resolveProviderCredentials = mod.resolveProviderCredentials;
    TenantProviderUnusableError = mod.TenantProviderUnusableError;

    url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .insert({ name: "Resolve Credentials Test Org", slug: `rcred-${runSuffix}`, default_currency: "EGP", status: "ACTIVE" })
      .select("id")
      .single();
    expect(orgErr, orgErr?.message).toBeNull();
    orgId = org!.id;

    const { data: orgNoSettings, error: org2Err } = await admin
      .from("organizations")
      .insert({ name: "Resolve Credentials Test Org (no settings)", slug: `rcred-empty-${runSuffix}`, default_currency: "EGP", status: "ACTIVE" })
      .select("id")
      .single();
    expect(org2Err, org2Err?.message).toBeNull();
    orgNoSettingsId = orgNoSettings!.id;

    const { data: resort, error: resortErr } = await admin
      .from("properties")
      .insert({ organization_id: orgId, name: "RCred Resort", code: `RCRED-${runSuffix}`, timezone: "Africa/Cairo", property_type: "resort" })
      .select("id")
      .single();
    expect(resortErr, resortErr?.message).toBeNull();
    resortId = resort!.id;

    const { error: cloneErrA } = await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });
    expect(cloneErrA).toBeNull();
    const { error: cloneErrB } = await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgNoSettingsId });
    expect(cloneErrB).toBeNull();

    const { data: ownerRole, error: ownerRoleErr } = await admin
      .from("roles")
      .select("id")
      .eq("organization_id", orgId)
      .eq("key", "TENANT_OWNER")
      .single();
    expect(ownerRoleErr, ownerRoleErr?.message).toBeNull();

    const staffEmail = `rcred-staff-${runSuffix}@resortos-test.local`;
    const { data: staffCreated, error: staffCreateErr } = await admin.auth.admin.createUser({
      email: staffEmail,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    expect(staffCreateErr, staffCreateErr?.message).toBeNull();
    const staffUserId = staffCreated!.user!.id;

    const { error: assignErr } = await admin
      .from("user_role_assignments")
      .insert({ user_id: staffUserId, role_id: ownerRole!.id, organization_id: orgId });
    expect(assignErr, assignErr?.message).toBeNull();

    staffClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error: signInErr } = await staffClient.auth.signInWithPassword({ email: staffEmail, password: TEST_PASSWORD });
    expect(signInErr, signInErr?.message).toBeNull();
  }, 45000);

  afterAll(async () => {
    for (const id of [orgId, orgNoSettingsId]) {
      const res = await admin.rpc("set_organization_status", { p_organization_id: id, p_status: "ARCHIVED", p_reason: "resolve-credentials test cleanup" });
      if (res.error) {
        // set_organization_status self-gates on is_platform_admin(auth.uid()),
        // null under the service-role client -- same fallback used by
        // tests/record-online-payment-concurrency.integration.test.ts.
        await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", id);
      }
    }
  });

  it("scenario 1: org-wide enabled setting -> returns the tenant's real configured values", async () => {
    const { data: settingsId, error: upsertErr } = await staffClient.rpc("upsert_payment_provider_settings", {
      p_organization_id: orgId,
      p_resort_id: null,
      p_provider: "FAWRY",
      p_environment: "SANDBOX",
      p_merchant_identifier: "RCRED-MERCH-ORGWIDE",
      p_public_key: null,
      p_api_key: `rcred-fawry-key-${runSuffix}`,
      p_hmac_secret: `rcred-fawry-hmac-${runSuffix}`,
    });
    expect(upsertErr, upsertErr?.message).toBeNull();

    const { error: verifyErr } = await staffClient.rpc("record_payment_provider_verification", {
      p_settings_id: settingsId as string,
      p_success: true,
    });
    expect(verifyErr, verifyErr?.message).toBeNull();

    const { error: enableErr } = await staffClient.rpc("enable_payment_provider", { p_settings_id: settingsId as string });
    expect(enableErr, enableErr?.message).toBeNull();

    const creds = await resolveProviderCredentials(orgId, null, "FAWRY", "SANDBOX");
    expect(creds.merchantIdentifier).toBe("RCRED-MERCH-ORGWIDE");
    expect(creds.publicKey).toBeNull();
    expect(creds.apiKey).toBe(`rcred-fawry-key-${runSuffix}`);
    expect(creds.hmacSecret).toBe(`rcred-fawry-hmac-${runSuffix}`);
  });

  it("scenario 2: resort-specific setting wins over an org-wide row for the same scope", async () => {
    const { data: orgWideId, error: orgWideErr } = await staffClient.rpc("upsert_payment_provider_settings", {
      p_organization_id: orgId,
      p_resort_id: null,
      p_provider: "PAYMOB",
      p_environment: "SANDBOX",
      p_merchant_identifier: "RCRED-PAYMOB-ORGWIDE",
      p_public_key: "pk_orgwide",
      p_api_key: `rcred-paymob-orgwide-key-${runSuffix}`,
      p_hmac_secret: `rcred-paymob-orgwide-hmac-${runSuffix}`,
    });
    expect(orgWideErr, orgWideErr?.message).toBeNull();
    await staffClient.rpc("record_payment_provider_verification", { p_settings_id: orgWideId as string, p_success: true });
    await staffClient.rpc("enable_payment_provider", { p_settings_id: orgWideId as string });

    const { data: resortId2, error: resortErr } = await staffClient.rpc("upsert_payment_provider_settings", {
      p_organization_id: orgId,
      p_resort_id: resortId,
      p_provider: "PAYMOB",
      p_environment: "SANDBOX",
      p_merchant_identifier: "RCRED-PAYMOB-RESORT",
      p_public_key: "pk_resort",
      p_api_key: `rcred-paymob-resort-key-${runSuffix}`,
      p_hmac_secret: `rcred-paymob-resort-hmac-${runSuffix}`,
    });
    expect(resortErr, resortErr?.message).toBeNull();
    await staffClient.rpc("record_payment_provider_verification", { p_settings_id: resortId2 as string, p_success: true });
    await staffClient.rpc("enable_payment_provider", { p_settings_id: resortId2 as string });

    // Resort-specific row wins for this resort.
    const resortCreds = await resolveProviderCredentials(orgId, resortId, "PAYMOB", "SANDBOX");
    expect(resortCreds.merchantIdentifier).toBe("RCRED-PAYMOB-RESORT");
    expect(resortCreds.apiKey).toBe(`rcred-paymob-resort-key-${runSuffix}`);

    // Org-wide row is still returned when queried without a resort_id.
    const orgWideCreds = await resolveProviderCredentials(orgId, null, "PAYMOB", "SANDBOX");
    expect(orgWideCreds.merchantIdentifier).toBe("RCRED-PAYMOB-ORGWIDE");
    expect(orgWideCreds.apiKey).toBe(`rcred-paymob-orgwide-key-${runSuffix}`);
  });

  it("scenario 3+4: a DRAFT (never verified) row and a VERIFIED-but-not-ENABLED row both throw TenantProviderUnusableError, never falling back to env", async () => {
    // 3: DRAFT -- created but never verified/enabled.
    const { data: draftId, error: draftErr } = await staffClient.rpc("upsert_payment_provider_settings", {
      p_organization_id: orgId,
      p_resort_id: null,
      p_provider: "FAWRY",
      p_environment: "PRODUCTION",
      p_merchant_identifier: "RCRED-FAWRY-PROD-DRAFT",
      p_public_key: null,
      p_api_key: `rcred-fawry-prod-key-${runSuffix}`,
      p_hmac_secret: `rcred-fawry-prod-hmac-${runSuffix}`,
    });
    expect(draftErr, draftErr?.message).toBeNull();
    expect(draftId).toBeTruthy();

    await expect(resolveProviderCredentials(orgId, null, "FAWRY", "PRODUCTION")).rejects.toThrow(TenantProviderUnusableError);
    try {
      await resolveProviderCredentials(orgId, null, "FAWRY", "PRODUCTION");
      throw new Error("expected resolveProviderCredentials to throw");
    } catch (err) {
      expect(err).toBeInstanceOf(TenantProviderUnusableError);
      const e = err as TenantProviderUnusableErrorType;
      expect(e.rpcError).toContain("PROVIDER_NOT_ENABLED");
      // The FAWRY legacy env fallback values (.env.local) must NEVER leak
      // through as if they were this org's "resolved" credentials.
      expect(e.message).not.toContain(process.env.FAWRY_MERCHANT_CODE);
      expect(e.message).not.toContain(process.env.FAWRY_SECURE_KEY);
    }

    // 4: VERIFIED but never explicitly ENABLED -- same unusable outcome,
    // proving it's not merely "status !== VERIFIED" but genuinely
    // "enabled !== true" that gates usability.
    const { data: verifiedOnlyId, error: verifiedOnlyErr } = await staffClient.rpc("upsert_payment_provider_settings", {
      p_organization_id: orgId,
      p_resort_id: null,
      p_provider: "PAYMOB",
      p_environment: "PRODUCTION",
      p_merchant_identifier: "RCRED-PAYMOB-PROD-VERIFIED-ONLY",
      p_public_key: "pk_verified_only",
      p_api_key: `rcred-paymob-prod-key-${runSuffix}`,
      p_hmac_secret: `rcred-paymob-prod-hmac-${runSuffix}`,
    });
    expect(verifiedOnlyErr, verifiedOnlyErr?.message).toBeNull();
    const { error: verifyOnlyErr } = await staffClient.rpc("record_payment_provider_verification", {
      p_settings_id: verifiedOnlyId as string,
      p_success: true,
    });
    expect(verifyOnlyErr, verifyOnlyErr?.message).toBeNull();
    // Deliberately never call enable_payment_provider.

    await expect(resolveProviderCredentials(orgId, null, "PAYMOB", "PRODUCTION")).rejects.toThrow(TenantProviderUnusableError);
    try {
      await resolveProviderCredentials(orgId, null, "PAYMOB", "PRODUCTION");
      throw new Error("expected resolveProviderCredentials to throw");
    } catch (err) {
      const e = err as TenantProviderUnusableErrorType;
      expect(e.rpcError).toContain("PROVIDER_NOT_ENABLED");
      expect(e.message).not.toContain(process.env.PAYMOB_SECRET_KEY);
      expect(e.message).not.toContain(process.env.PAYMOB_HMAC_SECRET);
    }
  });

  it("scenario 5: no tenant setting at all, WITH legacy env configured -> returns the env-var values", async () => {
    const creds = await resolveProviderCredentials(orgNoSettingsId, null, "FAWRY", "SANDBOX");
    expect(creds.merchantIdentifier).toBe(process.env.FAWRY_MERCHANT_CODE);
    expect(creds.hmacSecret).toBe(process.env.FAWRY_SECURE_KEY);
    expect(creds.publicKey).toBeNull();
    expect(creds.apiKey).toBe("");

    const paymobCreds = await resolveProviderCredentials(orgNoSettingsId, null, "PAYMOB", "SANDBOX");
    expect(paymobCreds.merchantIdentifier).toBe(process.env.PAYMOB_INTEGRATION_ID);
    expect(paymobCreds.publicKey).toBe(process.env.PAYMOB_PUBLIC_KEY);
    expect(paymobCreds.apiKey).toBe(process.env.PAYMOB_SECRET_KEY);
    expect(paymobCreds.hmacSecret).toBe(process.env.PAYMOB_HMAC_SECRET);
  });

  it("scenario 6: no tenant setting AND no legacy env configured -> PAYMENTS_ENV_INVALID propagates, unswallowed", async () => {
    // getPaymentsEnv() caches its result at module scope on first successful
    // call (scenario 5 above already triggered that). vi.resetModules() +
    // a dynamic re-import gets a genuinely fresh, uncached env module so
    // this test's env stub actually takes effect on validation.
    vi.resetModules();
    vi.stubEnv("FAWRY_MERCHANT_CODE", "");
    vi.stubEnv("FAWRY_SECURE_KEY", "");
    try {
      const fresh = await import("@/lib/payments/resolve-credentials");
      await expect(fresh.resolveProviderCredentials(orgNoSettingsId, null, "FAWRY", "SANDBOX")).rejects.toThrow(/PAYMENTS_ENV_INVALID/);
    } finally {
      vi.unstubAllEnvs();
      vi.resetModules();
    }
  });

  it("regression: a genuinely unrelated DB error does not false-positive match the NO_TENANT_SETTING prefix check and fall back to env", async () => {
    // A malformed UUID makes Postgres reject the RPC call itself (invalid
    // input syntax), producing an error message that has nothing to do with
    // NO_TENANT_SETTING/PROVIDER_NOT_ENABLED. The resolver's fallback
    // branch keys off `error.message?.startsWith("NO_TENANT_SETTING")` --
    // this proves an unrelated error does not accidentally satisfy that
    // check and silently return legacy env credentials instead of erroring.
    await expect(resolveProviderCredentials("not-a-valid-uuid", null, "FAWRY", "SANDBOX")).rejects.toThrow(TenantProviderUnusableError);
    try {
      await resolveProviderCredentials("not-a-valid-uuid", null, "FAWRY", "SANDBOX");
      throw new Error("expected resolveProviderCredentials to throw");
    } catch (err) {
      const e = err as TenantProviderUnusableErrorType;
      expect(e.rpcError).not.toContain("NO_TENANT_SETTING");
      // Must NOT be the env-fallback shape -- confirm no ProviderCredentials
      // object (with the real env values) was silently returned instead.
      expect(e).toBeInstanceOf(TenantProviderUnusableError);
      expect(e.message).not.toContain(process.env.FAWRY_MERCHANT_CODE);
    }
  });
});
