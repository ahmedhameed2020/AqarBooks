"use client";

import React from "react";
import Image from "next/image";
import { 
  Building2, 
  ShieldCheck, 
  ArrowRight, 
  ArrowLeft, 
  Languages, 
  CheckCircle2, 
  Sparkles,
  Layers
} from "lucide-react";
import { Link, usePathname } from "@/i18n/navigation";
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
  const pathname = usePathname();
  const alternateLocale: Locale = isAr ? "en" : "ar";
  const BackIcon = isAr ? ArrowLeft : ArrowRight;

  return (
    <div
      className="min-h-screen flex selection:bg-blue-600 selection:text-white bg-slate-900 font-sans"
      dir={isAr ? "rtl" : "ltr"}
    >
      {/* ── Visual Panel (Large Screens) ────────────────────────────────────────── */}
      <div className="relative hidden w-0 flex-1 lg:flex flex-col justify-between overflow-hidden bg-[#070d1e] border-e border-slate-800/80">
        
        {/* Background Image with Cinematic Blend */}
        <div className="absolute inset-0 z-0">
          <Image
            src={imageSrc}
            alt={brandName}
            fill
            sizes="50vw"
            className="object-cover opacity-25 mix-blend-luminosity scale-105 transition-transform duration-1000 ease-out"
            priority
          />
          {/* Ambient Lighting & Gradients */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#070d1e] via-[#070d1e]/85 to-[#070d1e]/50" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(59,130,246,0.18),transparent_50%)]" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_bottom_left,rgba(99,102,241,0.15),transparent_50%)]" />
          {/* Tech Grid Mask */}
          <div className="absolute inset-0 bg-[linear-gradient(to_right,rgba(255,255,255,0.03)_1px,transparent_1px),linear-gradient(to_bottom,rgba(255,255,255,0.03)_1px,transparent_1px)] bg-[size:3.5rem_3.5rem] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_40%,#000_70%,transparent_100%)] opacity-60" />
        </div>

        {/* Top Bar on Visual Panel */}
        <div className="relative z-10 p-8 lg:p-12 flex items-center justify-between">
          <Link href="/" locale={locale as Locale} className="inline-flex items-center gap-3.5 group">
            <div className="flex size-11 items-center justify-center rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/25 ring-1 ring-white/20 group-hover:scale-105 transition-all">
              <Building2 className="size-6 text-white" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-white text-xl tracking-tight">
                  {brandName}
                </span>
                <span className="px-1.5 py-0.5 rounded text-[10px] font-bold bg-blue-500/20 text-blue-300 border border-blue-400/20">
                  FINANCE
                </span>
              </div>
              <span className="text-[10px] text-slate-400 font-mono tracking-widest block font-medium">
                ENTERPRISE REAL ESTATE OS
              </span>
            </div>
          </Link>

          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-slate-800/80 backdrop-blur-md border border-slate-700/60 text-slate-300 text-xs font-medium">
            <ShieldCheck className="size-3.5 text-blue-400" />
            <span>{isAr ? "نظام مالي معتمد ومعزول" : "Certified & Isolated OS"}</span>
          </div>
        </div>

        {/* Middle Interactive Floating Mockup */}
        <div className="relative z-10 px-8 lg:px-12 max-w-xl mx-auto w-full my-auto py-6">
          <div className="rounded-2xl border border-white/10 bg-slate-900/70 backdrop-blur-xl p-5 shadow-2xl shadow-black/50 space-y-4 hover:border-blue-500/30 transition-all">
            
            {/* Header of Glass Card */}
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                <span className="text-xs font-mono font-bold text-slate-200">
                  #JV-2026-8941
                </span>
                <span className="rounded bg-blue-500/10 px-2 py-0.5 text-[11px] font-semibold text-blue-400 border border-blue-500/20">
                  {isAr ? "قيد استحقاق صيانة" : "Maintenance Accrual"}
                </span>
              </div>
              <div className="flex items-center gap-1.5 text-[11px] font-medium text-emerald-400">
                <CheckCircle2 className="size-3.5" />
                <span>{isAr ? "مرحّل ومطابق" : "Balanced"}</span>
              </div>
            </div>

            {/* Simulated Double Entry */}
            <div className="space-y-2 text-xs">
              <div className="flex items-center justify-between rounded-lg bg-white/[0.03] p-2.5 border border-white/5 font-mono">
                <span className="text-slate-300 text-[11px]">
                  {isAr ? "من حـ/ مدينو الإيجارات (1102)" : "Dr. Rent Receivables"}
                </span>
                <span className="font-bold text-slate-100 font-mono">SAR 85,000.00</span>
              </div>
              <div className="flex items-center justify-between rounded-lg bg-white/[0.03] p-2.5 border border-white/5 font-mono">
                <span className="text-slate-400 text-[11px]">
                  {isAr ? "إلى حـ/ إيراد عقارات وأبراج (4101)" : "Cr. Real Estate Revenue"}
                </span>
                <span className="font-bold text-blue-400 font-mono">SAR 85,000.00</span>
              </div>
            </div>

            {/* Supported Sectors Tags */}
            <div className="pt-2 flex flex-wrap items-center gap-1.5 text-[11px]">
              <span className="text-slate-400 flex items-center gap-1 text-[10px] me-1">
                <Layers className="size-3" />
                {isAr ? "الأنشطة المدعومة:" : "Entities:"}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700/50">
                {isAr ? "أبراج سكنية" : "Towers"}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700/50">
                {isAr ? "منتجعات ومولات" : "Resorts & Malls"}
              </span>
              <span className="px-2 py-0.5 rounded-full bg-slate-800/80 text-slate-300 border border-slate-700/50">
                {isAr ? "صناديق عقارية" : "REITs"}
              </span>
            </div>

          </div>
        </div>

        {/* Bottom Narrative & Institutional Metrics */}
        <div className="relative z-10 p-8 lg:p-12 space-y-6 max-w-2xl">
          <div className="space-y-3">
            <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-white leading-snug">
              {panelTitle}
            </h2>
            <p className="text-sm text-slate-400 leading-relaxed max-w-lg">
              {panelSubtitle}
            </p>
          </div>

          {/* Metric Stats Cards */}
          {stats.length > 0 && (
            <div className="grid grid-cols-3 gap-3 pt-2">
              {stats.map((stat, idx) => (
                <div 
                  key={idx} 
                  className="rounded-xl border border-white/10 bg-slate-900/60 backdrop-blur-md p-3.5 space-y-1 hover:bg-slate-900/80 transition-colors"
                >
                  <span className="text-xl lg:text-2xl font-black text-white font-mono tracking-tight block">
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

      {/* ── Form Panel (Light / Centered / Ultra-clean) ────────────────────────── */}
      <div className="flex flex-1 flex-col justify-between px-4 py-8 sm:px-8 lg:px-12 lg:flex-none lg:w-[540px] xl:w-[580px] bg-slate-950 text-slate-100 relative z-20 overflow-y-auto">
        
        {/* Top Utility Nav (Language Switcher & Home link) */}
        <div className="flex items-center justify-between pb-6 sm:pb-8">
          <Link
            href="/"
            locale={locale as Locale}
            className="inline-flex items-center gap-2 text-xs font-semibold text-slate-400 hover:text-white transition-colors group"
          >
            <BackIcon className="size-3.5 group-hover:-translate-x-0.5 rtl:group-hover:translate-x-0.5 transition-transform" />
            <span>{isAr ? "الرئيسية" : "Home"}</span>
          </Link>

          <div className="flex items-center gap-2">
            <Link
              href={pathname}
              locale={alternateLocale}
              className="inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border border-slate-800 bg-slate-900 text-xs font-medium text-slate-300 hover:text-white hover:border-slate-700 transition-all"
            >
              <Languages className="size-3.5 text-blue-400" />
              <span>{isAr ? "English" : "العربية"}</span>
            </Link>
          </div>
        </div>

        {/* Form Container */}
        <div className="my-auto mx-auto w-full max-w-md space-y-6">
          
          {/* Mobile Branding */}
          <div className="lg:hidden flex items-center gap-3 pb-2">
            <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white shadow-md">
              <Building2 className="size-5" />
            </div>
            <div>
              <span className="font-extrabold text-white text-lg tracking-tight block">
                {brandName}
              </span>
              <span className="text-[9px] text-blue-400 font-mono tracking-wider font-semibold">
                FINANCE OS
              </span>
            </div>
          </div>

          {/* Heading */}
          <div className="space-y-2 text-start">
            {eyebrow && (
              <div className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-blue-500/10 border border-blue-500/20 text-blue-400 text-xs font-semibold">
                <Sparkles className="size-3" />
                <span>{eyebrow}</span>
              </div>
            )}

            <h1 className="text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
              {title}
            </h1>

            {subtitle && (
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed font-normal">
                {subtitle}
              </p>
            )}
          </div>

          {/* Elevated Form Card */}
          <div className="rounded-2xl border border-slate-800 bg-slate-900/90 p-6 sm:p-7 shadow-xl shadow-black/40 backdrop-blur-md">
            {children}
          </div>

        </div>

        {/* Footer Security Badges */}
        <div className="pt-6 sm:pt-8 text-center text-slate-500 text-[11px] space-y-2">
          <div className="flex items-center justify-center gap-4 text-slate-400">
            <span className="flex items-center gap-1">
              <ShieldCheck className="size-3 text-blue-400" />
              {isAr ? "تشفير بيانات 256-bit" : "256-bit Encrypted"}
            </span>
            <span>•</span>
            <span>{isAr ? "متوافق مع ZATCA" : "ZATCA Compliant"}</span>
            <span>•</span>
            <span>{isAr ? "عزل مالي RLS" : "Multi-Tenant RLS"}</span>
          </div>
          <p className="text-slate-600">
            © {new Date().getFullYear()} {brandName} Finance OS. {isAr ? "جميع الحقوق محفوظة." : "All rights reserved."}
          </p>
        </div>

      </div>

    </div>
  );
}
