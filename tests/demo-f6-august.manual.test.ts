/**
 * Driver for F6 — August 2026, the last stage of the financial narrative.
 *
 * Dry run:
 *     npx vitest run tests/demo-f6-august.manual.test.ts
 * Apply:
 *     DEMO_F6_APPLY=1 npx vitest run tests/demo-f6-august.manual.test.ts
 *
 * ORDER, AND WHY IT IS THIS ORDER
 *   rent  -> CAM  -> plan  -> cashboxes/sessions -> collections
 *         -> cashier close/reconcile -> bank statement -> snapshot
 *
 * CAM precedes collections because a service charge is a receivable and the
 * collection plan has to see it; billed afterwards it would sit permanently
 * unpaid. Cashboxes precede collections because record_payment writes a
 * cash_transaction only when a session is passed at recording time, so a CASH
 * receipt either goes through the till on the way in or never has lineage. The
 * bank statement follows collections because auto-matching needs the posted
 * bank lines to exist.
 *
 * AUGUST STAYS OPEN. It is the current operating period; closing it would make
 * the demo a finished book rather than a live one.
 *
 * Report: test-results/demo-f6-august.txt
 */
import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import type { Database } from "../lib/supabase/types";
import { applyMonthlyRent, verifyMonthlyRent } from "../scripts/demo/apply-monthly-rent";
import { applyCam, verifyCam, CAM_TOTAL } from "../scripts/demo/apply-cam";
import {
  openCashierSessions,
  closeCashierSessions,
  verifyCashier,
} from "../scripts/demo/apply-cashier";
import {
  applyBankReconciliation,
  verifyBankReconciliation,
} from "../scripts/demo/apply-bank-reconciliation";
import {
  applyCollections,
  verifyF3 as verifyCollections,
  monthBounds,
} from "../scripts/demo/apply-collections";
import { setPeriodStatus } from "../scripts/demo/apply-f2-q2-rent";
import { renderDemoSnapshot } from "../scripts/demo/demo-snapshot";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const organizationId = process.env.DEMO_ORGANIZATION_ID!;
const ownerEmail = process.env.DEMO_OWNER_EMAIL!;

const APPLY = process.env.DEMO_F6_APPLY === "1";

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
  throw new Error(`DEMO_F6_APPLY=1 but missing: ${MISSING.join(", ")}. Refusing to skip.`);
}

const AUGUST = "2026-08";
const AUGUST_OPEN_REASON =
  "Demo financial narrative — August 2026 opened as the current operating period";

/**
 *   AR after the July close                815,620.00
 *   August monthly rent  31 dues           572,750.00
 *   AR before CAM                        1,388,370.00
 *   August CAM           91 dues           185,000.00
 *   pre-collection AR                    1,573,370.00
 */
const EXPECTED = {
  monthlyDues: 31,
  monthlyRent: 572_750,
  camUnits: 91,
  arAfterJulyClose: 815_620,
  arBeforeCam: 1_388_370,
  preCollectionAr: 1_573_370,
};

describe.skipIf(MISSING.length > 0)("F6 August 2026", () => {
  it(APPLY ? "runs the August cycle" : "rehearses the August cycle", async () => {
    const lines: string[] = [
      `F6 — AUGUST 2026 ${APPLY ? "— APPLY" : "— DRY RUN"}`,
      "=".repeat(72),
      "",
    ];
    const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });
    const { first, last } = monthBounds(AUGUST);

    const openingAr = await arSubledger(admin, organizationId);
    const augustCollected = await augustReceiptCount(admin, organizationId);
    const fresh = augustCollected === 0;

    lines.push("BEFORE");
    lines.push("-".repeat(72));
    lines.push(`  AR at the start of this run        ${openingAr.toFixed(2)}`);
    lines.push(`  August receipts already posted     ${augustCollected}`);
    lines.push("");

    // THE PRE-COLLECTION CHECKS ONLY MEAN ANYTHING ON A FRESH RUN.
    //
    // Every applier in this stage is idempotent, so a resumed run is safe -- but
    // AR has already moved by then, and asserting the July figure would fail on
    // a tenant that is in exactly the intended state. The first attempt at this
    // stage did precisely that: it wrote rent, CAM and collections, failed on a
    // broken verification query, and then could not be re-entered because its
    // own opening assertion no longer held.
    //
    // So the running totals are asserted only while nothing has been collected
    // into August, and the identities at the end -- which hold either way -- are
    // what the stage is actually judged on.
    if (fresh) {
      expect(openingAr, "AR does not match the July close").toBe(EXPECTED.arAfterJulyClose);
    } else {
      lines.push("  RESUMING: August receipts exist, so the pre-collection totals are");
      lines.push("  not re-asserted. The closing identities below are unaffected.");
      lines.push("");
    }

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
      lines.push("  August is PLANNED. Every applier in this stage refuses a period that is");
      lines.push("  not OPEN, so nothing beyond this point can be rehearsed. Opening August");
      lines.push("  is the first write and is not performed here.");
      write(lines);
      await owner.auth.signOut();
      return;
    }

    // ---- 1. open August, and leave it open ----------------------------------
    const opened = await setPeriodStatus(admin, owner, organizationId, AUGUST, "OPEN", AUGUST_OPEN_REASON);
    lines.push("OPEN AUGUST");
    lines.push("-".repeat(72));
    lines.push(`  ${opened.from} -> OPEN`);
    lines.push("");

    // ---- August rent ---------------------------------------------------------
    const rent = await applyMonthlyRent({
      admin, owner, organizationId, month: AUGUST, frequency: "MONTHLY", dryRun: false,
      log: (l) => lines.push(l),
    });
    lines.push("AUGUST RENT");
    lines.push("-".repeat(72));
    lines.push(`  billable                      ${rent.billable}`);
    lines.push(`  generated                     ${rent.generated}`);
    lines.push(`  not called                    ${rent.notCalled.length}`);
    for (const n of rent.notCalled) lines.push(`    ${n.unitCode.padEnd(12)} ${n.term.padEnd(24)} ${n.why}`);
    lines.push("");
    write(lines);
    expect(rent.failure ?? null, rent.failure ?? "").toBeNull();
    expect(
      rent.notCalled.filter((n) => n.why.startsWith("PARTIAL")),
      "a lease partially covers August",
    ).toEqual([]);

    const cumulative = await rentCumulative(admin, organizationId);
    const rentCheck = await verifyMonthlyRent(admin, organizationId, AUGUST, {
      count: EXPECTED.monthlyDues,
      amount: EXPECTED.monthlyRent,
      totalCount: cumulative.count,
      totalAmount: cumulative.amount,
    }, "MONTHLY");
    lines.push(rentCheck.text);
    lines.push("");
    write(lines);
    expect(rentCheck.pass, "August rent verification failed").toBe(true);

    const beforeRentReplay = await counts(admin, organizationId);
    const rentReplay = await applyMonthlyRent({
      admin, owner, organizationId, month: AUGUST, frequency: "MONTHLY", dryRun: false, log: () => {},
    });
    const afterRentReplay = await counts(admin, organizationId);
    lines.push("RENT REPLAY");
    lines.push("-".repeat(72));
    lines.push(`  newly generated               ${rentReplay.generated}`);
    lines.push(`  new dues / entries / runs     ${afterRentReplay.dues - beforeRentReplay.dues} / ${afterRentReplay.entries - beforeRentReplay.entries} / ${afterRentReplay.runs - beforeRentReplay.runs}`);
    lines.push("");
    expect(rentReplay.generated).toBe(0);
    expect(afterRentReplay.dues - beforeRentReplay.dues).toBe(0);
    expect(afterRentReplay.entries - beforeRentReplay.entries).toBe(0);
    expect(afterRentReplay.runs - beforeRentReplay.runs).toBe(0);

    const arBeforeCam = await arSubledger(admin, organizationId);
    if (fresh) expect(arBeforeCam, "AR before CAM").toBe(EXPECTED.arBeforeCam);

    // ---- 2. CAM, before collections -----------------------------------------
    const cam = await applyCam({
      admin, owner, organizationId, propertyCode: "NH", dryRun: false,
      log: (l) => lines.push(l),
    });
    lines.push("AUGUST CAM (New Horizon)");
    lines.push("-".repeat(72));
    lines.push(`  eligible units                ${cam.eligibleUnits}`);
    lines.push(`  area basis sum                ${cam.basisSum.toFixed(2)} m2`);
    lines.push(`  levy total                    ${cam.levyTotal.toFixed(2)}`);
    lines.push(`  allocated total               ${cam.allocatedTotal.toFixed(2)}`);
    lines.push(`  dues issued                   ${cam.duesIssued}`);
    lines.push("");
    write(lines);
    expect(cam.failure ?? null, cam.failure ?? "").toBeNull();
    expect(cam.eligibleUnits, "eligible NH units").toBe(EXPECTED.camUnits);

    const camCheck = await verifyCam(admin, organizationId, cam.levyId!);
    lines.push(camCheck.text);
    lines.push("");
    write(lines);
    expect(camCheck.pass, "CAM verification failed").toBe(true);

    const preCollectionAr = await arSubledger(admin, organizationId);
    lines.push("PRE-COLLECTION AR");
    lines.push("-".repeat(72));
    lines.push(`  ${EXPECTED.arAfterJulyClose.toFixed(2)} carried in`);
    lines.push(`  + ${EXPECTED.monthlyRent.toFixed(2)} August rent`);
    lines.push(`  + ${CAM_TOTAL.toFixed(2)} CAM`);
    lines.push(`  = ${preCollectionAr.toFixed(2)}`);
    lines.push("");
    if (fresh) expect(preCollectionAr, "pre-collection AR").toBe(EXPECTED.preCollectionAr);

    // ---- 3. the plan, rehearsed so the cash properties are known -------------
    const rehearsal = await applyCollections({
      admin, owner, organizationId, month: AUGUST, dryRun: true, log: () => {},
    });
    expect(rehearsal.failure ?? null, rehearsal.failure ?? "").toBeNull();
    const cashProperties = [
      ...new Set(
        rehearsal.results
          .filter((r) => r.method === "CASH")
          .map((r) => propertyOfResult(r.dueId)),
      ),
    ];
    // Resolved from the dues rather than from the unit code prefix, which would
    // be a naming convention standing in for a foreign key.
    const plannedCashProperties = await propertyIdsForDues(
      admin,
      organizationId,
      rehearsal.results.filter((r) => r.method === "CASH").map((r) => r.dueId),
    );
    // Union with any session already open. On a resumed run the rehearsal plans
    // nothing -- every receipt is already settled -- so the planned list is
    // empty and the sessions opened by the earlier attempt would be left OPEN
    // forever, which is how this stage failed the first time it was re-entered.
    const { data: openSessions } = await admin
      .from("cashier_sessions")
      .select("property_id, status")
      .eq("organization_id", organizationId)
      .eq("status", "OPEN")
      .range(0, 999);
    const cashPropertyIds = [
      ...new Set([...plannedCashProperties, ...(openSessions ?? []).map((s) => s.property_id)]),
    ];

    lines.push("CASHIER SCOPE");
    lines.push("-".repeat(72));
    lines.push(`  planned receipts              ${rehearsal.planned}`);
    lines.push(`  of which CASH                 ${rehearsal.results.filter((r) => r.method === "CASH").length}`);
    lines.push(`  properties needing a cashbox  ${cashPropertyIds.length}`);
    lines.push("");
    void cashProperties;

    // ---- 4. cashboxes and sessions, before any CASH receipt -----------------
    const cashier = await openCashierSessions({
      admin, owner, organizationId, propertyIds: cashPropertyIds, log: (l) => lines.push(l),
    });
    lines.push("");
    write(lines);
    expect(cashier.failure ?? null, cashier.failure ?? "").toBeNull();
    expect(cashier.sessions.length, "one session per cash property").toBe(cashPropertyIds.length);

    const sessionByProperty = new Map(cashier.sessions.map((s) => [s.propertyId, s.sessionId]));

    // ---- 5. collections ------------------------------------------------------
    const collections = await applyCollections({
      admin, owner, organizationId, month: AUGUST, dryRun: false,
      cashierSessionByProperty: sessionByProperty,
      requireCashierSession: true,
      log: (l) => lines.push(l),
    });
    lines.push("AUGUST COLLECTIONS");
    lines.push("-".repeat(72));
    lines.push(`  receipts posted               ${collections.posted}`);
    lines.push(`  collected                     ${collections.plannedTotal.toFixed(2)}`);
    lines.push(`  of which CAM                  ${collections.camReceipts}`);
    lines.push(`  CASH through a session        ${collections.throughSession}`);
    lines.push(`  top-ups                       ${collections.topUps}`);
    lines.push(`  moved out of a closed month   ${collections.clamped}`);
    lines.push(`  already settled               ${collections.settled}`);
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
    if (fresh) expect(collections.camReceipts, "no CAM due was collected").toBeGreaterThan(0);

    const paidCheck = await verifyCollections(admin, organizationId, {
      payments: await paymentCount(admin, organizationId),
      collected: await collectedTotal(admin, organizationId),
      openingAr: await billedTotal(admin, organizationId),
    });
    lines.push(paidCheck.text);
    lines.push("");
    lines.push("AUGUST MOVEMENT");
    lines.push("-".repeat(72));
    lines.push(`  pre-collection AR             ${preCollectionAr.toFixed(2)}`);
    lines.push(`  August collections            ${collections.plannedTotal.toFixed(2)}`);
    lines.push(`  closing AR                    ${paidCheck.closingAr.toFixed(2)}`);
    lines.push("");
    write(lines);
    expect(paidCheck.pass, "collections verification failed").toBe(true);
    expect(paidCheck.closingAr).toBe(
      Math.round((preCollectionAr - collections.plannedTotal) * 100) / 100,
    );
    // Holds on a resumed run too: whatever this run posted, AR moved by it.
    expect(collections.posted, "posted fewer receipts than planned").toBe(collections.planned);

    const beforeReplay = await counts(admin, organizationId);
    const replay = await applyCollections({
      admin, owner, organizationId, month: AUGUST, dryRun: false,
      cashierSessionByProperty: sessionByProperty, requireCashierSession: true, log: () => {},
    });
    const afterReplay = await counts(admin, organizationId);
    const seqDrift = afterReplay.sequences.filter((s) => {
      const was = beforeReplay.sequences.find((b) => b.sequence_type === s.sequence_type);
      return !was || was.next_value !== s.next_value;
    });
    lines.push("COLLECTIONS REPLAY");
    lines.push("-".repeat(72));
    lines.push(`  new payments / allocations / entries  ${afterReplay.payments - beforeReplay.payments} / ${afterReplay.allocations - beforeReplay.allocations} / ${afterReplay.entries - beforeReplay.entries}`);
    lines.push(`  new cash transactions                 ${afterReplay.cashTransactions - beforeReplay.cashTransactions}`);
    lines.push(`  sequences that moved                  ${seqDrift.length}`);
    lines.push("");
    expect(replay.posted, "the replay posted a receipt").toBe(0);
    expect(afterReplay.payments - beforeReplay.payments).toBe(0);
    expect(afterReplay.allocations - beforeReplay.allocations).toBe(0);
    expect(afterReplay.entries - beforeReplay.entries).toBe(0);
    expect(afterReplay.cashTransactions - beforeReplay.cashTransactions).toBe(0);
    expect(seqDrift, "a document sequence moved on replay").toEqual([]);

    // ---- 6. close and reconcile the cashier sessions -------------------------
    const closed = await closeCashierSessions({
      admin, owner, organizationId, sessions: cashier.sessions, log: (l) => lines.push(l),
    });
    lines.push("CASHIER SESSIONS");
    lines.push("-".repeat(72));
    for (const o of closed.outcomes) {
      lines.push(
        `    ${o.propertyCode.padEnd(6)} receipts ${String(o.receipts).padStart(3)}` +
          `  opening ${o.opening.toFixed(2).padStart(10)}` +
          `  expected ${o.expected.toFixed(2).padStart(12)}` +
          `  actual ${o.actual.toFixed(2).padStart(12)}` +
          `  variance ${o.variance.toFixed(2).padStart(8)}  ${o.status}`,
      );
    }
    lines.push("");
    write(lines);
    expect(closed.failure ?? null, closed.failure ?? "").toBeNull();

    const cashierCheck = await verifyCashier(admin, organizationId);
    lines.push(cashierCheck.text);
    lines.push("");
    write(lines);
    expect(cashierCheck.pass, "cashier verification failed").toBe(true);

    // ---- 7. bank statement and reconciliation --------------------------------
    const bank = await applyBankReconciliation({
      admin, owner, organizationId, propertyCode: "NH", dryRun: false,
      log: (l) => lines.push(l),
    });
    lines.push("BANK STATEMENT");
    lines.push("-".repeat(72));
    lines.push(`  lines                         ${bank.lines}`);
    lines.push(`  opening balance               ${bank.openingBalance.toFixed(2)}`);
    lines.push(`  closing balance               ${bank.closingBalance.toFixed(2)}`);
    lines.push(`  matched / ambiguous / unmatched  ${bank.matched} / ${bank.ambiguous} / ${bank.unmatched}`);
    lines.push(`  difference                    ${bank.difference.toFixed(2)}`);
    lines.push(`  finalized                     ${bank.finalized}`);
    lines.push("");
    write(lines);
    expect(bank.failure ?? null, bank.failure ?? "").toBeNull();

    const bankCheck = await verifyBankReconciliation(admin, owner, bank.statementId!);
    lines.push(bankCheck.text);
    lines.push("");
    write(lines);
    expect(bankCheck.pass, "bank reconciliation verification failed").toBe(true);

    // ---- 8 & 9. final verification and snapshot ------------------------------
    const snapshot = await renderDemoSnapshot(admin, owner, organizationId);
    lines.push(snapshot.text);
    lines.push("");

    const { data: finalPeriods } = await admin
      .from("fiscal_periods")
      .select("start_date, status")
      .eq("organization_id", organizationId)
      .order("start_date");
    lines.push("FISCAL STATE");
    lines.push("-".repeat(72));
    for (const p of finalPeriods ?? []) lines.push(`  ${p.start_date.slice(0, 7)}   ${p.status}`);

    write(lines);
    await owner.auth.signOut();

    expect(snapshot.pass, "final snapshot verification failed").toBe(true);

    const byMonth = Object.fromEntries(
      (finalPeriods ?? []).map((p) => [p.start_date.slice(0, 7), p.status]),
    );
    for (const m of ["2026-01", "2026-02", "2026-03", "2026-04", "2026-05", "2026-06", "2026-07"]) {
      expect(byMonth[m], `${m} should be CLOSED`).toBe("CLOSED");
    }
    expect(byMonth["2026-08"], "August must stay OPEN").toBe("OPEN");
    for (const m of ["2026-09", "2026-10", "2026-11", "2026-12"]) {
      expect(byMonth[m], `${m} should be PLANNED`).toBe("PLANNED");
    }
  }, 2_400_000);
});

function propertyOfResult(dueId: string): string {
  return dueId;
}

async function propertyIdsForDues(
  admin: SupabaseClient<Database>,
  organizationId: string,
  dueIds: string[],
): Promise<string[]> {
  if (dueIds.length === 0) return [];
  const { data } = await admin
    .from("dues")
    .select("id, property_id")
    .eq("organization_id", organizationId)
    .in("id", dueIds)
    .range(0, 4999);
  return [...new Set((data ?? []).map((d) => d.property_id))];
}

async function augustReceiptCount(admin: SupabaseClient<Database>, organizationId: string) {
  const { count } = await admin
    .from("payments")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .gte("payment_date", "2026-08-01")
    .lte("payment_date", "2026-08-31");
  return count ?? 0;
}

async function arSubledger(admin: SupabaseClient<Database>, organizationId: string) {
  const billed = await billedTotal(admin, organizationId);
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
  const paid = (allocations ?? []).reduce((s, a) => s + Number(a.amount), 0);
  return Math.round((billed - paid) * 100) / 100;
}

async function billedTotal(admin: SupabaseClient<Database>, organizationId: string) {
  const { data } = await admin
    .from("dues")
    .select("amount")
    .eq("organization_id", organizationId)
    .range(0, 4999);
  return Math.round((data ?? []).reduce((s, d) => s + Number(d.amount), 0) * 100) / 100;
}

async function rentCumulative(admin: SupabaseClient<Database>, organizationId: string) {
  const { data } = await admin
    .from("dues")
    .select("amount, source_type")
    .eq("organization_id", organizationId)
    .eq("source_type", "LEASE_RENT")
    .range(0, 4999);
  return {
    count: (data ?? []).length,
    amount: Math.round((data ?? []).reduce((s, d) => s + Number(d.amount), 0) * 100) / 100,
  };
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
  const scoped = async (
    t: "payments" | "journal_entries" | "dues" | "lease_rent_generation_runs" | "cash_transactions",
  ) => {
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
    cashTransactions: await scoped("cash_transactions"),
    allocations: allocations ?? -1,
    sequences: sequences ?? [],
  };
}

function write(lines: string[]) {
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/demo-f6-august.txt", lines.join("\n") + "\n", "utf8");
}
