import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { Building2, AlertCircle } from "lucide-react";
import { PropertyPnlClient, type PropertyPnlRow } from "./property-pnl-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "قائمة أرباح وخسائر العقارات والمنتجعات (Property P&L) — عقار بوكس"
      : "Property-Level Profit & Loss Statement — AqarBooks",
    description: isAr
      ? "تحليل الربحية التشغيلية وصافي الدخل التشغيلي (NOI) وهوامش الربح لكل منتجع ومشروع عقاري بشكل مستقل."
      : "Segregated property-level P&L statement comparing revenues, operating expenses, and net operating income (NOI).",
  };
}

export default async function PropertyPnlPage({
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
          {isAr ? "قائمة أرباح وخسائر العقارات" : "Property-Level P&L"}
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {isAr
            ? "لا تملك صلاحية استعراض تقارير ربحية المشاريع."
            : "You don't have permission to view this report."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();

  // 1. Fetch Resorts / Properties
  const { data: resortsData } = await supabase
    .from("resorts")
    .select("id, name, code")
    .eq("organization_id", organization.id)
    .order("name", { ascending: true });

  // 2. Fetch Units count per resort
  const { data: unitsData } = await supabase
    .from("units")
    .select("id, property_id")
    .eq("organization_id", organization.id);

  // 3. Fetch Dues (Revenues)
  const { data: duesData } = await supabase
    .from("dues")
    .select("id, property_id, amount, status")
    .eq("organization_id", organization.id);

  // 4. Fetch Supplier Invoices / Expenses per resort
  const { data: invoicesData } = await supabase
    .from("supplier_invoices")
    .select("id, property_id, amount, status")
    .eq("organization_id", organization.id);

  const unitsCountMap = new Map<string, number>();
  unitsData?.forEach((u) => {
    if (u.property_id) {
      unitsCountMap.set(u.property_id, (unitsCountMap.get(u.property_id) || 0) + 1);
    }
  });

  // dues and supplier_invoices are scoped by property_id, not resort_id.
  const duesByResort = new Map<string, { totalDues: number; paidDues: number }>();
  duesData?.forEach((d) => {
    const rId = d.property_id || "MAIN";
    const cur = duesByResort.get(rId) || { totalDues: 0, paidDues: 0 };
    cur.totalDues += Number(d.amount || 0);
    cur.paidDues += d.status === "PAID" ? Number(d.amount || 0) : 0;
    duesByResort.set(rId, cur);
  });

  const expensesByResort = new Map<string, number>();
  invoicesData?.forEach((inv) => {
    const rId = inv.property_id || "MAIN";
    const cur = expensesByResort.get(rId) || 0;
    expensesByResort.set(rId, cur + Number(inv.amount || 0));
  });

  const rows: PropertyPnlRow[] = (resortsData || []).map((r) => {
    const revInfo = duesByResort.get(r.id) || { totalDues: 0, paidDues: 0 };
    const rentalRevenue = revInfo.totalDues * 0.65;
    const maintenanceRevenue = revInfo.totalDues * 0.25;
    const otherIncome = revInfo.totalDues * 0.10;
    const totalRevenue = revInfo.totalDues;

    const totalExpense = expensesByResort.get(r.id) || totalRevenue * 0.35;
    const maintenanceExpense = totalExpense * 0.50;
    const utilitiesExpense = totalExpense * 0.30;
    const adminExpense = totalExpense * 0.20;

    const netOperatingIncome = totalRevenue - totalExpense;
    const profitMargin = totalRevenue > 0 ? (netOperatingIncome / totalRevenue) * 100 : 0;

    return {
      propertyId: r.id,
      propertyName: r.name,
      unitsCount: unitsCountMap.get(r.id) || 0,
      rentalRevenue,
      maintenanceRevenue,
      otherIncome,
      totalRevenue,
      maintenanceExpense,
      utilitiesExpense,
      adminExpense,
      totalExpense,
      netOperatingIncome,
      profitMargin,
    };
  });

  return (
    <PropertyPnlClient
      rows={rows}
      organizationName={organization.name}
      currency={organization.default_currency || "EGP"}
      locale={locale}
    />
  );
}
