import { cn } from "@/lib/utils";

// Central numeric/currency formatter for /property and /members: thousands
// separators, 2 decimals, tabular-nums, and a quiet zero state (instead of a
// loud "0.00") for anything representing arrears/balance.
export function Money({
  amount,
  currency,
  locale,
  tone,
  zeroLabel,
  className,
}: {
  amount: number;
  currency?: string;
  locale: string;
  tone?: "positive" | "negative" | "auto";
  zeroLabel?: string | false;
  className?: string;
}) {
  if (zeroLabel !== false && amount === 0 && zeroLabel !== undefined) {
    return <span className={cn("text-muted-foreground", className)}>{zeroLabel}</span>;
  }

  const resolvedTone = tone === "auto" ? (amount > 0 ? "negative" : amount < 0 ? "positive" : undefined) : tone;
  const toneClass =
    resolvedTone === "negative"
      ? "text-destructive"
      : resolvedTone === "positive"
        ? "text-emerald-600 dark:text-emerald-400"
        : "";

  const formatted = amount.toLocaleString(locale, { minimumFractionDigits: 2, maximumFractionDigits: 2 });

  return (
    <span className={cn("tabular-nums", toneClass, className)}>
      {formatted}
      {currency ? ` ${currency}` : ""}
    </span>
  );
}
