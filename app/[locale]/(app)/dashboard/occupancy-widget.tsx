import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { Building2, Users, ArrowUpRight, CheckCircle2, AlertCircle } from "lucide-react";

interface OccupancyWidgetProps {
  /** active (not archived) units of the organization */
  unitsCount: number;
  /** of those, units that currently have an owner (units_with_financials.occupancy_status = OCCUPIED) */
  ownedCount: number;
  membersCount: number;
  locale: Locale;
}

/**
 * Units and members, from real counts only.
 *
 * The widget used to split the unit count 82% / 10% / 8% into "occupied / vacant / maintenance". Those
 * percentages were constants, not data. What the system actually knows is whether a unit has a current
 * owner, so that is what is shown, labelled as such. Physical occupancy and maintenance status per unit are
 * not tracked here, and the widget says so instead of estimating them.
 */
export function OccupancyWidget({ unitsCount, ownedCount, membersCount, locale }: OccupancyWidgetProps) {
  const isAr = locale === "ar";
  const unowned = Math.max(0, unitsCount - ownedCount);
  const pct = (n: number) => (unitsCount > 0 ? Math.round((n / unitsCount) * 100) : 0);

  return (
    <div data-testid="units-widget" className="rounded-2xl border border-border/60 bg-card p-5 shadow-xs transition-shadow hover:shadow-sm">
      <div className="flex items-center justify-between border-b border-border/50 pb-3.5">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Building2 className="size-4.5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">{isAr ? "الوحدات والأعضاء" : "Units & Members"}</h3>
            <p className="text-[11px] text-muted-foreground">{isAr ? "أعداد فعلية من السجلات" : "Actual counts from the records"}</p>
          </div>
        </div>
        <Link href="/property" locale={locale} className="flex items-center gap-1 text-xs font-medium text-primary hover:underline">
          {isAr ? "إدارة الوحدات" : "Manage Units"}
          <ArrowUpRight className="size-3 rtl:-scale-x-100" />
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-3">
        <div className="rounded-xl border border-border/40 bg-muted/30 p-3" data-testid="units-total">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{isAr ? "إجمالي الوحدات الفعالة" : "Active units"}</span>
            <Building2 className="size-3.5 text-primary" />
          </div>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{unitsCount}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{isAr ? "غير المؤرشفة" : "not archived"}</p>
        </div>
        <div className="rounded-xl border border-border/40 bg-muted/30 p-3" data-testid="units-owned">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{isAr ? "لها مالك حالي" : "With a current owner"}</span>
            <CheckCircle2 className="size-3.5 text-emerald-500" />
          </div>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{ownedCount}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{pct(ownedCount)}% {isAr ? "من الإجمالي" : "of total"}</p>
        </div>
        <div className="rounded-xl border border-border/40 bg-muted/30 p-3" data-testid="units-unowned">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{isAr ? "بلا مالك" : "Without an owner"}</span>
            <AlertCircle className="size-3.5 text-amber-500" />
          </div>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{unowned}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{pct(unowned)}% {isAr ? "من الإجمالي" : "of total"}</p>
        </div>
      </div>

      <p className="mt-3 text-[11px] text-muted-foreground" data-testid="units-occupancy-note">
        {isAr
          ? "الإشغال الفعلي وحالة الصيانة لكل وحدة غير متوفرين في هذه النسخة؛ الأرقام أعلاه تعكس الملكية فقط."
          : "Physical occupancy and per-unit maintenance status are not available in this version; the figures above reflect ownership only."}
      </p>

      <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Users className="size-3.5 text-primary" />
          <span>{isAr ? "إجمالي الأعضاء" : "Registered members"}:</span>
          <strong className="tabular-nums text-foreground" data-testid="members-total">{membersCount}</strong>
        </div>
        <Link href="/members" locale={locale} className="text-[11px] font-medium text-primary hover:underline">
          {isAr ? "دليل الأعضاء" : "Members Directory"} →
        </Link>
      </div>
    </div>
  );
}
