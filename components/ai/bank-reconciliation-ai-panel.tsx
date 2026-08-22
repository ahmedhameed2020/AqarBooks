"use client";

import { useState } from "react";
import { Sparkles, CheckCircle2, AlertTriangle, HelpCircle, Layers, RefreshCw, CheckCheck, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import { useRouter } from "next/navigation";
import { setLineMatch } from "@/lib/actions/bank-reconciliation";

export type ReconcileSummaryData = {
  strongCount: number;
  suggestedCount: number;
  needsReviewCount: number;
  unmatchedCount: number;
  bulkApprovableCandidateIds: { lineId: string; journalLineId: string }[];
};

export function BankReconciliationAiPanel({
  statementId,
  organizationId,
  locale = "ar",
}: {
  statementId: string;
  organizationId: string;
  locale?: string;
}) {
  const isAr = locale === "ar";
  const toast = useToast();
  const router = useRouter();

  const [loading, setLoading] = useState(false);
  const [bulkApplying, setBulkApplying] = useState(false);
  const [summary, setSummary] = useState<ReconcileSummaryData | null>(null);

  const handleScanReconciliation = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/reconcile-match", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statementId, organizationId }),
      });
      if (res.ok) {
        const json = await res.json();
        if (json.success && json.summary) {
          setSummary(json.summary);
          toast.add({
            type: "success",
            title: isAr ? "تم تحليل ومطابقة كشف الحساب بالذكاء الاصطناعي 🧠" : "AI Bank Match Analysis Complete",
            description: isAr
              ? `تم العثور على ${json.summary.strongCount} مطابقة مؤكدة و ${json.summary.suggestedCount} مطابقة مقترحة.`
              : `Found ${json.summary.strongCount} strong matches and ${json.summary.suggestedCount} suggested matches.`,
          });
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const handleBulkApprove = async () => {
    if (!summary || summary.bulkApprovableCandidateIds.length === 0) return;
    setBulkApplying(true);
    try {
      let approvedCount = 0;
      for (const pair of summary.bulkApprovableCandidateIds) {
        const formData = new FormData();
        formData.set("lineId", pair.lineId);
        formData.set("journalLineId", pair.journalLineId);
        const res = await setLineMatch({ ok: true }, formData);
        if (res.ok) approvedCount++;
      }

      toast.add({
        type: "success",
        title: isAr ? "تم اعتماد المطابقات المؤكدة بنجاح! 🎉" : "Bulk Matches Confirmed! 🎉",
        description: isAr
          ? `تم ربط واعتماد ${approvedCount} حركة بنكية في الدفاتر بنجاح.`
          : `Successfully matched ${approvedCount} transactions.`,
      });
      setSummary(null);
      router.refresh();
    } catch {
      // ignore
    } finally {
      setBulkApplying(false);
    }
  };

  return (
    <div className="rounded-2xl border border-purple-200/80 bg-gradient-to-br from-purple-50/40 via-white to-indigo-50/30 p-4.5 shadow-xs dark:border-purple-900/40 dark:from-purple-950/20 dark:via-slate-900 dark:to-indigo-950/20 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-xs">
            <Sparkles className="size-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h3 className="text-sm font-black text-slate-900 dark:text-white">
                {isAr ? "محرك المطابقة البنكية الذكي (Smart Bank Recon Copilot)" : "Smart Bank Reconciliation Engine"}
              </h3>
              <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900/50 dark:text-purple-300 text-[10px] font-bold">
                Scoring 95%+
              </Badge>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {isAr
                ? "مطابقة متعددة العوامل (المبلغ + كود الوحدة المستخرج + التاريخ + أنماط السداد السابقة)"
                : "Multi-factor scoring: amount, extracted unit, dates, and confirmed counterparty patterns"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={handleScanReconciliation}
            className="h-8.5 text-xs font-bold rounded-xl border-purple-200 hover:bg-purple-50 dark:border-purple-800 text-purple-700 dark:text-purple-300 gap-1.5 cursor-pointer shadow-xs"
          >
            <RefreshCw className={`size-3.5 text-purple-600 ${loading ? "animate-spin" : ""}`} />
            <span>{loading ? (isAr ? "جاري المطابقة..." : "Matching...") : (isAr ? "تحليل ومطابقة الحركات بالذكاء الاصطناعي" : "Scan & Match AI")}</span>
          </Button>

          {summary && summary.strongCount > 0 && (
            <Button
              type="button"
              size="sm"
              disabled={bulkApplying}
              onClick={handleBulkApprove}
              className="h-8.5 text-xs font-bold rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white gap-1.5 cursor-pointer shadow-xs"
            >
              <CheckCheck className={`size-3.5 ${bulkApplying ? "animate-spin" : ""}`} />
              <span>
                {bulkApplying
                  ? (isAr ? "جاري الاعتماد..." : "Confirming...")
                  : isAr
                  ? `اعتماد ${summary.strongCount} مطابقة مؤكدة جماعياً`
                  : `Bulk Confirm ${summary.strongCount} Matches`}
              </span>
            </Button>
          )}
        </div>
      </div>

      {summary && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-purple-100 dark:border-purple-900/30">
          <div className="p-2.5 rounded-xl bg-emerald-50/80 dark:bg-emerald-950/30 border border-emerald-200 dark:border-emerald-900/50 flex items-center justify-between">
            <span className="text-xs font-bold text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
              <CheckCircle2 className="size-3.5 text-emerald-600" />
              {isAr ? "تطابق مؤكد (95%+)" : "Strong Matches"}
            </span>
            <span className="text-sm font-black text-emerald-900 dark:text-emerald-100">{summary.strongCount}</span>
          </div>

          <div className="p-2.5 rounded-xl bg-blue-50/80 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-900/50 flex items-center justify-between">
            <span className="text-xs font-bold text-blue-800 dark:text-blue-300 flex items-center gap-1.5">
              <Layers className="size-3.5 text-blue-600" />
              {isAr ? "مطابقة مقترحة (80-94%)" : "Suggested"}
            </span>
            <span className="text-sm font-black text-blue-900 dark:text-blue-100">{summary.suggestedCount}</span>
          </div>

          <div className="p-2.5 rounded-xl bg-amber-50/80 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900/50 flex items-center justify-between">
            <span className="text-xs font-bold text-amber-800 dark:text-amber-300 flex items-center gap-1.5">
              <AlertTriangle className="size-3.5 text-amber-600" />
              {isAr ? "تحتاج مراجعة (60-79%)" : "Needs Review"}
            </span>
            <span className="text-sm font-black text-amber-900 dark:text-amber-100">{summary.needsReviewCount}</span>
          </div>

          <div className="p-2.5 rounded-xl bg-slate-100/80 dark:bg-slate-800/40 border border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <span className="text-xs font-bold text-slate-600 dark:text-slate-400 flex items-center gap-1.5">
              <HelpCircle className="size-3.5 text-slate-400" />
              {isAr ? "غير متطابقة" : "Unmatched"}
            </span>
            <span className="text-sm font-black text-slate-700 dark:text-slate-200">{summary.unmatchedCount}</span>
          </div>
        </div>
      )}
    </div>
  );
}
