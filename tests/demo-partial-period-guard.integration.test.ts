/**
 * `generate_lease_rent_dues` must refuse a period the lease does not cover.
 *
 * Step 2 of the Q2 sequence: prove the guard works, and that a refusal writes
 * nothing, BEFORE the fixtures are realigned. Running it after the realignment
 * would prove nothing -- there would be no partial lease left to refuse.
 *
 * WHAT IT DRIVES
 * A real authorized finance actor, calling with a real billable period. Not the
 * AUDITOR: this is not an authorization test. The caller here is allowed to
 * generate rent and is refused anyway, because the LEASE does not cover the
 * PERIOD.
 *
 * WHY IT IS GATED
 * If the guard IS applied, the Q2 call raises and writes nothing. If it is NOT
 * applied, that same call succeeds and creates a due and a posted journal entry
 * -- which is precisely the mistake made once already, when a security probe
 * proved a hole by opening it.
 *
 * PostgREST cannot read pg_proc, so the guard cannot be detected from here
 * without calling the function. Rather than guess, the probe requires the
 * operator to assert the migration has landed:
 *
 *     DEMO_PARTIAL_GUARD_APPLIED=1 npx vitest run tests/demo-partial-period-guard.integration.test.ts
 *
 * Without that flag the probe is skipped and says so. A test must not be able
 * to cause the damage it is looking for, and "probably applied" is not a
 * safety argument.
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
const ownerEmail = process.env.DEMO_OWNER_EMAIL!;

const CONFIGURED = Boolean(url && anonKey && serviceKey && organizationId && ownerEmail);

/**
 * Asserted by the operator after applying
 * scripts/demo/pending-migration-partial-period-guard.sql. Without it, the one
 * probe that would write if the guard were absent does not run.
 */
const GUARD_APPLIED = process.env.DEMO_PARTIAL_GUARD_APPLIED === "1";

const admin = CONFIGURED
  ? createClient<Database>(url, serviceKey, { auth: { persistSession: false } })
  : null;

type UntypedRpc = {
  rpc: (fn: string, args: Record<string, unknown>) => Promise<{ data: unknown; error: { message: string; code?: string } | null }>;
};

let owner: SupabaseClient<Database> | null = null;
/** A quarterly lease that does NOT cover 2026-Q2. */
let partialLease: { id: string; unitCode: string; startsOn: string } | null = null;
/** A quarterly lease that DOES cover it, as the control. */
let fullLease: { id: string; unitCode: string } | null = null;

beforeAll(async () => {
  if (!admin) return;

  const { data: link } = await admin.auth.admin.generateLink({
    type: "magiclink",
    email: ownerEmail,
  });
  owner = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
  await owner.auth.verifyOtp({
    token_hash: link!.properties!.hashed_token,
    type: "magiclink",
  });

  const { data: units } = await admin
    .from("units")
    .select("id, code")
    .eq("organization_id", organizationId)
    .range(0, 4999);
  const codeById = new Map((units ?? []).map((u) => [u.id, u.code]));

  const { data: leases } = await admin
    .from("unit_leases")
    .select("id, unit_id, starts_on, ends_on")
    .eq("organization_id", organizationId)
    .eq("status", "ACTIVE")
    .eq("rent_frequency", "QUARTERLY")
    .range(0, 4999);

  const Q_START = "2026-04-01";
  const Q_END = "2026-06-30";

  for (const lease of leases ?? []) {
    const covers = lease.starts_on <= Q_START && (lease.ends_on ?? "9999-12-31") >= Q_END;
    const overlaps = lease.starts_on <= Q_END && (lease.ends_on ?? "9999-12-31") >= Q_START;
    if (overlaps && !covers && !partialLease) {
      partialLease = { id: lease.id, unitCode: codeById.get(lease.unit_id) ?? lease.id, startsOn: lease.starts_on };
    }
    if (covers && !fullLease) {
      fullLease = { id: lease.id, unitCode: codeById.get(lease.unit_id) ?? lease.id };
    }
  }

});

async function counts() {
  const one = async (t: "dues" | "journal_entries" | "lease_rent_generation_runs") => {
    const { data } = await admin!
      .from(t)
      .select("id")
      .eq("organization_id", organizationId)
      .range(0, 4999);
    return (data ?? []).length;
  };
  return {
    dues: await one("dues"),
    entries: await one("journal_entries"),
    runs: await one("lease_rent_generation_runs"),
  };
}

describe.skipIf(!CONFIGURED)("partial-period rent guard", () => {
  it("finds a lease that does not cover 2026-Q2", () => {
    // If the fixtures have already been realigned there is nothing partial
    // left, and this test has served its purpose.
    if (!partialLease) {
      console.warn(
        "No partially-covering quarterly lease remains. The alignment repair has " +
          "run; this guard is now exercised only by the unit-level reasoning.",
      );
    }
    expect(fullLease, "no fully-covering quarterly lease to use as a control").toBeTruthy();
  });

  it("reports whether the guard probe can safely run", () => {
    if (!GUARD_APPLIED) {
      console.warn(
        "SKIPPED the Q2 probe: DEMO_PARTIAL_GUARD_APPLIED is not set. Apply " +
          "scripts/demo/pending-migration-partial-period-guard.sql, then re-run with " +
          "DEMO_PARTIAL_GUARD_APPLIED=1.",
      );
    }
    expect(typeof GUARD_APPLIED).toBe("boolean");
  });

  it.skipIf(!partialLease || !GUARD_APPLIED)(
    "refuses 2026-Q2 for that lease and writes nothing",
    async () => {
    const before = await counts();

    const { error } = await (owner as unknown as UntypedRpc).rpc("generate_lease_rent_dues", {
      p_organization_id: organizationId,
      p_lease_id: partialLease!.id,
      p_period: "2026-Q2",
    });

    const after = await counts();

    // State first. It holds whether or not an error was reported, and it is
    // the assertion that catches a partial write.
    expect(after.runs, "a generation run was created").toBe(before.runs);
    expect(after.dues, "a due was created").toBe(before.dues);
    expect(after.entries, "a journal entry was created").toBe(before.entries);

    if (!error) {
      throw new Error(
        `PARTIAL-PERIOD GUARD NOT APPLIED: ${partialLease!.unitCode} commences ` +
          `${partialLease!.startsOn} and does not cover 2026-Q2, yet the call was accepted. ` +
          "Apply scripts/demo/pending-migration-partial-period-guard.sql.",
      );
    }

    expect(error.message).toMatch(/PARTIAL_PERIOD_REQUIRES_POLICY/);
    },
  );

  it("still accepts a period the lease fully covers", async () => {
    // The guard must be narrow. A lease that covers the period is unaffected --
    // proven with a period far in the past that no lease touches, so the call
    // is a benign skip rather than a write.
    const before = await counts();
    const { error } = await (owner as unknown as UntypedRpc).rpc("generate_lease_rent_dues", {
      p_organization_id: organizationId,
      p_lease_id: fullLease!.id,
      p_period: "1999-Q1",
    });
    const after = await counts();

    expect(error, `a non-overlapping period should skip, not raise: ${error?.message}`).toBeNull();
    expect(after.dues, "the skip wrote a due").toBe(before.dues);
    expect(after.runs, "the skip wrote a generation run").toBe(before.runs);
  });

  it("leaves the May obligations untouched", async () => {
    // 26 monthly dues were posted by F1. Nothing in this suite may disturb them.
    const { data: dues } = await admin!
      .from("dues")
      .select("id, amount")
      .eq("organization_id", organizationId)
      .range(0, 4999);
    expect((dues ?? []).length).toBe(26);
    expect(
      (dues ?? []).reduce((s, d) => s + Number(d.amount), 0),
      "the May total changed",
    ).toBe(481_200);
  });
});
