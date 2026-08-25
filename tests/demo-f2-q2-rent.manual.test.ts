/**
 * Driver for F2 — 2026-Q2 commercial rent.
 *
 * Dry run:
 *     npx vitest run tests/demo-f2-q2-rent.manual.test.ts
 * Apply:
 *     DEMO_F2_APPLY=1 npx vitest run tests/demo-f2-q2-rent.manual.test.ts
 *
 * An apply with a missing prerequisite THROWS rather than skipping.
 *
 * ORDER MATTERS HERE MORE THAN IN THE EARLIER STAGES. April is reopened,
 * written into, replayed, and closed again -- and the replay happens while
 * April is STILL OPEN, deliberately. Replaying after the close would prove
 * idempotence under a condition that also blocks writing, which proves nothing
 * about idempotence.
 *
 * If any step fails, April is left OPEN and the failure says so. Closing a
 * period on the way out of a failed run would hide an incomplete April behind a
 * tidy-looking status.
 *
 * Report: test-results/demo-f2-q2-rent.txt
 */
import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import type { Database } from "../lib/supabase/types";
import {
  applyF2Q2Rent,
  verifyQ2,
  renderFiscalState,
  setPeriodStatus,
  APRIL_PERIOD,
  APRIL_RECLOSE_REASON,
} from "../scripts/demo/apply-f2-q2-rent";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const organizationId = process.env.DEMO_ORGANIZATION_ID!;
const ownerEmail = process.env.DEMO_OWNER_EMAIL!;

const APPLY = process.env.DEMO_F2_APPLY === "1";

const MISSING = [
  ["NEXT_PUBLIC_SUPABASE_URL", url],
  ["NEXT_PUBLIC_SUPABASE_ANON_KEY", anonKey],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
  ["DEMO_ORGANIZATION_ID", organizationId],
  ["DEMO_OWNER_EMAIL", ownerEmail],
]
  .filter(([, v]) => !v)
  .map(([n]) => n);

if (APPLY && MISSING.length > 0) {
  throw new Error(`DEMO_F2_APPLY=1 but missing: ${MISSING.join(", ")}. Refusing to skip.`);
}

/**
 * The expected direction, from the aligned leases. Not a target the stage aims
 * at -- each due is its lease's own rent_amount -- but the sums it must reach
 * if the fifteen billable leases are exactly the fifteen that get billed.
 *
 *   May   26 dues     481,200.00   (F1, already in the ledger)
 *   Q2    15 dues     599,150.00
 *         41 dues   1,080,350.00
 */
const EXPECTED = {
  q2Count: 15,
  q2Amount: 599_150,
  totalCount: 41,
  totalAmount: 1_080_350,
};

describe.skipIf(MISSING.length > 0)("F2 Q2 commercial rent", () => {
  it(
    APPLY ? "posts 2026-Q2 commercial rent" : "rehearses 2026-Q2 commercial rent",
    async () => {
      const lines: string[] = [
        `F2 — 2026-Q2 COMMERCIAL RENT ${APPLY ? "— APPLY" : "— DRY RUN"}`,
        "=".repeat(72),
        "",
      ];
      const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

      // ---- precheck --------------------------------------------------------
      const opening = await renderFiscalState(admin, organizationId);
      lines.push("BEFORE");
      lines.push("-".repeat(72));
      lines.push(opening.text.split("\n").slice(2).join("\n"));
      lines.push("");

      const { data: duesBefore } = await admin
        .from("dues")
        .select("id, amount, issue_date, source_type")
        .eq("organization_id", organizationId)
        .range(0, 4999);
      const q2Before = (duesBefore ?? []).filter((d) => d.issue_date === "2026-04-01");
      lines.push(`  rent dues before              ${(duesBefore ?? []).length}`);
      lines.push(`  Q2 dues before                ${q2Before.length}`);
      lines.push("");

      expect(
        (duesBefore ?? []).every((d) => d.source_type === "LEASE_RENT"),
        "the tenant holds dues no rent stage created",
      ).toBe(true);

      // ---- authorized actor ------------------------------------------------
      const owner: SupabaseClient<Database> = createClient<Database>(url, anonKey, {
        auth: { persistSession: false },
      });
      const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
        type: "magiclink",
        email: ownerEmail,
      });
      expect(linkErr, `generateLink failed: ${linkErr?.message}`).toBeNull();
      const { error: otpErr } = await owner.auth.verifyOtp({
        token_hash: link!.properties!.hashed_token,
        type: "magiclink",
      });
      expect(otpErr, `owner session failed: ${otpErr?.message}`).toBeNull();

      const { data: who } = await owner.auth.getUser();
      for (const key of ["finance.periods.manage", "finance.schedules.generate"]) {
        const { data: allowed } = await owner.rpc("has_permission", {
          p_user_id: who.user!.id,
          p_organization_id: organizationId,
          p_permission_key: key,
        });
        expect(allowed, `owner lacks ${key}`).toBe(true);
      }

      // ---- 1 & 2: reopen April, generate Q2 --------------------------------
      const report = await applyF2Q2Rent({
        admin,
        owner,
        organizationId,
        dryRun: !APPLY,
        log: (l) => lines.push(l),
      });

      lines.push("SELECTION");
      lines.push("-".repeat(72));
      lines.push(`  billable (cover 2026-Q2)      ${report.billable}`);
      lines.push(`  deliberately not called       ${report.notCalled.length}`);
      for (const n of report.notCalled) {
        lines.push(`    ${n.unitCode.padEnd(12)} ${n.term.padEnd(24)} ${n.why}`);
      }
      lines.push("");

      if (!APPLY) {
        lines.push("No write was attempted.");
        write(lines);
        await owner.auth.signOut();
        expect(report.failure ?? null, report.failure ?? "").toBeNull();
        expect(report.billable, "billable leases").toBe(EXPECTED.q2Count);
        return;
      }

      lines.push("GENERATION");
      lines.push("-".repeat(72));
      lines.push(`  April reopened                ${report.aprilReopened}`);
      lines.push(`  generated                     ${report.generated}`);
      lines.push(`  already present (idempotent)  ${report.idempotent}`);
      lines.push("");
      for (const r of report.results) {
        lines.push(`    ${r.unitCode.padEnd(12)} ${r.amount.toFixed(2).padStart(12)}   ${r.outcome}`);
      }
      lines.push("");

      if (report.failure) {
        lines.push("FAILED — APRIL LEFT OPEN");
        lines.push("-".repeat(72));
        lines.push(`  ${report.failure}`);
        write(lines);
      }
      expect(report.failure ?? null, report.failure ?? "").toBeNull();

      // ---- 3, 4, 5: verify --------------------------------------------------
      const verification = await verifyQ2(admin, organizationId, EXPECTED);
      lines.push(verification.text);
      lines.push("");

      // ---- 6: replay WHILE APRIL IS STILL OPEN ------------------------------
      const before = await counts(admin, organizationId);
      const replay = await applyF2Q2Rent({
        admin,
        owner,
        organizationId,
        dryRun: false,
        log: () => {},
      });
      const after = await counts(admin, organizationId);

      lines.push("REPLAY (while April is still OPEN)");
      lines.push("-".repeat(72));
      lines.push(`  newly generated               ${replay.generated}`);
      lines.push(`  reported idempotent           ${replay.idempotent}`);
      lines.push(`  new dues                      ${after.dues - before.dues}`);
      lines.push(`  new journal entries           ${after.entries - before.entries}`);
      lines.push(`  new generation runs           ${after.runs - before.runs}`);
      lines.push("");

      // Asserted before April is closed: if the replay wrote anything, April
      // must stay open so the extra rows can be dealt with in the period they
      // belong to.
      expect(replay.generated, "the replay created a due").toBe(0);
      expect(after.dues - before.dues, "the replay created dues").toBe(0);
      expect(after.entries - before.entries, "the replay created journal entries").toBe(0);
      expect(after.runs - before.runs, "the replay created generation runs").toBe(0);
      expect(verification.pass, "Q2 verification failed").toBe(true);

      // ---- 7: close April again ---------------------------------------------
      const reclose = await setPeriodStatus(
        admin,
        owner,
        organizationId,
        APRIL_PERIOD,
        "CLOSED",
        APRIL_RECLOSE_REASON,
      );
      lines.push("APRIL CLOSED AGAIN");
      lines.push("-".repeat(72));
      lines.push(`  ${reclose.from} -> CLOSED`);
      lines.push(`  reason: "${APRIL_RECLOSE_REASON}"`);
      lines.push("");

      // ---- 8: final fiscal state --------------------------------------------
      const finalState = await renderFiscalState(admin, organizationId);
      lines.push(finalState.text);
      lines.push("");

      // The ledger must read the same with April closed as it did with April
      // open. A close that changed a figure would mean something was posted by
      // the close itself.
      const recheck = await verifyQ2(admin, organizationId, EXPECTED);
      lines.push("RE-VERIFIED AFTER THE CLOSE");
      lines.push("-".repeat(72));
      lines.push(`  ${recheck.pass ? "PASS" : "FAIL"} — every check unchanged`);

      write(lines);
      await owner.auth.signOut();

      for (const month of ["2026-01", "2026-02", "2026-03", "2026-04"]) {
        expect(finalState.byMonth[month], `${month} should be CLOSED`).toBe("CLOSED");
      }
      expect(finalState.byMonth["2026-05"], "May should still be OPEN").toBe("OPEN");
      for (const month of ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10", "2026-11", "2026-12"]) {
        expect(finalState.byMonth[month], `${month} should be PLANNED`).toBe("PLANNED");
      }
      expect(recheck.pass, "verification changed after the close").toBe(true);
    },
    900_000,
  );
});

async function counts(admin: SupabaseClient<Database>, organizationId: string) {
  const one = async (t: "dues" | "journal_entries" | "lease_rent_generation_runs") => {
    const { data } = await admin
      .from(t)
      .select("id")
      .eq("organization_id", organizationId)
      .range(0, 4999);
    return (data ?? []).length;
  };
  return {
    dues: await one("dues"),
    entries: await one("journal_entries"),
    runs: await one("lease_rent_generation_runs"),
  };
}

function write(lines: string[]) {
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/demo-f2-q2-rent.txt", lines.join("\n") + "\n", "utf8");
}
