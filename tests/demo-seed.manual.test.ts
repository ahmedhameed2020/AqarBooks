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
import { createClient } from "@supabase/supabase-js";
import { config as loadEnv } from "dotenv";
import type { Database } from "../lib/supabase/types";
import { seedDemoTenant } from "../scripts/demo/seed-demo-tenant";
import { DEMO_STORY } from "../lib/demo/story";

loadEnv({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const APPLY = process.env.DEMO_SEED_APPLY === "1";

const CONFIGURED = Boolean(
  url &&
    serviceKey &&
    process.env.DEMO_ORGANIZATION_ID &&
    process.env.DEMO_OWNER_EMAIL &&
    process.env.DEMO_OWNER_PASSWORD &&
    process.env.DEMO_USER_EMAIL,
);

describe.skipIf(!CONFIGURED)("public demo seed", () => {
  it(
    APPLY ? "applies the seed to the demo tenant" : "resolves the seed plan without writing",
    async () => {
      const admin = createClient<Database>(url, serviceKey, {
        auth: { persistSession: false },
      });

      // The financial postings run under a genuinely authenticated owner
      // session, never the service role: the RPCs authorise via
      // has_permission(auth.uid(), ...), which is null for the service role,
      // and — more importantly — a seed that bypassed the accounting guards
      // would produce data the product itself could not have produced.
      const owner = createClient<Database>(url, anonKey, {
        auth: { persistSession: false },
      });
      const { data: ownerSession, error: signInError } = await owner.auth.signInWithPassword({
        email: process.env.DEMO_OWNER_EMAIL!,
        password: process.env.DEMO_OWNER_PASSWORD!,
      });
      expect(signInError, `owner sign-in failed: ${signInError?.message}`).toBeNull();

      // Resolved rather than configured: one less secret to keep in sync, and
      // a typo in DEMO_USER_EMAIL surfaces here instead of inside the guard.
      const { data: users } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
      const demoUser = users?.users.find((u) => u.email === process.env.DEMO_USER_EMAIL);
      expect(demoUser, `no auth user found for DEMO_USER_EMAIL`).toBeTruthy();

      const lines: string[] = [];
      const report = await seedDemoTenant({
        admin,
        owner,
        ownerUserId: ownerSession!.user!.id,
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

      await owner.auth.signOut();

      expect(report.failure ?? null, report.failure ?? "").toBeNull();
      expect(report.ok).toBe(true);
    },
    300_000,
  );
});
