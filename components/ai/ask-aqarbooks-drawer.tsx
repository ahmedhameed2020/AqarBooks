"use client";

import { useState } from "react";
import {
  Sparkles,
  Send,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  ShieldCheck,
  FileSpreadsheet,
  X,
  HelpCircle,
  MessageSquare,
  Building2,
  CheckCircle2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import type { AskAqarBooksResponse } from "@/lib/ai/ask-aqarbooks-engine";

export function AskAqarBooksDrawer({
  locale = "ar",
  pageContext,
}: {
  locale?: string;
  pageContext?: { pageName?: string; entityId?: string };
}) {
  const isAr = locale === "ar";
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(false);
  const [chatHistory, setChatHistory] = useState<
    { query: string; response: AskAqarBooksResponse }[]
  >([]);

  const handleAsk = async (userQueryToAsk?: string) => {
    const text = userQueryToAsk || query;
    if (!text.trim() || loading) return;

    setLoading(true);
    setQuery("");

    try {
      const res = await fetch("/api/ai/ask-aqarbooks", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query: text,
          pageContext,
          locale,
        }),
      });

      if (res.ok) {
        const json = await res.json();
        if (json.success && json.data) {
          setChatHistory((prev) => [...prev, { query: text, response: json.data }]);
        }
      }
    } catch {
      // ignore
    } finally {
      setLoading(false);
    }
  };

  const samplePrompts = isAr
    ? [
        "ما هو معدل التحصيل العام وإجمالي المتأخرات؟",
        "ما هو موقف السيولة النقدية والأرصدة البنكية الحالية؟",
        "أظهر فواتير ومستحقات الموردين غير المسددة",
        "ما ملخص مؤشرات الأداء المالية الرئيسية للمنشأة؟",
      ]
    : [
        "What is the collection rate and overdue summary?",
        "What is our current cash position across banks?",
        "Show unpaid supplier invoices and AP aging",
        "Give me an executive snapshot of our financial KPIs",
      ];

  return (
    <>
      {/* Floating Trigger Button (Restrained & Authoritative) */}
      <div className="fixed bottom-6 end-6 z-40">
        <Button
          type="button"
          onClick={() => setOpen(!open)}
          className="h-11 px-4 rounded-full bg-[#07425d] hover:bg-[#053247] text-white font-bold text-xs shadow-lg hover:shadow-xl transition-all gap-2 cursor-pointer border border-white/15 press-feedback motion-control"
        >
          <Sparkles className="size-4 text-purple-300" />
          <span>{isAr ? "اسأل AqarBooks" : "Ask AqarBooks"}</span>
        </Button>
      </div>

      {/* Side Drawer Panel */}
      {open && (
        <div className="fixed inset-y-0 end-0 z-50 w-full sm:w-[460px] bg-background border-s border-border shadow-2xl flex flex-col overflow-hidden animate-in slide-in-from-right duration-200 motion-surface">
          {/* Header */}
          <div className="p-4.5 border-b border-border bg-card flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex size-9 items-center justify-center rounded-xl bg-[#7e1898] text-white shadow-xs">
                <Sparkles className="size-4.5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h2 className="text-sm font-black text-foreground">
                    {isAr ? "اسأل AqarBooks" : "Ask AqarBooks"}
                  </h2>
                  <Badge variant="ai" className="text-[10px] font-bold py-0">
                    Verified Grounding
                  </Badge>
                </div>
                <p className="text-[11px] text-muted-foreground">
                  {isAr ? "إجابات مالية موثقة من بيانات منشأتك الحقيقية" : "Verified financial answers from your core ledger"}
                </p>
              </div>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setOpen(false)}
              className="size-8 p-0 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
            >
              <X className="size-4" />
            </Button>
          </div>

          {/* Chat / Content Feed */}
          <div className="flex-1 p-4 space-y-4 overflow-y-auto">
            {chatHistory.length === 0 ? (
              <div className="space-y-4 pt-4">
                <div className="p-4 rounded-2xl bg-purple-50/50 border border-purple-100 dark:bg-purple-950/20 dark:border-purple-900/30 text-xs text-purple-950 dark:text-purple-200 space-y-2">
                  <span className="font-bold flex items-center gap-1.5 text-purple-700 dark:text-purple-300">
                    <ShieldCheck className="size-4 text-emerald-600" />
                    {isAr ? "ذكاء مالي مؤسسي موثق بنسبة 100%:" : "100% Deterministic Grounding:"}
                  </span>
                  <p className="text-[11px] text-slate-600 dark:text-slate-300 leading-relaxed">
                    {isAr
                      ? "جميع الأرقام والنسب تُستخرج مباشرة من محرك AqarBooks المحاسبي ودفاتر الأستاذ دون أي تخمين أو تأليف أرقام."
                      : "All metrics and figures are computed directly by the AqarBooks core financial engine."}
                  </p>
                </div>

                <div className="space-y-2">
                  <span className="text-[11px] font-bold text-slate-400 px-1 block">
                    {isAr ? "استفسارات سريعة مقترحة:" : "Quick Suggested Questions:"}
                  </span>
                  <div className="space-y-1.5">
                    {samplePrompts.map((promptText, i) => (
                      <button
                        key={i}
                        type="button"
                        onClick={() => handleAsk(promptText)}
                        className="w-full p-2.5 rounded-xl border border-slate-200 hover:border-purple-300 bg-slate-50/70 hover:bg-purple-50/60 dark:border-slate-800 dark:bg-slate-900/60 dark:hover:bg-purple-950/30 text-start text-xs font-medium text-slate-700 dark:text-slate-300 transition-all cursor-pointer"
                      >
                        💡 {promptText}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : (
              chatHistory.map((item, idx) => (
                <div key={idx} className="space-y-3">
                  {/* User Query */}
                  <div className="flex justify-end">
                    <div className="max-w-[85%] p-3 rounded-2xl rounded-tr-xs bg-purple-600 text-white text-xs font-semibold shadow-xs">
                      {item.query}
                    </div>
                  </div>

                  {/* AI Response Card */}
                  <div className="p-4 rounded-2xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900 shadow-xs space-y-3 text-start">
                    {/* Narrative Summary */}
                    <p className="text-xs leading-relaxed font-bold text-slate-900 dark:text-white">
                      {item.response.answer}
                    </p>

                    {/* Key Metrics Chips */}
                    {item.response.keyMetrics && item.response.keyMetrics.length > 0 && (
                      <div className="grid grid-cols-1 gap-2 pt-1 sm:grid-cols-2">
                        {item.response.keyMetrics.map((m, mIdx) => (
                          <div
                            key={mIdx}
                            className="p-2.5 rounded-xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-100 dark:border-purple-900/40"
                          >
                            <span className="text-[10px] text-slate-500 dark:text-slate-400 block">{m.label}</span>
                            <span className="font-mono text-sm font-black text-purple-700 dark:text-purple-300">{m.value}</span>
                          </div>
                        ))}
                      </div>
                    )}

                    {/* Grounding Facts & Sources Banner */}
                    {item.response.sourcesUsed && item.response.sourcesUsed.length > 0 && (
                      <div className="p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 space-y-1.5">
                        <span className="text-[10px] font-bold text-slate-500 flex items-center gap-1">
                          <CheckCircle2 className="size-3 text-emerald-600" />
                          {isAr ? "البيانات والمصادر المستخدمة:" : "Verified Sources:"}
                        </span>
                        <div className="flex flex-wrap gap-1">
                          {item.response.sourcesUsed.map((s, sIdx) => (
                            <Badge
                              key={sIdx}
                              className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 text-[10px] font-mono py-0"
                            >
                              {s.toolName}
                            </Badge>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Follow up suggestions */}
                    {item.response.suggestedFollowUps && item.response.suggestedFollowUps.length > 0 && (
                      <div className="pt-2 border-t border-slate-100 dark:border-slate-800 space-y-1">
                        <span className="text-[10px] text-slate-400 font-bold block">
                          {isAr ? "أسئلة متابعة مقترحة:" : "Suggested Follow-ups:"}
                        </span>
                        <div className="flex flex-wrap gap-1.5">
                          {item.response.suggestedFollowUps.map((fText, fIdx) => (
                            <button
                              key={fIdx}
                              type="button"
                              onClick={() => handleAsk(fText)}
                              className="text-[10px] font-bold px-2 py-1 rounded-lg border border-purple-200 hover:bg-purple-50 text-purple-700 dark:border-purple-800 dark:text-purple-300 transition-all cursor-pointer"
                            >
                              + {fText}
                            </button>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}

            {loading && (
              <div className="flex items-center gap-2 p-3 rounded-2xl bg-purple-50/60 dark:bg-purple-950/30 border border-purple-100 text-xs font-bold text-purple-700 dark:text-purple-300">
                <RefreshCw className="size-4 animate-spin text-purple-600" />
                <span>{isAr ? "جاري استخراج وتحليل الأرقام من دفاتر المنظومة..." : "Querying verified core ledger facts..."}</span>
              </div>
            )}
          </div>

          {/* Query Input Bar */}
          <div className="p-3.5 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleAsk();
              }}
              className="flex items-center gap-2"
            >
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={isAr ? "اسأل عن التحصيل، السيولة، المتأخرات، المصروفات..." : "Ask about collection, cash, dues, expenses..."}
                className="text-xs h-10 rounded-xl"
              />
              <Button
                type="submit"
                disabled={loading || !query.trim()}
                className="size-10 rounded-xl bg-purple-600 hover:bg-purple-700 text-white shrink-0 p-0 cursor-pointer shadow-xs"
              >
                <Send className="size-4" />
              </Button>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
