import { Wallet, User, ArrowUpRight, CheckCircle2, AlertTriangle } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Money } from "@/components/money";
import { cn } from "@/lib/utils";
import type { UnitRow } from "../units-table";
import { unitTypeLabel } from "@/lib/units/unit-type-labels";
import type { ActivityEvent } from "@/lib/property/unit-activity";
import { ActivityTimeline } from "./tab-activity";

export function TabOverview({
  unit,
  locale,
  currency,
  owner,
  registeredDate,
  recentActivity,
}: {
  unit: UnitRow;
  locale: string;
  currency: string;
  owner: { id: string; name: string; phone: string | null; share: number } | null;
  registeredDate: string | null;
  recentActivity: ActivityEvent[];
}) {
  const isAr = locale === "ar";
  const settled = unit.balance <= 0;
  const facts: [string, string][] = [
    [isAr ? "النوع" : "Type", unitTypeLabel(unit, isAr)],
    [isAr ? "الدور" : "Floor", unit.floor_number != null ? String(unit.floor_number) : "—"],
    [isAr ? "المساحة" : "Area", unit.area != null ? `${unit.area} ${isAr ? "م²" : "m²"}` : "—"],
    [isAr ? "المبنى" : "Building", (isAr ? unit.building_name_ar : unit.building_name_en) ?? "—"],
    [isAr ? "المنطقة" : "Zone", (isAr ? unit.zone_name_ar : unit.zone_name_en) ?? "—"],
    [isAr ? "تاريخ التسجيل" : "Registered", registeredDate ?? "—"],
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      <section
        className={cn(
          "relative overflow-hidden rounded-2xl border p-5 shadow-xs",
          settled ? "border-emerald-500/25 bg-emerald-500/[0.04]" : "border-rose-500/25 bg-rose-500/[0.04]",
        )}
      >
        <div className="flex items-center gap-2">
          <span
            className={cn(
              "flex size-8 shrink-0 items-center justify-center rounded-xl",
              settled ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400" : "bg-rose-500/15 text-rose-600 dark:text-rose-400",
            )}
          >
            <Wallet className="size-4" />
          </span>
          <h2 className="text-sm font-semibold">{isAr ? "الصحة المالية" : "Financial health"}</h2>
        </div>
        <p className="mt-4 text-3xl font-bold tabular-nums">
          <Money amount={unit.balance} currency={currency} locale={locale} tone={unit.balance > 0 ? "negative" : "positive"} />
        </p>
        <p
          className={cn(
            "mt-2 flex items-center gap-1.5 text-xs font-medium",
            settled ? "text-emerald-700 dark:text-emerald-400" : "text-rose-700 dark:text-rose-400",
          )}
        >
          {settled ? <CheckCircle2 className="size-3.5" /> : <AlertTriangle className="size-3.5" />}
          {settled ? (isAr ? "رصيد منضبط" : "Fully settled") : (isAr ? "رصيد متأخرات قائم" : "Outstanding arrears")}
        </p>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xs">
        <h2 className="text-sm font-semibold">{isAr ? "المالك الحالي" : "Current owner"}</h2>
        {owner ? (
          <Link
            href={`/members/${owner.id}`}
            locale={locale}
            className="mt-3 flex items-center justify-between rounded-xl border border-border/50 p-3 text-sm transition-colors hover:bg-muted/40"
          >
            <span className="flex items-center gap-2 font-semibold">
              <User className="size-4 text-muted-foreground" />
              {owner.name}
              <span className="text-xs font-normal text-muted-foreground">· {owner.share}%</span>
            </span>
            <ArrowUpRight className="size-4 text-primary rtl:-scale-x-100" />
          </Link>
        ) : (
          <p className="mt-3 rounded-xl border border-dashed border-border/60 p-3 text-center text-xs text-muted-foreground">
            {isAr ? "لا يوجد مالك مسجّل" : "No owner on record"}
          </p>
        )}
      </section>

      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xs lg:col-span-1">
        <h2 className="mb-3 text-sm font-semibold">{isAr ? "بيانات الوحدة" : "Unit facts"}</h2>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-sm">
          {facts.map(([k, v]) => (
            <div key={k}>
              <dt className="text-xs text-muted-foreground">{k}</dt>
              <dd className="font-medium">{v}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xs lg:col-span-1">
        <h2 className="mb-3 text-sm font-semibold">{isAr ? "آخر النشاط" : "Recent activity"}</h2>
        <ActivityTimeline events={recentActivity} locale={locale} currency={currency} compact />
      </section>
    </div>
  );
}
