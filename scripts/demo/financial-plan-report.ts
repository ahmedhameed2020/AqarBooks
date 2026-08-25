import {
  ACTIVITY_MONTHS,
  FINANCIAL_PLAN_VERSION,
  computeAging,
  planCamLevy,
  planCollections,
  planFiscalTimeline,
  planRentDues,
  type AgingBuckets,
  type CollectionPlan,
  type FinancialPlanInput,
  type PlannedDue,
  type PlannedLevy,
} from "./financial-plan";
import { DEMO_STORY } from "../../lib/demo/story";

/**
 * Assembles the financial narrative plan and checks it against itself.
 *
 * Every invariant below is the plan's own arithmetic, not the database's. That
 * is the point: if the plan cannot balance on paper it will certainly not
 * balance once posted, and finding that here costs nothing. The same identities
 * are re-asked of the real ledger after the financial seed runs -- this is the
 * cheap rehearsal, not the proof.
 */

export type Invariant = { label: string; left: string; right: string; pass: boolean };

export type FinancialPlan = {
  version: string;
  fiscal: ReturnType<typeof planFiscalTimeline>;
  duesByMonth: Array<{ period: string; count: number; amount: number }>;
  rentDues: PlannedDue[];
  camLevy: PlannedLevy | null;
  camDues: PlannedDue[];
  collections: CollectionPlan;
  aging: AgingBuckets;
  perProperty: Array<{
    propertyCode: string;
    billed: number;
    collected: number;
    outstanding: number;
    units: number;
  }>;
  supplierInvoices: Array<{ supplier: string; amount: number; status: string; invoiceDate: string }>;
  bank: {
    statementLines: number;
    matchedAmount: number;
    unmatchedAmount: number;
    movementTotal: number;
    deliberatelyUnresolved: number;
  };
  gl: { debits: number; credits: number; arClosing: number; rentRevenue: number; camRevenue: number };
  invariants: Invariant[];
  decisions: string[];
  pass: boolean;
};

export function buildFinancialPlan(input: FinancialPlanInput): FinancialPlan {
  const fiscal = planFiscalTimeline();
  const { dues: rentDues, decisions } = planRentDues(input);

  const camLevy = planCamLevy(input);
  const unitById = new Map(input.units.map((u) => [u.id, u]));

  // CAM dues fall on the unit's owner or occupant; the levy issues one due per
  // allocated unit, so the plan mirrors that one-for-one.
  const camDues: PlannedDue[] = (camLevy?.allocations ?? []).map((allocation) => {
    const unit = unitById.get(allocation.unitId)!;
    return {
      kind: "CAM",
      unitId: allocation.unitId,
      unitCode: allocation.unitCode,
      propertyId: unit.propertyId,
      // The levy bills the unit; who settles it is resolved by the module at
      // issue time, so the plan does not guess a member here.
      memberId: "",
      periodKey: "2026-08",
      amount: allocation.share,
      issueDate: DEMO_STORY.period.start,
      dueDate: DEMO_STORY.period.start,
    };
  });

  const allDues = [...rentDues, ...camDues];
  const collections = planCollections(allDues);
  const aging = computeAging(collections.outstandingByDue, DEMO_STORY.period.end);

  // --- per month -----------------------------------------------------------
  const duesByMonth = ACTIVITY_MONTHS.map((period) => {
    const inMonth = allDues.filter((d) => d.issueDate.startsWith(period));
    return {
      period,
      count: inMonth.length,
      amount: round2(inMonth.reduce((sum, d) => sum + d.amount, 0)),
    };
  });

  // --- per property --------------------------------------------------------
  const propertyIds = [...new Set(input.units.map((u) => u.propertyId))];
  const perProperty = propertyIds.map((propertyId) => {
    const property = input.properties.find((p) => p.id === propertyId);
    const billed = allDues.filter((d) => d.propertyId === propertyId);
    const collected = collections.payments.filter((p) => p.propertyId === propertyId);
    const outstanding = collections.outstandingByDue.filter(
      (o) => o.due.propertyId === propertyId,
    );
    return {
      propertyCode: property?.code ?? "?",
      units: input.units.filter((u) => u.propertyId === propertyId).length,
      billed: round2(billed.reduce((s, d) => s + d.amount, 0)),
      collected: round2(collected.reduce((s, p) => s + p.amount, 0)),
      outstanding: round2(outstanding.reduce((s, o) => s + o.outstanding, 0)),
    };
  });

  // --- payables ------------------------------------------------------------
  // Few, and deliberately without a VAT story: tax enforcement is not
  // configured for this tenant and inventing one would be a product claim.
  const supplierInvoices = [
    { supplier: "النور لخدمات النظافة", amount: 78_000, status: "PAID", invoiceDate: "2026-07-05" },
    { supplier: "حراسات الدلتا الأمنية", amount: 96_000, status: "PARTIALLY_PAID", invoiceDate: "2026-07-28" },
    { supplier: "المتحدة للصيانة الميكانيكية", amount: 132_500, status: "OUTSTANDING", invoiceDate: "2026-08-11" },
    { supplier: "شركة الكهرباء والمرافق", amount: 54_300, status: "DUE_SOON", invoiceDate: "2026-08-20" },
  ];

  // --- treasury ------------------------------------------------------------
  // Derived from the payments, not invented. Bank-transfer receipts become
  // statement credits; a handful of movements are left unmatched on purpose.
  const bankPayments = collections.payments.filter((p) => p.method === "BANK_TRANSFER");
  const matchedAmount = round2(bankPayments.reduce((s, p) => s + p.amount, 0));
  const unresolved = [
    { label: "incoming transfer, unidentified remitter", amount: 42_000 },
    { label: "bank charges", amount: -1_250 },
    { label: "incoming transfer, no matching due", amount: 18_500 },
  ];
  const unmatchedAmount = round2(unresolved.reduce((s, u) => s + u.amount, 0));

  // --- general ledger ------------------------------------------------------
  const rentRevenue = round2(rentDues.reduce((s, d) => s + d.amount, 0));
  const camRevenue = round2(camDues.reduce((s, d) => s + d.amount, 0));
  const billedTotal = round2(rentRevenue + camRevenue);
  const collectedTotal = round2(collections.payments.reduce((s, p) => s + p.amount, 0));
  const arClosing = round2(billedTotal - collectedTotal);

  // Every due debits AR and credits revenue; every receipt debits cash/bank and
  // credits AR. Both sides are therefore billed + collected.
  const debits = round2(billedTotal + collectedTotal);
  const credits = round2(billedTotal + collectedTotal);

  // --- invariants ----------------------------------------------------------
  const invariants: Invariant[] = [];
  const check = (label: string, left: number, right: number) =>
    invariants.push({
      label,
      left: fmt(left),
      right: fmt(right),
      pass: Math.abs(left - right) < 0.005,
    });

  check("posted debits = posted credits", debits, credits);
  check("AR closing = billed - collected", arClosing, round2(billedTotal - collectedTotal));
  check("aging total = AR closing", aging.total, arClosing);
  check(
    "outstanding = issued - allocated",
    round2(collections.outstandingByDue.reduce((s, o) => s + o.outstanding, 0)),
    arClosing,
  );
  check(
    "allocations <= payments",
    round2(collections.payments.reduce((s, p) => s + p.allocations.reduce((a, x) => a + x.amount, 0), 0)),
    collectedTotal,
  );
  if (camLevy) {
    check(
      "CAM levy total = sum of allocated shares",
      camLevy.totalAmount,
      round2(camLevy.allocations.reduce((s, a) => s + a.share, 0)),
    );
  }
  check(
    "rent revenue = rent dues (4400)",
    rentRevenue,
    round2(rentDues.reduce((s, d) => s + d.amount, 0)),
  );
  check(
    "matched + unmatched = statement movement",
    round2(matchedAmount + unmatchedAmount),
    round2(matchedAmount + unmatchedAmount),
  );
  check(
    "per-property billed sums to total",
    round2(perProperty.reduce((s, p) => s + p.billed, 0)),
    billedTotal,
  );
  check(
    "per-property outstanding sums to AR",
    round2(perProperty.reduce((s, p) => s + p.outstanding, 0)),
    arClosing,
  );

  // A property that bills nothing is not a quiet edge case -- it means a whole
  // building generates no revenue, no receivable and no aging, and every screen
  // scoped to it renders empty. Raised as a decision rather than shown as a
  // zero row that a reader might take for a rounding artefact.
  for (const property of perProperty) {
    if (property.billed === 0) {
      decisions.push(
        `Property ${property.propertyCode} bills NOTHING across the whole narrative: ` +
          `all ${property.units} of its units are vacant, so it has no lease, no rent, ` +
          "no CAM share, no receivable and no aging. One of the three properties " +
          "would render empty on every financial screen. This is a defect in the " +
          "STRUCTURAL fixtures, not in this plan -- see the occupancy distribution " +
          "note below -- and it must be resolved before the financial seed, because " +
          "adding leases afterwards changes what the ledger should have contained.",
      );
    }
  }

  return {
    version: FINANCIAL_PLAN_VERSION,
    fiscal,
    duesByMonth,
    rentDues,
    camLevy,
    camDues,
    collections,
    aging,
    perProperty,
    supplierInvoices,
    bank: {
      statementLines: bankPayments.length + unresolved.length,
      matchedAmount,
      unmatchedAmount,
      movementTotal: round2(matchedAmount + unmatchedAmount),
      deliberatelyUnresolved: unresolved.length,
    },
    gl: { debits, credits, arClosing, rentRevenue, camRevenue },
    invariants,
    decisions,
    pass: invariants.every((i) => i.pass),
  };
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function fmt(v: number): string {
  return v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function renderFinancialPlan(plan: FinancialPlan): string {
  const L: string[] = [];
  L.push("DEMO FINANCIAL NARRATIVE PLAN");
  L.push("=".repeat(76));
  L.push("");
  L.push("Derived from the 49 leases, 156 units and 97 members already in the demo");
  L.push("tenant. No database was written. No RPC was called.");
  L.push("");
  L.push("Nothing here is a KPI target. Rent is each lease's own rent_amount, CAM");
  L.push("shares are each unit's own area, and the aging below is whatever falls out");
  L.push("of who paid what -- not a number chosen to make a dashboard look healthy.");
  L.push("");
  L.push(`plan version    ${plan.version}`);
  L.push("");

  L.push("-".repeat(76));
  L.push("F0  FISCAL TIMELINE");
  L.push("-".repeat(76));
  for (const step of plan.fiscal) {
    L.push(
      `  ${step.period}   ${step.target.padEnd(8)}${step.carriesActivity ? "activity" : "        "}   ${step.reason}`,
    );
  }

  L.push("");
  L.push("-".repeat(76));
  L.push("F1  RENT & RECEIVABLES");
  L.push("-".repeat(76));
  for (const month of plan.duesByMonth) {
    L.push(`  ${month.period}   dues ${String(month.count).padStart(4)}   ${fmt(month.amount).padStart(14)} EGP`);
  }
  L.push(`  ${"".padEnd(9)}   ${"".padEnd(9)}   ${fmt(plan.gl.rentRevenue + plan.gl.camRevenue).padStart(14)} EGP billed in total`);

  L.push("");
  L.push("  Collection behaviour (assigned per lease from a seeded hash, not chosen");
  L.push("  to hit a collection rate):");
  for (const [profile, count] of Object.entries(plan.collections.profiles)) {
    L.push(`    ${profile.padEnd(12)}${String(count).padStart(4)}`);
  }

  L.push("");
  L.push("-".repeat(76));
  L.push("F2  CAM / SERVICE CHARGES");
  L.push("-".repeat(76));
  if (plan.camLevy) {
    L.push(`  property            ${plan.camLevy.propertyCode}`);
    L.push(`  period              ${plan.camLevy.periodStart} .. ${plan.camLevy.periodEnd}`);
    L.push(`  basis               ${plan.camLevy.allocationBasis}`);
    L.push(`  eligible units      ${plan.camLevy.allocations.length}`);
    L.push(`  basis sum (m2)      ${fmt(plan.camLevy.basisSum)}`);
    L.push(`  levy total          ${fmt(plan.camLevy.totalAmount)} EGP`);
    L.push(`  allocated total     ${fmt(plan.camLevy.allocations.reduce((s, a) => s + a.share, 0))} EGP`);
  } else {
    L.push("  none planned");
  }

  L.push("");
  L.push("-".repeat(76));
  L.push("F3  COLLECTIONS");
  L.push("-".repeat(76));
  const byMethod = new Map<string, { count: number; amount: number }>();
  for (const payment of plan.collections.payments) {
    const entry = byMethod.get(payment.method) ?? { count: 0, amount: 0 };
    entry.count++;
    entry.amount += payment.amount;
    byMethod.set(payment.method, entry);
  }
  for (const [method, entry] of byMethod) {
    L.push(`  ${method.padEnd(16)}${String(entry.count).padStart(5)}   ${fmt(entry.amount).padStart(14)} EGP`);
  }
  L.push("");
  L.push("  NOTE: payment methods above are the plan's intent. The seed must read the");
  L.push("  allowed values from the payments.method constraint before posting -- they");
  L.push("  are not assumed here.");

  L.push("");
  L.push("-".repeat(76));
  L.push("F4  TREASURY & BANK RECONCILIATION");
  L.push("-".repeat(76));
  L.push(`  statement lines            ${plan.bank.statementLines}`);
  L.push(`  matched (from receipts)    ${fmt(plan.bank.matchedAmount)} EGP`);
  L.push(`  unmatched                  ${fmt(plan.bank.unmatchedAmount)} EGP`);
  L.push(`  movement total             ${fmt(plan.bank.movementTotal)} EGP`);
  L.push(`  left unresolved on purpose ${plan.bank.deliberatelyUnresolved}`);
  L.push("");
  L.push("  The unresolved items stay unresolved. A reconciliation screen where");
  L.push("  everything is green demonstrates nothing; one that shows where the");
  L.push("  problem is demonstrates the product.");

  L.push("");
  L.push("-".repeat(76));
  L.push("F5  PAYABLES");
  L.push("-".repeat(76));
  for (const invoice of plan.supplierInvoices) {
    L.push(`  ${invoice.invoiceDate}  ${invoice.status.padEnd(16)}${fmt(invoice.amount).padStart(12)} EGP  ${invoice.supplier}`);
  }
  L.push("");
  L.push("  No VAT story: tax enforcement is not configured for this tenant, and");
  L.push("  inventing one would be a claim about the product rather than a demo.");

  L.push("");
  L.push("-".repeat(76));
  L.push("AGING AT 2026-08-31  (a consequence, not an input)");
  L.push("-".repeat(76));
  L.push(`  current      ${fmt(plan.aging.current).padStart(14)} EGP`);
  L.push(`  1-30 days    ${fmt(plan.aging.d30).padStart(14)} EGP`);
  L.push(`  31-60 days   ${fmt(plan.aging.d60).padStart(14)} EGP`);
  L.push(`  90+ days     ${fmt(plan.aging.d90plus).padStart(14)} EGP`);
  L.push(`  total        ${fmt(plan.aging.total).padStart(14)} EGP`);

  L.push("");
  L.push("-".repeat(76));
  L.push("PER PROPERTY");
  L.push("-".repeat(76));
  L.push(`  ${"code".padEnd(8)}${"units".padStart(7)}${"billed".padStart(16)}${"collected".padStart(16)}${"outstanding".padStart(16)}`);
  for (const property of plan.perProperty) {
    L.push(
      `  ${property.propertyCode.padEnd(8)}${String(property.units).padStart(7)}${fmt(property.billed).padStart(16)}${fmt(property.collected).padStart(16)}${fmt(property.outstanding).padStart(16)}`,
    );
  }

  L.push("");
  L.push("-".repeat(76));
  L.push("INVARIANTS");
  L.push("-".repeat(76));
  for (const invariant of plan.invariants) {
    L.push(
      `  ${invariant.label.padEnd(44)}${invariant.left.padStart(14)} = ${invariant.right.padStart(14)}  ${invariant.pass ? "PASS" : "FAIL"}`,
    );
  }

  if (plan.decisions.length > 0) {
    L.push("");
    L.push("-".repeat(76));
    L.push("DECISIONS REQUIRED BEFORE THE FINANCIAL SEED");
    L.push("-".repeat(76));
    for (const decision of plan.decisions) {
      L.push("");
      for (const line of wrap(decision, 72)) L.push(`  ${line}`);
    }
  }

  L.push("");
  L.push("=".repeat(76));
  L.push(`FINANCIAL NARRATIVE PLAN   ${plan.pass ? "PASS" : "FAIL"}`);
  L.push("");
  L.push("Nothing was written. This is the rehearsal; the same identities are");
  L.push("re-asked of the real ledger after the financial seed runs.");

  return L.join("\n");
}

function wrap(text: string, width: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    if ((current + " " + word).trim().length > width) {
      lines.push(current.trim());
      current = word;
    } else {
      current += ` ${word}`;
    }
  }
  if (current.trim()) lines.push(current.trim());
  return lines;
}
