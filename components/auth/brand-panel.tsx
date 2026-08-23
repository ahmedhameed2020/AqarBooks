import Image from "next/image";
import { LogoMark } from "@/components/marketing/logo-mark";
import { ShieldCheck, Scale, Building2, CheckCircle2, Lock } from "lucide-react";

export function BrandPanel({ isAr, brandName }: { isAr: boolean; brandName: string }) {
  const highlights = [
    {
      icon: Scale,
      titleAr: "محرك محاسبة بقيد مزدوج حقيقي",
      titleEn: "True Double-Entry General Ledger",
      descAr: "دليل حسابات هرمي شجري وترحيل ذري فوري للقيود والسندات",
      descEn: "Hierarchical Chart of Accounts & atomic GL posting",
    },
    {
      icon: Building2,
      titleAr: "محاسبة متخصصة للكيانات العقارية",
      titleEn: "Specialized Real Estate Accounting",
      descAr: "ربط دقيق بين الكيان، المبنى، الدور، كود الوحدة، والمالك",
      descEn: "Seamless link between entity, tower, unit, and verified member",
    },
    {
      icon: ShieldCheck,
      titleAr: "امتثال ضريبي وسجل تدقيق غير قابل للحذف",
      titleEn: "Tax Engine & Immutable Audit Trail",
      descAr: "مطابقة ضريبة القيمة المضافة (14% VAT / WHT) مع قيود عكسية موثقة",
      descEn: "14% VAT / WHT compliance with documented reversing entries",
    },
  ];

  return (
    <div className="relative h-full w-full overflow-hidden bg-[#0e241c] flex flex-col justify-between p-8 lg:p-12 xl:p-14 text-white select-none">
      {/* Background Image with subtle architectural overlay */}
      <Image
        src="/images/aqarbooks-hero-property.jpg"
        alt=""
        fill
        priority
        sizes="(min-width: 1024px) 40vw, 0px"
        className="object-cover opacity-20 mix-blend-luminosity scale-105 transition-transform duration-1000"
        style={{ objectPosition: "50% 50%" }}
      />

      {/* Decorative gradient scrims & architectural glow */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-[#0e241c] via-[#0e241c]/80 to-[#0e241c]/60"
      />
      <div
        aria-hidden="true"
        className="absolute -top-24 -start-24 size-96 rounded-full bg-emerald-600/15 blur-3xl pointer-events-none"
      />

      {/* Top Brand Header */}
      <div className="relative z-10 flex items-center gap-3">
        <LogoMark className="size-9.5 shadow-lg" />
        <div className="flex flex-col">
          <div className="flex items-center gap-1.5">
            <span className="text-xl font-extrabold tracking-tight text-white drop-shadow-sm font-heading">
              {brandName}
            </span>
            <span className="inline-flex rounded-md bg-emerald-500/20 text-emerald-300 border border-emerald-400/30 text-[9px] font-black px-1.5 py-0.2">
              ERP
            </span>
          </div>
          <span className="text-[10px] font-bold text-emerald-200/80 -mt-0.5">
            {isAr ? "محاسبة عقارية بذكاء" : "Smart Real Estate Accounting"}
          </span>
        </div>
      </div>

      {/* Center Value Proposition */}
      <div className="relative z-10 space-y-7 my-auto max-w-md">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-500/30 bg-emerald-500/15 px-3 py-1 text-xs font-semibold text-emerald-200 backdrop-blur-md">
            <Scale className="size-3.5 text-emerald-300" />
            <span>{isAr ? "المحاسبة التي تفهم العقار" : "Accounting for Real Estate"}</span>
          </div>

          <h2 className="text-balance text-2xl xl:text-3xl font-black leading-tight text-white font-heading">
            {isAr
              ? "سجلاتك المالية العقارية بدقة متناهية وبراءة ذمة كاملة."
              : "Enterprise financial control built strictly around real estate."}
          </h2>
        </div>

        {/* Feature badges list */}
        <div className="space-y-3 pt-1">
          {highlights.map((item, i) => {
            const Icon = item.icon;
            return (
              <div
                key={i}
                className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md transition-all hover:border-emerald-400/30 hover:bg-white/10"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-emerald-500/20 border border-emerald-400/30 text-emerald-300 shadow-xs">
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
          <CheckCircle2 className="size-4 text-emerald-400" />
          <span>{isAr ? "عزل بيانات RLS وسجل تدقيق غير قابل للتلاعب" : "RLS Isolation & Immutable Ledger"}</span>
        </div>
        <span className="font-mono text-[10px] text-slate-400">SOC-2 / IFRS READY</span>
      </div>
    </div>
  );
}
