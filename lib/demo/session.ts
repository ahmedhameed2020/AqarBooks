import "server-only";
import { createClient } from "@/lib/supabase/server";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { isPlatformAdmin } from "@/lib/auth/session";
import { demoEnv, demoEntryAvailable, isDemoOrganization } from "@/lib/demo/config";

/**
 * Starting a public demo session.
 *
 * WHY A REAL ACCOUNT AND NOT AN ANONYMOUS SESSION
 * The Phase 1 security work revoked EXECUTE on every function in `public` from
 * the `anon` role, and the baseline's security postamble asserts that anon
 * holds zero function privileges before it will complete. An anonymous
 * Supabase session therefore cannot call a single application RPC. Making the
 * demo work anonymously would mean granting anon back the execute rights that
 * hardening deliberately removed -- weakening production authorization to
 * serve a marketing surface. So the demo signs in as a real, pre-provisioned,
 * permission-starved account instead.
 *
 * WHY THE CREDENTIALS ARE SAFE HERE
 * They are read from server-only environment variables inside a Server Action
 * and handed straight to Supabase. They are never returned, never placed in a
 * prop, and never reach the HTML. The visitor receives only the session
 * cookies Supabase issues -- the same artefact any signed-in user holds.
 *
 * WHY EACH VISITOR STILL GETS THEIR OWN SESSION
 * Every entry performs its own sign-in, so every visitor holds a distinct
 * refresh token and a distinct cookie jar against the same user. Filters,
 * drawers, walkthrough progress and AI conversation state are per-cookie and
 * therefore per-visitor, even though the underlying dataset is shared.
 */

export type DemoStartResult =
  | { ok: true }
  | { ok: false; error: "demo_unavailable" | "demo_signin_failed" | "demo_misconfigured" };

export async function startDemoSession(): Promise<DemoStartResult> {
  if (!demoEntryAvailable()) {
    // Unconfigured is the default and the safe state. Refuse rather than
    // attempt a sign-in whose result we would be unable to guard afterwards.
    return { ok: false, error: "demo_unavailable" };
  }

  const supabase = await createClient();

  const { data, error } = await supabase.auth.signInWithPassword({
    email: demoEnv.userEmail!,
    password: demoEnv.userPassword!,
  });

  if (error || !data.user) {
    // Deliberately not echoed. A failure here is an operational problem with
    // our own credentials, and the message would describe our auth setup to
    // an anonymous visitor.
    console.error("[demo] sign-in failed:", error?.message);
    return { ok: false, error: "demo_signin_failed" };
  }

  // ---------------------------------------------------------------------
  // Entry assertions. These run AFTER sign-in because they are questions
  // about the session that now exists, and they are the reason a
  // misconfigured deployment fails closed rather than exposing a real tenant
  // through the public demo door.
  // ---------------------------------------------------------------------

  const organization = await getPrimaryOrganization(data.user.id);

  // 1. The account must resolve to the designated demo organization. If
  //    DEMO_USER_EMAIL were ever pointed at a customer account -- by a typo in
  //    a secret, or by the demo user being added to another org -- this is what
  //    stops the public entry point from opening that tenant's books.
  if (!isDemoOrganization(organization?.id)) {
    await supabase.auth.signOut();
    console.error(
      "[demo] refusing entry: demo account does not resolve to DEMO_ORGANIZATION_ID",
    );
    return { ok: false, error: "demo_misconfigured" };
  }

  // 2. The account must not be a platform admin. has_permission() short-
  //    circuits to true for platform admins, which would hand every write
  //    permission in the product to an anonymous visitor and defeat layer 3
  //    entirely. This is the single most dangerous misconfiguration possible
  //    for this feature, so it is checked explicitly rather than assumed from
  //    how the account was provisioned.
  if (await isPlatformAdmin(data.user.id)) {
    await supabase.auth.signOut();
    console.error("[demo] refusing entry: demo account is a platform admin");
    return { ok: false, error: "demo_misconfigured" };
  }

  return { ok: true };
}

/** Ends the demo session and clears its cookies. */
export async function endDemoSession(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
}
