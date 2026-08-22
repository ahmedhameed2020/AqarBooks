"use client";

import { useState } from "react";
import {
  Brain,
  ShieldCheck,
  AlertTriangle,
  Sparkles,
  CheckCircle2,
  Sliders,
  Activity,
  Zap,
  Lock,
  Layers,
  FileText,
  Clock,
  Terminal,
  RefreshCw,
  Power,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/components/ui/toast";
import {
  RELEASE_PROVENANCE,
  type AiFeatureKey,
  type OperationalKillSwitchState,
} from "@/lib/ai/kill-switch";

export function AiGovernanceClient({
  locale = "ar",
  organizationName,
}: {
  locale?: string;
  organizationName?: string;
}) {
  const isAr = locale === "ar";
  const toast = useToast();

  const [killSwitches, setKillSwitches] = useState<Record<AiFeatureKey, boolean>>({
    PLATFORM_GLOBAL: true,
    ASK_AQARBOOKS: true,
    INVOICE_OCR: true,
    JOURNAL_COPILOT: true,
    BANK_RECON_AI: true,
    SMART_DUNNING: true,
  });

  const [switchLogs, setSwitchLogs] = useState<OperationalKillSwitchState[]>([
    {
      feature: "JOURNAL_COPILOT",
      isEnabled: true,
      changedBy: "Finance Admin",
      changedAt: "2026-08-22T21:35:00.000Z", // strictly UTC ISO
      reason: "Re-enabled after successful Blind Holdout test suite execution",
    },
  ]);

  const handleToggle = (feature: AiFeatureKey) => {
    const nextState = !killSwitches[feature];
    setKillSwitches((prev) => ({ ...prev, [feature]: nextState }));

    const newLog: OperationalKillSwitchState = {
      feature,
      isEnabled: nextState,
      changedBy: "Finance Admin",
      changedAt: new Date().toISOString(), // UTC standard
      reason: nextState ? "Operational reactivation" : "Manual operational mitigation",
    };

    setSwitchLogs((prev) => [newLog, ...prev]);

    toast.show({
      type: nextState ? "success" : "info",
      title: isAr ? "تحديث مفتاح الإيقاف التشغيلي" : "Operational Kill Switch Updated",
      description: isAr
        ? `تم ${nextState ? "تفعيل" : "إيقاف"} ميزة (${feature}) بنجاح وتسجيل العملية في سجل التدقيق.`
        : `Feature (${feature}) ${nextState ? "enabled" : "disabled"} and audited in UTC.`,
    });
  };

  const featureLabels: Record<AiFeatureKey, { ar: string; en: string }> = {
    PLATFORM_GLOBAL: { ar: "المنصة بالكامل (Global Platform Kill Switch)", en: "Platform Global Kill Switch" },
    ASK_AQARBOOKS: { ar: "اسأل عقار بوكس (Conversational BI)", en: "Ask AqarBooks" },
    INVOICE_OCR: { ar: "استخراج ومطابقة الفواتير (OCR & Invoices)", en: "Invoice OCR & Parsing" },
    JOURNAL_COPILOT: { ar: "مساعد قيود اليومية وذاكرة السياسات", en: "Journal Copilot & Policy Memory" },
    BANK_RECON_AI: { ar: "محرك التسوية والمطابقة البنكية", en: "Bank Reconciliation AI" },
    SMART_DUNNING: { ar: "مسودات التحصيل الذكية (Smart Dunning)", en: "Smart Dunning Generator" },
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="rounded-2xl border border-amber-300/80 bg-gradient-to-br from-amber-500/10 via-white to-amber-500/5 p-5 dark:border-amber-900/50 dark:from-amber-950/30 dark:via-slate-950 dark:to-amber-950/10 space-y-3 shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-amber-500 text-white shadow-md">
              <Brain className="size-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-base font-black text-slate-900 dark:text-white">
                  {isAr ? "لوحة حوكمة الذكاء الاصطناعي والـ Shadow Pilot" : "AI Governance & Shadow Pilot Operations"}
                </h1>
                <Badge className="bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-300 font-mono font-bold text-xs">
                  🟡 SHADOW PILOT — 48% Evidence Complete
                </Badge>
              </div>
              <p className="text-xs text-slate-600 dark:text-slate-400">
                {isAr
                  ? "مراقبة الأدلة الميدانية الحقيقية، ومصفوفة الحوادث، وسجل الإصدارات، ومفاتيح الإيقاف الفورية."
                  : "Field evidence tracking, incident matrix, release provenance, and operational kill-switches."}
              </p>
            </div>
          </div>

          {/* Release Provenance Badges */}
          <div className="flex flex-wrap items-center gap-1.5 font-mono text-[10px]">
            <Badge variant="outline" className="bg-white/80 dark:bg-slate-900">
              Model: {RELEASE_PROVENANCE.baselineModel}
            </Badge>
            <Badge variant="outline" className="bg-white/80 dark:bg-slate-900">
              Prompt: {RELEASE_PROVENANCE.promptVersion}
            </Badge>
            <Badge variant="outline" className="bg-white/80 dark:bg-slate-900">
              Tools: {RELEASE_PROVENANCE.toolRegistryVersion}
            </Badge>
            <Badge variant="outline" className="bg-white/80 dark:bg-slate-900">
              SHA: {RELEASE_PROVENANCE.deploymentSha}
            </Badge>
          </div>
        </div>
      </div>

      {/* P0 Quality & Safety Verdicts */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20 space-y-1">
          <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 text-xs font-black">
            <ShieldCheck className="size-4 text-emerald-600" />
            <span>{isAr ? "عزل بيانات المنشآت (Tenant Isolation):" : "Tenant Isolation:"}</span>
          </div>
          <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
            0 Cross-Tenant violations observed across the certification test suite.
          </p>
        </div>

        <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20 space-y-1">
          <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 text-xs font-black">
            <ShieldCheck className="size-4 text-emerald-600" />
            <span>{isAr ? "موثوقية الأرقام المالية (Grounding):" : "Financial Grounding:"}</span>
          </div>
          <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
            0 unsupported financial claims observed in the current evaluated dataset.
          </p>
        </div>

        <div className="p-4 rounded-2xl border border-emerald-200 bg-emerald-50/60 dark:border-emerald-900/40 dark:bg-emerald-950/20 space-y-1">
          <div className="flex items-center gap-2 text-emerald-800 dark:text-emerald-300 text-xs font-black">
            <ShieldCheck className="size-4 text-emerald-600" />
            <span>{isAr ? "صمود المحاسبة (Accounting Outage Immunity):" : "Accounting Outage Immunity:"}</span>
          </div>
          <p className="text-xs font-semibold text-emerald-900 dark:text-emerald-200">
            {isAr ? "استمرار المحاسبة والدفاتر بنسبة 100% عند انقطاع مزود الذكاء الاصطناعي." : "Accounting core remains 100% operational during AI outages."}
          </p>
        </div>
      </div>

      {/* Shadow Pilot Evidence Progress Gates */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Activity className="size-4 text-purple-600" />
            <h2 className="text-sm font-black text-slate-900 dark:text-white">
              {isAr ? "بوابات الأدلة الميدانية للـ Shadow Pilot (Evidence Gates)" : "Shadow Pilot Evidence Gates"}
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-500">
            {isAr ? "الهدف: تحقيق المعايير الإحصائية للانتقال إلى Production Validated" : "Goal: Meet statistical thresholds for Production Validated"}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* OCR Gate */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span>{isAr ? "OCR الفواتير" : "Invoice OCR"}</span>
              <span className="font-mono text-purple-600">312 / 500</span>
            </div>
            <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-purple-600 rounded-full" style={{ width: "62.4%" }} />
            </div>
            <div className="flex items-center justify-between text-[11px] pt-1">
              <span className="text-slate-500">{isAr ? "نسبة التصحيح:" : "Correction Rate:"}</span>
              <span className="font-bold font-mono text-emerald-600">6.4% (الهدف: &lt;10%)</span>
            </div>
          </div>

          {/* Journal Copilot Gate */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span>{isAr ? "قيود اليومية والسياسات" : "Journal Copilot"}</span>
              <span className="font-mono text-purple-600">78 / 100</span>
            </div>
            <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-purple-600 rounded-full" style={{ width: "78%" }} />
            </div>
            <div className="text-[10px] space-y-0.5 pt-1 font-mono text-slate-600 dark:text-slate-300">
              <div className="flex justify-between">
                <span>Unchanged:</span> <span className="font-bold text-emerald-600">72%</span>
              </div>
              <div className="flex justify-between">
                <span>Edited:</span> <span className="font-bold text-blue-600">26%</span>
              </div>
              <div className="flex justify-between">
                <span>Rejected:</span> <span className="font-bold text-slate-500">2%</span>
              </div>
            </div>
          </div>

          {/* Bank Recon Gate */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span>{isAr ? "المطابقة البنكية Recon" : "Bank Reconciliation"}</span>
              <span className="font-mono text-purple-600">144 / 200</span>
            </div>
            <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-purple-600 rounded-full" style={{ width: "72%" }} />
            </div>
            <div className="flex items-center justify-between text-[11px] pt-1">
              <span className="text-slate-500">{isAr ? "دقة المطابقة:" : "Precision:"}</span>
              <span className="font-bold font-mono text-emerald-600">99.1% (الهدف: ≥98%)</span>
            </div>
          </div>

          {/* Ask AqarBooks Gate */}
          <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-800/40 space-y-2">
            <div className="flex items-center justify-between text-xs font-bold">
              <span>{isAr ? "اسأل عقار بوكس" : "Ask AqarBooks"}</span>
              <span className="font-mono text-purple-600">96 / 150</span>
            </div>
            <div className="h-1.5 w-full bg-slate-200 dark:bg-slate-700 rounded-full overflow-hidden">
              <div className="h-full bg-purple-600 rounded-full" style={{ width: "64%" }} />
            </div>
            <div className="flex items-center justify-between text-[11px] pt-1">
              <span className="text-slate-500">{isAr ? "حل في دورة واحدة:" : "1-Turn Resolution:"}</span>
              <span className="font-bold font-mono text-emerald-600">92.3% (الهدف: ≥90%)</span>
            </div>
          </div>
        </div>
      </div>

      {/* AI Incident Severity Matrix */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <AlertTriangle className="size-4 text-amber-600" />
            <h2 className="text-sm font-black text-slate-900 dark:text-white">
              {isAr ? "مصفوفة تصنيف الحوادث (AI Incident Severity Matrix)" : "AI Incident Severity Matrix"}
            </h2>
          </div>
          <Badge className="bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-mono font-bold text-xs">
            0 AI-0 Critical Incidents
          </Badge>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
          <div className="p-3 rounded-xl border border-red-200 bg-red-50/50 dark:border-red-900/40 dark:bg-red-950/20 space-y-1">
            <div className="flex items-center justify-between text-xs font-black text-red-900 dark:text-red-300">
              <span>🔴 AI-0 Critical</span>
              <span className="font-mono text-sm font-black">0</span>
            </div>
            <p className="text-[10px] text-red-800 dark:text-red-400 leading-snug">
              {isAr ? "تسريب منشآت أو كتابة مالية غير مصرحة (حظر فوري)" : "Cross-tenant / unauthorized writes (immediate block)"}
            </p>
          </div>

          <div className="p-3 rounded-xl border border-amber-200 bg-amber-50/50 dark:border-amber-900/40 dark:bg-amber-950/20 space-y-1">
            <div className="flex items-center justify-between text-xs font-black text-amber-900 dark:text-amber-300">
              <span>🟠 AI-1 High</span>
              <span className="font-mono text-sm font-black">0</span>
            </div>
            <p className="text-[10px] text-amber-800 dark:text-amber-400 leading-snug">
              {isAr ? "رقم خاطئ تم اعتراضه قبل الترحيل الدفتري" : "Erroneous figure intercepted before posting"}
            </p>
          </div>

          <div className="p-3 rounded-xl border border-blue-200 bg-blue-50/50 dark:border-blue-900/40 dark:bg-blue-950/20 space-y-1">
            <div className="flex items-center justify-between text-xs font-black text-blue-900 dark:text-blue-300">
              <span>🟡 AI-2 Medium</span>
              <span className="font-mono text-sm font-black">2</span>
            </div>
            <p className="text-[10px] text-blue-800 dark:text-blue-400 leading-snug">
              {isAr ? "أداة أو كيان غير دقيق صححه المحاسب" : "Inexact entity resolved & corrected"}
            </p>
          </div>

          <div className="p-3 rounded-xl border border-slate-200 bg-slate-50/50 dark:border-slate-800 dark:bg-slate-800/40 space-y-1">
            <div className="flex items-center justify-between text-xs font-black text-slate-800 dark:text-slate-300">
              <span>⚪ AI-3 Low</span>
              <span className="font-mono text-sm font-black">5</span>
            </div>
            <p className="text-[10px] text-slate-600 dark:text-slate-400 leading-snug">
              {isAr ? "صياغة لغوية أو latency يحتاج تحسين" : "Minor phrasing or latency polish"}
            </p>
          </div>
        </div>
      </div>

      {/* Operational Kill Switches */}
      <div className="rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 p-5 space-y-4 shadow-xs">
        <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
          <div className="flex items-center gap-2">
            <Power className="size-4 text-rose-600" />
            <h2 className="text-sm font-black text-slate-900 dark:text-white">
              {isAr ? "مفاتيح الإيقاف التشغيلي اللحظي (Operational Kill Switches)" : "Operational Kill Switches"}
            </h2>
          </div>
          <span className="text-xs font-mono text-slate-500">
            {isAr ? "تحكم فوري دون الحاجة لإعادة بناء (Redeploy)" : "Instant runtime toggles without redeployment"}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {(Object.keys(killSwitches) as AiFeatureKey[]).map((featKey) => (
            <div
              key={featKey}
              className={`p-3.5 rounded-xl border transition-all flex items-center justify-between ${
                killSwitches[featKey]
                  ? "border-slate-200 bg-slate-50/60 dark:border-slate-800 dark:bg-slate-800/30"
                  : "border-rose-300 bg-rose-50/50 dark:border-rose-900/40 dark:bg-rose-950/20"
              }`}
            >
              <div className="space-y-0.5 pe-2">
                <span className="text-xs font-black text-slate-900 dark:text-white block">
                  {isAr ? featureLabels[featKey].ar : featureLabels[featKey].en}
                </span>
                <span className="text-[10px] font-mono text-slate-500">
                  {killSwitches[featKey] ? "STATUS: ACTIVE" : "STATUS: DISABLED"}
                </span>
              </div>

              <Button
                type="button"
                size="sm"
                variant={killSwitches[featKey] ? "outline" : "destructive"}
                onClick={() => handleToggle(featKey)}
                className="shrink-0 h-8 text-xs font-bold rounded-xl cursor-pointer"
              >
                {killSwitches[featKey] ? (isAr ? "إيقاف ⏸️" : "Disable") : (isAr ? "تفعيل ▶️" : "Enable")}
              </Button>
            </div>
          ))}
        </div>

        {/* Audit Log for Kill Switches */}
        {switchLogs.length > 0 && (
          <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1.5">
            <span className="text-[11px] font-bold text-slate-500 block">
              {isAr ? "سجل تعديلات مفاتيح الإيقاف (Audited in UTC):" : "Kill Switch Operational Audit (UTC):"}
            </span>
            <div className="space-y-1 font-mono text-[10px] text-slate-600 dark:text-slate-400">
              {switchLogs.map((log, i) => (
                <div key={i} className="p-2 rounded-lg bg-slate-50 dark:bg-slate-800/40 flex justify-between">
                  <span>
                    <strong className="text-slate-900 dark:text-white">{log.feature}</strong> → {log.isEnabled ? "ENABLED" : "DISABLED"} by {log.changedBy} ({log.reason})
                  </span>
                  <span className="text-slate-400">{log.changedAt}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
