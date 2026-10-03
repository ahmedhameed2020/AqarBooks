"use client";

import { Brain, ShieldAlert } from "lucide-react";

export function AiGovernanceClient({ locale = "ar" }: { locale?: string; organizationName?: string }) {
  const isAr = locale === "ar";

  return (
    <main className="space-y-6">
      <section className="rounded-2xl border border-amber-300/80 bg-amber-50 p-6 text-start dark:border-amber-900/50 dark:bg-amber-950/20">
        <div className="flex items-start gap-3">
          <div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-amber-500 text-white">
            <Brain className="size-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-lg font-black text-slate-900 dark:text-white">
              {isAr ? "حوكمة الذكاء الاصطناعي" : "AI Governance"}
            </h1>
            <div className="flex items-center gap-2 text-sm font-bold text-amber-900 dark:text-amber-200">
              <ShieldAlert className="size-4" />
              <span>{isAr ? "غير متاح تشغيليًا في نسخة MVP" : "Unavailable / Not operational in MVP"}</span>
            </div>
            <p className="max-w-2xl text-sm leading-6 text-amber-900/80 dark:text-amber-200/80">
              {isAr
                ? "لا توجد مفاتيح تشغيل أو سجلات تدقيق أو عدادات محلية معروضة؛ لم يتم تفعيل ميزات الذكاء الاصطناعي حتى تتوفر حوكمة محفوظة وتأثير runtime موثوق."
                : "No runtime toggles, audit logs, or local counters are shown. AI features remain disabled until persisted governance and a verified runtime effect are available."}
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
