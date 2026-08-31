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

export interface LegacyResolutionSummary {
  documentary: number;
  receivables: number;
  banks: number;
  suppliers: number;
  fixedAssets: number;
}

export function LegacyReadinessGate({
  readiness,
  resolutionSummary,
  locale,
  currency,
}: {
  readiness: LegacyFinancialReadiness;
  resolutionSummary: LegacyResolutionSummary;
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
                ? "هذه البوابة مستقلة عن توازن دفتر الأستاذ، وتشمل الملاحظات المستندية وفجوات البيانات الرئيسية المالية. سلامة القيود لا تعني اكتمال بيانات التشغيل، ولا يتم اختلاق رقم حساب أو تعديل قيد لإجبار النظام على الجاهزية."
                : "This gate is independent from ledger balance and includes both documentary findings and financial master-data gaps. Balanced journals do not imply operational master data is complete, and no account identifier or journal value is fabricated to force readiness."}
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
        <GateMetric label={isAr ? "كل الملاحظات المفتوحة" : "All open findings"} value={String(readiness.open_total)} />
        <GateMetric label={isAr ? "عالية" : "High"} value={String(readiness.open_high)} />
        <GateMetric label={isAr ? "متوسطة" : "Medium"} value={String(readiness.open_medium)} />
        <GateMetric label={isAr ? "منخفضة" : "Low"} value={String(readiness.open_low)} />
        <GateMetric
          label={isAr ? "فرق مستندي محل المراجعة" : "Documentary difference under review"}
          value={`${amount} ${currency}`}
        />
      </div>

      {!isReady && (
        <div className="mt-4 rounded-xl border border-rose-200 bg-white/80 p-4 dark:border-rose-900/60 dark:bg-slate-950/35">
          <p className="text-xs font-black text-rose-900 dark:text-rose-200">
            {isAr ? "ما الذي يمنع الترقية الآن؟" : "What currently blocks promotion?"}
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
            <ResolutionMetric
              label={isAr ? "مراجعات مستندية" : "Documentary reviews"}
              value={resolutionSummary.documentary}
              note={isAr ? "يلزم مستند معتمد قبل أي تصحيح" : "Approved evidence required before correction"}
            />
            <ResolutionMetric
              label={isAr ? "ذمم خارج Property Master" : "Receivables outside property master"}
              value={resolutionSummary.receivables}
              note={isAr ? "قرار نطاق وربط صريح" : "Scope decision and explicit linking"}
            />
            <ResolutionMetric
              label={isAr ? "حسابات بنكية" : "Bank accounts"}
              value={resolutionSummary.banks}
              note={isAr ? "رقم حساب/IBAN موثق فقط" : "Documented account number / IBAN only"}
            />
            <ResolutionMetric
              label={isAr ? "جهات دائنة / AP" : "Payable counterparties / AP"}
              value={resolutionSummary.suppliers}
              note={isAr ? "تأكيد المورد أو GL-only" : "Confirm supplier or GL-only status"}
            />
            <ResolutionMetric
              label={isAr ? "سجل الأصول" : "Fixed-asset register"}
              value={resolutionSummary.fixedAssets}
              note={isAr ? "سجل معتمد، لا تفكيك من GL" : "Approved register; no GL reconstruction"}
            />
          </div>
        </div>
      )}

      {readiness.audit_is_stale && (
        <p className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-200">
          {isAr
            ? "تنبيه: أحدث ملاحظة مالية أو فجوة Master Data أُنشئت بعد آخر Audit Gate مسجل؛ يلزم تشغيل بوابة المراجعة من جديد بعد حسم جميع الملاحظات."
            : "Warning: the newest financial or master-data finding is newer than the last recorded audit gate; the audit gate must be rerun after all findings are resolved."}
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

function ResolutionMetric({
  label,
  value,
  note,
}: {
  label: string;
  value: number;
  note: string;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-3 dark:border-slate-800 dark:bg-slate-900/70">
      <div className="flex items-start justify-between gap-2">
        <p className="text-[11px] font-black text-slate-700 dark:text-slate-200">{label}</p>
        <span className="rounded-full bg-slate-950 px-2 py-0.5 font-mono text-[10px] font-black text-white dark:bg-white dark:text-slate-950">
          {value}
        </span>
      </div>
      <p className="mt-2 text-[10px] font-semibold leading-4 text-slate-500">{note}</p>
    </div>
  );
}
