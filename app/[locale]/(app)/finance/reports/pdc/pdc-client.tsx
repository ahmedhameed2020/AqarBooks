"use client";

import { useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import {
  CreditCard,
  Building2,
  Calendar,
  Layers,
  FileSpreadsheet,
  FileText,
  Search,
  ArrowUpRight,
  TrendingUp,
  Clock,
  Printer,
  ChevronLeft,
  DollarSign,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Landmark,
  ShieldCheck,
  User,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCurrencyLabel } from "@/lib/currency";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { exportFinancialStatementToExcel } from "@/lib/reports/financial-excel-export";

export interface PdcChequeRow {
  id: string;
  number: string;
  amount: number;
  dueDate: string;
  status: string;
  type: string;
  drawerName: string;
  beneficiaryName: string;
  bankName: string;
  createdAt: string;
}

export function PdcClient({
  initialRows,
  organizationName,
  currency,
  locale,
}: {
  initialRows: PdcChequeRow[];
  organizationName: string;
  currency: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");

  // Filtering
  const filteredRows = useMemo(() => {
    return initialRows.filter((r) => {
      const matchesSearch =
        !searchQuery.trim() ||
        r.number.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        r.drawerName.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        r.beneficiaryName.toLowerCase().includes(searchQuery.toLowerCase().trim()) ||
        r.bankName.toLowerCase().includes(searchQuery.toLowerCase().trim());

      const matchesStatus =
        statusFilter === "ALL" || r.status === statusFilter;

      const matchesType =
        typeFilter === "ALL" || r.type === typeFilter;

      return matchesSearch && matchesStatus && matchesType;
    });
  }, [initialRows, searchQuery, statusFilter, typeFilter]);

  // Aggregate Metrics
  const metrics = useMemo(() => {
    const totalPdcAmount = initialRows.reduce((sum, r) => sum + r.amount, 0);
    const incomingCheques = initialRows.filter((r) => r.type === "INCOMING");
    const outgoingCheques = initialRows.filter((r) => r.type === "OUTGOING");

    const now = Date.now();
    const thirtyDaysAhead = now + 30 * 86400000;

    const dueIn30Days = initialRows.filter((r) => {
      if (r.status === "CLEARED" || r.status === "VOID") return false;
      const due = new Date(r.dueDate).getTime();
      return due >= now && due <= thirtyDaysAhead;
    });

    const clearedCheques = initialRows.filter((r) => r.status === "CLEARED");
    const bouncedCheques = initialRows.filter((r) => r.status === "BOUNCED");

    return {
      totalCheques: initialRows.length,
      totalPdcAmount,
      incomingAmount: incomingCheques.reduce((s, r) => s + r.amount, 0),
      outgoingAmount: outgoingCheques.reduce((s, r) => s + r.amount, 0),
      dueIn30DaysAmount: dueIn30Days.reduce((s, r) => s + r.amount, 0),
      dueIn30DaysCount: dueIn30Days.length,
      clearedAmount: clearedCheques.reduce((s, r) => s + r.amount, 0),
      bouncedAmount: bouncedCheques.reduce((s, r) => s + r.amount, 0),
      bouncedCount: bouncedCheques.length,
    };
  }, [initialRows]);

  // PDF Export
  const handleExportPdf = () => {
    generateFinancialStatementPdf({
      title: isAr ? "سجل الشيكات الآجلة وأوراق القبض (PDC)" : "Post-Dated Cheques (PDC) Register",
      subtitle: isAr
        ? `تقرير حوكمة الشيكات البنكية ومواعيد استحقاق السيولة — ${organizationName}`
        : `Cheques Governance & Liquidity Maturity Schedule — ${organizationName}`,
      organizationName,
      currencyLabel,
      dateRangeLabel: new Date().toISOString().slice(0, 10),
      columns: [
        { header: isAr ? "رقم الشيك" : "Cheque #", key: "number", align: "start" },
        { header: isAr ? "البنك المسحوب عليه" : "Bank", key: "bank", align: "start" },
        { header: isAr ? "الساحب / العميل" : "Drawer", key: "drawer", align: "start" },
        { header: isAr ? "تاريخ الاستحقاق" : "Due Date", key: "dueDate", align: "center" },
        { header: isAr ? "المبلغ" : "Amount", key: "amount", align: "end", isNumber: true },
        { header: isAr ? "الحالة" : "Status", key: "status", align: "center" },
      ],
      rows: filteredRows.map((r) => ({
        number: r.number,
        bank: r.bankName,
        drawer: r.drawerName,
        dueDate: r.dueDate,
        amount: `${r.amount.toLocaleString()} ${currencyLabel}`,
        status:
          r.status === "CLEARED"
            ? isAr ? "تم التحصيل" : "Cleared"
            : r.status === "DEPOSITED"
            ? isAr ? "مودع للتحصيل" : "Deposited"
            : r.status === "BOUNCED"
            ? isAr ? "مرتجع" : "Bounced"
            : isAr ? "مستلم بالخزينة" : "Received",
      })),
      summaryCards: [
        { label: isAr ? "إجمالي الشيكات" : "Total Cheques", value: `${metrics.totalCheques}` },
        { label: isAr ? "شيكات مقبوضة واردة" : "Incoming PDCs", value: `${metrics.incomingAmount.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "تستحق خلال 30 يوماً" : "Due Next 30 Days", value: `${metrics.dueIn30DaysAmount.toLocaleString()} ${currencyLabel}` },
        { label: isAr ? "شيكات مرتجعة" : "Bounced Cheques", value: `${metrics.bouncedAmount.toLocaleString()} ${currencyLabel}` },
      ],
      filename: `PDC_Cheques_Register_${new Date().toISOString().slice(0, 10)}.pdf`,
    });
  };

  // Excel Export
  const handleExportExcel = () => {
    exportFinancialStatementToExcel({
      title: isAr ? "سجل الشيكات الآجلة وأوراق القبض" : "Post-Dated Cheques Register",
      organizationName,
      currency: currencyLabel,
      columns: [
        { header: isAr ? "رقم الشيك" : "Cheque Number", key: "number" },
        { header: isAr ? "البنك المسحوب عليه" : "Bank", key: "bank" },
        { header: isAr ? "الساحب / الطرف" : "Drawer", key: "drawer" },
        { header: isAr ? "المستفيد" : "Beneficiary", key: "beneficiary" },
        { header: isAr ? "النوع" : "Type", key: "type" },
        { header: isAr ? "تاريخ الاستحقاق" : "Due Date", key: "dueDate" },
        { header: isAr ? "مبلغ الشيك" : "Amount", key: "amount", isNumber: true },
        { header: isAr ? "الحالة" : "Status", key: "status" },
      ],
      rows: filteredRows.map((r) => ({
        number: r.number,
        bank: r.bankName,
        drawer: r.drawerName,
        beneficiary: r.beneficiaryName,
        type: r.type === "INCOMING" ? (isAr ? "وارد (قبض)" : "Incoming") : (isAr ? "صادر (دفع)" : "Outgoing"),
        dueDate: r.dueDate,
        amount: r.amount,
        status: r.status,
      })),
      filename: `PDC_Register_${new Date().toISOString().slice(0, 10)}.xlsx`,
    });
  };

  return (
    <div className="space-y-6 pb-12">
      {/* HEADER WITH BREADCRUMB */}
      <div className="rounded-3xl border border-slate-200/90 bg-white p-6 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-center lg:justify-between">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-600 dark:text-amber-400">
              <Link href="/finance/reports" className="hover:underline flex items-center gap-1">
                <ChevronLeft className="size-3.5 rtl:rotate-180" />
                <span>{isAr ? "مركز التقارير والقوائم المالية" : "Financial Reports"}</span>
              </Link>
              <span>/</span>
              <span className="text-slate-800 dark:text-slate-200 font-extrabold">
                {isAr ? "سجل الشيكات الآجلة (PDC)" : "PDC Cheques"}
              </span>
            </div>
            <h1 className="text-2xl font-black tracking-tight text-slate-950 dark:text-white sm:text-3xl">
              {isAr ? "سجل الشيكات الآجلة وأوراق القبض (PDC)" : "Post-Dated Cheques (PDC) Register"}
            </h1>
            <p className="text-xs text-slate-500 max-w-2xl font-medium">
              {isAr
                ? "إدارة ومراقبة أوراق القبض والشيكات البنكية تحت التحصيل، تتبع جداول الاستحقاق، ومتابعة التحصيل والمقاصة البنكية."
                : "Comprehensive treasury register tracking post-dated cheques, maturity schedules, and bank deposit clearances."}
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
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "شيكات مقبوضة (واردة)" : "Incoming PDCs"}</span>
              <DollarSign className="size-4 text-blue-600" />
            </div>
            <p className="text-xl font-black text-blue-600 dark:text-blue-400 mt-1 font-mono">
              {metrics.incomingAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-slate-400 block mt-0.5">{isAr ? "أوراق قبض من العملاء" : "From tenants/owners"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "تستحق خلال 30 يوماً" : "Due Next 30 Days"}</span>
              <Clock className="size-4 text-amber-600" />
            </div>
            <p className="text-xl font-black text-amber-600 dark:text-amber-400 mt-1 font-mono">
              {metrics.dueIn30DaysAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-amber-600 font-bold block mt-0.5">
              {metrics.dueIn30DaysCount} {isAr ? "شيكات تستحق الإيداع" : "cheques to deposit"}
            </span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "شيكات تم تحصيلها" : "Cleared PDCs"}</span>
              <CheckCircle2 className="size-4 text-emerald-600" />
            </div>
            <p className="text-xl font-black text-emerald-600 dark:text-emerald-400 mt-1 font-mono">
              {metrics.clearedAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-emerald-600 font-bold block mt-0.5">{isAr ? "تمت مقاصتها بالبنك" : "Cleared in bank"}</span>
          </div>

          <div className="rounded-2xl bg-slate-50/80 p-3.5 border border-slate-200/60 dark:bg-slate-800/40 dark:border-slate-800">
            <div className="flex items-center justify-between">
              <span className="text-[11px] font-bold text-slate-500">{isAr ? "شيكات مرتجعة ومرفوضة" : "Bounced Cheques"}</span>
              <XCircle className="size-4 text-rose-600" />
            </div>
            <p className="text-xl font-black text-rose-600 dark:text-rose-400 mt-1 font-mono">
              {metrics.bouncedAmount.toLocaleString(undefined, { maximumFractionDigits: 0 })}
              <span className="text-xs font-bold text-slate-400 ms-1">{currencyLabel}</span>
            </p>
            <span className="text-[10px] text-rose-600 font-bold block mt-0.5">
              {metrics.bouncedCount} {isAr ? "شيكات تحتاج متابعة قانونية" : "requires legal recovery"}
            </span>
          </div>
        </div>
      </div>

      {/* FILTER CONTROLS */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs">
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          {/* TYPE FILTER */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="ALL">{isAr ? "جميع الأنواع (وارد وصادر)" : "All Types"}</option>
            <option value="INCOMING">{isAr ? "شيكات واردة (أوراق قبض)" : "Incoming PDCs"}</option>
            <option value="OUTGOING">{isAr ? "شيكات صادرة (أوراق دفع)" : "Outgoing PDCs"}</option>
          </select>

          {/* STATUS FILTER */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="h-9 rounded-xl border border-slate-200 bg-slate-50 px-3 text-xs font-bold text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-white"
          >
            <option value="ALL">{isAr ? "كافة الحالات" : "All Statuses"}</option>
            <option value="RECEIVED">{isAr ? "مستلم بالخزينة" : "Received"}</option>
            <option value="DEPOSITED">{isAr ? "مودع للتحصيل بالبنك" : "Deposited"}</option>
            <option value="CLEARED">{isAr ? "تم التحصيل والمقاصة" : "Cleared"}</option>
            <option value="BOUNCED">{isAr ? "مرتجع / مرفوض" : "Bounced"}</option>
          </select>
        </div>

        {/* SEARCH */}
        <div className="relative w-full sm:w-64">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? "بحث برقم الشيك، الساحب، البنك..." : "Search cheque, drawer, bank..."}
            className="ps-9 text-xs h-9 bg-slate-50 dark:bg-slate-800"
          />
        </div>
      </div>

      {/* TABLE WITH LIGHT THEME HEADER */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-50/90 text-slate-800 dark:bg-slate-800 dark:text-slate-200 font-extrabold border-b border-slate-200 dark:border-slate-700">
              <tr>
                <th className="p-3.5 text-start">{isAr ? "رقم الشيك" : "Cheque #"}</th>
                <th className="p-3.5 text-start">{isAr ? "البنك المسحوب عليه" : "Bank"}</th>
                <th className="p-3.5 text-start">{isAr ? "الساحب / الطرف المقابل" : "Drawer / Customer"}</th>
                <th className="p-3.5 text-center">{isAr ? "النوع" : "Type"}</th>
                <th className="p-3.5 text-center">{isAr ? "تاريخ الاستحقاق" : "Maturity Date"}</th>
                <th className="p-3.5 text-end">{isAr ? "مبلغ الشيك" : "Amount"}</th>
                <th className="p-3.5 text-center">{isAr ? "حالة الشيك" : "Status"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredRows.length ? (
                filteredRows.map((r) => (
                  <tr
                    key={r.id}
                    className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                  >
                    <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-white">
                      <div className="flex items-center gap-1.5">
                        <CreditCard className="size-3.5 text-amber-600 shrink-0" />
                        <span>{r.number}</span>
                      </div>
                    </td>

                    <td className="p-3.5 font-bold text-slate-800 dark:text-slate-200">
                      {r.bankName}
                    </td>

                    <td className="p-3.5 text-slate-600 dark:text-slate-400 font-medium">
                      {r.drawerName}
                    </td>

                    <td className="p-3.5 text-center">
                      <Badge
                        variant="outline"
                        className={`text-[10px] font-bold ${
                          r.type === "INCOMING"
                            ? "bg-blue-50 text-blue-700 border-blue-200"
                            : "bg-purple-50 text-purple-700 border-purple-200"
                        }`}
                      >
                        {r.type === "INCOMING" ? (isAr ? "وارد (قبض)" : "Incoming") : (isAr ? "صادر (دفع)" : "Outgoing")}
                      </Badge>
                    </td>

                    <td className="p-3.5 text-center font-mono text-[11px] font-bold text-slate-700 dark:text-slate-300">
                      {r.dueDate}
                    </td>

                    <td className="p-3.5 text-end font-mono font-black text-sm text-slate-900 dark:text-white">
                      {r.amount.toLocaleString()}{" "}
                      <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                    </td>

                    <td className="p-3.5 text-center">
                      {r.status === "CLEARED" && (
                        <Badge className="text-[10px] font-bold bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300">
                          {isAr ? "✓ تم التحصيل" : "Cleared"}
                        </Badge>
                      )}
                      {r.status === "DEPOSITED" && (
                        <Badge className="text-[10px] font-bold bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300">
                          {isAr ? "مودع بالبنك" : "Deposited"}
                        </Badge>
                      )}
                      {r.status === "RECEIVED" && (
                        <Badge variant="outline" className="text-[10px] font-bold bg-amber-50 text-amber-700 border-amber-200">
                          {isAr ? "مستلم بالخزينة" : "In Safe"}
                        </Badge>
                      )}
                      {r.status === "BOUNCED" && (
                        <Badge className="text-[10px] font-bold bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300 animate-pulse">
                          {isAr ? "✕ مرتجع" : "Bounced"}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-slate-400 text-xs">
                    {isAr ? "لا توجد شيكات مطابقة لمعايير البحث" : "No cheques found matching filters"}
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
