/**
 * Generates the seed plan for review, and checks it against the story.
 *
 * Unlike `demo-seed.manual.test.ts`, this always runs: it needs no database,
 * no credentials and no provisioned tenant. That is the point -- the plan has
 * to be reviewable before the first database write, and the dry run cannot be,
 * because the dry run's guard requires the demo organization to already exist.
 *
 * The report is written to `test-results/demo-seed-plan.txt`; vitest suppresses
 * console output in this repository, so printing it would put it nowhere.
 */
import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import {
  buildSeedPlan,
  computeStructuralIntegrity,
  renderSeedPlan,
} from "../scripts/demo/demo-plan";
import { generateLeases, generateMembers, generateUnits } from "../scripts/demo/demo-fixtures";
import { DEMO_STORY } from "../lib/demo/story";

describe("demo seed plan", () => {
  it("writes the plan for review", () => {
    const plan = buildSeedPlan();
    mkdirSync("test-results", { recursive: true });
    writeFileSync("test-results/demo-seed-plan.txt", renderSeedPlan(plan), "utf8");

    expect(plan.organization).toBe(DEMO_STORY.organization.nameEn);
    expect(plan.slug).toBe(DEMO_STORY.organization.slug);
  });

  it("plans exactly what the story advertises", () => {
    // The entry page prints these counts to a visitor before they sign in. A
    // plan that disagrees with them means the page is promising a portfolio
    // the seed does not build.
    const plan = buildSeedPlan();
    const find = (stage: string) => plan.objects.find((o) => o.stage === stage)!;

    expect(find("properties").count).toBe(DEMO_STORY.headline.properties);
    expect(find("buildings").count).toBe(DEMO_STORY.headline.buildings);
    expect(find("units").count).toBe(DEMO_STORY.headline.units);
  });

  it("states plainly that no financial stage is implemented", () => {
    // This assertion is the honest half of the report. It fails once the
    // financial stages land, which is the prompt to update the plan rather
    // than let it keep claiming a gap that has closed.
    const plan = buildSeedPlan();
    expect(plan.notImplemented.length).toBeGreaterThan(0);
    expect(plan.notImplemented.join(" ")).toMatch(/issue_dues/);
    expect(plan.notImplemented.join(" ")).toMatch(/record_payment/);
  });
});

/**
 * The structural invariants.
 *
 * These are the questions a visitor's screen asks. "This unit is occupied" is
 * a claim, and every one of these tests exists so that the claim is backed by
 * either an ownership link or a lease -- never by nothing. The offline plan
 * found this gap once already; these are what stop it returning.
 */
describe("demo structural invariants", () => {
  const units = generateUnits();
  const { members, assignment } = generateMembers(units);
  const leases = generateLeases(units, assignment);

  const active = units.filter((u) => !u.archived);
  const occupied = active.filter((u) => u.tenure !== "VACANT");
  const ownerResident = active.filter((u) => u.tenure === "OWNER_RESIDENT");
  const leased = active.filter((u) => u.tenure === "LEASED");

  it("occupancy splits into exactly owner-resident and leased", () => {
    expect(occupied.length).toBe(121);
    expect(ownerResident.length).toBe(72);
    expect(leased.length).toBe(49);
    expect(ownerResident.length + leased.length).toBe(occupied.length);
  });

  it("every leased occupied unit has exactly one active demo lease", () => {
    const byUnit = new Map<string, number>();
    for (const lease of leases) {
      byUnit.set(lease.unitCode, (byUnit.get(lease.unitCode) ?? 0) + 1);
    }
    for (const unit of leased) {
      expect(byUnit.get(unit.code), `unit ${unit.code} has no lease`).toBe(1);
    }
    expect(leases).toHaveLength(leased.length);
  });

  it("every lease points at a real unit and a real member", () => {
    const unitCodes = new Set(units.map((u) => u.code));
    const emails = new Set(members.map((m) => m.email));
    for (const lease of leases) {
      expect(unitCodes.has(lease.unitCode), `lease on unknown unit ${lease.unitCode}`).toBe(true);
      expect(emails.has(lease.memberEmail), `lease for unknown member ${lease.memberEmail}`).toBe(
        true,
      );
    }
  });

  it("no archived unit and no vacant unit carries a lease", () => {
    const archived = new Set(units.filter((u) => u.archived).map((u) => u.code));
    const vacant = new Set(active.filter((u) => u.tenure === "VACANT").map((u) => u.code));
    for (const lease of leases) {
      expect(archived.has(lease.unitCode), `archived unit ${lease.unitCode} leased`).toBe(false);
      expect(vacant.has(lease.unitCode), `vacant unit ${lease.unitCode} leased`).toBe(false);
    }
  });

  it("owner-resident units are explained by ownership, never by a lease", () => {
    // Guards against the tempting shortcut of using a lease to stand in for an
    // ownership link. They are different relationships and the ledger treats
    // their receivables differently.
    const leasedCodes = new Set(leases.map((l) => l.unitCode));
    for (const unit of ownerResident) {
      expect(leasedCodes.has(unit.code), `owner-resident unit ${unit.code} also leased`).toBe(false);
    }
  });

  it("every lease term spans the operating month", () => {
    // A unit shown as occupied in August 2026 whose lease had expired in June
    // is exactly the incoherence this stage exists to remove.
    for (const lease of leases) {
      expect(lease.startsOn <= DEMO_STORY.period.start, `${lease.unitCode} starts too late`).toBe(
        true,
      );
      expect(lease.endsOn >= DEMO_STORY.period.end, `${lease.unitCode} ends too early`).toBe(true);
      expect(lease.endsOn >= lease.startsOn).toBe(true);
      // The table's CHECK constraint refuses a non-positive rent.
      expect(lease.rentAmount).toBeGreaterThan(0);
    }
  });

  it("leases are deterministic across runs", () => {
    const again = generateLeases(generateUnits(), generateMembers(generateUnits()).assignment);
    expect(JSON.stringify(again)).toBe(JSON.stringify(leases));
  });

  it("no member is left attached to nothing", () => {
    const attached = new Set<string>();
    for (const unit of ownerResident) {
      const email = assignment.get(unit.code);
      if (email) attached.add(email);
    }
    for (const lease of leases) attached.add(lease.memberEmail);
    const orphans = members.filter((m) => !attached.has(m.email)).map((m) => m.email);
    expect(orphans).toEqual([]);
  });

  it("the plan reports structural integrity PASS", () => {
    // The gate itself. If any counter is non-zero the report says FAIL and this
    // fails with it -- which is what must happen before anyone provisions.
    const plan = buildSeedPlan();
    expect(plan.integrity.occupiedWithoutOwnerOrLease).toBe(0);
    expect(plan.integrity.leaseWithoutResident).toBe(0);
    expect(plan.integrity.leaseWithoutUnit).toBe(0);
    expect(plan.integrity.archivedUnitWithActiveLease).toBe(0);
    expect(plan.integrity.vacantUnitWithActiveLease).toBe(0);
    expect(plan.integrity.orphanMembers).toBe(0);
    expect(plan.integrity.pass).toBe(true);
    // Matched loosely on purpose: this asserts the verdict the report
    // prints, not the column width it prints it at.
    expect(renderSeedPlan(plan)).toMatch(/Structural integrity\s+PASS/);
    expect(renderSeedPlan(plan)).not.toContain("INTEGRITY FAILURES");
  });
});

/**
 * Proves the gate can fail.
 *
 * A PASS that no input could turn into a FAIL is decoration. Each case below
 * breaks the graph in exactly one way -- the same four ways the report is
 * required to refuse on -- and asserts both the counter and the verdict.
 */
describe("structural integrity gate is falsifiable", () => {
  const units = generateUnits();
  const { members, assignment } = generateMembers(units);
  const leases = generateLeases(units, assignment);

  it("passes on the real fixture graph", () => {
    expect(computeStructuralIntegrity(units, members, assignment, leases).pass).toBe(true);
  });

  it("fails when an occupied unit has neither an owner nor a lease", () => {
    // Drop every lease: the 49 leased units are then occupied and unexplained.
    const broken = computeStructuralIntegrity(units, members, assignment, []);
    expect(broken.occupiedWithoutOwnerOrLease).toBe(49);
    expect(broken.pass).toBe(false);
  });

  it("fails when a lease names a member who does not exist", () => {
    const broken = computeStructuralIntegrity(units, members, assignment, [
      { ...leases[0]!, memberEmail: "ghost@demo.aqarbooks.invalid" },
      ...leases.slice(1),
    ]);
    expect(broken.leaseWithoutResident).toBe(1);
    expect(broken.pass).toBe(false);
  });

  it("fails when a lease names a unit that does not exist", () => {
    const broken = computeStructuralIntegrity(units, members, assignment, [
      { ...leases[0]!, unitCode: "NO-SUCH-UNIT" },
      ...leases.slice(1),
    ]);
    expect(broken.leaseWithoutUnit).toBe(1);
    expect(broken.pass).toBe(false);
  });

  it("fails when an archived unit carries a lease", () => {
    const archived = units.find((u) => u.archived)!;
    const broken = computeStructuralIntegrity(units, members, assignment, [
      { ...leases[0]!, unitCode: archived.code },
      ...leases.slice(1),
    ]);
    expect(broken.archivedUnitWithActiveLease).toBe(1);
    expect(broken.pass).toBe(false);
  });

  it("fails when a vacant unit carries a lease", () => {
    const vacant = units.find((u) => !u.archived && u.tenure === "VACANT")!;
    const broken = computeStructuralIntegrity(units, members, assignment, [
      { ...leases[0]!, unitCode: vacant.code },
      ...leases.slice(1),
    ]);
    expect(broken.vacantUnitWithActiveLease).toBe(1);
    expect(broken.pass).toBe(false);
  });

  it("fails when a member is attached to nothing", () => {
    const broken = computeStructuralIntegrity(
      units,
      [...members, { email: "orphan@demo.aqarbooks.invalid", fullName: "لا أحد", phone: "+201000000000" }],
      assignment,
      leases,
    );
    expect(broken.orphanMembers).toBe(1);
    expect(broken.pass).toBe(false);
  });

  it("renders FAIL and names the failing counters", () => {
    // The report must not merely stop saying PASS -- it has to say which
    // invariant broke, or the person reading it has to go digging.
    const plan = buildSeedPlan();
    const rendered = renderSeedPlan({
      ...plan,
      integrity: computeStructuralIntegrity(units, members, assignment, []),
    });
    expect(rendered).toMatch(/Structural integrity\s+FAIL/);
    expect(rendered).toContain("INTEGRITY FAILURES");
    expect(rendered).toContain("occupied_without_owner_or_lease");
    expect(rendered).toContain("Do not provision or seed");
  });
});
