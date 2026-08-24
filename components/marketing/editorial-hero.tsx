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
            <div className="inline-flex items-center gap-2 rounded-full border border-sky-700/15 bg-sky-50/80 px-3.5 py-1 text-xs font-black text-sky-950 mb-6">
              <ShieldCheck className="size-3.5 text-[#07425d]" />
              <span>{isAr ? "محاسبة عقارية بقيد مزدوج" : "True Double-Entry Real Estate ERP"}</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black tracking-tight text-slate-950 font-heading leading-[1.18]">
              {isAr ? (
                <>
                  العقار مش إضافة للمحاسبة. <br className="hidden sm:inline" />
                  <span className="text-[#07425d]">هو جزء من القيد.</span>
                </>
              ) : (
                <>
                  Real estate isn’t an add-on. <br className="hidden sm:inline" />
                  <span className="text-[#07425d]">It’s part of the journal entry.</span>
                </>
              )}
            </h1>

            <p className="mt-6 text-base sm:text-lg text-slate-600 font-medium leading-relaxed max-w-2xl">
              {isAr
                ? "كل تحصيل أو مصروف أو استحقاق يحتفظ بسياقه الكامل — العقار، الوحدة، العميل والحساب — حتى القيد ودفتر الأستاذ. سجل مالي واحد، بلا فصل بين التشغيل والمحاسبة."
                : "Every collection, expense, or levy retains its complete context — property, unit, member, and account — all the way to the ledger."}
            </p>

            {/* Proof Points Strip */}
            <div className="mt-6 flex flex-wrap items-center gap-3 text-xs font-bold text-slate-700">
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100/90 px-3 py-1 border border-slate-200/80">
                <CheckCircle2 className="size-3.5 text-[#1b60b9]" />
                <span>{isAr ? "قيد مزدوج حقيقي" : "True Double-Entry"}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100/90 px-3 py-1 border border-slate-200/80">
                <CheckCircle2 className="size-3.5 text-[#1b60b9]" />
                <span>{isAr ? "تتبع على مستوى الوحدة" : "Unit-Level Granularity"}</span>
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100/90 px-3 py-1 border border-slate-200/80">
                <CheckCircle2 className="size-3.5 text-[#1b60b9]" />
                <span>{isAr ? "دفتر أستاذ موحّد" : "Unified General Ledger"}</span>
              </span>
            </div>
          </div>

          <div className="lg:col-span-4 flex flex-col gap-3.5 lg:items-end">
            <Link
              href="/demo"
              locale={locale}
              className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl bg-[#07425d] px-7 py-3.5 text-sm font-bold text-white shadow-md shadow-[#07425d]/20 transition-all hover:bg-[#053247] active:scale-98"
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
              <Building2 className="size-4 text-[#07425d]" />
              <span className="font-black text-slate-900">{isAr ? "مشروع بالم ريزيدنس" : "Palm Residence Complex"}</span>
              <span className="text-slate-300">|</span>
              <span className="text-slate-600">{isAr ? "المبنى B — الوحدة B-214" : "Building B — Unit B-214"}</span>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-mono">
              <span className="text-slate-500">{isAr ? "المعاملة المرجعية:" : "Ref:"}</span>
              <span className="font-extrabold text-[#07425d] bg-[#07425d]/10 px-2 py-0.5 rounded">
                TX-2026-08241
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12">
            {/* Left/Main: Real Architectural Physicality */}
            <div className="relative lg:col-span-7 min-h-[340px] sm:min-h-[420px] bg-slate-100">
              <Image
                src="/images/aqarbooks-hero-property.jpg"
                alt={isAr ? "مشروع عقاري معتمد — AqarBooks" : "AqarBooks Real Estate Architecture"}
                fill
                priority
                sizes="(min-width: 1024px) 58vw, 100vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent pointer-events-none" />

              {/* Physical Property Badge Card */}
              <div className="absolute bottom-5 inset-x-5 rounded-2xl bg-white/95 backdrop-blur-md p-4 border border-white/40 shadow-lg flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-sky-500 animate-pulse" />
                    <span className="text-xs font-black text-slate-900 font-heading">
                      {isAr ? "الوحدة B-214 (سكني فاخر)" : "Unit B-214 (Luxury Res.)"}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-600 font-medium">
                    {isAr ? "المالك: د. هشام الفاسي · الدور الثاني" : "Owner: Dr. Hesham El-Fassi · 2nd Fl."}
                  </p>
                </div>
                <div className="text-end">
                  <span className="text-[10px] font-mono text-slate-500 block">{isAr ? "المساحة" : "Area"}</span>
                  <span className="text-xs font-black text-slate-900 font-mono">215 م²</span>
                </div>
              </div>
            </div>

            {/* Right/Secondary: Real Financial Posting Voucher Document */}
            <div className="lg:col-span-5 p-6 sm:p-7 flex flex-col justify-between bg-[#FCFCFC] border-t lg:border-t-0 lg:border-s border-slate-200">
              <div>
                <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                  <span className="text-xs font-black text-slate-900 font-heading">
                    {isAr ? "سند تحصيل وتوليد قيد" : "Receipt & Voucher"}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-full bg-sky-100 text-[#07425d] px-2.5 py-0.5 text-[10px] font-extrabold font-mono">
                    <CheckCircle2 className="size-3" />
                    POSTED
                  </span>
                </div>

                {/* Real Transaction Figures */}
                <div className="mt-4 space-y-2.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600 font-medium">{isAr ? "رسوم خدمات وصيانة دورية" : "Service Dues (Q3)"}</span>
                    <span className="font-black text-slate-900 tabular-nums">25,000 ج.م</span>
                  </div>
                  <div className="flex items-center justify-between text-slate-500">
                    <span>{isAr ? "ضريبة القيمة المضافة (14% VAT)" : "14% Output VAT"}</span>
                    <span className="font-black text-slate-900 tabular-nums">3,500 ج.م</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-slate-200/80 flex items-center justify-between">
                    <span className="text-xs font-black text-slate-900">{isAr ? "إجمالي المبلغ المحصل" : "Total Cash Received"}</span>
                    <span className="text-base font-black text-[#07425d] tabular-nums">28,500 ج.م</span>
                  </div>
                </div>

                {/* Journal Entry Transformation Box */}
                <div className="mt-4.5 rounded-2xl border border-[#07425d]/20 bg-[#07425d]/[0.03] p-4">
                  <div className="flex items-center justify-between mb-3 text-xs">
                    <div className="flex items-center gap-1.5 font-bold text-[#07425d]">
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
