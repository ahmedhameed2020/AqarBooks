import { describe, expect, it } from "vitest";
import { computePosition } from "@/lib/portal/statement-position";

// due 600 issued 09-01, due 09-15; advance 1000 received 09-05; 400 applied 09-08 and reversed 09-10; 300 applied 09-12
const dues = [{ id: "d1", amount: 600, issueDate: "2026-09-01", dueDate: "2026-09-15" }];
const allocations = [
  { dueId: "d1", amount: 400, appliedOn: "2026-09-08", reversedOn: "2026-09-10" },
  { dueId: "d1", amount: 300, appliedOn: "2026-09-12", reversedOn: null },
];
/** the advance as the as-of credit function reports it on a date: remaining = advance minus the applications in force then */
const advanceAsOf = (d: string) =>
  d < "2026-09-05" ? [] : [{ amount: 1000, remaining: 1000 - allocations.filter((a) => a.appliedOn <= d && (!a.reversedOn || a.reversedOn > d)).reduce((s, a) => s + a.amount, 0) }];
const at = (asOf: string) => computePosition({ asOf, dues, allocations, advances: advanceAsOf(asOf) });

describe("owner position as of a date", () => {
  it("before the receipt: the due is owed and there is no credit", () => {
    expect(at("2026-09-03")).toMatchObject({ outstanding: 600, arrears: 0, net: 600, credit: { received: 0, remaining: 0 } });
  });
  it("after the receipt: credit 1000, net -400", () => {
    expect(at("2026-09-06")).toMatchObject({ outstanding: 600, net: -400, credit: { received: 1000, applied: 0, remaining: 1000 } });
  });
  it("applying 400 lowers the due and the credit together: the net does not move", () => {
    expect(at("2026-09-09")).toMatchObject({ outstanding: 200, net: -400, credit: { applied: 400, remaining: 600 } });
  });
  it("reversing it restores both, again with the same net (nothing deducted twice)", () => {
    expect(at("2026-09-11")).toMatchObject({ outstanding: 600, net: -400, credit: { applied: 0, remaining: 1000 } });
  });
  it("a later application, and arrears once the due date has passed", () => {
    expect(at("2026-09-20")).toMatchObject({ outstanding: 300, arrears: 300, net: -400, credit: { applied: 300, remaining: 700 } });
  });
  it("the net is the same on every date from the receipt on", () => {
    const nets = ["2026-09-05", "2026-09-08", "2026-09-10", "2026-09-12", "2026-10-30"].map((d) => at(d).net);
    expect(new Set(nets)).toEqual(new Set([-400]));
  });
  it("dues issued after the date are not counted", () => {
    expect(computePosition({ asOf: "2026-08-31", dues, allocations: [], advances: [] }).outstanding).toBe(0);
  });
});

describe("a due settled by someone else's receipt (new owner after a transfer)", () => {
  const unit = [
    { id: "d1", amount: 2000, issueDate: "2026-08-01", dueDate: "2026-08-01", settled: 2000 },
    { id: "d2", amount: 800, issueDate: "2026-09-01", dueDate: "2026-09-01", settled: 0 },
  ];
  it("uses the settled amount, whoever paid: D1 is not a debt, arrears are 800 not 2,800", () => {
    expect(computePosition({ asOf: "2026-12-31", dues: unit, allocations: [], advances: [] })).toMatchObject({ outstanding: 800, arrears: 800, net: 800 });
  });
  it("without the settled amount (what owner RLS alone allowed) the same data would have said 2,800", () => {
    const blind = unit.map(({ settled, ...d }) => ({ ...d, _: settled }));
    expect(computePosition({ asOf: "2026-12-31", dues: blind.map(({ _, ...d }) => d), allocations: [], advances: [] }).outstanding).toBe(2800);
  });
});

describe("a legacy receipt with an unallocated remainder (not an advance)", () => {
  // D1 2,000; receipt 1,000 on 10 Mar: 600 allocated, 400 unallocated, advance part 0; voided on 20 Apr
  const dues = [{ id: "d1", amount: 2000, issueDate: "2026-02-01", dueDate: "2026-02-15", settled: 600 }];
  const receipts = [{ id: "r1", amount: 1000, advance: 0, paymentDate: "2026-03-10", reversedOn: "2026-04-20" }];
  const receiptAllocations = [{ paymentId: "r1", amount: 600, appliedOn: "2026-03-10", kind: "RECEIPT" }];
  const at = (asOf: string, settled = 600) => computePosition({ asOf, dues: [{ ...dues[0], settled }], allocations: [], advances: [], receipts, receiptAllocations });

  it("keeps its old meaning: the 400 counts against the account (net 1,000 = ledger 2,000 - 1,000) and is not credit", () => {
    expect(at("2026-03-31")).toMatchObject({ outstanding: 1400, legacyUnallocated: 400, net: 1000, credit: { received: 0, remaining: 0 } });
  });
  it("without the receipts input the net would be 1,400 -- the divergence this term removes", () => {
    expect(computePosition({ asOf: "2026-03-31", dues, allocations: [], advances: [] }).net).toBe(1400);
  });
  it("is dated: nothing before the receipt, nothing from the day the receipt is voided", () => {
    expect(at("2026-03-09", 0)).toMatchObject({ legacyUnallocated: 0, net: 2000 });
    expect(at("2026-04-19")).toMatchObject({ legacyUnallocated: 400, net: 1000 });
    expect(at("2026-04-20", 0)).toMatchObject({ legacyUnallocated: 0, net: 2000 });
  });
  it("a normal receipt, or an advance receipt, leaves no legacy remainder", () => {
    const p = computePosition({
      asOf: "2026-09-30", dues: [], allocations: [], advances: [{ amount: 1000, remaining: 1000 }],
      receipts: [{ id: "a", amount: 3000, advance: 1000, paymentDate: "2026-08-10" }, { id: "b", amount: 600, advance: 0, paymentDate: "2026-08-11" }],
      receiptAllocations: [{ paymentId: "a", amount: 2000, appliedOn: "2026-08-10", kind: "RECEIPT" }, { paymentId: "b", amount: 600, appliedOn: "2026-08-11", kind: "RECEIPT" }],
    });
    expect(p.legacyUnallocated).toBe(0);
  });
  it("a credit application is not a receipt allocation: it never reduces the legacy remainder", () => {
    const p = computePosition({
      asOf: "2026-09-30", dues: [], allocations: [], advances: [],
      receipts: [{ id: "r", amount: 1000, advance: 0, paymentDate: "2026-03-10" }],
      receiptAllocations: [{ paymentId: "r", amount: 600, appliedOn: "2026-03-10", kind: "RECEIPT" }, { paymentId: "r", amount: 400, appliedOn: "2026-05-01", kind: "CREDIT_APPLICATION" }],
    });
    expect(p.legacyUnallocated).toBe(400);
  });
});
