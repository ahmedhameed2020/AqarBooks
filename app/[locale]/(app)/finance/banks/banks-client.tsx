"use client";

import { useState, useMemo } from "react";
import { Link } from "@/i18n/navigation";
import {
  Landmark,
  Building2,
  Plus,
  Search,
  CreditCard,
  FileCheck,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  XCircle,
  ArrowUpRight,
  Printer,
  FileSpreadsheet,
  Layers,
  Scale,
  Sparkles,
  ExternalLink,
  ChevronRight,
  ShieldCheck,
  DollarSign,
  Check,
  Download,
} from "lucide-react";
import ExcelJS from "exceljs";
import { generateFinancialStatementPdf } from "@/lib/reports/financial-statements-pdf";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCurrencyLabel } from "@/lib/currency";
import {
  CreateBankDialog,
  CreateBankAccountDialog,
  RecordChequeDialog,
  ClearChequeDialog,
  UpdateChequeStatusDialog,
  type Option,
} from "./banks-dialogs";
import { generateChequeVoucherPdf } from "@/lib/reports/cheque-voucher-pdf";

export type BankRow = {
  id: string;
  name_ar: string;
  name_en: string;
};

export type BankAccountRow = {
  id: string;
  bank_id: string;
  bank_name_ar?: string;
  bank_name_en?: string;
  account_name: string;
  account_number: string;
  gl_account_id?: string;
  gl_account_code?: string;
  gl_account_name?: string;
};

export type ChequeRow = {
  id: string;
  cheque_number: string;
  amount: number;
  status: "RECEIVED" | "DEPOSITED" | "CLEARED" | "RETURNED" | "CANCELLED" | string;
  due_date: string;
  cheque_date?: string;
  bank_account_id: string;
  bank_account_name?: string;
  bank_name?: string;
  member_id?: string | null;
  member_name?: string | null;
  direction?: string;
  note?: string | null;
};

export function BanksClient({
  banks,
  bankAccounts,
  cheques,
  assetAccounts,
  members,
  dues,
  organizationId,
  organizationName,
  resortId,
  resortName,
  fiscalPeriodId,
  canManageBanking = false,
  canManageCheques = false,
  currency = "EGP",
  locale,
}: {
  banks: BankRow[];
  bankAccounts: BankAccountRow[];
  cheques: ChequeRow[];
  assetAccounts: Option[];
  members: Option[];
  dues: Option[];
  organizationId: string;
  organizationName: string;
  resortId: string;
  resortName?: string;
  fiscalPeriodId?: string;
  canManageBanking?: boolean;
  canManageCheques?: boolean;
  currency?: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  // Active Tab: 'ACCOUNTS' | 'CHEQUES'
  const [activeTab, setActiveTab] = useState<"ACCOUNTS" | "CHEQUES">("ACCOUNTS");
  const [searchQuery, setSearchQuery] = useState("");
  const [chequeStatusFilter, setChequeStatusFilter] = useState<
    "ALL" | "RECEIVED" | "DEPOSITED" | "CLEARED" | "RETURNED"
  >("ALL");

  // Dialog Controls
  const [createBankOpen, setCreateBankOpen] = useState(false);
  const [createAccountOpen, setCreateAccountOpen] = useState(false);
  const [recordChequeOpen, setRecordChequeOpen] = useState(false);
  const [clearChequeTarget, setClearChequeTarget] = useState<ChequeRow | null>(null);
  const [updateStatusTarget, setUpdateStatusTarget] = useState<{
    cheque: ChequeRow;
    targetStatus: "DEPOSITED" | "RETURNED" | "CANCELLED";
  } | null>(null);

  // Bank Options for dialogs
  const bankOptions: Option[] = useMemo(
    () => banks.map((b) => ({ id: b.id, label: isAr ? b.name_ar : b.name_en })),
    [banks, isAr]
  );

  const bankAccountOptions: Option[] = useMemo(
    () => bankAccounts.map((a) => ({ id: a.id, label: `${a.account_name} (${a.account_number})` })),
    [bankAccounts]
  );

  // Filtered Cheques
  const filteredCheques = useMemo(() => {
    return cheques.filter((c) => {
      if (chequeStatusFilter !== "ALL") {
        if (c.status !== chequeStatusFilter) return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const no = c.cheque_number.toLowerCase();
        const member = (c.member_name || "").toLowerCase();
        const bank = (c.bank_name || "").toLowerCase();
        const amt = c.amount.toString();
        return no.includes(q) || member.includes(q) || bank.includes(q) || amt.includes(q);
      }
      return true;
    });
  }, [cheques, chequeStatusFilter, searchQuery]);

  // Handle Print Cheque Voucher
  const handlePrintChequeVoucher = (cheque: ChequeRow) => {
    generateChequeVoucherPdf(
      {
        organizationName,
        resortName,
        chequeNumber: cheque.cheque_number,
        bankName: cheque.bank_name || "—",
        accountName: cheque.bank_account_name,
        issuerName: cheque.member_name || undefined,
        amount: cheque.amount,
        chequeDate: cheque.cheque_date || cheque.due_date,
        dueDate: cheque.due_date,
        status: cheque.status,
        direction: cheque.direction,
        currencyCode: currency,
        currencyLabel,
        note: cheque.note,
      },
      locale
    );
  };

  const handleExportPdf = () => {
    if (activeTab === "ACCOUNTS") {
      generateFinancialStatementPdf(
        {
          title: isAr ? "دليل الحسابات البنكية للمنشأة" : "Company Bank Accounts Directory",
          subtitle: isAr ? "بيان الحسابات البنكية المعتمدة وأرقام الآيبان وحسابات الأستاذ العام" : "Bank accounts, IBAN numbers, and GL account mappings",
          organizationName: organizationName || "AqarBooks",
          currencyLabel: currency,
          dateRangeLabel: new Date().toISOString().slice(0, 10),
          columns: [
            { header: isAr ? "اسم الحساب" : "Account Name", key: "accName", align: "start", width: "25%" },
            { header: isAr ? "البنك" : "Bank", key: "bank", align: "start", width: "25%" },
            { header: isAr ? "رقم الحساب / الآيبان" : "Account # / IBAN", key: "accNum", align: "start", width: "30%" },
            { header: isAr ? "حساب الأستاذ العام" : "GL Account", key: "gl", align: "center", width: "20%" },
          ],
          rows: bankAccounts.map((acc) => ({
            accName: acc.account_name,
            bank: (isAr ? acc.bank_name_ar : acc.bank_name_en) || "—",
            accNum: acc.account_number,
            gl: acc.gl_account_code ? `${acc.gl_account_code} - ${acc.gl_account_name || ""}` : (isAr ? "1120 - البنوك" : "1120 - Banks"),
          })),
          summaryCards: [
            { label: isAr ? "عدد الحسابات البنكية" : "Total Bank Accounts", value: bankAccounts.length },
            { label: isAr ? "عدد البنوك المعتمدة" : "Total Banks", value: banks.length },
          ],
          includeCoverPage: false,
        },
        locale
      );
    } else {
      const totalAmount = filteredCheques.reduce((s, c) => s + c.amount, 0);
      const clearedAmount = filteredCheques.filter((c) => c.status === "CLEARED").reduce((s, c) => s + c.amount, 0);
      const inPortfolioAmount = filteredCheques.filter((c) => c.status === "RECEIVED" || c.status === "DEPOSITED").reduce((s, c) => s + c.amount, 0);

      generateFinancialStatementPdf(
        {
          title: isAr ? "حافظة الشيكات وأوراق القبض (PDC)" : "Cheques & Notes Receivable Portfolio",
          subtitle: isAr ? "بيان الشيكات الواردة وحالات التحصيل والإيداع وتواريخ الاستحقاق" : "Cheques log, drawer details, bank accounts, status and due dates",
          organizationName: organizationName || "AqarBooks",
          currencyLabel: currency,
          dateRangeLabel: new Date().toISOString().slice(0, 10),
          columns: [
            { header: isAr ? "رقم الشيك" : "Cheque #", key: "num", align: "start", width: "16%" },
            { header: isAr ? "الساحب / العميل" : "Drawer / Member", key: "drawer", align: "start", width: "24%" },
            { header: isAr ? "الحساب البنكي" : "Bank Account", key: "bankAcc", align: "start", width: "20%" },
            { header: isAr ? "تاريخ الاستحقاق" : "Due Date", key: "dueDate", align: "center", width: "14%" },
            { header: isAr ? "المبلغ" : "Amount", key: "amount", align: "end", isNumber: true, width: "14%" },
            { header: isAr ? "الحالة" : "Status", key: "status", align: "center", width: "12%" },
          ],
          rows: filteredCheques.map((c) => ({
            num: c.cheque_number,
            drawer: c.member_name || (isAr ? "عميل خارجي" : "External Client"),
            bankAcc: c.bank_account_name || c.bank_name || "—",
            dueDate: c.due_date,
            amount: c.amount,
            status:
              c.status === "CLEARED"
                ? isAr ? "محصل" : "Cleared"
                : c.status === "DEPOSITED"
                ? isAr ? "تحت التحصيل" : "Deposited"
                : c.status === "RETURNED"
                ? isAr ? "مرتد" : "Returned"
                : c.status === "CANCELLED"
                ? isAr ? "ملغى" : "Cancelled"
                : isAr ? "بالخزينة" : "Received",
          })),
          totalRow: {
            num: isAr ? "الإجمالي" : "Total",
            drawer: "",
            bankAcc: "",
            dueDate: "",
            amount: totalAmount,
            status: "",
          },
          summaryCards: [
            { label: isAr ? "إجمالي الشيكات" : "Total Cheques", value: filteredCheques.length },
            {
              label: isAr ? "شيكات تحت التحصيل" : "In Portfolio / Deposited",
              value: `${inPortfolioAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`,
            },
            {
              label: isAr ? "إجمالي الشيكات المحصلة" : "Total Cleared",
              value: `${clearedAmount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currency}`,
              highlight: true,
            },
          ],
          includeCoverPage: false,
        },
        locale
      );
    }
  };

  const handleExportExcel = async () => {
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "AqarBooks";
    workbook.created = new Date();

    if (activeTab === "ACCOUNTS") {
      const worksheet = workbook.addWorksheet(isAr ? "الحسابات البنكية" : "Bank Accounts", {
        views: [{ rightToLeft: isAr }],
      });
      worksheet.columns = [
        { header: isAr ? "اسم الحساب" : "Account Name", width: 25 },
        { header: isAr ? "البنك" : "Bank", width: 25 },
        { header: isAr ? "رقم الحساب / الآيبان" : "Account # / IBAN", width: 32 },
        { header: isAr ? "حساب الأستاذ العام" : "GL Account", width: 25 },
      ];
      worksheet.getRow(1).eachCell((c) => {
        c.font = { bold: true, color: { argb: "FFFFFFFF" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1E40AF" } };
      });
      for (const acc of bankAccounts) {
        worksheet.addRow([
          acc.account_name,
          (isAr ? acc.bank_name_ar : acc.bank_name_en) || "—",
          acc.account_number,
          acc.gl_account_code ? `${acc.gl_account_code} - ${acc.gl_account_name || ""}` : (isAr ? "1120 - البنوك" : "1120 - Banks"),
        ]);
      }
    } else {
      const worksheet = workbook.addWorksheet(isAr ? "حافظة الشيكات" : "Cheques Portfolio", {
        views: [{ rightToLeft: isAr }],
      });
      worksheet.columns = [
        { header: isAr ? "رقم الشيك" : "Cheque #", width: 18 },
        { header: isAr ? "الساحب / العميل" : "Drawer / Member", width: 28 },
        { header: isAr ? "الحساب البنكي" : "Bank Account", width: 25 },
        { header: isAr ? "تاريخ الاستحقاق" : "Due Date", width: 16 },
        { header: isAr ? "مبلغ الشيك" : "Amount", width: 18 },
        { header: isAr ? "الحالة" : "Status", width: 16 },
        { header: isAr ? "ملاحظات" : "Notes", width: 25 },
      ];
      worksheet.getRow(1).eachCell((c) => {
        c.font = { bold: true, color: { argb: "FFFFFFFF" } };
        c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF065F46" } };
      });
      for (const c of filteredCheques) {
        const row = worksheet.addRow([
          c.cheque_number,
          c.member_name || (isAr ? "عميل خارجي" : "External Client"),
          c.bank_account_name || c.bank_name || "—",
          c.due_date,
          c.amount,
          c.status,
          c.note || "—",
        ]);
        row.getCell(5).numFmt = "#,##0.00";
      }
    }

    const buffer = await workbook.xlsx.writeBuffer();
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `Banks_${activeTab}_${new Date().toISOString().slice(0, 10)}.xlsx`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN ACTION TOOLBAR & TABS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {/* Navigation Tabs */}
        <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-slate-100/80 p-1 dark:border-slate-800 dark:bg-slate-900">
          <button
            onClick={() => setActiveTab("ACCOUNTS")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeTab === "ACCOUNTS"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <Building2 className="size-3.5 text-blue-600" />
            <span>{isAr ? "الحسابات البنكية للمنشأة" : "Bank Accounts"}</span>
            <span className="rounded-full bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-mono dark:bg-slate-700">
              {bankAccounts.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("CHEQUES")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeTab === "CHEQUES"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <FileCheck className="size-3.5 text-emerald-600" />
            <span>{isAr ? "حافظة الشيكات وأوراق القبض" : "Cheques Portfolio"}</span>
            <span className="rounded-full bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-mono dark:bg-slate-700">
              {cheques.length}
            </span>
          </button>
        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            variant="outline"
            onClick={handleExportPdf}
            className="text-xs font-bold gap-1.5 h-9 border-slate-200 dark:border-slate-700"
          >
            <Printer className="size-3.5 text-purple-600" />
            <span>{isAr ? "طباعة / PDF" : "Print PDF"}</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            onClick={handleExportExcel}
            className="text-xs font-bold gap-1.5 h-9 border-slate-200 dark:border-slate-700"
          >
            <Download className="size-3.5 text-emerald-600" />
            <span>{isAr ? "تصدير Excel" : "Export Excel"}</span>
          </Button>

          <Link href="/finance/banks/reconciliation">
            <Button variant="outline" className="text-xs font-bold gap-1.5 h-9 border-blue-200 text-blue-700 hover:bg-blue-50 dark:border-blue-900 dark:text-blue-300">
              <Scale className="size-3.5" />
              <span>{isAr ? "التسوية البنكية ومطابقة الكشف" : "Bank Reconciliation"}</span>
            </Button>
          </Link>

          {canManageBanking && (
            <Button
              onClick={() => setCreateBankOpen(true)}
              variant="outline"
              className="text-xs font-bold gap-1.5 h-9"
            >
              <Landmark className="size-3.5 text-slate-500" />
              <span>{isAr ? "إضافة بنك" : "Add Bank"}</span>
            </Button>
          )}

          {canManageBanking && (
            <Button
              onClick={() => setCreateAccountOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs gap-1.5 h-9 shadow-sm"
            >
              <Plus className="size-3.5" />
              <span>{isAr ? "إضافة حساب بنكي" : "Add Account"}</span>
            </Button>
          )}

          {canManageCheques && (
            <Button
              onClick={() => setRecordChequeOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 h-9 shadow-sm"
            >
              <FileCheck className="size-3.5" />
              <span>{isAr ? "تسجيل شيك وارد" : "Record Cheque"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 1: BANK ACCOUNTS CARDS HUB
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "ACCOUNTS" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {bankAccounts.length ? (
              bankAccounts.map((acc) => {
                return (
                  <div
                    key={acc.id}
                    className="group relative rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm hover:shadow-md hover:border-slate-300 transition-all dark:border-slate-800 dark:bg-slate-900 flex flex-col justify-between"
                  >
                    <div>
                      {/* Card Header */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <div className="flex size-11 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400 font-bold shadow-sm">
                            <Landmark className="size-5" />
                          </div>
                          <div>
                            <h3 className="font-extrabold text-base text-slate-900 dark:text-white line-clamp-1">
                              {acc.account_name}
                            </h3>
                            <p className="text-xs text-slate-500 font-bold">
                              {isAr ? acc.bank_name_ar : acc.bank_name_en}
                            </p>
                          </div>
                        </div>

                        <Badge variant="outline" className="text-[10px] font-mono border-blue-200 bg-blue-50 text-blue-700 dark:border-blue-900 dark:bg-blue-950/40 dark:text-blue-300">
                          {isAr ? "حساب رسمي" : "Official"}
                        </Badge>
                      </div>

                      {/* Account Details Box */}
                      <div className="rounded-xl border border-slate-100 bg-slate-50/70 p-3.5 my-3 space-y-2 dark:border-slate-800 dark:bg-slate-900/50 text-xs">
                        <div>
                          <span className="text-slate-400 text-[11px] block">{isAr ? "رقم الحساب / الآيبان:" : "Account Number / IBAN:"}</span>
                          <span className="font-mono font-bold text-slate-800 dark:text-slate-200 select-all">
                            {acc.account_number}
                          </span>
                        </div>

                        <div className="border-t border-slate-200/60 dark:border-slate-800 pt-2 flex items-center justify-between">
                          <span className="text-slate-500">{isAr ? "حساب الأستاذ العام:" : "GL Account:"}</span>
                          <span className="font-mono font-bold text-blue-600 dark:text-blue-400">
                            {acc.gl_account_code ? `${acc.gl_account_code} — ${acc.gl_account_name || ""}` : (isAr ? "1120 — البنوك" : "1120 - Banks")}
                          </span>
                        </div>
                      </div>
                    </div>

                    {/* Quick Link to Reconciliation */}
                    <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                      <Link
                        href={`/finance/banks/reconciliation?accountId=${acc.id}`}
                        className="flex items-center justify-between text-xs font-bold text-blue-600 hover:text-blue-700 dark:text-blue-400 hover:underline pt-1"
                      >
                        <div className="flex items-center gap-1">
                          <Scale className="size-3.5" />
                          <span>{isAr ? "مطابقة وتسوية هذا الحساب" : "Reconcile Account"}</span>
                        </div>
                        <ChevronRight className="size-4 rtl:rotate-180" />
                      </Link>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
                <Building2 className="size-10 text-slate-400 mx-auto mb-3" />
                <h3 className="font-bold text-base text-slate-800 dark:text-slate-200 mb-1">
                  {isAr ? "لا توجد حسابات بنكية معرفة" : "No Bank Accounts Found"}
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mb-5">
                  {canManageBanking
                    ? isAr
                      ? "أضف الحسابات البنكية الخاصة بالمنشأة لربطها بشجرة الحسابات وإدارة الشيكات والتسويات البنكية."
                      : "Add bank accounts to manage cheques and automated bank reconciliations."
                    : isAr
                    ? "لم تُعرَّف حسابات بنكية بعد، وصلاحيتك على هذه الشاشة للاطلاع فقط."
                    : "No bank accounts have been defined yet, and your access here is view-only."}
                </p>
                {canManageBanking && (
                  <Button
                    onClick={() => setCreateAccountOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5"
                  >
                    <Plus className="size-4" />
                    <span>{isAr ? "إضافة حساب بنكي الآن" : "Add Bank Account"}</span>
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 2: CHEQUES PORTFOLIO TABLE
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "CHEQUES" && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="relative w-full sm:w-72">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? "بحث برقم الشيك أو العميل..." : "Search cheques..."}
                className="ps-9 text-xs h-9"
              />
            </div>

            <div className="flex items-center gap-1 self-stretch sm:self-auto flex-wrap">
              {(
                [
                  { key: "ALL", labelAr: "الكل", labelEn: "All" },
                  { key: "RECEIVED", labelAr: "مستلمة", labelEn: "Received" },
                  { key: "DEPOSITED", labelAr: "أودعت للتحصيل", labelEn: "Deposited" },
                  { key: "CLEARED", labelAr: "تم التحصيل", labelEn: "Cleared" },
                  { key: "RETURNED", labelAr: "مرتدة", labelEn: "Returned" },
                ] as const
              ).map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setChequeStatusFilter(tab.key)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    chequeStatusFilter === tab.key
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  }`}
                >
                  {isAr ? tab.labelAr : tab.labelEn}
                </button>
              ))}
            </div>
          </div>

          {/* Cheques High Contrast Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
                  <tr>
                    <th className="p-3 text-start">{isAr ? "رقم الشيك" : "Cheque #"}</th>
                    <th className="p-3 text-start">{isAr ? "العميل / الساحب" : "Drawer / Member"}</th>
                    <th className="p-3 text-start">{isAr ? "البنك والحساب" : "Bank & Account"}</th>
                    <th className="p-3 text-start">{isAr ? "تاريخ الاستحقاق" : "Maturity Date"}</th>
                    <th className="p-3 text-end">{isAr ? "مبلغ الشيك" : "Amount"}</th>
                    <th className="p-3 text-center">{isAr ? "الحالة" : "Status"}</th>
                    <th className="p-3 text-end">{isAr ? "الإجراءات" : "Actions"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredCheques.length ? (
                    filteredCheques.map((cheque) => {
                      const isReceived = cheque.status === "RECEIVED";
                      const isDeposited = cheque.status === "DEPOSITED";
                      const isCleared = cheque.status === "CLEARED";
                      const isReturned = cheque.status === "RETURNED";

                      return (
                        <tr
                          key={cheque.id}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">
                            <div className="flex items-center gap-1.5">
                              <FileCheck className="size-3.5 text-blue-600" />
                              <span>{cheque.cheque_number}</span>
                            </div>
                          </td>

                          <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">
                            {cheque.member_name || (isAr ? "عميل خارجي" : "Client")}
                          </td>

                          <td className="p-3 text-slate-600 dark:text-slate-400">
                            {cheque.bank_name || "—"} {cheque.bank_account_name ? `(${cheque.bank_account_name})` : ""}
                          </td>

                          <td className="p-3 font-mono text-[11px]">
                            <span className="font-bold text-slate-900 dark:text-white">{cheque.due_date}</span>
                          </td>

                          <td className="p-3 text-end font-mono font-black text-sm text-slate-900 dark:text-white">
                            {cheque.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                            <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                          </td>

                          <td className="p-3 text-center">
                            <Badge
                              className={`text-[10px] font-bold ${
                                isCleared
                                  ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
                                  : isDeposited
                                  ? "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300"
                                  : isReceived
                                  ? "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300"
                                  : isReturned
                                  ? "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {isCleared && (isAr ? "✓ تم التحصيل" : "Cleared")}
                              {isDeposited && (isAr ? "أودع بالبنك" : "Deposited")}
                              {isReceived && (isAr ? "مستلم / برسم التحصيل" : "Received")}
                              {isReturned && (isAr ? "✕ شيك مرتد" : "Returned")}
                              {!isCleared && !isDeposited && !isReceived && !isReturned && cheque.status}
                            </Badge>
                          </td>

                          <td className="p-3 text-end">
                            <div className="flex items-center justify-end gap-1.5">
                              {/* Quick Lifecycle Buttons */}
                              {canManageCheques && isReceived && (
                                <Button
                                  onClick={() => setUpdateStatusTarget({ cheque, targetStatus: "DEPOSITED" })}
                                  size="sm"
                                  variant="outline"
                                  className="h-7 px-2 text-xs font-bold text-blue-700 hover:bg-blue-50 border-blue-200"
                                >
                                  <ArrowUpRight className="size-3" />
                                  <span>{isAr ? "إيداع بالبنك" : "Deposit"}</span>
                                </Button>
                              )}

                              {canManageCheques && isDeposited && (
                                <>
                                  <Button
                                    onClick={() => setClearChequeTarget(cheque)}
                                    size="sm"
                                    className="h-7 px-2 text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white"
                                  >
                                    <Check className="size-3" />
                                    <span>{isAr ? "تحصيل وإقفال" : "Clear"}</span>
                                  </Button>

                                  <Button
                                    onClick={() => setUpdateStatusTarget({ cheque, targetStatus: "RETURNED" })}
                                    size="sm"
                                    variant="outline"
                                    className="h-7 px-2 text-xs font-bold text-rose-600 hover:bg-rose-50 border-rose-200"
                                  >
                                    <XCircle className="size-3" />
                                    <span>{isAr ? "مرتد" : "Bounce"}</span>
                                  </Button>
                                </>
                              )}

                              {/* Print Voucher */}
                              <Button
                                onClick={() => handlePrintChequeVoucher(cheque)}
                                size="sm"
                                variant="ghost"
                                className="h-7 w-7 p-0 text-slate-500 hover:text-slate-900"
                                title={isAr ? "طباعة إشعار استلام الشيك" : "Print Cheque Voucher"}
                              >
                                <Printer className="size-3.5" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="p-8 text-center text-slate-400 text-xs">
                        {isAr ? "لا توجد شيكات مطابقة لمعايير البحث" : "No cheques found matching filters"}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          DIALOG MODALS
          ────────────────────────────────────────────────────────────────────────── */}
      {/* 1. Create Bank */}
      <CreateBankDialog
        open={createBankOpen}
        onOpenChange={setCreateBankOpen}
        organizationId={organizationId}
        locale={locale}
      />

      {/* 2. Create Bank Account */}
      <CreateBankAccountDialog
        open={createAccountOpen}
        onOpenChange={setCreateAccountOpen}
        organizationId={organizationId}
        resortId={resortId}
        banks={bankOptions}
        assetAccounts={assetAccounts}
        locale={locale}
      />

      {/* 3. Record Cheque */}
      <RecordChequeDialog
        open={recordChequeOpen}
        onOpenChange={setRecordChequeOpen}
        organizationId={organizationId}
        resortId={resortId}
        bankAccounts={bankAccountOptions}
        members={members}
        currency={currency}
        locale={locale}
      />

      {/* 4. Clear Cheque */}
      {clearChequeTarget && (
        <ClearChequeDialog
          open={Boolean(clearChequeTarget)}
          onOpenChange={(open) => !open && setClearChequeTarget(null)}
          chequeId={clearChequeTarget.id}
          chequeNumber={clearChequeTarget.cheque_number}
          amount={clearChequeTarget.amount}
          fiscalPeriodId={fiscalPeriodId}
          dues={dues}
          currency={currency}
          locale={locale}
        />
      )}

      {/* 5. Update Status */}
      {updateStatusTarget && (
        <UpdateChequeStatusDialog
          open={Boolean(updateStatusTarget)}
          onOpenChange={(open) => !open && setUpdateStatusTarget(null)}
          chequeId={updateStatusTarget.cheque.id}
          chequeNumber={updateStatusTarget.cheque.cheque_number}
          targetStatus={updateStatusTarget.targetStatus}
          locale={locale}
        />
      )}
    </div>
  );
}
