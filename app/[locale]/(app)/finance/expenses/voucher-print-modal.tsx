"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import {
  Printer,
  Receipt,
  CheckCircle2,
  Building2,
  Share2,
  Mail,
  Copy,
  Check,
  Download,
  Send,
} from "lucide-react";
import { tafqeetArabic } from "@/lib/tafqeet";
import { generateExpenseVoucherPdf } from "@/lib/reports/expense-voucher-pdf";
import type { ExpenseRow } from "./expenses-client";

export function VoucherPrintModal({
  open,
  onOpenChange,
  expense,
  categoryName,
  accountName,
  organizationName,
  currencyCode,
  currencyLabel,
  locale,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  expense: ExpenseRow | null;
  categoryName: string;
  accountName: string;
  organizationName: string;
  currencyCode: string;
  currencyLabel: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const [copied, setCopied] = useState(false);

  if (!expense) return null;

  const tafqeetText = tafqeetArabic(expense.amount, currencyCode);

  const formattedAmount = expense.amount.toLocaleString(isAr ? "ar-EG" : "en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });

  const handlePrintPdf = () => {
    generateExpenseVoucherPdf(
      {
        organizationName,
        voucherNumber: expense.voucher_number,
        expenseDate: expense.expense_date,
        categoryName,
        paymentAccountName: accountName,
        description: expense.description,
        amount: expense.amount,
        currencyCode,
        currencyLabel,
        journalEntryId: expense.journal_entry_id,
      },
      locale
    );
  };

  const shareText = isAr
    ? `🧾 *سند صرف رسمي — ${organizationName}*
━━━━━━━━━━━━━━━━━━━━
🔢 *رقم السند:* #${expense.voucher_number ?? "—"}
📅 *تاريخ الصرف:* ${expense.expense_date}
💰 *المبلغ:* ${formattedAmount} ${currencyLabel}
✍️ *المبلغ بالحروف:* ${tafqeetText}
🏷️ *فئة المصروف:* ${categoryName}
📝 *البيان:* ${expense.description}
🏦 *حساب الدفع / الخزينة:* ${accountName}
━━━━━━━━━━━━━━━━━━━━
_نظام AqarBooks المالي_`
    : `🧾 *Official Payment Voucher — ${organizationName}*
━━━━━━━━━━━━━━━━━━━━
🔢 *Voucher #:* #${expense.voucher_number ?? "—"}
📅 *Date:* ${expense.expense_date}
💰 *Amount:* ${formattedAmount} ${currencyLabel}
✍️ *In Words:* ${tafqeetText}
🏷️ *Category:* ${categoryName}
📝 *Description:* ${expense.description}
🏦 *Paid From:* ${accountName}
━━━━━━━━━━━━━━━━━━━━
_AqarBooks Financial Suite_`;

  const handleShareWhatsApp = () => {
    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(shareText)}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleShareEmail = () => {
    const subject = isAr
      ? `سند صرف #${expense.voucher_number ?? "—"} — ${organizationName}`
      : `Payment Voucher #${expense.voucher_number ?? "—"} — ${organizationName}`;
    const mailto = `mailto:?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(
      shareText
    )}`;
    window.location.href = mailto;
  };

  const handleCopyText = async () => {
    try {
      await navigator.clipboard.writeText(shareText);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error("Clipboard error:", err);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl sm:max-w-3xl overflow-hidden p-0">
        <DialogHeader className="p-4 pb-3 border-b border-slate-200 dark:border-slate-800">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 w-full">
            <div className="flex items-center gap-2">
              <div className="flex size-9 items-center justify-center rounded-xl bg-blue-600/10 text-blue-600 dark:bg-blue-500/20 dark:text-blue-400">
                <Receipt className="size-4" />
              </div>
              <div>
                <DialogTitle className="text-base">
                  {isAr ? "معاينة وإرسال سند الصرف" : "Payment Voucher Preview & Share"}
                </DialogTitle>
                <DialogDescription className="text-xs">
                  {isAr
                    ? "طباعة وحفظ PDF وإرسال السند للعميل أو المورد عبر واتساب والبريد"
                    : "Print, save PDF, or send voucher to client/vendor via WhatsApp or Email"}
                </DialogDescription>
              </div>
            </div>

            {/* Top Quick Actions */}
            <div className="flex items-center gap-2 flex-wrap">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleShareWhatsApp}
                className="bg-emerald-50 text-emerald-700 hover:bg-emerald-100 hover:text-emerald-800 border-emerald-300 font-bold gap-1.5 h-8 text-xs dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800"
              >
                <Send className="size-3.5" />
                <span>{isAr ? "واتساب" : "WhatsApp"}</span>
              </Button>

              <Button
                type="button"
                size="sm"
                onClick={handlePrintPdf}
                className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5 h-8 text-xs cursor-pointer shadow-xs"
              >
                <Download className="size-3.5" />
                <span>{isAr ? "تحميل / طباعة PDF" : "PDF / Print"}</span>
              </Button>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="p-6 max-h-[72vh] overflow-y-auto bg-slate-100/60 dark:bg-slate-950/60">
          {/* Printable Container */}
          <div className="mx-auto max-w-2xl bg-white p-8 text-slate-900 shadow-sm border border-slate-300 rounded-xl dark:bg-white dark:text-slate-900">
            {/* Header */}
            <div className="flex items-start justify-between border-b-2 border-slate-900 pb-4">
              <div>
                <div className="flex items-center gap-2 text-slate-900 font-extrabold text-lg">
                  <Building2 className="size-5 text-blue-800" />
                  <span>{organizationName}</span>
                </div>
                <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                  {isAr ? "الإدارة المالية والحسابات العامة" : "Finance & Accounting Department"}
                </p>
              </div>

              <div className="text-end">
                <div className="inline-block px-3 py-1 bg-slate-900 text-white font-black text-sm rounded">
                  {isAr ? "سند صرف نقدية / بنك" : "PAYMENT VOUCHER"}
                </div>
                <div className="mt-1.5 font-mono text-xs font-bold text-slate-700">
                  {isAr ? "رقم السند: " : "Voucher #: "}
                  <span className="text-blue-700 font-black">#{expense.voucher_number ?? "—"}</span>
                </div>
              </div>
            </div>

            {/* Date & Meta Row */}
            <div className="mt-4 grid grid-cols-2 gap-4 rounded-lg bg-slate-50 p-3 border border-slate-200 text-xs">
              <div>
                <span className="text-slate-500 font-medium block">
                  {isAr ? "تاريخ التحرير / الصرف:" : "Disbursement Date:"}
                </span>
                <span className="font-mono font-bold text-slate-900 text-sm mt-0.5 block">
                  {expense.expense_date}
                </span>
              </div>
              <div className="text-end">
                <span className="text-slate-500 font-medium block">
                  {isAr ? "حساب الدفع / الخزينة:" : "Paid From Account:"}
                </span>
                <span className="font-bold text-slate-900 text-sm mt-0.5 block">
                  {accountName}
                </span>
              </div>
            </div>

            {/* Amount Box */}
            <div className="mt-4 flex items-center justify-between rounded-lg border-2 border-blue-900/40 bg-blue-50/50 p-4">
              <div>
                <span className="text-[11px] font-bold text-blue-950 uppercase tracking-wider block">
                  {isAr ? "المبلغ المستحق للصرف" : "Amount Paid"}
                </span>
                <div className="font-mono font-black text-2xl text-blue-950 mt-0.5">
                  {formattedAmount} <span className="text-sm font-bold">{currencyLabel}</span>
                </div>
              </div>

              <div className="text-end max-w-xs">
                <span className="text-[10px] text-slate-500 font-medium block">
                  {isAr ? "تفقيط المبلغ بالحروف:" : "Amount in Words:"}
                </span>
                <p className="text-xs font-extrabold text-blue-900 mt-1 leading-snug">
                  {tafqeetText}
                </p>
              </div>
            </div>

            {/* Description & Category Details */}
            <div className="mt-4 space-y-3 rounded-lg border border-slate-200 p-4 text-xs">
              <div className="flex items-start justify-between border-b border-slate-100 pb-2">
                <span className="text-slate-500 font-medium">{isAr ? "فئة المصروف:" : "Expense Category:"}</span>
                <span className="font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                  {categoryName}
                </span>
              </div>

              <div className="space-y-1">
                <span className="text-slate-500 font-medium block">
                  {isAr ? "البيان / تفاصيل وجه الصرف:" : "Description / Expenditure Purpose:"}
                </span>
                <p className="font-medium text-slate-900 text-sm leading-relaxed p-2 bg-slate-50 rounded border border-slate-100">
                  {expense.description}
                </p>
              </div>

              {expense.journal_entry_id && (
                <div className="flex items-center gap-1.5 text-[11px] text-emerald-700 font-semibold pt-1">
                  <CheckCircle2 className="size-3.5" />
                  <span>
                    {isAr
                      ? "تم ترحيل القيد المحاسبي المزدوج تلقائياً في دفتر اليومية العامة."
                      : "Double-entry transaction posted automatically to the General Ledger."}
                  </span>
                </div>
              )}
            </div>

            {/* Signatures Section */}
            <div className="mt-8 pt-4 border-t-2 border-slate-300">
              <div className="grid grid-cols-3 gap-4 text-center text-xs">
                <div className="space-y-8">
                  <span className="font-bold text-slate-700 block">
                    {isAr ? "إعداد المحاسب" : "Prepared By"}
                  </span>
                  <div className="border-b border-dashed border-slate-400 w-3/4 mx-auto" />
                </div>

                <div className="space-y-8">
                  <span className="font-bold text-slate-700 block">
                    {isAr ? "الاعتماد المالي / الإدارة" : "Financial Approval"}
                  </span>
                  <div className="border-b border-dashed border-slate-400 w-3/4 mx-auto" />
                </div>

                <div className="space-y-8">
                  <span className="font-bold text-slate-700 block">
                    {isAr ? "توقيع واستلام المستفيد" : "Recipient Signature"}
                  </span>
                  <div className="border-b border-dashed border-slate-400 w-3/4 mx-auto" />
                </div>
              </div>
            </div>

            {/* Footer Notice */}
            <div className="mt-8 text-center text-[10px] text-slate-400 border-t border-slate-100 pt-2">
              <span>{isAr ? "نظام AqarBooks المالي — طبعت بتاريخ: " : "AqarBooks Financial System — Printed: "}</span>
              <span className="font-mono">{new Date().toLocaleString(isAr ? "ar-EG" : "en-US")}</span>
            </div>
          </div>
        </DialogBody>

        <DialogFooter className="p-3 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 flex items-center justify-between w-full">
          <div className="flex items-center gap-2">
            {/* Copy Button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleCopyText}
              className="text-xs font-bold gap-1"
            >
              {copied ? <Check className="size-3.5 text-emerald-600" /> : <Copy className="size-3.5" />}
              <span>{copied ? (isAr ? "تم النسخ!" : "Copied!") : (isAr ? "نسخ النص" : "Copy Text")}</span>
            </Button>

            {/* Email Button */}
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={handleShareEmail}
              className="text-xs font-bold gap-1"
            >
              <Mail className="size-3.5 text-blue-600" />
              <span>{isAr ? "إرسال إيميل" : "Email"}</span>
            </Button>
          </div>

          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {isAr ? "إغلاق" : "Close"}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handlePrintPdf}
              className="bg-blue-600 hover:bg-blue-700 text-white font-bold gap-1.5"
            >
              <Printer className="size-3.5" />
              <span>{isAr ? "تحميل / طباعة PDF" : "PDF / Print"}</span>
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
