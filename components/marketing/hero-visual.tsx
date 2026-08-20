"use client";

import Image from "next/image";
import { ShieldCheck, CheckCircle2, Building, Scale, Receipt } from "lucide-react";

export function HeroVisual({ isAr }: { isAr: boolean }) {
  return (
    <div className="relative mx-auto w-full max-w-5xl">
      {/* Ambient background glow behind visual */}
      <div className="absolute -inset-4 bg-gradient-to-r from-blue-600/25 via-blue-600/20 to-blue-600/25 rounded-3xl blur-3xl -z-10 opacity-75" />

      {/* Main Container Card */}
      <div className="overflow-hidden rounded-2xl border border-[var(--mk-border-strong)] bg-[#070c1e] shadow-[0_25px_80px_-15px_rgba(0,0,0,0.9)] relative group">
        {/* Top Terminal Bar */}
        <div className="flex items-center justify-between border-b border-[var(--mk-border)] bg-[#0b1126]/90 px-4 py-3 backdrop-blur-md">
          <div className="flex items-center gap-2">
            <span className="size-3 rounded-full bg-rose-500/80" />
            <span className="size-3 rounded-full bg-amber-500/80" />
            <span className="size-3 rounded-full bg-emerald-500/80" />
            <span className="ms-2 text-xs font-mono font-bold text-slate-400">
              aqarbooks.com/{isAr ? "ar" : "en"}/accounting/ledger
            </span>
          </div>

          <div className="flex items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-950/80 px-3 py-1 font-mono text-[11px] font-bold text-emerald-300 border border-emerald-500/40">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
              {isAr ? "قيد مزدوج معتمد (Atomic Ledger)" : "Double-Entry Live"}
            </span>
          </div>
        </div>

        {/* Ultra-realistic visual asset */}
        <div className="relative aspect-[16/9] w-full min-h-[300px] sm:min-h-[460px]">
          <Image
            src="/images/aqarbooks-hero.jpg"
            alt="AqarBooks Real Estate & Property Accounting System"
            fill
            className="object-cover"
            priority
          />

          {/* Dark gradient overlay for bottom UI blend */}
          <div className="absolute inset-0 bg-gradient-to-t from-[#060a18] via-transparent to-transparent opacity-85" />

          {/* Floating Badge 1: Atomic Double Entry */}
          <div className="absolute top-6 start-6 animate-float-badge rounded-xl border border-blue-500/40 bg-[#0b1126]/90 p-3.5 shadow-2xl backdrop-blur-md hidden sm:flex items-center gap-3">
            <div className="size-9 rounded-lg bg-blue-950/80 border border-blue-500/40 flex items-center justify-center text-cyan-300 shadow-xs">
              <Scale className="size-4.5" />
            </div>
            <div>
              <p className="text-[11px] font-mono font-bold text-cyan-300">
                {isAr ? "توازن محاسبي ذري" : "Atomic Balance"}
              </p>
              <p className="text-xs font-extrabold text-white">
                {isAr ? "مدين = دائن (100% متوازن)" : "Debit = Credit (100%)"}
              </p>
            </div>
          </div>

          {/* Floating Badge 2: 5 Real Estate Entities */}
          <div className="absolute bottom-16 end-6 animate-float-badge-reverse rounded-xl border border-blue-500/40 bg-[#0b1126]/90 p-3.5 shadow-2xl backdrop-blur-md hidden sm:flex items-center gap-3">
            <div className="size-9 rounded-lg bg-blue-950/80 border border-blue-500/40 flex items-center justify-center text-blue-300 shadow-xs">
              <Building className="size-4.5" />
            </div>
            <div>
              <p className="text-[11px] font-mono font-bold text-blue-300">
                {isAr ? "مرونة هيكلية متكاملة" : "Entity Support"}
              </p>
              <p className="text-xs font-extrabold text-white">
                {isAr ? "5 أنواع كيانات عقارية" : "5 Real Estate Entities"}
              </p>
            </div>
          </div>

          {/* Floating Badge 3: Egyptian & Gulf Tax Compliant */}
          <div className="absolute top-6 end-6 rounded-xl border border-emerald-500/40 bg-[#0b1126]/90 p-3 shadow-2xl backdrop-blur-md hidden md:flex items-center gap-2.5">
            <div className="size-8 rounded-lg bg-emerald-950/80 border border-emerald-500/40 flex items-center justify-center text-emerald-300">
              <Receipt className="size-4" />
            </div>
            <div className="text-start">
              <p className="text-[10px] font-mono font-bold text-emerald-300">
                {isAr ? "مصر ودول الخليج" : "Egypt & GCC Ready"}
              </p>
              <p className="text-xs font-extrabold text-white">
                {isAr ? "VAT 14%/15% + ZATCA" : "VAT & ZATCA Ready"}
              </p>
            </div>
          </div>

          {/* Bottom Live System Capabilities Summary */}
          <div className="absolute bottom-4 start-4 end-4 rounded-xl border border-[var(--mk-border)] bg-[#070c1e]/92 p-3.5 backdrop-blur-md text-white shadow-xl">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 text-center font-mono text-xs">
              <div className="border-e border-slate-700/60 last:border-0 pe-2">
                <p className="text-[10px] text-slate-400">{isAr ? "هيكل المحاسبة" : "Accounting Engine"}</p>
                <p className="text-xs font-bold text-cyan-300 mt-0.5">{isAr ? "قيد مزدوج حقيقي" : "Double-Entry"}</p>
              </div>
              <div className="border-e border-slate-700/60 last:border-0 pe-2">
                <p className="text-[10px] text-slate-400">{isAr ? "الكيانات المدعومة" : "Entity Support"}</p>
                <p className="text-xs font-bold text-blue-300 mt-0.5">{isAr ? "5 أنواع عقارية" : "5 Entity Types"}</p>
              </div>
              <div className="border-e border-slate-700/60 last:border-0 pe-2">
                <p className="text-[10px] text-slate-400">{isAr ? "الضرائب المعتمدة" : "Tax Compliance"}</p>
                <p className="text-xs font-bold text-emerald-300 mt-0.5">{isAr ? "VAT & WHT & ZATCA" : "Egypt & GCC Tax"}</p>
              </div>
              <div>
                <p className="text-[10px] text-slate-400">{isAr ? "العملات المدعومة" : "Currencies"}</p>
                <p className="text-xs font-bold text-cyan-300 mt-0.5">EGP • SAR • AED • USD</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
