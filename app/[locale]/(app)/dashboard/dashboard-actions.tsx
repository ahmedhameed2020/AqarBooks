import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { CreditCard, Receipt, Plus, FileText, Building, Calendar, Zap } from "lucide-react";

export function DashboardActions({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Link
        href="/finance/payments"
        locale={locale}
        className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-indigo-600 px-4 py-2 text-xs font-black text-white shadow-md shadow-purple-600/20 hover:from-purple-700 hover:to-indigo-700 transition-all cursor-pointer"
      >
        <CreditCard className="size-4" />
        <span>{isAr ? "تسجيل سند قبض" : "Record Payment"}</span>
      </Link>

      <Link
        href="/finance/einvoice"
        locale={locale}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 hover:border-purple-300 transition-all dark:border-slate-800 dark:bg-slate-900 dark:text-white cursor-pointer shadow-xs"
      >
        <Zap className="size-3.5 text-purple-600" />
        <span>{isAr ? "فاتورة إلكترونية" : "E-Invoice"}</span>
      </Link>

      <Link
        href="/finance/journals"
        locale={locale}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 hover:border-blue-300 transition-all dark:border-slate-800 dark:bg-slate-900 dark:text-white cursor-pointer shadow-xs"
      >
        <Plus className="size-3.5 text-blue-600" />
        <span>{isAr ? "قيد يومية" : "New Journal"}</span>
      </Link>

      <Link
        href="/admin/finance/periods"
        locale={locale}
        className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-bold text-slate-800 hover:bg-slate-50 hover:border-indigo-300 transition-all dark:border-slate-800 dark:bg-slate-900 dark:text-white cursor-pointer shadow-xs"
      >
        <Calendar className="size-3.5 text-indigo-600" />
        <span>{isAr ? "الفترات والإقفال" : "Periods & Closing"}</span>
      </Link>
    </div>
  );
}

