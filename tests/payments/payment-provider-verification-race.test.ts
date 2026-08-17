/**
 * Task 4 review fix: proves the STALE_VERIFICATION race-condition fix in
 * record_payment_provider_verification (supabase/migrations/
 * 20260830000002_record_payment_provider_verification_stale_check.sql).
 *
 * Real scenario this closes: testPaymentProviderConnectionAction reads
 * credentials, runs a network probe (up to 8s), then records the result.
 * If the settings row is edited (secret changed) while that probe is in
 * flight, the probe's result is for credentials that no longer apply --
 * recording it as VERIFIED would mark a never-tested secret as verified.
 *
 * Simulated directly at the RPC level (deterministic, no need to control
 * real network timing): capture updated_at right after creating the row
 * with secret A (mirrors get_payment_provider_settings_credentials'
 * atomic read), change the secret to B (mirrors a concurrent Save), then
 * attempt to record secret A's "successful" probe using the STALE
 * updated_at -- must be rejected, must never reach VERIFIED, and Enable
 * must still refuse the row. Only recording secret B's own (fresh)
 * verification may reach VERIFIED, and only then does Enable succeed.
 *
 * Fixture conventions match tests/payments/resolve-credentials.test.ts:
 * real Supabase, no mocks, a genuinely authenticated TENANT_OWNER staff
 * session (service-role has no auth.uid() and cannot pass the
 * has_permission()-gated RPCs under test).
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const TEST_PASSWORD = "E2E_Test_P@ssw0rd_2026!";

describe("record_payment_provider_verification STALE_VERIFICATION race fix (real Supabase, no mocks)", () => {
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
      .insert({ name: "PPS Race Test Org", slug: `pps-race-${runSuffix}`, default_currency: "EGP", status: "ACTIVE" })
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

    const staffEmail = `pps-race-staff-${runSuffix}@aqarbooks-test.local`;
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

  it("a stale probe result (secret A) never marks the row VERIFIED once secret B has replaced it, and Enable keeps refusing until B is genuinely verified", async () => {
    // --- Create with secret A ---
    const { data: settingsId, error: createErr } = await staffClient.rpc("upsert_payment_provider_settings", {
      p_organization_id: orgId,
      p_resort_id: null,
      p_provider: "FAWRY",
      p_environment: "SANDBOX",
      p_merchant_identifier: "PPS-RACE-MERCH",
      p_public_key: null,
      p_api_key: `secret-a-${runSuffix}`,
      p_hmac_secret: `secret-a-hmac-${runSuffix}`,
    });
    expect(createErr, createErr?.message).toBeNull();

    // --- "Test starts with secret A": capture updated_at exactly as
    // get_payment_provider_settings_credentials would, right before the
    // (simulated) network probe begins. ---
    const { data: credsA, error: credsAErr } = await staffClient
      .rpc("get_payment_provider_settings_credentials", { p_settings_id: settingsId as string })
      .single();
    expect(credsAErr, credsAErr?.message).toBeNull();
    expect(credsA!.api_key).toBe(`secret-a-${runSuffix}`);
    const staleUpdatedAt = credsA!.updated_at;

    // --- "Secret changed to B while the network probe for A was in
    // flight": a concurrent Save happens before A's probe result is
    // recorded. ---
    const { error: changeErr } = await staffClient.rpc("upsert_payment_provider_settings", {
      p_organization_id: orgId,
      p_resort_id: null,
      p_provider: "FAWRY",
      p_environment: "SANDBOX",
      p_merchant_identifier: "PPS-RACE-MERCH",
      p_public_key: null,
      p_api_key: `secret-b-${runSuffix}`,
      p_hmac_secret: `secret-b-hmac-${runSuffix}`,
    });
    expect(changeErr, changeErr?.message).toBeNull();

    // Changing the secret resets the row to DRAFT (pre-existing Task 1
    // behavior) -- confirm the starting point before attempting the stale
    // write below.
    const { data: afterChange } = await staffClient
      .rpc("list_payment_provider_settings", { p_organization_id: orgId })
      .then((r) => ({ data: (r.data ?? []).find((row: any) => row.id === settingsId) }));
    expect(afterChange?.status).toBe("DRAFT");

    // --- "A's probe succeeds" (the network call for secret A completed
    // successfully), but recording it against the STALE updated_at must
    // be rejected -- never written as VERIFIED. ---
    const { error: staleErr } = await staffClient.rpc("record_payment_provider_verification", {
      p_settings_id: settingsId as string,
      p_success: true,
      p_expected_updated_at: staleUpdatedAt,
    });
    expect(staleErr, "expected STALE_VERIFICATION to be rejected").not.toBeNull();
    expect(staleErr!.message).toContain("STALE_VERIFICATION");

    // --- Final state: NOT verified, still DRAFT (secret B's own state,
    // completely untouched by A's stale write attempt). ---
    const { data: rowsAfterStale } = await staffClient.rpc("list_payment_provider_settings", { p_organization_id: orgId });
    const rowAfterStale = (rowsAfterStale ?? []).find((r: any) => r.id === settingsId);
    expect(rowAfterStale?.status).toBe("DRAFT");
    expect(rowAfterStale?.enabled).toBe(false);

    // --- Enable must still refuse -- the row was never genuinely
    // verified, regardless of what A's probe claimed. ---
    const { error: enableBeforeErr } = await staffClient.rpc("enable_payment_provider", { p_settings_id: settingsId as string });
    expect(enableBeforeErr).not.toBeNull();
    expect(enableBeforeErr!.message).toContain("NOT_VERIFIED");

    // --- Only a fresh probe of secret B (the credentials actually stored
    // now) may reach VERIFIED. ---
    const { data: credsB, error: credsBErr } = await staffClient
      .rpc("get_payment_provider_settings_credentials", { p_settings_id: settingsId as string })
      .single();
    expect(credsBErr, credsBErr?.message).toBeNull();
    expect(credsB!.api_key).toBe(`secret-b-${runSuffix}`);

    const { error: verifyBErr } = await staffClient.rpc("record_payment_provider_verification", {
      p_settings_id: settingsId as string,
      p_success: true,
      p_expected_updated_at: credsB!.updated_at,
    });
    expect(verifyBErr, verifyBErr?.message).toBeNull();

    const { data: rowsAfterB } = await staffClient.rpc("list_payment_provider_settings", { p_organization_id: orgId });
    const rowAfterB = (rowsAfterB ?? []).find((r: any) => r.id === settingsId);
    expect(rowAfterB?.status).toBe("VERIFIED");

    // --- Enable now succeeds, on B's genuinely verified credentials. ---
    const { error: enableAfterErr } = await staffClient.rpc("enable_payment_provider", { p_settings_id: settingsId as string });
    expect(enableAfterErr, enableAfterErr?.message).toBeNull();

    const { data: rowsFinal } = await staffClient.rpc("list_payment_provider_settings", { p_organization_id: orgId });
    const rowFinal = (rowsFinal ?? []).find((r: any) => r.id === settingsId);
    expect(rowFinal?.status).toBe("ENABLED");
    expect(rowFinal?.enabled).toBe(true);
  });

  it("record_payment_provider_verification without p_expected_updated_at (existing callers) is unaffected -- always writes, matching pre-fix behavior", async () => {
    const { data: settingsId, error: createErr } = await staffClient.rpc("upsert_payment_provider_settings", {
      p_organization_id: orgId,
      p_resort_id: null,
      p_provider: "PAYMOB",
      p_environment: "SANDBOX",
      p_merchant_identifier: "PPS-RACE-NOCHECK",
      p_public_key: null,
      p_api_key: `nocheck-${runSuffix}`,
      p_hmac_secret: `nocheck-hmac-${runSuffix}`,
    });
    expect(createErr, createErr?.message).toBeNull();

    // No p_expected_updated_at passed at all -- must behave exactly as
    // before this fix (unconditional write), for existing callers like
    // supabase/tests/phase_payment_provider_settings.sql and
    // tests/pgtap.integration.test.ts's scenario 16.
    const { error: verifyErr } = await staffClient.rpc("record_payment_provider_verification", {
      p_settings_id: settingsId as string,
      p_success: true,
    });
    expect(verifyErr, verifyErr?.message).toBeNull();

    const { data: rows } = await staffClient.rpc("list_payment_provider_settings", { p_organization_id: orgId });
    const row = (rows ?? []).find((r: any) => r.id === settingsId);
    expect(row?.status).toBe("VERIFIED");
  });
});
