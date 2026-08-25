/**
 * The quarter-alignment rule, as an executable spec.
 *
 * The rule decides which lease rows get replaced in production, so it is worth
 * pinning the properties that make it safe rather than only the arithmetic:
 *
 *   - it never extends a term (the replacement is always inside the original)
 *   - it never moves a start backwards or an end forwards
 *   - a term with no whole quarter inside it is refused, not silently dropped
 *   - the Q2 forecast is derived from the clipped terms, never asserted
 *
 * No database. No network.
 */
import { describe, it, expect } from "vitest";
import {
  planQuarterAlignment,
  nextQuarterStart,
  previousQuarterEnd,
  coversQuarter,
  quarterBounds,
  quarterBillingForecast,
  duplicateActiveKeys,
  type AlignmentLease,
} from "../scripts/demo/quarter-alignment";

function lease(over: Partial<AlignmentLease> & { id: string }): AlignmentLease {
  return {
    unitId: `unit-${over.id}`,
    unitCode: `U-${over.id}`,
    propertyId: "prop",
    propertyCode: "NH",
    tenantMemberId: `member-${over.id}`,
    dueTypeId: "due-type",
    receivableAccountId: "ar",
    rentAmount: 30_000,
    rentFrequency: "QUARTERLY",
    securityDepositAmount: 0,
    billingRecipient: "TENANT",
    startsOn: "2026-01-01",
    endsOn: "2026-12-31",
    status: "ACTIVE",
    ...over,
  };
}

describe("quarter boundaries", () => {
  it("nextQuarterStart moves strictly forward, never back into the current quarter", () => {
    expect(nextQuarterStart("2026-04-01")).toBe("2026-04-01"); // already aligned
    expect(nextQuarterStart("2026-04-02")).toBe("2026-07-01");
    expect(nextQuarterStart("2026-06-30")).toBe("2026-07-01");
    expect(nextQuarterStart("2026-11-15")).toBe("2027-01-01"); // year rollover
  });

  it("previousQuarterEnd moves strictly backward", () => {
    expect(previousQuarterEnd("2026-06-30")).toBe("2026-06-30"); // already aligned
    expect(previousQuarterEnd("2026-10-31")).toBe("2026-09-30");
    expect(previousQuarterEnd("2027-01-31")).toBe("2026-12-31"); // year rollover
    expect(previousQuarterEnd("2027-05-31")).toBe("2027-03-31");
  });

  it("quarterBounds knows which quarters have 30-day ends", () => {
    expect(quarterBounds("2026-Q1")).toEqual({ start: "2026-01-01", end: "2026-03-31" });
    expect(quarterBounds("2026-Q2")).toEqual({ start: "2026-04-01", end: "2026-06-30" });
    expect(quarterBounds("2026-Q3")).toEqual({ start: "2026-07-01", end: "2026-09-30" });
    expect(quarterBounds("2026-Q4")).toEqual({ start: "2026-10-01", end: "2026-12-31" });
  });
});

describe("the alignment rule never extends a term", () => {
  it("clips both ends inward", () => {
    const plan = planQuarterAlignment([
      lease({ id: "a", startsOn: "2026-06-01", endsOn: "2027-05-31" }),
    ]);
    const [target] = plan.targets;
    expect(target.newStartsOn).toBe("2026-07-01");
    expect(target.newEndsOn).toBe("2027-03-31");
    expect(target.reason).toBe("START_AND_END");
    // The property that matters: strictly inside the original.
    expect(target.newStartsOn >= "2026-06-01").toBe(true);
    expect(target.newEndsOn! <= "2027-05-31").toBe(true);
  });

  it("leaves an aligned start alone and clips only the end", () => {
    const plan = planQuarterAlignment([
      lease({ id: "b", startsOn: "2025-04-01", endsOn: "2027-01-31" }),
    ]);
    const [target] = plan.targets;
    expect(target.newStartsOn).toBe("2025-04-01");
    expect(target.newEndsOn).toBe("2026-12-31");
    expect(target.reason).toBe("END_ONLY");
  });

  it("leaves a fully aligned lease completely untouched", () => {
    const plan = planQuarterAlignment([
      lease({ id: "c", startsOn: "2025-07-01", endsOn: "2027-06-30" }),
    ]);
    expect(plan.targets).toHaveLength(0);
    expect(plan.alreadyAligned).toHaveLength(1);
  });

  it("treats an open-ended lease as having an aligned end", () => {
    const plan = planQuarterAlignment([
      lease({ id: "d", startsOn: "2026-02-14", endsOn: null }),
    ]);
    const [target] = plan.targets;
    expect(target.newStartsOn).toBe("2026-04-01");
    expect(target.newEndsOn).toBeNull();
    expect(target.reason).toBe("START_ONLY");
  });

  it("refuses a term with no whole quarter inside it", () => {
    // 2026-05-01..2026-08-15 clips to 2026-07-01..2026-06-30, which is empty.
    const plan = planQuarterAlignment([
      lease({ id: "e", startsOn: "2026-05-01", endsOn: "2026-08-15" }),
    ]);
    expect(plan.targets).toHaveLength(0);
    expect(plan.unalignable).toHaveLength(1);
    expect(plan.unalignable[0].why).toMatch(/no whole quarter/);
  });

  it("ignores leases that are not ACTIVE quarterly", () => {
    const plan = planQuarterAlignment([
      lease({ id: "f", rentFrequency: "MONTHLY", startsOn: "2026-05-14" }),
      lease({ id: "g", status: "ENDED", startsOn: "2026-05-14" }),
    ]);
    expect(plan.considered).toBe(0);
    expect(plan.targets).toHaveLength(0);
  });
});

describe("the date the superseded row is closed on", () => {
  it("is the day before the replacement when the start moved", () => {
    const plan = planQuarterAlignment([
      lease({ id: "h", startsOn: "2026-06-01", endsOn: "2027-05-31" }),
    ]);
    expect(plan.targets[0].endOldOn).toBe("2026-06-30");
  });

  it("is the original start when the start did not move", () => {
    // end_unit_lease refuses p_ends_on < starts_on, so "the day before the
    // replacement" is not available here and would raise INVALID_END_DATE.
    const plan = planQuarterAlignment([
      lease({ id: "i", startsOn: "2025-04-01", endsOn: "2027-01-31" }),
    ]);
    expect(plan.targets[0].endOldOn).toBe("2025-04-01");
  });

  it("never precedes the original start, for any target", () => {
    const plan = planQuarterAlignment([
      lease({ id: "j", startsOn: "2026-06-01", endsOn: "2027-05-31" }),
      lease({ id: "k", startsOn: "2025-04-01", endsOn: "2027-01-31" }),
      lease({ id: "l", startsOn: "2024-08-15", endsOn: "2026-10-31" }),
    ]);
    for (const t of plan.targets) {
      expect(t.endOldOn >= t.lease.startsOn, `${t.lease.unitCode} would be refused`).toBe(true);
    }
  });
});

describe("coverage mirrors the database guard, not overlap", () => {
  it("a lease starting mid-quarter does not cover that quarter", () => {
    expect(coversQuarter({ startsOn: "2026-06-01", endsOn: "2027-05-31" }, "2026-Q2")).toBe(false);
  });

  it("an exact fit covers", () => {
    expect(coversQuarter({ startsOn: "2026-04-01", endsOn: "2026-06-30" }, "2026-Q2")).toBe(true);
  });

  it("one day short at either end does not cover", () => {
    expect(coversQuarter({ startsOn: "2026-04-02", endsOn: "2026-06-30" }, "2026-Q2")).toBe(false);
    expect(coversQuarter({ startsOn: "2026-04-01", endsOn: "2026-06-29" }, "2026-Q2")).toBe(false);
  });
});

describe("the Q2 forecast is derived from the clipped terms", () => {
  it("counts a lease only after alignment makes it billable", () => {
    const before = [lease({ id: "m", startsOn: "2026-06-01", endsOn: "2027-05-31", rentAmount: 34_950 })];
    expect(coversQuarter({ startsOn: "2026-06-01", endsOn: "2027-05-31" }, "2026-Q2")).toBe(false);

    const plan = planQuarterAlignment(before);
    // Clipped to 2026-07-01..2027-03-31, so it still does not cover Q2 -- and
    // that is the honest outcome. Alignment does not conjure Q2 revenue.
    expect(quarterBillingForecast(plan, "2026-Q2")).toEqual({ leases: 0, amount: 0 });
    expect(quarterBillingForecast(plan, "2026-Q3")).toEqual({ leases: 1, amount: 34_950 });
  });

  it("sums only fully covering terms", () => {
    const plan = planQuarterAlignment([
      lease({ id: "n", startsOn: "2025-01-01", endsOn: "2027-01-31", rentAmount: 10_000 }),
      lease({ id: "o", startsOn: "2026-04-01", endsOn: "2026-06-30", rentAmount: 20_000 }),
      lease({ id: "p", startsOn: "2026-08-01", endsOn: "2027-12-31", rentAmount: 40_000 }),
    ]);
    expect(quarterBillingForecast(plan, "2026-Q2")).toEqual({ leases: 2, amount: 30_000 });
  });
});

describe("stable keys inside the ACTIVE set", () => {
  it("flags a collision", () => {
    expect(
      duplicateActiveKeys([
        { propertyCode: "NH", unitCode: "A-1", startsOn: "2026-01-01", rentFrequency: "QUARTERLY" },
        { propertyCode: "NH", unitCode: "A-1", startsOn: "2026-01-01", rentFrequency: "QUARTERLY" },
      ]),
    ).toEqual(["lease:NH:A-1:2026-01-01:QUARTERLY"]);
  });

  it("does not flag the same unit at different start dates", () => {
    expect(
      duplicateActiveKeys([
        { propertyCode: "NH", unitCode: "A-1", startsOn: "2026-01-01", rentFrequency: "QUARTERLY" },
        { propertyCode: "NH", unitCode: "A-1", startsOn: "2027-01-01", rentFrequency: "QUARTERLY" },
      ]),
    ).toEqual([]);
  });
});
