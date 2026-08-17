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
  | { ok: true; actionLink: string; memberEmail: string; memberPhone: string | null }
  | { ok: false; error: string };

const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

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
    email: data.member_email,
    options: { redirectTo },
  });

  if (linkError || !linkData) {
    console.error("[createMemberInvitationAction] generateLink failed:", linkError?.message);
    return { ok: false, error: linkError?.message ?? "link_generation_failed" };
  }

  return {
    ok: true,
    actionLink: linkData.properties.action_link,
    memberEmail: data.member_email,
    memberPhone: data.member_phone,
  };
}
