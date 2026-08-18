/**
 * ADR 0002 — organizations.tax_id as the tax identity source.
 *
 * These are PENETRATION tests, not happy-path coverage. Each one tries to get
 * past a guard and must fail; a guard that has only ever been walked through the
 * front door has not been established. The one positive case at the end proves
 * the guards filter rather than block, and deliberately asserts that a valid
 * identity permits a PROFILE only — it does not imply anything was verified with
 * a tax authority, because nothing has been.
 *
 * Runs against the real database through an authenticated session, so RLS and
 * has_permission apply exactly as they would in the product.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import type { Database } from "../lib/supabase/types";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const PASSWORD = "E2E_Test_P@ssw0rd_2026!";

const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

const LEGAL_TAX_ID = "100-000-001";
const OTHER_TAX_ID = "999-999-999";

type Org = { id: string; email: string; client: ReturnType<typeof createClient<Database>> };

let orgA: Org;
let orgB: Org;

async function makeOrg(label: string, withTaxId: boolean): Promise<Org> {
  const stamp = `${Date.now()}-${label}`;
  const { data: org, error: orgErr } = await admin
    .from("organizations")
    .insert({
      name: `E2E TaxIdentity ${stamp}`,
      slug: `e2e-taxidentity-${label.toLowerCase()}-${Date.now()}`,
      default_currency: "EGP",
      status: "ACTIVE",
      ...(withTaxId ? { tax_id: LEGAL_TAX_ID } : {}),
    } as never)
    .select("id")
    .single();
  expect(orgErr, `org insert failed: ${orgErr?.message}`).toBeNull();

  await admin.rpc("clone_tenant_role_templates", { p_organization_id: org!.id });

  const email = `e2e-taxid-${label.toLowerCase()}-${Date.now()}@aqarbooks-test.local`;
  const { data: created } = await admin.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  await admin
    .from("organization_memberships")
    .insert({ organization_id: org!.id, user_id: created!.user!.id, status: "active" });
  const { data: role } = await admin
    .from("roles")
    .select("id")
    .eq("organization_id", org!.id)
    .eq("key", "TENANT_OWNER")
    .single();
  await admin
    .from("user_role_assignments")
    .insert({ user_id: created!.user!.id, role_id: role!.id, organization_id: org!.id });

  const client = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  expect(signInErr, `sign-in failed: ${signInErr?.message}`).toBeNull();

  return { id: org!.id as string, email, client };
}

async function cleanUp(orgId: string) {
  await admin.from("einvoice_submission_attempts").delete().eq("organization_id", orgId);
  await admin.from("einvoice_documents").delete().eq("organization_id", orgId);
  await admin.from("einvoice_profiles").delete().eq("organization_id", orgId);
  await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
  const { error } = await admin.from("organizations").delete().eq("id", orgId);
  expect(error, `fixture org left behind: ${error?.message}`).toBeNull();
}

beforeAll(async () => {
  // A has no legal identity yet; B has one.
  orgA = await makeOrg("NoIdentity", false);
  orgB = await makeOrg("WithIdentity", true);
}, 90_000);

afterAll(async () => {
  await cleanUp(orgA.id);
  await cleanUp(orgB.id);
}, 60_000);

describe("ADR 0002 — tax identity source", () => {
  it("refuses to create a profile when the organization has no tax id", async () => {
    const { error } = await orgA.client.rpc("upsert_einvoice_profile", {
      p_organization_id: orgA.id,
      p_jurisdiction: "EG_ETA",
      p_environment: "SANDBOX",
    });
    expect(error, "a profile must not exist without a legal identity").not.toBeNull();
    expect(error!.message).toMatch(/EINVOICE_LEGAL_IDENTITY_MISSING/);

    const { count } = await admin
      .from("einvoice_profiles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgA.id);
    expect(count ?? 0, "nothing may be created").toBe(0);
  });

  it("refuses a taxpayer id that disagrees with the organization's", async () => {
    const { error } = await orgB.client.rpc("upsert_einvoice_profile", {
      p_organization_id: orgB.id,
      p_jurisdiction: "EG_ETA",
      p_environment: "SANDBOX",
      p_taxpayer_id: OTHER_TAX_ID,
    });
    expect(error, "a conflicting identity must be refused").not.toBeNull();
    expect(error!.message).toMatch(/EINVOICE_IDENTITY_CONFLICT/);

    const { count } = await admin
      .from("einvoice_profiles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgB.id);
    expect(count ?? 0).toBe(0);
  });

  it("creates a profile that inherits the legal identity, and claims nothing more", async () => {
    const { data: profileId, error } = await orgB.client.rpc("upsert_einvoice_profile", {
      p_organization_id: orgB.id,
      p_jurisdiction: "EG_ETA",
      p_environment: "SANDBOX",
    });
    expect(error, `valid identity should be accepted: ${error?.message}`).toBeNull();

    const { data: profile } = await admin
      .from("einvoice_profiles")
      .select("taxpayer_id, status, enabled, verified_at")
      .eq("id", profileId as unknown as string)
      .single();

    expect(profile!.taxpayer_id).toBe(LEGAL_TAX_ID);
    // A valid identity permits a PROFILE. It asserts nothing about ETA.
    expect(profile!.status, "creation must not imply verification").toBe("DRAFT");
    expect(profile!.enabled).toBe(false);
    expect(profile!.verified_at).toBeNull();
  });

  it("returns a verified profile to unverified when the organization's tax id changes", async () => {
    const { data: profile } = await admin
      .from("einvoice_profiles")
      .select("id")
      .eq("organization_id", orgB.id)
      .single();

    // Simulate a genuine verification, the only route out of DRAFT.
    await admin
      .from("einvoice_profiles")
      .update({ status: "ACTIVE", enabled: true, verified_at: new Date().toISOString() })
      .eq("id", profile!.id);

    // Change WHO the taxpayer is. The verification proved one taxpayer's
    // credentials; it cannot survive becoming a different taxpayer.
    await admin.from("organizations").update({ tax_id: OTHER_TAX_ID } as never).eq("id", orgB.id);

    const { data: after } = await admin
      .from("einvoice_profiles")
      .select("taxpayer_id, status, enabled, verified_at")
      .eq("id", profile!.id)
      .single();

    expect(after!.status, "verification must not survive an identity change").toBe("DRAFT");
    expect(after!.enabled).toBe(false);
    expect(after!.verified_at).toBeNull();
    expect(after!.taxpayer_id, "the profile follows the new legal identity").toBe(OTHER_TAX_ID);

    // Restore for the remaining tests.
    await admin.from("organizations").update({ tax_id: LEGAL_TAX_ID } as never).eq("id", orgB.id);
  });

  it("refuses to file when the profile identity disagrees with the organization's", async () => {
    const { data: profile } = await admin
      .from("einvoice_profiles")
      .select("id")
      .eq("organization_id", orgB.id)
      .single();

    // Force a divergence directly, as data drift or a bad backfill would.
    await admin
      .from("einvoice_profiles")
      .update({
        status: "ACTIVE",
        enabled: true,
        verified_at: new Date().toISOString(),
        taxpayer_id: OTHER_TAX_ID,
      })
      .eq("id", profile!.id);

    const { error } = await orgB.client.rpc("claim_einvoice_document", {
      p_profile_id: profile!.id,
      p_source_type: "SUPPLIER_INVOICE",
      p_source_id: "00000000-0000-0000-0000-0000000000f1",
    });
    expect(error, "a conflicting identity must block filing").not.toBeNull();
    expect(error!.message).toMatch(/EINVOICE_IDENTITY_CONFLICT/);

    const { count } = await admin
      .from("einvoice_documents")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", orgB.id);
    expect(count ?? 0, "no document may be created under a conflict").toBe(0);
  });

  it("refuses to file when the organization has no tax id at all", async () => {
    const { data: profile } = await admin
      .from("einvoice_profiles")
      .select("id")
      .eq("organization_id", orgB.id)
      .single();

    // Order matters, and the first attempt at this test got it wrong. Nulling
    // the organization's tax id fires trg_organizations_tax_identity_changed,
    // which resets the profile to DRAFT — so the request was refused by the
    // ACTIVE check before ever reaching the identity check. That layering is
    // correct and desirable, but it hides the guard under test, so the profile
    // is forced back to ACTIVE afterwards to isolate it.
    await admin.from("organizations").update({ tax_id: null } as never).eq("id", orgB.id);
    await admin
      .from("einvoice_profiles")
      .update({ status: "ACTIVE", enabled: true, verified_at: new Date().toISOString(), taxpayer_id: null })
      .eq("id", profile!.id);

    const { error } = await orgB.client.rpc("claim_einvoice_document", {
      p_profile_id: profile!.id,
      p_source_type: "SUPPLIER_INVOICE",
      p_source_id: "00000000-0000-0000-0000-0000000000f2",
    });
    expect(error, "filing without a legal identity must be refused").not.toBeNull();
    expect(error!.message).toMatch(/EINVOICE_LEGAL_IDENTITY_MISSING/);

    await admin.from("organizations").update({ tax_id: LEGAL_TAX_ID } as never).eq("id", orgB.id);
  });

  it("refuses cross-organization access to a profile", async () => {
    const { data: profileB } = await admin
      .from("einvoice_profiles")
      .select("id")
      .eq("organization_id", orgB.id)
      .single();

    // A cannot read B's profile...
    const { data: leaked } = await orgA.client
      .from("einvoice_profiles")
      .select("id")
      .eq("id", profileB!.id);
    expect(leaked ?? [], "RLS must hide another tenant's profile").toEqual([]);

    // ...nor write to B's organization through the RPC.
    const { error: writeErr } = await orgA.client.rpc("upsert_einvoice_profile", {
      p_organization_id: orgB.id,
      p_jurisdiction: "EG_ETA",
      p_environment: "SANDBOX",
    });
    expect(writeErr, "cross-tenant write must be refused").not.toBeNull();

    // ...nor file against B's profile.
    const { error: claimErr } = await orgA.client.rpc("claim_einvoice_document", {
      p_profile_id: profileB!.id,
      p_source_type: "SUPPLIER_INVOICE",
      p_source_id: "00000000-0000-0000-0000-0000000000f3",
    });
    expect(claimErr, "cross-tenant filing must be refused").not.toBeNull();
    expect(claimErr!.message).toMatch(/FORBIDDEN_FINANCE_PERMISSION/);
  });
});
