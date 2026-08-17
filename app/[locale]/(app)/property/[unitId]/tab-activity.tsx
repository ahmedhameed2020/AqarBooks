import { Receipt, CreditCard, UserPlus, UserMinus, Building2 } from "lucide-react";
import { Money } from "@/components/money";
import type { ActivityEvent, ActivityKind } from "@/lib/property/unit-activity";

const ICON: Record<ActivityKind, React.ReactNode> = {
  due_issued: <Receipt className="size-3.5" />,
  payment_received: <CreditCard className="size-3.5" />,
  ownership_start: <UserPlus className="size-3.5" />,
  ownership_end: <UserMinus className="size-3.5" />,
  unit_created: <Building2 className="size-3.5" />,
};
const TONE: Record<ActivityKind, string> = {
  due_issued: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
  payment_received: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  ownership_start: "bg-blue-500/10 text-blue-600 dark:text-blue-400",
  ownership_end: "bg-muted text-muted-foreground",
  unit_created: "bg-primary/10 text-primary",
};

export function ActivityTimeline({
  events,
  locale,
  currency,
  compact = false,
}: {
  events: ActivityEvent[];
  locale: string;
  currency: string;
  compact?: boolean;
}) {
  const isAr = locale === "ar";
  const shown = compact ? events.slice(0, 3) : events;
  if (shown.length === 0) {
    return <p className="text-xs text-muted-foreground">{isAr ? "لا يوجد نشاط بعد" : "No activity yet"}</p>;
  }
  return (
    <ol className="space-y-3">
      {shown.map((e, i) => (
        <li key={i} className="flex items-start gap-3">
          <span className={`mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-lg ${TONE[e.kind]}`}>
            {ICON[e.kind]}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-medium">{e.label}</p>
            <p className="text-[11px] text-muted-foreground">{e.date}</p>
          </div>
          {e.amount != null && (
            <span className="shrink-0 text-sm font-semibold tabular-nums">
              <Money amount={e.amount} currency={currency} locale={locale} />
            </span>
          )}
        </li>
      ))}
    </ol>
  );
}

export function TabActivity({
  events,
  locale,
  currency,
}: {
  events: ActivityEvent[];
  locale: string;
  currency: string;
}) {
  const isAr = locale === "ar";
  return (
    <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xs">
      <h2 className="mb-4 text-sm font-semibold">{isAr ? "سجل نشاط الوحدة" : "Unit activity history"}</h2>
      <ActivityTimeline events={events} locale={locale} currency={currency} />
    </section>
  );
}
