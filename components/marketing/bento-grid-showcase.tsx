"use client";

import { useState } from "react";
import { 
  Scale, 
  Receipt, 
  Users, 
  ShieldCheck, 
  Layers, 
  ArrowUpRight, 
  Sparkles, 
  FileSpreadsheet,
  CheckCircle2,
  Clock,
  QrCode,
  Building,
  TrendingUp,
  Percent
} from "lucide-react";

export function BentoGridShowcase({ isAr }: { isAr: boolean }) {
  const [activeTab, setActiveTab] = useState<"egypt" | "saudi" | "uae">("saudi");

  return (
    <section id="features" className="relative py-28 px-6 border-t border-[var(--mk-border)] bg-[#070c1e] overflow-hidden">
      
      {/* Ambient background glows */}
      <div className="absolute top-1/4 start-1/2 -translate-x-1/2 w-[800px] h-[400px] bg-blue-600/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute bottom-10 start-10 w-[500px] h-[300px] bg-purple-600/10 rounded-full blur-[120px] pointer-events-none" />

      <div className="mx-auto max-w-6xl relative z-10">
        
        {/* Section Header */}
        <div className="text-center max-w-3xl mx-auto mb-16 space-y-4">
          <div className="inline-flex items-center gap-2 rounded-full border border-purple-500/30 bg-purple-950/40 px-4 py-1.5 text-xs font-bold text-purple-300 shadow-[0_0_20px_-4px_rgba(139,92,246,0.4)]">
            <Sparkles className="size-3.5 text-purple-400" />
            <span>{isAr ? "قدرات محاسبية صُممت لواقع العقار" : "Purpose-Built Real Estate ERP"}</span>
          </div>
          
          <h2 className="text-3xl sm:text-4xl lg:text-5xl font-extrabold tracking-tight text-white leading-[1.2]">
            {isAr ? (
              <>
                كل ما تحتاجه لإدارة أموالك..{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400">
                  بدون تعقيد وبدقة لا تقبل الخطأ
                </span>
              </>
            ) : (
              <>
                Engineered for Clarity,{" "}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-indigo-300 to-purple-400">
                  Built for Absolute Balance
                </span>
              </>
            )}
          </h2>
          
          <p className="text-sm sm:text-base text-slate-300 max-w-2xl mx-auto leading-relaxed font-normal">
            {isAr
              ? "ودّع فوضى الجداول والبرامج المنفصلة. منظومة واحدة تربط عقودك، أقساطك، كشوف حسابات الملاك، والضرائب بدليل محاسبي متزن."
              : "Say goodbye to disjointed spreadsheets. One unified platform connecting contracts, dues, owner statements, and tax compliance with balanced double-entry precision."}
          </p>
        </div>

        {/* 21st.dev Style Bento Grid */}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-6">
          
          {/* Bento Card 1: Double-Entry Live Engine (Spans 8 cols) */}
          <div className="md:col-span-8 rounded-3xl border border-white/10 bg-slate-900/80 backdrop-blur-xl p-6 sm:p-8 shadow-2xl relative overflow-hidden group hover:border-blue-500/40 transition-all">
            <div className="flex items-center justify-between pb-6">
              <div className="flex items-center gap-3">
                <div className="size-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 flex items-center justify-center text-white shadow-lg shadow-blue-600/30">
                  <Scale className="size-6" />
                </div>
                <div>
                  <h3 className="text-lg sm:text-xl font-bold text-white">
                    {isAr ? "محرك القيد المزدوج الذري" : "Atomic Double-Entry Engine"}
                  </h3>
                  <p className="text-xs text-slate-400">
                    {isAr ? "دليل حسابات شجري هرمي متزن تلقائياً" : "Hierarchical Auto-Balanced Chart of Accounts"}
                  </p>
                </div>
              </div>
              <span className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-bold font-mono">
                <CheckCircle2 className="size-3.5" />
                {isAr ? "مدين = دائن 100%" : "Debit = Credit"}
              </span>
            </div>

            {/* Interactive Live Journal Preview */}
            <div className="rounded-2xl border border-white/5 bg-[#050915]/90 p-4 sm:p-5 space-y-3 font-mono text-xs shadow-inner">
              <div className="flex items-center justify-between text-slate-400 border-b border-white/5 pb-2 text-[11px]">
                <span>{isAr ? "رقم القيد: #JV-2026-9042" : "Ref: #JV-2026-9042"}</span>
                <span className="text-blue-400">{isAr ? "استحقاق صيانة سنوية" : "Annual Dues Accrual"}</span>
              </div>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                  <span className="text-slate-400 text-[10px] block">{isAr ? "الجانب المدين (Debit)" : "Debit Account"}</span>
                  <p className="text-white font-bold text-xs">{isAr ? "1102 - ذمم ملاك برج النخيل" : "1102 - Palm Tower Receivables"}</p>
                  <p className="text-emerald-400 font-bold text-sm pt-1">SAR 120,000.00</p>
                </div>
                <div className="p-3 rounded-xl bg-white/[0.02] border border-white/5 space-y-1">
                  <span className="text-slate-400 text-[10px] block">{isAr ? "الجانب الدائن (Credit)" : "Credit Account"}</span>
                  <p className="text-white font-bold text-xs">{isAr ? "4102 - إيرادات خدمات وصيانة" : "4102 - Maintenance Revenue"}</p>
                  <p className="text-blue-400 font-bold text-sm pt-1">SAR 120,000.00</p>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 text-[11px] text-slate-400">
                <span className="text-slate-500">{isAr ? "الترحيل الذري يمنع حفظ أي قيد غير متوازن" : "Atomic posting rejects unbalanced records"}</span>
                <span className="text-emerald-400 font-bold">{isAr ? "تم الترحيل ✓" : "Posted ✓"}</span>
              </div>
            </div>

            <p className="pt-4 text-xs text-slate-400 leading-relaxed font-normal">
              {isAr
                ? "يتم ترحيل كافة الإيجارات، المطالبات، والتحصيلات تلقائياً إلى قيود يومية متوازنة، مع منع التعديل اليدوي العشوائي لضمان سجل تدقيق محاسبي غير قابل للتلاعب."
                : "Every lease, fee, and receipt maps automatically into balanced journal entries with zero arbitrary overwrites, ensuring bulletproof audit logs."}
            </p>
          </div>

          {/* Bento Card 2: Regional Tax & ZATCA (Spans 4 cols) */}
          <div className="md:col-span-4 rounded-3xl border border-white/10 bg-slate-900/80 backdrop-blur-xl p-6 sm:p-8 shadow-2xl flex flex-col justify-between hover:border-purple-500/40 transition-all">
            <div className="space-y-4">
              <div className="size-11 rounded-2xl bg-gradient-to-tr from-purple-600 to-pink-600 flex items-center justify-center text-white shadow-lg shadow-purple-600/30">
                <Receipt className="size-6" />
              </div>
              
              <div>
                <h3 className="text-lg font-bold text-white">
                  {isAr ? "الضرائب والفوترة الإلكترونية" : "Tax & e-Invoicing"}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {isAr ? "جاهزية فورية لمنظومة ZATCA ومصر" : "ZATCA Phase 2 & Egyptian VAT/WHT"}
                </p>
              </div>

              {/* Country Tax Selector */}
              <div className="flex gap-1.5 p-1 rounded-xl bg-black/40 border border-white/5 text-[11px] font-bold">
                <button
                  type="button"
                  onClick={() => setActiveTab("saudi")}
                  className={`flex-1 py-1 rounded-lg transition-all ${
                    activeTab === "saudi" ? "bg-purple-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {isAr ? "السعودية (15%)" : "KSA (15%)"}
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab("egypt")}
                  className={`flex-1 py-1 rounded-lg transition-all ${
                    activeTab === "egypt" ? "bg-purple-600 text-white shadow-xs" : "text-slate-400 hover:text-white"
                  }`}
                >
                  {isAr ? "مصر (14%)" : "Egypt (14%)"}
                </button>
              </div>

              {/* Tax Badge Preview */}
              <div className="p-3.5 rounded-2xl bg-[#050915]/90 border border-white/5 space-y-2 text-xs font-mono">
                <div className="flex items-center justify-between text-slate-300">
                  <span>{activeTab === "saudi" ? "ضريبة القيمة المضافة" : "ضريبة ق.م + خصم أ.ت"}</span>
                  <span className="text-purple-400 font-bold">{activeTab === "saudi" ? "VAT 15%" : "VAT 14% / WHT 1%"}</span>
                </div>
                <div className="flex items-center gap-2 pt-1">
                  <QrCode className="size-8 text-slate-300 shrink-0" />
                  <span className="text-[10px] text-slate-400 leading-tight">
                    {activeTab === "saudi"
                      ? "رمز استجابة ZATCA مشفر ومعتمد بصيغة XML/PDF"
                      : "فواتير إلكترونية متوافقة مع مصلحة الضرائب المصرية"}
                  </span>
                </div>
              </div>
            </div>

            <p className="pt-4 text-xs text-slate-400 leading-relaxed font-normal">
              {isAr ? "توليد تلقائي للإقرارات الضريبية بدون الحاجة لحسابات يدوية معقدة." : "Automated tax returns and compliant invoices without manual calculations."}
            </p>
          </div>

          {/* Bento Card 3: HOA & Mollak Pro-Rata Allocation (Spans 4 cols) */}
          <div className="md:col-span-4 rounded-3xl border border-white/10 bg-slate-900/80 backdrop-blur-xl p-6 sm:p-8 shadow-2xl flex flex-col justify-between hover:border-emerald-500/40 transition-all">
            <div className="space-y-4">
              <div className="size-11 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-600 flex items-center justify-center text-white shadow-lg shadow-emerald-600/30">
                <Users className="size-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  {isAr ? "اتحادات الملاك والشاغلين" : "HOA & Community Portfolios"}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {isAr ? "توزيع المصروفات حسب نسب الملكية" : "Pro-rata area expense distribution"}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#050915]/90 border border-white/5 space-y-2 text-xs">
                <div className="flex justify-between items-center text-slate-300">
                  <span>{isAr ? "حراسة وصيانة مشتركة" : "Common Utilities"}</span>
                  <span className="font-mono text-emerald-400 font-bold">SAR 45,000</span>
                </div>
                <div className="w-full bg-slate-800 rounded-full h-2 overflow-hidden flex">
                  <div className="bg-emerald-500 h-full w-[45%]" title="الوحدات الكبيرة (45%)" />
                  <div className="bg-blue-500 h-full w-[35%]" title="الوحدات المتوسطة (35%)" />
                  <div className="bg-purple-500 h-full w-[20%]" title="الوحدات الصغيرة (20%)" />
                </div>
                <p className="text-[10px] text-slate-400">
                  {isAr ? "توزيع نسبي عادل بنقرة واحدة وفق مساحة كل وحدة" : "Fair pro-rata distribution according to unit area"}
                </p>
              </div>
            </div>

            <p className="pt-4 text-xs text-slate-400 leading-relaxed font-normal">
              {isAr ? "إصدار تقارير الجمعيات العمومية وكشوف مديونيات الأعضاء فورياً." : "Instant AGM financial packets and member aging statements."}
            </p>
          </div>

          {/* Bento Card 4: Cashbox & Treasury Governance (Spans 4 cols) */}
          <div className="md:col-span-4 rounded-3xl border border-white/10 bg-slate-900/80 backdrop-blur-xl p-6 sm:p-8 shadow-2xl flex flex-col justify-between hover:border-amber-500/40 transition-all">
            <div className="space-y-4">
              <div className="size-11 rounded-2xl bg-gradient-to-tr from-amber-600 to-orange-600 flex items-center justify-center text-white shadow-lg shadow-amber-600/30">
                <Layers className="size-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  {isAr ? "الخزينة وجلسات الكاشير" : "Cashbox & Treasury"}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {isAr ? "إقفال منضبط وتسوية فروق تلقائية" : "Zero-leakage session controls"}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#050915]/90 border border-white/5 space-y-2 text-xs font-mono">
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">{isAr ? "عهدة الافتتاح:" : "Opening Float:"}</span>
                  <span className="text-white font-bold">EGP 5,000.00</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-slate-400">{isAr ? "التحصيل الفعلي:" : "Collected:"}</span>
                  <span className="text-emerald-400 font-bold">EGP 82,400.00</span>
                </div>
                <div className="flex justify-between items-center border-t border-white/5 pt-1.5 text-slate-300">
                  <span>{isAr ? "فارق الإقفال:" : "Closing Variance:"}</span>
                  <span className="text-amber-400 font-bold">0.00 (متطابق ✓)</span>
                </div>
              </div>
            </div>

            <p className="pt-4 text-xs text-slate-400 leading-relaxed font-normal">
              {isAr ? "منع خلط الصناديق مع تسجيل أي فروق في حساب تدقيق مستقل." : "Prevents mixed cashboxes and routes variances to separate audit accounts."}
            </p>
          </div>

          {/* Bento Card 5: Bank & Cheque Lifecycle (Spans 4 cols) */}
          <div className="md:col-span-4 rounded-3xl border border-white/10 bg-slate-900/80 backdrop-blur-xl p-6 sm:p-8 shadow-2xl flex flex-col justify-between hover:border-cyan-500/40 transition-all">
            <div className="space-y-4">
              <div className="size-11 rounded-2xl bg-gradient-to-tr from-cyan-600 to-blue-600 flex items-center justify-center text-white shadow-lg shadow-cyan-600/30">
                <Clock className="size-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">
                  {isAr ? "دورة حياة الشيكات والبنوك" : "Cheque & Bank Lifecycle"}
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  {isAr ? "تتبع دقيق من الاستلام حتى المقاصة" : "From receipt to final clearance"}
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-[#050915]/90 border border-white/5 space-y-2 text-xs">
                <div className="flex items-center gap-2">
                  <span className="size-2 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-slate-200 font-mono text-[11px]">{isAr ? "شيك رقم: #CHK-89201" : "#CHK-89201"}</span>
                </div>
                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1">
                  <span className="px-2 py-0.5 rounded bg-blue-500/10 text-blue-400 border border-blue-500/20">{isAr ? "تحت التحصيل" : "In Clearing"}</span>
                  <span className="font-mono text-white font-bold">AED 60,000</span>
                </div>
              </div>
            </div>

            <p className="pt-4 text-xs text-slate-400 leading-relaxed font-normal">
              {isAr ? "إدارة كاملة لحافظات الشيكات مع تنبيهات مسبقة بمواعيد الاستحقاق." : "Full custody management with proactive maturity alerts."}
            </p>
          </div>

        </div>

      </div>

    </section>
  );
}
