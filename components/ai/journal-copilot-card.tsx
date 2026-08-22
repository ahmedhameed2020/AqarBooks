"use client";

import { useState } from "react";
import { Link } from "@/i18n/navigation";
import {
  Sparkles,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  ArrowDownRight,
  Check,
  X,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import type { JournalEntryProposal, JournalLineProposal } from "@/lib/ai/journal-copilot";

export function JournalCopilotCard({
  organizationId,
  locale = "ar",
  onApplyProposal,
}: {
  organizationId: string;
  locale?: string;
  onApplyProposal: (proposal: JournalEntryProposal) => void;
}) {
  const isAr = locale === "ar";
  const toast = useToast();

  const [descriptionInput, setDescriptionInput] = useState("");
  const [amountInput, setAmountInput] = useState("");
  const [vendorInput, setVendorInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [proposal, setProposal] = useState<JournalEntryProposal | null>(null);
  const [showExplanation, setShowExplanation] = useState(true);

  const handlePropose = async () => {
    if (!descriptionInput.trim()) {
      toast.add({
        type: "error",
        title: isAr ? "يرجى كتابة وصف المعاملة" : "Please enter transaction description",
      });
      return;
    }

    setLoading(true);
    try {
      const res = await fetch("/api/ai/journal-propose", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: descriptionInput,
          amount: Number(amountInput) || 0,
          vendorName: vendorInput,
          organizationId,
          locale,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.proposal) {
          setProposal(json.proposal);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleApply = () => {
    if (!proposal) return;
    onApplyProposal(proposal);
    toast.add({
      type: "success",
      title: isAr ? "تم تطبيق أسطر القيد المقترحة بنجاح ✨" : "Journal Proposal Applied",
      description: isAr
        ? "يمكنك الآن مراجعة الأرقام والأسطر واعتماد حفظ القيد."
        : "You can now review lines and post the journal entry.",
    });
  };

  return (
    <div className="rounded-2xl border border-purple-200/80 bg-gradient-to-br from-purple-50/40 via-white to-indigo-50/30 p-4.5 shadow-xs dark:border-purple-900/40 dark:from-purple-950/20 dark:via-slate-900 dark:to-indigo-950/20 space-y-3.5">
      {/* Header & Quick Input */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-8.5 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-xs">
            <Sparkles className="size-4" />
          </div>
          <div>
            <h3 className="text-xs font-black text-slate-900 dark:text-white flex items-center gap-1.5">
              <span>{isAr ? "مساعد صياغة قيود اليومية (Journal Entry Copilot)" : "Journal Entry AI Copilot"}</span>
              <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 text-[10px] font-bold">
                Double-Entry Enforced
              </Badge>
            </h3>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {isAr
                ? "اكتب وصف المصروف أو الفاتورة وسيقترح الذكاء الاصطناعي أطراف القيد المتوازنة بناءً على سياسات المنشأة"
                : "Type transaction description to get balanced debit/credit proposals according to tenant policy"}
            </p>
          </div>
        </div>
      </div>

      {/* Input Box */}
      <div className="grid grid-cols-1 sm:grid-cols-12 gap-2.5 pt-1">
        <div className="sm:col-span-6">
          <Input
            value={descriptionInput}
            onChange={(e) => setDescriptionInput(e.target.value)}
            placeholder={isAr ? "مثال: صيانة دورية للمصاعد برج الياسمين شركة OTIS..." : "e.g. Monthly elevator maintenance OTIS..."}
            className="text-xs font-medium"
          />
        </div>
        <div className="sm:col-span-2">
          <Input
            type="number"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
            placeholder={isAr ? "المبلغ (اختياري)" : "Amount"}
            className="text-xs font-mono font-bold"
          />
        </div>
        <div className="sm:col-span-2">
          <Input
            value={vendorInput}
            onChange={(e) => setVendorInput(e.target.value)}
            placeholder={isAr ? "المورد / الجهة" : "Vendor"}
            className="text-xs font-medium"
          />
        </div>
        <div className="sm:col-span-2">
          <Button
            type="button"
            disabled={loading || !descriptionInput.trim()}
            onClick={handlePropose}
            className="w-full h-9 text-xs font-bold rounded-xl bg-purple-600 hover:bg-purple-700 text-white gap-1.5 cursor-pointer shadow-xs"
          >
            <Sparkles className={`size-3.5 ${loading ? "animate-spin" : ""}`} />
            <span>{loading ? (isAr ? "جاري الصياغة..." : "Drafting...") : (isAr ? "اقتراح القيد ✨" : "Propose Draft")}</span>
          </Button>
        </div>
      </div>

      {/* Interactive Proposal Card */}
      {proposal && (
        <div className="rounded-xl border border-purple-200 bg-white p-4 space-y-3 shadow-xs dark:border-purple-900/50 dark:bg-slate-900">
          <div className="flex items-center justify-between border-b border-purple-100 dark:border-purple-900/30 pb-2.5">
            <div className="flex items-center gap-2">
              <ShieldCheck className="size-4 text-emerald-600" />
              <span className="text-xs font-black text-slate-900 dark:text-white">
                {isAr ? "القيد المحاسبي المقترح (Balanced Double-Entry)" : "Proposed Journal Entry"}
              </span>
              {proposal.policyUsed && (
                <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 text-[10px] font-bold">
                  ✓ {isAr ? `سياسة المنشأة: ${proposal.policyUsed.policyName}` : `Tenant Policy: ${proposal.policyUsed.policyName}`}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-2">
              <span className="text-[11px] font-mono text-slate-500">
                {isAr ? `نسبة الثقة العامة: ${proposal.confidence.overall}%` : `Confidence: ${proposal.confidence.overall}%`}
              </span>
            </div>
          </div>

          {/* Subledger Route Guard Banner (ERP Best Practice) */}
          {proposal.subledgerRouteGuard?.isSubledgerCandidate && (
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-300 text-xs text-amber-900 dark:bg-amber-950/40 dark:border-amber-900 dark:text-amber-200">
              <div className="flex items-start gap-2">
                <AlertTriangle className="size-4 text-amber-600 shrink-0 mt-0.5" />
                <span className="leading-relaxed font-semibold">{proposal.subledgerRouteGuard.warningMessage}</span>
              </div>
              <Link href={proposal.subledgerRouteGuard.targetUrl}>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  className="shrink-0 h-7 text-[11px] font-bold border-amber-400 bg-white hover:bg-amber-100 text-amber-950 dark:bg-slate-900 dark:text-amber-200 gap-1 cursor-pointer"
                >
                  <span>{proposal.subledgerRouteGuard.actionLabel}</span>
                  <ExternalLink className="size-3" />
                </Button>
              </Link>
            </div>
          )}

          {/* Table Preview */}
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-start">
              <thead className="bg-slate-50 text-slate-700 dark:bg-slate-800/50 dark:text-slate-300 font-bold">
                <tr>
                  <th className="p-2 text-start">{isAr ? "كود واسم الحساب" : "Account"}</th>
                  <th className="p-2 text-start">{isAr ? "البيان" : "Description"}</th>
                  <th className="p-2 text-end">{isAr ? "مدين (Debit)" : "Debit"}</th>
                  <th className="p-2 text-end">{isAr ? "دائن (Credit)" : "Credit"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800 font-mono">
                {proposal.lines.map((l, i) => (
                  <tr key={i} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/20">
                    <td className="p-2 font-bold text-slate-900 dark:text-white">
                      <span className="text-purple-600 font-black">{l.accountCode}</span> — {l.accountName}
                    </td>
                    <td className="p-2 text-slate-600 dark:text-slate-300 font-sans text-[11px]">{l.description}</td>
                    <td className="p-2 text-end font-bold text-slate-900 dark:text-white">
                      {l.debit > 0 ? l.debit.toLocaleString() : "—"}
                    </td>
                    <td className="p-2 text-end font-bold text-slate-900 dark:text-white">
                      {l.credit > 0 ? l.credit.toLocaleString() : "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Multi-Factor Confidence Breakdown Matrix */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-100 dark:border-slate-800 text-[10px] font-bold">
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400">
              <span>{isAr ? "مطابقة المورد: " : "Supplier: "}</span>
              <span className="font-mono text-emerald-600 font-black">{proposal.confidence.supplierMatch}%</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400">
              <span>{isAr ? "تصنيف الحساب: " : "Account: "}</span>
              <span className="font-mono text-emerald-600 font-black">{proposal.confidence.expenseAccount}%</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400">
              <span>{isAr ? "معالجة الضريبة VAT: " : "VAT Treatment: "}</span>
              <span className="font-mono text-emerald-600 font-black">{proposal.confidence.vatTreatment}%</span>
            </div>
            <div className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 text-slate-600 dark:text-slate-400">
              <span>{isAr ? "أبعاد العقار/الوحدة: " : "Dimensions: "}</span>
              <span className="font-mono text-emerald-600 font-black">{proposal.confidence.dimensionResolution}%</span>
            </div>
          </div>

          {/* Reasoning Rationale Box */}
          {proposal.justificationReason && (
            <div className="p-2.5 rounded-xl bg-purple-50/70 border border-purple-100 text-xs text-purple-900 dark:bg-purple-950/30 dark:border-purple-900/40 dark:text-purple-200">
              <span className="font-bold">{isAr ? "💡 لماذا تم اقتراح هذا الحساب؟ " : "💡 Why was this suggested? "}</span>
              <span>{proposal.justificationReason}</span>
            </div>
          )}

          {/* Action Button Bar */}
          <div className="flex items-center justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setProposal(null)}
              className="text-xs h-8 rounded-lg cursor-pointer"
            >
              <X className="size-3.5" />
              <span>{isAr ? "إلغاء الاقتراح" : "Dismiss"}</span>
            </Button>

            <Button
              type="button"
              size="sm"
              onClick={handleApply}
              className="text-xs h-8 font-bold rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 cursor-pointer shadow-xs"
            >
              <Check className="size-3.5" />
              <span>{isAr ? "تطبيق واعتماد القيد في النموذج" : "Apply to Journal Form"}</span>
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
