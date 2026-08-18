"use client";

import { useState, useMemo } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  UserCheck,
  Plus,
  Tag,
  Search,
  ArrowUpDown,
  Filter,
  Layers,
  Calendar,
  CreditCard,
  Building2,
  ExternalLink,
  FileText,
  DollarSign,
  FileCheck,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Download,
  Printer,
  PieChart,
  BarChart3,
  FileSpreadsheet,
  Send,
  Share2,
  Clock,
  CheckCircle,
  Percent,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { getCurrencyLabel } from "@/lib/currency";
import { tafqeetArabic } from "@/lib/tafqeet";
import {
  CreateBrokerDialog,
  AccrueCommissionDialog,
  PayCommissionDialog,
  ManageBrokersDialog,
  ConfigureCommissionAccountsDialog,
  type Option,
  type BrokerItem,
} from "./commission-dialogs";
import { buildCommissionsXlsxBuffer, downloadXlsxBuffer } from "./commissions-excel";
import { generateCommissionVoucherPdf } from "@/lib/reports/commission-voucher-pdf";
import { generateCommissionsReportPdf } from "@/lib/reports/commissions-report-pdf";
import { Settings2 } from "lucide-react";

export type CommissionRow = {
  id: string;
  broker_id: string;
  property_id?: string | null;
  gross_amount: number;
  wht_amount: number;
  net_amount: number;
  wht_rate?: number | null;
  rate_percent?: number | null;
  basis_amount?: number | null;
  earned_date: string;
  paid_date?: string | null;
  status: "ACCRUED" | "PAID" | string;
  note?: string | null;
  cash_account_id?: string | null;
  payment_journal_entry_id?: string | null;
  accrual_journal_entry_id?: string | null;
};

export function CommissionsClient({
  commissions,
  brokers,
  brokerList,
  properties,
  cashAccounts,
  liabilityAccounts,
  expenseAccounts = [],
  isAccountsConfigured = true,
  initialExpenseAccountId,
  initialPayableAccountId,
  organizationId,
  organizationName = "AqarBooks",
  currency = "EGP",
  canManage = true,
  locale,
}: {
  commissions: CommissionRow[];
  brokers: Option[];
  brokerList: BrokerItem[];
  properties: Option[];
  cashAccounts: Option[];
  liabilityAccounts: Option[];
  expenseAccounts?: Option[];
  isAccountsConfigured?: boolean;
  initialExpenseAccountId?: string | null;
  initialPayableAccountId?: string | null;
  organizationId: string;
  organizationName?: string;
  currency?: string;
  canManage?: boolean;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  // Dialog states
  const [accrueOpen, setAccrueOpen] = useState(false);
  const [createBrokerOpen, setCreateBrokerOpen] = useState(false);
  const [manageBrokersOpen, setManageBrokersOpen] = useState(false);
  const [configureAccountsOpen, setConfigureAccountsOpen] = useState(false);
  const [payingCommission, setPayingCommission] = useState<CommissionRow | null>(null);
  const [selectedCommission, setSelectedCommission] = useState<CommissionRow | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  // Filters state
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "ACCRUED" | "PAID">("ALL");
  const [selectedBroker, setSelectedBroker] = useState<string>("ALL");
  const [sortBy, setSortBy] = useState<
    "date_desc" | "date_asc" | "net_desc" | "net_asc"
  >("date_desc");

  // Maps
  const brokerMap = useMemo(
    () => new Map(brokerList.map((b) => [b.id, b.name])),
    [brokerList]
  );
  const brokerDetailsMap = useMemo(
    () => new Map(brokerList.map((b) => [b.id, b])),
    [brokerList]
  );
  const propertyMap = useMemo(
    () => new Map(properties.map((p) => [p.id, p.label])),
    [properties]
  );
  const cashAccountMap = useMemo(
    () => new Map(cashAccounts.map((a) => [a.id, a.label])),
    [cashAccounts]
  );

  // Filtered Commissions
  const filteredCommissions = useMemo(() => {
    return commissions
      .filter((c) => {
        // Status filter
        if (statusFilter !== "ALL" && c.status !== statusFilter) {
          return false;
        }
        // Broker filter
        if (selectedBroker !== "ALL" && c.broker_id !== selectedBroker) {
          return false;
        }
        // Search query filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const bName = (brokerMap.get(c.broker_id) || "").toLowerCase();
          const pName = (c.property_id ? propertyMap.get(c.property_id) || "" : "").toLowerCase();
          const noteText = (c.note || "").toLowerCase();
          const amountText = `${c.gross_amount} ${c.net_amount} ${c.wht_amount}`;
          return (
            bName.includes(q) ||
            pName.includes(q) ||
            noteText.includes(q) ||
            amountText.includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === "date_desc") {
          return new Date(b.earned_date).getTime() - new Date(a.earned_date).getTime();
        }
        if (sortBy === "date_asc") {
          return new Date(a.earned_date).getTime() - new Date(b.earned_date).getTime();
        }
        if (sortBy === "net_desc") {
          return b.net_amount - a.net_amount;
        }
        if (sortBy === "net_asc") {
          return a.net_amount - b.net_amount;
        }
        return 0;
      });
  }, [commissions, statusFilter, selectedBroker, searchQuery, sortBy, brokerMap, propertyMap]);

  // Quick Print Voucher
  const handlePrintVoucher = (c: CommissionRow) => {
    const broker = brokerDetailsMap.get(c.broker_id);
    generateCommissionVoucherPdf(
      {
        organizationName,
        brokerName: brokerMap.get(c.broker_id) || "—",
        brokerType: broker?.broker_type,
        taxId: broker?.tax_id,
        phone: broker?.phone,
        propertyName: c.property_id ? propertyMap.get(c.property_id) : undefined,
        grossAmount: c.gross_amount,
        whtRate: c.wht_rate,
        whtAmount: c.wht_amount,
        netAmount: c.net_amount,
        basisAmount: c.basis_amount,
        ratePercent: c.rate_percent,
        earnedDate: c.earned_date,
        paidDate: c.paid_date,
        cashAccountName: c.cash_account_id ? cashAccountMap.get(c.cash_account_id) : undefined,
        note: c.note,
        currencyCode: currency,
        currencyLabel,
        paymentJournalEntryId: c.payment_journal_entry_id,
        accrualJournalEntryId: c.accrual_journal_entry_id,
      },
      locale
    );
  };

  // WhatsApp Share
  const handleWhatsAppShare = (c: CommissionRow) => {
    const brokerName = brokerMap.get(c.broker_id) || "—";
    const formattedNet = c.net_amount.toLocaleString(isAr ? "ar-EG" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const formattedGross = c.gross_amount.toLocaleString(isAr ? "ar-EG" : "en-US", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const tafqeetText = tafqeetArabic(c.net_amount, currency);
    const propName = c.property_id ? propertyMap.get(c.property_id) || "—" : "—";
    const statusText = c.status === "PAID" ? (isAr ? "مسددة ومصروفة" : "Paid") : isAr ? "مستحقة بالذمة" : "Accrued";

    const text = isAr
      ? `💼 *بيان استحقاق وسداد عمولة — ${organizationName}*
━━━━━━━━━━━━━━━━━━━━
👤 *الوسيط:* ${brokerName}
🏢 *المشروع / العقار:* ${propName}
📅 *تاريخ الاستحقاق:* ${c.earned_date}
${c.paid_date ? `💳 *تاريخ السداد:* ${c.paid_date}` : ""}
💰 *الإجمالي المستحق:* ${formattedGross} ${currencyLabel}
${c.wht_amount > 0 ? `🔻 *خصم المنبع (${c.wht_rate}%):* - ${c.wht_amount.toLocaleString()} ${currencyLabel}` : ""}
💵 *صافي العمولة:* ${formattedNet} ${currencyLabel}
✍️ *المبلغ بالحروف:* ${tafqeetText}
📊 *الحالة:* ${statusText}
${c.note ? `📝 *ملاحظات:* ${c.note}` : ""}
━━━━━━━━━━━━━━━━━━━━
_نظام AqarBooks المالي_`
      : `💼 *Broker Commission Statement — ${organizationName}*
━━━━━━━━━━━━━━━━━━━━
👤 *Broker:* ${brokerName}
🏢 *Property:* ${propName}
📅 *Earned Date:* ${c.earned_date}
${c.paid_date ? `💳 *Paid Date:* ${c.paid_date}` : ""}
💰 *Gross Amount:* ${formattedGross} ${currencyLabel}
${c.wht_amount > 0 ? `🔻 *Withheld Tax (${c.wht_rate}%):* - ${c.wht_amount.toLocaleString()} ${currencyLabel}` : ""}
💵 *Net Amount:* ${formattedNet} ${currencyLabel}
✍️ *In Words:* ${tafqeetText}
📊 *Status:* ${statusText}
━━━━━━━━━━━━━━━━━━━━
_AqarBooks Financial Suite_`;

    window.open(
      `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`,
      "_blank",
      "noopener,noreferrer"
    );
  };

  // Excel Export Handler
  const handleExportExcel = async () => {
    try {
      setIsExporting(true);
      const buffer = await buildCommissionsXlsxBuffer(
        filteredCommissions,
        brokerMap,
        propertyMap,
        currencyLabel,
        isAr
      );
      const dateStr = new Date().toISOString().split("T")[0];
      downloadXlsxBuffer(`Commissions_Report_${dateStr}.xlsx`, buffer);
    } catch (err) {
      console.error("Excel export error:", err);
    } finally {
      setIsExporting(false);
    }
  };

  // PDF Export Handler
  const handleExportPdf = () => {
    generateCommissionsReportPdf(
      {
        organizationName,
        currencyCode: currency,
        currencyLabel,
        commissions: filteredCommissions.map((c) => ({
          id: c.id,
          brokerName: brokerMap.get(c.broker_id) || "—",
          propertyName: c.property_id ? propertyMap.get(c.property_id) : undefined,
          earnedDate: c.earned_date,
          paidDate: c.paid_date,
          grossAmount: c.gross_amount,
          whtAmount: c.wht_amount,
          whtRate: c.wht_rate,
          netAmount: c.net_amount,
          status: c.status,
          note: c.note,
        })),
        filterStatus:
          statusFilter === "ACCRUED"
            ? isAr ? "مستحقة فقط" : "Accrued Only"
            : statusFilter === "PAID"
            ? isAr ? "مسددة فقط" : "Paid Only"
            : undefined,
      },
      locale
    );
  };

  const statusTabs = [
    { id: "ALL", label: isAr ? "جميع العمولات" : "All", count: commissions.length },
    {
      id: "ACCRUED",
      label: isAr ? "مستحقة (معلقة)" : "Accrued",
      count: commissions.filter((c) => c.status === "ACCRUED").length,
    },
    {
      id: "PAID",
      label: isAr ? "مسددة" : "Paid",
      count: commissions.filter((c) => c.status === "PAID").length,
    },
  ];

  return (
    <div className="space-y-6">
      {/* ── Top Header Controls ─────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <UserCheck className="size-5 text-blue-600 dark:text-blue-400" />
            <span>{isAr ? "سجل استحقاقات وسداد العمولات" : "Commission Accruals & Payouts"}</span>
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            {isAr
              ? "متابعة استحقاقات الوسطاء ومسوقي العقارات والخصم من المنبع وترحيل القيود آلياً."
              : "Track broker accruals, withholding tax liabilities, and payment settlement vouchers."}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Excel Export */}
          <Button
            type="button"
            variant="outline"
            onClick={handleExportExcel}
            disabled={isExporting || !filteredCommissions.length}
            className="text-xs font-bold gap-1.5 h-9"
          >
            <FileSpreadsheet className="size-3.5 text-emerald-600 dark:text-emerald-400" />
            <span>{isExporting ? (isAr ? "جارٍ التصدير..." : "Exporting...") : (isAr ? "تصدير Excel" : "Export Excel")}</span>
          </Button>

          {/* PDF Export */}
          <Button
            type="button"
            variant="outline"
            onClick={handleExportPdf}
            disabled={!filteredCommissions.length}
            className="text-xs font-bold gap-1.5 h-9"
          >
            <FileText className="size-3.5 text-rose-600 dark:text-rose-400" />
            <span>{isAr ? "تصدير PDF" : "Export PDF"}</span>
          </Button>

          {/* Manage Brokers */}
          <Button
            type="button"
            variant="outline"
            onClick={() => setManageBrokersOpen(true)}
            className="text-xs font-bold gap-1.5 h-9"
          >
            <Building2 className="size-3.5 text-purple-600 dark:text-purple-400" />
            <span>{isAr ? "دليل الوسطاء" : "Brokers"}</span>
          </Button>

          {/* Account Setup Button */}
          {canManage && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setConfigureAccountsOpen(true)}
              className={`text-xs font-bold gap-1.5 h-9 ${
                !isAccountsConfigured
                  ? "border-amber-400 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
                  : ""
              }`}
            >
              <Settings2 className="size-3.5 text-slate-600 dark:text-slate-400" />
              <span>{isAr ? "تهيئة الحسابات" : "Account Setup"}</span>
            </Button>
          )}

          {/* Add Broker */}
          {canManage && (
            <Button
              type="button"
              variant="outline"
              onClick={() => setCreateBrokerOpen(true)}
              className="text-xs font-bold gap-1.5 h-9"
            >
              <Plus className="size-3.5 text-blue-600" />
              <span>{isAr ? "إضافة وسيط" : "Add Broker"}</span>
            </Button>
          )}

          {/* Accrue Commission Button */}
          {canManage && (
            <Button
              type="button"
              onClick={() => setAccrueOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5 h-9 shadow-sm cursor-pointer"
            >
              <Plus className="size-4" />
              <span>{isAr ? "تسجيل استحقاق عمولة" : "Accrue Commission"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* ── Finance Settings Configuration Warning Banner ─────────── */}
      {!isAccountsConfigured && (
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 rounded-2xl border-2 border-amber-300 bg-amber-50/90 p-4 text-xs font-semibold text-amber-950 dark:border-amber-800 dark:bg-amber-950/60 dark:text-amber-200">
          <div className="flex items-center gap-2.5">
            <div className="flex size-9 items-center justify-center rounded-xl bg-amber-500/20 text-amber-700 dark:text-amber-300 shrink-0">
              <Settings2 className="size-5" />
            </div>
            <div>
              <p className="font-bold text-sm text-amber-950 dark:text-white">
                {isAr ? "يلزم تهيئة حسابات العمولات في دليل الحسابات" : "Commission accounts setup required"}
              </p>
              <p className="text-amber-800/80 dark:text-amber-300/80 text-xs mt-0.5">
                {isAr
                  ? "لتسجيل استحقاقات العمولات وترحيل القيود المزدوجة، يرجى تحديد حساب المصروف وحساب الالتزام."
                  : "To accrue commissions and auto-post journals, link expense and payable accounts."}
              </p>
            </div>
          </div>

          <Button
            type="button"
            onClick={() => setConfigureAccountsOpen(true)}
            className="bg-amber-600 hover:bg-amber-700 text-white font-bold gap-1.5 h-9 self-start sm:self-auto cursor-pointer shadow-xs"
          >
            <Settings2 className="size-4" />
            <span>{isAr ? "تهيئة الحسابات الآن" : "Configure Accounts"}</span>
          </Button>
        </div>
      )}

      {/* ── Status Pills & Search Toolbar ───────────────────────────── */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 rounded-2xl border border-slate-200/90 bg-white p-3.5 shadow-2xs dark:border-slate-800 dark:bg-slate-900/60">
        
        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
          {statusTabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id as typeof statusFilter)}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                statusFilter === tab.id
                  ? "bg-white text-slate-900 shadow-xs dark:bg-slate-900 dark:text-white"
                  : "text-slate-500 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
              }`}
            >
              <span>{tab.label}</span>
              <span className="text-[10px] font-mono px-1.5 py-0.2 rounded-full bg-slate-200/70 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                {tab.count}
              </span>
            </button>
          ))}
        </div>

        {/* Search & Select Filters */}
        <div className="flex items-center gap-2.5 flex-1 max-w-xl">
          {/* Search bar */}
          <div className="relative flex-1">
            <div className="absolute inset-y-0 start-0 flex items-center ps-3 pointer-events-none text-slate-400">
              <Search className="size-4" />
            </div>
            <Input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={
                isAr
                  ? "البحث باسم الوسيط، العقار، البيان، أو المبلغ..."
                  : "Search by broker, property, note, or amount..."
              }
              className="ps-9 pe-4 h-9 text-xs bg-slate-50/70 dark:bg-slate-950/40 border-slate-200 dark:border-slate-800"
            />
          </div>

          {/* Broker Filter */}
          <Select
            value={selectedBroker}
            onValueChange={(val) => setSelectedBroker(val ?? "ALL")}
            items={[
              { value: "ALL", label: isAr ? "كل الوسطاء" : "All Brokers" },
              ...brokerList.map((b) => ({ value: b.id, label: b.name })),
            ]}
          >
            <SelectTrigger className="h-9 min-w-[140px] text-xs bg-slate-50/70 dark:bg-slate-950/40">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL" className="text-xs">{isAr ? "كل الوسطاء" : "All Brokers"}</SelectItem>
              {brokerList.map((b) => (
                <SelectItem key={b.id} value={b.id} className="text-xs">
                  {b.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* ── Table Container ─────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200/90 bg-white shadow-xs dark:border-slate-800 dark:bg-slate-900">
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[180px]">{isAr ? "الوسيط" : "Broker"}</TableHead>
                <TableHead className="w-[170px]">{isAr ? "المشروع / الصفقة" : "Property / Deal"}</TableHead>
                <TableHead className="w-[130px]">{isAr ? "الاستحقاق" : "Earned Date"}</TableHead>
                <TableHead className="w-[130px] text-end">{isAr ? "الإجمالي" : "Gross"}</TableHead>
                <TableHead className="w-[120px] text-end">{isAr ? "خصم المنبع" : "Withheld"}</TableHead>
                <TableHead className="w-[140px] text-end">{isAr ? "الصافي المستحق" : "Net Payable"}</TableHead>
                <TableHead className="w-[130px] text-center">{isAr ? "الحالة" : "Status"}</TableHead>
                <TableHead className="w-[140px] text-end">{isAr ? "الإجراءات" : "Actions"}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredCommissions.length ? (
                filteredCommissions.map((c) => {
                  const isPaid = c.status === "PAID";
                  const broker = brokerDetailsMap.get(c.broker_id);

                  return (
                    <TableRow
                      key={c.id}
                      onClick={() => setSelectedCommission(c)}
                      className="cursor-pointer transition-colors hover:bg-slate-50/80 dark:hover:bg-slate-800/50"
                    >
                      {/* Broker Name & Type */}
                      <TableCell className="py-3.5">
                        <div className="space-y-0.5">
                          <p className="font-bold text-slate-900 dark:text-white text-sm">
                            {brokerMap.get(c.broker_id) ?? "—"}
                          </p>
                          <span
                            className={`inline-block text-[10px] font-bold px-2 py-0.2 rounded-full ${
                              broker?.broker_type === "INTERNAL"
                                ? "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300"
                                : "bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300 border border-blue-200/60 dark:border-blue-900/60"
                            }`}
                          >
                            {broker?.broker_type === "INTERNAL"
                              ? isAr ? "مندوب داخلي" : "Internal"
                              : isAr ? "مكتب خارجي" : "External Agency"}
                          </span>
                        </div>
                      </TableCell>

                      {/* Property / Deal */}
                      <TableCell className="py-3.5">
                        <div className="text-xs">
                          <p className="font-semibold text-slate-800 dark:text-slate-200">
                            {(c.property_id ? propertyMap.get(c.property_id) : "") || "—"}
                          </p>
                          {c.note && (
                            <p className="text-slate-400 truncate max-w-[150px] mt-0.5">
                              {c.note}
                            </p>
                          )}
                        </div>
                      </TableCell>

                      {/* Earned Date & Calculation info */}
                      <TableCell className="py-3.5 text-xs text-slate-500 dark:text-slate-400">
                        <div className="space-y-0.5">
                          <div className="inline-flex items-center gap-1 font-mono">
                            <Calendar className="size-3 text-slate-400" />
                            <span>{c.earned_date}</span>
                          </div>
                          {c.rate_percent !== null && c.rate_percent !== undefined && (
                            <p className="text-[10px] text-slate-400 font-mono">
                              {c.rate_percent}% {isAr ? "من" : "of"} {c.basis_amount?.toLocaleString()}
                            </p>
                          )}
                        </div>
                      </TableCell>

                      {/* Gross Amount */}
                      <TableCell className="py-3.5 text-end font-mono text-xs font-semibold text-slate-700 dark:text-slate-300">
                        {c.gross_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </TableCell>

                      {/* Withheld Tax (WHT) */}
                      <TableCell className="py-3.5 text-end">
                        {c.wht_amount > 0 ? (
                          <div className="text-rose-600 font-mono text-xs font-semibold">
                            <span>- {c.wht_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                            <span className="block text-[10px] text-slate-400">({c.wht_rate}%)</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 text-xs">—</span>
                        )}
                      </TableCell>

                      {/* Net Amount */}
                      <TableCell className="py-3.5 text-end font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                        <div className="inline-flex items-baseline gap-1 justify-end">
                          <span>{c.net_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
                          <span className="text-[10px] font-bold text-slate-400">{currencyLabel}</span>
                        </div>
                      </TableCell>

                      {/* Status */}
                      <TableCell className="py-3.5 text-center" onClick={(e) => e.stopPropagation()}>
                        {isPaid ? (
                          <div className="inline-flex flex-col items-center gap-0.5">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 border border-emerald-300/60">
                              <CheckCircle className="size-3" />
                              <span>{isAr ? "مسددة" : "Paid"}</span>
                            </span>
                            {c.paid_date && (
                              <span className="text-[10px] font-mono text-slate-400">{c.paid_date}</span>
                            )}
                          </div>
                        ) : (
                          <div className="inline-flex flex-col items-center gap-1">
                            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-300 border border-amber-300/60">
                              <Clock className="size-3" />
                              <span>{isAr ? "مستحقة" : "Accrued"}</span>
                            </span>
                            {canManage && (
                              <Button
                                type="button"
                                size="sm"
                                onClick={() => setPayingCommission(c)}
                                className="h-6 px-2 text-[11px] bg-emerald-600 hover:bg-emerald-700 text-white font-bold gap-1"
                              >
                                <CreditCard className="size-3" />
                                <span>{isAr ? "سداد" : "Pay"}</span>
                              </Button>
                            )}
                          </div>
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell className="py-3.5 text-end" onClick={(e) => e.stopPropagation()}>
                        <div className="inline-flex items-center gap-1.5 justify-end">
                          {/* WhatsApp Share */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handleWhatsAppShare(c)}
                            title={isAr ? "مشاركة عبر واتساب" : "Share via WhatsApp"}
                            className="h-7 w-7 p-0 text-slate-500 hover:text-emerald-600"
                          >
                            <Send className="size-3.5" />
                          </Button>

                          {/* Print/PDF Voucher */}
                          <Button
                            type="button"
                            variant="ghost"
                            size="sm"
                            onClick={() => handlePrintVoucher(c)}
                            title={isAr ? "طباعة وتحميل PDF" : "Print / PDF Voucher"}
                            className="h-7 w-7 p-0 text-slate-500 hover:text-blue-600"
                          >
                            <Printer className="size-3.5" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              ) : (
                <TableRow>
                  <TableCell colSpan={8} className="py-16 text-center">
                    <div className="mx-auto flex size-14 items-center justify-center rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-400 mb-3">
                      <UserCheck className="size-7" />
                    </div>
                    <h3 className="text-sm font-bold text-slate-800 dark:text-slate-200">
                      {searchQuery || statusFilter !== "ALL" || selectedBroker !== "ALL"
                        ? isAr ? "لا توجد عمولات تطابق معايير البحث" : "No commissions match your filters"
                        : isAr ? "لا توجد عمولات وسطاء مسجلة بعد" : "No broker commissions recorded yet"}
                    </h3>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      {searchQuery || statusFilter !== "ALL" || selectedBroker !== "ALL"
                        ? isAr ? "جرب تعديل خيارات البحث أو إعادة ضبط الفلاتر." : "Try adjusting your search query or filters."
                        : isAr ? "ابدأ بإثبات استحقاق أول عمولة لوسيط عقاري." : "Start by accruing your first broker commission."}
                    </p>
                    {canManage && !searchQuery && statusFilter === "ALL" && selectedBroker === "ALL" && (
                      <div className="mt-4">
                        <Button
                          type="button"
                          onClick={() => setAccrueOpen(true)}
                          size="sm"
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5"
                        >
                          <Plus className="size-3.5" />
                          <span>{isAr ? "تسجيل أول عمولة" : "Accrue First Commission"}</span>
                        </Button>
                      </div>
                    )}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>

        {/* Table Footer Live Subtotal */}
        <div className="flex items-center justify-between border-t border-slate-200/90 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 px-4 py-3 text-xs text-slate-500 flex-wrap gap-2">
          <span>
            {isAr
              ? `عرض ${filteredCommissions.length} من إجمالي ${commissions.length} حركة عمولة`
              : `Showing ${filteredCommissions.length} of ${commissions.length} commissions`}
          </span>
          <div className="flex items-center gap-4 font-mono font-bold">
            <span>
              {isAr ? "الإجمالي: " : "Gross: "}
              <span className="text-slate-800 dark:text-slate-200">
                {filteredCommissions.reduce((s, c) => s + c.gross_amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </span>
            <span>
              {isAr ? "الضريبة: " : "WHT: "}
              <span className="text-rose-600">
                {filteredCommissions.reduce((s, c) => s + c.wht_amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
            </span>
            <span>
              {isAr ? "الصافي: " : "Net: "}
              <span className="text-emerald-600 dark:text-emerald-400 text-sm">
                {filteredCommissions.reduce((s, c) => s + c.net_amount, 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} {currencyLabel}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* ── Commission Details Dialog ───────────────────────────────── */}
      {selectedCommission && (
        <Dialog open={!!selectedCommission} onOpenChange={(open) => !open && setSelectedCommission(null)}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <div className="flex size-10 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
                <FileCheck className="size-5" />
              </div>
              <div>
                <DialogTitle>{isAr ? "تفاصيل استحقاق العمولة" : "Commission Details"}</DialogTitle>
                <DialogDescription>
                  {isAr ? "بيانات الوسيط والصفقة والخصم الضريبي" : "Broker, property, and withholding tax breakdown"}
                </DialogDescription>
              </div>
            </DialogHeader>

            <DialogBody className="space-y-4">
              <div className="rounded-xl border border-slate-200/90 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-900/50 p-4 space-y-3">
                <div className="flex items-center justify-between border-b border-slate-200 dark:border-slate-800 pb-2.5">
                  <span className="text-xs text-slate-500">{isAr ? "الوسيط المستحق" : "Broker"}</span>
                  <span className="font-bold text-slate-900 dark:text-white">
                    {brokerMap.get(selectedCommission.broker_id) ?? "—"}
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-slate-400 block">{isAr ? "المشروع / العقار" : "Property"}</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 block mt-0.5">
                      {(selectedCommission.property_id ? propertyMap.get(selectedCommission.property_id) : "") || "—"}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">{isAr ? "تاريخ الاستحقاق" : "Earned Date"}</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200 block mt-0.5">
                      {selectedCommission.earned_date}
                    </span>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs pt-1 border-t border-slate-200 dark:border-slate-800">
                  <div>
                    <span className="text-slate-400 block">{isAr ? "المبلغ الإجمالي" : "Gross Amount"}</span>
                    <span className="font-mono font-bold text-slate-800 dark:text-slate-200 block mt-0.5">
                      {selectedCommission.gross_amount.toLocaleString()} {currencyLabel}
                    </span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">{isAr ? `خصم المنبع (${selectedCommission.wht_rate || 0}%)` : "Withheld Tax"}</span>
                    <span className="font-mono font-bold text-rose-600 block mt-0.5">
                      - {selectedCommission.wht_amount.toLocaleString()} {currencyLabel}
                    </span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-slate-200 dark:border-slate-800">
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-300">{isAr ? "صافي المستحق للوسيط" : "Net Payable"}</span>
                  <span className="font-mono font-black text-emerald-600 dark:text-emerald-400 text-lg">
                    {selectedCommission.net_amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}{" "}
                    <span className="text-xs font-bold text-slate-400">{currencyLabel}</span>
                  </span>
                </div>

                {selectedCommission.note && (
                  <div className="text-xs pt-1 border-t border-slate-200 dark:border-slate-800">
                    <span className="text-slate-400 block">{isAr ? "البيان / الملاحظات" : "Notes"}</span>
                    <p className="font-medium text-slate-900 dark:text-slate-100 mt-0.5">
                      {selectedCommission.note}
                    </p>
                  </div>
                )}
              </div>
            </DialogBody>

            <DialogFooter className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 w-full">
              <div className="flex items-center gap-2">
                {/* WhatsApp */}
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (selectedCommission) handleWhatsAppShare(selectedCommission);
                  }}
                  className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 border-emerald-300 gap-1.5 text-xs font-bold"
                >
                  <Send className="size-3.5" />
                  <span>{isAr ? "إرسال واتساب" : "WhatsApp"}</span>
                </Button>

                {/* Print/PDF */}
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    if (selectedCommission) handlePrintVoucher(selectedCommission);
                  }}
                  className="bg-blue-600 hover:bg-blue-700 text-white gap-1.5 text-xs font-bold"
                >
                  <Printer className="size-3.5" />
                  <span>{isAr ? "طباعة سند / PDF" : "PDF / Print"}</span>
                </Button>
              </div>

              <Button variant="outline" size="sm" onClick={() => setSelectedCommission(null)}>
                {isAr ? "إغلاق" : "Close"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}

      {/* ── Dialogs: Accrue, Create Broker, Pay Commission, Manage Brokers, Settings ── */}
      <AccrueCommissionDialog
        open={accrueOpen}
        onOpenChange={setAccrueOpen}
        organizationId={organizationId}
        brokers={brokers}
        properties={properties}
        liabilityAccounts={liabilityAccounts}
        expenseAccounts={expenseAccounts}
        isAccountsConfigured={isAccountsConfigured}
        onOpenConfigureAccounts={() => setConfigureAccountsOpen(true)}
        currency={currency}
        locale={locale}
      />

      <ConfigureCommissionAccountsDialog
        open={configureAccountsOpen}
        onOpenChange={setConfigureAccountsOpen}
        organizationId={organizationId}
        expenseAccounts={expenseAccounts}
        liabilityAccounts={liabilityAccounts}
        initialExpenseAccountId={initialExpenseAccountId}
        initialPayableAccountId={initialPayableAccountId}
        locale={locale}
      />

      <CreateBrokerDialog
        open={createBrokerOpen}
        onOpenChange={setCreateBrokerOpen}
        organizationId={organizationId}
        locale={locale}
      />

      <ManageBrokersDialog
        open={manageBrokersOpen}
        onOpenChange={setManageBrokersOpen}
        brokers={brokerList}
        onAddNewBroker={() => setCreateBrokerOpen(true)}
        currency={currency}
        locale={locale}
      />

      {payingCommission && (
        <PayCommissionDialog
          open={!!payingCommission}
          onOpenChange={(open) => !open && setPayingCommission(null)}
          commissionId={payingCommission.id}
          brokerName={brokerMap.get(payingCommission.broker_id) || "—"}
          netAmount={payingCommission.net_amount}
          grossAmount={payingCommission.gross_amount}
          whtAmount={payingCommission.wht_amount}
          cashAccounts={cashAccounts}
          currency={currency}
          locale={locale}
        />
      )}
    </div>
  );
}
