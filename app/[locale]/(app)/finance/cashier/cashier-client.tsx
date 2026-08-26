"use client";

import { useState, useMemo } from "react";
import {
  Search,
  Plus,
  Unlock,
  Lock,
  Receipt,
  Printer,
  FileSpreadsheet,
  Building2,
  CreditCard,
  Layers,
  Calendar,
  Clock,
  CheckCircle2,
  AlertCircle,
  TrendingUp,
  DollarSign,
  Send,
  User,
  ShieldCheck,
  Eye,
  SlidersHorizontal,
  FileText,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { getCurrencyLabel } from "@/lib/currency";
import {
  CreateCashboxDialog,
  OpenSessionDialog,
  CloseSessionDialog,
  CollectDueDialog,
  type Option,
  type DueItem,
} from "./cashier-dialogs";
import {
  generateCashierSessionZReportPdf,
  type CashTransactionItem,
} from "@/lib/reports/cashier-session-zreport-pdf";
import { generatePaymentReceiptPdf } from "@/lib/reports/payment-receipt-pdf";

export type CashboxRow = {
  id: string;
  name: string;
  gl_account_id: string;
  gl_account_code?: string;
  gl_account_name?: string;
  is_active: boolean;
};

export type CashierSessionRow = {
  id: string;
  cashbox_id: string;
  cashbox_name: string;
  gl_account_code?: string;
  opened_by?: string;
  opened_by_name?: string;
  opening_balance: number;
  expected_closing_balance?: number | null;
  actual_closing_balance?: number | null;
  variance?: number | null;
  status: "OPEN" | "CLOSED" | "RECONCILED" | string;
  opened_at: string;
  closed_at?: string | null;
  total_receipts: number;
  total_payments: number;
  current_cash: number;
};

export type CashTransactionRow = {
  id: string;
  session_id: string;
  cashbox_name?: string;
  type: "RECEIPT" | "PAYMENT" | string;
  amount: number;
  payment_id?: string | null;
  description?: string | null;
  created_at: string;
  unit_code?: string | null;
};

export function CashierClient({
  cashboxes,
  sessions,
  transactions,
  dues,
  assetAccounts,
  organizationId,
  organizationName,
  resortId,
  resortName,
  fiscalPeriodId,
  currency = "EGP",
  locale,
  canCreateCashbox = false,
  canOpenSession = false,
  canCloseSession = false,
  canCollect = false,
}: {
  cashboxes: CashboxRow[];
  sessions: CashierSessionRow[];
  transactions: CashTransactionRow[];
  dues: DueItem[];
  assetAccounts: Option[];
  organizationId: string;
  organizationName: string;
  resortId: string;
  resortName?: string;
  fiscalPeriodId?: string;
  currency?: string;
  locale: string;
  /**
   * Each control is gated on the permission that its own server action and RLS
   * policy already require, so a read-only viewer is never shown a button whose
   * only outcome is a raw Postgres error. These default to false: a caller that
   * forgets to pass them renders read-only, which is the safe direction.
   */
  canCreateCashbox?: boolean;
  canOpenSession?: boolean;
  canCloseSession?: boolean;
  canCollect?: boolean;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);

  // Active view tab: 'CASHBOXES' | 'SESSIONS' | 'TRANSACTIONS'
  const [activeTab, setActiveTab] = useState<"CASHBOXES" | "SESSIONS" | "TRANSACTIONS">("CASHBOXES");
  const [searchQuery, setSearchQuery] = useState("");
  const [sessionFilter, setSessionFilter] = useState<"ALL" | "OPEN" | "CLOSED">("ALL");

  // Dialog states
  const [createCashboxOpen, setCreateCashboxOpen] = useState(false);
  const [openSessionTarget, setOpenSessionTarget] = useState<CashboxRow | null>(null);
  const [closeSessionTarget, setCloseSessionTarget] = useState<CashierSessionRow | null>(null);
  const [collectDueTarget, setCollectDueTarget] = useState<{
    session: CashierSessionRow;
    cashbox: CashboxRow;
  } | null>(null);

  // Map of open session per cashbox
  const openSessionByCashbox = useMemo(() => {
    const map = new Map<string, CashierSessionRow>();
    for (const s of sessions) {
      if (s.status === "OPEN") {
        map.set(s.cashbox_id, s);
      }
    }
    return map;
  }, [sessions]);

  // Total cash currently in all open drawers
  const totalCashInDrawers = useMemo(() => {
    return sessions
      .filter((s) => s.status === "OPEN")
      .reduce((sum, s) => sum + s.current_cash, 0);
  }, [sessions]);

  // Filtered Sessions
  const filteredSessions = useMemo(() => {
    return sessions.filter((s) => {
      if (sessionFilter !== "ALL" && s.status !== sessionFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const box = s.cashbox_name.toLowerCase();
        const cashier = (s.opened_by_name || "").toLowerCase();
        return box.includes(q) || cashier.includes(q);
      }
      return true;
    });
  }, [sessions, sessionFilter, searchQuery]);

  // Filtered Transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const box = (t.cashbox_name || "").toLowerCase();
        const desc = (t.description || "").toLowerCase();
        const unit = (t.unit_code || "").toLowerCase();
        const amt = t.amount.toString();
        return box.includes(q) || desc.includes(q) || unit.includes(q) || amt.includes(q);
      }
      return true;
    });
  }, [transactions, searchQuery]);

  // Handle Print Z-Report
  const handlePrintZReport = (session: CashierSessionRow) => {
    const sessionTx: CashTransactionItem[] = transactions
      .filter((t) => t.session_id === session.id)
      .map((t) => ({
        id: t.id,
        type: t.type,
        amount: t.amount,
        description: t.description,
        createdAt: t.created_at,
      }));

    generateCashierSessionZReportPdf(
      {
        organizationName,
        resortName,
        cashboxName: session.cashbox_name,
        glAccountCode: session.gl_account_code,
        sessionId: session.id,
        cashierName: session.opened_by_name,
        openedAt: session.opened_at,
        closedAt: session.closed_at,
        openingBalance: session.opening_balance,
        totalReceipts: session.total_receipts,
        totalPayments: session.total_payments,
        expectedClosingBalance: session.expected_closing_balance ?? (session.opening_balance + session.total_receipts - session.total_payments),
        actualClosingBalance: session.actual_closing_balance ?? (session.opening_balance + session.total_receipts - session.total_payments),
        variance: session.variance ?? 0,
        status: session.status,
        currencyCode: currency,
        currencyLabel,
        transactions: sessionTx,
      },
      locale
    );
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
            onClick={() => setActiveTab("CASHBOXES")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeTab === "CASHBOXES"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <CreditCard className="size-3.5 text-blue-600" />
            <span>{isAr ? "الخزائن ونقاط التحصيل" : "Cashboxes & Drawers"}</span>
            <span className="rounded-full bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-mono dark:bg-slate-700">
              {cashboxes.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("SESSIONS")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeTab === "SESSIONS"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <Clock className="size-3.5 text-emerald-600" />
            <span>{isAr ? "سجل الورديات والجلسات" : "Shifts & Z-Reports"}</span>
            <span className="rounded-full bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-mono dark:bg-slate-700">
              {sessions.length}
            </span>
          </button>

          <button
            onClick={() => setActiveTab("TRANSACTIONS")}
            className={`flex items-center gap-2 rounded-lg px-3.5 py-1.5 text-xs font-bold transition-all ${
              activeTab === "TRANSACTIONS"
                ? "bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white"
                : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
            }`}
          >
            <Receipt className="size-3.5 text-amber-600" />
            <span>{isAr ? "سجل الحركات النقدية" : "Cash Transactions"}</span>
            <span className="rounded-full bg-slate-200/80 px-1.5 py-0.5 text-[10px] font-mono dark:bg-slate-700">
              {transactions.length}
            </span>
          </button>
        </div>

        {/* Action Buttons */}
        {canCreateCashbox && (
          <div className="flex items-center gap-2">
            <Button
              onClick={() => setCreateCashboxOpen(true)}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5 shadow-sm"
            >
              <Plus className="size-4" />
              <span>{isAr ? "إضافة صندوق خزينة" : "Add Cashbox"}</span>
            </Button>
          </div>
        )}
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 1: CASHBOXES & ACTIVE POS CONTROL HUB
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "CASHBOXES" && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {cashboxes.length ? (
              cashboxes.map((cashbox) => {
                const openSession = openSessionByCashbox.get(cashbox.id);
                const isOpen = Boolean(openSession);

                return (
                  <div
                    key={cashbox.id}
                    className={`group relative rounded-2xl border transition-all duration-200 p-5 shadow-sm hover:shadow-md flex flex-col justify-between ${
                      isOpen
                        ? "border-emerald-200/80 bg-gradient-to-b from-emerald-50/40 via-white to-white dark:border-emerald-900/60 dark:from-emerald-950/20 dark:via-slate-900 dark:to-slate-900"
                        : "border-slate-200/80 bg-white hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900"
                    }`}
                  >
                    <div>
                      {/* Cashbox Header */}
                      <div className="flex items-start justify-between gap-3 mb-3">
                        <div className="flex items-center gap-3">
                          <div
                            className={`flex size-11 items-center justify-center rounded-xl font-bold shadow-sm ${
                              isOpen
                                ? "bg-emerald-600 text-white shadow-emerald-500/20"
                                : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                            }`}
                          >
                            <CreditCard className="size-5" />
                          </div>
                          <div>
                            <h3 className="font-extrabold text-base text-slate-900 dark:text-white line-clamp-1">
                              {cashbox.name}
                            </h3>
                            <p className="text-xs text-slate-500 font-mono flex items-center gap-1">
                              <Building2 className="size-3 text-slate-400" />
                              <span>{cashbox.gl_account_name || (isAr ? "حساب النقدية" : "Cash GL Account")}</span>
                            </p>
                          </div>
                        </div>

                        <Badge
                          variant={isOpen ? "default" : "secondary"}
                          className={`font-bold text-[11px] px-2.5 py-0.5 rounded-full ${
                            isOpen
                              ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                              : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                          }`}
                        >
                          {isOpen ? (isAr ? "وردية مفتوحة" : "Shift Open") : (isAr ? "مغلق" : "Closed")}
                        </Badge>
                      </div>

                      {/* Cashbox Live Balances */}
                      {isOpen && openSession ? (
                        <div className="rounded-xl border border-emerald-200/70 bg-emerald-50/50 p-3.5 my-4 space-y-2 dark:border-emerald-900/50 dark:bg-emerald-950/30">
                          <div className="flex items-center justify-between text-xs">
                            <span className="text-slate-600 dark:text-slate-400">{isAr ? "الرصيد الافتتاحي:" : "Opening Float:"}</span>
                            <span className="font-mono font-bold text-slate-800 dark:text-slate-200">
                              {openSession.opening_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currencyLabel}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-xs text-emerald-700 dark:text-emerald-400">
                            <span>{isAr ? "المقبوضات المحصلة:" : "Receipts Collected:"}</span>
                            <span className="font-mono font-bold">
                              + {openSession.total_receipts.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currencyLabel}
                            </span>
                          </div>

                          <div className="flex items-center justify-between font-black text-sm border-t border-emerald-200 dark:border-emerald-900/60 pt-2 text-slate-900 dark:text-white">
                            <span>{isAr ? "النقدية الحالية بالدرج:" : "Cash in Drawer:"}</span>
                            <span className="font-mono text-base text-emerald-800 dark:text-emerald-300">
                              {openSession.current_cash.toLocaleString(undefined, { minimumFractionDigits: 2 })} {currencyLabel}
                            </span>
                          </div>

                          <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                            <span>{isAr ? "توقيت الفتح:" : "Opened At:"}</span>
                            <span className="font-mono">
                              {new Date(openSession.opened_at).toLocaleTimeString(isAr ? "ar-EG" : "en-US", { hour: "2-digit", minute: "2-digit" })}
                            </span>
                          </div>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/60 p-5 my-4 text-center dark:border-slate-800 dark:bg-slate-900/40">
                          <Lock className="size-6 text-slate-300 mx-auto mb-1.5" />
                          <p className="text-xs text-slate-500 font-medium">
                            {isAr ? "الخزينة مغلقة حالياً. افتح وردية لبدء التحصيل." : "Drawer is closed. Open a shift to start POS."}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Action Buttons */}
                    {(isOpen && openSession ? canCollect || canCloseSession : canOpenSession) && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800/80">
                        {isOpen && openSession ? (
                          <div
                            className={`grid grid-cols-1 gap-2 ${
                              canCollect && canCloseSession ? "sm:grid-cols-2" : ""
                            }`}
                          >
                            {canCollect && (
                              <Button
                                onClick={() => setCollectDueTarget({ session: openSession, cashbox })}
                                className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 gap-1 shadow-sm"
                              >
                                <Receipt className="size-3.5" />
                                <span>{isAr ? "تحصيل نقدي" : "Collect POS"}</span>
                              </Button>
                            )}

                            {canCloseSession && (
                              <Button
                                onClick={() => setCloseSessionTarget(openSession)}
                                variant="outline"
                                className="text-rose-600 hover:bg-rose-50 hover:text-rose-700 border-rose-200 dark:border-rose-900 dark:hover:bg-rose-950 font-bold text-xs h-9 gap-1"
                              >
                                <Lock className="size-3.5" />
                                <span>{isAr ? "إقفال الوردية" : "Close Shift"}</span>
                              </Button>
                            )}
                          </div>
                        ) : (
                          <Button
                            onClick={() => setOpenSessionTarget(cashbox)}
                            className="w-full bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs h-9 gap-1.5 shadow-sm"
                          >
                            <Unlock className="size-3.5" />
                            <span>{isAr ? "فتح وردية جديدة" : "Open Shift"}</span>
                          </Button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })
            ) : (
              <div className="col-span-full rounded-2xl border border-dashed border-slate-300 bg-white p-12 text-center dark:border-slate-800 dark:bg-slate-900">
                <CreditCard className="size-10 text-slate-400 mx-auto mb-3" />
                <h3 className="font-bold text-base text-slate-800 dark:text-slate-200 mb-1">
                  {isAr ? "لا توجد صناديق خزينة مسجلة" : "No Cashboxes Created"}
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto mb-5">
                  {canCreateCashbox
                    ? isAr
                      ? "قم بإضافة صندوق خزينة (مثل خزينة الاستقبال أو الصندوق الرئيسي) للبدء في إدارة الورديات وسندات القبض."
                      : "Create a cashbox to start managing cash drawers, receipts, and shifts."
                    : isAr
                      ? "لم يتم تسجيل أي صندوق خزينة بعد."
                      : "No cashbox has been registered yet."}
                </p>
                {canCreateCashbox && (
                  <Button
                    onClick={() => setCreateCashboxOpen(true)}
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5"
                  >
                    <Plus className="size-4" />
                    <span>{isAr ? "إضافة صندوق خزينة الآن" : "Add Cashbox Now"}</span>
                  </Button>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          TAB 2: SESSIONS & SHIFTS HISTORY LOG (Z-REPORTS)
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "SESSIONS" && (
        <div className="space-y-4">
          {/* Toolbar */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="relative w-full sm:w-72">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? "بحث في الورديات والجلسات..." : "Search sessions..."}
                className="ps-9 text-xs h-9"
              />
            </div>

            <div className="flex items-center gap-1 self-stretch sm:self-auto">
              {(["ALL", "OPEN", "CLOSED"] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setSessionFilter(filter)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                    sessionFilter === filter
                      ? "bg-slate-900 text-white dark:bg-white dark:text-slate-900"
                      : "text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800"
                  }`}
                >
                  {filter === "ALL" && (isAr ? "الكل" : "All")}
                  {filter === "OPEN" && (isAr ? "مفتوحة" : "Open")}
                  {filter === "CLOSED" && (isAr ? "مقفلة" : "Closed")}
                </button>
              ))}
            </div>
          </div>

          {/* Sessions Table */}
          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
                  <tr>
                    <th className="p-3 text-start">{isAr ? "الخزينة" : "Cashbox"}</th>
                    <th className="p-3 text-start">{isAr ? "توقيت الفتح / الإقفال" : "Opened / Closed"}</th>
                    <th className="p-3 text-start">{isAr ? "الرصيد الافتتاحي" : "Opening"}</th>
                    <th className="p-3 text-start">{isAr ? "إجمالي المقبوضات" : "Receipts (+)"}</th>
                    <th className="p-3 text-start">{isAr ? "المتوقع دفترياً" : "Expected"}</th>
                    <th className="p-3 text-start">{isAr ? "الفعلي عند الإقفال" : "Actual Count"}</th>
                    <th className="p-3 text-start">{isAr ? "الفارق (عجز/فائض)" : "Variance"}</th>
                    <th className="p-3 text-start">{isAr ? "الحالة" : "Status"}</th>
                    <th className="p-3 text-end">{isAr ? "الإجراءات" : "Actions"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredSessions.length ? (
                    filteredSessions.map((session) => {
                      const isOpen = session.status === "OPEN";
                      const variance = session.variance ?? 0;
                      const isBalanced = Math.abs(variance) < 0.01;

                      return (
                        <tr
                          key={session.id}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <td className="p-3 font-bold text-slate-900 dark:text-white">
                            <div className="flex items-center gap-1.5">
                              <CreditCard className="size-3.5 text-blue-600" />
                              <span>{session.cashbox_name}</span>
                            </div>
                          </td>

                          <td className="p-3 text-slate-500 font-mono text-[11px]">
                            <div>
                              <span className="text-slate-400">{isAr ? "فتح: " : "Open: "}</span>
                              {new Date(session.opened_at).toLocaleString(isAr ? "ar-EG" : "en-US", {
                                month: "short",
                                day: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                              })}
                            </div>
                            {session.closed_at && (
                              <div>
                                <span className="text-slate-400">{isAr ? "إقفال: " : "Close: "}</span>
                                {new Date(session.closed_at).toLocaleString(isAr ? "ar-EG" : "en-US", {
                                  month: "short",
                                  day: "numeric",
                                  hour: "2-digit",
                                  minute: "2-digit",
                                })}
                              </div>
                            )}
                          </td>

                          <td className="p-3 font-mono font-semibold">
                            {session.opening_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                            <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                          </td>

                          <td className="p-3 font-mono font-bold text-emerald-600">
                            + {session.total_receipts.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                            <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                          </td>

                          <td className="p-3 font-mono font-bold text-blue-700 dark:text-blue-400">
                            {(session.expected_closing_balance ?? (session.opening_balance + session.total_receipts)).toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                            <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                          </td>

                          <td className="p-3 font-mono font-bold text-slate-900 dark:text-white">
                            {session.actual_closing_balance !== null && session.actual_closing_balance !== undefined
                              ? `${session.actual_closing_balance.toLocaleString(undefined, { minimumFractionDigits: 2 })} ${currencyLabel}`
                              : "—"}
                          </td>

                          <td className="p-3 font-mono font-bold">
                            {isOpen ? (
                              <span className="text-slate-400">—</span>
                            ) : isBalanced ? (
                              <span className="text-emerald-600">✓ 0.00</span>
                            ) : variance > 0 ? (
                              <span className="text-blue-600">+{variance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            ) : (
                              <span className="text-rose-600">{variance.toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                            )}
                          </td>

                          <td className="p-3">
                            <Badge
                              variant={isOpen ? "default" : "secondary"}
                              className={`text-[10px] font-bold ${
                                isOpen
                                  ? "bg-emerald-600 hover:bg-emerald-600 text-white"
                                  : "bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400"
                              }`}
                            >
                              {isOpen ? (isAr ? "مفتوحة" : "Open") : (isAr ? "مقفلة" : "Closed")}
                            </Badge>
                          </td>

                          <td className="p-3 text-end">
                            <Button
                              onClick={() => handlePrintZReport(session)}
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-xs font-bold gap-1 text-slate-700 hover:text-slate-900 hover:bg-slate-100 dark:text-slate-300"
                            >
                              <Printer className="size-3 text-slate-500" />
                              <span>{isAr ? "كشف Z-Report" : "Z-Report"}</span>
                            </Button>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={9} className="p-8 text-center text-slate-400 text-xs">
                        {isAr ? "لا توجد جلسات مطابقة لمعايير البحث" : "No sessions found matching filters"}
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
          TAB 3: CASH TRANSACTIONS STREAM
          ────────────────────────────────────────────────────────────────────────── */}
      {activeTab === "TRANSACTIONS" && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3 rounded-xl border border-slate-200 dark:border-slate-800">
            <div className="relative w-full sm:w-72">
              <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
              <Input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={isAr ? "بحث في الحركات النقدية..." : "Search transactions..."}
                className="ps-9 text-xs h-9"
              />
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
            <div className="overflow-x-auto">
              <table className="w-full text-xs text-start">
                <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
                  <tr>
                    <th className="p-3 text-start">{isAr ? "التاريخ والوقت" : "Date & Time"}</th>
                    <th className="p-3 text-start">{isAr ? "نوع الحركة" : "Type"}</th>
                    <th className="p-3 text-start">{isAr ? "الخزينة" : "Cashbox"}</th>
                    <th className="p-3 text-start">{isAr ? "الوحدة / العميل" : "Unit / Details"}</th>
                    <th className="p-3 text-start">{isAr ? "البيان" : "Description"}</th>
                    <th className="p-3 text-end">{isAr ? "المبلغ النقدي" : "Amount"}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                  {filteredTransactions.length ? (
                    filteredTransactions.map((tx) => {
                      const isReceipt = tx.type === "RECEIPT";

                      return (
                        <tr
                          key={tx.id}
                          className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors"
                        >
                          <td className="p-3 text-slate-500 font-mono text-[11px]">
                            {new Date(tx.created_at).toLocaleString(isAr ? "ar-EG" : "en-US", {
                              month: "short",
                              day: "numeric",
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </td>

                          <td className="p-3">
                            <Badge
                              className={`text-[10px] font-bold ${
                                isReceipt
                                  ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
                                  : "bg-rose-100 text-rose-800 border-rose-200 dark:bg-rose-950 dark:text-rose-300"
                              }`}
                            >
                              {isReceipt ? (isAr ? "قبض نقدي" : "Receipt") : (isAr ? "صرف نقدي" : "Disbursement")}
                            </Badge>
                          </td>

                          <td className="p-3 font-semibold text-slate-800 dark:text-slate-200">
                            {tx.cashbox_name || "—"}
                          </td>

                          <td className="p-3 font-bold text-slate-900 dark:text-white">
                            {tx.unit_code ? (
                              <div className="flex items-center gap-1">
                                <Building2 className="size-3 text-blue-600" />
                                <span>{tx.unit_code}</span>
                              </div>
                            ) : (
                              "—"
                            )}
                          </td>

                          <td className="p-3 text-slate-600 dark:text-slate-400">
                            {tx.description || (isAr ? "تحصيل مستحقات نقدية بالخزينة" : "Cash collection")}
                          </td>

                          <td className="p-3 text-end font-mono font-bold text-sm">
                            <span className={isReceipt ? "text-emerald-600" : "text-rose-600"}>
                              {isReceipt ? "+" : "-"}{tx.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                              <span className="text-[10px] text-slate-400">{currencyLabel}</span>
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={6} className="p-8 text-center text-slate-400 text-xs">
                        {isAr ? "لا توجد حركات نقدية مسجلة بعد" : "No cash transactions recorded"}
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
      {/* 1. Create Cashbox */}
      <CreateCashboxDialog
        open={createCashboxOpen}
        onOpenChange={setCreateCashboxOpen}
        organizationId={organizationId}
        resortId={resortId}
        assetAccounts={assetAccounts}
        locale={locale}
      />

      {/* 2. Open Shift */}
      {openSessionTarget && (
        <OpenSessionDialog
          open={Boolean(openSessionTarget)}
          onOpenChange={(open) => !open && setOpenSessionTarget(null)}
          organizationId={organizationId}
          resortId={resortId}
          cashboxId={openSessionTarget.id}
          cashboxName={openSessionTarget.name}
          currency={currency}
          locale={locale}
        />
      )}

      {/* 3. Close Shift */}
      {closeSessionTarget && (
        <CloseSessionDialog
          open={Boolean(closeSessionTarget)}
          onOpenChange={(open) => !open && setCloseSessionTarget(null)}
          sessionId={closeSessionTarget.id}
          cashboxName={closeSessionTarget.cashbox_name}
          openingBalance={closeSessionTarget.opening_balance}
          totalReceipts={closeSessionTarget.total_receipts}
          totalPayments={closeSessionTarget.total_payments}
          currency={currency}
          organizationName={organizationName}
          locale={locale}
        />
      )}

      {/* 4. POS Collect Due */}
      {collectDueTarget && (
        <CollectDueDialog
          open={Boolean(collectDueTarget)}
          onOpenChange={(open) => !open && setCollectDueTarget(null)}
          organizationId={organizationId}
          organizationName={organizationName}
          resortId={resortId}
          sessionId={collectDueTarget.session.id}
          cashboxName={collectDueTarget.cashbox.name}
          cashAccountId={collectDueTarget.cashbox.gl_account_id}
          dues={dues}
          fiscalPeriodId={fiscalPeriodId}
          currency={currency}
          locale={locale}
        />
      )}
    </div>
  );
}
