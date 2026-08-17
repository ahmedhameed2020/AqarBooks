import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";

export function KpiCard({
  label,
  value,
  hint,
  icon,
  tone,
  change,
  changeLabel,
}: {
  label: string;
  value: React.ReactNode;
  hint?: string;
  icon: React.ReactNode;
  tone?: "positive" | "negative" | "warning" | "info";
  change?: number;
  changeLabel?: string;
}) {
  const valueClass =
    tone === "positive"
      ? "text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
        ? "text-rose-600 dark:text-rose-400"
        : tone === "warning"
          ? "text-amber-600 dark:text-amber-400"
          : tone === "info"
            ? "text-blue-600 dark:text-blue-400"
            : "text-slate-900 dark:text-white";

  const iconBg =
    tone === "positive"
      ? "bg-gradient-to-tr from-emerald-600 to-teal-500 text-white shadow-md shadow-emerald-600/20"
      : tone === "negative"
        ? "bg-gradient-to-tr from-rose-600 to-red-500 text-white shadow-md shadow-rose-600/20"
        : tone === "warning"
          ? "bg-gradient-to-tr from-amber-600 to-orange-500 text-white shadow-md shadow-amber-600/20"
          : "bg-gradient-to-tr from-purple-600 to-indigo-600 text-white shadow-md shadow-purple-600/20";

  const topGlow =
    tone === "positive"
      ? "from-emerald-500 via-emerald-400 to-teal-500"
      : tone === "negative"
        ? "from-rose-500 via-red-400 to-rose-600"
        : tone === "warning"
          ? "from-amber-500 via-orange-400 to-amber-600"
          : "from-purple-600 via-indigo-500 to-blue-500";

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-slate-200/90 bg-white p-5 shadow-xs transition-all duration-300 hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md dark:border-slate-800 dark:bg-slate-900">
      <div className={cn("absolute inset-x-0 top-0 h-1.5 bg-gradient-to-r opacity-90 transition-opacity group-hover:opacity-100", topGlow)} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400">{label}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className={cn("truncate text-2xl font-black tabular-nums tracking-tight font-mono", valueClass)}>
              {value}
            </p>
          </div>
          {(hint || changeLabel || change !== undefined) && (
            <div className="mt-2.5 flex flex-wrap items-center gap-1.5 text-xs font-semibold">
              {change !== undefined && (
                <span
                  className={cn(
                    "inline-flex items-center gap-1 rounded-md px-2 py-0.5 font-bold",
                    change > 0
                      ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/60 dark:text-emerald-300"
                      : change < 0
                        ? "bg-rose-50 text-rose-700 dark:bg-rose-950/60 dark:text-rose-300"
                        : "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300"
                  )}
                >
                  {change > 0 ? (
                    <TrendingUp className="size-3.5" />
                  ) : change < 0 ? (
                    <TrendingDown className="size-3.5" />
                  ) : (
                    <Minus className="size-3.5" />
                  )}
                  {Math.abs(change)}%
                </span>
              )}
              {changeLabel && <span className="text-slate-600 dark:text-slate-400 font-medium">{changeLabel}</span>}
              {hint && !changeLabel && <span className="text-slate-500 dark:text-slate-400 font-normal">{hint}</span>}
            </div>
          )}
        </div>
        <span className={cn("flex size-11 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105", iconBg)}>
          {icon}
        </span>
      </div>
    </div>
  );
}

export function MiniStat({
  label,
  value,
  tone,
}: {
  label: string;
  value: React.ReactNode;
  tone?: "positive" | "negative" | "warning";
}) {
  const toneClass =
    tone === "positive"
      ? "text-emerald-700 dark:text-emerald-400"
      : tone === "negative"
        ? "text-rose-700 dark:text-rose-400"
        : tone === "warning"
          ? "text-amber-700 dark:text-amber-400"
          : "text-slate-900 dark:text-white";

  return (
    <div className="rounded-xl border border-slate-200/90 bg-white p-3.5 shadow-2xs transition-all hover:border-slate-300 dark:border-slate-800 dark:bg-slate-900">
      <p className="text-[11px] font-bold text-slate-500 dark:text-slate-400 truncate">{label}</p>
      <p className={cn("mt-1 text-base font-black tabular-nums font-mono", toneClass)}>
        {value}
      </p>
    </div>
  );
}
