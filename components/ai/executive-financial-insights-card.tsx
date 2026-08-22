"use client";

import { useState } from "react";
import { Sparkles, TrendingUp, AlertTriangle, CheckCircle2, ShieldAlert, RefreshCw, ChevronDown, ChevronUp, Lightbulb } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { FinancialMetricsInput, ExecutiveAiInsight } from "@/lib/ai/financial-insights";

export function ExecutiveFinancialInsightsCard({
  metrics,
  initialInsight,
  locale = "ar",
}: {
  metrics: FinancialMetricsInput;
  initialInsight?: ExecutiveAiInsight | null;
  locale?: string;
}) {
  const isAr = locale === "ar";
  const [insight, setInsight] = useState<ExecutiveAiInsight | null>(initialInsight ?? null);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(true);

  const fetchInsights = async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai/financial-insights", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ metrics, locale }),
      });
      if (res.ok) {
        const data = await res.json();
        setInsight(data);
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: "HEALTHY" | "WARNING" | "CRITICAL") => {
    switch (status) {
      case "HEALTHY":
        return (
          <Badge className="bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border-emerald-500/20 text-xs font-bold gap-1">
            <CheckCircle2 className="size-3" />
            <span>{isAr ? "وضع مالي مستقر" : "Healthy Standing"}</span>
          </Badge>
        );
      case "WARNING":
        return (
          <Badge className="bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20 text-xs font-bold gap-1">
            <AlertTriangle className="size-3" />
            <span>{isAr ? "تنبيه سيولة ومتأخرات" : "Arrears Alert"}</span>
          </Badge>
        );
      case "CRITICAL":
        return (
          <Badge className="bg-rose-500/10 text-rose-700 dark:text-rose-300 border-rose-500/20 text-xs font-bold gap-1">
            <ShieldAlert className="size-3" />
            <span>{isAr ? "تحصيل حرج يتطلب تدخلاً" : "Critical Deficit"}</span>
          </Badge>
        );
    }
  };

  return (
    <div className="relative overflow-hidden rounded-3xl border border-purple-200/70 bg-gradient-to-br from-purple-50/50 via-white to-indigo-50/40 p-5 shadow-xs dark:border-purple-900/40 dark:from-purple-950/20 dark:via-slate-900 dark:to-indigo-950/20">
      {/* Top Header */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="flex size-9 items-center justify-center rounded-xl bg-gradient-to-br from-purple-600 to-indigo-600 text-white shadow-sm">
            <Sparkles className="size-4.5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-black tracking-tight text-slate-900 dark:text-white">
                {isAr ? "التحليل السردي المالي الذكي" : "AqarBooks Financial Intelligence"}
              </h2>
              <span className="rounded-md bg-purple-100 px-1.5 py-0.5 text-[10px] font-bold text-purple-700 dark:bg-purple-900/50 dark:text-purple-300">
                AI CFO
              </span>
            </div>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">
              {isAr ? "تحليل قطعي للأرقام المحاسبية والتغيرات المالية" : "Executive narrative based on verified accounting numbers"}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {insight && getStatusBadge(insight.healthStatus)}
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={fetchInsights}
            disabled={loading}
            className="h-8 gap-1.5 text-xs font-bold rounded-xl border-purple-200 hover:bg-purple-50 dark:border-purple-800 dark:hover:bg-purple-950/50 cursor-pointer"
          >
            <RefreshCw className={`size-3.5 text-purple-600 ${loading ? "animate-spin" : ""}`} />
            <span>{insight ? (isAr ? "تحديث التحليل" : "Refresh") : (isAr ? "توليد التحليل الذكي" : "Generate Insight")}</span>
          </Button>
          {insight && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400"
            >
              {expanded ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}
            </button>
          )}
        </div>
      </div>

      {/* Main Content */}
      {insight && expanded && (
        <div className="mt-4 space-y-3 pt-3 border-t border-purple-100 dark:border-purple-900/30">
          {/* Headline */}
          <div className="flex items-start gap-2 bg-white/80 dark:bg-slate-900/80 p-3 rounded-2xl border border-purple-100/60 dark:border-purple-900/30">
            <TrendingUp className="size-4 text-indigo-600 shrink-0 mt-0.5" />
            <p className="text-xs font-bold text-slate-900 dark:text-slate-100 leading-relaxed">
              {insight.headline}
            </p>
          </div>

          {/* Observations & Recommendations Grid */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Key Observations */}
            <div className="rounded-2xl bg-white/60 dark:bg-slate-900/60 p-3 border border-slate-100 dark:border-slate-800">
              <h4 className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                <span className="size-1.5 rounded-full bg-purple-500" />
                {isAr ? "أبرز المؤشرات والتركزات:" : "Key Observations:"}
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                {insight.keyObservations.map((obs, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="text-purple-600 font-bold">•</span>
                    <span>{obs}</span>
                  </li>
                ))}
              </ul>
            </div>

            {/* Recommendations */}
            <div className="rounded-2xl bg-white/60 dark:bg-slate-900/60 p-3 border border-slate-100 dark:border-slate-800">
              <h4 className="text-[11px] font-bold text-slate-700 dark:text-slate-300 mb-2 flex items-center gap-1.5">
                <Lightbulb className="size-3 text-amber-500" />
                {isAr ? "التوصيات الإدارية والتحصيلية:" : "Actionable Recommendations:"}
              </h4>
              <ul className="space-y-1.5 text-xs text-slate-600 dark:text-slate-400">
                {insight.recommendations.map((rec, idx) => (
                  <li key={idx} className="flex items-start gap-1.5">
                    <span className="text-emerald-600 font-bold">✓</span>
                    <span>{rec}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Risk Alert if any */}
          {insight.riskAlert && (
            <div className="flex items-center gap-2 rounded-xl bg-rose-50 p-2.5 text-xs font-semibold text-rose-800 dark:bg-rose-950/40 dark:text-rose-300 border border-rose-200 dark:border-rose-900">
              <AlertTriangle className="size-4 shrink-0" />
              <span>{insight.riskAlert}</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
