import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/money";
import { createClient } from "@/lib/supabase/server";

/** The unit's customer-advance credit (effective receipts only). Renders nothing when the unit holds none. */
export async function UnitCreditCard({
  organizationId,
  unitId,
  locale,
  currency,
}: {
  organizationId: string;
  unitId: string;
  locale: string;
  currency: string;
}) {
  const isAr = locale === "ar";
  const supabase = await createClient();
  const { data } = await supabase
    .from("payment_credit_balances")
    .select("remaining_amount, is_stranded")
    .eq("organization_id", organizationId)
    .eq("unit_id", unitId);
  const rows = data ?? [];
  const remaining = rows.reduce((sum, r) => sum + Number(r.remaining_amount), 0);
  if (remaining <= 0) return null;
  const stranded = rows.some((r) => r.is_stranded && Number(r.remaining_amount) > 0);

  return (
    <section className="rounded-2xl border border-sky-500/30 bg-sky-500/[0.05] p-5 shadow-xs" data-testid="unit-credit-card">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="text-sm font-semibold">{isAr ? "رصيد دائن (دفعات مقدمة)" : "Credit balance (advances)"}</h2>
          <p className="text-xs text-muted-foreground">
            {isAr ? "يُطبَّق يدويًا على مطالبات هذه الوحدة من سندات القبض." : "Applied by hand to this unit's dues from the receipts page."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          {stranded && <Badge variant="outline">{isAr ? "رصيد معلّق" : "Stranded credit"}</Badge>}
          <span className="text-lg font-bold tabular-nums">
            <Money amount={remaining} currency={currency} locale={locale} />
          </span>
        </div>
      </div>
    </section>
  );
}
