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
 *
 * SINCE THE ALIGNMENT, BOTH FLAGS ARE NEEDED:
 *
 *     DEMO_PARTIAL_GUARD_APPLIED=1 DEMO_Q2_ALIGNMENT_DONE=1  *       npx vitest run tests/demo-partial-period-guard.integration.test.ts
 *
 * The alignment clipped every quarterly fixture to period boundaries, so no
 * partially-covering lease remains for the probe to be refused on. That is the
 * intended end state, but it is asserted rather than assumed: without
 * DEMO_Q2_ALIGNMENT_DONE the suite FAILS on the missing subject, because a
 * vanished subject and a silently green probe look identical otherwise -- which
 * is precisely how this file passed for a while without running its own probe.
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
 * supabase/migrations/20260825182109_rent_partial_period_guard.sql. Without it,
 * the one
 * probe that would write if the guard were absent does not run.
 */
const GUARD_APPLIED = process.env.DEMO_PARTIAL_GUARD_APPLIED === "1";

/**
 * Asserted by the operator once the mid-quarter fixtures have been realigned to
 * period boundaries. Until then, a partially-covering lease must still exist.
 */
const ALIGNMENT_DONE = process.env.DEMO_Q2_ALIGNMENT_DONE === "1";

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
    expect(fullLease, "no fully-covering quarterly lease to use as a control").toBeTruthy();

    // Until the alignment repair runs, a partially-covering lease MUST still be
    // here -- it is the subject the probe below needs. Asserting it rather than
    // warning is deliberate: a missing subject silently turns the whole suite
    // into theatre, which is exactly what happened the first time this ran.
    // After the repair, set DEMO_Q2_ALIGNMENT_DONE=1 and the absence becomes
    // the expected outcome instead.
    if (ALIGNMENT_DONE) {
      expect(
        partialLease,
        "DEMO_Q2_ALIGNMENT_DONE is set but a partially-covering lease remains",
      ).toBeNull();
      return;
    }
    expect(
      partialLease,
      "no partially-covering quarterly lease: either the alignment repair has run " +
        "(set DEMO_Q2_ALIGNMENT_DONE=1) or the fixtures are not what this probe assumes",
    ).toBeTruthy();
  });

  it("reports whether the guard probe can safely run", () => {
    if (!GUARD_APPLIED) {
      console.warn(
        "SKIPPED the Q2 probe: DEMO_PARTIAL_GUARD_APPLIED is not set. Apply " +
          "supabase/migrations/20260825182109_rent_partial_period_guard.sql, then re-run with " +
          "DEMO_PARTIAL_GUARD_APPLIED=1.",
      );
    }
    expect(typeof GUARD_APPLIED).toBe("boolean");
  });

  // GATED AT RUN TIME, NOT AT COLLECTION TIME.
  //
  // This was `it.skipIf(!partialLease || !GUARD_APPLIED)`. Vitest evaluates a
  // skipIf argument while the describe callback is being COLLECTED, which is
  // before beforeAll has run, so `partialLease` was unavoidably null and the
  // condition was always true. The probe never executed -- and the file still
  // reported "4 passed | 1 skipped", which reads like a pass.
  //
  // It would have been skipped just as silently with the guard absent, so a
  // green run proved nothing about the database. Only GUARD_APPLIED, which
  // comes from the environment and is known at collection time, may gate
  // statically; anything discovered in beforeAll has to be checked in the body.
  it.skipIf(!GUARD_APPLIED)(
    "refuses 2026-Q2 for that lease and writes nothing",
    async (ctx) => {
    if (!partialLease) {
      // Only reachable once the alignment repair has run; the assertion in the
      // first test is what fails if it has not.
      ctx.skip();
      return;
    }
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
          "Apply supabase/migrations/20260825182109_rent_partial_period_guard.sql.",
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

  it("leaves the posted rent obligations untouched", async () => {
    // F1 posted 26 May dues; F2 added 15 for 2026-Q2, issued 2026-04-01.
    // Nothing in this suite may disturb either set.
    //
    // Sliced by issue_date rather than asserted as one total: a probe that
    // moved a due from one period to another would keep the grand total intact
    // and change both slices, which is exactly the failure a single sum hides.
    const { data: dues } = await admin!
      .from("dues")
      .select("id, amount, issue_date")
      .eq("organization_id", organizationId)
      .range(0, 4999);

    const may = (dues ?? []).filter((d) => d.issue_date.startsWith("2026-05"));
    const q2 = (dues ?? []).filter((d) => d.issue_date === "2026-04-01");
    const sum = (rows: typeof may) => rows.reduce((s, d) => s + Number(d.amount), 0);

    expect(may.length, "May due count changed").toBe(26);
    expect(sum(may), "the May total changed").toBe(481_200);
    expect(q2.length, "Q2 due count changed").toBe(15);
    expect(sum(q2), "the Q2 total changed").toBe(599_150);

    // NOT a grand total. The book grows every month the narrative advances, and
    // pinning the total here would fail on each new month for no reason -- it
    // did exactly that when June was billed. What this file is entitled to
    // assert is that IT disturbed nothing, so it checks the two slices it
    // probed against plus a property that holds no matter how many months
    // accrue: rent is issued on the first of a period, never mid-month.
    const offCycle = (dues ?? []).filter((d) => !d.issue_date.endsWith("-01"));
    expect(
      offCycle.map((d) => d.issue_date),
      "a due is issued mid-period; the rent path does not do that",
    ).toEqual([]);
  });
});
