import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { CreditCard, Receipt, Plus, FileText, Building, Calendar, Zap } from "lucide-react";

export function DashboardActions({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Primary Action */}
      <Link
        href="/finance/payments"
        locale={locale}
        className="inline-flex items-center gap-2 rounded-xl bg-primary px-4 py-2 text-xs font-bold text-primary-foreground shadow-sm hover:bg-primary/90 press-feedback motion-control"
      >
        <CreditCard className="size-4" />
        <span>{isAr ? "تسجيل سند قبض" : "Record Payment"}</span>
      </Link>

      {/* Secondary Actions */}
      <Link
        href="/finance/einvoice"
        locale={locale}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors press-feedback motion-control shadow-xs"
      >
        <Zap className="size-3.5 text-muted-foreground" />
        <span>{isAr ? "فاتورة إلكترونية" : "E-Invoice"}</span>
      </Link>

      <Link
        href="/finance/journals"
        locale={locale}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors press-feedback motion-control shadow-xs"
      >
        <Plus className="size-3.5 text-muted-foreground" />
        <span>{isAr ? "قيد يومية" : "New Journal"}</span>
      </Link>

      <Link
        href="/admin/finance/periods"
        locale={locale}
        className="inline-flex items-center gap-1.5 rounded-xl border border-border/80 bg-card px-3.5 py-2 text-xs font-semibold text-foreground hover:bg-muted transition-colors press-feedback motion-control shadow-xs"
      >
        <Calendar className="size-3.5 text-muted-foreground" />
        <span>{isAr ? "الفترات والإقفال" : "Periods & Closing"}</span>
      </Link>
    </div>
  );
}

