import { Wallet, Receipt, CircleCheck, Clock3, Building, CreditCard, Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { buttonVariants } from "@/components/ui/button";
import { Money } from "@/components/money";
import { KpiCard } from "../../dashboard/kpi-card";
import { BackButton } from "../back-button";
import { OccupancyBadge, UNIT_TYPE_ICONS, type UnitRow } from "../units-table";
import { unitTypeLabel } from "@/lib/units/unit-type-labels";
import { UnitBalanceBadge } from "../unit-balance-badge";

export function UnitHeader({
  unit,
  locale,
  currency,
  registeredDate,
  lastPayment,
}: {
  unit: UnitRow;
  locale: string;
  currency: string;
  registeredDate: string | null;
  lastPayment: { amount: number; payment_date: string } | null;
}) {
  const isAr = locale === "ar";
  const facts = [
    isAr ? unit.building_name_ar : unit.building_name_en,
    isAr ? unit.zone_name_ar : unit.zone_name_en,
    unit.floor_number != null ? (isAr ? `الدور ${unit.floor_number}` : `Floor ${unit.floor_number}`) : null,
    unit.area != null ? `${unit.area} ${isAr ? "م²" : "m²"}` : null,
    registeredDate ? (isAr ? `مُسجّلة ${registeredDate}` : `Registered ${registeredDate}`) : null,
  ].filter(Boolean).join(" · ");

  return (
    <div className="space-y-4">
      <BackButton locale={locale} />

      <div className="gradient-hero-banner relative overflow-hidden rounded-3xl border border-border/60 p-6 shadow-xs">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-primary">{UNIT_TYPE_ICONS[unit.unit_type]}</span>
              <h1 className="font-mono text-2xl font-bold tracking-tight sm:text-3xl">{unit.code}</h1>
              <OccupancyBadge status={unit.occupancy_status} locale={locale} />
              <UnitBalanceBadge balance={unit.balance} currency={currency} locale={locale} />
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              <Building className="me-1 inline size-3.5" />
              {unitTypeLabel(unit, isAr)}
              {facts ? ` · ${facts}` : ""}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <Link
              href={`/finance/payments?unit=${unit.id}`}
              locale={locale}
              className={buttonVariants({ size: "sm", className: "gap-1.5" })}
            >
              <CreditCard className="size-3.5" />
              {isAr ? "سداد دفعة" : "Record Payment"}
            </Link>
            <Link
              href={`/finance/dues?unit=${unit.id}`}
              locale={locale}
              className={buttonVariants({ variant: "outline", size: "sm", className: "gap-1.5" })}
            >
              <Plus className="size-3.5" />
              {isAr ? "إصدار مستحق" : "Issue Due"}
            </Link>
          </div>
        </div>
      </div>

      <div className="reveal-stagger grid grid-cols-2 gap-4 xl:grid-cols-4">
        <div style={{ "--reveal-i": 0 } as React.CSSProperties}>
          <KpiCard
            label={isAr ? `الرصيد الحالي (${currency})` : `Current balance (${currency})`}
            value={<Money amount={unit.balance} locale={locale} tone={unit.balance > 0 ? "negative" : "positive"} />}
            icon={<Wallet className="size-5" />}
            tone={unit.balance > 0 ? "negative" : "positive"}
          />
        </div>
        <div style={{ "--reveal-i": 1 } as React.CSSProperties}>
          <KpiCard
            label={isAr ? `إجمالي المستحق (${currency})` : `Total due (${currency})`}
            value={<Money amount={unit.total_due} locale={locale} />}
            icon={<Receipt className="size-5" />}
            tone="info"
          />
        </div>
        <div style={{ "--reveal-i": 2 } as React.CSSProperties}>
          <KpiCard
            label={isAr ? `إجمالي المدفوع (${currency})` : `Total paid (${currency})`}
            value={<Money amount={unit.total_paid} locale={locale} tone="positive" />}
            icon={<CircleCheck className="size-5" />}
            tone="positive"
          />
        </div>
        <div style={{ "--reveal-i": 3 } as React.CSSProperties}>
          <KpiCard
            label={isAr ? "آخر دفعة" : "Last payment"}
            value={lastPayment ? <Money amount={lastPayment.amount} currency={currency} locale={locale} /> : "—"}
            hint={lastPayment?.payment_date}
            icon={<Clock3 className="size-5" />}
          />
        </div>
      </div>
    </div>
  );
}
