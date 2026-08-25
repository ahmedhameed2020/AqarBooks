import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/supabase/types";
import { DEMO_STORY } from "../../lib/demo/story";

/**
 * The seed's refusal to run anywhere except the designated demo tenant.
 *
 * WHY THERE ARE FOUR CHECKS AND NOT ONE
 * Spec §25 asks for hard safety checks and says explicitly not to rely on an
 * environment variable's name. The reason is concrete: this repository has
 * already had test fixtures reach production and leave 1,954 organizations
 * behind. A seed that writes 156 units, hundreds of dues and a month of
 * journal entries into the wrong tenant would be far worse than that, and
 * because it posts through the real accounting RPCs, much of it would be
 * immutable once written.
 *
 * So the target must satisfy every one of these, and any single failure aborts
 * before a row is touched:
 *
 *   1. DEMO_ORGANIZATION_ID is set, and is the id being targeted.
 *   2. That organization's slug equals the expected demo slug.
 *   3. Its name equals the demo organization's name.
 *   4. It contains no membership belonging to anyone but the demo accounts --
 *      i.e. it is not a tenant with real people in it.
 *
 * Checks 2 and 3 exist because check 1 alone protects only against the wrong
 * id being passed, not against the right variable holding a customer's id.
 * Check 4 is the one that would catch a genuinely malicious or careless
 * re-pointing of the variable, because it asks a question about the DATA
 * rather than about configuration.
 */

export type GuardOk = {
  ok: true;
  organizationId: string;
  organizationName: string;
  slug: string;
};

export type GuardFailure = { ok: false; reason: string };

export type SeedGuardResult = GuardOk | GuardFailure;

export type GuardInput = {
  admin: SupabaseClient<Database>;
  /** The id the caller intends to seed. */
  organizationId: string | null | undefined;
  /** Value of DEMO_ORGANIZATION_ID. */
  configuredDemoOrganizationId: string | null | undefined;
  /** Value of DEMO_ORGANIZATION_SLUG, defaulted by the caller. */
  expectedSlug: string;
  /**
   * User ids the seed itself provisions (the owner that runs it and the
   * read-only account it exposes). Memberships belonging to anyone else make
   * the target a real tenant.
   */
  allowedUserIds: string[];
};

export async function assertSafeDemoTarget(input: GuardInput): Promise<SeedGuardResult> {
  const { admin, organizationId, configuredDemoOrganizationId, expectedSlug, allowedUserIds } =
    input;

  // 1. Configured, and the same as what we were asked to seed.
  if (!configuredDemoOrganizationId) {
    return {
      ok: false,
      reason:
        "DEMO_ORGANIZATION_ID is not set. The seed refuses to choose a target on its own.",
    };
  }
  if (!organizationId) {
    return { ok: false, reason: "No target organization id was supplied." };
  }
  if (organizationId !== configuredDemoOrganizationId) {
    return {
      ok: false,
      reason:
        "Target organization is not DEMO_ORGANIZATION_ID. The seed may only run against the designated demo tenant.",
    };
  }

  const { data: org, error } = await admin
    .from("organizations")
    .select("id, name, slug")
    .eq("id", organizationId)
    .maybeSingle();

  if (error) {
    return { ok: false, reason: `Could not read the target organization: ${error.message}` };
  }
  if (!org) {
    return { ok: false, reason: "The target organization does not exist." };
  }

  // 2 and 3. The row must look like the demo tenant, not merely be pointed at
  // by the variable.
  if (org.slug !== expectedSlug) {
    return {
      ok: false,
      reason: `Target slug is "${org.slug}", expected "${expectedSlug}". Refusing: DEMO_ORGANIZATION_ID may be pointing at a real tenant.`,
    };
  }
  if (org.name !== DEMO_STORY.organization.nameEn) {
    return {
      ok: false,
      reason: `Target name is "${org.name}", expected "${DEMO_STORY.organization.nameEn}". Refusing for the same reason.`,
    };
  }

  // 4. The question about the data, not the configuration.
  const { data: memberships, error: mErr } = await admin
    .from("organization_memberships")
    .select("user_id")
    .eq("organization_id", organizationId);

  if (mErr) {
    return { ok: false, reason: `Could not read memberships: ${mErr.message}` };
  }

  const allowed = new Set(allowedUserIds);
  const strangers = (memberships ?? []).filter((m) => !allowed.has(m.user_id));
  if (strangers.length > 0) {
    return {
      ok: false,
      reason: `Target has ${strangers.length} membership(s) outside the demo accounts. This is a populated tenant, not the demo. Refusing.`,
    };
  }

  return { ok: true, organizationId, organizationName: org.name, slug: org.slug };
}
