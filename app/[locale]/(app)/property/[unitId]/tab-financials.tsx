import { Money } from "@/components/money";
import { AGING_BUCKETS, type AgingBucketKey } from "@/lib/finance/aging";
import type { MonthlyFinancialPoint } from "@/lib/property/unit-financials";
import { DuesTable } from "../dues-table";
import { PaymentsTable } from "../payments-table";
import { UnitFinancialsChart } from "./unit-financials-chart";

// Aging severity reads as a heat progression, cool -> hot, so the eye finds
// the worst bucket without reading numbers first.
const AGING_SEVERITY: Record<AgingBucketKey, string> = {
  current: "border-slate-500/20 bg-slate-500/[0.03] text-slate-600 dark:text-slate-400",
  d1_30: "border-amber-500/20 bg-amber-500/[0.04] text-amber-700 dark:text-amber-400",
  d31_60: "border-amber-600/25 bg-amber-600/[0.06] text-amber-800 dark:text-amber-300",
  d61_90: "border-orange-600/30 bg-orange-600/[0.07] text-orange-800 dark:text-orange-300",
  d90plus: "border-rose-600/35 bg-rose-600/[0.08] text-rose-700 dark:text-rose-400",
};

export function TabFinancials({
  organizationId,
  unitId,
  locale,
  currency,
  monthly,
  agingTotals,
}: {
  organizationId: string;
  unitId: string;
  locale: string;
  currency: string;
  monthly: MonthlyFinancialPoint[];
  agingTotals: Map<AgingBucketKey, number>;
}) {
  const isAr = locale === "ar";
  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xs">
        <h2 className="mb-4 text-sm font-semibold">{isAr ? "المستحقات مقابل المدفوعات (شهريًا)" : "Dues vs payments (monthly)"}</h2>
        <UnitFinancialsChart
          data={monthly}
          labels={{
            dued: isAr ? "مستحقات" : "Dues",
            paid: isAr ? "مدفوعات" : "Payments",
            empty: isAr ? "لا توجد حركات مالية بعد" : "No financial activity yet",
          }}
        />
      </section>

      <section className="rounded-2xl border border-border/60 bg-card p-5 shadow-xs">
        <h2 className="mb-4 text-sm font-semibold">{isAr ? "أعمار المتأخرات" : "Arrears aging"}</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
          {AGING_BUCKETS.map((b) => (
            <div key={b.key} className={`rounded-xl border p-3 ${AGING_SEVERITY[b.key]}`}>
              <p className="text-xs opacity-80">{isAr ? b.labelAr : b.labelEn}</p>
              <p className="mt-1 text-lg font-bold tabular-nums">
                <Money amount={agingTotals.get(b.key) ?? 0} locale={locale} zeroLabel="—" />
              </p>
            </div>
          ))}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{isAr ? "سجل الاستحقاقات" : "Dues history"}</h2>
        <DuesTable organizationId={organizationId} unitId={unitId} locale={locale} currency={currency} />
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold">{isAr ? "سجل الدفعات" : "Payments history"}</h2>
        <PaymentsTable organizationId={organizationId} unitId={unitId} locale={locale} currency={currency} />
      </section>
    </div>
  );
}
