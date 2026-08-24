"use client";

import { useMemo, useState } from "react";
import {
  Building2,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  FileText,
  Layers,
  Ruler,
  Star,
  Wallet,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/money";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";
import { generatePortalReportPdf } from "@/lib/reports/portal-report-pdf";
import { formatAmount } from "@/lib/portal/portal-finance";
import { unitTypeLabel, type UnitType } from "@/lib/units/unit-type-labels";
import {
  EmptyState,
  ExportButtons,
  PortalPageHeader,
  SearchBox,
  Segmented,
  StatCard,
} from "../portal-ui";

export interface PortalUnitItem {
  id: string;
  code: string;
  unit_type: UnitType;
  custom_type_label: string | null;
  building_name_ar: string | null;
  building_name_en: string | null;
  zone_name_ar: string | null;
  zone_name_en: string | null;
  area: number | null;
  floor_number: number | null;
  totalDue: number;
  totalPaid: number;
  balance: number;
  sharePercentage: number | null;
  isPrimaryContact: boolean;
  ownedSince: string | null;
}

export interface PortalPlanItem {
  id: string;
  unitCode: string | null;
  status: string;
  totalPrice: number;
  downPayment: number | null;
  installmentCount: number;
  installmentFrequency: string;
  startsOn: string;
}

type StatusFilter = "ALL" | "ARREARS" | "SETTLED";

const FREQUENCY_LABELS: Record<string, { ar: string; en: string }> = {
  MONTHLY: { ar: "شهري", en: "Monthly" },
  QUARTERLY: { ar: "ربع سنوي", en: "Quarterly" },
  SEMI_ANNUAL: { ar: "نصف سنوي", en: "Semi-annual" },
  ANNUAL: { ar: "سنوي", en: "Annual" },
};

const PLAN_STATUS_LABELS: Record<string, { ar: string; en: string }> = {
  ACTIVE: { ar: "ساري", en: "Active" },
  COMPLETED: { ar: "مكتمل", en: "Completed" },
  CANCELLED: { ar: "ملغي", en: "Cancelled" },
};

export function PortalUnitsClient({
  organizationName,
  currency,
  memberName,
  units,
  plans,
  locale,
}: {
  organizationName: string;
  currency: string;
  memberName: string;
  units: PortalUnitItem[];
  plans: PortalPlanItem[];
  locale: string;
}) {
  const isAr = locale === "ar";
  const [status, setStatus] = useState<StatusFilter>("ALL");
  const [query, setQuery] = useState("");

  const totalArrears = units.reduce((s, u) => s + (u.balance > 0 ? u.balance : 0), 0);
  const totalPaid = units.reduce((s, u) => s + u.totalPaid, 0);
  const totalArea = units.reduce((s, u) => s + (u.area ?? 0), 0);

  const buildingOf = (u: PortalUnitItem) =>
    (isAr ? u.building_name_ar : u.building_name_en) || (isAr ? "الكيان الرئيسي" : "Main entity");
  const zoneOf = (u: PortalUnitItem) => (isAr ? u.zone_name_ar : u.zone_name_en) || "—";

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return units.filter((u) => {
      if (status === "ARREARS" && u.balance <= 0) return false;
      if (status === "SETTLED" && u.balance > 0) return false;
      if (!q) return true;
      return (
        u.code.toLowerCase().includes(q) ||
        unitTypeLabel(u, isAr).toLowerCase().includes(q) ||
        buildingOf(u).toLowerCase().includes(q) ||
        zoneOf(u).toLowerCase().includes(q)
      );
    });
  }, [units, status, query, isAr]);

  const reportRows = visible.map((u) => ({
    code: u.code,
    typeLabel: unitTypeLabel(u, isAr),
    building: buildingOf(u),
    zone: zoneOf(u),
    area: u.area ?? null,
    floor: u.floor_number ?? "—",
    share: u.sharePercentage === null ? "—" : `${u.sharePercentage}%`,
    ownedSince: u.ownedSince ?? "—",
    totalDue: u.totalDue,
    totalPaid: u.totalPaid,
    balance: u.balance,
  }));

  async function handleExportExcel() {
    await exportFinancialStatementToExcel(
      {
        filename: `AqarBooks_Portfolio_${memberName.replace(/\s+/g, "_") || "Owner"}`,
        title: isAr ? `المحفظة العقارية: ${memberName}` : `Real Estate Portfolio: ${memberName}`,
        organizationName,
        currencyLabel: currency,
        columns: [
          { header: isAr ? "كود الوحدة" : "Unit code", key: "code", width: 14 },
          { header: isAr ? "النوع" : "Type", key: "typeLabel", width: 16 },
          { header: isAr ? "المبنى" : "Building", key: "building", width: 22 },
          { header: isAr ? "المنطقة" : "Zone", key: "zone", width: 18 },
          { header: isAr ? "المساحة (م٢)" : "Area (m²)", key: "area", width: 14, isNumber: true },
          { header: isAr ? "الدور" : "Floor", key: "floor", width: 10 },
          { header: isAr ? "نسبة الملكية" : "Ownership share", key: "share", width: 16 },
          { header: isAr ? "مالك منذ" : "Owned since", key: "ownedSince", width: 14 },
          {
            header: isAr ? `إجمالي المطالبات (${currency})` : `Total charged (${currency})`,
            key: "totalDue",
            width: 18,
            isNumber: true,
          },
          {
            header: isAr ? `إجمالي المسدد (${currency})` : `Total paid (${currency})`,
            key: "totalPaid",
            width: 18,
            isNumber: true,
          },
          {
            header: isAr ? `الرصيد (${currency})` : `Balance (${currency})`,
            key: "balance",
            width: 16,
            isNumber: true,
          },
        ],
        rows: reportRows,
        summaries: [
          { label: isAr ? "عدد الوحدات" : "Units", value: visible.length },
          {
            label: isAr ? "إجمالي المتأخرات" : "Total arrears",
            value: `${formatAmount(totalArrears, locale)} ${currency}`,
          },
          {
            label: isAr ? "إجمالي المساحات (م٢)" : "Total area (m²)",
            value: formatAmount(totalArea, locale),
          },
        ],
      },
      locale,
    );
  }

  function handleExportPdf() {
    generatePortalReportPdf(
      {
        organizationName,
        documentTitle: isAr ? "بيان المحفظة العقارية" : "Real Estate Portfolio Schedule",
        documentSubtitle: isAr
          ? "الوحدات المسجلة باسمك وبياناتها الفنية وموقفها المالي"
          : "Units registered in your name, their specifications, and their financial position",
        accountName: memberName,
        currency,
        periodLabel: isAr ? "الموقف حتى تاريخه" : "Position as of today",
        infoRows: [
          { label: isAr ? "عدد الوحدات" : "Units", value: String(visible.length) },
          {
            label: isAr ? "إجمالي المساحات" : "Total area",
            value: totalArea > 0 ? `${formatAmount(totalArea, locale)} m²` : "—",
          },
        ],
        kpis: [
          {
            label: isAr ? "إجمالي المطالبات" : "Total charged",
            value: formatAmount(
              visible.reduce((s, u) => s + u.totalDue, 0),
              locale,
            ),
          },
          {
            label: isAr ? "إجمالي المسدد" : "Total paid",
            value: formatAmount(
              visible.reduce((s, u) => s + u.totalPaid, 0),
              locale,
            ),
            tone: "settled",
          },
          {
            label: isAr ? "المتأخرات القائمة" : "Outstanding arrears",
            value: formatAmount(totalArrears, locale),
            tone: totalArrears > 0 ? "owing" : "settled",
            emphasis: true,
          },
        ],
        columns: [
          { header: isAr ? "الوحدة" : "Unit", key: "code", strong: true },
          { header: isAr ? "النوع" : "Type", key: "typeLabel" },
          { header: isAr ? "المبنى" : "Building", key: "building" },
          { header: isAr ? "المساحة" : "Area", key: "area", numeric: true },
          { header: isAr ? "الملكية" : "Share", key: "share", numeric: true },
          { header: isAr ? "المطالبات" : "Charged", key: "totalDue", numeric: true },
          { header: isAr ? "المسدد" : "Paid", key: "totalPaid", numeric: true },
          { header: isAr ? "الرصيد" : "Balance", key: "balance", numeric: true, strong: true },
        ],
        rows: reportRows.map((r) => ({
          ...r,
          area: r.area === null ? "—" : formatAmount(r.area, locale),
          totalDue: formatAmount(r.totalDue, locale),
          totalPaid: formatAmount(r.totalPaid, locale),
          balance: formatAmount(r.balance, locale),
        })),
        totalRow: {
          code: isAr ? "الإجمالي" : "Total",
          totalDue: formatAmount(
            visible.reduce((s, u) => s + u.totalDue, 0),
            locale,
          ),
          totalPaid: formatAmount(
            visible.reduce((s, u) => s + u.totalPaid, 0),
            locale,
          ),
          balance: formatAmount(
            visible.reduce((s, u) => s + u.balance, 0),
            locale,
          ),
        },
        emptyMessage: isAr ? "لا توجد وحدات مسجلة باسمك." : "No units registered in your name.",
      },
      locale,
    );
  }

  return (
    <div className="space-y-6">
      <PortalPageHeader
        title={isAr ? "الوحدات والعقارات" : "Units & Properties"}
        description={
          isAr
            ? "الوحدات المسجلة باسمك، بياناتها الفنية ونسب ملكيتك فيها، والموقف المالي لكل وحدة على حدة."
            : "Units registered in your name, their specifications and your ownership share in each, with the financial position of every unit."
        }
      >
        <ExportButtons
          locale={locale}
          disabled={units.length === 0}
          onExcel={handleExportExcel}
          onPdf={handleExportPdf}
          pdfLabel={isAr ? "طباعة بيان المحفظة" : "Print portfolio"}
        />
      </PortalPageHeader>

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatCard
          label={isAr ? "عدد الوحدات" : "Units owned"}
          icon={<Building2 className="size-4 text-indigo-500" />}
          value={
            <>
              {units.length}{" "}
              <span className="text-xs font-semibold text-slate-400">
                {isAr ? "وحدة" : units.length === 1 ? "unit" : "units"}
              </span>
            </>
          }
          hint={isAr ? "مسجلة ومُوثّقة بالنظام" : "Registered in the system"}
        />
        <StatCard
          label={isAr ? "إجمالي المساحات" : "Total area"}
          icon={<Ruler className="size-4 text-slate-400" />}
          value={
            totalArea > 0 ? (
              <>
                {formatAmount(totalArea, locale)}{" "}
                <span className="text-xs font-semibold text-slate-400">m²</span>
              </>
            ) : (
              "—"
            )
          }
          hint={isAr ? "مجموع مساحات وحداتك" : "Combined area of your units"}
        />
        <StatCard
          label={isAr ? "إجمالي المسدد" : "Total paid"}
          icon={<CheckCircle2 className="size-4 text-emerald-500" />}
          value={<Money amount={totalPaid} locale={locale} tone="positive" />}
          hint={isAr ? "على كل الوحدات" : "Across all units"}
        />
        <StatCard
          label={isAr ? "المتأخرات القائمة" : "Outstanding arrears"}
          icon={<Wallet className="size-4 text-rose-500" />}
          tone={totalArrears > 0 ? "negative" : "positive"}
          value={
            <Money
              amount={totalArrears}
              locale={locale}
              tone={totalArrears > 0 ? "negative" : "positive"}
            />
          }
          hint={
            totalArrears > 0
              ? isAr
                ? "مستحقة السداد على وحداتك"
                : "Due on your units"
              : isAr
                ? "كل الوحدات مسوّاة"
                : "Every unit is settled"
          }
        />
      </div>

      {units.length > 0 ? (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Segmented<StatusFilter>
            ariaLabel={isAr ? "تصفية حسب الموقف المالي" : "Filter by financial status"}
            value={status}
            onChange={setStatus}
            options={[
              { value: "ALL", label: isAr ? "كل الوحدات" : "All units", count: units.length },
              {
                value: "ARREARS",
                label: isAr ? "عليها مستحقات" : "With arrears",
                tone: "negative",
                count: units.filter((u) => u.balance > 0).length,
              },
              {
                value: "SETTLED",
                label: isAr ? "مسوّاة" : "Settled",
                tone: "positive",
                count: units.filter((u) => u.balance <= 0).length,
              },
            ]}
          />
          <SearchBox
            locale={locale}
            value={query}
            onChange={setQuery}
            placeholder={isAr ? "ابحث بالكود أو النوع أو المبنى" : "Search code, type, or building"}
          />
        </div>
      ) : null}

      {visible.length === 0 ? (
        <EmptyState
          icon={<Building2 className="size-5" />}
          title={
            units.length === 0
              ? isAr
                ? "لا توجد وحدات مسجلة باسمك"
                : "No units registered in your name"
              : isAr
                ? "لا توجد وحدات مطابقة"
                : "No matching units"
          }
          description={
            units.length === 0
              ? isAr
                ? "لم يتم ربط أي وحدة عقارية بحسابك بعد. إذا كنت تعتقد أن هذا غير صحيح، يرجى التواصل مع إدارة الكيان لمراجعة بيانات الملكية."
                : "No unit has been linked to your account yet. If you believe this is incorrect, contact management to review your ownership records."
              : isAr
                ? "لا توجد وحدات تطابق الفلتر أو كلمة البحث الحالية."
                : "No units match the current filter or search term."
          }
        />
      ) : (
        <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
          {visible.map((u) => {
            const hasDue = u.balance > 0;
            return (
              <article
                key={u.id}
                className="flex flex-col justify-between gap-4 rounded-2xl border border-border/70 bg-card p-5 transition-colors hover:border-indigo-500/40"
              >
                <div className="space-y-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex min-w-0 items-center gap-3">
                      <div className="flex size-11 shrink-0 items-center justify-center rounded-xl border border-indigo-200/60 bg-indigo-50 font-mono text-sm font-bold text-indigo-600 dark:border-indigo-800 dark:bg-indigo-950/60 dark:text-indigo-400">
                        {u.code.slice(0, 3)}
                      </div>
                      <div className="min-w-0">
                        <h2 className="truncate font-mono text-lg font-bold text-slate-900 dark:text-white">
                          {u.code}
                        </h2>
                        <p className="truncate text-xs font-medium text-slate-500">
                          {unitTypeLabel(u, isAr)} · {buildingOf(u)}
                        </p>
                      </div>
                    </div>

                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <Badge
                        variant="outline"
                        className={`rounded-full px-2.5 py-0.5 text-[10px] font-semibold ${
                          hasDue
                            ? "border-rose-500/30 bg-rose-500/10 text-rose-600 dark:text-rose-400"
                            : "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                        }`}
                      >
                        {hasDue ? (isAr ? "عليها مستحقات" : "Arrears") : isAr ? "مسوّاة" : "Settled"}
                      </Badge>
                      {u.isPrimaryContact ? (
                        <span className="flex items-center gap-1 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
                          <Star className="size-3 fill-current" />
                          {isAr ? "جهة الاتصال الأساسية" : "Primary contact"}
                        </span>
                      ) : null}
                    </div>
                  </div>

                  {/* Specification strip: the facts an owner checks against
                      their contract before they trust the money below it. */}
                  <dl className="grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
                    <div className="rounded-xl border border-border/40 bg-slate-50 p-2.5 dark:bg-slate-900/50">
                      <dt className="text-[10px] text-slate-400">{isAr ? "المساحة" : "Area"}</dt>
                      <dd className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                        {u.area ? `${formatAmount(u.area, locale)} m²` : "—"}
                      </dd>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-slate-50 p-2.5 dark:bg-slate-900/50">
                      <dt className="text-[10px] text-slate-400">{isAr ? "الدور" : "Floor"}</dt>
                      <dd className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                        {u.floor_number ?? "—"}
                      </dd>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-slate-50 p-2.5 dark:bg-slate-900/50">
                      <dt className="text-[10px] text-slate-400">
                        {isAr ? "نسبة الملكية" : "Share"}
                      </dt>
                      <dd className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                        {u.sharePercentage === null ? "—" : `${u.sharePercentage}%`}
                      </dd>
                    </div>
                    <div className="rounded-xl border border-border/40 bg-slate-50 p-2.5 dark:bg-slate-900/50">
                      <dt className="text-[10px] text-slate-400">
                        {isAr ? "مالك منذ" : "Owned since"}
                      </dt>
                      <dd className="font-semibold text-slate-800 dark:text-slate-200">
                        {u.ownedSince ?? "—"}
                      </dd>
                    </div>
                  </dl>

                  {/* The unit's own ledger in three figures, so the balance is
                      shown as a consequence rather than an assertion. */}
                  <dl className="grid grid-cols-1 gap-2 rounded-xl sm:grid-cols-3 border border-border/50 bg-slate-50/60 p-3 text-xs dark:bg-slate-900/40">
                    <div>
                      <dt className="text-[10px] text-slate-400">
                        {isAr ? "إجمالي المطالبات" : "Charged"}
                      </dt>
                      <dd className="font-semibold tabular-nums text-slate-800 dark:text-slate-200">
                        <Money amount={u.totalDue} locale={locale} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-slate-400">{isAr ? "المسدد" : "Paid"}</dt>
                      <dd className="font-semibold tabular-nums text-emerald-600 dark:text-emerald-400">
                        <Money amount={u.totalPaid} locale={locale} />
                      </dd>
                    </div>
                    <div>
                      <dt className="text-[10px] text-slate-400">{isAr ? "الرصيد" : "Balance"}</dt>
                      <dd className="font-bold tabular-nums">
                        <Money
                          amount={u.balance}
                          locale={locale}
                          tone={hasDue ? "negative" : "positive"}
                        />
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="flex items-center gap-2 border-t border-border/50 pt-3">
                  {hasDue ? (
                    <Link
                      href="/portal/dues"
                      locale={locale}
                      className={buttonVariants({
                        size: "sm",
                        className:
                          "h-9 flex-1 gap-1.5 rounded-xl bg-indigo-600 text-xs font-semibold text-white hover:bg-indigo-700",
                      })}
                    >
                      <CreditCard className="size-3.5" />
                      <span>{isAr ? "سداد المستحقات" : "Settle dues"}</span>
                    </Link>
                  ) : (
                    <span className="flex flex-1 items-center gap-1.5 py-1 text-xs font-semibold text-emerald-600 dark:text-emerald-400">
                      <CheckCircle2 className="size-4" />
                      {isAr ? "لا توجد مستحقات على هذه الوحدة" : "Nothing outstanding on this unit"}
                    </span>
                  )}

                  <Link
                    href="/portal/statement"
                    locale={locale}
                    className={buttonVariants({
                      variant: "outline",
                      size: "sm",
                      className: "h-9 gap-1.5 rounded-xl text-xs font-semibold",
                    })}
                  >
                    <FileText className="size-3.5 text-indigo-500" />
                    <span>{isAr ? "كشف الحساب" : "Statement"}</span>
                  </Link>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {plans.length > 0 ? (
        <section className="space-y-3 rounded-2xl border border-border/70 bg-card p-5">
          <div>
            <h2 className="flex items-center gap-2 text-sm font-bold text-slate-900 dark:text-white">
              <Layers className="size-4 text-indigo-500" />
              {isAr ? "خطط التقسيط الشرائية" : "Purchase installment plans"}
            </h2>
            <p className="text-xs text-slate-500">
              {isAr
                ? "خطط شراء الوحدات المسجلة باسمك. تظهر أقساطها المستحقة ضمن صفحة المستحقات."
                : "Purchase plans registered to you. Their due instalments appear on the dues page."}
            </p>
          </div>

          <div className="overflow-x-auto rounded-xl border border-border/60">
            <table className="w-full border-collapse text-xs">
              <thead>
                <tr className="border-b border-border/70 bg-slate-50 text-slate-600 dark:bg-slate-900/60 dark:text-slate-400">
                  <th scope="col" className="p-3 text-start font-semibold">
                    {isAr ? "الوحدة" : "Unit"}
                  </th>
                  <th scope="col" className="p-3 text-start font-semibold">
                    {isAr ? "الحالة" : "Status"}
                  </th>
                  <th scope="col" className="p-3 text-start font-semibold">
                    {isAr ? "بداية الخطة" : "Starts"}
                  </th>
                  <th scope="col" className="p-3 text-start font-semibold">
                    {isAr ? "عدد الأقساط" : "Instalments"}
                  </th>
                  <th scope="col" className="p-3 text-end font-semibold">
                    {isAr ? "المقدم" : "Down payment"}
                  </th>
                  <th scope="col" className="p-3 text-end font-semibold">
                    {isAr ? "إجمالي الثمن" : "Total price"}
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/40">
                {plans.map((p) => (
                  <tr key={p.id}>
                    <td className="p-3 font-mono font-semibold text-indigo-600 dark:text-indigo-400">
                      {p.unitCode ?? "—"}
                    </td>
                    <td className="p-3">
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-semibold ${
                          p.status === "ACTIVE"
                            ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                            : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300"
                        }`}
                      >
                        {isAr
                          ? (PLAN_STATUS_LABELS[p.status]?.ar ?? p.status)
                          : (PLAN_STATUS_LABELS[p.status]?.en ?? p.status)}
                      </Badge>
                    </td>
                    <td className="whitespace-nowrap p-3 font-mono text-slate-500">
                      <span className="inline-flex items-center gap-1">
                        <CalendarClock className="size-3 text-slate-400" />
                        {p.startsOn}
                      </span>
                    </td>
                    <td className="p-3 text-slate-600 dark:text-slate-300">
                      {p.installmentCount}{" "}
                      <span className="text-slate-400">
                        ·{" "}
                        {isAr
                          ? (FREQUENCY_LABELS[p.installmentFrequency]?.ar ?? p.installmentFrequency)
                          : (FREQUENCY_LABELS[p.installmentFrequency]?.en ?? p.installmentFrequency)}
                      </span>
                    </td>
                    <td className="p-3 text-end font-semibold tabular-nums">
                      {p.downPayment === null ? "—" : <Money amount={p.downPayment} locale={locale} />}
                    </td>
                    <td className="p-3 text-end font-bold tabular-nums text-slate-900 dark:text-white">
                      <Money amount={p.totalPrice} locale={locale} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
    </div>
  );
}
