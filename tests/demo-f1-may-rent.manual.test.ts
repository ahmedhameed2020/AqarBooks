/**
 * Driver for F1 — May 2026 rent obligations.
 *
 * Dry run:
 *     npx vitest run tests/demo-f1-may-rent.manual.test.ts
 * Apply:
 *     DEMO_F1_APPLY=1 npx vitest run tests/demo-f1-may-rent.manual.test.ts
 *
 * An apply with a missing prerequisite THROWS rather than skipping.
 *
 * Report: test-results/demo-f1-may-rent.txt
 */
import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import type { Database } from "../lib/supabase/types";
import {
  applyF1MayRent,
  mayCompletenessForecast,
  verifyF1,
  MAY_PERIOD,
} from "../scripts/demo/apply-f1-may-rent";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const organizationId = process.env.DEMO_ORGANIZATION_ID!;
const ownerEmail = process.env.DEMO_OWNER_EMAIL!;

const APPLY = process.env.DEMO_F1_APPLY === "1";

const MISSING = [
  ["NEXT_PUBLIC_SUPABASE_URL", url],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
  ["DEMO_ORGANIZATION_ID", organizationId],
  ["DEMO_OWNER_EMAIL", ownerEmail],
]
  .filter(([, v]) => !v)
  .map(([n]) => n);

if (APPLY && MISSING.length > 0) {
  throw new Error(`DEMO_F1_APPLY=1 but missing: ${MISSING.join(", ")}. Refusing to skip.`);
}

/** From the planner, rebuilt from the current database before this ran. */
const PLANNER_MAY = { count: 26, amount: 481_200 };

describe.skipIf(MISSING.length > 0)("F1 May rent", () => {
  it(
    APPLY ? "generates May rent obligations" : "rehearses May rent generation",
    async () => {
      const lines: string[] = [
        `F1 MAY RENT ${APPLY ? "— APPLY" : "— DRY RUN"}`,
        "=".repeat(72),
        "",
      ];
      const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

      // ---- precheck ------------------------------------------------------
      const { data: periods } = await admin
        .from("fiscal_periods")
        .select("start_date, status")
        .eq("organization_id", organizationId);
      const may = (periods ?? []).find((p) => p.start_date.startsWith(MAY_PERIOD));
      expect(may?.status, "May is not OPEN").toBe("OPEN");

      // The baseline must be zero on the FIRST apply. A resumed run legitimately
      // finds its own dues already there, so the check is scoped to that.
      const { data: dues } = await admin
        .from("dues")
        .select("id, source_type")
        .eq("organization_id", organizationId)
        .range(0, 4999);
      const foreign = (dues ?? []).filter((d) => d.source_type !== "LEASE_RENT");
      expect(foreign, "the tenant holds dues this stage did not create").toEqual([]);

      for (const table of ["payments", "service_charge_levies", "bank_statements"] as const) {
        const { data } = await admin
          .from(table)
          .select("id")
          .eq("organization_id", organizationId)
          .limit(1);
        expect((data ?? []).length, `${table} is not empty before F1`).toBe(0);
      }

      lines.push("PRECHECK");
      lines.push("-".repeat(72));
      lines.push(`  May period                    ${may?.status}`);
      lines.push(`  non-rent dues                 ${foreign.length}`);
      lines.push(`  payments / levies / statements 0`);
      lines.push("");

      // ---- authorized finance actor --------------------------------------
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
      const { data: canGenerate } = await owner.rpc("has_permission", {
        p_user_id: who.user!.id,
        p_organization_id: organizationId,
        p_permission_key: "finance.schedules.generate",
      });
      expect(canGenerate, "owner lacks finance.schedules.generate").toBe(true);

      // ---- write ---------------------------------------------------------
      const report = await applyF1MayRent({
        admin,
        owner,
        organizationId,
        dryRun: !APPLY,
        log: (l) => lines.push(l),
      });

      lines.push("GENERATION");
      lines.push("-".repeat(72));
      lines.push(`  attempted                     ${report.attempted}`);
      lines.push(`  generated                     ${report.generated}`);
      lines.push(`  already present (idempotent)  ${report.idempotent}`);
      lines.push(`  skipped                       ${report.skipped.length}`);
      for (const s of report.skipped) lines.push(`    ${s.unitCode}  ${s.reason}`);
      lines.push("");
      lines.push(`  commercial deferred           ${report.deferredCommercial.length}`);
      lines.push("    quarterly leases bill 2026-Q2, whose due_date is 2026-04-01 and is");
      lines.push("    not overridable. April is CLOSED, so those dues would be created and");
      lines.push("    never posted. Still an open decision; not made here.");
      lines.push("");

      if (!APPLY) {
        write(lines);
        await owner.auth.signOut();
        expect(report.failure ?? null, report.failure ?? "").toBeNull();
        return;
      }

      expect(report.failure ?? null, report.failure ?? "").toBeNull();

      // ---- verify --------------------------------------------------------
      const verification = await verifyF1(admin, organizationId, PLANNER_MAY);
      lines.push(verification.text);
      lines.push("");

      // ---- idempotence, while May is STILL OPEN --------------------------
      // Deliberately before any close. generate_lease_rent_dues does not
      // require an OPEN period to create a due -- the trigger requires one to
      // POST it. Replaying after a close could therefore leave an unposted due
      // if anything unexpected appeared.
      const before = await counts(admin, organizationId);
      const replay = await applyF1MayRent({
        admin,
        owner,
        organizationId,
        dryRun: false,
        log: () => {},
      });
      const after = await counts(admin, organizationId);

      lines.push("IDEMPOTENCE (replayed while May is still OPEN)");
      lines.push("-".repeat(72));
      lines.push(`  newly generated on replay     ${replay.generated}`);
      lines.push(`  reported idempotent           ${replay.idempotent}`);
      lines.push(`  new dues                      ${after.dues - before.dues}`);
      lines.push(`  new journal entries           ${after.entries - before.entries}`);
      lines.push(`  new generation runs           ${after.runs - before.runs}`);
      lines.push("");

      lines.push(await mayCompletenessForecast(admin, organizationId));

      write(lines);
      await owner.auth.signOut();

      expect(verification.pass, "F1 verification failed").toBe(true);
      expect(replay.generated, "replay created new dues").toBe(0);
      expect(after.dues - before.dues, "replay changed the due count").toBe(0);
      expect(after.entries - before.entries, "replay changed the entry count").toBe(0);
      expect(after.runs - before.runs, "replay changed the run count").toBe(0);
    },
    600_000,
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
  return { dues: await one("dues"), entries: await one("journal_entries"), runs: await one("lease_rent_generation_runs") };
}

function write(lines: string[]): void {
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/demo-f1-may-rent.txt", lines.join("\n") + "\n", "utf8");
}
