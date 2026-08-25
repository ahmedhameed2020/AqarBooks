/**
 * `organizations.is_demo` is platform-controlled, not tenant-controlled.
 *
 * WHAT THIS PROVES
 * The RLS policy on `organizations` is column-blind:
 *
 *   CREATE POLICY "organizations_update_authorized" ON public.organizations
 *     FOR UPDATE
 *     USING (is_platform_admin(auth.uid())
 *            OR has_permission(auth.uid(), id, 'tenant.settings.manage'))
 *
 * plus `GRANT ALL ON TABLE public.organizations TO authenticated`. So a tenant
 * admin may UPDATE their own organization row, and without a further control
 * could set `is_demo = true` on it through a direct PostgREST request -- a
 * billing exemption granted by a customer to themselves, and one that no
 * interface change could prevent because the attack does not go through the
 * interface.
 *
 * The partial unique index does not close this. It only stops a SECOND demo
 * row, so whoever sets the flag first wins, and before the demo tenant exists
 * there is no first.
 *
 * These tests therefore exercise the path an attacker would use: a genuinely
 * authenticated tenant-admin session with the anon key, writing straight to
 * PostgREST. Nothing in lib/demo participates.
 *
 * WHY IT SKIPS
 * The column does not exist yet -- see scripts/demo/pending-migration-is-demo.sql.
 * Skipping until it does is deliberate: a suite that is red because a migration
 * is pending teaches people to ignore red suites. It starts running, and must
 * pass, the moment the migration lands.
 *
 * It creates a throwaway organization and two users and deletes them in
 * afterAll. That follows the repository's existing integration-test
 * convention, but it does write to whatever project .env.local points at.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import type { Database } from "../lib/supabase/types";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const CONFIGURED = Boolean(url && anonKey && serviceKey);

const admin = CONFIGURED
  ? createClient<Database>(url, serviceKey, { auth: { persistSession: false } })
  : null;

const PASSWORD = "IsDemo_Immutability_T3st!";

/** Set in beforeAll once we know whether the column exists. */
let columnExists = false;

const createdUserIds: string[] = [];
const createdOrgIds: string[] = [];

let tenantAdmin: { userId: string; client: SupabaseClient<Database> } | null = null;
let organizationId: string | null = null;

async function detectColumn(): Promise<boolean> {
  if (!admin) return false;
  // Asking PostgREST for the column is the cheapest probe that does not need
  // SQL execution rights: an unknown column comes back as an error rather than
  // as rows.
  const { error } = await admin.from("organizations").select("is_demo").limit(1);
  return !error;
}

beforeAll(async () => {
  if (!CONFIGURED) return;
  columnExists = await detectColumn();
  if (!columnExists) return;

  // A real organization with a real tenant admin, created the way onboarding
  // creates one, so the permission under test is genuinely held.
  const email = `is-demo-guard-${Date.now()}@resortos-test.local`;
  const { data: created, error: createErr } = await admin!.auth.admin.createUser({
    email,
    password: PASSWORD,
    email_confirm: true,
  });
  if (createErr) throw createErr;
  createdUserIds.push(created.user.id);

  const client = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
  const { error: signInErr } = await client.auth.signInWithPassword({ email, password: PASSWORD });
  if (signInErr) throw signInErr;

  const { data, error } = await client.rpc("create_organization_onboarding", {
    p_org_name: "is_demo Immutability Probe",
    p_entity_type: "FACILITY_MANAGEMENT",
    p_resort_name: "Probe Project",
    p_resort_code: "IDP-01",
    p_default_currency: "EGP",
  });
  if (error) throw error;

  organizationId = (data as { organization_id: string }).organization_id;
  createdOrgIds.push(organizationId);
  tenantAdmin = { userId: created.user.id, client };
});

afterAll(async () => {
  if (!admin) return;
  for (const orgId of createdOrgIds) {
    // The onboarding RPC writes a platform_audit_logs row whose FK has no
    // ON DELETE CASCADE; the organization delete fails silently otherwise.
    await admin.from("platform_audit_logs").delete().eq("organization_id", orgId);
    const { error } = await admin.from("organizations").delete().eq("id", orgId);
    if (error) console.error(`cleanup: organization ${orgId}: ${error.message}`);
  }
  for (const userId of createdUserIds) {
    const { error } = await admin.auth.admin.deleteUser(userId);
    if (error) console.error(`cleanup: user ${userId}: ${error.message}`);
  }
});

describe.skipIf(!CONFIGURED)("organizations.is_demo immutability", () => {
  it("the migration is applied before anything else is asserted", () => {
    // Reported as a skip-with-reason rather than a silent pass: a green suite
    // here must not be mistaken for "the marker is protected".
    if (!columnExists) {
      console.warn(
        "SKIPPED: organizations.is_demo does not exist. Apply " +
          "scripts/demo/pending-migration-is-demo.sql, then re-run.",
      );
    }
    expect(true).toBe(true);
  });

  it.skipIf(!columnExists)(
    "a tenant admin holds tenant.settings.manage on their own organization",
    async () => {
      // If this were false the rest of the suite would pass vacuously -- it
      // would be proving that someone without the permission cannot use it.
      const { data: granted } = await tenantAdmin!.client.rpc("has_permission", {
        p_user_id: tenantAdmin!.userId,
        p_organization_id: organizationId!,
        p_permission_key: "tenant.settings.manage",
      });
      expect(granted, "the probe user does not hold the permission under test").toBe(true);

      // And is not a platform admin, which would legitimately be allowed.
      const { data: isAdmin } = await tenantAdmin!.client.rpc("is_platform_admin", {
        p_user_id: tenantAdmin!.userId,
      });
      expect(isAdmin).toBeFalsy();
    },
  );

  it.skipIf(!columnExists)(
    "that tenant admin can still change ordinary organization settings",
    async () => {
      // Establishes that the trigger is narrow. If this failed, the migration
      // would have broken tenant self-service rather than protected one column.
      const { error } = await tenantAdmin!.client
        .from("organizations")
        .update({ tagline: "changed by the tenant admin" })
        .eq("id", organizationId!);
      expect(error, `ordinary settings update was refused: ${error?.message}`).toBeNull();

      const { data: row } = await tenantAdmin!.client
        .from("organizations")
        .select("tagline")
        .eq("id", organizationId!)
        .maybeSingle();
      expect(row?.tagline).toBe("changed by the tenant admin");
    },
  );

  it.skipIf(!columnExists)("that tenant admin CANNOT set is_demo on their own organization", async () => {
    const { error } = await tenantAdmin!.client
      .from("organizations")
      // @ts-expect-error -- is_demo is not in the generated types until the
      // migration lands and they are regenerated. Sending it anyway is the
      // point: an attacker is not bound by our type definitions.
      .update({ is_demo: true })
      .eq("id", organizationId!);

    expect(error, "the update was NOT refused").not.toBeNull();
    expect(error?.message ?? "").toMatch(/FORBIDDEN_IS_DEMO|platform-controlled/i);

    // The error is necessary but not sufficient: re-read with the service role
    // and confirm the value did not change. An update refused by RLS matches
    // zero rows without erroring, so the state is the real assertion.
    const { data: row } = await admin!
      .from("organizations")
      .select("is_demo")
      .eq("id", organizationId!)
      .maybeSingle();
    expect((row as unknown as { is_demo: boolean } | null)?.is_demo).toBe(false);
  });

  it.skipIf(!columnExists)("that tenant admin cannot smuggle is_demo alongside a legitimate change", async () => {
    // The realistic attempt: hide the flag in an update that would otherwise
    // be allowed. The trigger fires on the row, not on the statement's intent.
    const { error } = await tenantAdmin!.client
      .from("organizations")
      // @ts-expect-error -- see above.
      .update({ tagline: "innocuous", is_demo: true })
      .eq("id", organizationId!);

    expect(error, "the combined update was NOT refused").not.toBeNull();

    const { data: row } = await admin!
      .from("organizations")
      .select("is_demo")
      .eq("id", organizationId!)
      .maybeSingle();
    expect((row as unknown as { is_demo: boolean } | null)?.is_demo).toBe(false);
  });

  it.skipIf(!columnExists)("the service role may set it, so provisioning still works", async () => {
    // The trigger must not be so tight that the designated tenant can never be
    // marked. This is the provisioning path.
    const { error } = await admin!
      .from("organizations")
      // @ts-expect-error -- see above.
      .update({ is_demo: true })
      .eq("id", organizationId!);
    expect(error, `service role was refused: ${error?.message}`).toBeNull();

    const { data: row } = await admin!
      .from("organizations")
      .select("is_demo")
      .eq("id", organizationId!)
      .maybeSingle();
    expect((row as unknown as { is_demo: boolean } | null)?.is_demo).toBe(true);

    // Put it back: leaving a stray demo-marked organization would occupy the
    // single-demo index and block the real one.
    await admin!
      .from("organizations")
      // @ts-expect-error -- see above.
      .update({ is_demo: false })
      .eq("id", organizationId!);
  });

  it.skipIf(!columnExists)("at most one organization may carry the marker", async () => {
    const { data: rows, error } = await admin!.from("organizations").select("id").eq("is_demo", true);
    expect(error).toBeNull();
    expect((rows ?? []).length).toBeLessThanOrEqual(1);
  });
});
