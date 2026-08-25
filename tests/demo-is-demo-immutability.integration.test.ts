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
 * WHY IT REFUSES TO RUN AGAINST PRODUCTION
 * This suite WRITES: it creates an organization and a user and deletes them
 * afterwards. That is acceptable on a disposable target and not acceptable on
 * the production project, where 1,954 leftover test organizations have already
 * had to be purged once. So it is not in `test:all` -- no general-purpose test
 * command should be able to write to production by accident -- and it refuses
 * the production ref by name.
 *
 * To run it, name the target deliberately:
 *
 *     DEMO_SECURITY_TEST_TARGET_REF=<project-ref> npm run test:is-demo
 *
 * The ref must match the project NEXT_PUBLIC_SUPABASE_URL points at, so the
 * variable cannot be set once and forgotten while the URL moves underneath it.
 *
 * Post-apply verification against production is a separate activity and must
 * be READ-ONLY: confirm the column, the trigger and the index exist, and that
 * no organization carries the marker. The queries for that are at the foot of
 * scripts/demo/pending-migration-is-demo.sql.
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import type { Database } from "../lib/supabase/types";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Refused outright. Not a secret -- it is the public project URL, already
 * committed in .env.production -- and naming it here is what makes the refusal
 * checkable rather than a matter of operator discipline.
 */
const PRODUCTION_REFS = new Set(["ataslxkcflxuilpgyepm"]);

/** The project ref embedded in the Supabase URL, e.g. https://<ref>.supabase.co */
function projectRef(supabaseUrl: string): string | null {
  return /^https:\/\/([a-z0-9]+)\.supabase\.co/i.exec(supabaseUrl)?.[1] ?? null;
}

const targetRef = url ? projectRef(url) : null;
const declaredRef = process.env.DEMO_SECURITY_TEST_TARGET_REF || null;

/**
 * Three conditions, all required. The declared ref must match the URL's, so
 * the opt-in cannot be set once and left behind while the URL changes.
 */
const TARGET_ALLOWED =
  Boolean(targetRef) && declaredRef === targetRef && !PRODUCTION_REFS.has(targetRef!);

const CONFIGURED = Boolean(url && anonKey && serviceKey) && TARGET_ALLOWED;

function refusalReason(): string {
  if (!url || !anonKey || !serviceKey) return "Supabase credentials are not configured.";
  if (!targetRef) return `Could not read a project ref from NEXT_PUBLIC_SUPABASE_URL.`;
  if (PRODUCTION_REFS.has(targetRef)) {
    return (
      `Target ${targetRef} is the PRODUCTION project. This suite writes and ` +
      `must never run there. Point .env.local at a disposable project.`
    );
  }
  if (!declaredRef) {
    return (
      `Set DEMO_SECURITY_TEST_TARGET_REF=${targetRef} to confirm you intend to ` +
      `write to that project.`
    );
  }
  return `DEMO_SECURITY_TEST_TARGET_REF=${declaredRef} does not match the target ${targetRef}.`;
}

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

/**
 * Always runs, and says why the rest did not. A silent skip is how a suite
 * stops being noticed -- this makes the refusal visible in the output.
 */
describe("organizations.is_demo immutability — target check", () => {
  it("reports whether the suite can run against this target", () => {
    if (!CONFIGURED) {
      console.warn(`SKIPPED: ${refusalReason()}`);
    } else if (!columnExists) {
      console.warn(
        "SKIPPED: organizations.is_demo does not exist. Apply " +
          "scripts/demo/pending-migration-is-demo.sql, then re-run.",
      );
    }
    // Never fails: refusing an unsafe target is the correct outcome, not an
    // error. The assertions that matter are in the suite below.
    expect(typeof refusalReason()).toBe("string");
  });
});

describe.skipIf(!CONFIGURED)("organizations.is_demo immutability", () => {
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
    expect(row?.is_demo).toBe(false);
  });

  it.skipIf(!columnExists)("that tenant admin cannot smuggle is_demo alongside a legitimate change", async () => {
    // The realistic attempt: hide the flag in an update that would otherwise
    // be allowed. The trigger fires on the row, not on the statement's intent.
    const { error } = await tenantAdmin!.client
      .from("organizations")
      .update({ tagline: "innocuous", is_demo: true })
      .eq("id", organizationId!);

    expect(error, "the combined update was NOT refused").not.toBeNull();

    const { data: row } = await admin!
      .from("organizations")
      .select("is_demo")
      .eq("id", organizationId!)
      .maybeSingle();
    expect(row?.is_demo).toBe(false);
  });

  it.skipIf(!columnExists)("the service role may set it, so provisioning still works", async () => {
    // The trigger must not be so tight that the designated tenant can never be
    // marked. This is the provisioning path.
    const { error } = await admin!
      .from("organizations")
      .update({ is_demo: true })
      .eq("id", organizationId!);
    expect(error, `service role was refused: ${error?.message}`).toBeNull();

    const { data: row } = await admin!
      .from("organizations")
      .select("is_demo")
      .eq("id", organizationId!)
      .maybeSingle();
    expect(row?.is_demo).toBe(true);

    // Put it back: leaving a stray demo-marked organization would occupy the
    // single-demo index and block the real one.
    await admin!
      .from("organizations")
      .update({ is_demo: false })
      .eq("id", organizationId!);
  });

  it.skipIf(!columnExists)("at most one organization may carry the marker", async () => {
    const { data: rows, error } = await admin!.from("organizations").select("id").eq("is_demo", true);
    expect(error).toBeNull();
    expect((rows ?? []).length).toBeLessThanOrEqual(1);
  });
});
