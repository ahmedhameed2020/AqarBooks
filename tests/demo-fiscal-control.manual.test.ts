/**
 * Driver for F0 — fiscal control.
 *
 * Dry run (writes nothing):
 *     npx vitest run tests/demo-fiscal-control.manual.test.ts
 *
 * Apply:
 *     DEMO_F0_APPLY=1 npx vitest run tests/demo-fiscal-control.manual.test.ts
 *
 * An apply with a missing prerequisite THROWS rather than skipping, for the
 * reason the seed driver learned the hard way: a skipped apply prints a green
 * "1 skipped" and is indistinguishable from one that succeeded.
 *
 * Report: test-results/demo-fiscal-control.txt
 */
import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import type { Database } from "../lib/supabase/types";
import {
  applyFiscalControl,
  renderFiscalControl,
  verifyFiscalControl,
} from "../scripts/demo/apply-fiscal-control";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const organizationId = process.env.DEMO_ORGANIZATION_ID!;
const ownerEmail = process.env.DEMO_OWNER_EMAIL!;

const APPLY = process.env.DEMO_F0_APPLY === "1";

const MISSING = [
  ["NEXT_PUBLIC_SUPABASE_URL", url],
  ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
  ["DEMO_ORGANIZATION_ID", organizationId],
  ["DEMO_OWNER_EMAIL", ownerEmail],
]
  .filter(([, v]) => !v)
  .map(([n]) => n);

if (APPLY && MISSING.length > 0) {
  throw new Error(
    `DEMO_F0_APPLY=1 was set but these are missing: ${MISSING.join(", ")}. Refusing to skip.`,
  );
}

describe.skipIf(MISSING.length > 0)("F0 fiscal control", () => {
  it(
    APPLY ? "applies the fiscal transitions" : "rehearses the fiscal transitions",
    async () => {
      const admin = createClient<Database>(url, serviceKey, { auth: { persistSession: false } });

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
        p_permission_key: "finance.periods.manage",
      });
      expect(canManage, "owner session lacks finance.periods.manage").toBe(true);

      // Nothing financial may exist yet. F0 arranges the periods that the
      // later stages will post into; if anything had already been posted, the
      // ordering assumption behind this whole sequence would be wrong.
      for (const table of ["dues", "payments", "journal_entries"] as const) {
        const { data } = await admin
          .from(table)
          .select("id")
          .eq("organization_id", organizationId)
          .limit(1);
        expect((data ?? []).length, `${table} is not empty before F0`).toBe(0);
      }

      const report = await applyFiscalControl({
        admin,
        owner,
        organizationId,
        dryRun: !APPLY,
      });

      const lines = [renderFiscalControl(report)];

      if (APPLY && report.ok) {
        const verification = await verifyFiscalControl(admin, organizationId);
        lines.push("");
        lines.push(verification.text);

        mkdirSync("test-results", { recursive: true });
        writeFileSync("test-results/demo-fiscal-control.txt", lines.join("\n") + "\n", "utf8");

        await owner.auth.signOut();
        expect(verification.pass, "fiscal verification failed").toBe(true);
        return;
      }

      mkdirSync("test-results", { recursive: true });
      writeFileSync("test-results/demo-fiscal-control.txt", lines.join("\n") + "\n", "utf8");
      await owner.auth.signOut();

      expect(report.failure ?? null, report.failure ?? "").toBeNull();
      expect(report.ok).toBe(true);
    },
    300_000,
  );
});
