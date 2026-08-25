/**
 * Builds the financial narrative plan from the real demo tenant. READ-ONLY.
 *
 * It reads the rows the structural seed created -- 49 leases with their own
 * rent terms, 156 units with their own areas, the properties they belong to --
 * and works out what the financial stages would produce. It writes nothing and
 * calls no RPC.
 *
 * The point is to review the story as accounting before reviewing it as code.
 * `demo-plan.ts` caught two real defects that way (the lease gap and the
 * guessed chart-of-accounts codes) before either could reach the database.
 *
 * Report: test-results/demo-financial-plan.txt
 */
import { describe, it, expect, beforeAll } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import type { Database } from "../lib/supabase/types";
import {
  buildFinancialPlan,
  renderFinancialPlan,
  type FinancialPlan,
} from "../scripts/demo/financial-plan-report";
import type { FinancialPlanInput, PlanLease, PlanUnit } from "../scripts/demo/financial-plan";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const organizationId = process.env.DEMO_ORGANIZATION_ID!;
const CONFIGURED = Boolean(url && serviceKey && organizationId);

const admin = CONFIGURED
  ? createClient<Database>(url, serviceKey, { auth: { persistSession: false } })
  : null;

let plan: FinancialPlan | null = null;
let input: FinancialPlanInput | null = null;

beforeAll(async () => {
  if (!admin) return;

  const { data: properties } = await admin
    .from("properties")
    .select("id, code, name")
    .eq("organization_id", organizationId);

  const { data: units } = await admin
    .from("units")
    .select("id, code, area, unit_type, property_id, is_active, archived_at")
    .eq("organization_id", organizationId)
    .range(0, 4999);

  const { data: leases } = await admin
    .from("unit_leases")
    .select("id, unit_id, tenant_member_id, rent_amount, rent_frequency, starts_on, ends_on, status")
    .eq("organization_id", organizationId)
    .range(0, 4999);

  const { data: ownerships } = await admin
    .from("unit_ownerships")
    .select("unit_id")
    .eq("organization_id", organizationId)
    .range(0, 4999);

  input = {
    properties: (properties ?? []).map((p) => ({ id: p.id, code: p.code, name: p.name })),
    units: (units ?? []).map(
      (u): PlanUnit => ({
        id: u.id,
        code: u.code,
        area: u.area,
        unitType: u.unit_type,
        propertyId: u.property_id,
        // A unit archived by the structural seed is inactive for CAM purposes
        // regardless of the is_active flag, and the levy RPC filters on
        // is_active, so both are honoured here.
        isActive: u.is_active && u.archived_at === null,
      }),
    ),
    leases: (leases ?? []).map(
      (l): PlanLease => ({
        id: l.id,
        unitId: l.unit_id,
        tenantMemberId: l.tenant_member_id,
        rentAmount: Number(l.rent_amount),
        rentFrequency: l.rent_frequency,
        startsOn: l.starts_on,
        endsOn: l.ends_on,
        status: l.status,
      }),
    ),
    ownerUnitIds: (ownerships ?? []).map((o) => o.unit_id),
    currencyDecimals: 2,
  };

  plan = buildFinancialPlan(input);

  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/demo-financial-plan.txt", renderFinancialPlan(plan) + "\n", "utf8");
});

describe.skipIf(!CONFIGURED)("demo financial narrative plan", () => {
  it("reads the real structural tenant, not a fixture", () => {
    // If this drifts, every figure below describes something other than the
    // tenant that was actually seeded.
    expect(input!.units).toHaveLength(156);
    expect(input!.leases.filter((l) => l.status === "ACTIVE")).toHaveLength(49);
    expect(input!.properties).toHaveLength(3);
  });

  it("derives rent from the lease rows and invents no amount", () => {
    // Every planned rent due must equal its lease's own rent_amount.
    const rentByLease = new Map(input!.leases.map((l) => [l.id, Number(l.rentAmount)]));
    for (const due of plan!.rentDues) {
      expect(due.amount, `rent for lease ${due.leaseId} does not match the lease row`).toBe(
        rentByLease.get(due.leaseId!),
      );
    }
    expect(plan!.rentDues.length).toBeGreaterThan(0);
  });

  it("allocates CAM by area, summing exactly to the levy total", () => {
    const levy = plan!.camLevy!;
    expect(levy).toBeTruthy();
    const allocated = levy.allocations.reduce((s, a) => s + a.share, 0);
    // Exactly, not approximately: largest remainder exists so the split
    // reconciles to the cost rather than to the cost plus a rounding tail.
    expect(Math.round(allocated * 100)).toBe(Math.round(levy.totalAmount * 100));

    // And every share must be traceable to a real unit's real area.
    const areaByUnit = new Map(input!.units.map((u) => [u.id, u.area]));
    for (const allocation of levy.allocations) {
      expect(allocation.area).toBe(areaByUnit.get(allocation.unitId));
    }
  });

  it("never places a levy share on an inactive unit", () => {
    const active = new Set(input!.units.filter((u) => u.isActive).map((u) => u.id));
    for (const allocation of plan!.camLevy!.allocations) {
      expect(active.has(allocation.unitId), `${allocation.unitCode} is not active`).toBe(true);
    }
  });

  it("treats aging as a consequence: it equals the outstanding it was computed from", () => {
    const outstanding = plan!.collections.outstandingByDue.reduce((s, o) => s + o.outstanding, 0);
    expect(Math.abs(plan!.aging.total - outstanding)).toBeLessThan(0.005);
  });

  it("allocates no more than it collects", () => {
    for (const payment of plan!.collections.payments) {
      const allocated = payment.allocations.reduce((s, a) => s + a.amount, 0);
      expect(allocated).toBeLessThanOrEqual(payment.amount + 0.005);
    }
  });

  it("balances every planned identity", () => {
    const failures = plan!.invariants.filter((i) => !i.pass);
    expect(
      failures.map((f) => `${f.label}: ${f.left} != ${f.right}`),
      "planned invariants do not balance",
    ).toEqual([]);
    expect(plan!.pass).toBe(true);
  });

  it("reconciles per property, not only in total", () => {
    // Real-estate specificity is the product's argument; a total that balances
    // while a property does not would undercut it.
    const billed = plan!.perProperty.reduce((s, p) => s + p.billed, 0);
    const total = plan!.gl.rentRevenue + plan!.gl.camRevenue;
    expect(Math.abs(billed - total)).toBeLessThan(0.005);
  });

  it("leaves bank items deliberately unresolved", () => {
    expect(plan!.bank.deliberatelyUnresolved).toBeGreaterThan(0);
  });

  it("surfaces the decisions rather than silently choosing", () => {
    // Any real accounting choice -- a quarterly period straddling a closed
    // month, a property that bills nothing -- must be raised, not resolved
    // quietly. A plan that picked one on its own is the thing this whole
    // exercise exists to prevent.
    expect(plan!.decisions.length).toBeGreaterThan(0);
  });

  it("refuses to plan a property that bills nothing without saying so", () => {
    const silent = plan!.perProperty.filter(
      (property) =>
        property.billed === 0 &&
        !plan!.decisions.some((d) => d.includes(`Property ${property.propertyCode} bills NOTHING`)),
    );
    expect(silent.map((p) => p.propertyCode), "a dead property was not surfaced").toEqual([]);
  });

  it("occupancy is distributed across buildings, not concentrated", () => {
    // THIS IS THE TEST THAT WAS MISSING. The structural invariants asserted
    // 121 = 72 + 49 and passed, because none of them asked WHERE the 121 were.
    // They are not spread: three buildings are 100% occupied and the commercial
    // tower is 100% vacant, which no count-based check could ever have caught.
    const occupiedUnitIds = new Set([
      ...plan!.rentDues.map((d) => d.unitId),
      ...input!.ownerUnitIds,
    ]);

    const byProperty = new Map<string, { total: number; occupied: number }>();
    for (const unit of input!.units) {
      if (!unit.isActive) continue;
      const entry = byProperty.get(unit.propertyId) ?? { total: 0, occupied: 0 };
      entry.total++;
      if (occupiedUnitIds.has(unit.id)) entry.occupied++;
      byProperty.set(unit.propertyId, entry);
    }

    const dead = [...byProperty.entries()]
      .filter(([, e]) => e.occupied === 0)
      .map(([id]) => input!.properties.find((p) => p.id === id)?.code ?? id);

    expect(
      dead,
      `these properties have zero occupied units: ${dead.join(", ")}. ` +
        "Occupancy was assigned by array order rather than distributed, so the " +
        "last building in the fixture list absorbed the entire vacancy.",
    ).toEqual([]);
  });
});
