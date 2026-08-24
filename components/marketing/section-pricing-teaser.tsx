import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";
import { ArrowUpRight, CheckCircle2, ShieldCheck, Layers, Building2, Landmark } from "lucide-react";

export function SectionPricingTeaser({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";

  return (
    <section id="pricing-teaser" className="relative bg-white py-24 border-b border-slate-200/80">
      <div className="mx-auto max-w-7xl px-6">
        
        {/* Section Header */}
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 text-xs font-mono font-bold text-[#07425d] bg-[#07425d]/10 px-3 py-1 rounded-full border border-[#07425d]/20 mb-3">
            <span className="flex size-4 items-center justify-center rounded-full bg-[#07425d] text-[10px] text-white">10</span>
            <span>{isAr ? "باقات التشغيل والأسعار" : "OPERATING PLANS & SCALE"}</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-black text-slate-950 font-heading leading-tight">
            {isAr ? "اختار الباقة اللي تناسب حجم عقاراتك واحتياجات فريقك." : "Choose the plan tailored to your property scale and governance needs."}
          </h2>

          <p className="mt-3.5 text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
            {isAr
              ? "تسعير مرن يتدرج معك من عمارة أو اتحاد ملاك فردي، وحتى المحافظ العقارية الكبيرة متعددة الشركات والكيانات."
              : "Flexible plans scaling from a single building or HOA to large multi-entity commercial holdings."}
          </p>
        </div>

        {/* 3 Operating Scale Tiers */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-3 gap-6">
          
          {/* Tier 1: Essential */}
          <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-6 sm:p-7 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <span className="font-mono text-xs font-black text-slate-500 uppercase">TIER 01</span>
                <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {isAr ? "كيان فردي" : "Single Entity"}
                </span>
              </div>

              <h3 className="text-lg font-black text-slate-950 font-heading mt-3">Essential</h3>
              <p className="text-xs text-slate-600 font-medium mt-1">
                {isAr ? "للكيانات العقارية المركزة واتحادات الملاك الفردية." : "For focused property entities and single HOAs."}
              </p>

              <div className="mt-5 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-slate-700">
                  <CheckCircle2 className="size-3.5 text-[#1b60b9] shrink-0" />
                  <span>{isAr ? "قيد مزدوج حقيقي لدفتر الأستاذ" : "True double-entry general ledger"}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <CheckCircle2 className="size-3.5 text-[#1b60b9] shrink-0" />
                  <span>{isAr ? "كشف حساب تفصيلي للوحدة والمالك" : "Unit & owner sub-ledgers"}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <CheckCircle2 className="size-3.5 text-[#1b60b9] shrink-0" />
                  <span>{isAr ? "إصدار سندات قبض وفواتير معتمدة" : "Standard receipts & levy vouchers"}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200">
              <span className="text-[11px] font-mono text-slate-500 block">{isAr ? "نطاق الحوكمة:" : "Governance Scope:"}</span>
              <span className="text-xs font-bold text-slate-900">{isAr ? "رقابة تشغيلية أساسية" : "Core Operational Ledger"}</span>
            </div>
          </div>

          {/* Tier 2: Professional (Elevated) */}
          <div className="rounded-3xl border border-[#07425d] bg-[#07425d]/[0.03] p-6 sm:p-7 shadow-sm flex flex-col justify-between ring-1 ring-[#07425d]/20">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-[#07425d]/15">
                <span className="font-mono text-xs font-black text-[#07425d] uppercase">TIER 02 · SCALE</span>
                <span className="text-[10px] font-black text-[#07425d] bg-[#07425d]/10 px-2.5 py-0.5 rounded-full border border-[#07425d]/20">
                  {isAr ? "متعدد المباني والكيانات" : "Multi-Building"}
                </span>
              </div>

              <h3 className="text-lg font-black text-slate-950 font-heading mt-3">Professional</h3>
              <p className="text-xs text-slate-600 font-medium mt-1">
                {isAr ? "للكمبوندات والأبراج والعمليات المتنامية ذات الحسابات المتعددة." : "For growing compounds, towers, and multi-property operations."}
              </p>

              <div className="mt-5 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-slate-800 font-medium">
                  <CheckCircle2 className="size-3.5 text-[#07425d] shrink-0" />
                  <span>{isAr ? "فصل تلقائي لودائع الصيانة وحسابات الـ CAM" : "Automated CAM & Sinking Fund splits"}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-800 font-medium">
                  <CheckCircle2 className="size-3.5 text-[#07425d] shrink-0" />
                  <span>{isAr ? "مطابقة بنكية ذكية واستيراد كشوف الحساب" : "Smart bank feed & statement recon"}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-800 font-medium">
                  <CheckCircle2 className="size-3.5 text-[#07425d] shrink-0" />
                  <span>{isAr ? "حوكمة الاعتمادات وفصل الصلاحيات (Maker-Checker)" : "Maker-Checker approval governance"}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-800 font-medium">
                  <CheckCircle2 className="size-3.5 text-[#07425d] shrink-0" />
                  <span>{isAr ? "تهيئة ضريبية ومطابقة ETA / ZATCA" : "ETA / ZATCA tax readiness"}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-[#07425d]/15">
              <span className="text-[11px] font-mono text-slate-500 block">{isAr ? "نطاق الحوكمة:" : "Governance Scope:"}</span>
              <span className="text-xs font-bold text-[#07425d]">{isAr ? "حوكمة ورقابة مالية متقدمة" : "Advanced Financial Controls"}</span>
            </div>
          </div>

          {/* Tier 3: Enterprise */}
          <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-6 sm:p-7 flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <span className="font-mono text-xs font-black text-slate-500 uppercase">TIER 03</span>
                <span className="text-[10px] font-bold text-slate-500 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {isAr ? "محافظ قابضة" : "Portfolio & Holdings"}
                </span>
              </div>

              <h3 className="text-lg font-black text-slate-950 font-heading mt-3">Enterprise</h3>
              <p className="text-xs text-slate-600 font-medium mt-1">
                {isAr ? "للمحافظ العقارية المعقدة وإدارات الحسابات المركزية." : "For complex portfolios and centralized finance departments."}
              </p>

              <div className="mt-5 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-slate-700">
                  <CheckCircle2 className="size-3.5 text-[#1b60b9] shrink-0" />
                  <span>{isAr ? "قوائم مالية مجمعة وتسويات بينية (Intercompany)" : "Consolidated P&L & intercompany transfers"}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <CheckCircle2 className="size-3.5 text-[#1b60b9] shrink-0" />
                  <span>{isAr ? "طبقة ذكاء اصطناعي محكومة بالكامل (AI Layer)" : "Governed AI Copilot & OCR pipeline"}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-700">
                  <CheckCircle2 className="size-3.5 text-[#1b60b9] shrink-0" />
                  <span>{isAr ? "شجرة حسابات مخصصة وربط API مفتوح" : "Custom COA & enterprise API endpoints"}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-4 border-t border-slate-200">
              <span className="text-[11px] font-mono text-slate-500 block">{isAr ? "نطاق الحوكمة:" : "Governance Scope:"}</span>
              <span className="text-xs font-bold text-slate-900">{isAr ? "رقابة مؤسسية ومراجعة قانونية" : "Statutory Audit & Consolidation"}</span>
            </div>
          </div>

        </div>

        {/* Action Link to Full Pricing */}
        <div className="mt-10 flex flex-wrap items-center justify-between gap-4 bg-slate-50 p-5 rounded-2xl border border-slate-200">
          <div className="flex items-center gap-3">
            <ShieldCheck className="size-5 text-[#07425d]" />
            <p className="text-xs text-slate-700 font-medium">
              {isAr
                ? "برنامج المؤسسين متاح الآن بأسعار إطلاق خاصة لأول 10 كيانات عقارية."
                : "Founding Program available with exclusive launch terms for the first 10 entities."}
            </p>
          </div>

          <Link
            href="/pricing"
            locale={locale}
            className="inline-flex items-center gap-2 rounded-xl bg-[#07425d] px-5 py-2.5 text-xs font-bold text-white shadow-sm hover:bg-[#053247] transition-all"
          >
            <span>{isAr ? "استعراض جدول الأسعار التفاعلي" : "View Full Pricing Details"}</span>
            <ArrowUpRight className="size-3.5" />
          </Link>
        </div>

      </div>
    </section>
  );
}
