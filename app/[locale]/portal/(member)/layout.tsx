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
    // Session exists (e.g. a staff account, or an invite whose linking RPC
    // never completed) but no members row points at it -- inert by design,
    // see the spec's "compensating policy" note.
    redirect("/portal/login");
  }

  const loc = (await getLocale()) as "ar" | "en";

  return (
    <PortalShell locale={loc} memberName={member.full_name}>
      {children}
    </PortalShell>
  );
}
