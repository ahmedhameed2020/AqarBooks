"use client";

import {
  Building2,
  FileSpreadsheet,
  Building,
  CreditCard,
  FileText,
  CheckCircle2,
  AlertTriangle,
  ArrowUpRight,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Button, buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/money";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";
import { unitTypeLabel, type UnitType } from "@/lib/units/unit-type-labels";

export interface PortalUnitItem {
  id: string;
  code: string;
  unit_type: UnitType;
  custom_type_label: string | null;
  building_name_ar?: string | null;
  building_name_en?: string | null;
  zone_name_ar?: string | null;
  zone_name_en?: string | null;
  balance: number;
  has_arrears: boolean;
}

export function PortalUnitsClient({
  organizationName,
  currency,
  memberName,
  units,
  locale,
}: {
  organizationName: string;
  currency: string;
  memberName: string;
  units: PortalUnitItem[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const totalUnits = units.length;
  const totalArrears = units.reduce(
    (sum, u) => sum + (u.balance > 0 ? Number(u.balance) : 0),
    0
  );

  async function handleExportExcel() {
    const columns = [
      { header: isAr ? "كود الوحدة" : "Unit Code", key: "code", width: 14 },
      { header: isAr ? "نوع الوحدة" : "Type", key: "typeLabel", width: 18 },
      { header: isAr ? "المبنى / العقار" : "Building", key: "building", width: 22 },
      { header: isAr ? "المنطقة / القطاع" : "Zone", key: "zone", width: 20 },
      { header: isAr ? "الموقف المالي" : "Status", key: "status", width: 16 },
      { header: isAr ? `رصيد المستحقات (${currency})` : `Balance (${currency})`, key: "balance", width: 18, isNumber: true },
    ];

    const rows = units.map((u) => ({
      code: u.code,
      typeLabel: unitTypeLabel(u, isAr),
      building: (isAr ? u.building_name_ar : u.building_name_en) || "—",
      zone: (isAr ? u.zone_name_ar : u.zone_name_en) || "—",
      status: u.balance > 0 ? (isAr ? "مستحقات قائمة" : "Arrears") : (isAr ? "مسوى" : "Settled"),
      balance: Number(u.balance),
    }));

    await exportFinancialStatementToExcel(
      {
        filename: `AqarBooks_Properties_${memberName.replace(/\s+/g, "_")}`,
        title: isAr ? `سجل عقارات ووحدات المالك: ${memberName}` : `Real Estate Portfolio: ${memberName}`,
        organizationName: organizationName || "AqarBooks",
        currencyLabel: currency,
        columns,
        rows,
        summaries: [
          { label: isAr ? "عدد العقارات والوحدات" : "Total Units", value: totalUnits },
          { label: isAr ? "إجمالي المتأخرات القائمة" : "Total Arrears", value: `${totalArrears.toLocaleString()} ${currency}` },
        ],
      },
      locale
    );
  }

  return (
    <div className="space-y-6">
      {/* Header & Export Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
            {isAr ? "العقارات والوحدات المملوكة" : "My Real Estate Portfolio"}
          </h1>
          <p className="text-xs sm:text-sm text-slate-500">
            {isAr
              ? "بيانات الوحدات المسجلة باسمك، نسب الملكية، والموقف المالي لكل وحدة."
              : "Overview of your registered units, property specs, and individual balance status."}
          </p>
        </div>

        {units.length > 0 && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleExportExcel}
            className="gap-2 font-bold text-xs h-10 px-4 rounded-xl border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-950/40"
          >
            <FileSpreadsheet className="size-4 text-emerald-500" />
            <span>{isAr ? "تصدير المحفظة Excel" : "Export Excel"}</span>
          </Button>
        )}
      </div>

      {/* Portfolio Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {units.length ? (
          units.map((u) => {
            const hasDue = u.balance > 0;
            return (
              <div
                key={u.id}
                className="flex flex-col justify-between p-5 rounded-3xl border border-border/70 bg-card shadow-xs hover:border-indigo-500/40 transition-all space-y-4"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="size-11 rounded-2xl bg-indigo-50 dark:bg-indigo-950/60 border border-indigo-200/60 dark:border-indigo-800 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-mono font-black text-sm shadow-2xs">
                        {u.code.slice(0, 3)}
                      </div>
                      <div>
                        <h2 className="font-mono font-black text-lg text-slate-900 dark:text-white">
                          {u.code}
                        </h2>
                        <p className="text-xs text-slate-500 font-medium">
                          {unitTypeLabel(u, isAr)}
                        </p>
                      </div>
                    </div>

                    <Badge
                      variant="outline"
                      className={`text-[10px] font-bold py-0.5 px-2.5 rounded-full ${
                        hasDue
                          ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/30"
                          : "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/30"
                      }`}
                    >
                      {hasDue ? (isAr ? "مستحقات قائمة" : "Arrears") : (isAr ? "رصيد منضبط" : "Settled")}
                    </Badge>
                  </div>

                  {/* Building & Zone info */}
                  <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-border/40 space-y-0.5">
                      <span className="text-[10px] text-slate-400 block">{isAr ? "المبنى / العقار" : "Building"}</span>
                      <span className="font-bold text-slate-800 dark:text-slate-200 truncate block">
                        {(isAr ? u.building_name_ar : u.building_name_en) || (isAr ? "الكيان الرئيسي" : "Main")}
                      </span>
                    </div>

                    <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900/50 border border-border/40 space-y-0.5">
                      <span className="text-[10px] text-slate-400 block">{isAr ? "الرصيد المالي" : "Balance"}</span>
                      <span className="font-bold tabular-nums block">
                        <Money amount={Number(u.balance)} locale={locale} tone={hasDue ? "negative" : "positive"} />
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Action Buttons */}
                <div className="flex items-center gap-2 pt-2 border-t border-border/50">
                  {hasDue ? (
                    <Link
                      href={`/portal/dues`}
                      locale={locale}
                      className={buttonVariants({
                        size: "sm",
                        className:
                          "flex-1 h-9 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs gap-1.5 shadow-2xs",
                      })}
                    >
                      <CreditCard className="size-3.5" />
                      <span>{isAr ? "سداد مستحقات الوحدة" : "Pay Dues"}</span>
                    </Link>
                  ) : (
                    <div className="flex-1 flex items-center gap-1.5 text-xs text-emerald-600 dark:text-emerald-400 font-semibold py-1">
                      <CheckCircle2 className="size-4" />
                      <span>{isAr ? "الحساب مسوى بالكامل" : "Fully Settled"}</span>
                    </div>
                  )}

                  <Link
                    href={`/portal/statement`}
                    locale={locale}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className: "h-9 rounded-xl text-xs font-semibold gap-1",
                    })}
                  >
                    <FileText className="size-3.5 text-indigo-500" />
                    <span>{isAr ? "كشف الحساب" : "Statement"}</span>
                  </Link>
                </div>
              </div>
            );
          })
        ) : (
          <div className="col-span-2 p-12 text-center rounded-3xl border border-dashed border-border/70 bg-card space-y-3">
            <Building2 className="size-10 text-slate-400 mx-auto opacity-30" />
            <p className="font-bold text-base text-slate-900 dark:text-white">
              {isAr ? "لا توجد وحدات عقارية مسجلة" : "No registered properties"}
            </p>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              {isAr
                ? "لم يتم تسجيل أي وحدات أو عقارات باسمك في المنظومة حتى الآن."
                : "No units have been linked to your account yet."}
            </p>
          </div>
        )}
      </div>
    </div>
  );
}
