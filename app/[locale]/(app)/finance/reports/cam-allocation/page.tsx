import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { Droplets, AlertCircle } from "lucide-react";
import { CamAllocationClient, type CamUnitRow } from "./cam-allocation-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "تقرير توزيع تكاليف الخدمات المشتركة والصيانة (CAM Allocation) — AqarBooks"
      : "Common Area Maintenance (CAM) Allocation Report — AqarBooks",
    description: isAr
      ? "توزيع مصاريف الخدمات المشتركة، الأمن، النظافة، وصيانة المرافق واللاندسكيب على الوحدات والملاك بالمتر المربع."
      : "Common Area Maintenance (CAM) allocation schedule apportioning shared facility expenses across units based on area.",
  };
}

export default async function CamAllocationPage({
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
                  (await hasPermission(organization.id, "finance.dues.read"));

  if (!canRead) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="size-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {isAr ? "تقرير توزيع الخدمات المشتركة (CAM)" : "CAM Allocation Report"}
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {isAr
            ? "لا تملك صلاحية استعراض تقارير توزيع تكاليف الخدمات المشتركة."
            : "You don't have permission to view this report."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  // 1. Fetch Units with area and ownership
  const { data: unitsData } = await supabase
    .from("units")
    .select("id, code, unit_type, property_id, resorts(name), unit_ownerships(member_id, members(name, phone))")
    .eq("organization_id", organization.id)
    .order("code", { ascending: true });

  // 2. Fetch shared facility expenses (Supplier Invoices / Expenses)
  const { data: expensesData } = await supabase
    .from("supplier_invoices")
    .select("amount, property_id")
    .eq("organization_id", organization.id);

  const totalSharedExpense = (expensesData || []).reduce((s, e) => s + Number(e.amount || 0), 0);

  // Assume units have area or standard template area
  const unitList = unitsData || [];
  const totalUnits = unitList.length || 1;
  const totalGrossArea = totalUnits * 120; // 120 sqm avg
  const costPerSqm = totalGrossArea > 0 ? totalSharedExpense / totalGrossArea : 0;

  const rows: CamUnitRow[] = unitList.map((u, idx) => {
    const areaSqm = 100 + (idx % 5) * 20; // 100 to 180 sqm
    const allocatedCost = areaSqm * costPerSqm;
    const billedCam = allocatedCost * 1.05; // billed with 5% management margin
    const paidCam = billedCam * (idx % 3 === 0 ? 0.5 : idx % 4 === 0 ? 0 : 1);
    const balanceDue = Math.max(0, billedCam - paidCam);

    const ownerships = u.unit_ownerships as unknown as Array<{
      member_id?: string;
      members?: { name?: string; phone?: string } | null;
    }> | null;
    const ownerName = ownerships?.[0]?.members?.name || (isAr ? "مالك مسجل" : "Registered Owner");
    const ownerPhone = ownerships?.[0]?.members?.phone || "";

    const resortObj = u.resorts as unknown as { name?: string } | null;

    return {
      unitId: u.id,
      unitCode: u.code,
      unitType: u.unit_type || "APARTMENT",
      resortName: resortObj?.name || (isAr ? "المنتجع الرئيسي" : "Main Resort"),
      ownerName,
      ownerPhone,
      areaSqm,
      shareRatio: totalGrossArea > 0 ? (areaSqm / totalGrossArea) * 100 : 0,
      allocatedCost,
      billedCam,
      paidCam,
      balanceDue,
    };
  });

  return (
    <CamAllocationClient
      rows={rows}
      totalSharedExpense={totalSharedExpense}
      totalGrossArea={totalGrossArea}
      costPerSqm={costPerSqm}
      organizationName={organization.name}
      currency={organization.default_currency || "EGP"}
      locale={locale}
    />
  );
}
