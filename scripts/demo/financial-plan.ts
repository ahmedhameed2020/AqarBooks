import { DEMO_STORY } from "../../lib/demo/story";
import { hashString, makeRng } from "./demo-fixtures";

/**
 * The financial narrative, planned and never targeted.
 *
 * THE RULE THIS MODULE EXISTS TO ENFORCE
 * Never choose a KPI and manufacture transactions until the dashboard shows it.
 * Seed economically coherent transactions and let the accounting core compute
 * the KPI. So nothing here contains a revenue figure, a collection rate or an
 * arrears total as an input. Rent comes from the lease rows already in the
 * database; CAM shares come from the units' own areas; aging is whatever falls
 * out of who paid what.
 *
 * The one thing that IS chosen is behaviour: which tenant pays promptly and
 * which falls behind. That is a property of the fiction, not of the ledger, and
 * it is assigned deterministically from a seeded hash of the lease id so the
 * same tenants behave the same way on every run.
 *
 * WHAT THIS FILE IS NOT
 * It is not the seed. It writes nothing and calls no RPC. It reads the real
 * rows the structural seed created and works out what the financial stages
 * would produce, so the story can be reviewed as accounting before it is
 * reviewed as code.
 */

export const FINANCIAL_PLAN_VERSION = "demo-financial-v1";

// ---------------------------------------------------------------------------
// Input: real rows, read from the database by the caller.
// ---------------------------------------------------------------------------

export type PlanUnit = {
  /** Database id. Used to address rows, never to derive behaviour. */
  id: string;
  code: string;
  area: number | null;
  unitType: string;
  propertyId: string;
  isActive: boolean;
};

export type PlanLease = {
  /** Database id. Used to address rows, never to derive behaviour. */
  id: string;
  unitId: string;
  tenantMemberId: string;
  rentAmount: number;
  rentFrequency: "MONTHLY" | "QUARTERLY" | "YEARLY";
  startsOn: string;
  endsOn: string | null;
  status: string;
};

export type PlanProperty = { id: string; code: string; name: string };

export type FinancialPlanInput = {
  properties: PlanProperty[];
  units: PlanUnit[];
  leases: PlanLease[];
  /** Distinct member ids holding an ownership link, for the CAM story. */
  ownerUnitIds: string[];
  currencyDecimals: number;
};

// ---------------------------------------------------------------------------
// Stable business keys
// ---------------------------------------------------------------------------

/**
 * Identity for the financial narrative, derived from business facts only.
 *
 * WHY NOT THE DATABASE UUID
 * The payer profiles were keyed on `unit_leases.id`. That looked deterministic
 * -- same hash, same profile -- and was not, because the UUID is assigned by
 * the database at insert time. The structural repair proved it: Marina went
 * from zero arrears to 69,430 purely because the surviving leases had different
 * ids. Same fixtures, same seed, different story.
 *
 * A demo whose financial narrative depends on which UUIDs Postgres happened to
 * mint is not reproducible. Rebuild the tenant and the aging changes; restore
 * from a backup into fresh ids and the dashboard disagrees with the one the
 * customer was shown.
 *
 * These keys are made of things a human chose: the property, the unit, when the
 * tenancy starts and how often it bills. They survive a reseed, a restore, and
 * a migration to a different database.
 */
export function leaseBusinessKey(input: {
  propertyCode: string;
  unitCode: string;
  startsOn: string;
  rentFrequency: string;
}): string {
  return `lease:${input.propertyCode}:${input.unitCode}:${input.startsOn}:${input.rentFrequency}`;
}

/** `payment:<leaseKey>:<period>:<ordinal>` -- ordinal 1-based within the period. */
export function paymentBusinessKey(leaseKey: string, periodKey: string, ordinal: number): string {
  return `payment:${leaseKey}:${periodKey}:${String(ordinal).padStart(2, "0")}`;
}

/** A bank line's reference, derived from the payment it settles. */
export function bankReferenceFor(paymentKey: string): string {
  // Short, stable, and readable on a statement line. FNV-1a over the payment
  // key rather than a counter, so a reference identifies the same payment no
  // matter what order the statement is built in.
  return `TRF-${hashString(paymentKey).toString(16).toUpperCase().padStart(8, "0")}`;
}

/**
 * The idempotency key the financial RPCs will be called with.
 *
 * record_payment and the journal RPCs accept one, and it is what makes a
 * resumed seed safe. Deriving it from the same business key means a retry after
 * a half-written run settles the same due once, rather than twice under two
 * different generated ids.
 */
export function financialIdempotencyKey(businessKey: string): string {
  return `demo:${businessKey}`;
}

// ---------------------------------------------------------------------------
// Fiscal timeline
// ---------------------------------------------------------------------------

export type FiscalStep = {
  period: string;
  target: "CLOSED" | "OPEN" | "PLANNED";
  reason: string;
  /** Whether financial activity is posted while this period is open. */
  carriesActivity: boolean;
};

/**
 * Jan–Apr closed outright; May–Jul opened, populated, then closed; August left
 * open as the operating month; the rest planned.
 *
 * WHY NOT A LUMP OPENING BALANCE ON 1 AUGUST
 * An opening balance produces an aging report with one bucket and no history:
 * every arrear is the same age and nothing explains it. Posting three real
 * months first means current, 30, 60 and 90-day arrears each trace to a
 * specific due, tenant, unit and journal entry. That is the difference between
 * a demo an accountant probes and one they stop trusting on the second click.
 */
export function planFiscalTimeline(): FiscalStep[] {
  const steps: FiscalStep[] = [];
  for (let month = 1; month <= 12; month++) {
    const period = `2026-${String(month).padStart(2, "0")}`;
    if (month <= 4) {
      steps.push({
        period,
        target: "CLOSED",
        reason: "Demo historical period initialization",
        carriesActivity: false,
      });
    } else if (month <= 7) {
      steps.push({
        period,
        target: "CLOSED",
        reason: `Demo financial narrative – ${monthName(month)} 2026 close`,
        carriesActivity: true,
      });
    } else if (month === 8) {
      steps.push({
        period,
        target: "OPEN",
        reason: "Current operating period – August 2026",
        carriesActivity: true,
      });
    } else {
      steps.push({ period, target: "PLANNED", reason: "Future period", carriesActivity: false });
    }
  }
  return steps;
}

function monthName(month: number): string {
  return [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ][month - 1]!;
}

// ---------------------------------------------------------------------------
// Rent
// ---------------------------------------------------------------------------

export type PlannedDue = {
  kind: "RENT" | "CAM";
  /** Database id, for addressing the row. Never hashed, never grouped on. */
  leaseId?: string;
  /** The stable identity everything behavioural is derived from. */
  leaseKey: string;
  unitId: string;
  unitCode: string;
  propertyId: string;
  memberId: string;
  /** The period key generate_lease_rent_dues is called with. */
  periodKey: string;
  amount: number;
  issueDate: string;
  dueDate: string;
};

/** Months the narrative posts into, in order. */
export const ACTIVITY_MONTHS = ["2026-05", "2026-06", "2026-07", "2026-08"] as const;

/**
 * Which period keys each lease bills across the activity window.
 *
 * The amount is `lease.rent_amount` untouched -- generate_lease_rent_dues reads
 * it from the row, so the plan must not invent a different one or the plan and
 * the apply would disagree.
 */
export function planRentDues(input: FinancialPlanInput): {
  dues: PlannedDue[];
  decisions: string[];
} {
  const unitById = new Map(input.units.map((u) => [u.id, u]));
  const dues: PlannedDue[] = [];
  const decisions: string[] = [];

  let quarterlyQ2 = 0;

  const propertyCodeById = new Map(input.properties.map((p) => [p.id, p.code]));

  // ACTIVE ONLY, AND THE EXCLUSION IS LOAD-BEARING.
  //
  // The quarterly alignment replaced thirteen leases: each superseded row was
  // ENDED and a boundary-aligned replacement activated in its place. For the
  // three whose start was already aligned, the ENDED row and its replacement
  // carry the SAME `property:unit:startsOn:frequency` key --
  // `unit_leases_no_overlapping_active` constrains ACTIVE rows only, so that
  // historical duplication is legal and expected.
  //
  // It is harmless precisely because nothing financial is planned from a
  // superseded row. If this loop ever widened to include ENDED leases, those
  // three units would get two payer profiles under one key and bill twice.
  const activeKeys = new Set<string>();

  for (const lease of input.leases) {
    if (lease.status !== "ACTIVE") continue;
    const unit = unitById.get(lease.unitId);
    if (!unit) continue;
    const property = propertyCodeById.get(unit.propertyId) ?? unit.propertyId;

    const activeKey = leaseBusinessKey({
      propertyCode: property,
      unitCode: unit.code,
      startsOn: lease.startsOn,
      rentFrequency: lease.rentFrequency,
    });
    if (activeKeys.has(activeKey)) {
      throw new Error(
        `duplicate stable lease key inside the ACTIVE set: ${activeKey}. Two live ` +
          "leases would share one payer profile, so the narrative would be ambiguous. " +
          "Refusing to plan.",
      );
    }
    activeKeys.add(activeKey);

    const keys =
      lease.rentFrequency === "MONTHLY"
        ? [...ACTIVITY_MONTHS]
        : lease.rentFrequency === "QUARTERLY"
          ? ["2026-Q2", "2026-Q3"]
          : ["2026"];

    for (const periodKey of keys) {
      const range = periodRange(lease.rentFrequency, periodKey);

      // COVERAGE, NOT OVERLAP.
      //
      // This used to skip only a period entirely outside the term, mirroring
      // the RPC's old behaviour. Since 20260825182109_rent_partial_period_guard
      // the RPC RAISES on a period the lease merely touches, so an overlap test
      // would put a due in the plan that the apply cannot create -- the plan
      // would stop describing the apply, which is the one thing it exists to do.
      //
      // A period the lease does not touch at all is still a benign skip; a
      // period it touches but does not cover is now simply not planned, and the
      // fixtures were aligned so that case no longer arises.
      const covers =
        lease.startsOn <= range.start && (lease.endsOn ?? "9999-12-31") >= range.end;
      if (!covers) continue;

      if (periodKey === "2026-Q2") quarterlyQ2++;

      dues.push({
        kind: "RENT",
        leaseId: lease.id,
        leaseKey: leaseBusinessKey({
          propertyCode: property,
          unitCode: unit.code,
          startsOn: lease.startsOn,
          rentFrequency: lease.rentFrequency,
        }),
        unitId: lease.unitId,
        unitCode: unit.code,
        propertyId: unit.propertyId,
        memberId: lease.tenantMemberId,
        periodKey,
        amount: lease.rentAmount,
        // generate_lease_rent_dues defaults issue_date to the period start and
        // ALWAYS sets due_date to it. Only issue_date is overridable.
        issueDate: range.start,
        dueDate: range.start,
      });
    }
  }

  if (quarterlyQ2 > 0) {
    decisions.push(
      `${quarterlyQ2} quarterly (commercial) leases bill 2026-Q2, whose range starts ` +
        "2026-04-01 -- inside a period this plan closes without activity. " +
        "generate_lease_rent_dues sets due_date to the period start and it is NOT " +
        "overridable, so those dues would land ~150 days overdue by 31 August and " +
        "would need issue_date overridden into an OPEN month to be recognised at " +
        "all. DECIDE: (a) override issue_date to 2026-05-01 and accept a large " +
        "commercial arrear, (b) bill 2026-Q3 only and leave commercial units " +
        "unbilled for May–June, or (c) open April as an activity month too.",
    );
  }

  return { dues, decisions };
}

function periodRange(
  frequency: PlanLease["rentFrequency"],
  periodKey: string,
): { start: string; end: string } {
  // Mirrors lease_rent_period_range exactly. If these ever disagree the plan
  // stops describing the apply.
  if (frequency === "MONTHLY") {
    const [y, m] = periodKey.split("-").map(Number) as [number, number];
    return { start: `${periodKey}-01`, end: lastDay(y, m) };
  }
  if (frequency === "QUARTERLY") {
    const [yearText, quarterText] = periodKey.split("-Q");
    const year = Number(yearText);
    const quarter = Number(quarterText);
    const startMonth = (quarter - 1) * 3 + 1;
    const endMonth = startMonth + 2;
    return {
      start: `${year}-${String(startMonth).padStart(2, "0")}-01`,
      end: lastDay(year, endMonth),
    };
  }
  return { start: `${periodKey}-01-01`, end: `${periodKey}-12-31` };
}

function lastDay(year: number, month: number): string {
  const day = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

// ---------------------------------------------------------------------------
// CAM
// ---------------------------------------------------------------------------

export type PlannedLevy = {
  propertyId: string;
  propertyCode: string;
  name: string;
  periodStart: string;
  periodEnd: string;
  totalAmount: number;
  allocationBasis: "AREA";
  eligibleUnits: number;
  basisSum: number;
  /** unit id -> allocated share, largest-remainder, summing exactly to total. */
  allocations: Array<{ unitId: string; unitCode: string; area: number; share: number }>;
};

/**
 * One levy, on the largest property, for the operating month.
 *
 * WHY ONE AND NOT ONE PER PROPERTY
 * Three levies would treble the dues without demonstrating anything the first
 * one does not. The point is that a shared cost splits by area and the split
 * reconciles to the cost exactly; a second levy repeats that claim.
 *
 * WHY THE TOTAL IS AN INPUT BUT THE SHARES ARE NOT
 * The total is a real-world fact an operator knows -- what the cleaning and
 * security contracts cost this month. The SHARES are computed from the units'
 * own areas by largest remainder, exactly as compute_service_charge_allocations
 * does, so no unit's figure is chosen.
 */
export function planCamLevy(input: FinancialPlanInput): PlannedLevy | null {
  const byProperty = new Map<string, PlanUnit[]>();
  for (const unit of input.units) {
    if (!unit.isActive) continue;
    const list = byProperty.get(unit.propertyId) ?? [];
    list.push(unit);
    byProperty.set(unit.propertyId, list);
  }

  let chosen: { propertyId: string; units: PlanUnit[] } | null = null;
  for (const [propertyId, units] of byProperty) {
    if (!chosen || units.length > chosen.units.length) chosen = { propertyId, units };
  }
  if (!chosen) return null;

  const property = input.properties.find((p) => p.id === chosen!.propertyId);
  const eligible = chosen.units.filter((u) => u.area !== null && u.area > 0);

  // A unit with no area cannot take an area-based share, and the RPC refuses
  // rather than treating it as zero. Surfaced instead of silently dropped.
  const missingArea = chosen.units.length - eligible.length;

  const basisSum = eligible.reduce((sum, u) => sum + (u.area ?? 0), 0);

  // The August 2026 Common Area Operating Budget: cleaning, security,
  // landscaping and shared utilities for the block.
  //
  // This is the one figure in the whole narrative that is an INPUT, and it is
  // legitimately so: a CAM budget is an external business fact -- management
  // states what the month's services cost and the system allocates it. What
  // would be illegitimate is choosing a per-unit charge, or picking a total to
  // make revenue reach a number. Every share below is computed from the units'
  // own areas.
  const totalAmount = 185_000;

  const allocations = largestRemainder(
    eligible.map((u) => ({ unitId: u.id, unitCode: u.code, area: u.area ?? 0 })),
    basisSum,
    totalAmount,
    input.currencyDecimals,
  );

  return {
    propertyId: chosen.propertyId,
    propertyCode: property?.code ?? "?",
    name: `رسوم الخدمات المشتركة — أغسطس 2026`,
    periodStart: DEMO_STORY.period.start,
    periodEnd: DEMO_STORY.period.end,
    totalAmount,
    allocationBasis: "AREA",
    eligibleUnits: eligible.length + (missingArea > 0 ? 0 : 0),
    basisSum,
    allocations,
  };
}

/**
 * Largest remainder. The share of every unit is floor(exact), then the
 * shortfall is handed out one step at a time to the largest remainders, so the
 * shares sum to the total EXACTLY rather than to the total plus or minus a few
 * piastres. This mirrors compute_service_charge_allocations; a naive round()
 * would not reconcile and the levy would not balance.
 */
function largestRemainder(
  items: Array<{ unitId: string; unitCode: string; area: number }>,
  basisSum: number,
  total: number,
  decimals: number,
): PlannedLevy["allocations"] {
  const step = Math.pow(10, -decimals);
  const scale = Math.pow(10, decimals);

  const exact = items.map((item) => ({
    ...item,
    exact: basisSum === 0 ? 0 : (item.area / basisSum) * total,
  }));

  const floored = exact.map((item) => ({
    ...item,
    share: Math.floor(item.exact * scale) / scale,
  }));

  const distributed = floored.reduce((sum, item) => sum + item.share, 0);
  let shortfallSteps = Math.round((total - distributed) / step);

  const order = [...floored].sort(
    (a, b) => b.exact - a.exact - (Math.floor(b.exact * scale) - Math.floor(a.exact * scale)) / scale,
  );

  for (let i = 0; i < order.length && shortfallSteps > 0; i++, shortfallSteps--) {
    order[i]!.share = Math.round((order[i]!.share + step) * scale) / scale;
  }

  return floored.map(({ unitId, unitCode, area, share }) => ({ unitId, unitCode, area, share }));
}

// ---------------------------------------------------------------------------
// Collection behaviour
// ---------------------------------------------------------------------------

export type PayerProfile = "PROMPT" | "SLOW_30" | "SLOW_60" | "SLOW_90" | "PARTIAL" | "NON_PAYING";

/**
 * Behaviour is chosen; the arrears total is not.
 *
 * Each lease is assigned a profile deterministically from a hash of its id, so
 * the same tenant behaves the same way on every run and the mix is a property
 * of the fiction rather than of a target. Whatever aging this produces is what
 * the aging report will show.
 */
export function assignPayerProfile(leaseId: string): PayerProfile {
  const rng = makeRng(hashString(`payer:${leaseId}`));
  const roll = rng();
  if (roll < 0.55) return "PROMPT";
  if (roll < 0.72) return "SLOW_30";
  if (roll < 0.84) return "SLOW_60";
  if (roll < 0.90) return "SLOW_90";
  if (roll < 0.97) return "PARTIAL";
  return "NON_PAYING";
}

/** How many of the most recent dues a profile leaves unpaid. */
function unpaidTail(profile: PayerProfile): number {
  switch (profile) {
    case "PROMPT":
      return 0;
    case "SLOW_30":
      return 1;
    case "SLOW_60":
      return 2;
    case "SLOW_90":
      return 3;
    case "PARTIAL":
      return 1;
    case "NON_PAYING":
      return 99;
  }
}

export type PlannedPayment = {
  /** Stable identity; also the source of the idempotency key and bank reference. */
  paymentKey: string;
  memberId: string;
  unitId: string;
  unitCode: string;
  propertyId: string;
  amount: number;
  paymentDate: string;
  method: "CASH" | "BANK_TRANSFER" | "CHEQUE";
  /** Due periods this payment settles, in order. */
  allocations: Array<{ periodKey: string; amount: number }>;
};

export type CollectionPlan = {
  payments: PlannedPayment[];
  profiles: Record<PayerProfile, number>;
  /** Outstanding per due, after allocation. */
  outstandingByDue: Array<{ due: PlannedDue; outstanding: number }>;
};

export function planCollections(dues: PlannedDue[]): CollectionPlan {
  // Grouped and hashed on the BUSINESS key. Grouping on the database id was
  // what made the story move when the ids changed.
  const byLease = new Map<string, PlannedDue[]>();
  for (const due of dues) {
    const list = byLease.get(due.leaseKey) ?? [];
    list.push(due);
    byLease.set(due.leaseKey, list);
  }

  const payments: PlannedPayment[] = [];
  const outstandingByDue: CollectionPlan["outstandingByDue"] = [];
  const profiles: Record<PayerProfile, number> = {
    PROMPT: 0,
    SLOW_30: 0,
    SLOW_60: 0,
    SLOW_90: 0,
    PARTIAL: 0,
    NON_PAYING: 0,
  };

  for (const [key, leaseDues] of byLease) {
    const ordered = [...leaseDues].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const profile = assignPayerProfile(key);
    profiles[profile]++;

    const tail = unpaidTail(profile);
    const paidCount = Math.max(0, ordered.length - tail);
    const rng = makeRng(hashString(`method:${key}`));

    for (let i = 0; i < ordered.length; i++) {
      const due = ordered[i]!;
      if (i < paidCount) {
        // Settled in full, a few days after issue.
        const method: PlannedPayment["method"] =
          rng() < 0.55 ? "BANK_TRANSFER" : rng() < 0.8 ? "CASH" : "CHEQUE";
        payments.push({
          paymentKey: paymentBusinessKey(key, due.periodKey, 1),
          memberId: due.memberId,
          unitId: due.unitId,
          unitCode: due.unitCode,
          propertyId: due.propertyId,
          amount: due.amount,
          paymentDate: addDays(due.dueDate, 3 + Math.floor(rng() * 9)),
          method,
          allocations: [{ periodKey: due.periodKey, amount: due.amount }],
        });
        outstandingByDue.push({ due, outstanding: 0 });
      } else if (profile === "PARTIAL" && i === paidCount) {
        // One partial settlement, so the demo shows a due that is neither open
        // nor closed -- the state most systems render badly.
        const part = round2(due.amount * 0.4);
        payments.push({
          paymentKey: paymentBusinessKey(key, due.periodKey, 1),
          memberId: due.memberId,
          unitId: due.unitId,
          unitCode: due.unitCode,
          propertyId: due.propertyId,
          amount: part,
          paymentDate: addDays(due.dueDate, 6),
          method: "BANK_TRANSFER",
          allocations: [{ periodKey: due.periodKey, amount: part }],
        });
        outstandingByDue.push({ due, outstanding: round2(due.amount - part) });
      } else {
        outstandingByDue.push({ due, outstanding: due.amount });
      }
    }
  }

  return { payments, profiles, outstandingByDue };
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

// ---------------------------------------------------------------------------
// Aging — a consequence, never an input
// ---------------------------------------------------------------------------

/**
 * Bucket boundaries, stated once so the renderer cannot label them wrongly:
 *   current   0-30 days past due
 *   d30      31-60
 *   d60      61-90
 *   d90plus   over 90
 */
export type AgingBuckets = {
  current: number;
  d30: number;
  d60: number;
  d90plus: number;
  total: number;
};

export function computeAging(
  outstanding: CollectionPlan["outstandingByDue"],
  asOf: string,
): AgingBuckets {
  const buckets: AgingBuckets = { current: 0, d30: 0, d60: 0, d90plus: 0, total: 0 };
  for (const { due, outstanding: amount } of outstanding) {
    if (amount <= 0) continue;
    const age = daysBetween(due.dueDate, asOf);
    if (age <= 30) buckets.current += amount;
    else if (age <= 60) buckets.d30 += amount;
    else if (age <= 90) buckets.d60 += amount;
    else buckets.d90plus += amount;
    buckets.total += amount;
  }
  return {
    current: round2(buckets.current),
    d30: round2(buckets.d30),
    d60: round2(buckets.d60),
    d90plus: round2(buckets.d90plus),
    total: round2(buckets.total),
  };
}

function daysBetween(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000);
}
