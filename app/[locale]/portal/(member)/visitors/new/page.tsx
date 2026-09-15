import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { TicketCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import type { Locale } from "@/i18n/routing";
import { EmptyState, PortalPageHeader } from "../../portal-ui";
import { NewVisitorInvitationForm } from "./new-visitor-invitation-form";

export default async function NewPortalVisitorPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const ctx = await getPortalMemberContext();
  if (ctx.status !== "ok") redirect("/portal/login");

  const supabase = await createClient();
  const { data: ownerships } = await supabase
    .from("unit_ownerships")
    .select("unit_id, start_date, end_date")
    .eq("member_id", ctx.member.id);

  const today = new Date().toISOString().slice(0, 10);
  const unitIds = [
    ...new Set(
      (ownerships ?? [])
        .filter((item) => (!item.start_date || item.start_date <= today) && (!item.end_date || item.end_date >= today))
        .map((item) => item.unit_id),
    ),
  ];

  const { data: units } = unitIds.length
    ? await supabase.from("units").select("id, code, property_id").in("id", unitIds).order("code")
    : { data: [] };

  const propertyIds = [...new Set((units ?? []).map((unit) => unit.property_id))];
  const { data: properties } = propertyIds.length
    ? await supabase.from("properties").select("id, name").in("id", propertyIds)
    : { data: [] };
  const propertyById = new Map((properties ?? []).map((property) => [property.id, property.name]));

  const unitOptions = (units ?? []).map((unit) => ({
    id: unit.id,
    label: unit.code,
    propertyName: propertyById.get(unit.property_id) ?? "—",
  }));

  return (
    <div className="space-y-6 pb-12">
      <PortalPageHeader
        title={isAr ? "دعوة زائر" : "Invite Guest"}
        description={
          isAr
            ? "أنشئ تصريح QR آمن للزائر. لا يحتوي الرمز على بيانات الوحدة أو العضو أو الزائر."
            : "Create a secure QR pass for a guest. The QR does not contain unit, member, or guest data."
        }
      >
        <Link href="/portal/visitors" locale={locale as Locale} className={buttonVariants({ variant: "outline", size: "sm", className: "h-9 rounded-xl text-xs font-semibold" })}>
          {isAr ? "رجوع للتصاريح" : "Back to Passes"}
        </Link>
      </PortalPageHeader>

      {unitOptions.length === 0 ? (
        <EmptyState
          icon={<TicketCheck className="size-5" />}
          title={isAr ? "لا يمكن إنشاء تصريح الآن" : "Pass creation is unavailable"}
          description={isAr ? "لا توجد وحدة حالية مرتبطة بحسابك." : "No current unit is linked to your portal account."}
        />
      ) : (
        <NewVisitorInvitationForm units={unitOptions} locale={locale as "ar" | "en"} />
      )}
    </div>
  );
}
