/**
 * Driver for the quarterly-lease alignment.
 *
 * Dry run:
 *     npx vitest run tests/demo-quarter-alignment.manual.test.ts
 * Apply:
 *     DEMO_ALIGNMENT_APPLY=1 npx vitest run tests/demo-quarter-alignment.manual.test.ts
 *
 * An apply with a missing prerequisite THROWS rather than skipping. That is not
 * decoration: an earlier stage of this work silently skipped its apply because
 * a variable was unset and reported green, so a missing variable is now a
 * failure and never an absence.
 *
 * Report: test-results/demo-quarter-alignment.txt
 */
import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import type { Database } from "../lib/supabase/types";
import {
  applyQuarterAlignment,
  verifyAlignment,
  readAlignmentLeases,
  ALIGNMENT_REASON,
} from "../scripts/demo/apply-quarter-alignment";
import { planQuarterAlignment, quarterBillingForecast } from "../scripts/demo/quarter-alignment";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const organizationId = process.env.DEMO_ORGANIZATION_ID!;
const ownerEmail = process.env.DEMO_OWNER_EMAIL!;

const APPLY = process.env.DEMO_ALIGNMENT_APPLY === "1";

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
  throw new Error(`DEMO_ALIGNMENT_APPLY=1 but missing: ${MISSING.join(", ")}. Refusing to skip.`);
}

describe.skipIf(MISSING.length > 0)("quarterly lease alignment", () => {
  it(
    APPLY ? "aligns the quarterly leases" : "rehearses the quarterly alignment",
    async () => {
      const lines: string[] = [
        `QUARTERLY LEASE ALIGNMENT ${APPLY ? "— APPLY" : "— DRY RUN"}`,
        "=".repeat(72),
        "",
      ];
      const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

      // ---- the plan, before anything is touched ---------------------------
      const before = await readAlignmentLeases(admin, organizationId);
      const plan = planQuarterAlignment(before);

      lines.push("PLAN");
      lines.push("-".repeat(72));
      lines.push(`  ACTIVE quarterly considered   ${plan.considered}`);
      lines.push(`  already aligned               ${plan.alreadyAligned.length}`);
      lines.push(`  to replace                    ${plan.targets.length}`);
      lines.push(`  unalignable                   ${plan.unalignable.length}`);
      lines.push("");
      for (const t of plan.targets) {
        lines.push(
          `    ${t.lease.unitCode.padEnd(12)} ${t.lease.startsOn}..${(t.lease.endsOn ?? "open").padEnd(10)}` +
            ` ->  ${t.newStartsOn}..${(t.newEndsOn ?? "open").padEnd(10)}  ${t.reason}` +
            `   (old closed ${t.endOldOn})`,
        );
      }
      lines.push("");

      // The alignment must not be able to invent a tenancy.
      for (const t of plan.targets) {
        expect(t.newStartsOn >= t.lease.startsOn, `${t.lease.unitCode} start moved back`).toBe(true);
        if (t.newEndsOn && t.lease.endsOn) {
          expect(t.newEndsOn <= t.lease.endsOn, `${t.lease.unitCode} end moved forward`).toBe(true);
        }
      }
      expect(plan.unalignable, "the rule could not align every lease").toEqual([]);

      // The agreed pre-write gate, asserted rather than reported.
      //
      // Conditional on there being work left to do: once the alignment has run,
      // a rerun legitimately finds 18 considered and 0 targets, and that is
      // convergence rather than a regression. The gate exists to catch the
      // database being in a DIFFERENT state than the one this stage was
      // authorised against -- not to insist the work is always outstanding.
      if (plan.targets.length > 0) {
        const q2 = quarterBillingForecast(plan, "2026-Q2");
        expect(plan.considered, "ACTIVE quarterly leases").toBe(18);
        expect(plan.targets.length, "leases requiring replacement").toBe(13);
        expect(q2.leases, "2026-Q2 billable leases after alignment").toBe(15);
        expect(q2.amount, "2026-Q2 amount after alignment").toBe(599_150);
      }

      // ---- authorized actor ----------------------------------------------
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
      const { data: canManage } = await owner.rpc("has_permission", {
        p_user_id: who.user!.id,
        p_organization_id: organizationId,
        p_permission_key: "property.leases.manage",
      });
      expect(canManage, "owner lacks property.leases.manage").toBe(true);

      // ---- run -------------------------------------------------------------
      const report = await applyQuarterAlignment({
        admin,
        owner,
        organizationId,
        dryRun: !APPLY,
        log: (l) => lines.push(l),
      });

      lines.push("FORECAST (derived from the clipped terms, not asserted)");
      lines.push("-".repeat(72));
      lines.push(`  2026-Q2  ${report.forecast.q2.leases} leases  ${report.forecast.q2.amount.toFixed(2)}`);
      lines.push(`  2026-Q3  ${report.forecast.q3.leases} leases  ${report.forecast.q3.amount.toFixed(2)}`);
      lines.push("");

      if (!APPLY) {
        lines.push("No write was attempted.");
        write(lines);
        await owner.auth.signOut();
        expect(report.failure ?? null, report.failure ?? "").toBeNull();
        return;
      }

      lines.push("EXECUTION");
      lines.push("-".repeat(72));
      lines.push(`  drafts created                ${report.created}`);
      lines.push(`  leases ended                  ${report.ended}`);
      lines.push(`  replacements activated        ${report.activated}`);
      lines.push("");
      for (const s of report.swaps) {
        lines.push(`    ${s.unitCode.padEnd(12)} ${s.state}${s.detail ? `  ${s.detail}` : ""}`);
      }
      lines.push("");

      if (report.failure) {
        lines.push("FAILED");
        lines.push("-".repeat(72));
        lines.push(`  ${report.failure}`);
        write(lines);
      }
      expect(report.failure ?? null, report.failure ?? "").toBeNull();

      // ---- verify, from the database --------------------------------------
      const verification = await verifyAlignment(admin, organizationId);
      lines.push(verification.text);
      lines.push("");

      // ---- second apply: it must write nothing -----------------------------
      const replay = await applyQuarterAlignment({
        admin,
        owner,
        organizationId,
        dryRun: false,
        log: () => {},
      });
      lines.push("SECOND APPLY (convergence)");
      lines.push("-".repeat(72));
      lines.push(`  created                       ${replay.created}`);
      lines.push(`  ended                         ${replay.ended}`);
      lines.push(`  activated                     ${replay.activated}`);
      lines.push("");

      const after = await verifyAlignment(admin, organizationId);
      lines.push("AFTER THE REPLAY");
      lines.push("-".repeat(72));
      lines.push(after.text);
      lines.push("");
      lines.push(`end reason recorded on every superseded row:`);
      lines.push(`  "${ALIGNMENT_REASON}"`);

      write(lines);
      await owner.auth.signOut();

      expect(replay.created, "the second apply created a lease").toBe(0);
      expect(replay.ended, "the second apply ended a lease").toBe(0);
      expect(replay.activated, "the second apply activated a lease").toBe(0);
      expect(verification.ok, "post-alignment verification failed").toBe(true);
      expect(after.q2).toEqual(verification.q2);
    },
    600_000,
  );
});

function write(lines: string[]) {
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/demo-quarter-alignment.txt", lines.join("\n") + "\n", "utf8");
}
