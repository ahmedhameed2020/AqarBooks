import { AlertTriangle, ShieldCheck } from "lucide-react";

export interface LegacyFinancialReadiness {
  readiness_status: "READY" | "HOLD";
  ready_for_production: boolean;
  open_total: number;
  open_high: number;
  open_medium: number;
  open_low: number;
  open_difference_total: number;
  latest_audit_at: string | null;
  latest_finding_at: string | null;
  audit_is_stale: boolean;
}

export function LegacyReadinessGate({
  readiness,
  locale,
  currency,
}: {
  readiness: LegacyFinancialReadiness;
  locale: string;
  currency: string;
}) {
  const isAr = locale === "ar";
  const isReady = readiness.ready_for_production;
  const amount = Number(readiness.open_difference_total).toLocaleString(
    isAr ? "ar-EG" : "en-US",
    { minimumFractionDigits: 2, maximumFractionDigits: 2 },
  );

  return (
    <section
      className={`rounded-2xl border p-5 shadow-sm ${
        isReady
          ? "border-emerald-200 bg-emerald-50/80 dark:border-emerald-900 dark:bg-emerald-950/25"
          : "border-rose-300 bg-rose-50/90 dark:border-rose-900 dark:bg-rose-950/25"
      }`}
    >
      <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
        <div className="flex items-start gap-3">
          {isReady ? (
            <ShieldCheck className="mt-0.5 size-5 shrink-0 text-emerald-700 dark:text-emerald-400" />
          ) : (
            <AlertTriangle className="mt-0.5 size-5 shrink-0 text-rose-700 dark:text-rose-400" />
          )}
          <div>
            <p className="text-xs font-black uppercase tracking-[0.16em] text-slate-500">
              {isAr ? "بوابة الجاهزية للإنتاج" : "Production readiness gate"}
            </p>
            <h2
              className={`mt-1 text-xl font-black ${
                isReady
                  ? "text-emerald-900 dark:text-emerald-200"
                  : "text-rose-900 dark:text-rose-200"
              }`}
            >
              {isReady
                ? isAr
                  ? "READY — جاهز للترقية بعد اعتماد النشر"
                  : "READY — eligible for controlled promotion"
                : isAr
                  ? "HOLD — غير مصرح بالترقية إلى Production"
                  : "HOLD — not cleared for Production"}
            </h2>
            <p className="mt-2 max-w-3xl text-xs font-semibold text-slate-600 dark:text-slate-300">
              {isAr
                ? "هذه البوابة مستقلة عن توازن دفتر الأستاذ. سلامة القيود لا تعني أن الملاحظات المستندية حُسمت. لا يتم تعديل أي قيد أو نقل البيانات للإنتاج حتى استكمال المراجعة المعتمدة."
                : "This gate is independent from ledger balance. A balanced ledger does not mean documentary findings are cleared. No journal correction or Production promotion is authorized until the approved review is complete."}
            </p>
          </div>
        </div>
        <span
          className={`inline-flex w-fit rounded-full border px-3 py-1 text-xs font-black ${
            isReady
              ? "border-emerald-300 bg-white text-emerald-800 dark:bg-emerald-950"
              : "border-rose-300 bg-white text-rose-800 dark:bg-rose-950"
          }`}
        >
          {readiness.readiness_status}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <GateMetric label={isAr ? "ملاحظات مفتوحة" : "Open findings"} value={String(readiness.open_total)} />
        <GateMetric label={isAr ? "عالية" : "High"} value={String(readiness.open_high)} />
        <GateMetric label={isAr ? "متوسطة" : "Medium"} value={String(readiness.open_medium)} />
        <GateMetric label={isAr ? "منخفضة" : "Low"} value={String(readiness.open_low)} />
        <GateMetric
          label={isAr ? "فرق محل المراجعة" : "Difference under review"}
          value={`${amount} ${currency}`}
        />
      </div>

      {readiness.audit_is_stale && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {isAr
            ? "تنبيه: أحدث ملاحظة مالية أُنشئت بعد آخر Audit Gate مسجل؛ يلزم تشغيل بوابة المراجعة من جديد بعد حسم الملاحظات."
            : "Warning: the newest financial finding is newer than the last recorded audit gate; the audit gate must be rerun after the findings are resolved."}
        </p>
      )}
    </section>
  );
}

function GateMetric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/80 bg-white/80 p-3 dark:border-slate-800 dark:bg-slate-900/80">
      <p className="text-[11px] font-semibold text-slate-500">{label}</p>
      <p className="mt-1 font-mono text-sm font-black text-slate-950 dark:text-white">{value}</p>
    </div>
  );
}
