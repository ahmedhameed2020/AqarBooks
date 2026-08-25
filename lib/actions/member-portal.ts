"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/session";
import { denyIfDemo } from "@/lib/demo/guard";

const createInvitationSchema = z.object({
  memberId: z.string().uuid(),
  locale: z.enum(["ar", "en"]),
});

export type CreateInvitationResult =
  | {
      ok: true;
      shortLink: string;
      /**
       * The six-digit second factor. Returned to staff exactly once, here --
       * only its salted digest is stored, so it cannot be read back later. It
       * is deliberately NOT embedded in the invite message: the link and the
       * code have to travel separately or the second factor buys nothing.
       */
      accessCode: string;
      memberEmail: string | null;
      memberPhone: string | null;
      isSyntheticEmail: boolean;
    }
  | { ok: false; error: string };

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

// Web Crypto (not node:crypto/Buffer) on purpose -- this runs in the
// Cloudflare Workers runtime in production, and crypto.getRandomValues/btoa
// are both available there and in Node without needing nodejs_compat.
function generateShortSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(9));
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export async function createMemberInvitationAction(
  memberId: string,
  locale: string,
): Promise<CreateInvitationResult> {
  // Refused inside the public demo before anything is touched.
  const demoRefusal = await denyIfDemo();
  if (demoRefusal) return demoRefusal;

  const parsed = createInvitationSchema.safeParse({ memberId, locale });
  if (!parsed.success) return { ok: false, error: "invalid_input" };

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const supabase = await createClient();
  const adminClient = createAdminClient();

  // Lazy sweep: expire anything stale before minting a new invitation, so a
  // long-abandoned pending row never blocks (or confusingly coexists with)
  // a fresh one. This is a global, unscoped sweep across every tenant, so
  // (checkpoint 2 hardening) it's restricted at the DB level to
  // service_role -- called here via the admin client rather than the
  // regular per-request client.
  const { error: sweepError } = await adminClient.rpc("expire_stale_member_invitations");
  if (sweepError) {
    console.error("[createMemberInvitationAction] expire_stale_member_invitations failed:", sweepError.message);
  }

  const { data, error } = await supabase
    .rpc("create_member_invitation", { p_member_id: parsed.data.memberId })
    .single<{
      invitation_id: string;
      raw_token: string;
      raw_code: string;
      invite_email: string;
      member_email: string | null;
      member_phone: string | null;
      is_synthetic_email: boolean;
    }>();

  if (error || !data) {
    console.error("[createMemberInvitationAction] create_member_invitation failed:", error?.message);
    return { ok: false, error: error?.message ?? "invitation_failed" };
  }

  const redirectTo =
    `${SITE_URL}/${parsed.data.locale}/portal/accept-invite` +
    `?invitation=${data.invitation_id}&t=${data.raw_token}`;
  let { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "invite",
    email: data.invite_email,
    options: { redirectTo },
  });

  // "invite" only works for a brand-new email -- it fails outright if an
  // auth.users row with that email already exists for ANY reason (staff
  // testing with their own login email, a leftover partial signup, a
  // synthetic placeholder reused after a revoked invite, etc.). That
  // existing account is still a valid identity to authenticate through,
  // so retry as a magic link instead of failing the whole invite: same
  // hash-token session-establishing mechanism client-side, and
  // accept_member_invitation's own email-match check still applies
  // regardless of which link type got them there.
  if (linkError?.message?.includes("already been registered")) {
    ({ data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
      type: "magiclink",
      email: data.invite_email,
      options: { redirectTo },
    }));
  }

  if (linkError || !linkData || !linkData.properties) {
    console.error("[createMemberInvitationAction] generateLink failed:", linkError?.message);
    return { ok: false, error: linkError?.message ?? "link_generation_failed" };
  }

  // The real action_link is ~250+ chars (signed verify token + our own
  // URL-encoded redirectTo) -- reads as spam over WhatsApp/email. Store it
  // behind a short opaque slug instead; app/i/[slug]/route.ts does the 302.
  // Matches the invitation's own 72h window rather than tracking it
  // separately.
  const slug = generateShortSlug();
  const expiresAt = new Date(Date.now() + 72 * 60 * 60 * 1000).toISOString();
  const { error: shortLinkError } = await adminClient.from("member_invitation_short_links").insert({
    slug,
    invitation_id: data.invitation_id,
    action_link: linkData.properties.action_link,
    expires_at: expiresAt,
  });

  if (shortLinkError) {
    console.error("[createMemberInvitationAction] short link insert failed:", shortLinkError.message);
    return { ok: false, error: shortLinkError.message };
  }

  return {
    ok: true,
    shortLink: `${SITE_URL}/i/${slug}`,
    accessCode: data.raw_code,
    memberEmail: data.member_email,
    memberPhone: data.member_phone,
    isSyntheticEmail: data.is_synthetic_email,
  };
}

/* ------------------------------------------------------------------ status */

export type MemberPortalStatus =
  | { ok: false; error: string }
  | {
      ok: true;
      /** The owner has a live portal account: members.user_id is set. */
      linked: boolean;
      /** ISO date access was granted, when an accepted invitation records it. */
      linkedSince: string | null;
      /** An invitation that is still usable right now. */
      pendingInvitationExpiresAt: string | null;
      /**
       * False when the member has no deliverable address and is reachable only
       * through a staff-sent link. Such an owner cannot recover access from the
       * sign-in page on their own.
       */
      hasDeliverableEmail: boolean;
      memberEmail: string | null;
      memberPhone: string | null;
    };

/**
 * What the invite dialog needs in order to offer the right action instead of
 * offering "invite" to an owner who already has an account and then reporting
 * MEMBER_ALREADY_LINKED as an error. An impossible action should never be
 * presented in the first place.
 *
 * member_invitations has RLS enabled with no policies at all, so it is
 * unreadable by a normal session client. Authorization is therefore explicit
 * here: the member row is read through the caller's own session (proving org
 * membership via members_select_member), the caller's members.portal.invite
 * permission is checked, and only then is the admin client used -- for the
 * invitation row of that one already-authorized member.
 */
export async function getMemberPortalStatusAction(memberId: string): Promise<MemberPortalStatus> {
  if (!z.string().uuid().safeParse(memberId).success) return { ok: false, error: "invalid_input" };

  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "unauthenticated" };

  const supabase = await createClient();

  const { data: member, error: memberError } = await supabase
    .from("members")
    .select("id, organization_id, email, phone, user_id")
    .eq("id", memberId)
    .maybeSingle();

  if (memberError) {
    console.error("[getMemberPortalStatusAction] member query failed:", memberError.message);
    return { ok: false, error: "query_failed" };
  }
  if (!member) return { ok: false, error: "not_found" };

  const { data: permitted, error: permError } = await supabase.rpc("has_permission", {
    p_user_id: user.id,
    p_organization_id: member.organization_id,
    p_permission_key: "members.portal.invite",
  });
  if (permError) {
    console.error("[getMemberPortalStatusAction] permission check failed:", permError.message);
    return { ok: false, error: "query_failed" };
  }
  if (!permitted) return { ok: false, error: "forbidden" };

  const adminClient = createAdminClient();
  const { data: invitations } = await adminClient
    .from("member_invitations")
    .select("status, expires_at, accepted_at")
    .eq("member_id", memberId)
    .order("created_at", { ascending: false })
    .limit(10);

  const rows = invitations ?? [];
  const pending = rows.find((r) => r.status === "pending" && new Date(r.expires_at) > new Date());
  const accepted = rows.find((r) => r.status === "accepted");

  const email = member.email?.trim() || null;

  return {
    ok: true,
    linked: member.user_id !== null,
    linkedSince: accepted?.accepted_at ?? null,
    pendingInvitationExpiresAt: pending?.expires_at ?? null,
    hasDeliverableEmail: Boolean(email),
    memberEmail: email,
    memberPhone: member.phone?.trim() || null,
  };
}
