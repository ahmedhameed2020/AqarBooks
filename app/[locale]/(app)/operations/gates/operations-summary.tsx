import { Activity, Clock3, ScanLine, ShieldAlert } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import type { GateOperationsSummary } from "@/lib/gates/operations-summary";

type Tone = "success" | "warning" | "destructive" | "outline";

function ageLabel(minutes: number | null, isAr: boolean) {
  if (minutes === null) return isAr ? "لا توجد عناصر معلقة" : "No pending items";
  if (minutes < 60) return isAr ? `الأقدم منذ ${minutes} د` : `Oldest ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return isAr ? `الأقدم منذ ${hours} س` : `Oldest ${hours}h ago`;
  const days = Math.floor(hours / 24);
  return isAr ? `الأقدم منذ ${days} ي` : `Oldest ${days}d ago`;
}

function statusLabel(ok: boolean, isAr: boolean) {
  return ok ? (isAr ? "سليم" : "Healthy") : (isAr ? "يتطلب انتباهاً" : "Needs attention");
}

function MetricCard({
  title,
  value,
  detail,
  status,
  tone,
  icon,
}: {
  title: string;
  value: string;
  detail: string;
  status: string;
  tone: Tone;
  icon: React.ReactNode;
}) {
  return (
    <article className="rounded-2xl border border-border/70 bg-card p-4">
      <div className="flex items-start justify-between gap-3">
        <div className="rounded-xl bg-slate-100 p-2 text-slate-600 dark:bg-slate-900 dark:text-slate-300">{icon}</div>
        <Badge variant={tone}>{status}</Badge>
      </div>
      <p className="mt-4 text-xs font-bold text-slate-500">{title}</p>
      <p className="mt-1 text-2xl font-black tabular-nums text-slate-950 dark:text-white">{value}</p>
      <p className="mt-1 text-[11px] font-medium text-slate-500">{detail}</p>
    </article>
  );
}

export function GateOperationsSummaryPanel({
  summary,
  locale,
}: {
  summary: GateOperationsSummary | null;
  locale: "ar" | "en";
}) {
  const isAr = locale === "ar";

  if (!summary) {
    return (
      <section aria-labelledby="gate-readiness-title" className="rounded-2xl border border-amber-200 bg-amber-50 p-4 dark:border-amber-900 dark:bg-amber-950/30">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h1 id="gate-readiness-title" className="text-lg font-black text-slate-950 dark:text-white">
              {isAr ? "جاهزية عمليات البوابات" : "Gate operations readiness"}
            </h1>
            <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">
              {isAr ? "تعذر تحميل الملخص التشغيلي الآمن. حاول مرة أخرى قبل بدء الوردية." : "The safe operational summary could not be loaded. Retry before starting the shift."}
            </p>
          </div>
          <Badge variant="warning">{isAr ? "غير متاح" : "Unavailable"}</Badge>
        </div>
      </section>
    );
  }

  const number = new Intl.NumberFormat(isAr ? "ar-QA" : "en-QA");
  const deviceActivityCurrent = summary.devicesStale === 0;
  const devicesRecentlyActive = Math.max(0, summary.activeDevices - summary.devicesStale);
  const longStaysHealthy = summary.longStays === 0;
  const exceptionsHealthy = summary.unresolvedExceptions === 0;
  const hardwareHealthy = summary.hardwareBacklog === 0 && summary.deadHardwareCommands === 0;
  const hardwareTone: Tone = summary.deadHardwareCommands > 0 ? "destructive" : hardwareHealthy ? "success" : "warning";

  return (
    <section aria-labelledby="gate-readiness-title" className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 id="gate-readiness-title" className="text-2xl font-black tracking-tight text-slate-950 dark:text-white">
            {isAr ? "جاهزية عمليات البوابات" : "Gate operations readiness"}
          </h1>
          <p className="text-xs font-medium text-slate-500">
            {isAr ? "مؤشرات مجمعة فقط؛ لا تعرض بيانات الزوار أو بيانات اعتماد الأجهزة." : "Aggregate signals only; no visitor identity or device credentials are exposed."}
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <Badge variant={summary.connectivityIncidents24h === 0 ? "success" : "warning"}>
            {isAr ? "انقطاعات ٢٤س" : "Connectivity 24h"}: {number.format(summary.connectivityIncidents24h)}
          </Badge>
          <Badge variant="outline">
            {isAr ? "الزوار بالداخل" : "Visitors inside"}: {number.format(summary.visitorsInside)}
          </Badge>
        </div>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <MetricCard
          title={isAr ? "حداثة نشاط الأجهزة الموثق" : "Authenticated device activity"}
          value={`${number.format(devicesRecentlyActive)}/${number.format(summary.activeDevices)}`}
          detail={isAr
            ? `${number.format(summary.devicesStale)} بلا نشاط موثق خلال ٥ دقائق؛ لا يثبت انقطاع الاتصال`
            : `${number.format(summary.devicesStale)} without authenticated activity in 5m; not a connectivity check`}
          status={deviceActivityCurrent ? (isAr ? "نشاط حديث" : "Activity recent") : (isAr ? "تحقق من النشاط" : "Investigate activity")}
          tone={deviceActivityCurrent ? "success" : "warning"}
          icon={<ScanLine className="size-4" />}
        />
        <MetricCard
          title={isAr ? "الإقامات الطويلة" : "Long stays"}
          value={number.format(summary.longStays)}
          detail={isAr ? `الحد المخصص: ${summary.longStayHours} ساعة` : `Configured threshold: ${summary.longStayHours}h`}
          status={statusLabel(longStaysHealthy, isAr)}
          tone={longStaysHealthy ? "success" : "warning"}
          icon={<Clock3 className="size-4" />}
        />
        <MetricCard
          title={isAr ? "الاستثناءات غير المحسومة" : "Unresolved exceptions"}
          value={number.format(summary.unresolvedExceptions)}
          detail={ageLabel(summary.oldestUnresolvedExceptionAgeMinutes, isAr)}
          status={statusLabel(exceptionsHealthy, isAr)}
          tone={exceptionsHealthy ? "success" : "warning"}
          icon={<ShieldAlert className="size-4" />}
        />
        <MetricCard
          title={isAr ? "تراكم أوامر الأجهزة" : "Hardware backlog"}
          value={number.format(summary.hardwareBacklog)}
          detail={isAr
            ? `${ageLabel(summary.oldestHardwareBacklogAgeMinutes, true)} · ${number.format(summary.deadHardwareCommands)} أوامر ميتة`
            : `${ageLabel(summary.oldestHardwareBacklogAgeMinutes, false)} · ${number.format(summary.deadHardwareCommands)} dead`}
          status={summary.deadHardwareCommands > 0 ? (isAr ? "أوامر ميتة" : "Dead commands") : statusLabel(hardwareHealthy, isAr)}
          tone={hardwareTone}
          icon={<Activity className="size-4" />}
        />
      </div>
    </section>
  );
}
