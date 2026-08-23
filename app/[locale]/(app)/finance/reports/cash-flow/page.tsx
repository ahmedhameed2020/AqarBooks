import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { Wallet, AlertCircle } from "lucide-react";
import { CashFlowClient, type CashFlowItem } from "./cash-flow-client";
import { denyIfMissingPermission } from "@/lib/auth/page-guard";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "قائمة التدفقات النقدية — عقار بوكس"
      : "Cash Flow Statement — AqarBooks",
    description: isAr
      ? "بيان حركة السيولة والتدفقات النقدية التشغيلية والاستثمارية والتمويلية مع التصدير الرسمي للـ PDF والإكسل."
      : "Statement of cash flows from operating, investing, and financing activities with PDF/Excel export.",
  };
}

function previousDay(date: string) {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

export default async function CashFlowPage({
  params,
  searchParams,
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const { locale } = await params;
  const { start, end } = await searchParams;
  setRequestLocale(locale as Locale);
  const isAr = locale === "ar";

  const user = await getCurrentUser();
  const organization = user ? await getPrimaryOrganization(user.id) : null;
  if (!organization) return null;

  const denied = await denyIfMissingPermission(organization.id, "finance.reports.read", locale);
  if (denied) return denied;

  const supabase = await createClient();

  let startDate = start;
  let endDate = end;
  if (!startDate || !endDate) {
    const { data: openPeriod } = await supabase
      .from("fiscal_periods")
      .select("start_date, end_date")
      .eq("organization_id", organization.id)
      .eq("status", "OPEN")
      .order("start_date", { ascending: true })
      .limit(1)
      .maybeSingle();
    startDate = startDate || openPeriod?.start_date || "1900-01-01";
    endDate = endDate || openPeriod?.end_date || new Date().toISOString().slice(0, 10);
  }

  const [{ data: rowsData, error }, { data: openingCash }, { data: closingCash }] = await Promise.all([
    supabase.rpc("get_cash_flow_statement", {
      p_organization_id: organization.id,
      p_start_date: startDate,
      p_end_date: endDate,
    }),
    supabase.rpc("get_cash_position", {
      p_organization_id: organization.id,
      p_as_of_date: previousDay(startDate),
    }),
    supabase.rpc("get_cash_position", {
      p_organization_id: organization.id,
      p_as_of_date: endDate,
    }),
  ]);

  if (error) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="size-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {isAr ? "قائمة التدفقات النقدية" : "Cash Flow Statement"}
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {isAr
            ? "غير مصرح لك بالاطلاع على التقارير المالية. تواصل مع مدير النظام لمنحك صلاحية «قراءة التقارير المالية»."
            : "You do not have permission to view financial reports. Contact your admin."}
        </p>
      </div>
    );
  }

  const rows = (rowsData ?? []) as unknown as CashFlowItem[];

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-amber-600/10 text-amber-600 dark:bg-amber-500/20 dark:text-amber-400">
              <Wallet className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
                {isAr ? "قائمة التدفقات النقدية" : "Cash Flow Statement"}
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isAr
                  ? `بيان حركة السيولة والأنشطة التشغيلية والاستثمارية للفترة من ${startDate} إلى ${endDate}`
                  : `Operational, investing, and financing cash flow movements from ${startDate} to ${endDate}`}
              </p>
            </div>
          </div>
        </div>
      </div>

      <CashFlowClient
        rows={rows}
        openingCash={Number(openingCash ?? 0)}
        closingCash={Number(closingCash ?? 0)}
        startDate={startDate}
        endDate={endDate}
        organizationName={organization.name}
        taxNumber={organization.tax_id}
        currency={organization.default_currency || "EGP"}
        locale={locale}
      />
    </div>
  );
}
