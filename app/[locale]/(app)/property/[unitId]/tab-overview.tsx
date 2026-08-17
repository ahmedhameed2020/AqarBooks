import { Wallet, User, ArrowUpRight } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { Money } from "@/components/money";
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
      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xs">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Wallet className="size-4 text-primary" />
          {isAr ? "الصحة المالية" : "Financial health"}
        </h2>
        <p className="mt-3 text-3xl font-bold">
          <Money amount={unit.balance} currency={currency} locale={locale} tone={unit.balance > 0 ? "negative" : "positive"} />
        </p>
        <p className="mt-1 text-xs text-muted-foreground">
          {unit.balance > 0 ? (isAr ? "رصيد متأخرات قائم" : "Outstanding arrears") : (isAr ? "رصيد منضبط" : "Fully settled")}
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
