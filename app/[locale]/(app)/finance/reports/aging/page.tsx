import { setRequestLocale } from "next-intl/server";
import { getCurrentUser } from "@/lib/auth/session";
import { getPrimaryOrganization } from "@/lib/auth/org-context";
import { hasPermission } from "@/lib/auth/authorize";
import { createClient } from "@/lib/supabase/server";
import type { Locale } from "@/i18n/routing";
import { Clock, AlertCircle } from "lucide-react";
import {
  AGING_ELIGIBLE_STATUSES,
  computeAgingRows,
  totalsByBucket,
} from "@/lib/finance/aging";
import { AgingClient, type AgingReportRow } from "./aging-client";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;
  const isAr = locale === "ar";
  return {
    title: isAr
      ? "تقرير أعمار الديون والتحصيل — عقار بوكس"
      : "Receivables Aging Report — AqarBooks",
    description: isAr
      ? "تحليل الذمم المدينة وتصنيف فترات الاستحقاق المتأخرة حسب الوحدات مع التصدير الرسمي للـ PDF والإكسل."
      : "Analysis of aged receivables and delinquency periods with PDF/Excel export.",
  };
}

export default async function AgingPage({
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

  const canReadDues = await hasPermission(organization.id, "finance.dues.read");
  if (!canReadDues) {
    return (
      <div className="p-8 text-center space-y-3">
        <div className="size-12 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/50 flex items-center justify-center text-amber-600">
          <AlertCircle className="size-6" />
        </div>
        <h1 className="text-lg font-bold text-slate-900 dark:text-white">
          {isAr ? "أعمار الديون والذمم المدينة" : "Receivables Aging"}
        </h1>
        <p className="text-xs text-slate-500 max-w-sm mx-auto">
          {isAr
            ? "لا تملك صلاحية عرض هذا التقرير."
            : "You don't have permission to view this report."}
        </p>
      </div>
    );
  }

  const supabase = await createClient();
  const [{ data: dues }, { data: allocations }, { data: postedPayments }, { data: units }] = await Promise.all([
    supabase
      .from("dues")
      .select("id, unit_id, amount, due_date, status")
      .eq("organization_id", organization.id)
      .in("status", [...AGING_ELIGIBLE_STATUSES]),
    supabase.from("payment_allocations").select("due_id, amount, payment_id"),
    supabase.from("payments").select("id").eq("organization_id", organization.id).eq("status", "POSTED"),
    supabase.from("units").select("id, code").eq("organization_id", organization.id),
  ]);

  const postedIds = new Set((postedPayments ?? []).map((p) => p.id));
  const unitCodeById = new Map((units ?? []).map((u) => [u.id, u.code]));
  const rows = computeAgingRows(dues ?? [], allocations ?? [], postedIds).map((r) => ({
    ...r,
    unitCode: unitCodeById.get(r.unit_id) ?? r.unit_id,
  })) as AgingReportRow[];

  const totalsMap = totalsByBucket(rows);
  const totalsRecord: Record<string, number> = {};
  totalsMap.forEach((v, k) => {
    totalsRecord[k] = v;
  });

  const grandTotal = rows.reduce((s, r) => s + r.remaining, 0);

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          PAGE HEADER
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="flex size-10 items-center justify-center rounded-xl bg-rose-600/10 text-rose-600 dark:bg-rose-500/20 dark:text-rose-400">
              <Clock className="size-5" />
            </div>
            <div>
              <h1 className="text-xl font-black tracking-tight text-slate-950 dark:text-white">
                {isAr ? "تقرير أعمار الديون والتحصيل" : "Receivables Aging Report"}
              </h1>
              <p className="text-xs text-slate-500 font-medium mt-0.5">
                {isAr
                  ? "تحليل الذمم المدينة وتصنيف فترات الاستحقاق المتأخرة حسب الوحدات مع التصدير الرسمي للـ PDF والإكسل."
                  : "Analysis of aged receivables and delinquency periods across units with PDF/Excel export."}
              </p>
            </div>
          </div>
        </div>
      </div>

      <AgingClient
        rows={rows}
        totals={totalsRecord}
        grandTotal={grandTotal}
        organizationName={organization.name}
        taxNumber={organization.tax_id}
        currency={organization.default_currency || "EGP"}
        locale={locale}
      />
    </div>
  );
}
