"use client";

import { useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Link } from "@/i18n/navigation";
import {
  CreditCard,
  Plus,
  Search,
  Calendar,
  Building2,
  CheckCircle2,
  Clock,
  Printer,
  Receipt,
  User,
  Layers,
  DollarSign,
  Landmark,
  AlertTriangle,
  PiggyBank,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { getCurrencyLabel } from "@/lib/currency";
import { RecordPaymentDialog, type Option, type DueOption, type UnitOption } from "./payments-dialog";
import { PaymentCreditDialog, type CreditApplication, type PeriodOption } from "./payment-credit-dialog";
import { setCustomerAdvanceAccountAction } from "@/lib/actions/customer-advances";
import { advanceErrorMessage } from "@/lib/finance/customer-advances";
import { generatePaymentReceiptPdf } from "@/lib/reports/payment-receipt-pdf";
import { VoidReceiptDialog } from "./void-receipt-dialog";
import { useToast } from "@/components/ui/toast";

export type PaymentItem = {
  id: string;
  receipt_number: string;
  amount: number;
  unallocated_amount?: number;
  method: string;
  payment_date: string;
  status: "POSTED" | "REVERSED" | string;
  member_name?: string;
  reference?: string | null;
  memo?: string | null;
  allocations?: {
    unitCode: string;
    description: string;
    dueDate: string;
    allocatedAmount: number;
  }[];
  unit_id?: string | null;
  unit_code?: string;
  advance_amount?: number;
  credit_remaining?: number;
  credit_stranded?: boolean;
  applications?: CreditApplication[];
};

export function PaymentsClient({
  payments,
  members,
  dues,
  depositAccounts,
  periods,
  units = [],
  liabilityAccounts = [],
  advanceAccountConfigured = false,
  canApplyCredit = false,
  canManageAdvanceAccount = false,
  organizationId,
  organizationName,
  resortId,
  resortName,
  canRecordPayment = false,
  canVoidPayment = false,
  currency = "EGP",
  locale,
  preselectedUnitId,
}: {
  payments: PaymentItem[];
  members: Option[];
  dues: DueOption[];
  depositAccounts: Option[];
  periods: PeriodOption[];
  units?: UnitOption[];
  liabilityAccounts?: Option[];
  advanceAccountConfigured?: boolean;
  canApplyCredit?: boolean;
  canManageAdvanceAccount?: boolean;
  organizationId: string;
  organizationName: string;
  resortId: string;
  resortName?: string;
  canRecordPayment?: boolean;
  canVoidPayment?: boolean;
  currency?: string;
  locale: string;
  preselectedUnitId?: string;
}) {
  const isAr = locale === "ar";
  const currencyLabel = getCurrencyLabel(currency, isAr);
  const toast = useToast();
  const router = useRouter();

  const [creditPaymentId, setCreditPaymentId] = useState<string | null>(null);
  const [accountChoice, setAccountChoice] = useState<string>("");
  const [savingAccount, setSavingAccount] = useState(false);

  const saveAdvanceAccount = async () => {
    if (savingAccount || !accountChoice) return;
    setSavingAccount(true);
    try {
      const result = await setCustomerAdvanceAccountAction({ organizationId, resortId, accountId: accountChoice });
      if (result.ok) {
        toast.add({ type: "success", title: isAr ? "تم اعتماد حساب سلف العملاء" : "Customer advance account approved" });
        router.refresh();
      } else {
        toast.add({ type: "error", title: isAr ? "تعذر اعتماد الحساب" : "Could not approve the account", description: advanceErrorMessage(result.error, isAr ? "ar" : "en") });
      }
    } finally {
      setSavingAccount(false);
    }
  };

  const [searchQuery, setSearchQuery] = useState("");
  const [methodFilter, setMethodFilter] = useState<string>("ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | "POSTED" | "REVERSED">("ALL");

  const [recordPaymentOpen, setRecordPaymentOpen] = useState(false);
  const [voidTarget, setVoidTarget] = useState<PaymentItem | null>(null);
  const creditPayment = payments.find((p) => p.id === creditPaymentId) ?? null;

  // Filtered Payments
  const filteredPayments = useMemo(() => {
    return payments.filter((p) => {
      // Status filter
      if (statusFilter === "POSTED" && p.status !== "POSTED") return false;
      if (statusFilter === "REVERSED" && p.status !== "REVERSED") return false;

      // Method filter
      if (methodFilter !== "ALL" && p.method !== methodFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const rcpt = p.receipt_number.toLowerCase();
        const member = (p.member_name || "").toLowerCase();
        const ref = (p.reference || "").toLowerCase();
        const date = p.payment_date.toLowerCase();
        return rcpt.includes(q) || member.includes(q) || ref.includes(q) || date.includes(q);
      }

      return true;
    });
  }, [payments, statusFilter, methodFilter, searchQuery]);

  const handlePrintReceipt = (payment: PaymentItem) => {
    generatePaymentReceiptPdf(
      {
        organizationName,
        resortName: resortName || "",
        currency,
        receiptNo: payment.receipt_number,
        paymentDate: payment.payment_date,
        amount: payment.amount,
        unallocatedAmount: payment.unallocated_amount ?? 0,
        advanceAmount: payment.advance_amount ?? 0,
        memberName: payment.member_name || (isAr ? "عميل نقدي" : "Customer"),
        method: payment.method,
        memo: payment.reference || payment.memo || null,
        createdByName: null,
        allocations: payment.allocations || [],
        status: payment.status,
      },
      locale
    );
  };

  const handleVoid = (payment: PaymentItem) => {
    if (!canVoidPayment || payment.status !== "POSTED") return;
    setVoidTarget(payment);
  };

  const getMethodBadge = (m: string) => {
    switch (m) {
      case "CASH":
        return <Badge className="bg-emerald-50 text-emerald-700 border-emerald-200 text-[10px]">{isAr ? "نقدي" : "Cash"}</Badge>;
      case "BANK_TRANSFER":
        return <Badge className="bg-blue-50 text-blue-700 border-blue-200 text-[10px]">{isAr ? "تحويل بنكي" : "Transfer"}</Badge>;
      case "CHEQUE":
        return <Badge className="bg-amber-50 text-amber-700 border-amber-200 text-[10px]">{isAr ? "شيك" : "Cheque"}</Badge>;
      default:
        return <Badge variant="outline" className="text-[10px] font-mono">{m}</Badge>;
    }
  };

  return (
    <div className="space-y-6">
      {!advanceAccountConfigured && (canManageAdvanceAccount || canRecordPayment) && (
        <div className="rounded-2xl border border-sky-200 bg-sky-50 p-4 text-xs dark:border-sky-900/50 dark:bg-sky-950/30" data-testid="advance-account-card">
          <div className="flex items-start gap-2 font-bold text-sky-900 dark:text-sky-200">
            <PiggyBank className="mt-0.5 size-4 shrink-0" />
            <div className="space-y-1">
              <p>{isAr ? "حساب سلف العملاء غير معتمد" : "Customer advance account not approved"}</p>
              <p className="font-medium">
                {isAr
                  ? "لا يمكن تسجيل دفعة مقدمة قبل اعتماد حساب التزامات يُرحَّل إليه رصيد العملاء. الإيصالات العادية غير متأثرة."
                  : "An advance cannot be recorded until a liability account that holds customer credit is approved. Ordinary receipts are not affected."}
              </p>
            </div>
          </div>
          {canManageAdvanceAccount ? (
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <Select value={accountChoice} onValueChange={(v) => setAccountChoice(v ?? "")} items={liabilityAccounts.map((a) => ({ value: a.id, label: a.label }))}>
                <SelectTrigger className="h-9 w-72 text-xs" data-testid="advance-account-select">
                  <SelectValue placeholder={isAr ? "اختر حساب الالتزامات..." : "Select a liability account..."} />
                </SelectTrigger>
                <SelectContent>
                  {liabilityAccounts.map((a) => (
                    <SelectItem key={a.id} value={a.id} className="text-xs">{a.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={saveAdvanceAccount} disabled={savingAccount || !accountChoice} size="sm" className="h-9 text-xs font-bold" data-testid="advance-account-save">
                {isAr ? "اعتماد الحساب" : "Approve account"}
              </Button>
            </div>
          ) : (
            <p className="mt-2 font-semibold">{isAr ? "اطلب من المالك أو المدير المالي اعتماد الحساب." : "Ask the owner or a finance manager to approve it."}</p>
          )}
        </div>
      )}

      {/* ──────────────────────────────────────────────────────────────────────────
          MAIN ACTION TOOLBAR & FILTERS
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-3 bg-white dark:bg-slate-900 p-3.5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm">
        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search className="absolute start-3 top-1/2 -translate-y-1/2 size-4 text-slate-400" />
          <Input
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={isAr ? "بحث برقم السند أو اسم العميل..." : "Search receipts..."}
            className="ps-9 text-xs h-9"
          />
        </div>

        {/* Filters & Action Buttons */}
        <div className="flex flex-wrap items-center gap-2 self-stretch sm:self-auto">
          {/* Status Tabs */}
          <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800/80 p-1 rounded-xl">
            {(
              [
                { key: "ALL", labelAr: "الكل", labelEn: "All" },
                { key: "POSTED", labelAr: "مرحل ومعتمد", labelEn: "Posted" },
                { key: "REVERSED", labelAr: "معكوسة", labelEn: "Reversed" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.key}
                onClick={() => setStatusFilter(tab.key)}
                className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all ${
                  statusFilter === tab.key
                    ? "bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white"
                    : "text-slate-600 hover:text-slate-900 dark:text-slate-400 dark:hover:text-white"
                }`}
              >
                {isAr ? tab.labelAr : tab.labelEn}
              </button>
            ))}
          </div>

          {/* Payment Method Filter */}
          <Select value={methodFilter} onValueChange={(val) => setMethodFilter(val ?? "ALL")} items={[{ value: "ALL", label: isAr ? "كل الطرق" : "All Methods" }, { value: "CASH", label: isAr ? "نقدي" : "Cash" }, { value: "BANK_TRANSFER", label: isAr ? "تحويل بنكي" : "Bank Transfer" }, { value: "CHEQUE", label: isAr ? "شيك" : "Cheque" }, { value: "ONLINE", label: isAr ? "دفع إلكتروني" : "Online" }]}>
            <SelectTrigger className="w-36 text-xs h-9">
              <SelectValue placeholder={isAr ? "طريقة السداد" : "Method"} />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="ALL">{isAr ? "كل الطرق" : "All Methods"}</SelectItem>
              <SelectItem value="CASH">{isAr ? "نقدي" : "Cash"}</SelectItem>
              <SelectItem value="BANK_TRANSFER">{isAr ? "تحويل بنكي" : "Bank Transfer"}</SelectItem>
              <SelectItem value="CHEQUE">{isAr ? "شيك" : "Cheque"}</SelectItem>
              <SelectItem value="ONLINE">{isAr ? "دفع إلكتروني" : "Online"}</SelectItem>
            </SelectContent>
          </Select>

          {/* Record Payment Button */}
          {canRecordPayment && (
            <Button
              onClick={() => setRecordPaymentOpen(true)}
              className="bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs gap-1.5 h-9 shadow-sm"
            >
              <Plus className="size-3.5" />
              <span>{isAr ? "تسجيل سند قبض جديد" : "New Receipt"}</span>
            </Button>
          )}
        </div>
      </div>

      {/* ──────────────────────────────────────────────────────────────────────────
          HIGH CONTRAST PAYMENTS TABLE
          ────────────────────────────────────────────────────────────────────────── */}
      <div className="overflow-hidden rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm">
        <div className="overflow-x-auto">
          <table className="w-full text-xs text-start">
            <thead className="bg-slate-900 text-white dark:bg-slate-800/90 font-bold border-b border-slate-800">
              <tr>
                <th className="p-3.5 text-start">{isAr ? "رقم سند القبض" : "Receipt #"}</th>
                <th className="p-3.5 text-start">{isAr ? "العميل / الساحب" : "Client / Member"}</th>
                <th className="p-3.5 text-start">{isAr ? "طريقة السداد" : "Method"}</th>
                <th className="p-3.5 text-start">{isAr ? "تاريخ التحصيل" : "Payment Date"}</th>
                <th className="p-3.5 text-end">{isAr ? "المبلغ المحصل" : "Amount Paid"}</th>
                <th className="p-3.5 text-center">{isAr ? "الحالة" : "Status"}</th>
                <th className="p-3.5 text-end">{isAr ? "الإجراءات" : "Actions"}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {filteredPayments.length ? (
                filteredPayments.map((payment) => {
                  const isPosted = payment.status === "POSTED";
                  const isReversed = payment.status === "REVERSED";

                  return (
                    <tr
                      key={payment.id}
                      className="hover:bg-slate-50/70 dark:hover:bg-slate-800/50 transition-colors group"
                    >
                      <td className="p-3.5 font-mono font-bold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-1.5">
                          <Receipt className="size-3.5 text-emerald-600" />
                          <span>#{payment.receipt_number}</span>
                        </div>
                      </td>

                      <td className="p-3.5 font-semibold text-slate-800 dark:text-slate-200">
                        {payment.member_name || (isAr ? "عميل نقدي / عام" : "General Customer")}
                      </td>

                      <td className="p-3.5">
                        {getMethodBadge(payment.method)}
                      </td>

                      <td className="p-3.5 font-mono text-[11px] text-slate-600 dark:text-slate-400">
                        {payment.payment_date}
                      </td>

                      <td className="p-3.5 text-end font-mono font-black text-sm text-emerald-600 dark:text-emerald-400">
                        {payment.amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}{" "}
                        <span className="text-[10px] text-slate-400 font-normal">{currencyLabel}</span>
                        {isPosted && (payment.advance_amount ?? 0) > 0 && (
                          <div className="mt-1 flex flex-wrap items-center justify-end gap-1 font-sans">
                            <Badge className="border-sky-200 bg-sky-100 text-[10px] font-bold text-sky-800 dark:bg-sky-950 dark:text-sky-300" data-testid="advance-badge">
                              {isAr ? "دفعة مقدمة" : "Advance"} · {payment.unit_code ?? "—"}
                            </Badge>
                            <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-400" data-testid="credit-left">
                              {isAr ? "المتبقي" : "Left"}: {(payment.credit_remaining ?? 0).toLocaleString(isAr ? "ar-EG" : "en-US", { minimumFractionDigits: 2 })}
                            </span>
                            {payment.credit_stranded && (
                              <Badge className="border-amber-300 bg-amber-100 text-[10px] font-bold text-amber-900 dark:bg-amber-950 dark:text-amber-300" data-testid="stranded-badge">
                                {isAr ? "رصيد معلّق" : "Stranded credit"}
                              </Badge>
                            )}
                          </div>
                        )}
                      </td>

                      <td className="p-3.5 text-center">
                        <Badge
                          className={`text-[10px] font-bold ${
                            isReversed
                              ? "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300"
                              : isPosted
                                ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300"
                                : "bg-slate-100 text-slate-700"
                          }`}
                        >
                          {isReversed ? (isAr ? "معكوسة" : "Reversed") : isPosted ? (isAr ? "✓ مرحل ومعتمد" : "Posted") : (isAr ? "غير معروف" : payment.status)}
                        </Badge>
                      </td>

                      <td className="p-3.5 text-end">
                        <div className="flex items-center justify-end gap-1.5">
                          {isPosted && (payment.advance_amount ?? 0) > 0 && (
                            <Button
                              onClick={() => setCreditPaymentId(payment.id)}
                              size="sm"
                              variant="outline"
                              className="h-7 gap-1 px-2.5 text-xs font-bold text-sky-800 border-sky-200 hover:bg-sky-50"
                              data-testid={`credit-open-${payment.receipt_number}`}
                            >
                              <Wallet className="size-3.5" />
                              <span>{isAr ? "الرصيد" : "Credit"}</span>
                            </Button>
                          )}
                          {canVoidPayment && isPosted && (
                            <Button
                              onClick={() => handleVoid(payment)}
                              size="sm"
                              variant="outline"
                              className="h-7 px-2.5 text-xs font-bold gap-1 text-red-700 border-red-200 hover:bg-red-50"
                              title={isAr ? "عكس الدفعة مع سبب إلزامي" : "Reverse payment with required reason"}
                            >
                              <AlertTriangle className="size-3.5" />
                              <span>{isAr ? "عكس" : "Reverse"}</span>
                            </Button>
                          )}
                          <Button
                            onClick={() => handlePrintReceipt(payment)}
                            size="sm"
                            variant="outline"
                            className="h-7 px-2.5 text-xs font-bold gap-1 text-slate-700 hover:bg-slate-100"
                            title={isAr ? "طباعة سند القبض الرسمي" : "Print Official Receipt"}
                          >
                            <Printer className="size-3.5" />
                            <span>{isAr ? "طباعة السند" : "Print"}</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={7} className="p-10 text-center text-slate-400 text-xs">
                    {isAr ? "لا توجد سندات قبض مطابقة لمعايير البحث" : "No payments found"}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Dialog Modal */}
      <RecordPaymentDialog
        open={recordPaymentOpen}
        onOpenChange={setRecordPaymentOpen}
        organizationId={organizationId}
        resortId={resortId}
        members={members}
        dues={dues}
        depositAccounts={depositAccounts}
        periods={periods}
        units={units}
        advanceAccountConfigured={advanceAccountConfigured}
        canManageAdvanceAccount={canManageAdvanceAccount}
        currency={currency}
        locale={locale}
        preselectedUnitId={preselectedUnitId}
      />

      <VoidReceiptDialog
        target={voidTarget}
        onOpenChange={(o) => { if (!o) setVoidTarget(null); }}
        organizationId={organizationId}
        currency={currency}
        locale={locale}
      />

      <PaymentCreditDialog
        open={!!creditPayment}
        onOpenChange={(o) => { if (!o) setCreditPaymentId(null); }}
        payment={creditPayment && creditPayment.unit_id ? {
          id: creditPayment.id,
          receiptNumber: creditPayment.receipt_number,
          memberName: creditPayment.member_name ?? "—",
          unitId: creditPayment.unit_id,
          unitCode: creditPayment.unit_code ?? "—",
          paymentDate: creditPayment.payment_date,
          advanceAmount: creditPayment.advance_amount ?? 0,
          remaining: creditPayment.credit_remaining ?? 0,
          isStranded: creditPayment.credit_stranded ?? false,
          applications: creditPayment.applications ?? [],
        } : null}
        dues={dues}
        periods={periods}
        canApply={canApplyCredit}
        organizationId={organizationId}
        currency={currency}
        locale={locale}
      />
    </div>
  );
}
