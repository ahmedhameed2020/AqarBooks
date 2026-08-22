"use client";

import { Sparkles, ShieldCheck, ArrowRight, ArrowLeft, Building2, CheckCircle2 } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export function CtaBanner({ isAr, locale }: { isAr: boolean; locale: Locale }) {
  const Arrow = isAr ? ArrowLeft : ArrowRight;

  return (
    <section className="relative py-28 px-6 border-t border-[var(--mk-border)] bg-gradient-to-b from-[#070c1e] to-[#040711] text-center overflow-hidden">
      
      {/* Radiant Glowing Mesh */}
      <div className="absolute top-1/2 start-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[400px] bg-gradient-to-r from-blue-600/20 via-purple-600/20 to-indigo-600/20 rounded-full blur-[160px] pointer-events-none" />

      <div className="relative z-10 mx-auto max-w-4xl space-y-8">
        
        {/* Badge */}
        <div className="inline-flex items-center gap-2 rounded-full border border-blue-400/30 bg-blue-950/60 px-4 py-1.5 text-xs font-bold text-blue-300 shadow-lg shadow-blue-900/30 backdrop-blur-md">
          <ShieldCheck className="size-4 text-blue-400" />
          <span>{isAr ? "جاهز للتشغيل والربط الفوري في مصر والخليج" : "Instant Setup across Egypt & GCC"}</span>
        </div>

        {/* Headline */}
        <h2 className="text-3xl sm:text-4xl lg:text-5xl font-black tracking-tight text-white leading-tight">
          {isAr ? (
            <>
              اجعل إدارة أموالك العقارية..{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 block sm:inline">
                أسهل، أوضح، وأكثر اطمئناناً
              </span>
            </>
          ) : (
            <>
              Real Estate Accounting,{" "}
              <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400 block sm:inline">
                Made Effortless and Precise
              </span>
            </>
          )}
        </h2>

        {/* Subtitle */}
        <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed font-normal">
          {isAr
            ? "انضم إلى الكيانات والصناديق والمجموعات العقارية التي اعتمدت على AqarBooks لضبط القيود، متابعة الإيجارات، وتصدير التقارير المالية المعتمدة."
            : "Join hundreds of real estate leaders and fund managers relying on AqarBooks to govern daily collections and financial reports with peace of mind."}
        </p>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
          <Link
            href="/demo"
            locale={locale}
            className="inline-flex items-center gap-2 px-8 py-4 rounded-2xl bg-gradient-to-r from-blue-600 via-indigo-600 to-purple-600 hover:from-blue-500 hover:to-purple-500 text-white font-bold text-sm shadow-xl shadow-blue-600/30 transition-all active:scale-95 cursor-pointer"
          >
            <span>{isAr ? "احجز عرضك التوضيحي الحي" : "Request Live Interactive Demo"}</span>
            <Arrow className="size-4" />
          </Link>

          <Link
            href="/contact"
            locale={locale}
            className="inline-flex items-center gap-2 px-7 py-4 rounded-2xl border border-white/10 bg-slate-900/80 hover:bg-slate-800 text-slate-200 hover:text-white font-bold text-sm transition-all cursor-pointer"
          >
            <span>{isAr ? "تحدث مع مستشارنا المالي" : "Speak with Financial Advisor"}</span>
          </Link>
        </div>

        {/* Trust Badges Footer */}
        <div className="pt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-400">
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-emerald-400" />
            {isAr ? "بدون بطاقة ائتمانية للبدء" : "No credit card required"}
          </span>
          <span>•</span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-blue-400" />
            {isAr ? "تهيئة مجانية لدليل الحسابات" : "Free COA onboarding"}
          </span>
          <span>•</span>
          <span className="flex items-center gap-1.5">
            <CheckCircle2 className="size-3.5 text-purple-400" />
            {isAr ? "متوافق 100% مع الضرائب الإقليمية" : "100% Regional Tax Compliant"}
          </span>
        </div>

      </div>

    </section>
  );
}
