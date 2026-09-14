import { setRequestLocale } from "next-intl/server";
import { redirect } from "next/navigation";
import { Wrench } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { createClient } from "@/lib/supabase/server";
import { getPortalMemberContext } from "@/lib/auth/portal-member";
import type { Locale } from "@/i18n/routing";
import { EmptyState, PortalPageHeader } from "../../portal-ui";
import { NewMaintenanceRequestForm } from "./new-maintenance-request-form";

export default async function NewPortalMaintenancePage({
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
  const [{ data: ownerships }, { data: categories }] = await Promise.all([
    supabase
      .from("unit_ownerships")
      .select("unit_id, start_date, end_date")
      .eq("member_id", ctx.member.id),
    supabase
      .from("maintenance_categories")
      .select("id, name_ar, name_en, default_priority")
      .eq("is_active", true)
      .order("sort_order"),
  ]);

  const today = new Date().toISOString().slice(0, 10);
  const unitIds = [
    ...new Set(
      (ownerships ?? [])
        .filter((o) => (!o.start_date || o.start_date <= today) && (!o.end_date || o.end_date >= today))
        .map((o) => o.unit_id),
    ),
  ];
  const { data: units } = unitIds.length
    ? await supabase.from("units").select("id, code").in("id", unitIds).order("code")
    : { data: [] };

  const unitOptions = (units ?? []).map((u) => ({ id: u.id, label: u.code }));
  const categoryOptions = (categories ?? []).map((c) => ({
    id: c.id,
    label: isAr ? c.name_ar : c.name_en,
    defaultPriority: c.default_priority,
  }));

  return (
    <div className="space-y-6 pb-12">
      <PortalPageHeader
        title={isAr ? "طلب صيانة جديد" : "New Maintenance Request"}
        description={
          isAr
            ? "اختر الوحدة واكتب وصفًا واضحًا للمشكلة. سيتم إرسال الطلب لفريق إدارة العقار."
            : "Choose the unit and describe the issue clearly. The property team will receive it for triage."
        }
      >
        <Link href="/portal/maintenance" locale={locale as Locale} className={buttonVariants({ variant: "outline", size: "sm", className: "h-9 rounded-xl text-xs font-semibold" })}>
          {isAr ? "رجوع للطلبات" : "Back to Requests"}
        </Link>
      </PortalPageHeader>

      {unitOptions.length === 0 || categoryOptions.length === 0 ? (
        <EmptyState
          icon={<Wrench className="size-5" />}
          title={isAr ? "لا يمكن إنشاء طلب الآن" : "Request creation is unavailable"}
          description={
            unitOptions.length === 0
              ? isAr
                ? "لا توجد وحدة حالية مرتبطة بحسابك."
                : "No current unit is linked to your portal account."
              : isAr
              ? "لم يتم تفعيل تصنيفات الصيانة لهذه المنشأة بعد."
              : "Maintenance categories have not been enabled for this organization yet."
          }
        />
      ) : (
        <NewMaintenanceRequestForm
          units={unitOptions}
          categories={categoryOptions}
          locale={locale as "ar" | "en"}
        />
      )}
    </div>
  );
}
