/**
 * Driver for the public demo seed.
 *
 * **Not part of `npm run test:all`, deliberately.** This is not test coverage
 * — coverage for the demo lives in `demo-environment.test.ts`, which touches
 * no database. This file exists because the repository has no TypeScript
 * runner (`tsx`/`ts-node` are not dependencies) and vitest is what it uses to
 * execute TypeScript against a live project, following the precedent set by
 * `pilot-rehearsal.manual.test.ts` and `sandbox-pilot.manual.test.ts`.
 *
 * Run the dry run first. Always:
 *
 *     npx vitest run tests/demo-seed.manual.test.ts
 *
 * It resolves every reference and reports what it would create, and it writes
 * nothing. Only once that report is what you expect, set DEMO_SEED_APPLY=1:
 *
 *     DEMO_SEED_APPLY=1 npx vitest run tests/demo-seed.manual.test.ts
 *
 * WHY APPLYING IS BEHIND A SECOND, DIFFERENT SWITCH
 * The demo tenant lives inside the production database. The seed's own guard
 * refuses any target that is not the designated demo organization, but the
 * guard protects against the wrong TARGET, not against running at the wrong
 * TIME. `DEMO_SEED_APPLY` is the deliberate act; it is not read from
 * `.env.local`, so it cannot be left switched on by accident.
 *
 * The report is written to `test-results/demo-seed-report.txt`, not the
 * terminal: this repository's vitest setup suppresses console.log, so anything
 * printed there is never seen.
 */
import { describe, it, expect } from "vitest";
import { mkdirSync, writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import type { Database } from "../lib/supabase/types";
import { seedDemoTenant } from "../scripts/demo/seed-demo-tenant";
import { checkApplyPreconditions, renderPreconditions } from "../scripts/demo/apply-preconditions";
import { verifyStructural, renderStructural } from "../scripts/demo/verify-structural";
import { DEMO_STORY } from "../lib/demo/story";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const APPLY = process.env.DEMO_SEED_APPLY === "1";

/**
 * Emails, not passwords. A dry run never opens the owner session at all, and an
 * apply obtains it from the service-role key via generateLink -- so no password
 * is required in either mode. DEMO_OWNER_PASSWORD remains honoured if set, but
 * requiring it would gate the run on a credential the code does not need.
 */
const CONFIGURED = Boolean(
  url &&
    serviceKey &&
    process.env.DEMO_ORGANIZATION_ID &&
    process.env.DEMO_OWNER_EMAIL &&
    process.env.DEMO_USER_EMAIL,
);

function writeReport(lines: string[], report: unknown, structuralPass: boolean | null): void {
  mkdirSync("test-results", { recursive: true });
  const verdict =
    structuralPass === null ? "" : `\n\nSTRUCTURAL: ${structuralPass ? "PASS" : "FAIL"}`;
  writeFileSync(
    "test-results/demo-seed-report.txt",
    [...lines, "", JSON.stringify(report, null, 2)].join("\n") + verdict + "\n",
    "utf8",
  );
}

describe.skipIf(!CONFIGURED)("public demo seed", () => {
  it(
    APPLY ? "applies the seed to the demo tenant" : "resolves the seed plan without writing",
    async () => {
      const lines: string[] = [];
      const admin = createClient<Database>(url, serviceKey, {
        auth: { persistSession: false },
      });

      // Both ids are resolved from the admin API rather than configured: one
      // less secret to keep in sync, and a typo in either email surfaces here
      // instead of inside the guard.
      const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const ownerUser = users?.users.find((u) => u.email === process.env.DEMO_OWNER_EMAIL);
      const demoUser = users?.users.find((u) => u.email === process.env.DEMO_USER_EMAIL);
      expect(ownerUser, "no auth user found for DEMO_OWNER_EMAIL").toBeTruthy();
      expect(demoUser, "no auth user found for DEMO_USER_EMAIL").toBeTruthy();

      // Neither account may be a platform admin: has_permission() short-
      // circuits to true for one, which would hand every write permission in
      // the product to whoever clicks "Explore Live Demo".
      for (const user of [ownerUser!, demoUser!]) {
        const { data: isAdmin } = await admin.rpc("is_platform_admin", { p_user_id: user.id });
        expect(isAdmin, `${user.email} is a platform admin`).toBeFalsy();
      }

      // Opened only for an apply. A dry run writes nothing, so it has no use
      // for the owner's credentials and does not ask for them.
      let owner: SupabaseClient<Database> | undefined;
      if (APPLY) {
        // Postings run under a genuinely authenticated owner session, never
        // the service role: the RPCs authorise via has_permission(auth.uid(),
        // ...), which is null for the service role, and a seed that bypassed
        // the accounting guards would produce data the product itself could
        // not have produced.
        //
        // WHY NO PASSWORD IS USED
        // The service-role key can already mint a session for any account, so
        // demanding the owner password in addition buys no security -- it only
        // creates a production password that has to be typed, held in an
        // environment variable, and then remembered about afterwards.
        // generateLink issues the same session from the key we already hold,
        // sends no email, and leaves nothing to forget to delete. A password is
        // still honoured if one is supplied.
        owner = createClient<Database>(url, anonKey, { auth: { persistSession: false } });

        if (process.env.DEMO_OWNER_PASSWORD) {
          const { error } = await owner.auth.signInWithPassword({
            email: process.env.DEMO_OWNER_EMAIL!,
            password: process.env.DEMO_OWNER_PASSWORD,
          });
          expect(error, `owner sign-in failed: ${error?.message}`).toBeNull();
        } else {
          const { data: link, error: linkErr } = await admin.auth.admin.generateLink({
            type: "magiclink",
            email: process.env.DEMO_OWNER_EMAIL!,
          });
          expect(linkErr, `generateLink failed: ${linkErr?.message}`).toBeNull();
          const { error } = await owner.auth.verifyOtp({
            token_hash: link!.properties!.hashed_token,
            type: "magiclink",
          });
          expect(error, `owner session failed: ${error?.message}`).toBeNull();
        }

        // The session must actually BE the owner and must actually carry the
        // permission the write stages need. A session that authenticated but
        // resolved to the wrong account would fail deep inside an RPC.
        const { data: who } = await owner.auth.getUser();
        expect(who.user?.id, "owner session is not the expected account").toBe(ownerUser!.id);

        const { data: canLease } = await owner.rpc("has_permission", {
          p_user_id: ownerUser!.id,
          p_organization_id: process.env.DEMO_ORGANIZATION_ID!,
          p_permission_key: "property.leases.manage",
        });
        expect(canLease, "owner session lacks property.leases.manage").toBe(true);

        // Re-measured now, never inherited from the dry run: minutes or days
        // may have passed, and a report that was true when printed is not a
        // licence to write later.
        const pre = await checkApplyPreconditions({
          admin,
          organizationId: process.env.DEMO_ORGANIZATION_ID!,
          configuredDemoOrganizationId: process.env.DEMO_ORGANIZATION_ID,
          expectedSlug: process.env.DEMO_ORGANIZATION_SLUG || DEMO_STORY.organization.slug,
          ownerUserId: ownerUser!.id,
          demoUserId: demoUser!.id,
          requireEmpty: process.env.DEMO_SEED_RESUME !== "1",
        });

        lines.push(renderPreconditions(pre));
        lines.push("");

        if (!pre.pass) {
          writeReport(lines, { aborted: "preconditions" }, null);
          await owner.auth.signOut();
        }
        expect(pre.pass, "apply preconditions failed -- see test-results/demo-seed-report.txt").toBe(
          true,
        );
      }

      const report = await seedDemoTenant({
        admin,
        owner,
        ownerUserId: ownerUser!.id,
        demoUserId: demoUser!.id,
        organizationId: process.env.DEMO_ORGANIZATION_ID!,
        configuredDemoOrganizationId: process.env.DEMO_ORGANIZATION_ID,
        expectedSlug: process.env.DEMO_ORGANIZATION_SLUG || DEMO_STORY.organization.slug,
        dryRun: !APPLY,
        log: (line) => lines.push(line),
      });

      // On failure: record and STOP. No cleanup, no delete-and-reseed. Much of
      // what the seed writes goes through accounting RPCs and is immutable by
      // design, so a partial apply is RESUMED, never undone. The report names
      // the last stage that succeeded so the resume starts from a known point.
      if (report.failure) {
        lines.push("");
        lines.push("APPLY FAILED -- NOTHING WAS CLEANED UP, BY DESIGN");
        lines.push("-".repeat(72));
        const touched = report.stages.filter((st) => st.created > 0 || st.existing > 0);
        lines.push(
          `  last successful stage : ${touched.length ? touched[touched.length - 1]!.stage : "(none)"}`,
        );
        lines.push("  stages completed      :");
        for (const st of report.stages) {
          lines.push(`      ${st.stage.padEnd(24)} existing=${st.existing} created=${st.created}`);
        }
        lines.push(`  failure               : ${report.failure}`);
        lines.push("");
        lines.push("  Resume with DEMO_SEED_RESUME=1 DEMO_SEED_APPLY=1. Every stage looks");
        lines.push("  its objects up by natural key first, so a resume creates only what");
        lines.push("  is missing. Do NOT delete and re-seed.");
      }

      // Verification reads the database, not the seed's own account of itself.
      if (APPLY && report.ok) {
        const structural = await verifyStructural(admin, process.env.DEMO_ORGANIZATION_ID!);
        lines.push("");
        lines.push(renderStructural(structural));
        writeReport(lines, report, structural.pass);
        if (owner) await owner.auth.signOut();
        expect(structural.pass, "structural verification failed").toBe(true);
        return;
      }

      writeReport(lines, report, null);
      if (owner) await owner.auth.signOut();

      expect(report.failure ?? null, report.failure ?? "").toBeNull();
      expect(report.ok).toBe(true);
    },
    300_000,
  );
});
