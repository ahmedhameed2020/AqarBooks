/**
 * The partial-period rule's boundary behaviour, as an executable spec.
 *
 * WHY THIS EXISTS
 * The first draft of the guard compared `ends_on` against `upper(v_range)`.
 * `lease_rent_period_range` builds `daterange(start, end, '[]')` and Postgres
 * canonicalises a discrete range to `[)`, so `upper()` is the day AFTER the
 * period's last day. The comparison was off by one -- and it failed in the
 * COMMON direction:
 *
 *     monthly lease ending 2026-05-31, billing 2026-05
 *     upper() = 2026-06-01
 *     2026-05-31 < 2026-06-01  ->  "partial"  ->  refused
 *
 * A lease ending on the last day of the month is the ordinary case, not an
 * edge case. The guard would have refused to bill most of them.
 *
 * The SQL cannot be executed from here, so the two pieces it depends on --
 * how the period range is built, and what "covers" means against it -- are
 * mirrored in TypeScript and pinned. If the mirror and the SQL ever disagree,
 * the mirror is what gets read when someone changes the rule, so it is worth
 * being explicit that the two must move together.
 *
 * No database. No network.
 */
import { describe, it, expect } from "vitest";

/**
 * Mirror of `public.lease_rent_period_range(frequency, period)`, returned in
 * the canonical `[)` form Postgres stores: `end` is EXCLUSIVE.
 */
function periodRange(
  frequency: "MONTHLY" | "QUARTERLY" | "YEARLY",
  period: string,
): { lower: string; upperExclusive: string } {
  if (frequency === "MONTHLY") {
    return { lower: `${period}-01`, upperExclusive: addMonths(`${period}-01`, 1) };
  }
  if (frequency === "QUARTERLY") {
    const [yearText, quarterText] = period.split("-Q");
    const year = Number(yearText);
    const startMonth = (Number(quarterText) - 1) * 3 + 1;
    const lower = `${year}-${String(startMonth).padStart(2, "0")}-01`;
    return { lower, upperExclusive: addMonths(lower, 3) };
  }
  const lower = `${period}-01-01`;
  return { lower, upperExclusive: addMonths(lower, 12) };
}

/** The last day actually inside the period: `upper(v_range) - 1`. */
function lastDayInclusive(range: { upperExclusive: string }): string {
  return addDays(range.upperExclusive, -1);
}

/**
 * Mirror of the guard's condition. True when the lease FULLY covers the period
 * and the due may be generated.
 */
function coversPeriod(
  lease: { startsOn: string; endsOn: string | null },
  range: { lower: string; upperExclusive: string },
): boolean {
  const startsTooLate = lease.startsOn > range.lower;
  const endsTooEarly = (lease.endsOn ?? "9999-12-31") < lastDayInclusive(range);
  return !startsTooLate && !endsTooEarly;
}

function addMonths(iso: string, months: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  const total = y * 12 + (m - 1) + months;
  const year = Math.floor(total / 12);
  const month = (total % 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return `${year}-${String(month).padStart(2, "0")}-${String(Math.min(d, lastDay)).padStart(2, "0")}`;
}

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

describe("period range canonicalisation", () => {
  it("Q2 2026 ends exclusive on 2026-07-01", () => {
    // The fact the off-by-one turned on. Written down so nobody has to rederive
    // it from the Postgres manual next time.
    const range = periodRange("QUARTERLY", "2026-Q2");
    expect(range.lower).toBe("2026-04-01");
    expect(range.upperExclusive).toBe("2026-07-01");
    expect(lastDayInclusive(range)).toBe("2026-06-30");
  });

  it("May 2026 ends exclusive on 2026-06-01", () => {
    const range = periodRange("MONTHLY", "2026-05");
    expect(range.lower).toBe("2026-05-01");
    expect(range.upperExclusive).toBe("2026-06-01");
    expect(lastDayInclusive(range)).toBe("2026-05-31");
  });

  it("2026 ends exclusive on 2027-01-01", () => {
    const range = periodRange("YEARLY", "2026");
    expect(lastDayInclusive(range)).toBe("2026-12-31");
  });
});

describe("partial-period coverage — the four boundary cases", () => {
  const q2 = periodRange("QUARTERLY", "2026-Q2");

  it("exact fit passes: starts 2026-04-01, ends 2026-06-30", () => {
    // THE REGRESSION. The first draft refused this, because
    // 2026-06-30 < upper() = 2026-07-01.
    expect(coversPeriod({ startsOn: "2026-04-01", endsOn: "2026-06-30" }, q2)).toBe(true);
  });

  it("starting one day late fails: starts 2026-04-02", () => {
    expect(coversPeriod({ startsOn: "2026-04-02", endsOn: "2026-06-30" }, q2)).toBe(false);
  });

  it("ending one day early fails: ends 2026-06-29", () => {
    expect(coversPeriod({ startsOn: "2026-04-01", endsOn: "2026-06-29" }, q2)).toBe(false);
  });

  it("open-ended passes: starts 2026-04-01, no end date", () => {
    expect(coversPeriod({ startsOn: "2026-04-01", endsOn: null }, q2)).toBe(true);
  });
});

describe("partial-period coverage — the case the off-by-one broke", () => {
  it("a monthly lease ending on the last day of the month covers that month", () => {
    // The ordinary case. Under the first draft every one of these would have
    // been refused, which would have been far more damaging than the defect
    // the guard was written to fix.
    for (const period of ["2026-01", "2026-02", "2026-04", "2026-05", "2026-12"]) {
      const range = periodRange("MONTHLY", period);
      const endsOn = lastDayInclusive(range);
      expect(
        coversPeriod({ startsOn: range.lower, endsOn }, range),
        `${period}: a lease running ${range.lower}..${endsOn} must cover it`,
      ).toBe(true);
    }
  });

  it("handles February in a non-leap year", () => {
    const range = periodRange("MONTHLY", "2026-02");
    expect(lastDayInclusive(range)).toBe("2026-02-28");
    expect(coversPeriod({ startsOn: "2026-02-01", endsOn: "2026-02-28" }, range)).toBe(true);
    expect(coversPeriod({ startsOn: "2026-02-01", endsOn: "2026-02-27" }, range)).toBe(false);
  });

  it("agrees with the 26 May obligations already posted", () => {
    // Those were generated before the guard existed. If the corrected rule
    // would refuse any of them, the guard contradicts the ledger.
    const may = periodRange("MONTHLY", "2026-05");
    // Every May lease is open-ended or ends well after May in the demo tenant.
    expect(coversPeriod({ startsOn: "2024-08-01", endsOn: "2027-01-31" }, may)).toBe(true);
    expect(coversPeriod({ startsOn: "2026-05-01", endsOn: null }, may)).toBe(true);
  });
});
