import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/types";
import {
  planCollections,
  leaseBusinessKey,
  paymentBusinessKey,
  financialIdempotencyKey,
  type PlannedDue,
  type PlannedPayment,
  type PayerProfile,
} from "./financial-plan";

/**
 * F3 — May 2026 collections.
 *
 * WHAT SETTLES WHAT
 * The planner is the source of truth for behaviour: which tenant pays, in full
 * or in part, by what method. It is rebuilt here from the dues that ACTUALLY
 * exist in the ledger -- 26 May monthly and 15 Q2 commercial -- rather than
 * from the dues it once imagined, so a profile decides the behaviour of a real
 * row or it decides nothing.
 *
 * Collections are deliberately NOT restricted to May-dated dues. The Q2
 * commercial obligations are outstanding receivables like any other, and a
 * demo where commercial tenants never pay because their invoice is dated in a
 * closed month would be a demo of a bug.
 *
 * THE DATE RULE, AND THE ONE PLACE IT BENDS
 * A settlement is dated 3-11 days after its due date, drawn from the same
 * seeded generator as everything else. For May dues that lands in May. For the
 * Q2 dues, whose due date is 2026-04-01, it lands in April -- which is CLOSED,
 * and reopening it again to backdate receipts is not on the table.
 *
 * So a settlement whose natural date falls inside a closed period is dated from
 * the first day of the open period instead, keeping its own offset. Commercial
 * rent therefore settles in May, 33-41 days after it fell due.
 *
 * That is a CONSEQUENCE and it is reported as one: the aging will show the
 * commercial book paying about a month late. Nothing was tuned to produce that
 * -- it falls out of billing a quarter on 1 April and collecting in May, which
 * is what actually happened here.
 *
 * WHY EVERY PAYMENT SETTLES EXACTLY ONE DUE
 * Not a simplification. `post_payment_internal` requires every allocated due to
 * belong to `p_resort_id`, so one payment cannot span two properties, and the
 * planner already models settlement per obligation. One allocation per payment
 * also makes "allocation sum = payment amount" a property of the data rather
 * than of a reconciliation step.
 *
 * NO CASHIER SESSION IS ATTACHED.
 * The tenant has no cashboxes and no sessions, and `record_payment` accepts a
 * null session. CASH receipts are therefore posted without one, which is a
 * legitimate state and NOT a complete demonstration of the cashier module. It
 * is the reason May is not closed by this stage -- see mayCompleteness().
 */

export const MAY_PERIOD = "2026-05";
export const MAY_FIRST = "2026-05-01";
export const MAY_LAST = "2026-05-31";

/** First and last day of a `YYYY-MM` month. */
export function monthBounds(month: string): { first: string; last: string } {
  const [y, m] = month.split("-").map(Number) as [number, number];
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  return { first: `${month}-01`, last: `${month}-${String(last).padStart(2, "0")}` };
}

/** Deposit account code per method. Read from the COA, never invented. */
export const DEPOSIT_ACCOUNT_BY_METHOD: Record<PlannedPayment["method"], string> = {
  CASH: "1110",
  BANK_TRANSFER: "1120",
  CHEQUE: "1120",
};

export const EMPTY_UUID = "00000000-0000-0000-0000-000000000000";

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

/** A due as this module needs it: the ledger row plus the identity it belongs to. */
export type LedgerDue = {
  id: string;
  propertyId: string;
  unitId: string;
  memberId: string;
  amount: number;
  dueDate: string;
  unitCode: string;
  /** The stable lease key, so a receipt ordinal can be built without string surgery. */
  leaseKey: string;
};

export type CollectionOutcome = {
  paymentKey: string;
  unitCode: string;
  dueId: string;
  amount: number;
  method: string;
  paymentDate: string;
  /** Days between the due date and the settlement, as posted. */
  daysLate: number;
  clamped: boolean;
  /** A second or later receipt against a due that was already part-paid. */
  topUp: boolean;
  paymentId: string | null;
  outcome: string;
};

export type CollectionReport = {
  ok: boolean;
  dryRun: boolean;
  month: string;
  profiles: Record<PayerProfile, number>;
  /** Receipts this run intends to post. */
  planned: number;
  posted: number;
  /** Settlements the ledger already satisfies; nothing to do. */
  settled: number;
  /** Settlements whose date belongs to a month not yet reached. */
  deferred: number;
  /** Settlements moved forward out of a closed month. */
  clamped: number;
  /** Receipts against a due that already carried one. */
  topUps: number;
  results: CollectionOutcome[];
  plannedTotal: number;
  failure?: string;
};

export type F3Options = {
  admin: SupabaseClient<Database>;
  owner: SupabaseClient<Database>;
  organizationId: string;
  dryRun: boolean;
  log: (line: string) => void;
};

export type CollectionOptions = F3Options & {
  /** The open month the receipts are posted into, `YYYY-MM`. */
  month: string;
};

type UntypedRpc = {
  rpc: (
    fn: string,
    args: Record<string, unknown>,
  ) => Promise<{ data: unknown; error: { message: string } | null }>;
};

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function daysBetween(from: string, to: string): number {
  const a = Date.UTC(...(from.split("-").map(Number) as [number, number, number]));
  const b = Date.UTC(...(to.split("-").map(Number) as [number, number, number]));
  return Math.round((b - a) / 86_400_000);
}

/**
 * Moves a settlement out of a closed period without changing its offset.
 *
 * The offset is what the payer profile chose; only the anchor moves. Returning
 * the original alongside the adjusted date so the report can state the
 * difference rather than quietly present the adjusted one as planned.
 */
export function settlementDate(
  plannedDate: string,
  openMonth: string,
): { date: string; clamped: boolean; deferred: boolean } {
  const { first, last } = monthBounds(openMonth);
  // Later than the open month: this settlement belongs to a month that has not
  // been reached yet. Not an error and not clamped BACKWARDS -- pulling a
  // payment earlier than the profile chose would invent a collection.
  if (plannedDate > last) return { date: plannedDate, clamped: false, deferred: true };
  if (plannedDate >= first) return { date: plannedDate, clamped: false, deferred: false };
  const dueAnchor = plannedDate.slice(0, 8) + "01";
  const offset = daysBetween(dueAnchor, plannedDate);
  return { date: addDays(first, offset), clamped: true, deferred: false };
}

/**
 * Rebuilds the collection plan from the dues that exist in the ledger.
 *
 * Each real due is described to the planner in its own terms -- the lease's
 * stable business key, its period, its amount -- so the profile that decides
 * whether it is paid is the same function, fed real rows.
 */
export async function buildCollectionPlan(
  admin: SupabaseClient<Database>,
  organizationId: string,
): Promise<{
  payments: PlannedPayment[];
  profiles: Record<PayerProfile, number>;
  dueByKey: Map<string, LedgerDue>;
}> {
  const { data: properties } = await admin
    .from("properties")
    .select("id, code")
    .eq("organization_id", organizationId)
    .range(0, 4999);
  const propertyCode = new Map((properties ?? []).map((p) => [p.id, p.code]));

  const { data: units } = await admin
    .from("units")
    .select("id, code, area, unit_type, property_id, is_active")
    .eq("organization_id", organizationId)
    .range(0, 4999);
  const unitById = new Map((units ?? []).map((u) => [u.id, u]));

  const { data: leases } = await admin
    .from("unit_leases")
    .select("id, unit_id, tenant_member_id, rent_frequency, starts_on, status")
    .eq("organization_id", organizationId)
    .eq("status", "ACTIVE")
    .range(0, 4999);
  const leaseById = new Map((leases ?? []).map((l) => [l.id, l]));

  const { data: dues } = await admin
    .from("dues")
    .select("id, unit_id, property_id, amount, issue_date, due_date, source_type, source_id, status")
    .eq("organization_id", organizationId)
    .order("due_date")
    .order("id")
    .range(0, 4999);

  const plannedDues: PlannedDue[] = [];
  const dueByKey = new Map<string, LedgerDue>();

  for (const due of dues ?? []) {
    if (due.source_type !== "LEASE_RENT" || !due.source_id) continue;
    const lease = leaseById.get(due.source_id);
    const unit = unitById.get(due.unit_id ?? "");
    if (!lease || !unit) continue;

    const leaseKey = leaseBusinessKey({
      propertyCode: propertyCode.get(unit.property_id) ?? unit.property_id,
      unitCode: unit.code,
      startsOn: lease.starts_on,
      rentFrequency: lease.rent_frequency,
    });

    // The period key the due belongs to, derived from its own issue date and
    // its lease's frequency -- the same two facts generate_lease_rent_dues used.
    const periodKey =
      lease.rent_frequency === "MONTHLY"
        ? due.issue_date.slice(0, 7)
        : lease.rent_frequency === "QUARTERLY"
          ? `${due.issue_date.slice(0, 4)}-Q${Math.floor((Number(due.issue_date.slice(5, 7)) - 1) / 3) + 1}`
          : due.issue_date.slice(0, 4);

    plannedDues.push({
      kind: "RENT",
      leaseId: lease.id,
      leaseKey,
      unitId: due.unit_id!,
      unitCode: unit.code,
      propertyId: due.property_id,
      memberId: lease.tenant_member_id,
      periodKey,
      amount: Number(due.amount),
      issueDate: due.issue_date,
      dueDate: due.due_date,
    });

    // Keyed on unit and period, not on the lease key.
    //
    // The lease key is the right identity for BEHAVIOUR -- it is what the payer
    // profile hashes -- but recovering it from a payment key means splitting a
    // colon-delimited string that already contains colons, and a unit code with
    // a colon in it would silently mismatch. Each unit has exactly one ACTIVE
    // lease, so unit plus period addresses the due unambiguously.
    dueByKey.set(`${due.unit_id}::${periodKey}`, {
      id: due.id,
      propertyId: due.property_id,
      unitId: due.unit_id!,
      memberId: lease.tenant_member_id,
      amount: Number(due.amount),
      dueDate: due.due_date,
      unitCode: unit.code,
      leaseKey,
    });
  }

  const plan = planCollections(plannedDues);
  return { payments: plan.payments, profiles: plan.profiles, dueByKey };
}

/**
 * Posts the settlements that belong to one open month.
 *
 * WHY THE PLAN IS RECONCILED AGAINST THE LEDGER RATHER THAN REPLAYED
 * `planCollections` is recomputed over every due that exists, and its verdict
 * for a lease CHANGES as dues accumulate. A SLOW_30 payer with one due pays
 * nothing; the same payer with two dues pays the first and skips the second. A
 * PARTIAL payer with one due pays 40% of it; with two, they clear the first in
 * full and part-pay the second.
 *
 * That is the intended behaviour -- it is what "arrears get collected later"
 * means -- but it makes the plan non-monotonic, and replaying it naively would
 * be wrong in two separate ways:
 *
 *   - the 40% already posted under `payment:<lease>:2026-05:01` would be
 *     re-planned as a full settlement under the SAME key, and record_payment
 *     would hand back the existing 40% payment while the report claimed the
 *     full amount had been collected;
 *   - a settlement the plan now wants for a CLOSED month would be posted into
 *     the open one under an ordinal that is already taken.
 *
 * So each planned settlement is compared with what its due has ALREADY been
 * allocated, and only the shortfall is posted -- under the next free ordinal,
 * dated inside the open month. A due the plan has revised upwards gets a top-up
 * receipt; one already settled to plan gets nothing. Running this for a month
 * whose work is finished writes nothing at all.
 */
export async function applyCollections(options: CollectionOptions): Promise<CollectionReport> {
  const { admin, owner, organizationId, month, dryRun, log } = options;
  const { first, last } = monthBounds(month);

  const report: CollectionReport = {
    ok: false,
    dryRun,
    month,
    profiles: { PROMPT: 0, SLOW_30: 0, SLOW_60: 0, SLOW_90: 0, PARTIAL: 0, NON_PAYING: 0 },
    planned: 0,
    posted: 0,
    settled: 0,
    deferred: 0,
    clamped: 0,
    topUps: 0,
    results: [],
    plannedTotal: 0,
  };

  try {
    const { payments, profiles, dueByKey } = await buildCollectionPlan(admin, organizationId);
    report.profiles = profiles;

    const { data: periods } = await admin
      .from("fiscal_periods")
      .select("id, start_date, status")
      .eq("organization_id", organizationId);
    const period = (periods ?? []).find((p) => p.start_date.slice(0, 7) === month);
    if (!period) throw new Error(`no fiscal period covers ${month}`);
    if (period.status !== "OPEN") {
      throw new Error(
        `${month} is ${period.status}, not OPEN. Refusing to post collections into it.`,
      );
    }

    const { data: accounts } = await admin
      .from("chart_of_accounts")
      .select("id, code, is_cash_equivalent, is_active")
      .eq("organization_id", organizationId);
    const accountByCode = new Map((accounts ?? []).map((a) => [a.code, a]));
    for (const code of new Set(Object.values(DEPOSIT_ACCOUNT_BY_METHOD))) {
      const account = accountByCode.get(code);
      if (!account) throw new Error(`deposit account ${code} does not exist`);
      if (!account.is_cash_equivalent) {
        throw new Error(`deposit account ${code} is not marked cash-equivalent`);
      }
      if (!account.is_active) throw new Error(`deposit account ${code} is inactive`);
    }

    // What each due has already received, and how many receipts it carries.
    // Read once: both the amount of a top-up and its ordinal depend on it.
    const { data: existingPayments } = await admin
      .from("payments")
      .select("id, idempotency_key")
      .eq("organization_id", organizationId)
      .range(0, 4999);
    const existingKeys = new Set(
      (existingPayments ?? []).map((p) => p.idempotency_key).filter(Boolean) as string[],
    );
    const paymentIds = (existingPayments ?? []).map((p) => p.id);
    const { data: existingAllocations } = await admin
      .from("payment_allocations")
      .select("payment_id, due_id, amount")
      .in("payment_id", paymentIds.length > 0 ? paymentIds : [EMPTY_UUID])
      .range(0, 9999);
    const allocatedByDue = new Map<string, number>();
    const receiptsByDue = new Map<string, number>();
    for (const a of existingAllocations ?? []) {
      allocatedByDue.set(a.due_id, (allocatedByDue.get(a.due_id) ?? 0) + Number(a.amount));
      receiptsByDue.set(a.due_id, (receiptsByDue.get(a.due_id) ?? 0) + 1);
    }

    const work: Array<{
      payment: PlannedPayment;
      due: LedgerDue;
      amount: number;
      date: string;
      key: string;
    }> = [];

    for (const payment of payments) {
      if (payment.allocations.length !== 1) {
        throw new Error(
          `${payment.unitCode}: ${payment.allocations.length} allocations; this stage ` +
            "posts one due per payment so a payment cannot span two properties",
        );
      }
      const allocation = payment.allocations[0];
      const due = dueByKey.get(`${payment.unitId}::${allocation.periodKey}`);
      if (!due) throw new Error(`${payment.unitCode}: no ledger due for ${allocation.periodKey}`);

      const { date, clamped, deferred } = settlementDate(payment.paymentDate, month);
      if (deferred) {
        report.deferred++;
        continue;
      }
      if (date < first || date > last) {
        throw new Error(`${payment.unitCode}: settlement ${date} falls outside ${month}`);
      }

      const already = allocatedByDue.get(due.id) ?? 0;
      const shortfall = round2(payment.amount - already);
      if (shortfall <= 0) {
        report.settled++;
        continue;
      }
      const remaining = round2(due.amount - already);
      if (shortfall > remaining + 0.004) {
        throw new Error(
          `${payment.unitCode}: settling ${shortfall} would exceed the ${remaining.toFixed(2)} remaining`,
        );
      }

      const ordinal = (receiptsByDue.get(due.id) ?? 0) + 1;
      const key = paymentBusinessKey(due.leaseKey, allocation.periodKey, ordinal);
      if (existingKeys.has(financialIdempotencyKey(key))) {
        // The key exists yet the due is short. The plan and the ledger disagree
        // about an AMOUNT rather than about whether a settlement happened, and
        // guessing which is right is exactly the wrong move here.
        throw new Error(
          `${payment.unitCode}: ${key} is already posted yet the due is ${shortfall} short`,
        );
      }

      if (ordinal > 1) report.topUps++;
      if (clamped) report.clamped++;
      report.planned++;
      report.plannedTotal = round2(report.plannedTotal + shortfall);

      work.push({ payment, due, amount: shortfall, date, key });
      report.results.push({
        paymentKey: key,
        unitCode: payment.unitCode,
        dueId: due.id,
        amount: shortfall,
        method: payment.method,
        paymentDate: date,
        daysLate: daysBetween(due.dueDate, date),
        clamped,
        topUp: ordinal > 1,
        paymentId: null,
        outcome: "planned",
      });
    }

    if (dryRun) {
      log(`  would post ${report.planned} receipts totalling ${report.plannedTotal.toFixed(2)}`);
      log(`  ${report.clamped} moved forward out of a closed month, ${report.topUps} top-ups`);
      log(`  ${report.settled} already settled to plan, ${report.deferred} due in a later month`);
      report.ok = true;
      return report;
    }

    for (const [i, item] of work.entries()) {
      const result = report.results[i];
      const depositCode = DEPOSIT_ACCOUNT_BY_METHOD[item.payment.method];

      const { data, error } = await (owner as unknown as UntypedRpc).rpc("record_payment", {
        p_organization_id: organizationId,
        p_resort_id: item.due.propertyId,
        p_member_id: item.due.memberId,
        p_unit_id: item.due.unitId,
        p_amount: item.amount,
        p_method: item.payment.method,
        p_payment_date: item.date,
        p_deposit_account_id: accountByCode.get(depositCode)!.id,
        p_fiscal_period_id: period.id,
        p_allocations: [{ due_id: item.due.id, amount: item.amount }],
        p_idempotency_key: financialIdempotencyKey(item.key),
        // No cashier session. The tenant has none, and attaching one to a
        // receipt it could not reference would be decoration, not lineage.
        p_cashier_session_id: null,
      });

      if (error) {
        result.outcome = `error: ${error.message}`;
        report.failure =
          `${item.payment.unitCode}: record_payment failed (${error.message}). ` +
          `${month} is still OPEN; nothing after this receipt was attempted.`;
        return report;
      }

      result.paymentId = (data as string) ?? null;
      result.outcome = "posted";
      report.posted++;
    }

    report.ok = true;
    return report;
  } catch (err) {
    report.failure = err instanceof Error ? err.message : String(err);
    return report;
  }
}

/** May, kept as its own entry point so the historical driver still reads plainly. */
export async function applyF3MayCollections(options: F3Options): Promise<CollectionReport> {
  return applyCollections({ ...options, month: MAY_PERIOD });
}

// ---------------------------------------------------------------------------
// Verification
// ---------------------------------------------------------------------------

export type Check = { label: string; expected: string; actual: string; pass: boolean };
export type F3Verification = {
  pass: boolean;
  checks: Check[];
  text: string;
  closingAr: number;
};

export async function verifyF3(
  admin: SupabaseClient<Database>,
  organizationId: string,
  expected: { payments: number; collected: number; openingAr: number },
): Promise<F3Verification> {
  const checks: Check[] = [];
  const detail: string[] = [];
  const add = (label: string, exp: string | number | boolean, act: string | number | boolean) =>
    checks.push({
      label,
      expected: String(exp),
      actual: String(act),
      pass: String(exp) === String(act),
    });

  const { data: payments } = await admin
    .from("payments")
    .select("id, amount, status, payment_date, method, deposit_account_id, journal_entry_id, idempotency_key")
    .eq("organization_id", organizationId)
    .range(0, 4999);

  const { data: dues } = await admin
    .from("dues")
    .select("id, amount, status, receivable_account_id")
    .eq("organization_id", organizationId)
    .range(0, 4999);

  const { data: entries } = await admin
    .from("journal_entries")
    .select("id, status, entry_date, fiscal_period_id")
    .eq("organization_id", organizationId)
    .range(0, 4999);
  const entryById = new Map((entries ?? []).map((e) => [e.id, e]));

  const { data: periods } = await admin
    .from("fiscal_periods")
    .select("id, start_date, end_date, status")
    .eq("organization_id", organizationId);
  /** The period covering a date, so a receipt is checked against its OWN month. */
  const periodFor = (date: string) =>
    (periods ?? []).find((p) => p.start_date <= date && date <= p.end_date);

  const { data: accounts } = await admin
    .from("chart_of_accounts")
    .select("id, code, is_cash_equivalent")
    .eq("organization_id", organizationId);
  const codeById = new Map((accounts ?? []).map((a) => [a.id, a.code]));
  const cashIds = new Set((accounts ?? []).filter((a) => a.is_cash_equivalent).map((a) => a.id));
  const receivableId = (accounts ?? []).find((a) => a.code === "1130")?.id;

  const paymentIds = (payments ?? []).map((p) => p.id);
  const { data: allocations } = await admin
    .from("payment_allocations")
    .select("payment_id, due_id, amount")
    .in("payment_id", paymentIds.length > 0 ? paymentIds : ["00000000-0000-0000-0000-000000000000"])
    .range(0, 9999);

  // ---- per payment -------------------------------------------------------
  const problems: string[] = [];
  const allocByPayment = new Map<string, number>();
  for (const a of allocations ?? []) {
    allocByPayment.set(a.payment_id, (allocByPayment.get(a.payment_id) ?? 0) + Number(a.amount));
  }

  for (const payment of payments ?? []) {
    if (payment.status !== "POSTED") problems.push(`${payment.id}: status ${payment.status}`);
    // Checked against the period the payment's own date falls in, not against
    // one named month. Once a second month exists, a fixed window would either
    // fail every earlier receipt or stop checking the placement of any of them.
    const own = periodFor(payment.payment_date);
    if (!own) problems.push(`${payment.id}: dated ${payment.payment_date}, no period covers it`);
    if (!payment.idempotency_key?.startsWith("demo:payment:")) {
      problems.push(`${payment.id}: idempotency key "${payment.idempotency_key}"`);
    }
    if (!cashIds.has(payment.deposit_account_id ?? "")) {
      problems.push(`${payment.id}: deposit account not cash-equivalent`);
    }
    const allocated = allocByPayment.get(payment.id) ?? 0;
    if (allocated.toFixed(2) !== Number(payment.amount).toFixed(2)) {
      problems.push(`${payment.id}: allocated ${allocated} != amount ${payment.amount}`);
    }
    const entry = payment.journal_entry_id ? entryById.get(payment.journal_entry_id) : undefined;
    if (!entry) problems.push(`${payment.id}: no journal entry`);
    else {
      if (entry.status !== "POSTED") problems.push(`${payment.id}: journal ${entry.status}`);
      if (entry.fiscal_period_id !== own?.id) {
        problems.push(`${payment.id}: posted outside the period covering ${payment.payment_date}`);
      }
      if (entry.entry_date !== payment.payment_date) {
        problems.push(`${payment.id}: entry dated ${entry.entry_date}`);
      }
    }
  }
  add("every payment POSTED into its own month, fully allocated", 0, problems.length);
  detail.push(...problems.slice(0, 10).map((p) => `    ${p}`));

  // ---- no over-allocation, per due ---------------------------------------
  const allocByDue = new Map<string, number>();
  for (const a of allocations ?? []) {
    allocByDue.set(a.due_id, (allocByDue.get(a.due_id) ?? 0) + Number(a.amount));
  }
  const over: string[] = [];
  const statusWrong: string[] = [];
  for (const due of dues ?? []) {
    const paid = allocByDue.get(due.id) ?? 0;
    if (paid - Number(due.amount) > 0.004) over.push(`${due.id}: paid ${paid} > ${due.amount}`);
    const wanted =
      paid <= 0 ? "ISSUED" : paid >= Number(due.amount) - 0.004 ? "PAID" : "PARTIALLY_PAID";
    if (due.status !== wanted) statusWrong.push(`${due.id}: ${due.status}, expected ${wanted}`);
  }
  add("no due is over-allocated", 0, over.length);
  add("due status matches what was allocated", 0, statusWrong.length);
  detail.push(...over.slice(0, 5).map((p) => `    ${p}`));
  detail.push(...statusWrong.slice(0, 5).map((p) => `    ${p}`));

  // ---- payment journal lines ---------------------------------------------
  const payEntryIds = (payments ?? []).map((p) => p.journal_entry_id).filter(Boolean) as string[];
  const { data: payLines } = await admin
    .from("journal_entry_lines")
    .select("journal_entry_id, account_id, debit, credit")
    .in("journal_entry_id", payEntryIds.length > 0 ? payEntryIds : ["00000000-0000-0000-0000-000000000000"])
    .range(0, 9999);

  let payDebit = 0;
  let payCredit = 0;
  const wrongSide: string[] = [];
  const perEntry = new Map<string, { dr: number; cr: number }>();
  for (const line of payLines ?? []) {
    const dr = Number(line.debit ?? 0);
    const cr = Number(line.credit ?? 0);
    payDebit += dr;
    payCredit += cr;
    const seen = perEntry.get(line.journal_entry_id) ?? { dr: 0, cr: 0 };
    perEntry.set(line.journal_entry_id, { dr: seen.dr + dr, cr: seen.cr + cr });
    if (dr > 0 && !cashIds.has(line.account_id)) {
      wrongSide.push(`debit to ${codeById.get(line.account_id) ?? line.account_id}`);
    }
    if (cr > 0 && line.account_id !== receivableId) {
      wrongSide.push(`credit to ${codeById.get(line.account_id) ?? line.account_id}`);
    }
  }
  const unbalanced = [...perEntry.entries()].filter(([, v]) => v.dr.toFixed(2) !== v.cr.toFixed(2));
  add("Dr cash/bank / Cr 1130 on every receipt line", 0, wrongSide.length);
  add("every receipt entry balances", 0, unbalanced.length);
  add("receipt debits = receipt credits", payDebit.toFixed(2), payCredit.toFixed(2));

  // ---- aggregates ---------------------------------------------------------
  const collected = (payments ?? []).reduce((s, p) => s + Number(p.amount), 0);
  const dueTotal = (dues ?? []).reduce((s, d) => s + Number(d.amount), 0);
  const allocatedTotal = (allocations ?? []).reduce((s, a) => s + Number(a.amount), 0);
  const subledgerAr = dueTotal - allocatedTotal;

  add("payments posted", expected.payments, (payments ?? []).length);
  add("collected", expected.collected.toFixed(2), collected.toFixed(2));
  add("allocations = posted payments", collected.toFixed(2), allocatedTotal.toFixed(2));
  add("opening AR", expected.openingAr.toFixed(2), dueTotal.toFixed(2));
  add("closing AR = opening - collected", (expected.openingAr - collected).toFixed(2), subledgerAr.toFixed(2));

  // ---- AR control account, from the ledger itself -------------------------
  // account_id is already tenant-specific, but scoped to this tenant's entries
  // as well so the two ledger reads in this function mean the same thing.
  const { data: arLines } = await admin
    .from("journal_entry_lines")
    .select("debit, credit, account_id")
    .eq("account_id", receivableId ?? "00000000-0000-0000-0000-000000000000")
    .in("journal_entry_id", (entries ?? []).map((e) => e.id).length > 0 ? (entries ?? []).map((e) => e.id) : ["00000000-0000-0000-0000-000000000000"])
    .range(0, 9999);
  const arControl =
    (arLines ?? []).reduce((s, l) => s + Number(l.debit ?? 0), 0) -
    (arLines ?? []).reduce((s, l) => s + Number(l.credit ?? 0), 0);
  add("AR control = AR subledger", subledgerAr.toFixed(2), arControl.toFixed(2));

  // ---- trial balance, SCOPED TO THIS TENANT -------------------------------
  //
  // journal_entry_lines carries no organization_id -- it is reached through its
  // entry -- and the service role bypasses RLS, so an unscoped sum here totals
  // every organization in the database. The first version of this check did
  // exactly that and reported a 50.00 delta that belonged to someone else's
  // rows: a red FAIL on a tenant whose own ledger balanced to the cent.
  //
  // A cross-tenant total is not a weaker check, it is a different one, and it
  // would have been just as wrong in the other direction -- two foreign
  // imbalances cancelling would have hidden a real one here.
  const orgEntryIds = (entries ?? []).map((e) => e.id);
  const { data: allLines } = await admin
    .from("journal_entry_lines")
    .select("debit, credit")
    .in("journal_entry_id", orgEntryIds.length > 0 ? orgEntryIds : ["00000000-0000-0000-0000-000000000000"])
    .range(0, 9999);
  const tbDebit = (allLines ?? []).reduce((s, l) => s + Number(l.debit ?? 0), 0);
  const tbCredit = (allLines ?? []).reduce((s, l) => s + Number(l.credit ?? 0), 0);
  add("trial balance delta", "0.00", (tbDebit - tbCredit).toFixed(2));
  const scopeNote = `  scope: ${(allLines ?? []).length} lines across ${orgEntryIds.length} entries in this tenant`;

  const lines = ["F3 VERIFICATION (read from the ledger)", "-".repeat(72)];
  for (const c of checks) {
    lines.push(
      `  ${c.label.padEnd(44)}${c.actual.padStart(14)}   expected ${c.expected.padStart(14)}   ${c.pass ? "PASS" : "FAIL"}`,
    );
  }
  lines.push(scopeNote);
  if (detail.filter(Boolean).length > 0) lines.push("", ...detail.filter(Boolean));

  const pass = checks.every((c) => c.pass);
  lines.push("", `COLLECTIONS   ${pass ? "PASS" : "FAIL"}`);

  return { pass, checks, text: lines.join("\n"), closingAr: subledgerAr };
}

/**
 * Whether May may be closed.
 *
 * The rule is the user's: a period closes when every event dated inside it has
 * been written, not when one stage of them has. This returns the reasons it may
 * NOT close, so an empty list is the only thing that permits the close.
 */
/** May, so the historical driver keeps reading plainly. */
export async function mayCompleteness(
  admin: SupabaseClient<Database>,
  organizationId: string,
  options: CompletenessOptions = {},
) {
  return monthCompleteness(admin, organizationId, MAY_PERIOD, options);
}

export type CompletenessOptions = {
  /**
   * The cashier narrative is deliberately not being built for May.
   *
   * WHY THIS IS A PARAMETER AND NOT A DELETED CHECK
   * The check was right: CASH receipts with no cashier session mean the till
   * side of May is unwritten. What changed is the decision, not the fact -- and
   * the fact is worth keeping, because building sessions now would produce rows
   * dated after the receipts they claim to explain.
   *
   * `record_payment` writes a `cash_transaction` only when a session id is
   * passed AT THE TIME OF RECORDING. The 26 payments are already idempotent, so
   * a replay will not create them retroactively. Sessions added now would have
   * no link to the six CASH receipts at all: decoration, not lineage.
   *
   * So the item moves from "blocking" to "deferred, on the record", and the
   * cashier module gets demonstrated properly in a later period -- cashbox,
   * open session, receipts recorded THROUGH it, close, variance nil.
   */
  cashierDeferred?: boolean;
};

export async function monthCompleteness(
  admin: SupabaseClient<Database>,
  organizationId: string,
  month: string,
  options: CompletenessOptions = {},
): Promise<{ blockers: string[]; deferred: string[]; text: string }> {
  const blockers: string[] = [];
  const deferred: string[] = [];
  const { first, last } = monthBounds(month);
  const lines = [`${month} COMPLETENESS`, "-".repeat(72)];

  const { data: dues } = await admin
    .from("dues")
    .select("id, issue_date, status")
    .eq("organization_id", organizationId)
    .range(0, 4999);
  const monthDues = (dues ?? []).filter((d) => d.issue_date.startsWith(month));

  const { data: monthPayments } = await admin
    .from("payments")
    .select("id, method, payment_date")
    .eq("organization_id", organizationId)
    .gte("payment_date", first)
    .lte("payment_date", last)
    .range(0, 4999);
  const payments = (monthPayments ?? []).length;
  const cashPayments = (monthPayments ?? []).filter((p) => p.method === "CASH");

  const { count: sessions } = await admin
    .from("cashier_sessions")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId);

  lines.push(`  WRITTEN, DATED INSIDE ${month}`);
  lines.push(`    rent obligations issued             ${monthDues.length}`);
  lines.push(`    receipts                            ${payments}`);
  lines.push("");

  if (cashPayments.length > 0 && (sessions ?? 0) === 0) {
    const item =
      `${cashPayments.length} CASH receipts are dated in ${month} and no cashier session ` +
      `exists, so the till side of ${month} is unwritten`;
    if (options.cashierDeferred) {
      deferred.push(
        `${item}. DEFERRED BY DECISION: sessions created now would post after the receipts ` +
          "they claim to explain and could not be linked to them -- record_payment writes a " +
          "cash_transaction only when a session is passed at recording time, and those " +
          "receipts are already posted and idempotent. The cashier module will be " +
          "demonstrated from a cashbox forward in a later period instead.",
      );
    } else {
      blockers.push(`${item}. Closing ${month} now would require reopening it to add them.`);
    }
  }

  lines.push(`  NOT ${month}-DATED, SO NOT BLOCKING`);
  lines.push("    CAM levy                            August");
  lines.push("    bank statement / reconciliation     August");
  lines.push("    rent for other months               their own months");
  lines.push("");

  if (deferred.length > 0) {
    lines.push("  DEFERRED BY DECISION, NOT MISSED");
    for (const d of deferred) lines.push(`    - ${d}`);
    lines.push("");
  }

  if (blockers.length === 0) {
    lines.push(`  VERDICT: nothing further is dated inside ${month}. It may be closed.`);
  } else {
    lines.push(`  VERDICT: ${month} must stay OPEN.`);
    for (const b of blockers) lines.push(`    - ${b}`);
  }

  return { blockers, deferred, text: lines.join("\n") };
}
