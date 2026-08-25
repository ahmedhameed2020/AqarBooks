import "server-only";
import { z } from "zod";

/**
 * Public demo environment configuration.
 *
 * WHY THIS IS ENV AND NOT A COLUMN
 * Marking the demo tenant with a database flag would mean a migration, and
 * ADR 0004 still prohibits `supabase db push` while the successor ADR is
 * unsigned. It would also put the safety marker inside the very database the
 * demo session can read. An environment variable keeps the marker outside the
 * blast radius: a demo session cannot see it, cannot set it, and cannot make
 * a different organization look like the demo one.
 *
 * The identifier is a UUID rather than a slug because a slug is user-editable
 * through `tenant.settings.manage` in a normal tenant. `organizations.id` is
 * not editable by anyone.
 *
 * WHAT THE ABSENCE OF CONFIG MEANS
 * Unconfigured is the safe state, and it is the default. With no
 * DEMO_ORGANIZATION_ID set, `isDemoOrganization()` returns false for every
 * organization -- so the write guards are inert and no real tenant is ever
 * mistaken for the demo -- and `demoEntryAvailable()` returns false, so the
 * public entry point refuses to start a session rather than signing someone
 * into whatever account the other variables happen to name.
 */

const demoEnvSchema = z.object({
  // The one canonical marker. Everything else in this module is downstream of it.
  DEMO_ORGANIZATION_ID: z.string().uuid().nullable().catch(null),
  // Credentials for the pre-provisioned demo account. Server-only: these are
  // read in a server action and handed straight to Supabase. They are never
  // serialised into a payload, a prop, or the HTML.
  DEMO_USER_EMAIL: z.string().email().nullable().catch(null),
  DEMO_USER_PASSWORD: z.string().min(1).nullable().catch(null),
  // Second safeguard for the seed script only -- never consulted at request
  // time. See scripts/demo/seed-demo-tenant.ts.
  DEMO_ORGANIZATION_SLUG: z.string().min(2).default("aqarbooks-demo"),
});

export type DemoEnv = z.infer<typeof demoEnvSchema>;

let cached: DemoEnv | null = null;

// Resolved lazily for the same reason lib/env/server.ts is: on Cloudflare
// Workers, secrets are only attached to process.env once a request is in
// flight. Reading at module-evaluation time would capture nulls permanently
// and silently disable the demo in production.
function resolve(): DemoEnv {
  if (cached) return cached;

  const parsed = demoEnvSchema.parse({
    DEMO_ORGANIZATION_ID: process.env.DEMO_ORGANIZATION_ID || null,
    DEMO_USER_EMAIL: process.env.DEMO_USER_EMAIL || null,
    DEMO_USER_PASSWORD: process.env.DEMO_USER_PASSWORD || null,
    DEMO_ORGANIZATION_SLUG: process.env.DEMO_ORGANIZATION_SLUG || undefined,
  });

  // Only cache once the marker is present. A null may simply mean the binding
  // has not been attached yet on this invocation.
  if (parsed.DEMO_ORGANIZATION_ID) cached = parsed;
  return parsed;
}

export const demoEnv = {
  get organizationId() {
    return resolve().DEMO_ORGANIZATION_ID;
  },
  get userEmail() {
    return resolve().DEMO_USER_EMAIL;
  },
  get userPassword() {
    return resolve().DEMO_USER_PASSWORD;
  },
  get organizationSlug() {
    return resolve().DEMO_ORGANIZATION_SLUG;
  },
};

/**
 * True when this organization is the public demo tenant.
 *
 * The caller must pass an organization id it resolved SERVER-SIDE from the
 * session (via getPrimaryOrganization). Passing an id that came from the
 * browser would let a visitor decide whether they are in demo mode, which is
 * the exact inversion this function exists to prevent.
 */
export function isDemoOrganization(organizationId: string | null | undefined): boolean {
  const demoId = demoEnv.organizationId;
  if (!demoId || !organizationId) return false;
  return organizationId === demoId;
}

/**
 * True when the public entry point can actually start a session. Requires all
 * three secrets: without the marker the guards cannot recognise the tenant
 * afterwards, and signing someone in without being able to guard them is worse
 * than not letting them in at all.
 */
export function demoEntryAvailable(): boolean {
  return Boolean(demoEnv.organizationId && demoEnv.userEmail && demoEnv.userPassword);
}
