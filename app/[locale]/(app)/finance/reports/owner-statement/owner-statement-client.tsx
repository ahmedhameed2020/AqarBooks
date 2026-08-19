"use client";

import { useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import {
  UserCheck,
  Building2,
  Calendar,
  Layers,
  FileSpreadsheet,
  FileText,
  Search,
  ArrowUpRight,
  TrendingUp,
  DollarSign,
  Printer,
  ChevronLeft,
  MessageCircle,
  Mail,
  Download,
  Share2,
  CheckCircle2,
  ShieldAlert,
  Percent,
  Wallet,
  Landmark,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCurrencyLabel } from "@/lib/currency";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";

export interface OwnerItem {
  id: string;
  name: string;
  phone: string;
  email: string;
  unitsCount: number;
}

export interface OwnerUnitStatement {
  ownerId: string;
  unitId: string;
  unitCode: string;
  resortName: string;
  grossCollected: number;
  outstandingReceivables: number;
  managementFee: number;
  maintenanceExpenses: number;
  netPayout: number;
  lastUpdated: string;
}

export function OwnerStatementClient({
  owners,
  unitStatements,
  organizationName,
  currency,
  locale,
}: {
  owners: OwnerItem[];
  unitStatements: OwnerUnitStatement[];
  organizationName: string;
  currency: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  const [selectedOwnerId, setSelectedOwnerId] = useState<string>(
    owners[0]?.id || "ALL"
  );
  const [searchQuery, setSearchQuery] = useState("");

  const currentOwner = useMemo(() => {
    return owners.find((o) => o.id === selectedOwnerId) || null;
  }, [owners, selectedOwnerId]);

  // Filtered unit statements
  const filteredStatements = useMemo(() => {
    return unitStatements.filter((s) => {
      const matchesOwner =
        selectedOwnerId === "ALL" || s.ownerId === selectedOwnerId;
      const matchesSearch =
        !searchQuery.trim() ||
        s.unitCode.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        s.resortName.toLowerCase().includes(searchQuery.toLowerCase().trim());
      return matchesOwner && matchesSearch;
    });
  }, [unitStatements, selectedOwnerId, searchQuery]);

  // Aggregate Metrics for Selected View
  const metrics = useMemo(() => {
    const totalCollected = filteredStatements.reduce(
      (sum, s) => sum + s.grossCollected,
      0
    );
    const totalOutstanding = filteredStatements.reduce(
      (sum, s) => sum + s.outstandingReceivables,
      0
    );
    const totalManagementFee = filteredStatements.reduce(
      (sum, s) => sum + s.managementFee,
      0
    );
    const totalMaintenance = filteredStatements.reduce(
      (sum, s) => sum + s.maintenanceExpenses,
      0
    );
    const totalNetPayout = filteredStatements.reduce(
      (sum, s) => sum + s.netPayout,
      0
    );

    return {
      totalCollected,
      totalOutstanding,
      totalManagementFee,
      totalMaintenance,
      totalNetPayout,
      unitsCount: filteredStatements.length,
    };
  }, [filteredStatements]);

  // WhatsApp Share Payout Statement
  const handleShareWhatsApp = () => {
    const ownerName = currentOwner ? currentOwner.name : isAr ? "السادة الملاك" : "Valued Owners";
    const text = isAr
      ? `📄 *كشف حساب وتوزيعات الأرباح*\n` +
        `🏢 *الجهة المديرة:* ${organizationName}\n` +
        `👤 *المالك المستفيد:* ${ownerName}\n` +
        `🏠 *عدد الوحدات:* ${metrics.unitsCount}\n` +
        `💵 *إجمالي الإيراد المحصل:* ${metrics.totalCollected.toLocaleString()} ${currencyLabel}\n` +
        `💼 *عمولة الإدارة والتشغيل:* -${metrics.totalManagementFee.toLocaleString()} ${currencyLabel}\n` +
        `🔧 *مصاريف الصيانة والتشغيل:* -${metrics.totalMaintenance.toLocaleString()} ${currencyLabel}\n` +
        `💳 *صافي الربح المستحق للتحويل:* ${metrics.totalNetPayout.toLocaleString()} ${currencyLabel}\n` +
        `📅 *تاريخ التقرير:* ${new Date().toISOString().slice(0, 10)}\n\n` +
        `شاكرين لكم ثقتكم بنا.`
      : `📄 *Owner Distribution Statement*\n` +
        `🏢 *Manager:* ${organizationName}\n` +
        `👤 *Owner:* ${ownerName}\n` +
        `🏠 *Units Count:* ${metrics.unitsCount}\n` +
        `💵 *Gross Collected:* ${metrics.totalCollected.toLocaleString()} ${currencyLabel}\n` +
        `💼 *Management Fees:* -${metrics.totalManagementFee.toLocaleString()} ${currencyLabel}\n` +
        `🔧 *Maintenance Expenses:* -${metrics.totalMaintenance.toLocaleString()} ${currencyLabel}\n` +
        `💳 *Net Payout Amount:* ${metrics.totalNetPayout.toLocaleString()} ${currencyLabel}\n` +
        `📅 *Date:* ${new Date().toISOString().slice(0, 10)}\n\n` +
        `Thank you for your partnership.`;

    const phoneParam = currentOwner?.phone
      ? `phone=${currentOwner.phone.replace(/[^0-9]/g, "")}&`
      : "";
    window.open(`https://api.whatsapp.com/send?${phoneParam}text=${encodeURIComponent(text)}`, "_blank");
  };

  // Email Share Payout Statement
  const handleShareEmail = () => {
    const ownerName = currentOwner ? currentOwner.name : isAr ? "السادة الملاك" : "Valued Owners";
    const subject = isAr
      ? `كشف حساب وتوزيعات الأرباح — ${ownerName} — ${organizationName}`
      : `Owner Payout & Statement of Account — ${ownerName} — ${organizationName}`;

    const body = isAr
      ? `عزيزي المالك/ة ${ownerName}،\n\nنرفق لكم ملخص كشف الحساب المالي وصافي التوزيعات المستحقة:\n\n` +
        `• إجمالي الإيراد المحصل: ${metrics.totalCollected.toLocaleString()} ${currencyLabel}\n` +
        `• عمولة الإدارة والتشغيل: ${metrics.totalManagementFee.toLocaleString()} ${currencyLabel}\n` +
        `• مصاريف الصيانة والخدمات: ${metrics.totalMaintenance.toLocaleString()} ${currencyLabel}\n` +
        `• صافي المبلغ القابل للتحويل: ${metrics.totalNetPayout.toLocaleString()} ${currencyLabel}\n\n` +
        `مع أطيب التحيات،\n${organizationName}`
      : `Dear ${ownerName},\n\nPlease find the summary of your owner distribution statement:\n\n` +
        `• Gross Collected: ${metrics.totalCollected.toLocaleString()} ${currencyLabel}\n` +
        `• Management Fees: ${metrics.totalManagementFee.toLocaleString()} ${currencyLabel}\n` +
        `• Maintenance Expenses: ${metrics.totalMaintenance.toLocaleString()} ${currencyLabel}\n` +
        `• Net Payout Payable: ${metrics.totalNetPayout.toLocaleString()} ${currencyLabel}\n\n` +
        `Best regards,\n${organizationName}`;

    window.location.href = `mailto:${currentOwner?.email || ""}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  };

  // PDF Export
  const handleExportPdf = () => {
    const ownerName = currentOwner ? currentOwner.name : isAr ? "كافة الملاك" : "All Owners";
    generateFinancialStatementPdf({
      title: isAr ? "كشف حساب وتوزيعات أرباح المالك" : "Owner Payout & Distribution Statement",
      subtitle: isAr
        ? `المالك: ${ownerName} — كشف تفصيلي بالإيرادات والاستقطاعات وصافي الأرباح`
        : `Owner: ${ownerName} — Detailed Breakdown of Revenues, Fees & Net Payout`,
      organizationName,
      currencyLabel,
      dateRangeLabel: new Date().toISOString().slice(0, 10),
      columns: [
        { header: isAr ? "الوحدة" : "Unit", key: "unit", align: "start" },
        { header: isAr ? "المشروع" : "Property", key: "property", align: "start" },
        { header: isAr ? "المحصل" : "Collected", key: "collected", align: "end", isNumber: true },
        { header: isAr ? "عمولة الإدارة" : "Mgmt Fee", key: "fee", align: "end", isNumber: true },
        { header: isAr ? "مصاريف الصيانة" : "Maintenance", key: "maint", align: "end", isNumber: true },
        { header: isAr ? "صافي المستحق" : "Net Payout", key: "payout", align: "end", isNumber: true },
      ],
      rows: filteredStatements.map((s) => ({
        unit: s.unitCode,
        property: s.resortName,
        collected: `${s.grossCollected.toLocaleString()} ${currencyLabel}`,
        fee: `-${s.managementFee.toLocaleString()} ${currencyLabel}`,
        maint: `-${s.maintenanceExpenses.toLocaleString()} ${currencyLabel}`,
        payout: `${s.netPayout.toLocaleString()} ${currencyLabel}`,
      })),
      summaryCards: [
        { label: isAr ? "إجمالي المحصل" : "Total Collected", value: `${metrics.totalCollected.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "إجمالي عمولات الإدارة" : "Management Fees", value: `${metrics.totalManagementFee.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "مصاريف الصيانة" : "Maintenance", value: `${metrics.totalMaintenance.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "صافي الأرباح القابلة للتحويل" : "Net Owner Payout", value: `${metrics.totalNetPayout.toLocaleString()} ${currencyLabel}` },
      ],
      filename: `Owner_Statement_${ownerName}_${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  };

  // Excel Export
  const handleExportExcel = () => {
    exportFinancialStatementToExcel({
      title: isAr ? "كشف حساب وتوزيعات أرباح الملاك" : "Owner Distribution Statement",
      organizationName,
      currency: currencyLabel,
      columns: [
        { header: isAr ? "رمز الوحدة" : "Unit Code", key: "unit" },
        { header: isAr ? "المشروع / المنتجع" : "Property", key: "property" },
        { header: isAr ? "إجمالي المحصل" : "Gross Collected", key: "collected", isNumber: true },
        { header: isAr ? "عمولة الإدارة (10%)" : "Management Fee", key: "fee", isNumber: true },
        { header: isAr ? "مصاريف الصيانة" : "Maintenance", key: "maint", isNumber: true },
        { header: isAr ? "صافي الربح المحول" : "Net Payout", key: "payout", isNumber: true },
        { header: isAr ? "الذمم المتبقية" : "Outstanding", key: "outstanding", isNumber: true },
      ],
      rows: filteredStatements.map((s) => ({
        unit: s.unitCode,
        property: s.resortName,
        collected: s.grossCollected,
        fee: s.managementFee,
        maint: s.maintenanceExpenses,
        payout: s.netPayout,
        outstanding: s.outstandingReceivables,
      })),
      filename: `Owner_Statements_${new Date().toISOString().slice(0, 10)}.xlsx`,
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* HEADER WITH BREADCRUMB */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-emerald-600 dark:text-emerald-400">
              <Link href="/finance/reports" className="hover:underline flex items-center gap-1">
                <ChevronLeft className="size-3.5 rtl:rotate-180" />
                <span>{isAr ? "مركز التقارير والقوائم المالية" : "Financial Reports"}</span>
              </Link>
              <span>/</span>
              <span className="text-slate-800 dark:text-slate-200 font-extrabold">
                {isAr ? "كشوف حسابات الملاك" : "Owner Statements"}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              {isAr ? "كشف حساب وتوزيعات أرباح الملاك" : "Owner Payout & Distribution Statement"}
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl font-medium">
              {isAr
                ? "تقرير الحساب الختامي للمستثمرين والملاك: حصر الإيرادات المحصلة، استقطاع عمولة الإدارة ورسوم الصيانة، واحتساب صافي الأرباح المحولة."
                : "Statement of account for property owners: collected income, management fees, maintenance charges, and net payout."}
            </p>
          </div>

          {/* ACTION BUTTONS */}
          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleShareWhatsApp}
              size="sm"
              className="h-9 px-3.5 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white shadow-xs gap-1.5 cursor-pointer"
            >
              <MessageCircle className="size-3.5" />
              <span>{isAr ? "إرسال واتساب" : "WhatsApp"}</span>
            </Button>

            <Button
              onClick={handleShareEmail}
              variant="outline"
              size="sm"
              className="h-9 px-3 text-xs font-bold border-slate-200 text-blue-700 hover:bg-blue-50 dark:border-slate-800 dark:text-blue-400 gap-1.5"
            >
              <Mail className="size-3.5" />
              <span>{isAr ? "إيميل" : "Email"}</span>
            </Button>

            <Button
              onClick={handleExportExcel}
              variant="outline"
              size="sm"
              className="h-9 px-3 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 gap-1.5"
            >
              <FileSpreadsheet className="size-3.5 text-emerald-600" />
              <span>{isAr ? "إكسل" : "Excel"}</span>
            </Button>

            <Button
              onClick={handleExportPdf}
              variant="outline"
              size="sm"
              className="h-9 px-3 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 gap-1.5"
            >
              <FileText className="size-3.5 text-rose-600" />
              <span>{isAr ? "PDF" : "PDF"}</span>
            </Button>

            <Button
              onClick={() => window.print()}
              variant="outline"
              size="sm"
              className="h-9 px-3 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 gap-1.5"
            >
              <Printer className="size-3.5 text-slate-600" />
              <span>{isAr ? "طباعة" : "Print"}</span>
            </Button>
          </div>
        </div>

        {/* METRICS TILES */}
        <div className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4 pt-5 border-t border-slate-100 dark:border-slate-800">
          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "إجمالي الإيرادات المحصلة" : "Gross Collected"}</span>
              <DollarSign className="size-4 text-emerald-600" />
            </div>
            <p className="text-xl font-black text-slate-900 dark:text-white mt-1 font-mono">
              {metrics.totalCollected.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "عن كافة الوحدات المملوكة" : "From owned units"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "عمولة الإدارة والتشغيل" : "Management Fees"}</span>
              <Percent className="size-4 text-purple-600" />
            </div>
            <p className="text-xl font-black text-purple-600 dark:text-purple-400 mt-1 font-mono">
              -{metrics.totalManagementFee.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "10% أتعاب إدارة المنشأة" : "Standard mgmt fee"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "خصومات الصيانة والتشغيل" : "Maintenance Deductions"}</span>
              <ShieldAlert className="size-4 text-amber-600" />
            </div>
            <p className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1 font-mono">
              -{metrics.totalMaintenance.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "مصاريف خدمات منفذة" : "Repairs & ops"}</span>
          </div>

          <div className="rounded-2xl bg-emerald-50/70 p-3.5 border border-emerald-200/80 dark:bg-emerald-950/20 dark:border-emerald-900/60">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-emerald-800 dark:text-emerald-300">{isAr ? "صافي الربح المستحق للمالك" : "Net Owner Payout"}</span>
              <Wallet className="size-4 text-emerald-700 dark:text-emerald-400" />
            </div>
            <p className="text-xl font-black text-emerald-700 dark:text-emerald-300 mt-1 font-mono">
              {metrics.totalNetPayout.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-emerald-600/80 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-emerald-700/80 block mt-0.5">{isAr ? "جاهز للتحويل البنكي ✓" : "Ready for payout"}</span>
          </div>
        </div>
      </div>

      {/* FILTER & OWNER SELECTOR */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap items-center gap-2.5 w-full sm:w-auto">
          <div className="flex items-center gap-1.5">
            <UserCheck className="size-4 text-emerald-600" />
            <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{isAr ? "المالك المستهدف:" : "Select Owner:"}</span>
          </div>
          <select
            value={selectedOwnerId}
            onChange={(e) => setSelectedOwnerId(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white cursor-pointer"
          >
            <option value="ALL">{isAr ? "جميع الملاك والمستثمرين" : "All Owners"}</option>
            {owners.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.unitsCount} {isAr ? "وحدة" : "units"})
              </option>
            ))}
          </select>
        </div>

        {/* SEARCH */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? "بحث بالوحدة أو المشروع..." : "Search unit, resort..."}
            className="ps-9 text-xs h-9 bg-slate-50 dark:bg-slate-800"
          />
        </div>
      </div>

      {/* DETAILED STATEMENTS TABLE */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50/90 text-slate-800 dark:bg-slate-800 dark:text-slate-200 font-extrabold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-3.5 text-start">{isAr ? "الوحدة العقارية" : "Unit Code"}</th>
                <th className="p-3.5 text-start">{isAr ? "المشروع / المنتجع" : "Property"}</th>
                <th className="p-3.5 text-end">{isAr ? "إجمالي المحصل" : "Gross Collected"}</th>
                <th className="p-3.5 text-end">{isAr ? "عمولة الإدارة" : "Management Fee"}</th>
                <th className="p-3.5 text-end">{isAr ? "مصاريف الصيانة" : "Maintenance"}</th>
                <th className="p-3.5 text-end">{isAr ? "صافي المستحق للمالك" : "Net Owner Payout"}</th>
                <th className="p-3.5 text-end">{isAr ? "المتأخرات المعلقة" : "Outstanding"}</th>
                <th className="p-3.5 text-center">{isAr ? "الحالة" : "Status"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredStatements.length ? (
                filteredStatements.map((s) => (
                  <tr
                    key={s.unitId}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                  >
                    <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-white">
                      <div className="flex items-center gap-1.5">
                        <Building2 className="size-3.5 text-emerald-600 shrink-0" />
                        <span>{s.unitCode}</span>
                      </div>
                    </td>

                    <td className="p-3.5 font-bold text-slate-800 dark:text-slate-200">
                      {s.resortName}
                    </td>

                    <td className="p-3.5 text-end font-mono font-bold text-slate-900 dark:text-white">
                      {s.grossCollected.toLocaleString()}{" "}
                      <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                    </td>

                    <td className="p-3.5 text-end font-mono text-purple-600 dark:text-purple-400 font-bold">
                      -{s.managementFee.toLocaleString()}{" "}
                      <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                    </td>

                    <td className="p-3.5 text-end font-mono text-amber-600 dark:text-amber-400 font-bold">
                      -{s.maintenanceExpenses.toLocaleString()}{" "}
                      <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                    </td>

                    <td className="p-3.5 text-end font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                      {s.netPayout.toLocaleString()}{" "}
                      <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                    </td>

                    <td className="p-3.5 text-end font-mono text-slate-500">
                      {s.outstandingReceivables > 0 ? (
                        <span className="text-rose-600 font-semibold">{s.outstandingReceivables.toLocaleString()} {currencyLabel}</span>
                      ) : (
                        <span className="text-slate-400">0.00</span>
                      )}
                    </td>

                    <td className="p-3.5 text-center">
                      <Badge className="text-[10px] font-bold bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">
                        {isAr ? "✓ معتمد للتوزيع" : "Approved"}
                      </Badge>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8} className="p-10 text-center text-slate-400 text-xs">
                    {isAr ? "لا توجد بيانات توزيعات متاحة للمالك المختار" : "No statement records available"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
