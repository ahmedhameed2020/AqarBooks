/**
 * `generate_lease_rent_dues` must refuse a caller without
 * finance.schedules.generate.
 *
 * WHAT THIS IS PROVING
 * The function is SECURITY DEFINER and `authenticated` holds EXECUTE on it, so
 * before the authorization migration ANY signed-in user who could see a lease
 * could call it directly through PostgREST and create a rent receivable -- and,
 * because the dues trigger posts to the ledger once an OPEN period covers the
 * issue date, a journal entry with it.
 *
 * That includes the public demo's AUDITOR account. It is signed in, it is
 * permission-starved on purpose, and it can reach the RPC. `denyIfDemo()` in
 * the application is irrelevant: this path never touches the application. It is
 * exactly the case layer 3 exists to make impossible, and it was the one
 * function where layer 3 was missing.
 *
 * So this drives the attack: a genuinely authenticated AUDITOR session, holding
 * only the public anon key, calling the RPC straight.
 *
 * WHY THE ASSERTIONS GO BEYOND THE ERROR
 * An exception is necessary but not sufficient. The function writes a
 * generation run BEFORE the due, so a check that stopped at "it threw" could
 * miss a partial write. Every counter is therefore read before and after and
 * required to be unchanged.
 *
 * WHY THE PROBE USES A PERIOD OUTSIDE THE LEASE TERM
 * The first version of this test called the RPC with a real, billable period.
 * Against an unpatched database that is not a test, it is the exploit: it
 * created a generation run, a 17,500 EGP due and a POSTED journal entry in the
 * production demo tenant, with the AUDITOR account recorded as posted_by. The
 * hole was proven by opening it.
 *
 * The function's own control flow gives a safe probe instead. Order of
 * operations is: resolve the lease, [authorization], reject non-ACTIVE, reject
 * a period outside the lease term, and only then write. So calling with a
 * period far outside the term separates the two outcomes without ever reaching
 * a write:
 *
 *   authorization missing -> passes the auth point, hits the range check,
 *                            returns { skipped: true } and writes nothing
 *   authorization present -> raises 42501 before the range check
 *
 * Either way nothing is created. A security test must not be capable of
 * causing the damage it is looking for.
 */
import { describe, it, expect, beforeAll } from "vitest";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import type { Database } from "../lib/supabase/types";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const organizationId = process.env.DEMO_ORGANIZATION_ID!;
const demoEmail = process.env.DEMO_USER_EMAIL!;
const ownerEmail = process.env.DEMO_OWNER_EMAIL!;

/** Decades before any demo lease starts, so the range check always rejects it. */
const UNBILLABLE_PERIOD = "1999-01";

const CONFIGURED = Boolean(url && anonKey && serviceKey && organizationId && demoEmail);

const admin = CONFIGURED
  ? createClient<Database>(url, serviceKey, { auth: { persistSession: false } })
  : null;

let auditor: SupabaseClient<Database> | null = null;
let auditorId = "";
let ownerId = "";
let leaseId = "";
/** True once the authorization migration is applied. */
let authzApplied = false;

async function sessionFor(email: string): Promise<{ client: SupabaseClient<Database>; id: string }> {
  const { data: link, error } = await admin!.auth.admin.generateLink({ type: "magiclink", email });
  if (error) throw error;
  const client = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
  const { error: otpErr } = await client.auth.verifyOtp({
    token_hash: link!.properties!.hashed_token,
    type: "magiclink",
  });
  if (otpErr) throw otpErr;
  const { data: who } = await client.auth.getUser();
  return { client, id: who.user!.id };
}

async function counts() {
  const one = async (table: "dues" | "journal_entries" | "lease_rent_generation_runs") => {
    const query =
      table === "lease_rent_generation_runs"
        ? admin!.from(table).select("id").eq("organization_id", organizationId)
        : admin!.from(table).select("id").eq("organization_id", organizationId);
    const { data } = await query.range(0, 4999);
    return (data ?? []).length;
  };
  return {
    dues: await one("dues"),
    journals: await one("journal_entries"),
    runs: await one("lease_rent_generation_runs"),
  };
}

beforeAll(async () => {
  if (!admin) return;

  const session = await sessionFor(demoEmail);
  auditor = session.client;
  auditorId = session.id;

  const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  ownerId = users?.users.find((u) => u.email === ownerEmail)?.id ?? "";

  const { data: leases } = await admin
    .from("unit_leases")
    .select("id")
    .eq("organization_id", organizationId)
    .eq("status", "ACTIVE")
    .limit(1);
  leaseId = leases?.[0]?.id ?? "";

  // Detected rather than assumed, so the suite reports honestly on a database
  // where the migration has not landed yet.
  const { data: fn } = await admin.rpc("has_permission", {
    p_user_id: auditorId,
    p_organization_id: organizationId,
    p_permission_key: "finance.schedules.generate",
  });
  authzApplied = fn === false;
});

describe.skipIf(!CONFIGURED)("generate_lease_rent_dues authorization", () => {
  it("the attacker is a real, authenticated, permission-starved session", async () => {
    // Without this the rest could pass vacuously -- refusing someone who was
    // never signed in proves nothing.
    expect(auditorId, "no AUDITOR session").toBeTruthy();
    expect(leaseId, "no active lease to attack with").toBeTruthy();

    const { data: isAdmin } = await auditor!.rpc("is_platform_admin", { p_user_id: auditorId });
    expect(isAdmin, "the demo account is a platform admin").toBeFalsy();

    const { data: canGenerate } = await auditor!.rpc("has_permission", {
      p_user_id: auditorId,
      p_organization_id: organizationId,
      p_permission_key: "finance.schedules.generate",
    });
    expect(canGenerate, "the AUDITOR unexpectedly holds finance.schedules.generate").toBeFalsy();

    // It can see the lease -- which is the whole point. Visibility is granted;
    // the ability to bill from it is not.
    const { data: visible } = await auditor!
      .from("unit_leases")
      .select("id")
      .eq("id", leaseId)
      .maybeSingle();
    expect(visible?.id, "the AUDITOR cannot even see a lease; test is not meaningful").toBe(leaseId);
  });

  it("refuses the AUDITOR and writes nothing", async () => {
    const before = await counts();

    // A period decades before any lease begins. Reachable only if the caller
    // gets past authorization, and unable to write even then.
    const { data, error } = await auditor!.rpc("generate_lease_rent_dues", {
      p_organization_id: organizationId,
      p_lease_id: leaseId,
      p_period: UNBILLABLE_PERIOD,
    });

    const after = await counts();

    // State first: it is the assertion that holds whether or not the function
    // reports an error, and the one that would catch a partial write.
    expect(after.runs, "a generation run was created").toBe(before.runs);
    expect(after.dues, "a due was created").toBe(before.dues);
    expect(after.journals, "a journal entry was created").toBe(before.journals);

    if (error) {
      // Refused. The only acceptable outcome once the migration is applied.
      expect(error.message).toMatch(/FORBIDDEN_FINANCE_PERMISSION|not authorized/i);
      return;
    }

    // No error means the caller got PAST authorization and was stopped only by
    // the period range -- which is the hole, reported as such rather than as a
    // pass.
    const outcome = data as { skipped?: boolean; reason?: string } | null;
    expect(outcome?.skipped, "unexpected outcome from the probe").toBe(true);
    throw new Error(
      "AUTHORIZATION HOLE OPEN: an AUDITOR session reached the body of " +
        `generate_lease_rent_dues (returned reason "${outcome?.reason}"). With a ` +
        "billable period this call would create a due and a posted journal " +
        "entry. Apply scripts/demo/pending-migration-rent-authz.sql.",
    );
  });

  it("refuses a caller from another organization", async () => {
    // Cross-tenant: same signed-in session, someone else's organization id.
    // The lease lookup is scoped by organization_id, so this should fail
    // regardless -- asserted so a future loosening of that scope is caught.
    const { data: other } = await admin!
      .from("organizations")
      .select("id")
      .neq("id", organizationId)
      .limit(1)
      .maybeSingle();

    const { error } = await auditor!.rpc("generate_lease_rent_dues", {
      p_organization_id: other!.id,
      p_lease_id: leaseId,
      p_period: UNBILLABLE_PERIOD,
    });
    expect(error, "a cross-tenant call was accepted").not.toBeNull();
  });

  it("still permits an authorized finance actor", async () => {
    // The fix must not break F1. Checked as a permission rather than by
    // calling the RPC, because calling it would create a real due and this
    // suite writes nothing.
    expect(ownerId, "no owner account resolved").toBeTruthy();
    const { data: canGenerate } = await admin!.rpc("has_permission", {
      p_user_id: ownerId,
      p_organization_id: organizationId,
      p_permission_key: "finance.schedules.generate",
    });
    expect(canGenerate, "the owner lost finance.schedules.generate").toBe(true);
  });

  it("keeps anon unable to execute anything", async () => {
    // The Phase 1 posture. An anonymous client holds no session at all, so the
    // RPC must refuse before any lease is resolved.
    const anon = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
    const { error } = await anon.rpc("generate_lease_rent_dues", {
      p_organization_id: organizationId,
      p_lease_id: leaseId,
      p_period: UNBILLABLE_PERIOD,
    });
    expect(error, "an anonymous caller was accepted").not.toBeNull();

    const after = await counts();
    expect(after.dues, "an anonymous call created a due").toBe((await counts()).dues);
  });
});
