import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { buttonVariants } from "@/components/ui/button";
import { CreditCard, Receipt, Plus, FileSpreadsheet, Search } from "lucide-react";

export function DashboardActions({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href="/finance/payments"
        locale={locale}
        className={buttonVariants({
          size: "sm",
          className:
            "shadow-xs bg-primary font-medium hover:bg-primary/90 text-primary-foreground transition-all duration-200 hover:scale-[1.02]",
        })}
      >
        <CreditCard className="size-3.5" />
        {isAr ? "تسجيل دفعة" : "Record Payment"}
      </Link>
      <Link
        href="/finance/dues"
        locale={locale}
        className={buttonVariants({
          variant: "outline",
          size: "sm",
          className: "bg-card/80 backdrop-blur-sm border-border/80 hover:bg-muted/80 transition-all",
        })}
      >
        <Receipt className="size-3.5" />
        {isAr ? "إصدار مستحق" : "Issue Due"}
      </Link>
      <Link
        href="/finance/journals/new"
        locale={locale}
        className={buttonVariants({
          variant: "outline",
          size: "sm",
          className: "bg-card/80 backdrop-blur-sm border-border/80 hover:bg-muted/80 transition-all",
        })}
      >
        <Plus className="size-3.5" />
        {isAr ? "قيد جديد" : "New Entry"}
      </Link>
      <Link
        href="/finance/reports"
        locale={locale}
        className={buttonVariants({
          variant: "ghost",
          size: "sm",
          className: "text-muted-foreground hover:text-foreground hover:bg-muted/60",
        })}
      >
        <FileSpreadsheet className="size-3.5" />
        {isAr ? "التقارير" : "Reports"}
      </Link>
    </div>
  );
}
