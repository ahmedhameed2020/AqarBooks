/**
 * Quarter alignment for the demo's commercial leases — a fixture repair, not a
 * billing policy.
 *
 * WHAT THIS IS
 * `generate_lease_rent_dues` now refuses a period the lease does not fully
 * cover (20260825182109_rent_partial_period_guard). That refusal is correct and
 * it is staying: charging a full quarter for a partial one is a proration
 * decision this schema cannot record. See
 * docs/defects/partial-period-rent-billing-proration.md.
 *
 * The consequence is that a demo fixture whose term does not line up with
 * quarter boundaries cannot be billed at all. That is a property of the
 * FIXTURES, and fixtures are ours to choose. So the demo's quarterly leases are
 * moved onto boundaries the core can already represent.
 *
 * WHAT THIS IS EMPHATICALLY NOT
 * It is not a decision that a real customer forfeits the partial period, and it
 * is not proration by another name. Nothing here computes a part-period amount.
 * The product defect stays open, and a real tenant whose lease starts on the
 * 15th still cannot be billed through this path -- which is the honest state,
 * and the reason the defect note is not being closed.
 *
 * THE RULE
 * Take the largest span of whole quarters that lies entirely INSIDE the
 * original term. Never extend a lease past its own boundaries.
 *
 *     new_start = starts_on            if already a quarter start
 *                 next quarter start   otherwise
 *
 *     new_end   = ends_on              if already a quarter end
 *                 previous quarter end otherwise
 *
 * Clipping inward is what makes this safe to run across a fixture set without a
 * per-lease judgement: it can only ever shorten a tenancy, so it cannot invent
 * occupancy, cannot invent revenue, and cannot move a lease into a stretch of
 * time somebody else occupied.
 *
 * This module reads nothing and writes nothing. Same input, same output.
 */

export type AlignmentLease = {
  id: string;
  unitId: string;
  unitCode: string;
  propertyId: string;
  propertyCode: string;
  tenantMemberId: string;
  dueTypeId: string;
  receivableAccountId: string;
  rentAmount: number;
  rentFrequency: string;
  securityDepositAmount: number;
  billingRecipient: string;
  startsOn: string;
  endsOn: string | null;
  status: string;
};

export type AlignmentTarget = {
  lease: AlignmentLease;
  newStartsOn: string;
  newEndsOn: string | null;
  /**
   * The date the superseded row is closed on.
   *
   * `end_unit_lease` refuses a date before `starts_on`, and for a lease whose
   * start was already aligned there is no "day before the replacement begins"
   * to use. So it is the later of the original start and the day before the
   * replacement -- the smallest truthful footprint the RPC will accept.
   */
  endOldOn: string;
  /** Which boundary moved. Reported so the swap can be read, not just counted. */
  reason: "START_AND_END" | "START_ONLY" | "END_ONLY";
};

export type AlignmentPlan = {
  /** Every ACTIVE quarterly lease considered. */
  considered: number;
  /** Already on boundaries; left completely alone. */
  alreadyAligned: AlignmentLease[];
  targets: AlignmentTarget[];
  /**
   * Leases the rule cannot align without inventing something: clipping inward
   * leaves no whole quarter. Never silently dropped -- a non-empty list is a
   * refusal to proceed, not a smaller batch.
   */
  unalignable: Array<{ lease: AlignmentLease; why: string }>;
};

const QUARTER_STARTS = new Set(["01-01", "04-01", "07-01", "10-01"]);
const QUARTER_ENDS = new Set(["03-31", "06-30", "09-30", "12-31"]);

export function isQuarterStart(iso: string): boolean {
  return QUARTER_STARTS.has(iso.slice(5));
}

export function isQuarterEnd(iso: string): boolean {
  return QUARTER_ENDS.has(iso.slice(5));
}

/** The first quarter start on or after `iso`. */
export function nextQuarterStart(iso: string): string {
  if (isQuarterStart(iso)) return iso;
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const quarter = Math.floor((month - 1) / 3) + 1;
  // Strictly forward: a date inside Q2 aligns to Q3's start, never back to
  // Q2's, because moving backwards would start the lease before it began.
  const nextQ = quarter + 1;
  return nextQ > 4
    ? `${year + 1}-01-01`
    : `${year}-${String((nextQ - 1) * 3 + 1).padStart(2, "0")}-01`;
}

/** The last quarter end on or before `iso`. */
export function previousQuarterEnd(iso: string): string {
  if (isQuarterEnd(iso)) return iso;
  const year = Number(iso.slice(0, 4));
  const month = Number(iso.slice(5, 7));
  const quarter = Math.floor((month - 1) / 3) + 1;
  const prevQ = quarter - 1;
  if (prevQ < 1) return `${year - 1}-12-31`;
  const endMonth = prevQ * 3;
  const endDay = endMonth === 6 || endMonth === 9 ? "30" : "31";
  return `${year}-${String(endMonth).padStart(2, "0")}-${endDay}`;
}

export function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number) as [number, number, number];
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/** `2026-Q2` -> its inclusive first and last day. */
export function quarterBounds(quarter: string): { start: string; end: string } {
  const [yearText, quarterText] = quarter.split("-Q");
  const year = Number(yearText);
  const q = Number(quarterText);
  const startMonth = (q - 1) * 3 + 1;
  const endMonth = q * 3;
  return {
    start: `${year}-${String(startMonth).padStart(2, "0")}-01`,
    end: `${year}-${String(endMonth).padStart(2, "0")}-${endMonth === 6 || endMonth === 9 ? "30" : "31"}`,
  };
}

/**
 * Build the alignment plan.
 *
 * Order is the caller's order, preserved, so the applier's step numbering is
 * stable across runs and a resumed run addresses the same lease as run N did.
 */
export function planQuarterAlignment(leases: AlignmentLease[]): AlignmentPlan {
  const plan: AlignmentPlan = {
    considered: 0,
    alreadyAligned: [],
    targets: [],
    unalignable: [],
  };

  for (const lease of leases) {
    if (lease.rentFrequency !== "QUARTERLY" || lease.status !== "ACTIVE") continue;
    plan.considered++;

    const startAligned = isQuarterStart(lease.startsOn);
    const endAligned = lease.endsOn === null || isQuarterEnd(lease.endsOn);

    if (startAligned && endAligned) {
      plan.alreadyAligned.push(lease);
      continue;
    }

    const newStartsOn = startAligned ? lease.startsOn : nextQuarterStart(lease.startsOn);
    const newEndsOn =
      lease.endsOn === null ? null : endAligned ? lease.endsOn : previousQuarterEnd(lease.endsOn);

    if (newEndsOn !== null && newStartsOn > newEndsOn) {
      plan.unalignable.push({
        lease,
        why:
          `clipping inward leaves no whole quarter: ${lease.startsOn}..${lease.endsOn} ` +
          `would become ${newStartsOn}..${newEndsOn}`,
      });
      continue;
    }

    plan.targets.push({
      lease,
      newStartsOn,
      newEndsOn,
      endOldOn: newStartsOn > lease.startsOn ? addDays(newStartsOn, -1) : lease.startsOn,
      reason:
        !startAligned && !endAligned
          ? "START_AND_END"
          : startAligned
            ? "END_ONLY"
            : "START_ONLY",
    });
  }

  return plan;
}

/**
 * Whether a term fully covers a quarter, under the rule the database now
 * enforces.
 *
 * COVERAGE, NOT OVERLAP. This deliberately mirrors the guard rather than the
 * old skip condition: a lease that merely touches the period raises
 * PARTIAL_PERIOD_REQUIRES_POLICY, so counting it as billable would make the
 * plan describe an apply that errors.
 */
export function coversQuarter(
  term: { startsOn: string; endsOn: string | null },
  quarter: string,
): boolean {
  const { start, end } = quarterBounds(quarter);
  return term.startsOn <= start && (term.endsOn ?? "9999-12-31") >= end;
}

/** What the aligned set would bill for one quarter. Derived, never targeted. */
export function quarterBillingForecast(
  plan: AlignmentPlan,
  quarter: string,
): { leases: number; amount: number } {
  const terms = [
    ...plan.alreadyAligned.map((l) => ({
      amount: l.rentAmount,
      startsOn: l.startsOn,
      endsOn: l.endsOn,
    })),
    ...plan.targets.map((t) => ({
      amount: t.lease.rentAmount,
      startsOn: t.newStartsOn,
      endsOn: t.newEndsOn,
    })),
  ];
  const billable = terms.filter((t) => coversQuarter(t, quarter));
  return {
    leases: billable.length,
    amount: billable.reduce((sum, t) => sum + t.amount, 0),
  };
}

/**
 * Stable lease keys within a set, and whether any collide.
 *
 * `unit_leases_no_overlapping_active` constrains ACTIVE rows only, so a
 * superseded ENDED row may legitimately sit underneath its replacement -- and
 * for a lease whose start was already aligned, the two carry the same
 * `property:unit:startsOn:frequency` key. That historical duplication is
 * expected and harmless. What must never happen is a collision inside the
 * ACTIVE set, because the financial planner keys payer behaviour off it and two
 * live leases sharing a key would share a payer profile.
 */
export function duplicateActiveKeys(
  terms: Array<{ propertyCode: string; unitCode: string; startsOn: string; rentFrequency: string }>,
): string[] {
  const seen = new Map<string, number>();
  for (const t of terms) {
    const key = `lease:${t.propertyCode}:${t.unitCode}:${t.startsOn}:${t.rentFrequency}`;
    seen.set(key, (seen.get(key) ?? 0) + 1);
  }
  return [...seen.entries()].filter(([, n]) => n > 1).map(([k]) => k);
}
