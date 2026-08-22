import Image from "next/image";
import { LogoMark } from "@/components/marketing/logo-mark";
import { ShieldCheck, Coins, Building2, Sparkles, CheckCircle2 } from "lucide-react";

export function BrandPanel({ isAr, brandName }: { isAr: boolean; brandName: string }) {
  const highlights = [
    {
      icon: ShieldCheck,
      titleAr: "امتثال ضريبي وفاتورة إلكترونية",
      titleEn: "Tax & E-Invoicing Compliance",
      descAr: "متوافق مع هيئة الزكاة والضريبة (ZATCA) ومصلحة الضرائب المصرية (ETA)",
      descEn: "Fully compliant with ZATCA Phase 2 and ETA e-invoicing",
    },
    {
      icon: Coins,
      titleAr: "تعدد العملات والأنظمة المالية",
      titleEn: "Multi-Currency & Regional Standards",
      descAr: "دعم مالي متقدم لدول الخليج، مصر، والعملات العالمية",
      descEn: "Advanced support for GCC, Egypt, and global currencies",
    },
    {
      icon: Building2,
      titleAr: "محرك محاسبي مخصص للعقارات",
      titleEn: "Real Estate Financial Engine",
      descAr: "إدارة المشروعات، الأصول، المطالبات، والتقارير المالية اللحظية",
      descEn: "Project accounting, fixed assets, dues, & live ledger analytics",
    },
  ];

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-950 flex flex-col justify-between p-8 lg:p-12 xl:p-14 text-white select-none">
      {/* Background Image with subtle atmospheric overlay */}
      <Image
        src="/images/aqarbooks-hero.jpg"
        alt=""
        fill
        priority
        sizes="(min-width: 1024px) 40vw, 0px"
        className="object-cover opacity-25 mix-blend-luminosity scale-105 transition-transform duration-1000"
        style={{ objectPosition: "68% 50%" }}
      />

      {/* Decorative gradient scrims & glow */}
      <div
        aria-hidden="true"
        className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/80 to-slate-950/60"
      />
      <div
        aria-hidden="true"
        className="absolute -top-24 -start-24 size-96 rounded-full bg-blue-600/20 blur-3xl pointer-events-none"
      />
      <div
        aria-hidden="true"
        className="absolute -bottom-24 -end-24 size-96 rounded-full bg-indigo-600/20 blur-3xl pointer-events-none"
      />

      {/* Top Brand Header */}
      <div className="relative z-10 flex items-center gap-3">
        <LogoMark className="size-9 shadow-lg" />
        <span className="text-xl font-extrabold tracking-tight text-white drop-shadow-sm">
          {brandName}
        </span>
      </div>

      {/* Center / Bottom Value Proposition */}
      <div className="relative z-10 space-y-8 my-auto max-w-md">
        <div className="space-y-3">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-500/10 px-3 py-1 text-xs font-semibold text-blue-300 backdrop-blur-md">
            <Sparkles className="size-3.5 text-blue-400" />
            <span>{isAr ? "المنظومة المالية العقارية الأذكى" : "Smartest Real Estate ERP"}</span>
          </div>

          <h2 className="text-balance text-2xl xl:text-3xl font-extrabold leading-tight text-white">
            {isAr
              ? "عقاراتك واستثماراتك تستحق دفاتر بمستواها."
              : "Your properties and assets deserve books to match."}
          </h2>
        </div>

        {/* Feature badges list */}
        <div className="space-y-3.5 pt-2">
          {highlights.map((item, i) => {
            const Icon = item.icon;
            return (
              <div
                key={i}
                className="flex items-start gap-3.5 rounded-2xl border border-white/10 bg-white/5 p-3.5 backdrop-blur-md transition-all hover:border-white/20 hover:bg-white/10"
              >
                <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-blue-600/30 border border-blue-400/30 text-blue-300 shadow-xs">
                  <Icon className="size-4.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <h4 className="text-xs font-bold text-slate-100">
                    {isAr ? item.titleAr : item.titleEn}
                  </h4>
                  <p className="mt-0.5 text-[11px] leading-relaxed text-slate-400">
                    {isAr ? item.descAr : item.descEn}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Bottom Trust Stamp */}
      <div className="relative z-10 flex items-center justify-between border-t border-white/10 pt-4 text-[11px] text-slate-400">
        <div className="flex items-center gap-2">
          <CheckCircle2 className="size-4 text-emerald-400" />
          <span>{isAr ? "بيانات مشفرة ومؤمّنة سحابياً" : "Cloud Encrypted & Enterprise Ready"}</span>
        </div>
        <span className="font-mono text-slate-500">v2.0 · GCC & Egypt</span>
      </div>
    </div>
  );
}
