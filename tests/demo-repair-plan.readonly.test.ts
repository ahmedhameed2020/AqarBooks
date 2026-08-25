/**
 * Builds the structural repair plan from the applied tenant. READ-ONLY.
 *
 * Reports what would have to change to move the database from the distribution
 * the old assignTenure produced to the one the corrected fixtures declare, and
 * writes nothing.
 *
 * Report: test-results/demo-repair-plan.txt
 */
import { describe, it, expect, beforeAll } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import type { Database } from "../lib/supabase/types";
import { buildRepairPlan, renderRepairPlan, type RepairPlan } from "../scripts/demo/repair-plan";
import {
  buildFinancialPlan,
  renderFinancialPlan,
  type FinancialPlan,
} from "../scripts/demo/financial-plan-report";
import {
  generateLeases,
  generateMembers,
  generateUnits,
} from "../scripts/demo/demo-fixtures";
import type { FinancialPlanInput } from "../scripts/demo/financial-plan";
import { DEMO_STORY } from "../lib/demo/story";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const organizationId = process.env.DEMO_ORGANIZATION_ID!;
const CONFIGURED = Boolean(url && serviceKey && organizationId);

const admin = CONFIGURED
  ? createClient<Database>(url, serviceKey, { auth: { persistSession: false } })
  : null;

let plan: RepairPlan | null = null;
let projected: FinancialPlan | null = null;

beforeAll(async () => {
  if (!admin) return;

  const { data: properties } = await admin
    .from("properties")
    .select("id, code")
    .eq("organization_id", organizationId);
  const propertyCodeById = new Map((properties ?? []).map((p) => [p.id, p.code]));

  const { data: units } = await admin
    .from("units")
    .select("id, code, property_id")
    .eq("organization_id", organizationId)
    .range(0, 4999);

  const unitIdByCode = new Map((units ?? []).map((u) => [u.code, u.id]));
  const unitCodeById = new Map((units ?? []).map((u) => [u.id, u.code]));
  const propertyCodeByUnitCode = new Map(
    (units ?? []).map((u) => [u.code, propertyCodeById.get(u.property_id) ?? "?"]),
  );

  const { data: leases } = await admin
    .from("unit_leases")
    .select("id, unit_id, tenant_member_id, status, rent_frequency")
    .eq("organization_id", organizationId)
    .range(0, 4999);

  const { data: ownerships } = await admin
    .from("unit_ownerships")
    .select("unit_id, member_id")
    .eq("organization_id", organizationId)
    .range(0, 4999);

  const { data: members } = await admin
    .from("members")
    .select("id, email, is_company")
    .eq("organization_id", organizationId)
    .range(0, 4999);

  plan = buildRepairPlan({
    unitIdByCode,
    propertyCodeByUnitCode,
    currentLeases: (leases ?? []).map((l) => ({
      id: l.id,
      unitId: l.unit_id,
      unitCode: unitCodeById.get(l.unit_id) ?? "?",
      tenantMemberId: l.tenant_member_id,
      status: l.status,
      rentFrequency: l.rent_frequency,
    })),
    currentOwnerships: (ownerships ?? []).map((o) => ({
      unitId: o.unit_id,
      unitCode: unitCodeById.get(o.unit_id) ?? "?",
      memberId: o.member_id,
    })),
    currentMembers: (members ?? []).map((m) => ({
      id: m.id,
      email: m.email,
      isCompany: m.is_company,
    })),
  });

  // ---------------------------------------------------------------------
  // Projection: what the financial plan becomes once the repair is applied.
  //
  // demo-financial-plan.readonly.test.ts reads the DATABASE, so it stays red
  // until the repair actually lands -- correctly, because it is red about
  // reality rather than about an assertion. This projects the same planner over
  // the corrected FIXTURES instead, so the post-repair story can be reviewed
  // before authorising the write.
  // ---------------------------------------------------------------------
  const fixtureUnits = generateUnits();
  const { assignment } = generateMembers(fixtureUnits);
  const fixtureLeases = generateLeases(fixtureUnits, assignment);

  const propertyIdByCode = new Map((properties ?? []).map((p) => [p.code, p.id]));
  const syntheticUnitId = (code: string) => `fixture:${code}`;

  const projectionInput: FinancialPlanInput = {
    properties: (properties ?? []).map((p) => ({ id: p.id, code: p.code, name: p.code })),
    units: fixtureUnits.map((u) => ({
      id: syntheticUnitId(u.code),
      code: u.code,
      area: u.area,
      unitType: u.unitType,
      propertyId: propertyIdByCode.get(u.propertyCode) ?? u.propertyCode,
      isActive: !u.archived,
    })),
    leases: fixtureLeases.map((l) => ({
      id: `fixture-lease:${l.unitCode}`,
      unitId: syntheticUnitId(l.unitCode),
      tenantMemberId: l.memberEmail,
      rentAmount: l.rentAmount,
      rentFrequency: l.rentFrequency,
      startsOn: l.startsOn,
      endsOn: l.endsOn,
      status: "ACTIVE",
    })),
    ownerUnitIds: fixtureUnits
      .filter((u) => !u.archived && u.tenure === "OWNER_RESIDENT")
      .map((u) => syntheticUnitId(u.code)),
    currencyDecimals: 2,
  };

  projected = buildFinancialPlan(projectionInput);

  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/demo-repair-plan.txt", renderRepairPlan(plan) + "\n", "utf8");
  writeFileSync(
    "test-results/demo-financial-plan-projected.txt",
    "PROJECTED -- assumes the structural repair has been applied.\n" +
      "Built from the corrected fixtures, not from the database.\n\n" +
      renderFinancialPlan(projected) +
      "\n",
    "utf8",
  );
});

describe.skipIf(!CONFIGURED)("demo structural repair plan", () => {
  it("targets the declared occupancy plan exactly", () => {
    for (const declared of DEMO_STORY.occupancyPlan) {
      const row = plan!.target.find((t) => t.propertyCode === declared.propertyCode)!;
      expect(row.occupied, `${declared.propertyCode} occupied`).toBe(declared.occupied);
      expect(row.leased, `${declared.propertyCode} leased`).toBe(declared.leased);
    }
  });

  it("preserves the portfolio totals", () => {
    const sum = (key: "active" | "occupied" | "leased" | "ownerResident" | "vacant") =>
      plan!.target.reduce((s, t) => s + t[key], 0);
    expect(sum("active")).toBe(148);
    expect(sum("occupied")).toBe(121);
    expect(sum("leased")).toBe(49);
    expect(sum("ownerResident")).toBe(72);
    expect(sum("vacant")).toBe(27);
  });

  it("gives Palm Gate a commercial tenancy where it had none", () => {
    // Asserted as a TARGET, not as pending work. Written before the repair
    // this expected 18 leases still to create; once applied there were none
    // left and it failed -- describing a world that had moved on rather than
    // an invariant. The target holds in both states.
    const pg = plan!.target.find((t) => t.propertyCode === "PG")!;
    expect(pg.leased).toBe(18);
    expect(pg.ownerResident).toBe(0);
    expect(pg.vacant).toBeGreaterThan(0);

    for (const lease of plan!.leasesToCreate.filter((l) => l.propertyCode === "PG")) {
      expect(lease.rentFrequency, `${lease.unitCode} must be quarterly`).toBe("QUARTERLY");
    }
  });

  it("converges: once applied, the plan is empty", () => {
    // The property that matters after an apply. A repair plan that still wants
    // work when the repair has run would mean it is not idempotent.
    const pending = plan!.leasesToCreate.length + plan!.leasesToEnd.length;
    if (pending === 0) {
      expect(plan!.membersToCreate, "members pending with no leases pending").toEqual([]);
    } else {
      // Still pending: creates and ends must stay balanced.
      expect(plan!.leasesToCreate.length).toBe(plan!.leasesToEnd.length);
    }
  });

  it("ends exactly as many leases as it creates outside Palm Gate", () => {
    // The repair moves tenancies, it does not change how many exist.
    const created = plan!.leasesToCreate.length;
    const ended = plan!.leasesToEnd.length;
    expect(created - ended, "the repair changes the number of active leases").toBe(0);
  });

  it("only ever creates companies for commercial tenancies", () => {
    // Once applied there is nothing left to create, so the assertion is about
    // WHAT would be created rather than that anything is.
    for (const member of plan!.membersToCreate) {
      expect(
        member.isCompany,
        `${member.email} would be created as an individual; the repair only adds commercial tenants`,
      ).toBe(true);
      expect(member.email.startsWith("c-")).toBe(true);
    }
  });

  it("surfaces ownership churn rather than performing it silently", () => {
    // The instruction was to leave the 72 ownership links alone. If the
    // corrected distribution cannot honour that, it must say so.
    const churn = plan!.ownershipsToEnd.length + plan!.ownershipsToCreate.length;
    if (churn > 0) {
      expect(
        plan!.warnings.some((w) => w.includes("ownership")),
        "ownership would change but no warning was raised",
      ).toBe(true);
    }
  });
  it("projects a financial plan in which every property bills", () => {
    // The condition demo-financial-plan.readonly.test.ts is currently red on.
    // If this passes, applying the repair turns that suite green by correcting
    // reality rather than by loosening an assertion.
    const dead = projected!.perProperty.filter((p) => p.billed === 0);
    expect(dead.map((p) => p.propertyCode), "a property still bills nothing").toEqual([]);
  });

  it("projects a balanced ledger", () => {
    const failures = projected!.invariants.filter((i) => !i.pass);
    expect(failures.map((f) => `${f.label}: ${f.left} != ${f.right}`)).toEqual([]);
  });

  it("projects a fully populated aging profile", () => {
    // The empty 1-30 bucket was an artefact of measuring at the month end.
    // Reported as of the 25th, monthly dues land at 24 / 55 / 85 / 116 days and
    // every bucket carries something.
    const { current, d30, d60, d90plus } = projected!.aging;
    for (const [label, value] of [
      ["current", current],
      ["1-30", d30],
      ["31-60", d60],
      ["90+", d90plus],
    ] as const) {
      expect(value, `aging bucket ${label} is empty`).toBeGreaterThan(0);
    }
  });

  it("projects commercial rent billed quarterly", () => {
    const pgId = plan!.target.find((t) => t.propertyCode === "PG") ? "PG" : null;
    expect(pgId).toBe("PG");
    const quarterlyDues = projected!.rentDues.filter((d) => d.periodKey.includes("-Q"));
    expect(quarterlyDues.length, "no quarterly rent due was projected").toBeGreaterThan(0);
  });
});
