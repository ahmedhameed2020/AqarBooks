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
            : "text-foreground";

  const iconBg =
    tone === "positive"
      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
      : tone === "negative"
        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
        : tone === "warning"
          ? "bg-amber-500/10 text-amber-600 dark:text-amber-400"
          : "bg-primary/10 text-primary";

  const topGlow =
    tone === "positive"
      ? "from-emerald-500/80 via-emerald-500/30 to-transparent"
      : tone === "negative"
        ? "from-rose-500/80 via-rose-500/30 to-transparent"
        : tone === "warning"
          ? "from-amber-500/80 via-amber-500/30 to-transparent"
          : "from-primary/80 via-primary/30 to-transparent";

  return (
    <div className="group relative overflow-hidden rounded-2xl border border-border/60 bg-card p-5 shadow-xs transition-all duration-300 hover:-translate-y-0.5 hover:border-border hover:shadow-md">
      <div className={cn("absolute inset-x-0 top-0 h-1 bg-gradient-to-r opacity-80 transition-opacity group-hover:opacity-100", topGlow)} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium text-muted-foreground">{label}</p>
          <div className="mt-2 flex items-baseline gap-2">
            <p className={cn("truncate text-2xl font-bold tabular-nums tracking-tight", valueClass)}>
              {value}
            </p>
          </div>
          {(hint || changeLabel || change !== undefined) && (
            <div className="mt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
              {change !== undefined && (
                <span
                  className={cn(
                    "inline-flex items-center gap-0.5 rounded-md px-1.5 py-0.5 font-semibold",
                    change > 0
                      ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                      : change < 0
                        ? "bg-rose-500/10 text-rose-600 dark:text-rose-400"
                        : "bg-muted text-muted-foreground"
                  )}
                >
                  {change > 0 ? (
                    <TrendingUp className="size-3" />
                  ) : change < 0 ? (
                    <TrendingDown className="size-3" />
                  ) : (
                    <Minus className="size-3" />
                  )}
                  {Math.abs(change)}%
                </span>
              )}
              {changeLabel && <span className="text-muted-foreground/90">{changeLabel}</span>}
              {hint && !changeLabel && <span className="text-muted-foreground/80">{hint}</span>}
            </div>
          )}
        </div>
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-xl transition-transform group-hover:scale-105", iconBg)}>
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
  icon,
}: {
  label: string;
  value: string;
  tone?: "warning" | "negative" | "positive";
  icon?: React.ReactNode;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border border-border/50 bg-card/80 px-4 py-3 shadow-2xs backdrop-blur-xs transition-all hover:bg-card">
      <div className="flex items-center gap-2 min-w-0">
        {icon && <span className="text-muted-foreground">{icon}</span>}
        <span className="truncate text-xs font-medium text-muted-foreground">{label}</span>
      </div>
      <span
        className={cn(
          "ms-2 text-sm font-bold tabular-nums",
          tone === "warning" && "text-amber-600 dark:text-amber-400",
          tone === "negative" && "text-rose-600 dark:text-rose-400",
          tone === "positive" && "text-emerald-600 dark:text-emerald-400",
        )}
      >
        {value}
      </span>
    </div>
  );
}
