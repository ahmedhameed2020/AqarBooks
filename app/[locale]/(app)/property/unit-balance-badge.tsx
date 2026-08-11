import { Badge } from "@/components/ui/badge";
import { Money } from "@/components/money";
import { cn } from "@/lib/utils";

// Reused on the unit/member detail pages once they exist, so kept generic
// on (balance, currency, locale) rather than tied to a row shape.
export function UnitBalanceBadge({
  balance,
  currency,
  locale,
}: {
  balance: number;
  currency: string;
  locale: string;
}) {
  const isAr = locale === "ar";
  const settled = balance <= 0;

  return (
    <Badge
      variant="outline"
      className={cn(
        "tabular-nums",
        settled
          ? "border-transparent bg-muted text-muted-foreground"
          : "border-transparent bg-destructive/10 text-destructive",
      )}
    >
      {settled ? (
        isAr ? "لا يوجد متأخرات" : "Settled"
      ) : (
        <Money amount={balance} currency={currency} locale={locale} />
      )}
    </Badge>
  );
}
