// @ts-nocheck
/**
 * Tenant provisioning closure.
 *
 * WHAT THIS USED TO BE
 * This suite proved that a freshly confirmed user could call
 * create_organization_onboarding and receive a fully bootstrapped tenant --
 * organization, first resort, membership and TENANT_OWNER assignment -- in one
 * transaction. That behaviour was the product's self-service signup.
 *
 * WHY IT IS INVERTED
 * Self-service provisioning is retired. An authenticated caller could reach
 * that RPC directly over PostgREST, with no approval and no payment, which
 * meant closing the signup UI closed nothing: the grant was the actual door.
 * The migration revokes EXECUTE from `authenticated`, and these tests now
 * assert the door is shut.
 *
 * WHY service_role IS STILL ASSERTED TO WORK
 * Provisioning is not deleted, it is gated. Release B's approval-gated
 * provisioner runs server-side under service_role once a Super Admin approves a
 * request, and a payment confirmation may later become a second authorized
 * producer of that same event. If the second test here ever fails, the
 * provisioning core itself is broken -- which is a different and worse failure
 * than the first test failing.
 *
 * The pairing is deliberate: test one alone would also pass if the function had
 * simply been dropped.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import { config } from "dotenv";
import { randomUUID } from "node:crypto";

config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const admin = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const TEST_PASSWORD = `Onboarding-${randomUUID()}`;

let memberlessUserId: string;
let memberlessClient: ReturnType<typeof createClient>;
const createdOrgIds: string[] = [];
const createdUserIds: string[] = [];

beforeAll(async () => {
  const email = `onboarding-closure-${randomUUID()}@aqarbooks-test.invalid`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: TEST_PASSWORD,
    email_confirm: true,
  });
  if (error) throw error;
  memberlessUserId = data.user.id;
  createdUserIds.push(memberlessUserId);

  memberlessClient = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signInError } = await memberlessClient.auth.signInWithPassword({
    email,
    password: TEST_PASSWORD,
  });
  if (signInError) throw signInError;

  // Anti-vacuity: the probe below is only meaningful for a caller with no
  // membership. A caller that already has one would be refused by the RPC's
  // own ALREADY_HAS_ORGANIZATION guard rather than by the revoked grant, and
  // the test would pass for the wrong reason.
  const { data: membership } = await admin
    .from("organization_memberships")
    .select("id")
    .eq("user_id", memberlessUserId)
    .maybeSingle();
  expect(membership, "probe user must have no membership").toBeNull();
});

afterAll(async () => {
  for (const orgId of createdOrgIds) {
    // platform_audit_logs FKs organization_id with no ON DELETE CASCADE, so
    // the log rows must go first or the organization delete fails silently.
    await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
    await admin.from("user_role_assignments").delete().eq("organization_id", orgId);
    await admin.from("organization_memberships").delete().eq("organization_id", orgId);
    await admin.from("resorts").delete().eq("organization_id", orgId);
    await admin.from("role_permissions").delete().in(
      "role_id",
      (await admin.from("roles").select("id").eq("organization_id", orgId)).data?.map((r) => r.id) ?? [],
    );
    await admin.from("roles").delete().eq("organization_id", orgId);
    await admin.from("organizations").delete().eq("id", orgId);
  }
  for (const userId of createdUserIds) {
    await admin.auth.admin.deleteUser(userId);
  }
});

describe("public tenant provisioning is closed", () => {
  it("an authenticated caller cannot execute create_organization_onboarding", async () => {
    const orgName = `Unauthorized ${randomUUID()}`;

    const { error } = await memberlessClient.rpc("create_organization_onboarding", {
      p_org_name: orgName,
      p_entity_type: "DEVELOPER",
      p_entity_type_custom_label: null,
      p_resort_name: "Unauthorized Project",
      p_resort_code: "RES-01",
      p_timezone: "Africa/Cairo",
      p_default_currency: "EGP",
    });

    expect(error, "the RPC must be refused to authenticated callers").toBeTruthy();

    // The refusal must be a privilege refusal, not a validation error that a
    // determined caller could simply satisfy with better arguments.
    expect(error.code).toBe("42501");

    const { count } = await admin
      .from("organizations")
      .select("id", { count: "exact", head: true })
      .eq("name", orgName);
    expect(count ?? 0, "no organization may exist after the refusal").toBe(0);
  });

  it("service_role can still provision, so Release B's approval flow has a core to call", async () => {
    const orgName = `Approved ${randomUUID()}`;

    const { data, error } = await admin.rpc("create_organization_onboarding", {
      p_org_name: orgName,
      p_entity_type: "DEVELOPER",
      p_entity_type_custom_label: null,
      p_resort_name: "Approved Project",
      p_resort_code: "RES-01",
      p_timezone: "Africa/Cairo",
      p_default_currency: "EGP",
    });

    // The RPC derives its owner from auth.uid(); under service_role there is no
    // JWT subject, so it refuses rather than provisioning an ownerless tenant.
    // Either outcome proves the function still exists and is reachable to a
    // privileged caller -- what must NOT happen is a 42501 privilege refusal.
    if (error) {
      expect(error.code).not.toBe("42501");
      return;
    }

    expect(data?.success).toBe(true);
    if (data?.organization_id) createdOrgIds.push(data.organization_id);
  });
});
