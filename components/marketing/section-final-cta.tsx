import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

import { MarketingFooter } from "@/components/marketing/marketing-footer";
import { ArrowUpRight, CheckCircle2, ShieldCheck } from "lucide-react";

export function SectionFinalCta({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";

  return (
    <section className="relative bg-white pt-24 pb-16 border-t border-slate-200/90 overflow-hidden">
      {/* Subtle Architectural Drafting Grid */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#f8fafc_1px,transparent_1px),linear-gradient(to_bottom,#f8fafc_1px,transparent_1px)] bg-[size:3rem_3rem] opacity-80 pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-6">
        {/* Main Editorial CTA Banner */}
        <div className="rounded-3xl border border-slate-300/80 bg-[#FAFAFA] p-8 sm:p-14 shadow-sm text-center max-w-4xl mx-auto">
          <div className="inline-flex items-center gap-2 rounded-full border border-[#07425d]/20 bg-[#07425d]/5 px-3.5 py-1 text-xs font-black text-[#07425d] mb-6">
            <ShieldCheck className="size-3.5" />
            <span>{isAr ? "جاهز لدفاترك الحقيقية" : "READY FOR REAL BOOKS"}</span>
          </div>

          <h2 className="text-3xl sm:text-5xl font-black text-slate-950 font-heading leading-tight">
            {isAr ? "شوف AqarBooks وهو بيحاسب عقارك فعلًا." : "See AqarBooks accounting for your real property."}
          </h2>

          <p className="mt-4 text-base sm:text-lg text-slate-600 font-medium max-w-xl mx-auto leading-relaxed">
            {isAr
              ? "مش Demo بأرقام مالهاش علاقة بشغلك. شوف كيف تنتقل وحداتك واستحقاقاتك وتحصيلاتك من واقع العقار إلى القيد والتقارير داخل نظام مالي واحد."
              : "Not an abstract demo with fake numbers. See how your units, levies, and collections flow from physical property to journal entry and reports inside a single accounting ERP."}
          </p>

          <div className="mt-8 flex flex-wrap items-center justify-center gap-4">
            <Link
              href="/demo"
              locale={locale}
              className="inline-flex items-center gap-2 rounded-xl bg-[#07425d] px-8 py-3.5 text-sm font-bold text-white shadow-md shadow-[#07425d]/20 transition-all hover:bg-[#053247] active:scale-98"
            >
              <span>{isAr ? "طلب عرض تجريبي" : "Request a Demo"}</span>
              <ArrowUpRight className="size-4" />
            </Link>

            <Link
              href="/login"
              locale={locale}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-7 py-3.5 text-sm font-bold text-slate-800 transition-all hover:bg-slate-50 hover:border-slate-400"
            >
              <span>{isAr ? "تسجيل الدخول" : "Sign In"}</span>
            </Link>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-200/70 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-600 font-bold">
            <div className="flex items-center gap-1.5 text-slate-800">
              <CheckCircle2 className="size-3.5 text-[#1b60b9]" />
              <span>{isAr ? "قيد مزدوج حقيقي" : "True Double-Entry Core"}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-800">
              <CheckCircle2 className="size-3.5 text-[#1b60b9]" />
              <span>{isAr ? "تتبع مالي كامل" : "Full Financial Traceability"}</span>
            </div>
            <div className="flex items-center gap-1.5 text-slate-800">
              <CheckCircle2 className="size-3.5 text-[#1b60b9]" />
              <span>{isAr ? "عزل بيانات كل كيان" : "Entity Data Isolation (RLS)"}</span>
            </div>
          </div>
        </div>

        {/* Clean Editorial Footer */}
        <MarketingFooter locale={locale} />
      </div>
    </section>
  );
}
