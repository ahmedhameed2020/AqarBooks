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
import { DEMO_STORY } from "../lib/demo/story";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const APPLY = process.env.DEMO_SEED_APPLY === "1";

/**
 * A dry run needs the two account emails so the guard can tell the demo's own
 * memberships from a stranger's -- but it does NOT need their passwords,
 * because it performs no write and therefore never opens the owner session.
 * Only an apply requires the password.
 */
const CONFIGURED = Boolean(
  url &&
    serviceKey &&
    process.env.DEMO_ORGANIZATION_ID &&
    process.env.DEMO_OWNER_EMAIL &&
    process.env.DEMO_USER_EMAIL &&
    (!APPLY || process.env.DEMO_OWNER_PASSWORD),
);

describe.skipIf(!CONFIGURED)("public demo seed", () => {
  it(
    APPLY ? "applies the seed to the demo tenant" : "resolves the seed plan without writing",
    async () => {
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
        owner = createClient<Database>(url, anonKey, { auth: { persistSession: false } });
        const { error: signInError } = await owner.auth.signInWithPassword({
          email: process.env.DEMO_OWNER_EMAIL!,
          password: process.env.DEMO_OWNER_PASSWORD!,
        });
        expect(signInError, `owner sign-in failed: ${signInError?.message}`).toBeNull();
      }

      const lines: string[] = [];
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

      mkdirSync("test-results", { recursive: true });
      writeFileSync(
        "test-results/demo-seed-report.txt",
        [...lines, "", JSON.stringify(report, null, 2)].join("\n"),
        "utf8",
      );

      if (owner) await owner.auth.signOut();

      expect(report.failure ?? null, report.failure ?? "").toBeNull();
      expect(report.ok).toBe(true);
    },
    300_000,
  );
});
