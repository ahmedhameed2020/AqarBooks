import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { CarFront } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import type { Locale } from "@/i18n/routing";
import { EmptyState, PortalPageHeader } from "../../portal-ui";
import { NewVehicleForm } from "./new-vehicle-form";

export default async function NewPortalVehiclePage({
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
        .filter((ownership) => (!ownership.start_date || ownership.start_date <= today) && (!ownership.end_date || ownership.end_date >= today))
        .map((ownership) => ownership.unit_id),
    ),
  ];
  const { data: units } = unitIds.length
    ? await supabase.from("units").select("id, code").in("id", unitIds).order("code")
    : { data: [] };

  const unitOptions = (units ?? []).map((unit) => ({ id: unit.id, label: unit.code }));

  return (
    <div className="space-y-6 pb-12">
      <PortalPageHeader
        title={isAr ? "إضافة مركبة" : "Add Vehicle"}
        description={
          isAr
            ? "أدخل بيانات اللوحة والمركبة للوحدة الحالية. سيتم التحقق من الصلاحية على الخادم."
            : "Enter plate and vehicle details for a current unit. Authorization is verified on the server."
        }
      >
        <Link href="/portal/vehicles" locale={locale as Locale} className={buttonVariants({ variant: "outline", size: "sm", className: "h-9 rounded-xl text-xs font-semibold" })}>
          {isAr ? "رجوع للمركبات" : "Back to Vehicles"}
        </Link>
      </PortalPageHeader>

      {unitOptions.length === 0 ? (
        <EmptyState
          icon={<CarFront className="size-5" />}
          title={isAr ? "لا توجد وحدة حالية" : "No current unit"}
          description={
            isAr
              ? "لا توجد وحدة حالية مرتبطة بحسابك يمكن إضافة مركبة عليها."
              : "No current unit is linked to your account for vehicle registration."
          }
        />
      ) : (
        <NewVehicleForm units={unitOptions} locale={locale as "ar" | "en"} />
      )}
    </div>
  );
}
