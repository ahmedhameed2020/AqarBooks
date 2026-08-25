/**
 * Quarterly rent semantics for 2026-Q2. READ-ONLY.
 *
 * Reads the live quarterly leases and reports what the current RPC would bill
 * against what three other conventions would bill. It writes nothing, calls no
 * RPC, and reaches no conclusion on its own.
 *
 * It also pins the journal-numbering invariant, because the gap at entry #1 is
 * deliberate and must not be "tidied" later by someone who does not know why it
 * is there.
 *
 * Report: test-results/demo-q2-semantics.txt
 */
import { describe, it, expect, beforeAll } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import type { Database } from "../lib/supabase/types";
import {
  analyseQuarter,
  renderQ2Analysis,
  type Q2Analysis,
  type QuarterlyLease,
} from "../scripts/demo/q2-rent-semantics";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const organizationId = process.env.DEMO_ORGANIZATION_ID!;
const CONFIGURED = Boolean(url && serviceKey && organizationId);

const admin = CONFIGURED
  ? createClient<Database>(url, serviceKey, { auth: { persistSession: false } })
  : null;

let analysis: Q2Analysis | null = null;
let allQuarterly: QuarterlyLease[] = [];

beforeAll(async () => {
  if (!admin) return;

  const { data: units } = await admin
    .from("units")
    .select("id, code")
    .eq("organization_id", organizationId)
    .range(0, 4999);
  const codeById = new Map((units ?? []).map((u) => [u.id, u.code]));

  const { data: leases } = await admin
    .from("unit_leases")
    .select("id, unit_id, rent_amount, rent_frequency, starts_on, ends_on")
    .eq("organization_id", organizationId)
    .eq("status", "ACTIVE")
    .eq("rent_frequency", "QUARTERLY")
    .range(0, 4999);

  allQuarterly = (leases ?? []).map((l) => ({
    leaseId: l.id,
    unitCode: codeById.get(l.unit_id) ?? l.unit_id,
    rentAmount: Number(l.rent_amount),
    startsOn: l.starts_on,
    endsOn: l.ends_on,
  }));

  analysis = analyseQuarter(allQuarterly, "2026-04-01", "2026-06-30");

  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/demo-q2-semantics.txt", renderQ2Analysis(analysis) + "\n", "utf8");
});

describe.skipIf(!CONFIGURED)("2026-Q2 quarterly rent semantics", () => {
  it("reads the live quarterly leases", () => {
    expect(allQuarterly.length, "no quarterly leases found").toBeGreaterThan(0);
    expect(analysis, "no analysis produced").not.toBeNull();
  });

  it("Q2 and May now touch the same leases", () => {
    // BEFORE THE ALIGNMENT this asserted the opposite, and that was the point:
    // the F1 stage filtered on leases overlapping MAY (15), while the quarter
    // runs from 1 April, so PG-T-0502 -- commencing 2026-06-01 -- overlapped Q2
    // without overlapping May. 16 against 15.
    //
    // The alignment clipped that lease to 2026-07-01..2027-03-31, so it now
    // belongs to Q3 and the two filters agree. Inverted rather than deleted:
    // the discrepancy is what made the guard necessary, and a test that no
    // longer states it would let the discrepancy return unnoticed.
    const mayOverlap = allQuarterly.filter(
      (l) => l.startsOn <= "2026-05-31" && (l.endsOn ?? "9999-12-31") >= "2026-05-01",
    );
    expect(analysis!.leases.length).toBe(mayOverlap.length);
  });

  it("no lease is billed for time before its tenancy began", () => {
    // THE DEFECT, now absent from the fixtures. Measured before the alignment:
    // one lease (PG-T-0502) occupied 30 of Q2's 91 days and would have been
    // charged 34,950.00 dated 2026-04-01 -- the whole of the 23,428.02 gap
    // between the full-quarter and prorated bases.
    //
    // This is a statement about the DEMO's fixtures, not about the product. The
    // underlying defect is still open for real customers and the database still
    // refuses the case outright; see
    // docs/defects/partial-period-rent-billing-proration.md.
    const overcharged = analysis!.leases.filter(
      (o) => o.daysOccupied < o.daysInQuarter && o.amounts.CURRENT_RPC > o.amounts.PRORATED,
    );
    expect(
      overcharged.map((o) => o.unitCode),
      "a partially-covered lease would still be billed a full quarter",
    ).toEqual([]);
  });

  it("the three conventions now agree, so nothing is left to decide", () => {
    // Before the alignment these were three different totals -- 634,100.00 by
    // the current rule, and less by each of the others -- and the spread was
    // the decision that could not be made inside a SECURITY DEFINER function.
    //
    // Aligning the fixtures to quarter boundaries settles it by making every
    // billable term cover its period exactly, which is the only way the
    // question disappears without someone picking a convention. Agreement here
    // is therefore the evidence that the alignment did what it claimed.
    const { CURRENT_RPC, FIRST_FULL_QUARTER, PRORATED } = analysis!.totals;
    const distinct = new Set([CURRENT_RPC, FIRST_FULL_QUARTER, PRORATED]);
    expect(distinct.size, "the conventions still disagree").toBe(1);
    expect(CURRENT_RPC, "2026-Q2 total").toBe(599_150);
  });

  it("writes nothing, and the Q2 rent it sees is F2's", async () => {
    // BEFORE F2 this asserted that no Q2-dated due existed at all, because this
    // stage is analysis and had to precede the posting. F2 has since posted
    // 2026-Q2 under an explicit authorisation, so absence is no longer the
    // right expectation -- but "this file writes nothing" still is.
    //
    // Restated as: the Q2 rent in the ledger is exactly what F2 put there, and
    // running this analysis did not add to it. Every Q2 due is dated
    // 2026-04-01, the quarter's own start; there is no second issue date, which
    // is what a stray write from here would look like.
    const { data: dues } = await admin!
      .from("dues")
      .select("id, amount, issue_date, source_type")
      .eq("organization_id", organizationId)
      .range(0, 4999);

    const inQ2 = (dues ?? []).filter(
      (d) => d.issue_date >= "2026-04-01" && d.issue_date <= "2026-06-30",
    );

    // Every issue date inside the quarter must be the first of a month: the
    // quarterly run uses 2026-04-01 and the monthly runs use their own month
    // starts. Listing the dates exactly was too tight -- it named April and May
    // and then failed the moment June was billed, which is the narrative
    // advancing rather than anything going wrong here.
    const offCycle = [...new Set(inQ2.map((d) => d.issue_date))].filter((d) => !d.endsWith("-01"));
    expect(offCycle, "a due inside Q2 is issued mid-month").toEqual([]);

    const q2Rent = inQ2.filter((d) => d.issue_date === "2026-04-01");
    expect(q2Rent.length, "the Q2 due count is not F2's").toBe(15);
    expect(
      q2Rent.reduce((s, d) => s + Number(d.amount), 0),
      "the Q2 total is not F2's",
    ).toBe(599_150);
    expect(
      q2Rent.every((d) => d.source_type === "LEASE_RENT"),
      "a Q2 due was not created by the rent path",
    ).toBe(true);
  });
});

describe.skipIf(!CONFIGURED)("journal numbering", () => {
  it("keeps the gap at entry #1 and stays consistent", async () => {
    // Entry 1 was the exploit entry, deleted before F1. The ledger therefore
    // starts at 2, and it stays that way.
    //
    // Renumbering is not an option: it would mean rewriting 26 POSTED entries
    // to make history look tidier, which is the opposite of what a ledger is
    // for. Resetting the sequence alone would not renumber anything and would
    // hand out numbers that already exist.
    //
    // What must hold is the invariant that keeps the sequence usable.
    const { data: entries } = await admin!
      .from("journal_entries")
      .select("entry_number")
      .eq("organization_id", organizationId)
      .range(0, 4999);

    const numbers = (entries ?? []).map((e) => e.entry_number).sort((a, b) => a - b);
    expect(numbers.length, "no journal entries").toBeGreaterThan(0);

    const { data: sequences } = await admin!
      .from("document_sequences")
      .select("sequence_type, next_value")
      .eq("organization_id", organizationId)
      .eq("sequence_type", "journal_entry");

    const next = sequences?.[0]?.next_value;
    expect(next, "no journal_entry sequence").toBeDefined();
    expect(next, "next_value must be one past the highest issued number").toBe(
      numbers[numbers.length - 1]! + 1,
    );

    // And no duplicates, which is the failure a careless reset would cause.
    expect(new Set(numbers).size, "duplicate entry numbers").toBe(numbers.length);
  });
});
