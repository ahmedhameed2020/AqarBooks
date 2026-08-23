import Image from "next/image";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { ArrowUpRight, CheckCircle2, ShieldCheck, ArrowDown, Building2, Receipt, FileText } from "lucide-react";

export function EditorialHero({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";

  return (
    <section className="relative overflow-hidden bg-white pt-10 pb-20 border-b border-slate-200/80">
      {/* Background Architectural Grid Pattern */}
      <div className="absolute inset-0 bg-[linear-gradient(to_right,#f1f5f9_1px,transparent_1px),linear-gradient(to_bottom,#f1f5f9_1px,transparent_1px)] bg-[size:4rem_4rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_0%,#000_70%,transparent_100%)] opacity-70 pointer-events-none" />

      <div className="relative mx-auto max-w-7xl px-6">
        {/* Top Trust Anchor */}
        <div className="flex items-center justify-between pb-6 border-b border-slate-150/80 text-[11px] font-bold text-slate-500">
          <div className="flex items-center gap-2">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span className="text-slate-800 font-extrabold">{isAr ? "نظام محاسبي متخصص" : "Specialized ERP"}</span>
            <span className="text-slate-300">/</span>
            <span>{isAr ? "إدارة الكيانات والمنتجعات واتحادات الملاك" : "Real Estate Entities & Resorts"}</span>
          </div>
          <div className="hidden sm:flex items-center gap-4 text-slate-600 font-mono text-[10px]">
            <span>DOUBLE-ENTRY CORE</span>
            <span>•</span>
            <span>AUDITED LEDGER</span>
          </div>
        </div>

        {/* Editorial Headline & Proposition */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 pt-10 pb-12 items-end">
          <div className="lg:col-span-8">
            <div className="inline-flex items-center gap-2 rounded-full border border-emerald-700/15 bg-emerald-50/80 px-3.5 py-1 text-xs font-black text-emerald-900 mb-6">
              <ShieldCheck className="size-3.5 text-emerald-700" />
              <span>{isAr ? "محرك محاسبة عامة بقيد مزدوج حقيقي" : "True Double-Entry General Ledger Engine"}</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-950 font-heading leading-[1.18]">
              {isAr ? (
                <>
                  المحاسبة التي <br className="hidden sm:inline" />
                  <span className="text-[#1A3C2E]">تفهم العقار.</span>
                </>
              ) : (
                <>
                  Accounting that <br className="hidden sm:inline" />
                  <span className="text-[#1A3C2E]">understands Real Estate.</span>
                </>
              )}
            </h1>

            <p className="mt-6 text-base sm:text-lg text-slate-600 font-medium leading-relaxed max-w-2xl">
              {isAr
                ? "كل تحصيل أو مصروف أو استحقاق مرتبط بالعقار والوحدة والعميل والحساب والقيد — في سجل مالي واحد لا ينفصل."
                : "Every collection, expense, or levy is tied to the property, unit, member, account, and journal entry — in a single unified ledger."}
            </p>
          </div>

          <div className="lg:col-span-4 flex flex-col gap-3.5 lg:items-end">
            <Link
              href="/demo"
              locale={locale}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-[#1A3C2E] px-7 py-3.5 text-sm font-bold text-white shadow-md shadow-[#1A3C2E]/20 transition-all hover:bg-[#132d22] active:scale-98"
            >
              <span>{isAr ? "استكشف النظام" : "Explore the Platform"}</span>
              <ArrowUpRight className="size-4" />
            </Link>

            <a
              href="#story"
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3.5 text-xs font-bold text-slate-800 transition-all hover:bg-slate-50 hover:border-slate-400"
            >
              <span>{isAr ? "شاهد كيف تتحول المعاملة إلى قيد" : "See How Transactions Become Journals"}</span>
              <ArrowDown className="size-3.5 text-slate-500" />
            </a>
          </div>
        </div>

        {/* COMBINED HERO VISUAL: Real Property + Real Financial Transaction Document */}
        <div className="relative rounded-3xl border border-slate-200/90 bg-white shadow-xl overflow-hidden">
          {/* Top Architectural Header Bar */}
          <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-slate-50/90 px-6 py-3.5 text-xs font-bold text-slate-700">
            <div className="flex items-center gap-3">
              <Building2 className="size-4 text-[#1A3C2E]" />
              <span className="font-black text-slate-900">{isAr ? "مشروع بالم ريزيدنس" : "Palm Residence Complex"}</span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-600">{isAr ? "المبنى B — الوحدة B-214" : "Building B — Unit B-214"}</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="text-slate-500">{isAr ? "المعاملة المرجعية:" : "Ref:"}</span>
              <span className="font-extrabold text-[#1A3C2E] bg-[#1A3C2E]/10 px-2 py-0.5 rounded">
                TX-2026-08241
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* Left/Main: Real Architectural Physicality */}
            <div className="relative lg:col-span-7 min-h-[340px] sm:min-h-[420px] bg-slate-100">
              <Image
                src="/images/aqarbooks-hero-property.jpg"
                alt={isAr ? "مشروع عقاري معتمد — عقار بوكس" : "AqarBooks Real Estate Architecture"}
                fill
                priority
                sizes="(max-width: 1024px) 100vw, 60vw"
                className="object-cover object-center"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/40 via-transparent to-transparent lg:hidden" />

              {/* Floating Property Identity Chip */}
              <div className="absolute bottom-4 start-4 rounded-xl bg-white/95 backdrop-blur-md px-3.5 py-2.5 shadow-lg border border-slate-200/80 text-xs">
                <div className="flex items-center gap-2">
                  <div className="size-2 rounded-full bg-emerald-500" />
                  <span className="font-black text-slate-900">Palm Residence — Unit B-214</span>
                </div>
                <div className="flex items-center gap-3 mt-1 text-[11px] text-slate-500 font-semibold">
                  <span>{isAr ? "المساحة: 185 م²" : "Area: 185 m²"}</span>
                  <span>•</span>
                  <span>{isAr ? "المالك: أحمد محمد" : "Owner: Ahmed Mohamed"}</span>
                </div>
              </div>
            </div>

            {/* Right: Integrated Real Accounting Record */}
            <div className="lg:col-span-5 bg-white p-6 sm:p-7 flex flex-col justify-between border-t lg:border-t-0 lg:border-s border-slate-200">
              <div>
                {/* Transaction Badge */}
                <div className="flex items-center justify-between pb-4 border-b border-slate-100">
                  <div className="flex items-center gap-2">
                    <Receipt className="size-4 text-emerald-700" />
                    <span className="text-xs font-black text-slate-900">{isAr ? "سند تحصيل صيانة وإدارة" : "Maintenance & CAM Receipt"}</span>
                  </div>
                  <span className="font-mono text-xs font-bold text-slate-500">RC-2026-01842</span>
                </div>

                {/* Real Transaction Figures */}
                <div className="mt-4.5 rounded-2xl bg-slate-50/80 p-4 border border-slate-200/70">
                  <div className="flex items-center justify-between text-xs font-medium text-slate-600">
                    <span>{isAr ? "رسوم الإدارة المعتمدة" : "Management Dues"}</span>
                    <span className="font-black text-slate-900 tabular-nums">25,000 ج.م</span>
                  </div>
                  <div className="flex items-center justify-between text-xs font-medium text-slate-600 mt-2">
                    <span>{isAr ? "ضريبة القيمة المضافة (14%)" : "Statutory VAT (14%)"}</span>
                    <span className="font-black text-slate-900 tabular-nums">3,500 ج.م</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-200/80 flex items-center justify-between">
                    <span className="text-xs font-black text-slate-900">{isAr ? "إجمالي المبلغ المحصل" : "Total Cash Received"}</span>
                    <span className="text-base font-black text-emerald-700 tabular-nums">28,500 ج.م</span>
                  </div>
                </div>

                {/* Journal Entry Transformation Box */}
                <div className="mt-4.5 rounded-2xl border border-[#1A3C2E]/20 bg-[#1A3C2E]/[0.03] p-4">
                  <div className="flex items-center justify-between mb-3 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-[#1A3C2E]">
                      <FileText className="size-3.5" />
                      <span>{isAr ? "القيد المحاسبي المتولد" : "Generated Journal Entry"}</span>
                    </div>
                    <span className="font-mono text-[11px] font-extrabold text-slate-600">JV-2026-00418</span>
                  </div>

                  <div className="space-y-2 text-xs font-medium">
                    {/* Debit Line */}
                    <div className="flex items-center justify-between bg-white rounded-lg p-2 border border-slate-200/80">
                      <div>
                        <span className="font-bold text-slate-900">{isAr ? "مدين: الصندوق الرئيسي" : "Dr: Main Treasury"}</span>
                        <span className="block text-[10px] text-slate-500 font-mono">10101-01</span>
                      </div>
                      <span className="font-black text-slate-900 tabular-nums">28,500 ج.م</span>
                    </div>

                    {/* Credit Line 1 */}
                    <div className="flex items-center justify-between bg-white rounded-lg p-2 border border-slate-200/80">
                      <div>
                        <span className="font-bold text-slate-900">{isAr ? "دائن: إيراد رسوم إدارة" : "Cr: Management Revenue"}</span>
                        <span className="block text-[10px] text-slate-500 font-mono">40101-02</span>
                      </div>
                      <span className="font-black text-slate-900 tabular-nums">25,000 ج.م</span>
                    </div>

                    {/* Credit Line 2 */}
                    <div className="flex items-center justify-between bg-white rounded-lg p-2 border border-slate-200/80">
                      <div>
                        <span className="font-bold text-slate-900">{isAr ? "دائن: ضريبة القيمة المضافة" : "Cr: Output VAT Payable"}</span>
                        <span className="block text-[10px] text-slate-500 font-mono">20301-01</span>
                      </div>
                      <span className="font-black text-slate-900 tabular-nums">3,500 ج.م</span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Balanced Check Footer */}
              <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs">
                <div className="flex items-center gap-1.5 text-emerald-700 font-bold">
                  <CheckCircle2 className="size-4 text-emerald-600" />
                  <span>{isAr ? "القيد متوازن 100% ومرحل لحظياً" : "Balanced & Posted to GL"}</span>
                </div>
                <span className="font-mono text-xs font-black text-slate-900">28,500 = 28,500</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
