import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { createClient } from "@/lib/supabase/server";
import { PortalShell } from "./portal-shell";

export default async function PortalMemberLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/portal/login");
  }

  const { data: member } = await supabase
    .from("members")
    .select("id, full_name, organization_id")
    .eq("user_id", user!.id)
    .maybeSingle();

  if (!member) {
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
    if (resolvedMemberId) {
      redirect("/portal/login?reason=org_suspended");
    }
    redirect("/portal/login");
  }

  const loc = (await getLocale()) as "ar" | "en";

  return (
    <PortalShell locale={loc} memberName={member.full_name}>
      {children}
    </PortalShell>
  );
}
