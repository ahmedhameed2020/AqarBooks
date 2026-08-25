/**
 * Driver for F4 — June 2026: open, bill, collect, close.
 *
 * Dry run:
 *     npx vitest run tests/demo-f4-june.manual.test.ts
 * Apply:
 *     DEMO_F4_APPLY=1 npx vitest run tests/demo-f4-june.manual.test.ts
 *
 * An apply with a missing prerequisite THROWS rather than skipping.
 *
 * WHAT IS DIFFERENT ABOUT JUNE
 * It is the first month with arrears behind it. The collection plan is
 * recomputed over every due that exists, and its verdict for a lease changes as
 * dues accumulate -- a SLOW_30 payer who paid nothing in May now settles the
 * May obligation and skips June. So June collections are NOT June-dues-only by
 * construction, and the applier reconciles each planned settlement against what
 * its due has already received rather than replaying the plan.
 *
 * The close is conditional. If anything remains dated inside June, June stays
 * OPEN and the report says what.
 *
 * Report: test-results/demo-f4-june.txt
 */
import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import type { Database } from "../lib/supabase/types";
import { applyMonthlyRent, verifyMonthlyRent } from "../scripts/demo/apply-monthly-rent";
import {
  applyCollections,
  verifyF3 as verifyCollections,
  monthCompleteness,
  monthBounds,
} from "../scripts/demo/apply-collections";
import { setPeriodStatus } from "../scripts/demo/apply-f2-q2-rent";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const organizationId = process.env.DEMO_ORGANIZATION_ID!;
const ownerEmail = process.env.DEMO_OWNER_EMAIL!;

const APPLY = process.env.DEMO_F4_APPLY === "1";

const MISSING = [
  ["NEXT_PUBLIC_SUPABASE_URL", url],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
  ["DEMO_ORGANIZATION_ID", organizationId],
  ["DEMO_OWNER_EMAIL", ownerEmail],
]
  .filter(([, v]) => !v)
  .map(([n]) => n);

if (APPLY && MISSING.length > 0) {
  throw new Error(`DEMO_F4_APPLY=1 but missing: ${MISSING.join(", ")}. Refusing to skip.`);
}

const JUNE = "2026-06";

const JUNE_OPEN_REASON =
  "Demo financial narrative — June 2026 opened for rent billing and collections";
const JUNE_CLOSE_REASON =
  "Demo financial narrative — June 2026 complete: rent issued, collections posted, nothing further dated inside the period";

/**
 * The direction, from the leases and the May close. Not targets the stage aims
 * at -- every due is its lease's own rent_amount and every receipt is what the
 * payer profile decided -- but the sums that must fall out if the right leases
 * are billed.
 *
 *   AR after the May close                423,790.00
 *   June rent                             504,700.00
 *   pre-collection AR                     928,490.00
 */
const EXPECTED = {
  juneDues: 28,
  juneRent: 504_700,
  totalDues: 69,
  totalRent: 1_585_050,
  arAfterMayClose: 423_790,
  preCollectionAr: 928_490,
};

describe.skipIf(MISSING.length > 0)("F4 June 2026", () => {
  it(APPLY ? "runs the June cycle" : "rehearses the June cycle", async () => {
    const lines: string[] = [
      `F4 — JUNE 2026 ${APPLY ? "— APPLY" : "— DRY RUN"}`,
      "=".repeat(72),
      "",
    ];
    const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });
    const { first, last } = monthBounds(JUNE);

    // ---- precheck ----------------------------------------------------------
    const openingAr = await arSubledger(admin, organizationId);
    lines.push("BEFORE");
    lines.push("-".repeat(72));
    lines.push(`  AR carried in from the May close   ${openingAr.toFixed(2)}`);
    lines.push("");
    expect(openingAr, "AR does not match the May close").toBe(EXPECTED.arAfterMayClose);

    // ---- authorized actor ---------------------------------------------------
    const owner: SupabaseClient<Database> = createClient<Database>(url, anonKey, {
      auth: { persistSession: false },
    });
    const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
      type: "magiclink",
      email: ownerEmail,
    });
    expect(linkErr, `generateLink failed: ${linkErr?.message}`).toBeNull();
    const { error: otpErr } = await owner.auth.verifyOtp({
      token_hash: link!.properties!.hashed_token,
      type: "magiclink",
    });
    expect(otpErr, `owner session failed: ${otpErr?.message}`).toBeNull();

    if (!APPLY) {
      // The rent applier refuses a period that is not OPEN, so a dry run before
      // June is opened can only rehearse the selection. Reported honestly
      // rather than opening the period to make the rehearsal look complete.
      lines.push("DRY RUN");
      lines.push("-".repeat(72));
      lines.push("  June is PLANNED, so the rent and collection appliers cannot rehearse");
      lines.push("  against it -- both refuse a period that is not OPEN. Opening June is");
      lines.push("  the first write of this stage and is not performed here.");
      write(lines);
      await owner.auth.signOut();
      return;
    }

    // ---- 1. open June -------------------------------------------------------
    const opened = await setPeriodStatus(admin, owner, organizationId, JUNE, "OPEN", JUNE_OPEN_REASON);
    lines.push("OPEN JUNE");
    lines.push("-".repeat(72));
    lines.push(`  ${opened.from} -> OPEN`);
    lines.push(`  reason: "${JUNE_OPEN_REASON}"`);
    lines.push("");

    // ---- 2. June rent -------------------------------------------------------
    const rent = await applyMonthlyRent({
      admin,
      owner,
      organizationId,
      month: JUNE,
      dryRun: false,
      log: (l) => lines.push(l),
    });
    lines.push("JUNE RENT");
    lines.push("-".repeat(72));
    lines.push(`  billable monthly leases       ${rent.billable}`);
    lines.push(`  generated                     ${rent.generated}`);
    lines.push(`  already present               ${rent.idempotent}`);
    lines.push(`  not called                    ${rent.notCalled.length}`);
    for (const n of rent.notCalled) lines.push(`    ${n.unitCode.padEnd(12)} ${n.term.padEnd(24)} ${n.why}`);
    lines.push("");
    write(lines);
    expect(rent.failure ?? null, rent.failure ?? "").toBeNull();

    // ---- 3. verify rent -----------------------------------------------------
    const rentCheck = await verifyMonthlyRent(admin, organizationId, JUNE, {
      count: EXPECTED.juneDues,
      amount: EXPECTED.juneRent,
      totalCount: EXPECTED.totalDues,
      totalAmount: EXPECTED.totalRent,
    });
    lines.push(rentCheck.text);
    lines.push("");
    write(lines);
    expect(
      rent.notCalled.filter((n) => n.why.startsWith("PARTIAL")),
      "a lease partially covers June",
    ).toEqual([]);
    expect(rentCheck.pass, "June rent verification failed").toBe(true);

    // ---- 4. replay rent while June is OPEN ----------------------------------
    const beforeRentReplay = await counts(admin, organizationId);
    const rentReplay = await applyMonthlyRent({
      admin,
      owner,
      organizationId,
      month: JUNE,
      dryRun: false,
      log: () => {},
    });
    const afterRentReplay = await counts(admin, organizationId);
    lines.push("RENT REPLAY (while June is OPEN)");
    lines.push("-".repeat(72));
    lines.push(`  newly generated               ${rentReplay.generated}`);
    lines.push(`  new dues                      ${afterRentReplay.dues - beforeRentReplay.dues}`);
    lines.push(`  new journal entries           ${afterRentReplay.entries - beforeRentReplay.entries}`);
    lines.push(`  new generation runs           ${afterRentReplay.runs - beforeRentReplay.runs}`);
    lines.push("");
    expect(rentReplay.generated, "the rent replay generated a due").toBe(0);
    expect(afterRentReplay.dues - beforeRentReplay.dues).toBe(0);
    expect(afterRentReplay.entries - beforeRentReplay.entries).toBe(0);
    expect(afterRentReplay.runs - beforeRentReplay.runs).toBe(0);

    // ---- 5 & 6. collections -------------------------------------------------
    const preCollectionAr = await arSubledger(admin, organizationId);
    lines.push("PRE-COLLECTION AR");
    lines.push("-".repeat(72));
    lines.push(`  ${EXPECTED.arAfterMayClose.toFixed(2)} carried in + ${EXPECTED.juneRent.toFixed(2)} June rent`);
    lines.push(`  = ${preCollectionAr.toFixed(2)}`);
    lines.push("");
    expect(preCollectionAr, "pre-collection AR").toBe(EXPECTED.preCollectionAr);

    const collections = await applyCollections({
      admin,
      owner,
      organizationId,
      month: JUNE,
      dryRun: false,
      log: (l) => lines.push(l),
    });
    lines.push("JUNE COLLECTIONS");
    lines.push("-".repeat(72));
    lines.push(`  receipts posted               ${collections.posted}`);
    lines.push(`  collected                     ${collections.plannedTotal.toFixed(2)}`);
    lines.push(`  top-ups on part-paid dues     ${collections.topUps}`);
    lines.push(`  moved out of a closed month   ${collections.clamped}`);
    lines.push(`  already settled to plan       ${collections.settled}`);
    lines.push(`  belong to a later month       ${collections.deferred}`);
    lines.push("");
    for (const r of collections.results) {
      lines.push(
        `    ${r.unitCode.padEnd(12)} ${r.amount.toFixed(2).padStart(12)}  ${r.method.padEnd(14)}` +
          ` ${r.paymentDate}  ${String(r.daysLate).padStart(3)}d` +
          `${r.clamped ? "  (moved forward)" : ""}${r.topUp ? "  (top-up)" : ""}`,
      );
    }
    lines.push("");
    write(lines);
    expect(collections.failure ?? null, collections.failure ?? "").toBeNull();
    for (const r of collections.results) {
      expect(r.paymentDate >= first && r.paymentDate <= last, `${r.unitCode} ${r.paymentDate}`).toBe(true);
    }

    // ---- 7. verify collections ---------------------------------------------
    const paidCheck = await verifyCollections(admin, organizationId, {
      payments: await paymentCount(admin, organizationId),
      collected: await collectedTotal(admin, organizationId),
      openingAr: EXPECTED.totalRent,
    });
    lines.push(paidCheck.text);
    lines.push("");
    lines.push("JUNE MOVEMENT");
    lines.push("-".repeat(72));
    lines.push(`  pre-collection AR             ${preCollectionAr.toFixed(2)}`);
    lines.push(`  June collections              ${collections.plannedTotal.toFixed(2)}`);
    lines.push(`  closing AR                    ${paidCheck.closingAr.toFixed(2)}`);
    lines.push("");
    write(lines);
    expect(paidCheck.pass, "collections verification failed").toBe(true);
    expect(
      paidCheck.closingAr,
      "closing AR is not pre-collection AR less what June collected",
    ).toBe(Math.round((preCollectionAr - collections.plannedTotal) * 100) / 100);

    // ---- 8. replay collections while June is OPEN ---------------------------
    const beforeReplay = await counts(admin, organizationId);
    const replay = await applyCollections({
      admin,
      owner,
      organizationId,
      month: JUNE,
      dryRun: false,
      log: () => {},
    });
    const afterReplay = await counts(admin, organizationId);
    const seqDrift = afterReplay.sequences.filter((s) => {
      const was = beforeReplay.sequences.find((b) => b.sequence_type === s.sequence_type);
      return !was || was.next_value !== s.next_value;
    });

    lines.push("COLLECTIONS REPLAY (while June is OPEN)");
    lines.push("-".repeat(72));
    lines.push(`  new payments                  ${afterReplay.payments - beforeReplay.payments}`);
    lines.push(`  new allocations               ${afterReplay.allocations - beforeReplay.allocations}`);
    lines.push(`  new journal entries           ${afterReplay.entries - beforeReplay.entries}`);
    lines.push(`  sequences that moved          ${seqDrift.length}`);
    lines.push("");
    expect(replay.failure ?? null, replay.failure ?? "").toBeNull();
    expect(replay.posted, "the replay posted a receipt").toBe(0);
    expect(afterReplay.payments - beforeReplay.payments).toBe(0);
    expect(afterReplay.allocations - beforeReplay.allocations).toBe(0);
    expect(afterReplay.entries - beforeReplay.entries).toBe(0);
    expect(seqDrift, "a document sequence moved on replay").toEqual([]);

    // ---- 9. completeness and close -----------------------------------------
    const completeness = await monthCompleteness(admin, organizationId, JUNE, {
      cashierDeferred: true,
    });
    lines.push(completeness.text);
    lines.push("");

    const beforeClose = await counts(admin, organizationId);
    if (completeness.blockers.length === 0) {
      const closed = await setPeriodStatus(
        admin,
        owner,
        organizationId,
        JUNE,
        "CLOSED",
        JUNE_CLOSE_REASON,
      );
      lines.push("JUNE CLOSED");
      lines.push("-".repeat(72));
      lines.push(`  ${closed.from} -> CLOSED`);
      lines.push(`  reason: "${JUNE_CLOSE_REASON}"`);
    } else {
      lines.push("JUNE LEFT OPEN");
      lines.push("-".repeat(72));
      lines.push("  The close was not attempted. See the blockers above.");
    }
    const afterClose = await counts(admin, organizationId);
    lines.push("");
    lines.push("WHAT THE CLOSE ITSELF WROTE");
    lines.push("-".repeat(72));
    lines.push(`  new dues                      ${afterClose.dues - beforeClose.dues}`);
    lines.push(`  new payments                  ${afterClose.payments - beforeClose.payments}`);
    lines.push(`  new allocations               ${afterClose.allocations - beforeClose.allocations}`);
    lines.push(`  new journal entries           ${afterClose.entries - beforeClose.entries}`);
    lines.push("");

    // ---- 10. final state ----------------------------------------------------
    const { data: finalPeriods } = await admin
      .from("fiscal_periods")
      .select("start_date, status")
      .eq("organization_id", organizationId)
      .order("start_date");
    lines.push("FISCAL STATE");
    lines.push("-".repeat(72));
    for (const p of finalPeriods ?? []) lines.push(`  ${p.start_date.slice(0, 7)}   ${p.status}`);

    const recheck = await verifyCollections(admin, organizationId, {
      payments: await paymentCount(admin, organizationId),
      collected: await collectedTotal(admin, organizationId),
      openingAr: EXPECTED.totalRent,
    });
    lines.push("");
    lines.push(`RE-VERIFIED AFTER THE CLOSE   ${recheck.pass ? "PASS" : "FAIL"}`);

    write(lines);
    await owner.auth.signOut();

    expect(afterClose.dues - beforeClose.dues, "the close wrote dues").toBe(0);
    expect(afterClose.payments - beforeClose.payments, "the close wrote payments").toBe(0);
    expect(afterClose.allocations - beforeClose.allocations, "the close wrote allocations").toBe(0);
    expect(afterClose.entries - beforeClose.entries, "the close wrote journal entries").toBe(0);
    expect(recheck.pass, "the ledger stopped verifying after the close").toBe(true);

    const byMonth = Object.fromEntries(
      (finalPeriods ?? []).map((p) => [p.start_date.slice(0, 7), p.status]),
    );
    for (const m of ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06"]) {
      expect(byMonth[m], `${m} should be CLOSED`).toBe("CLOSED");
    }
    for (const m of ["2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]) {
      expect(byMonth[m], `${m} should be PLANNED`).toBe("PLANNED");
    }
  }, 1_200_000);
});

/** AR from the subledger: what is owed less what has been allocated to it. */
async function arSubledger(admin: SupabaseClient<Database>, organizationId: string) {
  const { data: dues } = await admin
    .from("dues")
    .select("id, amount")
    .eq("organization_id", organizationId)
    .range(0, 4999);
  const { data: paymentRows } = await admin
    .from("payments")
    .select("id")
    .eq("organization_id", organizationId)
    .range(0, 4999);
  const ids = (paymentRows ?? []).map((p) => p.id);
  const { data: allocations } = await admin
    .from("payment_allocations")
    .select("amount")
    .in("payment_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"])
    .range(0, 9999);
  const billed = (dues ?? []).reduce((s, d) => s + Number(d.amount), 0);
  const paid = (allocations ?? []).reduce((s, a) => s + Number(a.amount), 0);
  return Math.round((billed - paid) * 100) / 100;
}

async function paymentCount(admin: SupabaseClient<Database>, organizationId: string) {
  const { count } = await admin
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);
  return count ?? -1;
}

async function collectedTotal(admin: SupabaseClient<Database>, organizationId: string) {
  const { data } = await admin
    .from("payments")
    .select("amount")
    .eq("organization_id", organizationId)
    .range(0, 4999);
  return Math.round((data ?? []).reduce((s, p) => s + Number(p.amount), 0) * 100) / 100;
}

async function counts(admin: SupabaseClient<Database>, organizationId: string) {
  const scoped = async (t: "payments" | "journal_entries" | "dues" | "lease_rent_generation_runs") => {
    const { count } = await admin
      .from(t)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId);
    return count ?? -1;
  };
  const { data: paymentRows } = await admin
    .from("payments")
    .select("id")
    .eq("organization_id", organizationId)
    .range(0, 4999);
  const ids = (paymentRows ?? []).map((p) => p.id);
  const { count: allocations } = await admin
    .from("payment_allocations")
    .select("payment_id", { count: "exact", head: true })
    .in("payment_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);
  const { data: sequences } = await admin
    .from("document_sequences")
    .select("sequence_type, next_value")
    .eq("organization_id", organizationId);

  return {
    dues: await scoped("dues"),
    payments: await scoped("payments"),
    entries: await scoped("journal_entries"),
    runs: await scoped("lease_rent_generation_runs"),
    allocations: allocations ?? -1,
    sequences: sequences ?? [],
  };
}

function write(lines: string[]) {
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/demo-f4-june.txt", lines.join("\n") + "\n", "utf8");
}
