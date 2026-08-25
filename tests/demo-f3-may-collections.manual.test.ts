/**
 * Driver for F3 — May 2026 collections.
 *
 * Dry run:
 *     npx vitest run tests/demo-f3-may-collections.manual.test.ts
 * Apply:
 *     DEMO_F3_APPLY=1 npx vitest run tests/demo-f3-may-collections.manual.test.ts
 *
 * An apply with a missing prerequisite THROWS rather than skipping.
 *
 * MAY IS NOT CLOSED UNCONDITIONALLY. The close runs only if the completeness
 * check finds nothing further dated inside May. If it finds a blocker, May
 * stays OPEN and the report says what is missing -- a period closed while
 * May-dated work is still outstanding would have to be reopened to finish it.
 *
 * Report: test-results/demo-f3-may-collections.txt
 */
import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import type { Database } from "../lib/supabase/types";
import {
  applyF3MayCollections,
  verifyF3,
  mayCompleteness,
  MAY_PERIOD,
  MAY_FIRST,
  MAY_LAST,
} from "../scripts/demo/apply-f3-may-collections";
import { setPeriodStatus } from "../scripts/demo/apply-f2-q2-rent";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const organizationId = process.env.DEMO_ORGANIZATION_ID!;
const ownerEmail = process.env.DEMO_OWNER_EMAIL!;

const APPLY = process.env.DEMO_F3_APPLY === "1";

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
  throw new Error(`DEMO_F3_APPLY=1 but missing: ${MISSING.join(", ")}. Refusing to skip.`);
}

/** Opening AR, from F1 (26 x May) and F2 (15 x Q2). */
const OPENING_AR = 1_080_350;

const MAY_CLOSE_REASON =
  "Demo financial narrative — May 2026 complete: rent issued, collections posted, nothing further dated inside the period";

describe.skipIf(MISSING.length > 0)("F3 May collections", () => {
  it(
    APPLY ? "posts May collections" : "rehearses May collections",
    async () => {
      const lines: string[] = [
        `F3 — MAY 2026 COLLECTIONS ${APPLY ? "— APPLY" : "— DRY RUN"}`,
        "=".repeat(72),
        "",
      ];
      const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

      // ---- precheck ---------------------------------------------------------
      const { data: periods } = await admin
        .from("fiscal_periods")
        .select("start_date, status")
        .eq("organization_id", organizationId);
      const may = (periods ?? []).find((p) => p.start_date.slice(0, 7) === MAY_PERIOD);
      expect(may?.status, "May is not OPEN").toBe("OPEN");

      const { data: seqBefore } = await admin
        .from("document_sequences")
        .select("sequence_type, next_value")
        .eq("organization_id", organizationId);

      lines.push("BEFORE");
      lines.push("-".repeat(72));
      lines.push(`  May period                    ${may?.status}`);
      lines.push(`  opening AR                    ${OPENING_AR.toFixed(2)}`);
      for (const s of seqBefore ?? []) {
        lines.push(`  sequence ${s.sequence_type.padEnd(20)}${String(s.next_value).padStart(6)}`);
      }
      lines.push("");

      // ---- authorized actor -------------------------------------------------
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
      const { data: canCollect } = await owner.rpc("has_permission", {
        p_user_id: who.user!.id,
        p_organization_id: organizationId,
        p_permission_key: "receivables.payments.create",
      });
      expect(canCollect, "owner lacks receivables.payments.create").toBe(true);

      // ---- run --------------------------------------------------------------
      const report = await applyF3MayCollections({
        admin,
        owner,
        organizationId,
        dryRun: !APPLY,
        log: (l) => lines.push(l),
      });

      lines.push("PLAN (rebuilt from the dues in the ledger)");
      lines.push("-".repeat(72));
      lines.push(`  payer profiles`);
      for (const [profile, count] of Object.entries(report.profiles)) {
        lines.push(`    ${profile.padEnd(14)}${String(count).padStart(4)}`);
      }
      lines.push("");
      lines.push(`  settlements planned           ${report.planned}`);
      lines.push(`  planned total                 ${report.plannedTotal.toFixed(2)}`);
      lines.push(`  moved out of closed April     ${report.clamped}`);
      lines.push("");

      if (report.failure) {
        lines.push("FAILED");
        lines.push("-".repeat(72));
        lines.push(`  ${report.failure}`);
        write(lines);
      }
      expect(report.failure ?? null, report.failure ?? "").toBeNull();

      // Every posted settlement must land inside May, whichever due it settles.
      for (const r of report.results) {
        expect(r.paymentDate >= MAY_FIRST && r.paymentDate <= MAY_LAST, `${r.unitCode} ${r.paymentDate}`).toBe(true);
      }

      if (!APPLY) {
        lines.push("No write was attempted.");
        write(lines);
        await owner.auth.signOut();
        return;
      }

      lines.push("POSTED");
      lines.push("-".repeat(72));
      lines.push(`  payments                      ${report.posted}`);
      lines.push("");
      for (const r of report.results) {
        lines.push(
          `    ${r.unitCode.padEnd(12)} ${r.amount.toFixed(2).padStart(12)}  ${r.method.padEnd(14)}` +
            ` ${r.paymentDate}  ${String(r.daysLate).padStart(3)}d${r.clamped ? "  (moved from April)" : ""}`,
        );
      }
      lines.push("");

      // ---- verify -----------------------------------------------------------
      const verification = await verifyF3(admin, organizationId, {
        payments: report.posted,
        collected: report.plannedTotal,
        openingAr: OPENING_AR,
      });
      lines.push(verification.text);
      lines.push("");
      // Written before the assertions below, not after. A failed verification is
      // exactly when the report is most needed, and an assertion that fires
      // first would leave the file holding the previous run's output.
      write(lines);

      // ---- replay, while May is still OPEN ----------------------------------
      const before = await counts(admin, organizationId);
      const replay = await applyF3MayCollections({
        admin,
        owner,
        organizationId,
        dryRun: false,
        log: () => {},
      });
      const after = await counts(admin, organizationId);

      const { data: seqAfter } = await admin
        .from("document_sequences")
        .select("sequence_type, next_value")
        .eq("organization_id", organizationId);
      const seqDrift = (seqAfter ?? []).filter((s) => {
        const was = (before.sequences ?? []).find((b) => b.sequence_type === s.sequence_type);
        return !was || was.next_value !== s.next_value;
      });

      lines.push("REPLAY (while May is still OPEN)");
      lines.push("-".repeat(72));
      lines.push(`  new payments                  ${after.payments - before.payments}`);
      lines.push(`  new allocations               ${after.allocations - before.allocations}`);
      lines.push(`  new journal entries           ${after.entries - before.entries}`);
      lines.push(`  sequences that moved          ${seqDrift.length}`);
      for (const s of seqAfter ?? []) {
        lines.push(`    ${s.sequence_type.padEnd(20)}${String(s.next_value).padStart(6)}`);
      }
      lines.push("");

      expect(replay.failure ?? null, replay.failure ?? "").toBeNull();
      expect(after.payments - before.payments, "the replay created payments").toBe(0);
      expect(after.allocations - before.allocations, "the replay created allocations").toBe(0);
      expect(after.entries - before.entries, "the replay created journal entries").toBe(0);
      expect(seqDrift, "a document sequence moved on replay").toEqual([]);
      expect(verification.pass, "F3 verification failed").toBe(true);

      // ---- May completeness --------------------------------------------------
      const completeness = await mayCompleteness(admin, organizationId);
      lines.push(completeness.text);
      lines.push("");

      if (completeness.blockers.length === 0) {
        const closed = await setPeriodStatus(
          admin,
          owner,
          organizationId,
          MAY_PERIOD,
          "CLOSED",
          MAY_CLOSE_REASON,
        );
        lines.push("MAY CLOSED");
        lines.push("-".repeat(72));
        lines.push(`  ${closed.from} -> CLOSED`);
        lines.push(`  reason: "${MAY_CLOSE_REASON}"`);
      } else {
        lines.push("MAY LEFT OPEN");
        lines.push("-".repeat(72));
        lines.push("  The close was not attempted. See the blockers above.");
      }
      lines.push("");

      const { data: finalPeriods } = await admin
        .from("fiscal_periods")
        .select("start_date, status")
        .eq("organization_id", organizationId)
        .order("start_date");
      lines.push("FISCAL STATE");
      lines.push("-".repeat(72));
      for (const p of finalPeriods ?? []) {
        lines.push(`  ${p.start_date.slice(0, 7)}   ${p.status}`);
      }

      write(lines);
      await owner.auth.signOut();

      const mayFinal = (finalPeriods ?? []).find((p) => p.start_date.slice(0, 7) === MAY_PERIOD);
      expect(
        mayFinal?.status,
        completeness.blockers.length === 0
          ? "May should have closed"
          : "May should have stayed OPEN",
      ).toBe(completeness.blockers.length === 0 ? "CLOSED" : "OPEN");
    },
    900_000,
  );
});

async function counts(admin: SupabaseClient<Database>, organizationId: string) {
  const scoped = async (t: "payments" | "journal_entries") => {
    const { count } = await admin
      .from(t)
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId);
    return count ?? -1;
  };
  // payment_allocations has no organization_id; it is reached through payments.
  const { data: paymentRows } = await admin
    .from("payments")
    .select("id")
    .eq("organization_id", organizationId)
    .range(0, 4999);
  const ids = (paymentRows ?? []).map((p) => p.id);
  const { count: allocations } = await admin
    .from("payment_allocations")
    .select("payment_id", { count: "exact", head: true })
    .in("payment_id", ids.length > 0 ? ids : ["00000000-0000-0000-0000-000000000000"]);

  const { data: sequences } = await admin
    .from("document_sequences")
    .select("sequence_type, next_value")
    .eq("organization_id", organizationId);

  return {
    payments: await scoped("payments"),
    entries: await scoped("journal_entries"),
    allocations: allocations ?? -1,
    sequences: sequences ?? [],
  };
}

function write(lines: string[]) {
  mkdirSync("test-results", { recursive: true });
  writeFileSync("test-results/demo-f3-may-collections.txt", lines.join("\n") + "\n", "utf8");
}
