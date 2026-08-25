/**
 * Quarterly rent semantics — analysis only. Writes nothing, calls no RPC.
 *
 * THE QUESTION
 * `generate_lease_rent_dues` bills a quarterly lease like this:
 *
 *     range   = lease_rent_period_range('QUARTERLY', '2026-Q2')
 *             = 2026-04-01 .. 2026-06-30
 *     if the lease overlaps that range AT ALL
 *       amount    = lease.rent_amount        -- the full quarter
 *       issue_date = 2026-04-01              -- overridable
 *       due_date   = 2026-04-01              -- NOT overridable
 *
 * "Overlaps at all" is the whole issue. A lease commencing 2026-06-01 overlaps
 * Q2 by thirty days and would be charged a full quarter, dated to a day two
 * months before the tenancy existed.
 *
 * That is not only an April-is-CLOSED problem. It is a billing-semantics
 * question the product has never had to answer, because the demo is the first
 * quarterly tenancy anyone has run through it.
 *
 * WHAT THIS FILE DOES NOT DO
 * It does not choose. It shows what the RPC would bill today and what each of
 * three defensible conventions would bill instead, per lease, so the decision
 * is made on figures rather than on intuition.
 */

export type QuarterlyLease = {
  unitCode: string;
  leaseId: string;
  rentAmount: number;
  startsOn: string;
  endsOn: string | null;
};

export type Convention = "CURRENT_RPC" | "FULL_CALENDAR_QUARTER" | "FIRST_FULL_QUARTER" | "PRORATED";

export type LeaseOutcome = {
  unitCode: string;
  startsOn: string;
  rentAmount: number;
  /** Days of the quarter the tenancy actually covers. */
  daysOccupied: number;
  daysInQuarter: number;
  startsOnQuarterBoundary: boolean;
  amounts: Record<Convention, number>;
};

export type Q2Analysis = {
  quarterStart: string;
  quarterEnd: string;
  leases: LeaseOutcome[];
  totals: Record<Convention, number>;
  /** Leases whose commencement is not a quarter boundary. */
  midQuarterStarters: string[];
  /** Leases that do not cover the whole quarter. */
  partialCoverage: string[];
};

const QUARTER_STARTS = new Set(["01", "04", "07", "10"]);

export function analyseQuarter(
  leases: QuarterlyLease[],
  quarterStart: string,
  quarterEnd: string,
): Q2Analysis {
  const daysInQuarter = dayCount(quarterStart, quarterEnd);

  const overlapping = leases.filter(
    (l) => l.startsOn <= quarterEnd && (l.endsOn ?? "9999-12-31") >= quarterStart,
  );

  const outcomes: LeaseOutcome[] = overlapping.map((lease) => {
    const from = lease.startsOn > quarterStart ? lease.startsOn : quarterStart;
    const to = (lease.endsOn ?? "9999-12-31") < quarterEnd ? lease.endsOn! : quarterEnd;
    const daysOccupied = Math.max(0, dayCount(from, to));

    const onBoundary =
      QUARTER_STARTS.has(lease.startsOn.slice(5, 7)) && lease.startsOn.slice(8, 10) === "01";

    // A. What the RPC does today, and what "full calendar quarter" means: any
    //    overlap bills the whole quarter.
    const full = lease.rentAmount;

    // B. First full quarter. A tenancy that began mid-quarter is not billed for
    //    that quarter at all; billing starts with the first quarter it covers
    //    entirely. Simple, defensible, and it never charges for time before the
    //    lease existed -- at the cost of a free partial quarter.
    const firstFull = daysOccupied === daysInQuarter ? lease.rentAmount : 0;

    // C. Prorated. Charge for the days actually occupied. The most accurate and
    //    the most work: it needs a rounding rule, and the product has no
    //    proration concept today, so choosing this means BUILDING one rather
    //    than configuring one.
    const prorated = round2((lease.rentAmount * daysOccupied) / daysInQuarter);

    return {
      unitCode: lease.unitCode,
      startsOn: lease.startsOn,
      rentAmount: lease.rentAmount,
      daysOccupied,
      daysInQuarter,
      startsOnQuarterBoundary: onBoundary,
      amounts: {
        CURRENT_RPC: full,
        FULL_CALENDAR_QUARTER: full,
        FIRST_FULL_QUARTER: firstFull,
        PRORATED: prorated,
      },
    };
  });

  const sum = (c: Convention) => round2(outcomes.reduce((s, o) => s + o.amounts[c], 0));

  return {
    quarterStart,
    quarterEnd,
    leases: outcomes,
    totals: {
      CURRENT_RPC: sum("CURRENT_RPC"),
      FULL_CALENDAR_QUARTER: sum("FULL_CALENDAR_QUARTER"),
      FIRST_FULL_QUARTER: sum("FIRST_FULL_QUARTER"),
      PRORATED: sum("PRORATED"),
    },
    midQuarterStarters: outcomes.filter((o) => !o.startsOnQuarterBoundary).map((o) => o.unitCode),
    partialCoverage: outcomes.filter((o) => o.daysOccupied < o.daysInQuarter).map((o) => o.unitCode),
  };
}

function dayCount(from: string, to: string): number {
  const a = Date.parse(`${from}T00:00:00Z`);
  const b = Date.parse(`${to}T00:00:00Z`);
  return Math.round((b - a) / 86_400_000) + 1;
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

export function renderQ2Analysis(analysis: Q2Analysis): string {
  const L: string[] = [];
  const money = (v: number) =>
    v.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  L.push("QUARTERLY RENT SEMANTICS — 2026-Q2");
  L.push("=".repeat(78));
  L.push("");
  L.push("Analysis only. Nothing was written and no RPC was called.");
  L.push("");
  L.push(`Quarter: ${analysis.quarterStart} .. ${analysis.quarterEnd}  (${analysis.leases[0]?.daysInQuarter ?? 0} days)`);
  L.push(`Leases overlapping the quarter: ${analysis.leases.length}`);
  L.push("");

  L.push("-".repeat(78));
  L.push("THE PROBLEM IS NOT ONE LEASE");
  L.push("-".repeat(78));
  L.push("");
  L.push(`  commencing mid-quarter          ${analysis.midQuarterStarters.length} of ${analysis.leases.length}`);
  L.push(`  not covering the whole quarter  ${analysis.partialCoverage.length} of ${analysis.leases.length}`);
  L.push("");
  L.push("  A quarterly lease that begins mid-quarter is billed, today, for the");
  L.push("  entire quarter -- including the part before the tenancy existed. The");
  L.push("  2026-06-01 commencement is the clearest case, not the only one.");
  L.push("");

  L.push("-".repeat(78));
  L.push("PER LEASE");
  L.push("-".repeat(78));
  L.push(
    `  ${"unit".padEnd(12)}${"starts".padEnd(12)}${"days".padStart(6)}${"rent".padStart(12)}${"A/current".padStart(13)}${"B/first-full".padStart(14)}${"C/prorated".padStart(13)}`,
  );
  for (const o of [...analysis.leases].sort((a, b) => a.startsOn.localeCompare(b.startsOn))) {
    const flag = o.daysOccupied < o.daysInQuarter ? " <" : "";
    L.push(
      `  ${o.unitCode.padEnd(12)}${o.startsOn.padEnd(12)}${String(o.daysOccupied).padStart(6)}${money(o.rentAmount).padStart(12)}${money(o.amounts.CURRENT_RPC).padStart(13)}${money(o.amounts.FIRST_FULL_QUARTER).padStart(14)}${money(o.amounts.PRORATED).padStart(13)}${flag}`,
    );
  }

  L.push("");
  L.push("-".repeat(78));
  L.push("TOTALS FOR 2026-Q2");
  L.push("-".repeat(78));
  L.push("");
  L.push(`  A  full calendar quarter (what the RPC does today)   ${money(analysis.totals.CURRENT_RPC).padStart(14)}`);
  L.push(`  B  first full quarter only                           ${money(analysis.totals.FIRST_FULL_QUARTER).padStart(14)}`);
  L.push(`  C  prorated by days occupied                         ${money(analysis.totals.PRORATED).padStart(14)}`);
  L.push("");
  L.push(`  A - C  overcharge under the current rule             ${money(analysis.totals.CURRENT_RPC - analysis.totals.PRORATED).padStart(14)}`);

  L.push("");
  L.push("-".repeat(78));
  L.push("WHAT EACH CONVENTION COSTS");
  L.push("-".repeat(78));
  L.push("");
  L.push("  A  FULL CALENDAR QUARTER — no code change");
  L.push("     Bills time before the tenancy began. Defensible only if the");
  L.push("     contract genuinely says 'the quarterly charge is payable in full");
  L.push("     for any quarter in which the lease is live'. Some commercial");
  L.push("     leases do say that. Ours do not say anything, because they are");
  L.push("     fixtures.");
  L.push("");
  L.push("  B  FIRST FULL QUARTER — no code change, fixture change only");
  L.push("     Bill nothing for a partially covered quarter. Never charges for");
  L.push("     time that did not exist. Gives away a partial quarter, which for");
  L.push("     a demo is invisible and for a real operator would not be.");
  L.push("");
  L.push("  C  PRORATED — requires building proration");
  L.push("     The most accurate and the only one that needs product work: there");
  L.push("     is no proration concept in the schema, no rounding rule, and no");
  L.push("     way to express a part-period charge on a lease. Choosing this in");
  L.push("     a seed would mean INVENTING an accounting rule inside fixture");
  L.push("     code, which is exactly what this project has refused to do");
  L.push("     everywhere else.");
  L.push("");
  L.push("-".repeat(78));
  L.push("A FOURTH OPTION, AND THE ONE THIS ANALYSIS FAVOURS");
  L.push("-".repeat(78));
  L.push("");
  L.push("  D  ALIGN THE FIXTURES TO QUARTER BOUNDARIES");
  L.push("     Move each quarterly lease's commencement to the start of a");
  L.push("     quarter. Then A, B and C all agree, the ambiguity disappears from");
  L.push("     the demo entirely, and no accounting rule is invented anywhere.");
  L.push("");
  L.push("     It does not FIX the RPC -- a real customer signing a commercial");
  L.push("     lease on the 15th still hits this. But it stops the demo from");
  L.push("     depending on an unresolved question, and it keeps the product");
  L.push("     decision where it belongs: with whoever owns the billing rules,");
  L.push("     not with the seed.");
  L.push("");
  L.push("     Cost: the 18 quarterly leases were created by the structural");
  L.push("     repair and are ACTIVE. Changing commencement means ending and");
  L.push("     recreating them -- the same 18/18 shape as the repair, before any");
  L.push("     commercial rent exists to complicate it.");

  return L.join("\n");
}
