import "server-only";
import { cache } from "react";
import { createClient } from "@/lib/supabase/server";

export type PortalMemberContext =
  | { status: "unauthenticated" }
  | { status: "not_a_member" }
  | { status: "org_suspended" }
  | { status: "ok"; member: { id: string; full_name: string; organization_id: string } };

export const getPortalMemberContext = cache(async (): Promise<PortalMemberContext> => {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return { status: "unauthenticated" };

  const { data: member } = await supabase
    .from("members")
    .select("id, full_name, organization_id")
    .eq("user_id", user.id)
    .maybeSingle();

  if (member) return { status: "ok", member };

  // Session exists but no members row was visible through
  // members_select_self. This now has two distinct causes (checkpoint 2
  // hardening added an organization_is_active check to that policy):
  //   1. genuinely no members row for this user (staff account, or an
  //      invite whose linking RPC never completed) -- current_member_id()
  //      (SECURITY DEFINER, bypasses RLS) also returns NULL.
  //   2. a real member row exists but its org is SUSPENDED/ARCHIVED --
  //      current_member_id() still resolves it (it only checks
  //      members.user_id = auth.uid()), even though the RLS-gated select
  //      above returned nothing.
  // We distinguish them so a suspended/archived owner isn't misattributed
  // as "not a member".
  const { data: resolvedMemberId } = await supabase.rpc("current_member_id");
  if (resolvedMemberId) return { status: "org_suspended" };

  return { status: "not_a_member" };
});
