import Image from "next/image";
import type { Locale } from "@/i18n/routing";
import { Building, MapPin, User, Calendar, Tag, CreditCard, Layers, CheckCircle2 } from "lucide-react";

export function SectionPropertyEvent({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";

  return (
    <section id="story" className="relative bg-[#F8F9FA] py-20 border-b border-slate-200/80">
      <div className="mx-auto max-w-7xl px-6">
        {/* Section Header */}
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#07425d]">
            <span className="flex size-5 items-center justify-center rounded-full bg-[#07425d]/10 text-[10px]">01</span>
            <span>{isAr ? "من العقار إلى القيد" : "FROM PROPERTY TO JOURNAL"}</span>
          </div>

          <h2 className="mt-3 text-3xl sm:text-4xl font-black text-slate-950 font-heading">
            {isAr ? "كل رقم في دفاترك له حكاية تقدر ترجع لها." : "Every figure in your books has a traceable provenance."}
          </h2>

          <p className="mt-3.5 text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
            {isAr
              ? "المطالبة أو التحصيل تبدأ من عقار ومبنى ووحدة وعميل محدد — وتظل مرتبطة بمصدرها حتى القيد ودفتر الأستاذ."
              : "Every levy or collection originates from a specific property, building, unit, and verified member — permanently bound to its source all the way to the ledger."}
          </p>

          {/* Proof Points */}
          <div className="mt-5 flex flex-wrap items-center gap-2.5 text-xs font-bold text-slate-700">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 border border-slate-200 shadow-2xs">
              <CheckCircle2 className="size-3.5 text-[#1b60b9]" />
              <span>{isAr ? "مصدر واضح" : "Clear Source Origin"}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 border border-slate-200 shadow-2xs">
              <CheckCircle2 className="size-3.5 text-[#1b60b9]" />
              <span>{isAr ? "ربط بالوحدة" : "Unit-Bound DNA"}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-white px-2.5 py-1 border border-slate-200 shadow-2xs">
              <CheckCircle2 className="size-3.5 text-[#1b60b9]" />
              <span>{isAr ? "تتبع حتى القيد" : "Traceable to Journal"}</span>
            </span>
          </div>
        </div>

        {/* The Structured Real-Estate Property Event Ledger Card */}
        <div className="mt-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          {/* Visual Property Context */}
          <div className="relative lg:col-span-4 rounded-3xl overflow-hidden border border-slate-200 bg-white shadow-sm min-h-[300px]">
            <Image
              src="/images/aqarbooks-unit-event.jpg"
              alt={isAr ? "الوحدة العقارية B-214 — بالم ريزيدنس" : "Unit B-214 Architectural Interior & Balcony"}
              fill
              sizes="(max-width: 1024px) 100vw, 33vw"
              className="object-cover object-center"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-slate-950/80 via-slate-950/20 to-transparent" />
            <div className="absolute bottom-5 start-5 end-5 text-white">
              <span className="text-[10px] font-mono font-extrabold uppercase tracking-wider text-sky-300">
                {isAr ? "الكيان النشط" : "ACTIVE REAL ESTATE ENTITY"}
              </span>
              <p className="text-xl font-black font-heading mt-0.5">Palm Residence — Building B</p>
              <div className="mt-2 flex items-center justify-between text-xs text-slate-300 font-medium pt-2 border-t border-white/20">
                <span>{isAr ? "الدور 2 • وحدة B-214" : "Floor 2 • Unit B-214"}</span>
                <span>185 m²</span>
              </div>
            </div>
          </div>

          {/* Real-Estate Financial Event Record */}
          <div className="lg:col-span-8 rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-sm flex flex-col justify-between">
            <div>
              {/* Document Header */}
              <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-slate-200/80">
                <div className="flex items-center gap-3">
                  <div className="flex size-10 items-center justify-center rounded-xl bg-[#07425d]/10 text-[#07425d]">
                    <Building className="size-5" />
                  </div>
                  <div>
                    <span className="text-xs font-mono font-bold text-slate-400">RECORD ID: EVT-2026-08241</span>
                    <h3 className="text-base font-black text-slate-950">
                      {isAr ? "سجل استحقاق رسوم إدارة وتشغيل سنوية" : "Annual CAM & Management Assessment Record"}
                    </h3>
                  </div>
                </div>

                <span className="inline-flex items-center gap-1.5 rounded-full bg-sky-50 text-[#07425d] border border-sky-200 px-3 py-1 text-xs font-bold">
                  <CheckCircle2 className="size-3.5 text-[#1b60b9]" />
                  <span>{isAr ? "استحقاق قانوني معتمد" : "Approved Statutory Levy"}</span>
                </span>
              </div>

              {/* Data Grid: Realistic Property Attributes */}
              <div className="mt-6 grid grid-cols-2 sm:grid-cols-4 gap-4">
                <div className="rounded-2xl bg-slate-50/90 p-3.5 border border-slate-200/70">
                  <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                    <MapPin className="size-3 text-slate-400" />
                    {isAr ? "الكيان والمبنى" : "Entity / Building"}
                  </span>
                  <p className="mt-1 text-xs font-black text-slate-900">Palm Residence</p>
                  <span className="text-[10px] text-slate-500 block font-medium">{isAr ? "مبنى B • دور 2" : "Bldg B • Floor 2"}</span>
                </div>

                <div className="rounded-2xl bg-slate-50/90 p-3.5 border border-slate-200/70">
                  <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                    <Layers className="size-3 text-slate-400" />
                    {isAr ? "كود الوحدة والمساحة" : "Unit & Area"}
                  </span>
                  <p className="mt-1 text-xs font-black text-slate-900 font-mono">B-214</p>
                  <span className="text-[10px] text-slate-500 block font-medium">185 م² (1.42% حصة)</span>
                </div>

                <div className="rounded-2xl bg-slate-50/90 p-3.5 border border-slate-200/70">
                  <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                    <User className="size-3 text-slate-400" />
                    {isAr ? "المالك المسجل" : "Registered Member"}
                  </span>
                  <p className="mt-1 text-xs font-black text-slate-900">{isAr ? "أحمد محمد محمود" : "Ahmed Mohamed"}</p>
                  <span className="text-[10px] text-slate-500 block font-mono">MEM-90214</span>
                </div>

                <div className="rounded-2xl bg-slate-50/90 p-3.5 border border-slate-200/70">
                  <span className="flex items-center gap-1 text-[11px] font-bold text-slate-500">
                    <Calendar className="size-3 text-slate-400" />
                    {isAr ? "تاريخ الاستحقاق" : "Due Date"}
                  </span>
                  <p className="mt-1 text-xs font-black text-slate-900 font-mono">24-08-2026</p>
                  <span className="text-[10px] text-slate-500 block font-medium">{isAr ? "الفترة المالية 2026-Q3" : "Fiscal Q3-2026"}</span>
                </div>
              </div>

              {/* Assessment Breakdown Line */}
              <div className="mt-4.5 rounded-2xl border border-slate-200 bg-white p-4">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <div className="flex items-center gap-2">
                    <Tag className="size-4 text-[#1A3C2E]" />
                    <span className="font-bold text-slate-800">{isAr ? "بند المطالبة: رسوم إدارة وصيانة عامة مشتركة" : "Levy Item: Management & Common Area Maintenance"}</span>
                  </div>
                  <div className="flex items-baseline gap-2">
                    <span className="text-xs text-slate-500 font-semibold">{isAr ? "القيمة المحددة:" : "Assessed Amount:"}</span>
                    <span className="text-xl font-black text-slate-950 tabular-nums">25,000 ج.م</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Bridge Note to Next Section */}
            <div className="mt-6 pt-4 border-t border-slate-100 flex flex-wrap items-center justify-between gap-3 text-xs">
              <span className="text-slate-500 font-medium">
                {isAr
                  ? "تم تسجيل الحركة وربطها بهيكل العقار. الخطوة التالية: توليد السند وتحويل المبلغ إلى قيد مزدوج متوازن."
                  : "Event captured and linked to property hierarchy. Next step: Receipt issuance and double-entry GL conversion."}
              </span>
              <span className="font-bold text-[#1A3C2E] flex items-center gap-1">
                {isAr ? "المسار المحاسبي جاهز ←" : "Accounting Workflow Ready →"}
              </span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
