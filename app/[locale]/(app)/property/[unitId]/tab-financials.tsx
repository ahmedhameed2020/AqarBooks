import { Money } from "@/components/money";
import { AGING_BUCKETS, type AgingBucketKey } from "@/lib/finance/aging";
import type { MonthlyFinancialPoint } from "@/lib/property/unit-financials";
import { DuesTable } from "../dues-table";
import { PaymentsTable } from "../payments-table";
import { UnitFinancialsChart } from "./unit-financials-chart";

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
            <div key={b.key} className="rounded-xl border border-border/50 bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">{isAr ? b.labelAr : b.labelEn}</p>
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
