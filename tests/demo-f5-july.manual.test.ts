/**
 * Driver for F5 — July 2026: open, bill monthly AND quarterly, collect, close.
 *
 * Dry run:
 *     npx vitest run tests/demo-f5-july.manual.test.ts
 * Apply:
 *     DEMO_F5_APPLY=1 npx vitest run tests/demo-f5-july.manual.test.ts
 *
 * WHAT IS DIFFERENT ABOUT JULY
 * It is the first month carrying two rent cycles at once: 31 monthly leases
 * bill 2026-07 and 18 quarterly leases bill 2026-Q3, and BOTH date their dues
 * 2026-07-01. The generators run once per frequency so the two totals stay
 * separable, and the verification slices by the lease's frequency rather than
 * by the issue date -- on the date alone a missing monthly due would hide
 * behind an extra quarterly one.
 *
 * Report: test-results/demo-f5-july.txt
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

const APPLY = process.env.DEMO_F5_APPLY === "1";

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
  throw new Error(`DEMO_F5_APPLY=1 but missing: ${MISSING.join(", ")}. Refusing to skip.`);
}

const JULY = "2026-07";
const Q3 = "2026-Q3";

const JULY_OPEN_REASON =
  "Demo financial narrative — July 2026 opened for monthly and quarterly rent billing and collections";
const JULY_CLOSE_REASON =
  "Demo financial narrative — July 2026 complete: monthly and Q3 rent issued, collections posted, nothing further dated inside the period";

/**
 * The direction, derived from the leases and the June close. Every due is its
 * lease's own rent_amount; these are the sums that must fall out if exactly the
 * right leases are billed.
 *
 *   AR after the June close                542,890.00
 *   July monthly rent   31 dues            572,750.00
 *   2026-Q3 rent        18 dues            703,750.00
 *   July billing        49 dues          1,276,500.00
 *   pre-collection AR                    1,819,390.00
 */
const EXPECTED = {
  monthlyDues: 31,
  quarterlyDues: 18,
  julyDues: 49,
  julyRent: 1_276_500,
  totalDues: 118,
  totalRent: 2_861_550,
  arAfterJuneClose: 542_890,
  preCollectionAr: 1_819_390,
};

describe.skipIf(MISSING.length > 0)("F5 July 2026", () => {
  it(APPLY ? "runs the July cycle" : "rehearses the July cycle", async () => {
    const lines: string[] = [
      `F5 — JULY 2026 ${APPLY ? "— APPLY" : "— DRY RUN"}`,
      "=".repeat(72),
      "",
    ];
    const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });
    const { first, last } = monthBounds(JULY);

    const openingAr = await arSubledger(admin, organizationId);
    lines.push("BEFORE");
    lines.push("-".repeat(72));
    lines.push(`  AR carried in from the June close  ${openingAr.toFixed(2)}`);
    lines.push("");
    expect(openingAr, "AR does not match the June close").toBe(EXPECTED.arAfterJuneClose);

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
      lines.push("DRY RUN");
      lines.push("-".repeat(72));
      lines.push("  July is PLANNED. Both generators and the collection applier refuse a");
      lines.push("  period that is not OPEN, so nothing further can be rehearsed against it.");
      lines.push("  Opening July is the first write of this stage and is not performed here.");
      write(lines);
      await owner.auth.signOut();
      return;
    }

    // ---- open July ----------------------------------------------------------
    const opened = await setPeriodStatus(admin, owner, organizationId, JULY, "OPEN", JULY_OPEN_REASON);
    lines.push("OPEN JULY");
    lines.push("-".repeat(72));
    lines.push(`  ${opened.from} -> OPEN`);
    lines.push(`  reason: "${JULY_OPEN_REASON}"`);
    lines.push("");

    // ---- monthly rent -------------------------------------------------------
    const monthly = await applyMonthlyRent({
      admin,
      owner,
      organizationId,
      month: JULY,
      frequency: "MONTHLY",
      dryRun: false,
      log: (l) => lines.push(l),
    });
    lines.push("JULY MONTHLY RENT");
    lines.push("-".repeat(72));
    lines.push(`  billable                      ${monthly.billable}`);
    lines.push(`  generated                     ${monthly.generated}`);
    lines.push(`  not called                    ${monthly.notCalled.length}`);
    for (const n of monthly.notCalled) lines.push(`    ${n.unitCode.padEnd(12)} ${n.term.padEnd(24)} ${n.why}`);
    lines.push("");
    write(lines);
    expect(monthly.failure ?? null, monthly.failure ?? "").toBeNull();

    // ---- Q3 quarterly rent --------------------------------------------------
    const quarterly = await applyMonthlyRent({
      admin,
      owner,
      organizationId,
      month: Q3,
      frequency: "QUARTERLY",
      // Q3 bills 2026-Q3 and dates every due 2026-07-01, so the period that has
      // to be OPEN is July -- the quarter key is not a fiscal period.
      fiscalMonth: JULY,
      dryRun: false,
      log: (l) => lines.push(l),
    });
    lines.push("2026-Q3 COMMERCIAL RENT");
    lines.push("-".repeat(72));
    lines.push(`  billable                      ${quarterly.billable}`);
    lines.push(`  generated                     ${quarterly.generated}`);
    lines.push(`  not called                    ${quarterly.notCalled.length}`);
    for (const n of quarterly.notCalled) lines.push(`    ${n.unitCode.padEnd(12)} ${n.term.padEnd(24)} ${n.why}`);
    lines.push("");
    write(lines);
    expect(quarterly.failure ?? null, quarterly.failure ?? "").toBeNull();

    for (const [label, r] of [["monthly", monthly], ["quarterly", quarterly]] as const) {
      expect(
        r.notCalled.filter((n) => n.why.startsWith("PARTIAL")),
        `a ${label} lease partially covers its July period`,
      ).toEqual([]);
    }

    // ---- verify both slices --------------------------------------------------
    const monthlyCheck = await verifyMonthlyRent(
      admin,
      organizationId,
      JULY,
      {
        count: EXPECTED.monthlyDues,
        amount: monthly.plannedTotal,
        totalCount: EXPECTED.totalDues,
        totalAmount: EXPECTED.totalRent,
      },
      "MONTHLY",
    );
    lines.push(monthlyCheck.text);
    lines.push("");
    const quarterlyCheck = await verifyMonthlyRent(
      admin,
      organizationId,
      Q3,
      {
        count: EXPECTED.quarterlyDues,
        amount: quarterly.plannedTotal,
        totalCount: EXPECTED.totalDues,
        totalAmount: EXPECTED.totalRent,
      },
      "QUARTERLY",
    );
    lines.push(quarterlyCheck.text);
    lines.push("");

    const julyBilled = await billedOn(admin, organizationId, first);
    lines.push("JULY BILLING TOTAL");
    lines.push("-".repeat(72));
    lines.push(`  monthly    ${String(EXPECTED.monthlyDues).padStart(3)} dues  ${monthly.plannedTotal.toFixed(2).padStart(14)}`);
    lines.push(`  2026-Q3    ${String(EXPECTED.quarterlyDues).padStart(3)} dues  ${quarterly.plannedTotal.toFixed(2).padStart(14)}`);
    lines.push(`  dated ${first}   ${String(julyBilled.count).padStart(3)} dues  ${julyBilled.amount.toFixed(2).padStart(14)}`);
    lines.push("");
    write(lines);

    expect(monthlyCheck.pass, "July monthly rent verification failed").toBe(true);
    expect(quarterlyCheck.pass, "Q3 rent verification failed").toBe(true);
    expect(julyBilled.count, "dues dated 2026-07-01").toBe(EXPECTED.julyDues);
    expect(julyBilled.amount, "July billing total").toBe(EXPECTED.julyRent);

    // ---- replay both generators ---------------------------------------------
    const beforeRent = await counts(admin, organizationId);
    const monthlyReplay = await applyMonthlyRent({
      admin, owner, organizationId, month: JULY, frequency: "MONTHLY", dryRun: false, log: () => {},
    });
    const quarterlyReplay = await applyMonthlyRent({
      admin, owner, organizationId, month: Q3, frequency: "QUARTERLY", fiscalMonth: JULY, dryRun: false, log: () => {},
    });
    const afterRent = await counts(admin, organizationId);
    lines.push("RENT REPLAY (while July is OPEN)");
    lines.push("-".repeat(72));
    lines.push(`  newly generated, monthly      ${monthlyReplay.generated}`);
    lines.push(`  newly generated, quarterly    ${quarterlyReplay.generated}`);
    lines.push(`  new dues                      ${afterRent.dues - beforeRent.dues}`);
    lines.push(`  new journal entries           ${afterRent.entries - beforeRent.entries}`);
    lines.push(`  new generation runs           ${afterRent.runs - beforeRent.runs}`);
    lines.push("");
    expect(monthlyReplay.generated + quarterlyReplay.generated, "a replay generated a due").toBe(0);
    expect(afterRent.dues - beforeRent.dues).toBe(0);
    expect(afterRent.entries - beforeRent.entries).toBe(0);
    expect(afterRent.runs - beforeRent.runs).toBe(0);

    // ---- collections ---------------------------------------------------------
    const preCollectionAr = await arSubledger(admin, organizationId);
    lines.push("PRE-COLLECTION AR");
    lines.push("-".repeat(72));
    lines.push(`  ${EXPECTED.arAfterJuneClose.toFixed(2)} carried in + ${EXPECTED.julyRent.toFixed(2)} July billing`);
    lines.push(`  = ${preCollectionAr.toFixed(2)}`);
    lines.push("");
    expect(preCollectionAr, "pre-collection AR").toBe(EXPECTED.preCollectionAr);

    const collections = await applyCollections({
      admin, owner, organizationId, month: JULY, dryRun: false, log: (l) => lines.push(l),
    });
    lines.push("JULY COLLECTIONS");
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

    const paidCheck = await verifyCollections(admin, organizationId, {
      payments: await paymentCount(admin, organizationId),
      collected: await collectedTotal(admin, organizationId),
      openingAr: EXPECTED.totalRent,
    });
    lines.push(paidCheck.text);
    lines.push("");
    lines.push("JULY MOVEMENT");
    lines.push("-".repeat(72));
    lines.push(`  pre-collection AR             ${preCollectionAr.toFixed(2)}`);
    lines.push(`  July collections              ${collections.plannedTotal.toFixed(2)}`);
    lines.push(`  closing AR                    ${paidCheck.closingAr.toFixed(2)}`);
    lines.push("");
    write(lines);
    expect(paidCheck.pass, "collections verification failed").toBe(true);
    expect(paidCheck.closingAr, "closing AR is not pre-collection AR less July collections").toBe(
      Math.round((preCollectionAr - collections.plannedTotal) * 100) / 100,
    );

    // ---- replay collections ---------------------------------------------------
    const beforeReplay = await counts(admin, organizationId);
    const replay = await applyCollections({
      admin, owner, organizationId, month: JULY, dryRun: false, log: () => {},
    });
    const afterReplay = await counts(admin, organizationId);
    const seqDrift = afterReplay.sequences.filter((s) => {
      const was = beforeReplay.sequences.find((b) => b.sequence_type === s.sequence_type);
      return !was || was.next_value !== s.next_value;
    });
    lines.push("COLLECTIONS REPLAY (while July is OPEN)");
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

    // ---- completeness and close ------------------------------------------------
    const completeness = await monthCompleteness(admin, organizationId, JULY, {
      cashierDeferred: true,
    });
    lines.push(completeness.text);
    lines.push("");

    const beforeClose = await counts(admin, organizationId);
    if (completeness.blockers.length === 0) {
      const closed = await setPeriodStatus(admin, owner, organizationId, JULY, "CLOSED", JULY_CLOSE_REASON);
      lines.push("JULY CLOSED");
      lines.push("-".repeat(72));
      lines.push(`  ${closed.from} -> CLOSED`);
      lines.push(`  reason: "${JULY_CLOSE_REASON}"`);
    } else {
      lines.push("JULY LEFT OPEN");
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
    for (const m of ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]) {
      expect(byMonth[m], `${m} should be CLOSED`).toBe("CLOSED");
    }
    for (const m of ["2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]) {
      expect(byMonth[m], `${m} should be PLANNED`).toBe("PLANNED");
    }
  }, 1_800_000);
});

async function billedOn(admin: SupabaseClient<Database>, organizationId: string, date: string) {
  const { data } = await admin
    .from("dues")
    .select("amount, issue_date")
    .eq("organization_id", organizationId)
    .eq("issue_date", date)
    .range(0, 4999);
  return {
    count: (data ?? []).length,
    amount: Math.round((data ?? []).reduce((s, d) => s + Number(d.amount), 0) * 100) / 100,
  };
}

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
  writeFileSync("test-results/demo-f5-july.txt", lines.join("\n") + "\n", "utf8");
}
