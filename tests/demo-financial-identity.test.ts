/**
 * The financial narrative must not depend on any database-generated id.
 *
 * WHY THIS TEST EXISTS
 * The payer profiles were keyed on `unit_leases.id`. That looked deterministic
 * and was not: the id is minted by Postgres at insert time. The structural
 * repair proved it -- Marina moved from zero arrears to 69,430 purely because
 * the surviving leases had different UUIDs. Same fixtures, same seed, different
 * financial story.
 *
 * A demo whose aging depends on which ids Postgres happened to generate cannot
 * be rebuilt. Reseed it and the dashboard changes; restore it into fresh ids
 * and it disagrees with what the customer was shown.
 *
 * THE METHOD
 * Take the real planner input, replace EVERY uuid -- organization, property,
 * unit, lease, member -- with a different one, leave every business fact alone
 * (codes, areas, rent, dates, frequencies, emails), and rebuild. The two plans
 * must be identical in everything an accountant would look at.
 *
 * This runs entirely in memory. It opens no connection and writes nothing.
 */
import { describe, it, expect } from "vitest";
import {
  buildFinancialPlan,
  type FinancialPlan,
} from "../scripts/demo/financial-plan-report";
import {
  assignPayerProfile,
  bankReferenceFor,
  financialIdempotencyKey,
  leaseBusinessKey,
  paymentBusinessKey,
  type FinancialPlanInput,
} from "../scripts/demo/financial-plan";
import { generateLeases, generateMembers, generateUnits } from "../scripts/demo/demo-fixtures";

/**
 * A planner input built from the fixtures with synthetic ids, so the test needs
 * no database. The ids are deliberately meaningless -- that is the point.
 */
function makeInput(idSalt: string): FinancialPlanInput {
  const units = generateUnits();
  const { assignment } = generateMembers(units);
  const leases = generateLeases(units, assignment);

  // Distinct, stable-per-salt, and unrelated to any business fact.
  const id = (kind: string, natural: string) => `${idSalt}-${kind}-${hash(idSalt + natural)}`;

  const propertyCodes = [...new Set(units.map((u) => u.propertyCode))];

  return {
    properties: propertyCodes.map((code) => ({
      id: id("prop", code),
      code,
      name: code,
    })),
    units: units.map((u) => ({
      id: id("unit", u.code),
      code: u.code,
      area: u.area,
      unitType: u.unitType,
      propertyId: id("prop", u.propertyCode),
      isActive: !u.archived,
    })),
    leases: leases.map((l) => ({
      id: id("lease", l.unitCode),
      unitId: id("unit", l.unitCode),
      tenantMemberId: id("member", l.memberEmail),
      rentAmount: l.rentAmount,
      rentFrequency: l.rentFrequency,
      startsOn: l.startsOn,
      endsOn: l.endsOn,
      status: "ACTIVE",
    })),
    ownerUnitIds: units
      .filter((u) => !u.archived && u.tenure === "OWNER_RESIDENT")
      .map((u) => id("unit", u.code)),
    currencyDecimals: 2,
  };
}

function hash(value: string): string {
  let h = 0x811c9dc5;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(16);
}

/**
 * Everything an accountant would compare, with database ids stripped out.
 * Ids are expected to differ -- that is what is being varied.
 */
function economicShape(plan: FinancialPlan) {
  return {
    duesByMonth: plan.duesByMonth,
    aging: plan.aging,
    gl: plan.gl,
    perProperty: plan.perProperty,
    bank: plan.bank,
    invariants: plan.invariants,
    profiles: plan.collections.profiles,
    rentDues: plan.rentDues
      .map((d) => `${d.leaseKey}|${d.periodKey}|${d.amount}|${d.issueDate}|${d.dueDate}`)
      .sort(),
    camDues: plan.camDues.map((d) => `${d.leaseKey}|${d.amount}`).sort(),
    payments: plan.collections.payments
      .map((p) => `${p.paymentKey}|${p.amount}|${p.paymentDate}|${p.method}`)
      .sort(),
    outstanding: plan.collections.outstandingByDue
      .map((o) => `${o.due.leaseKey}|${o.due.periodKey}|${o.outstanding}`)
      .sort(),
  };
}

describe("financial identity is independent of database ids", () => {
  const a = buildFinancialPlan(makeInput("alpha"));
  const b = buildFinancialPlan(makeInput("omega"));

  it("assigns the same payer profile mix", () => {
    // The specific failure that motivated this: profiles moved when ids moved.
    expect(b.collections.profiles).toEqual(a.collections.profiles);
  });

  it("produces an identical economic shape under randomised ids", () => {
    // The whole story: dues, payments, aging, per-property totals, invariants,
    // bank references. Byte-for-byte once ids are removed.
    expect(JSON.stringify(economicShape(b))).toBe(JSON.stringify(economicShape(a)));
  });

  it("really did change every id", () => {
    // Guards against the test passing because nothing was varied.
    const idsA = new Set(makeInput("alpha").leases.map((l) => l.id));
    const idsB = new Set(makeInput("omega").leases.map((l) => l.id));
    const overlap = [...idsA].filter((id) => idsB.has(id));
    expect(overlap, "the two inputs share lease ids, so nothing was proven").toEqual([]);
  });

  it("keeps no database id inside any derived key", () => {
    const inputA = makeInput("alpha");
    const allIds = new Set<string>([
      ...inputA.properties.map((p) => p.id),
      ...inputA.units.map((u) => u.id),
      ...inputA.leases.map((l) => l.id),
      ...inputA.leases.map((l) => l.tenantMemberId),
    ]);

    const keys = [
      ...a.rentDues.map((d) => d.leaseKey),
      ...a.camDues.map((d) => d.leaseKey),
      ...a.collections.payments.map((p) => p.paymentKey),
    ];

    for (const key of keys) {
      for (const id of allIds) {
        expect(key.includes(id), `key "${key}" embeds database id ${id}`).toBe(false);
      }
    }
  });

  it("derives the same payer profile from the same business key", () => {
    const key = leaseBusinessKey({
      propertyCode: "PG",
      unitCode: "PG-T-0101",
      startsOn: "2025-11-01",
      rentFrequency: "QUARTERLY",
    });
    expect(key).toBe("lease:PG:PG-T-0101:2025-11-01:QUARTERLY");
    expect(assignPayerProfile(key)).toBe(assignPayerProfile(key));
  });

  it("builds payment, bank and idempotency keys from the lease key", () => {
    const leaseKey = leaseBusinessKey({
      propertyCode: "PG",
      unitCode: "PG-T-0101",
      startsOn: "2025-11-01",
      rentFrequency: "QUARTERLY",
    });
    const paymentKey = paymentBusinessKey(leaseKey, "2026-Q3", 1);
    expect(paymentKey).toBe(`payment:${leaseKey}:2026-Q3:01`);

    // Stable, and different payments never collide.
    expect(bankReferenceFor(paymentKey)).toBe(bankReferenceFor(paymentKey));
    expect(bankReferenceFor(paymentKey)).not.toBe(
      bankReferenceFor(paymentBusinessKey(leaseKey, "2026-Q3", 2)),
    );

    expect(financialIdempotencyKey(paymentKey)).toBe(`demo:${paymentKey}`);
  });

  it("gives every planned payment a distinct key", () => {
    // A collision would make two receipts share an idempotency key, and the
    // second would silently not post.
    const keys = a.collections.payments.map((p) => p.paymentKey);
    expect(new Set(keys).size, "duplicate payment keys").toBe(keys.length);
  });

  it("is unaffected by which member is on which unit", () => {
    // The 21 member-name drift warnings raise an obvious question: does the
    // narrative move if the tenants are renamed? Measured rather than argued.
    //
    // It does not, and the reason is structural: the payer profile is keyed on
    // the LEASE business key -- property, unit, start date, frequency -- and no
    // member identity feeds any hash. Rent comes from the lease row. So member
    // naming is cosmetic with respect to every financial figure, which bounds
    // how urgent the drift actually is.
    const renamed: FinancialPlanInput = {
      ...makeInput("alpha"),
      leases: makeInput("alpha").leases.map((l, index) => ({
        ...l,
        tenantMemberId: `totally-different-member-${index}`,
      })),
    };

    const withRenamedTenants = buildFinancialPlan(renamed);
    expect(JSON.stringify(economicShape(withRenamedTenants))).toBe(
      JSON.stringify(economicShape(a)),
    );
  });

  it("gives every bank reference a distinct value", () => {
    const refs = a.bank.references;
    expect(new Set(refs).size, "bank reference collision").toBe(refs.length);
  });
});
