import {
  Wallet,
  User,
  ArrowUpRight,
  CheckCircle2,
  AlertTriangle,
  Building,
  Phone,
  MessageCircle,
  ExternalLink,
  Layers,
  Calendar,
  Maximize2,
} from "lucide-react";
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

  const whatsappNumber = owner?.phone ? owner.phone.replace(/\D/g, "") : null;
  const whatsappUrl = whatsappNumber ? `https://wa.me/${whatsappNumber}` : null;

  const facts: { label: string; value: string; icon: React.ReactNode }[] = [
    {
      label: isAr ? "نوع الوحدة" : "Unit Type",
      value: unitTypeLabel(unit, isAr),
      icon: <Building className="size-3.5 text-indigo-500" />,
    },
    {
      label: isAr ? "الدور / الطابق" : "Floor",
      value: unit.floor_number != null ? (isAr ? `الدور ${unit.floor_number}` : `Floor ${unit.floor_number}`) : "—",
      icon: <Layers className="size-3.5 text-purple-500" />,
    },
    {
      label: isAr ? "المساحة الإجمالية" : "Total Area",
      value: unit.area != null ? `${unit.area} ${isAr ? "م²" : "m²"}` : "—",
      icon: <Maximize2 className="size-3.5 text-blue-500" />,
    },
    {
      label: isAr ? "المبنى / العقار" : "Building",
      value: (isAr ? unit.building_name_ar : unit.building_name_en) ?? (isAr ? "الكيان الرئيسي" : "Main Property"),
      icon: <Building className="size-3.5 text-emerald-500" />,
    },
    {
      label: isAr ? "المنطقة / القطاع" : "Zone",
      value: (isAr ? unit.zone_name_ar : unit.zone_name_en) ?? "—",
      icon: <Layers className="size-3.5 text-amber-500" />,
    },
    {
      label: isAr ? "تاريخ التسجيل" : "Registration Date",
      value: registeredDate ?? "—",
      icon: <Calendar className="size-3.5 text-rose-500" />,
    },
  ];

  return (
    <div className="grid gap-6 lg:grid-cols-2">
      {/* Financial Health Balance Card */}
      <section
        className={cn(
          "relative overflow-hidden rounded-3xl border p-6 shadow-xs flex flex-col justify-between space-y-4",
          settled
            ? "border-emerald-500/30 bg-gradient-to-br from-emerald-500/[0.06] via-card to-card"
            : "border-rose-500/30 bg-gradient-to-br from-rose-500/[0.06] via-card to-card"
        )}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <span
              className={cn(
                "flex size-10 shrink-0 items-center justify-center rounded-2xl shadow-xs",
                settled
                  ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400 ring-4 ring-emerald-500/10"
                  : "bg-rose-500/15 text-rose-600 dark:text-rose-400 ring-4 ring-rose-500/10"
              )}
            >
              <Wallet className="size-5" />
            </span>
            <div>
              <h2 className="text-sm font-bold text-slate-900 dark:text-white">
                {isAr ? "الموقف المالي للذمة" : "Financial Health & Balance"}
              </h2>
              <p className="text-xs text-slate-500">
                {settled
                  ? isAr
                    ? "الحساب مسوى ولا توجد متأخرات"
                    : "No outstanding balances"
                  : isAr
                  ? "توجد مستحقات متأخرة واجبة السداد"
                  : "Outstanding arrears requiring settlement"}
              </p>
            </div>
          </div>
        </div>

        <div>
          <p className="text-3xl sm:text-4xl font-black tabular-nums tracking-tight">
            <Money
              amount={unit.balance}
              currency={currency}
              locale={locale}
              tone={unit.balance > 0 ? "negative" : "positive"}
            />
          </p>
        </div>

        <div
          className={cn(
            "flex items-center gap-2 text-xs font-bold pt-3 border-t border-border/50",
            settled ? "text-emerald-600 dark:text-emerald-400" : "text-rose-600 dark:text-rose-400"
          )}
        >
          {settled ? <CheckCircle2 className="size-4" /> : <AlertTriangle className="size-4" />}
          <span>
            {settled
              ? isAr
                ? "رصيد منضبط ومسدد بالكامل"
                : "Fully settled balance"
              : isAr
              ? "رصيد متأخرات قائم ومستحق للتحصيل"
              : "Outstanding arrears due for collection"}
          </span>
        </div>
      </section>

      {/* Current Owner Card */}
      <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-xs flex flex-col justify-between space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <User className="size-4 text-indigo-500" />
            <span>{isAr ? "المالك الأساسي المسجل" : "Primary Registered Owner"}</span>
          </h2>
          {owner && (
            <span className="text-xs font-black text-indigo-600 dark:text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded-full border border-indigo-500/20">
              {owner.share}% {isAr ? "حصة الملكية" : "Share"}
            </span>
          )}
        </div>

        {owner ? (
          <div className="space-y-4">
            <Link
              href={`/members/${owner.id}`}
              locale={locale}
              className="flex items-center justify-between p-4 rounded-2xl border border-border/70 bg-slate-50/60 dark:bg-slate-900/60 transition-all hover:border-indigo-500/50 hover:bg-slate-100/60 dark:hover:bg-slate-800/60 group"
            >
              <div className="flex items-center gap-3">
                <div className="size-11 rounded-2xl bg-gradient-to-tr from-indigo-600 to-purple-600 text-white flex items-center justify-center font-black text-base shadow-sm">
                  {owner.name.trim().slice(0, 1)}
                </div>
                <div>
                  <p className="font-bold text-base text-slate-900 dark:text-white group-hover:text-indigo-600 transition-colors">
                    {owner.name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {isAr ? "انقر لاستعراض الملف المالي الكامل" : "Click to view full dossier"}
                  </p>
                </div>
              </div>
              <div className="size-8 rounded-xl bg-slate-200/60 dark:bg-slate-800 flex items-center justify-center text-slate-600 dark:text-slate-300 group-hover:bg-indigo-600 group-hover:text-white transition-colors">
                <ExternalLink className="size-4" />
              </div>
            </Link>

            {/* Quick Owner Actions */}
            <div className="flex flex-wrap items-center gap-2 pt-1">
              {owner.phone && (
                <a
                  href={`tel:${owner.phone}`}
                  dir="ltr"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 text-xs font-bold hover:bg-slate-200 transition-colors"
                >
                  <Phone className="size-3 text-indigo-500" />
                  <span>{owner.phone}</span>
                </a>
              )}
              {whatsappUrl && (
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 text-xs font-bold hover:bg-emerald-500/20 transition-colors"
                >
                  <MessageCircle className="size-3.5 fill-emerald-500 text-emerald-500" />
                  <span>WhatsApp</span>
                </a>
              )}
            </div>
          </div>
        ) : (
          <div className="rounded-2xl border border-dashed border-border/70 p-6 text-center text-xs text-slate-400 space-y-1 bg-slate-50/40 dark:bg-slate-900/40">
            <User className="size-6 mx-auto opacity-30" />
            <p className="font-semibold">{isAr ? "لا يوجد مالك مسجل للوحدة" : "No owner on record"}</p>
          </div>
        )}
      </section>

      {/* Unit Facts */}
      <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-xs lg:col-span-1 space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
          {isAr ? "بيانات ومواصفات الوحدة" : "Unit Specifications"}
        </h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {facts.map((f, i) => (
            <div
              key={i}
              className="p-3.5 rounded-2xl border border-border/60 bg-slate-50/50 dark:bg-slate-900/50 space-y-1"
            >
              <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                {f.icon}
                <span>{f.label}</span>
              </div>
              <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{f.value}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Recent Activity */}
      <section className="rounded-3xl border border-border/70 bg-card p-6 shadow-xs lg:col-span-1 space-y-4">
        <h2 className="text-sm font-bold text-slate-900 dark:text-white">
          {isAr ? "سجل الحركات الأحدث" : "Recent Activity Feed"}
        </h2>
        <ActivityTimeline events={recentActivity} locale={locale} currency={currency} compact />
      </section>
    </div>
  );
}
