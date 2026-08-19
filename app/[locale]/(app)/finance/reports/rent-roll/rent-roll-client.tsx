"use client";

import { useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import {
  Building2,
  Calendar,
  Layers,
  FileSpreadsheet,
  FileText,
  Search,
  ArrowUpRight,
  TrendingUp,
  KeyRound,
  ShieldAlert,
  CheckCircle2,
  Clock,
  Printer,
  ChevronLeft,
  DollarSign,
  Filter,
  User,
  Phone,
  MessageCircle,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCurrencyLabel } from "@/lib/currency";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";

export interface RentRollUnitRow {
  unitId: string;
  unitCode: string;
  unitType: string;
  resortId: string;
  resortName: string;
  ownerName: string;
  tenantName: string;
  tenantPhone: string;
  leaseId: string | null;
  leaseStatus: string;
  occupancyStatus: "OCCUPIED" | "VACANT" | "EXPIRING_SOON" | "DRAFT_LEASE";
  startsOn: string;
  endsOn: string;
  rentAmount: number;
  rentFrequency: string;
  annualRent: number;
  securityDeposit: number;
}

export function RentRollClient({
  initialRows,
  resorts,
  organizationName,
  currency,
  locale,
}: {
  initialRows: RentRollUnitRow[];
  resorts: { id: string; name: string }[];
  organizationName: string;
  currency: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  const [searchQuery, setSearchQuery] = useState("");
  const [selectedResortId, setSelectedResortId] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");

  // Filtering
  const filteredRows = useMemo(() => {
    return initialRows.filter((r) => {
      const matchesSearch =
        !searchQuery.trim() ||
        r.unitCode.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        r.tenantName.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        r.ownerName.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        r.resortName.toLowerCase().includes(searchQuery.toLowerCase().trim());

      const matchesResort =
        selectedResortId === "ALL" || r.resortId === selectedResortId;

      const matchesStatus =
        statusFilter === "ALL" || r.occupancyStatus === statusFilter;

      return matchesSearch && matchesResort && matchesStatus;
    });
  }, [initialRows, searchQuery, selectedResortId, statusFilter]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const totalUnits = initialRows.length;
    const occupiedUnits = initialRows.filter(
      (r) => r.occupancyStatus === "OCCUPIED" || r.occupancyStatus === "EXPIRING_SOON"
    ).length;
    const vacantUnits = initialRows.filter((r) => r.occupancyStatus === "VACANT").length;
    const expiringSoon = initialRows.filter((r) => r.occupancyStatus === "EXPIRING_SOON").length;
    const occupancyRate = totalUnits > 0 ? (occupiedUnits / totalUnits) * 100 : 0;
    const totalAnnualRent = initialRows.reduce((sum, r) => sum + r.annualRent, 0);
    const totalDeposits = initialRows.reduce((sum, r) => sum + r.securityDeposit, 0);

    return {
      totalUnits,
      occupiedUnits,
      vacantUnits,
      expiringSoon,
      occupancyRate,
      totalAnnualRent,
      totalDeposits,
    };
  }, [initialRows]);

  // WhatsApp reminder / greeting
  const handleWhatsAppContact = (r: RentRollUnitRow) => {
    if (!r.tenantPhone) return;
    const text = isAr
      ? `مرحباً ${r.tenantName}، نتواصل معكم بخصوص عقد إيجار الوحدة (${r.unitCode}) بمشروع ${r.resortName}. تحياتنا، إدارة ${organizationName}.`
      : `Hello ${r.tenantName}, regarding your lease for unit ${r.unitCode} at ${r.resortName}. Regards, ${organizationName}.`;
    window.open(`https://api.whatsapp.com/send?phone=${r.tenantPhone.replace(/[^0-9]/g, "")}&text=${encodeURIComponent(text)}`, "_blank");
  };

  // PDF Export
  const handleExportPdf = () => {
    generateFinancialStatementPdf({
      title: isAr ? "جدول الإيجارات وعقود الوحدات (Rent Roll)" : "Rent Roll & Unit Leases Statement",
      subtitle: isAr
        ? `بيان حصر إشغال الوحدات والإيراد الإيجاري التعاقدي — ${organizationName}`
        : `Unit Occupancy & Contractual Rental Revenue Schedule — ${organizationName}`,
      organizationName,
      currencyLabel,
      dateRangeLabel: new Date().toISOString().slice(0, 10),
      columns: [
        { header: isAr ? "الوحدة" : "Unit", key: "unit", align: "start" },
        { header: isAr ? "المشروع" : "Property", key: "property", align: "start" },
        { header: isAr ? "المستأجر" : "Tenant", key: "tenant", align: "start" },
        { header: isAr ? "الحالة" : "Status", key: "status", align: "center" },
        { header: isAr ? "نهاية العقد" : "Ends On", key: "endsOn", align: "center" },
        { header: isAr ? "الإيجار الدوري" : "Rent", key: "rent", align: "end", isNumber: true },
        { header: isAr ? "الإيجار السنوي" : "Annual Rent", key: "annual", align: "end", isNumber: true },
      ],
      rows: filteredRows.map((r) => ({
        unit: r.unitCode,
        property: r.resortName,
        tenant: r.tenantName,
        status:
          r.occupancyStatus === "OCCUPIED"
            ? isAr ? "مؤجرة" : "Occupied"
            : r.occupancyStatus === "EXPIRING_SOON"
            ? isAr ? "ينتهي قريباً" : "Expiring"
            : isAr ? "شاغرة" : "Vacant",
        endsOn: r.endsOn,
        rent: r.rentAmount ? `${r.rentAmount.toLocaleString()} ${currencyLabel}` : "—",
        annual: r.annualRent ? `${r.annualRent.toLocaleString()} ${currencyLabel}` : "—",
      })),
      summaryCards: [
        { label: isAr ? "إجمالي الوحدات" : "Total Units", value: `${metrics.totalUnits}` },
        { label: isAr ? "نسبة الإشغال" : "Occupancy Rate", value: `${metrics.occupancyRate.toFixed(1)}%` },
        { label: isAr ? "الإيراد السنوي الإجمالي" : "Gross Annual Rent", value: `${metrics.totalAnnualRent.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "ودائع التأمين المحتجزة" : "Total Deposits", value: `${metrics.totalDeposits.toLocaleString()} ${currencyLabel}` },
      ],
      filename: `Rent_Roll_${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  };

  // Excel Export
  const handleExportExcel = () => {
    exportFinancialStatementToExcel({
      title: isAr ? "جدول الإيجارات وعقود الوحدات (Rent Roll)" : "Rent Roll Schedule",
      organizationName,
      currency: currencyLabel,
      columns: [
        { header: isAr ? "رمز الوحدة" : "Unit Code", key: "unit" },
        { header: isAr ? "المشروع / المنتجع" : "Property", key: "property" },
        { header: isAr ? "المالك المسجل" : "Owner", key: "owner" },
        { header: isAr ? "المستأجر الحالي" : "Tenant", key: "tenant" },
        { header: isAr ? "حالة الإشغال" : "Occupancy", key: "status" },
        { header: isAr ? "تاريخ البداية" : "Starts On", key: "startsOn" },
        { header: isAr ? "تاريخ النهاية" : "Ends On", key: "endsOn" },
        { header: isAr ? "الإيجار الدوري" : "Rent Amount", key: "rent", isNumber: true },
        { header: isAr ? "التكرار" : "Frequency", key: "freq" },
        { header: isAr ? "الإيجار السنوي" : "Annual Rent", key: "annual", isNumber: true },
        { header: isAr ? "مبلغ التأمين" : "Security Deposit", key: "deposit", isNumber: true },
      ],
      rows: filteredRows.map((r) => ({
        unit: r.unitCode,
        property: r.resortName,
        owner: r.ownerName,
        tenant: r.tenantName,
        status: r.occupancyStatus,
        startsOn: r.startsOn,
        endsOn: r.endsOn,
        rent: r.rentAmount,
        freq: r.rentFrequency,
        annual: r.annualRent,
        deposit: r.securityDeposit,
      })),
      filename: `Rent_Roll_${new Date().toISOString().slice(0, 10)}.xlsx`,
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* HEADER WITH BREADCRUMB */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-blue-600 dark:text-blue-400">
              <Link href="/finance/reports" className="hover:underline flex items-center gap-1">
                <ChevronLeft className="size-3.5 rtl:rotate-180" />
                <span>{isAr ? "مركز التقارير والقوائم المالية" : "Financial Reports"}</span>
              </Link>
              <span>/</span>
              <span className="text-slate-800 dark:text-slate-200 font-extrabold">
                {isAr ? "جدول الإيجارات (Rent Roll)" : "Rent Roll"}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              {isAr ? "جدول الإيجارات وحصر العقود (Rent Roll)" : "Rent Roll & Leases Schedule"}
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl font-medium">
              {isAr
                ? "التقرير القياسي العالمي لحصر إشغال الوحدات، المستأجرين، القيمة الإيجارية التعاقدية، وتواريخ تجديد وانتهاء العقود."
                : "Standard property management schedule tracking unit occupancy, tenants, lease terms, and contractual rent."}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Button
              onClick={handleExportExcel}
              variant="outline"
              size="sm"
              className="h-9 px-3.5 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 gap-1.5"
            >
              <FileSpreadsheet className="size-3.5 text-emerald-600" />
              <span>{isAr ? "تصدير إكسل" : "Excel"}</span>
            </Button>

            <Button
              onClick={handleExportPdf}
              variant="outline"
              size="sm"
              className="h-9 px-3.5 text-xs font-bold border-slate-200 text-slate-700 hover:bg-slate-50 dark:border-slate-800 dark:text-slate-200 gap-1.5"
            >
              <FileText className="size-3.5 text-rose-600" />
              <span>{isAr ? "تصدير PDF" : "PDF"}</span>
            </Button>

            <Button
              onClick={handleExportPdf}
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
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "نسبة الإشغال الإجمالية" : "Occupancy Rate"}</span>
              <TrendingUp className="size-4 text-emerald-600" />
            </div>
            <p className="text-2xl font-black text-slate-900 dark:text-white mt-1 font-mono">
              {metrics.occupancyRate.toFixed(1)}%
            </p>
            <span className="text-[10px] text-emerald-600 font-bold block mt-0.5">
              {metrics.occupiedUnits} {isAr ? "وحدة مؤجرة من أصل" : "occupied of"} {metrics.totalUnits}
            </span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "الإيراد الإيجاري السنوي" : "Gross Annual Rent"}</span>
              <DollarSign className="size-4 text-blue-600" />
            </div>
            <p className="text-xl font-black text-blue-600 dark:text-blue-400 mt-1 font-mono">
              {metrics.totalAnnualRent.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "الدخل التعاقدي النشط" : "Contractual run rate"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "ودائع التأمين المحتجزة" : "Held Deposits"}</span>
              <ShieldAlert className="size-4 text-purple-600" />
            </div>
            <p className="text-xl font-black text-purple-600 dark:text-purple-400 mt-1 font-mono">
              {metrics.totalDeposits.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "تأمينات مستأجرين" : "Security deposits"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "عقود تنتهي قريباً (<30 يوم)" : "Expiring Soon"}</span>
              <Clock className="size-4 text-amber-600" />
            </div>
            <p className="text-2xl font-black text-amber-600 dark:text-amber-400 mt-1 font-mono">
              {metrics.expiringSoon}
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "تحتاج تجديد أو إعادة تأجير" : "Requires renewal"}</span>
          </div>
        </div>
      </div>

      {/* FILTER CONTROLS */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* RESORT FILTER */}
          <select
            value={selectedResortId}
            onChange={(e) => setSelectedResortId(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="ALL">{isAr ? "جميع المشاريع والمنتجعات" : "All Properties"}</option>
            {resorts.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>

          {/* STATUS FILTER */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="ALL">{isAr ? "كافة حالات الإشغال" : "All Statuses"}</option>
            <option value="OCCUPIED">{isAr ? "مؤجرة (سارية)" : "Occupied"}</option>
            <option value="EXPIRING_SOON">{isAr ? "تنتهي قريباً (<30 يوم)" : "Expiring Soon"}</option>
            <option value="VACANT">{isAr ? "شاغرة (جاهزة للتأجير)" : "Vacant"}</option>
          </select>
        </div>

        {/* SEARCH */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? "بحث بالوحدة، المستأجر، المالك..." : "Search unit, tenant..."}
            className="ps-9 text-xs h-9 bg-slate-50 dark:bg-slate-800"
          />
        </div>
      </div>

      {/* RENT ROLL TABLE WITH LIGHT CONTRAST HEADER */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50/90 text-slate-800 dark:bg-slate-800 dark:text-slate-200 font-extrabold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-3.5 text-start">{isAr ? "الوحدة العقارية" : "Unit"}</th>
                <th className="p-3.5 text-start">{isAr ? "المشروع / المنتجع" : "Property"}</th>
                <th className="p-3.5 text-start">{isAr ? "المالك المسجل" : "Owner"}</th>
                <th className="p-3.5 text-start">{isAr ? "المستأجر الحالي" : "Current Tenant"}</th>
                <th className="p-3.5 text-center">{isAr ? "حالة الإشغال" : "Occupancy Status"}</th>
                <th className="p-3.5 text-center">{isAr ? "فترة العقد" : "Lease Period"}</th>
                <th className="p-3.5 text-end">{isAr ? "الإيجار الدوري" : "Periodic Rent"}</th>
                <th className="p-3.5 text-end">{isAr ? "الإيجار السنوي" : "Annual Rent"}</th>
                <th className="p-3.5 text-end">{isAr ? "تأمين الإيجار" : "Deposit"}</th>
                <th className="p-3.5 text-center">{isAr ? "إجراءات" : "Actions"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredRows.length ? (
                filteredRows.map((r) => (
                  <tr
                    key={r.unitId}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                  >
                    <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-white">
                      <div className="flex items-center gap-1.5">
                        <KeyRound className="size-3.5 text-blue-600 shrink-0" />
                        <span>{r.unitCode}</span>
                      </div>
                    </td>

                    <td className="p-3.5 font-bold text-slate-800 dark:text-slate-200">
                      {r.resortName}
                    </td>

                    <td className="p-3.5 text-slate-600 dark:text-slate-400">
                      {r.ownerName}
                    </td>

                    <td className="p-3.5 font-medium text-slate-900 dark:text-white">
                      {r.tenantName !== "—" ? (
                        <div className="flex items-center gap-1.5">
                          <User className="size-3 text-slate-400" />
                          <span>{r.tenantName}</span>
                        </div>
                      ) : (
                        <span className="text-slate-400">{isAr ? "لا يوجد مستأجر" : "No active tenant"}</span>
                      )}
                    </td>

                    <td className="p-3.5 text-center">
                      {r.occupancyStatus === "OCCUPIED" && (
                        <Badge className="text-[10px] font-bold bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">
                          {isAr ? "✓ مؤجرة نشطة" : "Occupied"}
                        </Badge>
                      )}
                      {r.occupancyStatus === "EXPIRING_SOON" && (
                        <Badge className="text-[10px] font-bold bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 animate-pulse">
                          {isAr ? "⏱ تنتهي قريباً" : "Expiring"}
                        </Badge>
                      )}
                      {r.occupancyStatus === "VACANT" && (
                        <Badge variant="outline" className="text-[10px] font-bold bg-slate-50 text-slate-600 border-slate-200">
                          {isAr ? "شاغرة" : "Vacant"}
                        </Badge>
                      )}
                      {r.occupancyStatus === "DRAFT_LEASE" && (
                        <Badge variant="secondary" className="text-[10px] font-bold bg-blue-50 text-blue-700">
                          {isAr ? "مسودة عقد" : "Draft Lease"}
                        </Badge>
                      )}
                    </td>

                    <td className="p-3.5 text-center font-mono text-[11px] text-slate-600 dark:text-slate-400">
                      {r.startsOn !== "—" ? (
                        <span>{r.startsOn} ➔ {r.endsOn}</span>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="p-3.5 text-end font-mono font-bold text-slate-900 dark:text-white">
                      {r.rentAmount > 0 ? (
                        <>
                          {r.rentAmount.toLocaleString()}{" "}
                          <span className="text-[10px] text-slate-400 font-normal">
                            {r.rentFrequency === "MONTHLY" ? (isAr ? "ش/ج.م" : "/mo") : currencyLabel}
                          </span>
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="p-3.5 text-end font-mono font-black text-blue-600 dark:text-blue-400">
                      {r.annualRent > 0 ? (
                        <>
                          {r.annualRent.toLocaleString()}{" "}
                          <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                        </>
                      ) : (
                        <span className="text-slate-400">—</span>
                      )}
                    </td>

                    <td className="p-3.5 text-end font-mono text-purple-600 dark:text-purple-400 font-semibold">
                      {r.securityDeposit > 0 ? (
                        `${r.securityDeposit.toLocaleString()} ${currencyLabel}`
                      ) : (
                        <span className="text-slate-400">0.00</span>
                      )}
                    </td>

                    <td className="p-3.5 text-center">
                      {r.tenantPhone ? (
                        <Button
                          onClick={() => handleWhatsAppContact(r)}
                          variant="ghost"
                          size="sm"
                          title={isAr ? "تواصل واتساب مع المستأجر" : "WhatsApp Tenant"}
                          className="h-7 w-7 p-0 text-emerald-600 hover:bg-emerald-50 hover:text-emerald-700"
                        >
                          <MessageCircle className="size-3.5" />
                        </Button>
                      ) : (
                        <span className="text-slate-300">—</span>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={10} className="p-10 text-center text-slate-400 text-xs">
                    {isAr ? "لا توجد وحدات مطابقة لمعايير البحث" : "No units found matching filters"}
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
