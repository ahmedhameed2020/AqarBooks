import type { Locale } from "@/i18n/routing";
import {
  ArrowDown,
  ArrowRight,
  CheckCircle2,
  Receipt,
  FileText,
  BookOpen,
  BarChart3,
  ShieldCheck,
  Split,
  Building2,
  Wallet,
  Landmark,
  FileSpreadsheet,
} from "lucide-react";

export function SectionFollowMoney({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";

  return (
    <section id="follow-money" className="relative bg-white py-24 border-b border-slate-200/80">
      <div className="mx-auto max-w-7xl px-6">
        
        {/* Section Header */}
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 text-xs font-mono font-bold text-[#07425d] bg-[#07425d]/10 px-3 py-1 rounded-full border border-[#07425d]/20 mb-3">
            <span className="flex size-4 items-center justify-center rounded-full bg-[#07425d] text-[10px] text-white">04</span>
            <span>{isAr ? "مسار حركة الأموال" : "AUTOMATED FUND ROUTING"}</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-black text-slate-950 font-heading leading-tight">
            {isAr ? "الفلوس اللي بتدخل مش بتنزل في حصالة واحدة عشوائية." : "Money collected isn't pooled into a single opaque account."}
          </h2>

          <p className="mt-3.5 text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
            {isAr
              ? "لما الساكن أو المستأجر يدفع، النظام بيفصل تلقائيًا: جزء لمصاريف التشغيل، جزء لوديعة الصيانة في البنك، وجزء للضريبة — وكل مليم بيروح حسابه الدفتري السليم."
              : "When a resident pays, the system automatically routes: operational CAM share, capital reserve trust share, and output tax liability — no manual calculations."}
          </p>
        </div>

        {/* The Follow-the-Money Visual Architecture */}
        <div className="mt-14 space-y-6">
          
          {/* STAGE 1: Tenant Collection */}
          <div className="rounded-3xl border border-slate-200 bg-slate-50/70 p-6 sm:p-7">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="flex size-10 items-center justify-center rounded-xl bg-[#07425d] text-white shadow-xs">
                  <Wallet className="size-5" />
                </div>
                <div>
                  <span className="text-[10px] font-mono font-black text-slate-400 uppercase block">STAGE 01 · COLLECTION</span>
                  <h3 className="text-sm font-black text-slate-950">
                    {isAr ? "تحصيل مستحقات الوحدة السكنية B-04-0712" : "Unit B-04-0712 Settlement Collection"}
                  </h3>
                </div>
              </div>

              <div className="flex items-baseline gap-2 bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-2xs font-mono">
                <span className="text-xs text-slate-500 font-sans font-bold">{isAr ? "المبلغ المحصل:" : "Total Cash:"}</span>
                <span className="text-lg font-black text-[#07425d] tabular-nums">25,000.00 EGP</span>
              </div>
            </div>
          </div>

          {/* STAGE 2: Automated 3-Way Fund Split (The Key Differential) */}
          <div className="relative rounded-3xl border border-[#07425d]/20 bg-[#07425d]/[0.02] p-6 sm:p-8">
            <div className="flex items-center gap-2 text-xs font-mono font-black text-[#07425d] mb-4">
              <Split className="size-4" />
              <span>STAGE 02 · AUTOMATED ACCOUNTING SPLIT & DESTINATION ALLOCATION</span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              {/* Split 1: CAM Operating Fund */}
              <div className="rounded-2xl bg-white p-5 border border-slate-200/90 shadow-xs">
                <div className="flex items-center justify-between text-xs pb-2.5 border-b border-slate-100">
                  <span className="font-bold text-slate-900">{isAr ? "صندوق التشغيل والصيانة (CAM)" : "CAM Operating Fund"}</span>
                  <span className="text-[10px] font-mono bg-sky-50 text-[#07425d] px-2 py-0.5 rounded font-bold">70%</span>
                </div>
                <p className="mt-3 text-xl font-black text-slate-950 font-mono tabular-nums">17,500.00 <span className="text-xs font-normal font-sans text-slate-500">ج.م</span></p>
                <p className="mt-1.5 text-[11px] text-slate-500 font-medium leading-relaxed">
                  {isAr ? "مخصص لنظافة وأمن وصيانة وتشغيل مرافق المبنى الدورية." : "Allocated strictly for ongoing facility security, cleaning & utilities."}
                </p>
              </div>

              {/* Split 2: Reserve Sinking Fund */}
              <div className="rounded-2xl bg-white p-5 border border-slate-200/90 shadow-xs">
                <div className="flex items-center justify-between text-xs pb-2.5 border-b border-slate-100">
                  <span className="font-bold text-slate-900">{isAr ? "وديعة الصيانة الرأسمالية (Reserve)" : "Capital Sinking Reserve"}</span>
                  <span className="text-[10px] font-mono bg-emerald-50 text-emerald-800 px-2 py-0.5 rounded font-bold">20%</span>
                </div>
                <p className="mt-3 text-xl font-black text-slate-950 font-mono tabular-nums">5,000.00 <span className="text-xs font-normal font-sans text-slate-500">ج.م</span></p>
                <p className="mt-1.5 text-[11px] text-slate-500 font-medium leading-relaxed">
                  {isAr ? "محجوز بحساب بنكي معزول للإحلال والتجديد ورفع كفاءة الأصول." : "Ring-fenced in dedicated bank escrow for major asset replacements."}
                </p>
              </div>

              {/* Split 3: Output VAT Liability */}
              <div className="rounded-2xl bg-white p-5 border border-slate-200/90 shadow-xs">
                <div className="flex items-center justify-between text-xs pb-2.5 border-b border-slate-100">
                  <span className="font-bold text-slate-900">{isAr ? "ضريبة القيمة المضافة (VAT)" : "Output Tax Liability"}</span>
                  <span className="text-[10px] font-mono bg-amber-50 text-amber-800 px-2 py-0.5 rounded font-bold">10%</span>
                </div>
                <p className="mt-3 text-xl font-black text-slate-950 font-mono tabular-nums">2,500.00 <span className="text-xs font-normal font-sans text-slate-500">ج.م</span></p>
                <p className="mt-1.5 text-[11px] text-slate-500 font-medium leading-relaxed">
                  {isAr ? "مرحل لحساب التزامات مصلحة الضرائب المصرية (ETA/ZATCA)." : "Automatically routed to tax authorities payable liability account."}
                </p>
              </div>
            </div>
          </div>

          {/* STAGE 3 & 4: General Ledger & Financial Statements */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            
            {/* Vendor Settlement & General Ledger */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-sky-100 text-[#07425d]">
                  <BookOpen className="size-4.5" />
                </div>
                <div>
                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">STAGE 03 · GENERAL LEDGER</span>
                  <p className="text-xs font-black text-slate-900 font-heading">
                    {isAr ? "تسوية الموردين وتحديث الأستاذ العام" : "Vendor Settlement & GL Posting"}
                  </p>
                </div>
              </div>

              <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                POSTED ✓
              </span>
            </div>

            {/* Financial Statements */}
            <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-2xs flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex size-9 items-center justify-center rounded-xl bg-sky-100 text-[#07425d]">
                  <FileSpreadsheet className="size-4.5" />
                </div>
                <div>
                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">STAGE 04 · STATEMENTS</span>
                  <p className="text-xs font-black text-slate-900 font-heading">
                    {isAr ? "انعكاس فوري على الميزانية العمومية وقائمة الدخل" : "Real-Time P&L & Balance Sheet Sync"}
                  </p>
                </div>
              </div>

              <span className="font-mono text-xs font-bold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200">
                RECONCILED ✓
              </span>
            </div>

          </div>

        </div>
      </div>
    </section>
  );
}
