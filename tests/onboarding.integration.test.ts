import { describe, it, expect, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config } from "dotenv";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(url, serviceKey, { auth: { persistSession: false } });

const TEST_PASSWORD = "TestPassword123!";

const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];

async function newSignedInUser(): Promise<{ userId: string; client: SupabaseClient }> {
  const email = `onboarding-rpc-${Date.now()}-${Math.random().toString(36).slice(2)}@resortos-test.local`;
  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (createErr) throw createErr;
  createdUserIds.push(created.user.id);

  const client = createClient(url, anonKey, { auth: { persistSession: false } });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password: TEST_PASSWORD });
  if (signInErr) throw signInErr;

  return { userId: created.user.id, client };
}

afterAll(async () => {
  for (const orgId of createdOrgIds) {
    // The onboarding RPC writes a platform_audit_logs row referencing the
    // organization, and that FK has no ON DELETE CASCADE -- deleting the
    // organization first fails silently (Supabase JS doesn't throw on a
    // PostgREST error unless you check it), leaving orphaned test orgs
    // behind. Clear the audit log row first.
    await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
    const { error } = await admin.from("organizations").delete().eq("id", orgId);
    if (error) {
      console.error(`Failed to clean up test organization ${orgId}:`, error.message);
    }
  }
  for (const userId of createdUserIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) {
      console.error(`Failed to clean up test user ${userId}:`, error.message);
    }
  }
});

describe("create_organization_onboarding RPC", () => {
  it("1. creates an organization, first resort, membership, and TENANT_OWNER role for a fresh user", async () => {
    const { userId, client } = await newSignedInUser();

    const { data, error } = await client.rpc("create_organization_onboarding", {
      p_org_name: "Vitest Onboarding Org",
      p_entity_type: "FACILITY_MANAGEMENT",
      p_resort_name: "Vitest First Project",
      p_resort_code: "VT-01",
      p_default_currency: "EGP",
    });

    expect(error).toBeNull();
    expect(data?.success).toBe(true);
    expect(data?.organization_id).toBeTruthy();
    expect(data?.resort_id).toBeTruthy();
    if (data?.organization_id) createdOrgIds.push(data.organization_id);

    const { data: membership } = await admin
      .from("organization_memberships")
      .select("status")
      .eq("user_id", userId)
      .eq("organization_id", data!.organization_id)
      .maybeSingle();
    expect(membership?.status).toBe("active");

    const { data: roleAssignment } = await admin
      .from("user_role_assignments")
      .select("roles(key)")
      .eq("user_id", userId)
      .eq("organization_id", data!.organization_id)
      .maybeSingle();
    expect((roleAssignment as unknown as { roles: { key: string } } | null)?.roles?.key).toBe(
      "TENANT_OWNER"
    );
  });

  it("2. rejects a second onboarding attempt for a user who already has an organization", async () => {
    const { client } = await newSignedInUser();

    const first = await client.rpc("create_organization_onboarding", {
      p_org_name: "Vitest Duplicate Org",
      p_entity_type: "OTHER",
      p_entity_type_custom_label: "Vitest custom label",
      p_resort_name: "Vitest Project One",
    });
    expect(first.error).toBeNull();
    if (first.data?.organization_id) createdOrgIds.push(first.data.organization_id);

    const second = await client.rpc("create_organization_onboarding", {
      p_org_name: "Vitest Second Attempt Org",
      p_entity_type: "OTHER",
      p_entity_type_custom_label: "Vitest custom label",
      p_resort_name: "Vitest Project Two",
    });
    if (second.data?.organization_id) createdOrgIds.push(second.data.organization_id);

    expect(second.error).toBeDefined();
    expect(second.error?.message).toMatch(/^ALREADY_HAS_ORGANIZATION:/);
  });

  it("3. rejects an org name shorter than 2 characters", async () => {
    const { client } = await newSignedInUser();

    const { error } = await client.rpc("create_organization_onboarding", {
      p_org_name: "A",
      p_entity_type: "OTHER",
      p_entity_type_custom_label: "Vitest custom label",
      p_resort_name: "Vitest Project",
    });

    expect(error).toBeDefined();
    expect(error?.message).toMatch(/^INVALID_ORG_NAME:/);
  });

  it("4. requires a custom label when entity_type is OTHER", async () => {
    const { client } = await newSignedInUser();

    const { error } = await client.rpc("create_organization_onboarding", {
      p_org_name: "Vitest Missing Label Org",
      p_entity_type: "OTHER",
      p_resort_name: "Vitest Project",
    });

    expect(error).toBeDefined();
    expect(error?.message).toMatch(/^CUSTOM_LABEL_REQUIRED:/);
  });

  it("5. rejects an unauthenticated call", async () => {
    const anonClient = createClient(url, anonKey, { auth: { persistSession: false } });
    const { error } = await anonClient.rpc("create_organization_onboarding", {
      p_org_name: "Vitest Anon Org",
      p_entity_type: "OTHER",
      p_entity_type_custom_label: "x",
      p_resort_name: "Vitest Project",
    });

    expect(error).toBeDefined();
    expect(error?.message).toMatch(/^UNAUTHORIZED:/);
  });
});
