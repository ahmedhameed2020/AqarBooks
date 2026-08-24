import type { Locale } from "@/i18n/routing";
import { Scale, CheckCircle2, ShieldCheck, XCircle, Lock, ArrowRight, Gauge, FileText } from "lucide-react";

export function SectionAccountingEngine({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";

  return (
    <section id="engine" className="relative bg-white py-24 border-b border-slate-200/80">
      <div className="mx-auto max-w-7xl px-6">
        
        {/* Section Header */}
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 text-xs font-mono font-bold text-[#07425d] bg-[#07425d]/10 px-3 py-1 rounded-full border border-[#07425d]/20 mb-3">
            <span className="flex size-4 items-center justify-center rounded-full bg-[#07425d] text-[10px] text-white">02</span>
            <span>{isAr ? "المحرك المحاسبي الذري · ATOMIC DOUBLE-ENTRY" : "THE ATOMIC ACCOUNTING CORE"}</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-black text-slate-950 font-heading leading-tight">
            {isAr ? "مش كل تسجيل محاسبة. القيد المزدوج هو الذي يثبتها." : "Not all logging is accounting. The double-entry journal proves it."}
          </h2>

          <p className="mt-3.5 text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
            {isAr
              ? "البرامج التقليدية تكتفي بتغيير حالة المعاملة إلى «تم السداد». في AqarBooks، كل حركة تفتح قيداً ذرياً متوازناً مدين ودائن يرحل فورياً لدفتر الأستاذ العام."
              : "Generic property tools merely mark records as 'Paid'. In AqarBooks, every collection opens an atomic, balanced debit/credit journal posted directly to the general ledger."}
          </p>
        </div>

        {/* The Signature Comparison Matrix: Generic vs AqarBooks */}
        <div className="mt-14 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
          
          {/* LEFT: Generic Property Software (The Shallow Approach) */}
          <div className="lg:col-span-5 rounded-3xl border border-slate-200 bg-slate-50/70 p-6 sm:p-7 flex flex-col justify-between opacity-85">
            <div>
              <div className="flex items-center justify-between pb-4 border-b border-slate-200">
                <div>
                  <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block">
                    {isAr ? "الأنظمة العقارية التقليدية" : "GENERIC PROPERTY SOFTWARE"}
                  </span>
                  <h3 className="text-sm font-bold text-slate-700 mt-0.5">
                    {isAr ? "تسجيل صوري بدون قيد دفتري" : "Flat Database Logging"}
                  </h3>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 px-2.5 py-0.5 text-[10px] font-bold font-mono">
                  SHALLOW RECORD
                </span>
              </div>

              {/* Generic Flat Card Mockup */}
              <div className="mt-6 rounded-2xl bg-white p-5 border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{isAr ? "حالة الدفعة:" : "Payment Status:"}</span>
                  <span className="inline-flex items-center gap-1 text-emerald-600 font-black">
                    <CheckCircle2 className="size-3.5" />
                    <span>{isAr ? "تم السداد (Paid ✓)" : "Paid ✓"}</span>
                  </span>
                </div>

                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-500">{isAr ? "المبلغ المستلم:" : "Amount Received:"}</span>
                  <span className="font-mono font-black text-slate-900 text-sm">25,000.00 EGP</span>
                </div>

                <div className="pt-3 border-t border-slate-100 text-[11px] text-slate-400">
                  <span className="block">{isAr ? "الوحدة: B-214" : "Unit: B-214"}</span>
                  <span className="block">{isAr ? "تاريخ: 24/08/2026" : "Date: 24/08/2026"}</span>
                </div>
              </div>

              {/* The Flaws of Generic Logging */}
              <div className="mt-6 space-y-2 text-xs">
                <div className="flex items-center gap-2 text-slate-500">
                  <XCircle className="size-4 text-rose-400 shrink-0" />
                  <span>{isAr ? "لا يوجد قيد مزدوج مدين ودائن" : "No double-entry journal created"}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <XCircle className="size-4 text-rose-400 shrink-0" />
                  <span>{isAr ? "لا يوجد ربط فوري بدفتر الأستاذ العام" : "No general ledger synchronization"}</span>
                </div>
                <div className="flex items-center gap-2 text-slate-500">
                  <XCircle className="size-4 text-rose-400 shrink-0" />
                  <span>{isAr ? "غير صالح لتدقيق مراجع الحسابات القانوني" : "Not auditable for financial accounting"}</span>
                </div>
              </div>
            </div>

            <div className="mt-6 pt-3.5 border-t border-slate-200 text-[11px] font-mono text-slate-400 text-center">
              {isAr ? "مجرد جدول بيانات (Database Row) بلا أثر مالي" : "Flat database row with zero accounting proof"}
            </div>
          </div>

          {/* RIGHT: AqarBooks Atomic Double-Entry Core (Double-Bezel System Object) */}
          <div className="lg:col-span-7 rounded-[2rem] p-2 bg-[#07425d]/5 border border-[#07425d]/20 shadow-xl">
            <div className="rounded-[calc(2rem-0.5rem)] bg-white p-6 sm:p-7 border border-slate-200/90 h-full flex flex-col justify-between">
              <div>
                {/* Header with Atomic Commit Badge */}
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-200">
                  <div className="flex items-center gap-2.5">
                    <div className="flex size-9 items-center justify-center rounded-xl bg-[#07425d] text-white shadow-xs">
                      <Scale className="size-4.5" />
                    </div>
                    <div>
                      <span className="text-[10px] font-mono font-black text-[#07425d] uppercase block">
                        AQARBOOKS ATOMIC CORE
                      </span>
                      <h3 className="text-sm font-black text-slate-950 font-heading">
                        {isAr ? "قيد يومية متوازن ذرياً ومرحل للدفاتر" : "Atomically Committed & Balanced Entry"}
                      </h3>
                    </div>
                  </div>

                  <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-300/80 px-3 py-1 text-[11px] font-mono font-black shadow-2xs">
                    <Lock className="size-3 text-emerald-600" />
                    ATOMIC COMMIT ✓
                  </span>
                </div>

                {/* Journal Voucher Lines */}
                <div className="mt-5 rounded-2xl border border-slate-200 bg-slate-50/50 p-4 font-mono text-xs">
                  <div className="flex items-center justify-between pb-2 border-b border-slate-200 text-slate-400 text-[10px] font-bold">
                    <span>{isAr ? "الطرف المحاسبي والكود" : "ACCOUNT & DIMENSION"}</span>
                    <span>{isAr ? "القيمة (EGP)" : "AMOUNT (EGP)"}</span>
                  </div>

                  <div className="mt-3 space-y-2">
                    {/* Debit Line */}
                    <div className="flex items-center justify-between bg-sky-50/70 p-2.5 rounded-xl border border-sky-200/70 text-sky-950">
                      <div>
                        <span className="font-bold block">Dr: 10101-01 · الصندوق والبنك التجاري</span>
                        <span className="text-[10px] text-slate-500 font-sans">{isAr ? "أصل متداول — تحصيل وحدة B-214" : "Current Asset — Unit B-214 Collection"}</span>
                      </div>
                      <span className="font-black tabular-nums text-sm text-[#07425d]">25,000.00</span>
                    </div>

                    {/* Credit Line */}
                    <div className="flex items-center justify-between bg-white p-2.5 rounded-xl border border-slate-200 text-slate-900">
                      <div>
                        <span className="font-bold block">Cr: 10301-02 · ذمم ملاك ومستحقات تشغيل</span>
                        <span className="text-[10px] text-slate-500 font-sans">{isAr ? "إقفال رصيد مطالبة صيانة دورية" : "Settlement of Open CAM Levy"}</span>
                      </div>
                      <span className="font-black tabular-nums text-sm text-slate-950">25,000.00</span>
                    </div>
                  </div>

                  {/* Balance Sum */}
                  <div className="mt-3 pt-2.5 border-t border-slate-200 flex items-center justify-between font-black text-slate-900">
                    <span className="text-[11px] text-emerald-700 flex items-center gap-1">
                      <CheckCircle2 className="size-3.5" />
                      DEBITS = CREDITS (100% BALANCED)
                    </span>
                    <span className="text-sm font-mono text-[#07425d]">25,000.00 = 25,000.00</span>
                  </div>
                </div>

                {/* 4 Financial Instrumentation Gates */}
                <div className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-[11px] font-mono">
                  <div className="bg-emerald-50 text-emerald-900 p-2 rounded-xl border border-emerald-200 font-bold">
                    <span>Atomic commit ✓</span>
                  </div>
                  <div className="bg-emerald-50 text-emerald-900 p-2 rounded-xl border border-emerald-200 font-bold">
                    <span>Audit chain ✓</span>
                  </div>
                  <div className="bg-emerald-50 text-emerald-900 p-2 rounded-xl border border-emerald-200 font-bold">
                    <span>Tenant scope ✓</span>
                  </div>
                  <div className="bg-emerald-50 text-emerald-900 p-2 rounded-xl border border-emerald-200 font-bold">
                    <span>GL synced ✓</span>
                  </div>
                </div>
              </div>

              {/* Executive Integrity Assurance */}
              <div className="mt-5 pt-3.5 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-500 font-medium">
                  {isAr ? "معتمد لمعايير المحاسبة الدولية (IFRS / EAS)" : "Certified under Egyptian & International Accounting Standards"}
                </span>
                <span className="font-mono text-xs font-black text-[#07425d]">
                  JV-2026-00418
                </span>
              </div>
            </div>
          </div>

        </div>
      </div>
    </section>
  );
}
