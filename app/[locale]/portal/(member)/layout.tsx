import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import { createClient } from "@/lib/supabase/server";
import { PortalShell } from "./portal-shell";
import { Toaster } from "@/components/ui/toast";

export default async function PortalMemberLayout({ children }: { children: React.ReactNode }) {
  const ctx = await getPortalMemberContext();

  if (ctx.status === "unauthenticated") {
    redirect("/portal/login");
  }

  if (ctx.status === "org_suspended") {
    redirect("/portal/login?reason=org_suspended");
  }

  // Authenticated, but this account is not an owner in any organization.
  // Redirecting with no reason produced a silent loop: sign in, bounce back to
  // the email box, with nothing on screen explaining it.
  if (ctx.status === "not_a_member") {
    redirect("/portal/login?reason=not_a_member");
  }

  const { member } = ctx;

  const supabase = await createClient();
  const { data: orgDisplay } = await supabase.rpc("get_own_organization_display").maybeSingle();

  const loc = (await getLocale()) as "ar" | "en";

  return (
    <Toaster>
      <PortalShell
        locale={loc}
        memberName={member.full_name}
        organizationName={orgDisplay?.name ?? "AqarBooks"}
      >
        {children}
      </PortalShell>
    </Toaster>
  );
}
