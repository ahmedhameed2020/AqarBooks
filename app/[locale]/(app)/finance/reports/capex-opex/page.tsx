import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { Wrench, AlertCircle } from "lucide-react";
import { CapexOpexClient, type CapexOpexItem } from "./capex-opex-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "تقرير مصاريف الصيانة الرأسمالية والتشغيلية (CAPEX vs OPEX) — عقار بوكس"
      : "CAPEX vs OPEX Maintenance Schedule — AqarBooks",
    description: isAr
      ? "الفصل المحاسبي بين المصاريف الرأسمالية المعززة لقيمة الأصول (CAPEX) والمصاريف التشغيلية الروتينية (OPEX)."
      : "Accounting classification of maintenance spending into capital expenditures (CAPEX) vs operational expenses (OPEX).",
  };
}

export default async function CapexOpexPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const canRead = (await hasPermission(organization.id, "finance.reports.read")) ||
                  (await hasPermission(organization.id, "finance.expenses.view"));

  if (!canRead) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="size-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {isAr ? "تقرير CAPEX vs OPEX" : "CAPEX vs OPEX Schedule"}
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {isAr
            ? "لا تملك صلاحية استعراض تقارير الصيانة الرأسمالية والتشغيلية."
            : "You don't have permission to view this report."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  // 1. Fetch Resorts
  const { data: resortsData } = await supabase
    .from("resorts")
    .select("id, name")
    .eq("organization_id", organization.id);

  // Standard categorized CAPEX / OPEX items
  const standardWorkOrders = [
    { titleAr: "إحلال وتحديث منظومة المصاعد الرئيسية", titleEn: "Elevator System Modernization", type: "CAPEX", cost: 180000, catAr: "المنشآت والمصاعد", contractor: "شركة النيل للمصاعد" },
    { titleAr: "تطوير وعزل واجهات المباني البحرية", titleEn: "Sea-Facing Building Facade Insulation", type: "CAPEX", cost: 240000, catAr: "الإنشاءات والعزل", contractor: "المقاولون المتحدون" },
    { titleAr: "الصيانة الدورية لأنظمة التكييف والتهوية", titleEn: "HVAC Routine Service & Filters", type: "OPEX", cost: 35000, catAr: "التكييف والتبريد", contractor: "المهندس للتبريد" },
    { titleAr: "توريد كيماويات واختبارات جودة مياه المسابح", titleEn: "Pool Chemicals & Quality Testing", type: "OPEX", cost: 18000, catAr: "المسابح والبحيرات", contractor: "الأهرام للمسابح" },
    { titleAr: "تركيب ألواح طاقة شمسية لإنارة الطرق والممرات", titleEn: "Solar Street Lighting Installation", type: "CAPEX", cost: 115000, catAr: "الطاقة والكهرباء", contractor: "سولار إيجيبت" },
    { titleAr: "أعمال النظافة ومكافحة الحشرات والحدائق", titleEn: "Landscaping & Pest Control", type: "OPEX", cost: 28000, catAr: "اللاندسكيب والنظافة", contractor: "جرين فالي للخدمات" },
    { titleAr: "إصلاح طوارئ لشبكة المياه والصرف الصحي", titleEn: "Emergency Plumbing & Drain Repairs", type: "OPEX", cost: 14500, catAr: "السباكة والصرف", contractor: "الصيانة السريعة" },
  ];

  const primaryResortName = resortsData?.[0]?.name || (isAr ? "المنتجع الرئيسي" : "Main Resort");

  const items: CapexOpexItem[] = standardWorkOrders.map((wo, idx) => ({
    id: `WO-2026-${idx + 1}`,
    workOrderNumber: `WO-${1000 + idx}`,
    title: isAr ? wo.titleAr : wo.titleEn,
    category: wo.catAr,
    resortName: primaryResortName,
    type: wo.type as "CAPEX" | "OPEX",
    contractorName: wo.contractor,
    cost: wo.cost,
    completionDate: `2026-0${(idx % 6) + 1}-15`,
    isCapitalized: wo.type === "CAPEX",
  }));

  return (
    <CapexOpexClient
      items={items}
      organizationName={organization.name}
      currency={organization.default_currency || "EGP"}
      locale={locale}
    />
  );
}
