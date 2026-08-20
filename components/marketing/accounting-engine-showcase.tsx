"use client";

import { useState } from "react";
import Image from "next/image";
import { Calculator, FileCheck, ShieldAlert, Sparkles, Receipt, Split, Check } from "lucide-react";
import { Reveal } from "@/components/marketing/reveal";

export function AccountingEngineShowcase({ isAr }: { isAr: boolean }) {
  const [activeFeature, setActiveFeature] = useState<"ledger" | "cashier">("ledger");

  return (
    <section id="accounting-engine" className="relative py-24 px-6 border-t border-[var(--mk-border)] bg-[#060a18]">
      <div className="mx-auto max-w-6xl">
        {/* Section Header */}
        <Reveal className="text-center max-w-3xl mx-auto mb-16">
          <div className="inline-flex items-center gap-2 rounded-full border border-blue-500/30 bg-blue-950/40 px-4 py-1.5 text-xs font-bold text-blue-300 mb-4 shadow-[0_0_20px_-4px_rgba(59,130,246,0.5)]">
            <Calculator className="size-3.5 text-blue-400" />
            <span>{isAr ? "المحرك المحاسبي المعتمد لمصر والخليج" : "Egypt & GCC Enterprise Accounting Engine"}</span>
          </div>
          <h2 className="text-3xl font-extrabold tracking-tight text-white sm:text-4xl">
            {isAr ? (
              <>
                محاسبة حقيقية بقيد مزدوج <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-300 to-cyan-400">ومتوافقة مع الضرائب والفوترة الإلكترونية</span>
              </>
            ) : (
              <>
                True Double-Entry Ledger <span className="text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-cyan-300 to-cyan-400">& Tax / e-Invoicing Compliant</span>
              </>
            )}
          </h2>
          <p className="mt-4 text-base text-slate-400 leading-relaxed font-normal">
            {isAr
              ? "ليس مجرد جدول تحصيل سطحي. يقوم عقار بوكس على محرك محاسبة عامة متكامل: قيود متوازنة، شجرة حسابات هرمية، احتساب ضريبة القيمة المضافة (14% لمصر / 15% للسعودية)، ضرائب الخصم والتحصيل WHT، وجاهزية الفوترة الإلكترونية ZATCA."
              : "Not just a billing sheet. AqarBooks runs on a full general ledger engine: balanced journal entries, hierarchical COA, automated VAT calculation (14% Egypt / 15% KSA), WHT management, and ZATCA e-Invoicing."}
          </p>
        </Reveal>

        {/* Feature Toggle Buttons */}
        <div className="flex justify-center mb-12">
          <div className="inline-flex rounded-2xl p-1.5 border border-[var(--mk-border-strong)] bg-[#0b1126]/90 backdrop-blur-md shadow-xl">
            <button
              type="button"
              onClick={() => setActiveFeature("ledger")}
              className={`px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeFeature === "ledger"
                  ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-900/50"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {isAr ? "دليل الحسابات والضرائب (VAT/WHT/ZATCA)" : "General Ledger & Taxes (VAT/WHT/ZATCA)"}
            </button>
            <button
              type="button"
              onClick={() => setActiveFeature("cashier")}
              className={`px-6 py-2.5 rounded-xl text-xs sm:text-sm font-bold transition-all cursor-pointer ${
                activeFeature === "cashier"
                  ? "bg-gradient-to-r from-blue-600 to-cyan-500 text-white shadow-lg shadow-blue-900/50"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              {isAr ? "الخزينة وجلسات الكاشير والبنوك" : "Treasury & Cashier Sessions"}
            </button>
          </div>
        </div>

        {/* Dynamic Interactive Panel */}
        {activeFeature === "ledger" ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Visual Image Render */}
            <div className="lg:col-span-7 overflow-hidden rounded-2xl border border-[var(--mk-border-strong)] bg-[#070c1e] shadow-2xl relative group">
              <div className="relative aspect-[16/10] w-full min-h-[300px]">
                <Image
                  src="/images/aqarbooks-ledger.jpg"
                  alt="AqarBooks Double Entry Ledger Terminal"
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-[1.02]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#060a18]/90 via-transparent to-transparent" />
                <div className="absolute bottom-4 start-4 end-4 flex items-center justify-between">
                  <span className="rounded-xl bg-[#0b1126]/90 border border-blue-500/40 px-3.5 py-1.5 text-xs font-mono font-bold text-cyan-200 backdrop-blur-md shadow-xl">
                    {isAr ? "معاينة قيود اليومية والمطابقة الضريبية الإقليمية" : "Live Journal Posting & Regional Tax Breakdown"}
                  </span>
                </div>
              </div>
            </div>

            {/* Feature Bullet Points */}
            <div className="lg:col-span-5 space-y-4">
              <div className="space-y-3.5">
                <div className="p-4 rounded-xl border border-slate-800 bg-[#0b1126]/80 shadow-md flex items-start gap-3.5 transition-all hover:border-blue-500/40">
                  <div className="size-9 rounded-lg bg-blue-950/90 border border-blue-500/40 flex items-center justify-center shrink-0 mt-0.5 text-blue-400">
                    <FileCheck className="size-4.5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      {isAr ? "قيود متوازنة بدقة الذرة (Atomic Double-Entry)" : "Atomic Double-Entry Balancing"}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed font-normal">
                      {isAr
                        ? "كل حركة مالية تُسجل كقيد متوازن (مدين = دائن). لا يمكن ترحيل قيد غير متوازن، وتتم العمليات في Transaction ذري على مستوى قاعدة البيانات."
                        : "Every transaction generates balanced debits and credits. Unbalanced postings are rejected at DB constraint level."}
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-[#0b1126]/80 shadow-md flex items-start gap-3.5 transition-all hover:border-blue-500/40">
                  <div className="size-9 rounded-lg bg-blue-950/90 border border-blue-500/40 flex items-center justify-center shrink-0 mt-0.5 text-cyan-400">
                    <Receipt className="size-4.5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      {isAr ? "متوافق مع الضرائب المصرية والخليجية (VAT / WHT / ZATCA)" : "Egypt & GCC Tax Compliance"}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed font-normal">
                      {isAr
                        ? "احتساب آلي لضريبة القيمة المضافة 14% (مصر) و 15% (الخليج)، واستقطاع ضرائب الخصم والتحصيل WHT، وجاهزية الفوترة الإلكترونية."
                        : "Automated VAT 14% (Egypt) & 15% (GCC), Withholding Tax (WHT) deductions, and e-invoicing compliance."}
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-[#0b1126]/80 shadow-md flex items-start gap-3.5 transition-all hover:border-blue-500/40">
                  <div className="size-9 rounded-lg bg-slate-900 border border-slate-700/60 flex items-center justify-center shrink-0 mt-0.5 text-blue-400">
                    <ShieldAlert className="size-4.5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      {isAr ? "عدم تعديل القيود، التصحيح بالعكس فقط" : "Immutable Ledger & Audit Reversals"}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed font-normal">
                      {isAr
                        ? "المعاملات المرحّلة محصنة من التعديل المباشر لمنع التلاعب المالي؛ أي خطأ يُعالج بقيد عكسي موثّق مع حفظ هوية المستخدم وتاريخ الإجراء."
                        : "Posted transactions cannot be overwritten. Corrections require full reversal entries with complete audit trails."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
            {/* Visual Image Render */}
            <div className="lg:col-span-7 overflow-hidden rounded-2xl border border-[var(--mk-border-strong)] bg-[#070c1e] shadow-2xl relative group">
              <div className="relative aspect-[16/10] w-full min-h-[300px]">
                <Image
                  src="/images/aqarbooks-cashier.jpg"
                  alt="AqarBooks Cashier Session and Treasury Management"
                  fill
                  className="object-cover transition-transform duration-700 group-hover:scale-[1.02]"
                />
                <div className="absolute inset-0 bg-gradient-to-t from-[#060a18]/90 via-transparent to-transparent" />
                <div className="absolute bottom-4 start-4 end-4 flex items-center justify-between">
                  <span className="rounded-xl bg-[#0b1126]/90 border border-blue-500/40 px-3.5 py-1.5 text-xs font-mono font-bold text-blue-200 backdrop-blur-md shadow-xl">
                    {isAr ? "جلسات كاشير مقفلة وتسوية الفروق آلياً" : "Cashbox Session Auditing & Reconciliation"}
                  </span>
                </div>
              </div>
            </div>

            {/* Feature Bullet Points */}
            <div className="lg:col-span-5 space-y-4">
              <div className="space-y-3.5">
                <div className="p-4 rounded-xl border border-slate-800 bg-[#0b1126]/80 shadow-md flex items-start gap-3.5 transition-all hover:border-blue-500/40">
                  <div className="size-9 rounded-lg bg-blue-950/90 border border-blue-500/40 flex items-center justify-center shrink-0 mt-0.5 text-cyan-400">
                    <Receipt className="size-4.5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      {isAr ? "جلسات كاشير منفردة لكل صندوق ومرفق" : "Strict Cashier Session Isolation"}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed font-normal">
                      {isAr
                        ? "فتح وإغلاق جلسة الكاشير بعهدة نقدية محددة. لا يمكن فتح أكثر من جلسة على نفس الصندوق في نفس الوقت لمنع التداخل."
                        : "Controlled cashbox open/close workflows with starting balance verification and single-session enforcement."}
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-[#0b1126]/80 shadow-md flex items-start gap-3.5 transition-all hover:border-blue-500/40">
                  <div className="size-9 rounded-lg bg-blue-950/90 border border-blue-500/40 flex items-center justify-center shrink-0 mt-0.5 text-blue-400">
                    <Split className="size-4.5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      {isAr ? "تسوية فرق الإقفال بدل تجاهله (Variance Audit)" : "Closing Variance Accounting"}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed font-normal">
                      {isAr
                        ? "عند وجود زيادة أو عجز نقدي في الصندوق عند الجرد، يُرحّل الفرق آلياً لحساب عجز/زيادة الخزينة للتدقيق الإداري."
                        : "Any physical cash variance at session close is explicitly booked to variance expense/revenue accounts for manager review."}
                    </p>
                  </div>
                </div>

                <div className="p-4 rounded-xl border border-slate-800 bg-[#0b1126]/80 shadow-md flex items-start gap-3.5 transition-all hover:border-emerald-500/40">
                  <div className="size-9 rounded-lg bg-emerald-950/90 border border-emerald-500/40 flex items-center justify-center shrink-0 mt-0.5 text-emerald-400">
                    <FileCheck className="size-4.5" />
                  </div>
                  <div>
                    <h4 className="text-sm font-bold text-white">
                      {isAr ? "تتبع دورة حياة الشيكات والتحصيل البنكي" : "Cheque Lifecycle & Bank Clearance"}
                    </h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed font-normal">
                      {isAr
                        ? "تتبع دقيق لحافظات الشيكات: من الاستلام، الإيداع، المقاصة البنكية، أو الارتداد مع تحديث قيود الحسابات آلياً."
                        : "End-to-end cheque tracking: received, in-clearing, cleared, or bounced with automatic ledger entries."}
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
