import Image from "next/image";
import { LogoMark } from "@/components/marketing/logo-mark";
import { ShieldCheck, Scale, Building2, CheckCircle2 } from "lucide-react";

export function BrandPanel({ isAr, brandName }: { isAr: boolean; brandName: string }) {
  const highlights = [
    {
      icon: Scale,
      titleAr: "كل حركة تنتهي بقيد حقيقي",
      titleEn: "Every movement ends in a true journal entry",
      descAr: "التحصيلات والمصروفات والتسويات تترحل إلى دفاتر متوازنة وقابلة للتتبع",
      descEn: "Collections, expenses, and settlements post to balanced, traceable ledgers",
      badgeColor: "bg-[#1b60b9]/20 border-[#1b60b9]/40 text-[#60a5fa]",
    },
    {
      icon: Building2,
      titleAr: "كل قيد يعرف عقاره ووحدته",
      titleEn: "Every entry knows its property and unit",
      descAr: "من الكيان والمبنى إلى الوحدة والعميل — السياق العقاري يظل جزءًا من الحركة",
      descEn: "From entity and building to unit and member — real estate context stays intact",
      badgeColor: "bg-[#7e1898]/20 border-[#7e1898]/40 text-purple-300",
    },
    {
      icon: ShieldCheck,
      titleAr: "الخطأ يتصحح. التاريخ ما يتمسحش.",
      titleEn: "Errors are corrected. History is never wiped.",
      descAr: "التصحيحات تتم بأثر موثق يحفظ الأصل ويجعل كل تغيير قابلًا للمراجعة",
      descEn: "Adjustments create an immutable trail preserving the original for transparent audit",
      badgeColor: "bg-[#1b60b9]/20 border-[#1b60b9]/40 text-[#60a5fa]",
    },
  ];

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#041c28] flex flex-col justify-between p-8 lg:p-12 xl:p-14 text-white select-none">
      {/* Background Image with subtle architectural overlay */}
      <Image
        src="/images/aqarbooks-hero-property.jpg"
        alt=""
        fill
        priority
        sizes="(min-width: 1024px) 40vw, 0px"
        className="object-cover opacity-15 mix-blend-luminosity scale-105 transition-transform duration-1000"
        style={{ objectPosition: "50% 50%" }}
      />

      {/* Decorative gradient scrims & architectural glow */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-[#041c28] via-[#07425d]/85 to-[#041c28]/90"
      />
      <div
        aria-hidden="true"
        className="absolute -top-24 -start-24 size-96 rounded-full bg-[#1b60b9]/20 blur-3xl pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-24 -end-24 size-96 rounded-full bg-[#7e1898]/15 blur-3xl pointer-events-none"
      />

      {/* Top Brand Header */}
      <div className="relative z-10 flex items-center gap-3">
        <LogoMark className="size-10 shadow-lg" />
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-xl font-extrabold tracking-tight text-white drop-shadow-sm font-heading">
              {brandName}
            </span>
            <span className="inline-flex rounded-md bg-[#1b60b9]/20 text-[#60a5fa] border border-[#1b60b9]/40 text-[9px] font-black px-1.5 py-0.2">
              ERP
            </span>
          </div>
          <span className="text-[10px] font-bold text-slate-300 -mt-0.5">
            {isAr ? "محاسبة عقارية بذكاء" : "Smart Real Estate Accounting"}
          </span>
        </div>
      </div>

      {/* Center Value Proposition */}
      <div className="relative z-10 space-y-7 my-auto max-w-md">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-sky-400/30 bg-sky-500/15 px-3 py-1 text-xs font-semibold text-sky-200 backdrop-blur-md">
            <Scale className="size-3.5 text-sky-300" />
            <span>{isAr ? "محاسبة بُنيت للعقار" : "Accounting Built for Real Estate"}</span>
          </div>

          <h2 className="text-balance text-2xl xl:text-3xl font-black leading-tight text-white font-heading">
            {isAr ? (
              <>
                العقار في مكانه. <br />
                والحسابات في دفاترها.
              </>
            ) : (
              <>
                Real estate in place. <br />
                Ledgers in order.
              </>
            )}
          </h2>
        </div>

        {/* Feature badges list */}
        <div className="space-y-3 pt-1">
          {highlights.map((item, i) => {
            const Icon = item.icon;
            return (
              <div
                key={i}
                className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md transition-all hover:border-sky-400/30 hover:bg-white/10"
              >
                <div className={`flex size-9 shrink-0 items-center justify-center rounded-xl border shadow-xs ${item.badgeColor}`}>
                  <Icon className="size-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h3 className="text-xs font-black text-slate-100 font-heading">
                    {isAr ? item.titleAr : item.titleEn}
                  </h3>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-300 font-medium">
                    {isAr ? item.descAr : item.descEn}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Trust Stamp */}
      <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-4 text-[11px] text-slate-300">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-sky-400 shrink-0" />
          <span>
            {isAr
              ? "عزل بيانات الكيانات · صلاحيات محكومة · سجل تدقيق كامل"
              : "Entity Data Isolation · Governed Permissions · Audit Trail"}
          </span>
        </div>
        <span className="font-mono text-[10px] text-slate-400 shrink-0 ms-2">
          RLS / AUDIT CORE
        </span>
      </div>
    </div>
  );
}
