"use client";

import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogBody,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Brain, CheckCircle2, ShieldCheck, Sparkles, Sliders, Layers, RefreshCw, FileText } from "lucide-react";
import { DEFAULT_REAL_ESTATE_POLICIES, type TenantAccountingPolicy } from "@/lib/ai/policy-memory-types";

export function TenantPolicyMemoryDialog({
  open,
  onOpenChange,
  organizationId,
  locale = "ar",
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  locale?: string;
}) {
  const isAr = locale === "ar";
  const [policies, setPolicies] = useState<TenantAccountingPolicy[]>(
    DEFAULT_REAL_ESTATE_POLICIES.map((p, idx) => ({
      ...p,
      id: `pol-${idx + 1}`,
      tenantId: organizationId,
    }))
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[85vh] flex flex-col p-0 overflow-hidden">
        <DialogHeader className="p-5 pb-3 border-b border-slate-200 dark:border-slate-800 shrink-0 bg-gradient-to-r from-purple-50/50 via-white to-indigo-50/50 dark:from-purple-950/20 dark:via-slate-900 dark:to-indigo-950/20">
          <div className="flex items-center gap-3">
            <div className="flex size-10 items-center justify-center rounded-xl bg-purple-600 text-white shadow-xs">
              <Brain className="size-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <DialogTitle className="text-base font-black text-slate-950 dark:text-white">
                  {isAr ? "ذاكرة السياسات المحاسبية للمنشأة (Tenant Policy Memory)" : "Tenant Accounting Policy Memory"}
                </DialogTitle>
                <Badge className="bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300 text-[10px] font-bold">
                  Governed Learning
                </Badge>
              </div>
              <DialogDescription className="text-xs text-slate-500">
                {isAr
                  ? "القواعد والسياسات المحاسبية المعتمدة التي تعلمها النظام بناءً على قرارات المحاسبين السابقة."
                  : "Auditable accounting rules and policies learned from human-approved transactions."}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <DialogBody className="p-5 space-y-4 overflow-y-auto flex-1">
          <div className="rounded-xl border border-purple-100 bg-purple-50/60 p-3 text-xs text-purple-900 dark:border-purple-900/30 dark:bg-purple-950/20 dark:text-purple-200 space-y-1">
            <span className="font-bold flex items-center gap-1.5">
              <ShieldCheck className="size-4 text-emerald-600" />
              {isAr ? "الحوكمة والمصداقية المحاسبية:" : "Accounting Governance:"}
            </span>
            <p className="text-[11px] text-purple-800 dark:text-purple-300 leading-relaxed">
              {isAr
                ? "لا تتغير السياسات المحاسبية إلا بعد تراكم اعتمادات بشرية متسقة، وتكون الأولوية دائماً للقواعد الضريبية ثم سياسة المنشأة ثم الذكاء الاصطناعي."
                : "Policies are only upgraded after consistent human approvals. Tax rules take precedence over AI proposals."}
            </p>
          </div>

          <div className="space-y-2.5">
            {policies.map((pol) => (
              <div
                key={pol.id}
                className="rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 p-3.5 space-y-2 shadow-xs"
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-mono font-black text-xs text-purple-600 dark:text-purple-400">
                      {pol.policyCode || "TP-0001"}
                    </span>
                    <span className="font-black text-xs text-slate-900 dark:text-white">
                      {pol.vendorPattern.split("|")[0]}
                    </span>
                    <Badge
                      className={`text-[10px] font-bold ${
                        pol.status === "ACTIVE"
                          ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                          : pol.status === "CANDIDATE"
                          ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                          : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                      }`}
                    >
                      ✓ {pol.status === "ACTIVE" ? (isAr ? "سياسة نشطة" : "Active Policy") : pol.status} (v{pol.version})
                    </Badge>
                  </div>

                  <span className="text-[11px] font-mono text-slate-500">
                    {isAr ? `تعلّم من ${pol.learnedFromApprovalsCount} قيد معتمد` : `Learned from ${pol.learnedFromApprovalsCount} postings`}
                  </span>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs pt-1 border-t border-slate-100 dark:border-slate-800">
                  <div>
                    <span className="text-slate-400 text-[11px] block">{isAr ? "الحساب المحاسبي المرتبط:" : "Target Account:"}</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200">
                      <span className="text-purple-600 font-mono font-black">{pol.preferredAccountCode}</span> — {pol.preferredAccountName}
                    </span>
                  </div>

                  <div>
                    <span className="text-slate-400 text-[11px] block">{isAr ? "المعاملة الضريبية:" : "VAT Treatment:"}</span>
                    <span className="font-bold text-slate-800 dark:text-slate-200 font-mono">
                      {pol.vatTreatment === "INPUT_VAT_14" ? (isAr ? "خاضع لضريبة المدخلات (14%)" : "Input VAT 14%") : (isAr ? "غير خاضع / عام" : "None")}
                    </span>
                  </div>
                </div>

                {pol.approvedBy && (
                  <div className="text-[10px] text-slate-400 font-mono pt-1">
                    {isAr ? `معتمد بواسطة: ${pol.approvedBy} · سارية المفعول من: ${pol.effectiveFrom}` : `Approved by: ${pol.approvedBy} · Effective: ${pol.effectiveFrom}`}
                  </div>
                )}
              </div>
            ))}
          </div>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
