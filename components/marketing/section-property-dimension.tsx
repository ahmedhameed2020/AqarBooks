import Image from "next/image";
import type { Locale } from "@/i18n/routing";
import { Building2, Layers, MapPin, User, ChevronRight, Hash, ArrowDown } from "lucide-react";

const HIERARCHY_STEPS = [
  { level: "01", nameAr: "المنظمة القابضة", nameEn: "Organization", code: "ORG-001", valAr: "مجموعة عقار القابضة", valEn: "Aqar Holding Group" },
  { level: "02", nameAr: "الكيان العقاري", nameEn: "Property Entity", code: "ENT-104", valAr: "بالم ريزيدنس (Palm Residence)", valEn: "Palm Residence Complex" },
  { level: "03", nameAr: "المنطقة / المرحلة", nameEn: "Zone / Phase", code: "ZON-A2", valAr: "القطاع الشرقي (East Zone)", valEn: "East Residential Zone" },
  { level: "04", nameAr: "المبنى / البرج", nameEn: "Building / Tower", code: "BLD-02", valAr: "المبنى B (Building B)", valEn: "Building B" },
  { level: "05", nameAr: "الدور", nameEn: "Floor", code: "FLR-02", valAr: "الطابق الثاني", valEn: "Second Floor" },
  { level: "06", nameAr: "الوحدة العقارية", nameEn: "Unit", code: "UNT-214", valAr: "شقة B-214 (185 م²)", valEn: "Apartment B-214 (185m²)" },
  { level: "07", nameAr: "المالك / العضو", nameEn: "Owner / Member", code: "MEM-90214", valAr: "أحمد محمد محمود", valEn: "Ahmed Mohamed" },
] as const;

export function SectionPropertyDimension({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";

  return (
    <section className="relative bg-[#F8F9FA] py-20 border-b border-slate-200/80">
      <div className="mx-auto max-w-7xl px-6">
        {/* Section Header */}
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 text-xs font-mono font-bold text-[#07425d] bg-[#07425d]/10 px-3 py-1 rounded-full border border-[#07425d]/20 mb-3">
            <span className="flex size-4 items-center justify-center rounded-full bg-[#07425d] text-[10px] text-white">03</span>
            <span>{isAr ? "الهيكل العقاري كبُعد مالي" : "PROPERTY AS A FINANCIAL DIMENSION"}</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-black text-slate-950 font-heading leading-tight">
            {isAr ? "المحاسبة التقليدية بتقول صرفت كام.. إحنا بنقول صرفت كام، وفي أي دور، وعلى أنهي شقة." : "Standard software tells you what was spent.. We tell you what was spent, on which floor, and for which unit."}
          </h2>

          <p className="mt-3.5 text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
            {isAr
              ? "تقدر تطلع تقرير مالي لمشروع كامل، أو تفصل مصروفات عمارة محددة، أو تراجع كشف حساب شقة واحدة بضغطة زر وبلا أي تشتت."
              : "Generate a consolidated report for the entire project, isolate a single building's expenses, or inspect one unit's sub-ledger in seconds."}
          </p>

          {/* Proof Points */}
          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-700">
            <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 border border-slate-200 shadow-2xs">
              {isAr ? "كيان" : "Entity"}
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 border border-slate-200 shadow-2xs">
              {isAr ? "منطقة" : "Zone"}
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 border border-slate-200 shadow-2xs">
              {isAr ? "مبنى" : "Building"}
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 border border-slate-200 shadow-2xs">
              {isAr ? "وحدة" : "Unit"}
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 border border-slate-200 shadow-2xs">
              {isAr ? "عميل" : "Member"}
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 border border-slate-200 shadow-2xs">
              {isAr ? "حساب" : "Account"}
            </span>
          </div>
        </div>

        {/* The Architectural Hierarchy Matrix */}
        <div className="mt-12 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left/Main Flow: Structured Architectural Dimension Steps */}
          <div className="lg:col-span-7 space-y-3">
            {HIERARCHY_STEPS.map((step, idx) => {
              const isTarget = idx === 5; // Unit B-214

              return (
                <div
                  key={step.level}
                  className={`rounded-2xl p-4 transition-all border flex items-center justify-between gap-4 ${
                    isTarget
                      ? "bg-white border-[#07425d] shadow-md ring-2 ring-[#07425d]/15"
                      : "bg-white/80 border-slate-200/90 hover:bg-white hover:border-slate-300 shadow-2xs"
                  }`}
                >
                  <div className="flex items-center gap-3.5">
                    <span className={`font-mono text-xs font-black size-7 rounded-xl flex items-center justify-center ${
                      isTarget ? "bg-[#07425d] text-white" : "bg-slate-100 text-slate-600"
                    }`}>
                      {step.level}
                    </span>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[11px] font-bold text-slate-400">
                          {isAr ? step.nameAr : step.nameEn}
                        </span>
                        <span className="font-mono text-[10px] text-slate-400">({step.code})</span>
                      </div>
                      <p className={`text-sm font-black mt-0.5 ${isTarget ? "text-[#1A3C2E]" : "text-slate-900"}`}>
                        {isAr ? step.valAr : step.valEn}
                      </p>
                    </div>
                  </div>

                  <div className="text-end">
                    <span className="text-[11px] font-mono font-bold text-slate-500 block">
                      {isTarget ? (isAr ? "مركز تكلفة مباشر" : "Direct Cost Center") : (isAr ? "بعد تجميعي" : "Roll-up Dim")}
                    </span>
                    {isTarget && (
                      <span className="inline-block mt-0.5 text-[10px] font-extrabold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                        {isAr ? "محور المعاملة" : "Target Transaction"}
                      </span>
                    )}
                  </div>
                </div>
              );
            })}
          </div>

          {/* Right: Architectural Visual Support */}
          <div className="lg:col-span-5 rounded-3xl overflow-hidden border border-slate-200 bg-white p-6 shadow-sm flex flex-col justify-between">
            <div className="relative aspect-[4/3] rounded-2xl overflow-hidden bg-slate-100 border border-slate-200/80">
              <Image
                src="/images/aqarbooks-building-hierarchy.jpg"
                alt={isAr ? "تفاصيل الواجهة والوحدات العقارية" : "Building Unit Facade Details"}
                fill
                sizes="(max-width: 1024px) 100vw, 40vw"
                className="object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-950/70 via-transparent to-transparent" />
              <div className="absolute bottom-4 start-4 end-4 text-white">
                <span className="text-[10px] font-mono font-bold uppercase text-emerald-400">STRUCTURAL RHYTHM</span>
                <p className="text-sm font-black font-heading mt-0.5">Building B — 48 Units</p>
              </div>
            </div>

            <div className="mt-5 space-y-3">
              <div className="rounded-xl bg-slate-50 p-3.5 border border-slate-200/70 text-xs">
                <span className="font-bold text-slate-800 block">{isAr ? "فصل محاسبي وقوائم مالية مستقلة" : "Isolated Cost-Center Ledgers"}</span>
                <p className="text-slate-600 mt-1 text-[11px] leading-relaxed">
                  {isAr
                    ? "يمكنك استخراج ميزان مراجعة وقائمة دخل للمنظمة ككل، أو لكيان عقاري مستقل، أو لمبنى محدد، أو كشف حساب مدقق لوحدة واحدة."
                    : "Generate Trial Balance and P&L for the entire holding, an isolated resort, a specific tower, or a single audited unit ledger."}
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
