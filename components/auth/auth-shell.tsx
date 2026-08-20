import React from "react";
import Image from "next/image";
import { Building2, ShieldCheck } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { Locale } from "@/i18n/routing";

export interface AuthShellStat {
  value: string;
  label: string;
}

export interface AuthShellProps {
  brandName?: string;
  eyebrow?: string;
  title: string;
  subtitle?: string;
  panelTitle?: string;
  panelSubtitle?: string;
  stats?: AuthShellStat[];
  imageSrc?: string;
  locale?: string;
  children: React.ReactNode;
}

export function AuthShell({
  brandName = "AqarBooks",
  eyebrow,
  title,
  subtitle,
  panelTitle = "Real estate, beautifully under control.",
  panelSubtitle = "Track every unit, contract and financial ledger from a single place.",
  stats = [
    { value: "٢٫٤B+", label: "أصول مدارة" },
    { value: "١٠٠٪", label: "توازن قيود" },
    { value: "٩٩٫٩٪", label: "جاهزية SLA" },
  ],
  imageSrc = "/images/aqarbooks-hero.jpg",
  locale = "ar",
  children,
}: AuthShellProps) {
  const isAr = locale === "ar";

  return (
    <div
      className="marketing min-h-screen flex selection:bg-blue-100 selection:text-blue-900 bg-slate-50 text-slate-900"
      dir={isAr ? "rtl" : "ltr"}
    >
      {/* ── Visual Panel (Large Screens) ────────────────────────────────────────── */}
      <div className="relative hidden w-0 flex-1 lg:block border-s border-slate-200 bg-slate-950 overflow-hidden">
        
        {/* Cinematic Background Image with subtle Ken Burns ease */}
        <div className="absolute inset-0 transition-transform duration-1000 ease-out hover:scale-105">
          <Image
            src={imageSrc}
            alt={brandName}
            fill
            sizes="50vw"
            className="object-cover opacity-60 transition-transform duration-1000"
            priority
          />
        </div>

        {/* Ambient Dark Gradient Overlays */}
        <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/40 to-slate-950/20" />
        <div className="absolute inset-0 bg-gradient-to-r from-slate-950/60 via-transparent to-transparent rtl:bg-gradient-to-l" />

        {/* Panel Content Overlay */}
        <div className="absolute inset-0 flex flex-col justify-between p-12 lg:p-16 text-white z-10">
          
          {/* Top Brand Mark */}
          <Link href="/" locale={locale as Locale} className="inline-flex items-center gap-3 w-fit group">
            <div className="flex size-10 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md group-hover:bg-blue-500 transition-all">
              <Building2 className="size-5" />
            </div>
            <div>
              <span className="font-bold text-white text-xl tracking-tight block">
                {brandName}
              </span>
              <span className="text-[10px] text-blue-300 font-mono tracking-widest block font-semibold">
                FINANCE OS
              </span>
            </div>
          </Link>

          {/* Bottom Narrative & Stats */}
          <div className="space-y-6 max-w-lg">
            
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-500/20 border border-blue-400/30 text-blue-300 text-xs font-semibold">
              <ShieldCheck className="size-3.5" />
              <span>{isAr ? "المنظومة المالية المعتمدة للكيانات العقارية" : "Certified Financial Real Estate OS"}</span>
            </div>

            <h2 className="text-3xl font-extrabold tracking-tight sm:text-4xl lg:text-5xl leading-[1.2] text-white">
              {panelTitle}
            </h2>

            <p className="text-sm sm:text-base text-slate-300 font-normal leading-relaxed">
              {panelSubtitle}
            </p>

            {/* Metric Counters */}
            {stats.length > 0 && (
              <div className="pt-4 grid grid-cols-3 gap-4 border-t border-slate-800/80 text-xs">
                {stats.map((stat, idx) => (
                  <div key={idx} className="space-y-1">
                    <span className="text-2xl font-extrabold text-white font-mono block">
                      {stat.value}
                    </span>
                    <span className="text-slate-400 text-xs font-medium block">
                      {stat.label}
                    </span>
                  </div>
                ))}
              </div>
            )}

          </div>

        </div>
      </div>

      {/* ── Form Panel (Mobile & Desktop) ────────────────────────────────────── */}
      <div className="flex flex-1 flex-col justify-center px-4 py-12 sm:px-6 lg:flex-none lg:w-[500px] xl:w-[560px] bg-slate-50 relative z-20 overflow-y-auto">
        <div className="mx-auto w-full max-w-sm sm:max-w-md space-y-6">
          
          {/* Header on Form Panel */}
          <div className="space-y-2 text-start">
            
            {/* Mobile Brand Mark */}
            <div className="lg:hidden flex items-center gap-2.5 mb-4">
              <Link href="/" locale={locale as Locale} className="inline-flex items-center gap-2.5">
                <div className="flex size-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-xs">
                  <Building2 className="size-5" />
                </div>
                <div>
                  <span className="font-bold text-slate-900 text-lg tracking-tight block">
                    {brandName}
                  </span>
                  <span className="text-[9px] text-blue-600 font-mono tracking-wider font-semibold">
                    FINANCE OS
                  </span>
                </div>
              </Link>
            </div>

            {eyebrow && (
              <span className="text-xs font-bold text-blue-600 uppercase tracking-wider block">
                {eyebrow}
              </span>
            )}

            <h1 className="text-2xl sm:text-3xl font-extrabold text-slate-900 tracking-tight">
              {title}
            </h1>

            {subtitle && (
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                {subtitle}
              </p>
            )}

          </div>

          {/* Luxury Floating Card */}
          <div className="rounded-2xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-xs">
            {children}
          </div>

        </div>
      </div>

    </div>
  );
}
