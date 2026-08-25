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

  it("Q2 overlaps more leases than May does", () => {
    // The specific gap in the F1 stage's filter: it selected leases overlapping
    // MAY, which is 15. The quarter runs from 1 April, so a lease commencing in
    // June overlaps Q2 without overlapping May.
    const mayOverlap = allQuarterly.filter(
      (l) => l.startsOn <= "2026-05-31" && (l.endsOn ?? "9999-12-31") >= "2026-05-01",
    );
    expect(analysis!.leases.length).toBeGreaterThan(mayOverlap.length);
  });

  it("the current rule bills time before a tenancy began", () => {
    // The defect, stated as a test rather than as prose. Any lease whose
    // occupied days are fewer than the quarter's days is being charged for
    // days it did not occupy.
    const overcharged = analysis!.leases.filter(
      (o) => o.daysOccupied < o.daysInQuarter && o.amounts.CURRENT_RPC > o.amounts.PRORATED,
    );
    expect(
      overcharged.length,
      "expected at least one partially-covered lease billed a full quarter",
    ).toBeGreaterThan(0);
  });

  it("reaches no conclusion on its own", () => {
    // Three conventions, three different totals. If they ever agreed, the
    // question would have been settled by the data rather than by a decision --
    // which is exactly what aligning the fixtures to quarter boundaries would
    // achieve.
    const { CURRENT_RPC, FIRST_FULL_QUARTER, PRORATED } = analysis!.totals;
    const distinct = new Set([CURRENT_RPC, FIRST_FULL_QUARTER, PRORATED]);
    expect(distinct.size, "the conventions agree; the ambiguity is already gone").toBeGreaterThan(1);
  });

  it("writes nothing", async () => {
    // The stage is analysis. Q2 rent must not exist yet.
    const { data: dues } = await admin!
      .from("dues")
      .select("id, issue_date")
      .eq("organization_id", organizationId)
      .range(0, 4999);
    const q2Dues = (dues ?? []).filter(
      (d) => d.issue_date >= "2026-04-01" && d.issue_date <= "2026-06-30" && d.issue_date !== "2026-05-01",
    );
    expect(q2Dues, "Q2-dated dues exist; this stage should have written none").toEqual([]);
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
