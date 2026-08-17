/**
 * deferred_payment_provider_merchant_identifier_reverify: proves
 * upsert_payment_provider_settings now forces DRAFT/enabled=false when
 * merchant_identifier or public_key change alone (no secret change), on an
 * already-ENABLED row -- merchant_identifier is a real field sent in live
 * Fawry charge requests (merchantCode), so it must not be changeable on a
 * live, activated provider without forcing re-verification, same as a
 * secret change already did.
 *
 * Fixture conventions match tests/payments/resolve-credentials.test.ts and
 * tests/payments/payment-provider-verification-race.test.ts: real
 * Supabase, no mocks, a genuinely authenticated TENANT_OWNER staff session.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const TEST_PASSWORD = "E2E_Test_P@ssw0rd_2026!";

describe("upsert_payment_provider_settings reverify-on-merchant-change (real Supabase, no mocks)", () => {
  let admin: SupabaseClient;
  let staffClient: SupabaseClient;
  let orgId: string;
  const runSuffix = `${Date.now()}-${Math.floor(Math.random() * 1e6)}`;

  beforeAll(async () => {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
    admin = createClient(url, serviceKey, { auth: { persistSession: false } });

    const { data: org, error: orgErr } = await admin
      .from("organizations")
      .insert({ name: "PPS Reverify Test Org", slug: `pps-reverify-${runSuffix}`, default_currency: "EGP", status: "ACTIVE" })
      .select("id")
      .single();
    expect(orgErr, orgErr?.message).toBeNull();
    orgId = org!.id;

    const { error: cloneErr } = await admin.rpc("clone_tenant_role_templates", { p_organization_id: orgId });
    expect(cloneErr).toBeNull();

    const { data: ownerRole, error: ownerRoleErr } = await admin
      .from("roles")
      .select("id")
      .eq("organization_id", orgId)
      .eq("key", "TENANT_OWNER")
      .single();
    expect(ownerRoleErr, ownerRoleErr?.message).toBeNull();

    const staffEmail = `pps-reverify-staff-${runSuffix}@aqarbooks-test.local`;
    const { data: staffCreated, error: staffCreateErr } = await admin.auth.admin.createUser({
      email: staffEmail,
      password: TEST_PASSWORD,
      email_confirm: true,
    });
    expect(staffCreateErr, staffCreateErr?.message).toBeNull();

    const { error: assignErr } = await admin
      .from("user_role_assignments")
      .insert({ user_id: staffCreated!.user!.id, role_id: ownerRole!.id, organization_id: orgId });
    expect(assignErr, assignErr?.message).toBeNull();

    staffClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error: signInErr } = await staffClient.auth.signInWithPassword({ email: staffEmail, password: TEST_PASSWORD });
    expect(signInErr, signInErr?.message).toBeNull();
  }, 45000);

  afterAll(async () => {
    await admin.from("organizations").update({ status: "ARCHIVED" }).eq("id", orgId);
  });

  async function rowFor(settingsId: string) {
    const { data: rows } = await staffClient.rpc("list_payment_provider_settings", { p_organization_id: orgId });
    return (rows ?? []).find((r: any) => r.id === settingsId);
  }

  it("changing merchant_identifier alone (no secret change) on an ENABLED row resets it to DRAFT/disabled and requires a fresh verify", async () => {
    const { data: settingsId, error: createErr } = await staffClient.rpc("upsert_payment_provider_settings", {
      p_organization_id: orgId,
      p_resort_id: null,
      p_provider: "FAWRY",
      p_environment: "SANDBOX",
      p_merchant_identifier: "REVERIFY-MERCH-1",
      p_public_key: null,
      p_api_key: `reverify-key-${runSuffix}`,
      p_hmac_secret: `reverify-hmac-${runSuffix}`,
    });
    expect(createErr, createErr?.message).toBeNull();

    await staffClient.rpc("record_payment_provider_verification", { p_settings_id: settingsId as string, p_success: true });
    const { error: enableErr } = await staffClient.rpc("enable_payment_provider", { p_settings_id: settingsId as string });
    expect(enableErr, enableErr?.message).toBeNull();

    const enabledRow = await rowFor(settingsId as string);
    expect(enabledRow?.status).toBe("ENABLED");
    expect(enabledRow?.enabled).toBe(true);

    // Change ONLY merchant_identifier -- same provider/environment/scope,
    // no api_key/hmac_secret passed (blank means unchanged, matching the
    // form's own "leave blank to keep unchanged" contract).
    const { error: changeErr } = await staffClient.rpc("upsert_payment_provider_settings", {
      p_organization_id: orgId,
      p_resort_id: null,
      p_provider: "FAWRY",
      p_environment: "SANDBOX",
      p_merchant_identifier: "REVERIFY-MERCH-2-CHANGED",
      p_public_key: null,
      p_api_key: "",
      p_hmac_secret: "",
    });
    expect(changeErr, changeErr?.message).toBeNull();

    const afterChange = await rowFor(settingsId as string);
    expect(afterChange?.merchant_identifier).toBe("REVERIFY-MERCH-2-CHANGED");
    expect(afterChange?.status).toBe("DRAFT");
    expect(afterChange?.enabled).toBe(false);
    expect(afterChange?.verified_at).toBeNull();

    // Enable must now refuse until a fresh verification happens.
    const { error: enableAfterErr } = await staffClient.rpc("enable_payment_provider", { p_settings_id: settingsId as string });
    expect(enableAfterErr).not.toBeNull();
    expect(enableAfterErr!.message).toContain("NOT_VERIFIED");

    // A fresh verify + enable succeeds again.
    await staffClient.rpc("record_payment_provider_verification", { p_settings_id: settingsId as string, p_success: true });
    const { error: enableFinalErr } = await staffClient.rpc("enable_payment_provider", { p_settings_id: settingsId as string });
    expect(enableFinalErr, enableFinalErr?.message).toBeNull();
    const finalRow = await rowFor(settingsId as string);
    expect(finalRow?.status).toBe("ENABLED");
  });

  it("changing public_key alone on an ENABLED row also resets it to DRAFT/disabled", async () => {
    const { data: settingsId, error: createErr } = await staffClient.rpc("upsert_payment_provider_settings", {
      p_organization_id: orgId,
      p_resort_id: null,
      p_provider: "PAYMOB",
      p_environment: "SANDBOX",
      p_merchant_identifier: "REVERIFY-PAYMOB-MERCH",
      p_public_key: "pk_original",
      p_api_key: `reverify-paymob-key-${runSuffix}`,
      p_hmac_secret: `reverify-paymob-hmac-${runSuffix}`,
    });
    expect(createErr, createErr?.message).toBeNull();

    await staffClient.rpc("record_payment_provider_verification", { p_settings_id: settingsId as string, p_success: true });
    await staffClient.rpc("enable_payment_provider", { p_settings_id: settingsId as string });
    expect((await rowFor(settingsId as string))?.status).toBe("ENABLED");

    const { error: changeErr } = await staffClient.rpc("upsert_payment_provider_settings", {
      p_organization_id: orgId,
      p_resort_id: null,
      p_provider: "PAYMOB",
      p_environment: "SANDBOX",
      p_merchant_identifier: "REVERIFY-PAYMOB-MERCH",
      p_public_key: "pk_changed",
      p_api_key: "",
      p_hmac_secret: "",
    });
    expect(changeErr, changeErr?.message).toBeNull();

    const afterChange = await rowFor(settingsId as string);
    expect(afterChange?.public_key).toBe("pk_changed");
    expect(afterChange?.status).toBe("DRAFT");
    expect(afterChange?.enabled).toBe(false);
  });

  it("re-saving with IDENTICAL merchant_identifier/public_key and no secret change does NOT reset an ENABLED row (no spurious re-verification)", async () => {
    const { data: settingsId, error: createErr } = await staffClient.rpc("upsert_payment_provider_settings", {
      p_organization_id: orgId,
      p_resort_id: null,
      p_provider: "FAWRY",
      p_environment: "PRODUCTION",
      p_merchant_identifier: "REVERIFY-NOCHANGE-MERCH",
      p_public_key: null,
      p_api_key: `reverify-nochange-key-${runSuffix}`,
      p_hmac_secret: `reverify-nochange-hmac-${runSuffix}`,
    });
    expect(createErr, createErr?.message).toBeNull();
    await staffClient.rpc("record_payment_provider_verification", { p_settings_id: settingsId as string, p_success: true });
    // Note: Paymob+PRODUCTION is blocked, but this is FAWRY+PRODUCTION,
    // which enable_payment_provider allows.
    await staffClient.rpc("enable_payment_provider", { p_settings_id: settingsId as string });
    const enabledRow = await rowFor(settingsId as string);
    expect(enabledRow?.status).toBe("ENABLED");
    const verifiedAtBefore = enabledRow?.verified_at;

    // Re-save with the exact same merchant_identifier/public_key, no
    // secrets -- must be a true no-op with respect to status/enabled.
    const { error: resaveErr } = await staffClient.rpc("upsert_payment_provider_settings", {
      p_organization_id: orgId,
      p_resort_id: null,
      p_provider: "FAWRY",
      p_environment: "PRODUCTION",
      p_merchant_identifier: "REVERIFY-NOCHANGE-MERCH",
      p_public_key: null,
      p_api_key: "",
      p_hmac_secret: "",
    });
    expect(resaveErr, resaveErr?.message).toBeNull();

    const afterResave = await rowFor(settingsId as string);
    expect(afterResave?.status).toBe("ENABLED");
    expect(afterResave?.enabled).toBe(true);
    expect(afterResave?.verified_at).toBe(verifiedAtBefore);
  });
});
