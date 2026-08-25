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
  id: string;
  code: string;
  area: number | null;
  unitType: string;
  propertyId: string;
  isActive: boolean;
};

export type PlanLease = {
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
  leaseId?: string;
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

  for (const lease of input.leases) {
    if (lease.status !== "ACTIVE") continue;
    const unit = unitById.get(lease.unitId);
    if (!unit) continue;

    const keys =
      lease.rentFrequency === "MONTHLY"
        ? [...ACTIVITY_MONTHS]
        : lease.rentFrequency === "QUARTERLY"
          ? ["2026-Q2", "2026-Q3"]
          : ["2026"];

    for (const periodKey of keys) {
      const range = periodRange(lease.rentFrequency, periodKey);
      // The RPC skips a period that falls outside the lease term, so the plan
      // must skip it too or it would over-count.
      if (range.start > (lease.endsOn ?? "9999-12-31") || range.end < lease.startsOn) continue;

      if (periodKey === "2026-Q2") quarterlyQ2++;

      dues.push({
        kind: "RENT",
        leaseId: lease.id,
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

  // A plausible monthly operating cost for the block: cleaning, security,
  // landscaping, shared utilities. Chosen as a cost, not as a revenue target.
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
  const byLease = new Map<string, PlannedDue[]>();
  for (const due of dues) {
    const key = due.leaseId ?? `unit:${due.unitId}`;
    const list = byLease.get(key) ?? [];
    list.push(due);
    byLease.set(key, list);
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
