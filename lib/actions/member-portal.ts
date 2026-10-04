"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { getCurrentUser } from "@/lib/auth/session";

// The invitation-creating action that used to live here is gone on purpose. It
// returned a working sign-in link (and the second-factor code) to the staff
// member's browser, so staff could sign in as the invited email address and
// "verify" an address they did not own. Owner access is now issued through
// lib/actions/member-portal-access.ts, where the activation link is emailed to
// the owner and never shown to staff.

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
