import { redirect } from "next/navigation";
import { getLocale } from "next-intl/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
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

  if (ctx.status === "not_a_member") {
    redirect("/portal/login");
  }

  const { member } = ctx;

  const loc = (await getLocale()) as "ar" | "en";

  return (
    <Toaster>
      <PortalShell locale={loc} memberName={member.full_name}>
        {children}
      </PortalShell>
    </Toaster>
  );
}
