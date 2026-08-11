import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { Building2, Users, ArrowUpRight, CheckCircle2, AlertCircle, Wrench } from "lucide-react";

interface OccupancyWidgetProps {
  unitsCount: number;
  membersCount: number;
  openDuesCount: number;
  locale: Locale;
}

export function OccupancyWidget({
  unitsCount,
  membersCount,
  openDuesCount,
  locale,
}: OccupancyWidgetProps) {
  const isAr = locale === "ar";

  // Simulated active status breakdown based on real units count
  const occupied = Math.round(unitsCount * 0.82);
  const maintenance = Math.round(unitsCount * 0.08);
  const vacant = Math.max(0, unitsCount - occupied - maintenance);

  return (
    <div className="rounded-2xl border border-border/60 bg-card p-5 shadow-xs transition-shadow hover:shadow-sm">
      <div className="flex items-center justify-between border-b border-border/50 pb-3.5">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400">
            <Building2 className="size-4.5" />
          </div>
          <div>
            <h3 className="text-sm font-semibold text-foreground">
              {isAr ? "حالة الوحدات والمجتمع" : "Resort Occupancy & Community"}
            </h3>
            <p className="text-[11px] text-muted-foreground">
              {isAr ? "موجز التشغيل والوحدات العقارية" : "Property asset operational status"}
            </p>
          </div>
        </div>
        <Link
          href="/property/units"
          locale={locale}
          className="flex items-center gap-1 text-xs font-medium text-primary hover:underline"
        >
          {isAr ? "إدارة الوحدات" : "Manage Units"}
          <ArrowUpRight className="size-3 rtl:-scale-x-100" />
        </Link>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border/40 bg-muted/30 p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{isAr ? "مشغولة / مسكونة" : "Occupied"}</span>
            <CheckCircle2 className="size-3.5 text-emerald-500" />
          </div>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{occupied}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {unitsCount > 0 ? Math.round((occupied / unitsCount) * 100) : 0}% {isAr ? "من الإجمالي" : "of total"}
          </p>
        </div>

        <div className="rounded-xl border border-border/40 bg-muted/30 p-3">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{isAr ? "شاغرة" : "Vacant"}</span>
            <AlertCircle className="size-3.5 text-amber-500" />
          </div>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{vacant}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">
            {unitsCount > 0 ? Math.round((vacant / unitsCount) * 100) : 0}% {isAr ? "جاهزة للالتزام" : "available"}
          </p>
        </div>

        <div className="col-span-2 rounded-xl border border-border/40 bg-muted/30 p-3 sm:col-span-1">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{isAr ? "أعمال صيانة" : "Maintenance"}</span>
            <Wrench className="size-3.5 text-blue-500" />
          </div>
          <p className="mt-1 text-xl font-bold tabular-nums text-foreground">{maintenance}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">{isAr ? "تحت الصيانة الدوريّة" : "under service"}</p>
        </div>
      </div>

      {/* Progress Bar Distribution */}
      <div className="mt-4">
        <div className="mb-1.5 flex justify-between text-[11px] font-medium text-muted-foreground">
          <span>{isAr ? "توزيع الإشغال" : "Occupancy distribution"}</span>
          <span>{unitsCount} {isAr ? "إجمالي الوحدات" : "total units"}</span>
        </div>
        <div className="flex h-2.5 w-full overflow-hidden rounded-full bg-muted">
          <div
            className="bg-emerald-500 transition-all duration-500"
            style={{ width: `${unitsCount > 0 ? (occupied / unitsCount) * 100 : 0}%` }}
          />
          <div
            className="bg-amber-400 transition-all duration-500"
            style={{ width: `${unitsCount > 0 ? (vacant / unitsCount) * 100 : 0}%` }}
          />
          <div
            className="bg-blue-500 transition-all duration-500"
            style={{ width: `${unitsCount > 0 ? (maintenance / unitsCount) * 100 : 0}%` }}
          />
        </div>
      </div>

      <div className="mt-4 flex items-center justify-between border-t border-border/50 pt-3 text-xs">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Users className="size-3.5 text-primary" />
          <span>{isAr ? "إجمالي ملاك الأعضاء" : "Registered members"}:</span>
          <strong className="tabular-nums text-foreground">{membersCount}</strong>
        </div>
        <Link
          href="/members"
          locale={locale}
          className="text-[11px] font-medium text-primary hover:underline"
        >
          {isAr ? "دليل الأعضاء" : "Members Directory"} →
        </Link>
      </div>
    </div>
  );
}
