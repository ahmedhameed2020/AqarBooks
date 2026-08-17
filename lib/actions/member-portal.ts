"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/session";

const createInvitationSchema = z.object({
  memberId: z.string().uuid(),
  locale: z.enum(["ar", "en"]),
});

export type CreateInvitationResult =
  | { ok: true; shortLink: string; memberEmail: string | null; memberPhone: string | null; isSyntheticEmail: boolean }
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
    .single();

  if (error || !data) {
    console.error("[createMemberInvitationAction] create_member_invitation failed:", error?.message);
    return { ok: false, error: error?.message ?? "invitation_failed" };
  }

  const redirectTo =
    `${SITE_URL}/${parsed.data.locale}/portal/accept-invite` +
    `?invitation=${data.invitation_id}&t=${data.raw_token}`;
  const { data: linkData, error: linkError } = await adminClient.auth.admin.generateLink({
    type: "invite",
    email: data.invite_email,
    options: { redirectTo },
  });

  if (linkError || !linkData) {
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
    memberEmail: data.member_email,
    memberPhone: data.member_phone,
    isSyntheticEmail: data.is_synthetic_email,
  };
}
