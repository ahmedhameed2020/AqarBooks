import type { Locale } from "@/i18n/routing";
import { Scale, CheckCircle2, ShieldCheck, ArrowRight, Lock, FileSpreadsheet, Hash } from "lucide-react";

export function SectionAccountingEngine({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";

  return (
    <section id="engine" className="relative bg-white py-20 border-b border-slate-200/80">
      <div className="mx-auto max-w-7xl px-6">
        {/* Section Header */}
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#1A3C2E]">
            <span className="flex size-5 items-center justify-center rounded-full bg-[#1A3C2E]/10 text-[10px]">02</span>
            <span>{isAr ? "من الحركة إلى القيد" : "FROM TRANSACTION TO ENTRY"}</span>
          </div>

          <h2 className="mt-3 text-3xl sm:text-4xl font-black text-slate-950 font-heading">
            {isAr ? "مش كل تسجيل محاسبة. القيد هو اللي يثبتها." : "Not all logging is accounting. The journal entry proves it."}
          </h2>

          <p className="mt-3.5 text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
            {isAr
              ? "كل تحصيل أو سداد أو تسوية تتحول في AqarBooks إلى قيد يومية متوازن ومترابط مع مصدره العقاري — جاهز للمراجعة والتتبع والمطابقة."
              : "Every collection, disbursement, or settlement transforms into a balanced journal entry interlinked with its physical property origin — ready for audit and tax reconciliation."}
          </p>

          {/* Proof Points */}
          <div className="mt-5 flex flex-wrap items-center gap-2.5 text-xs font-bold text-slate-700">
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 border border-slate-200 shadow-2xs">
              <CheckCircle2 className="size-3.5 text-emerald-600" />
              <span>{isAr ? "قيد مزدوج حقيقي" : "True Double-Entry"}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 border border-slate-200 shadow-2xs">
              <CheckCircle2 className="size-3.5 text-emerald-600" />
              <span>{isAr ? "توازن تلقائي" : "Automatic Balancing"}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 border border-slate-200 shadow-2xs">
              <CheckCircle2 className="size-3.5 text-emerald-600" />
              <span>{isAr ? "تتبع كامل" : "End-to-End Traceability"}</span>
            </span>
          </div>
        </div>

        {/* The Real Read-Only Journal Entry Document Component */}
        <div className="mt-12 rounded-3xl border border-slate-300/80 bg-[#FAFAFA] p-6 sm:p-9 shadow-sm">
          {/* Journal Voucher Header */}
          <div className="flex flex-wrap items-center justify-between gap-4 pb-6 border-b border-slate-200">
            <div className="flex items-center gap-3">
              <div className="flex size-11 items-center justify-center rounded-2xl bg-[#1A3C2E] text-white shadow-sm">
                <Scale className="size-5.5" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-mono font-extrabold text-[#1A3C2E] bg-emerald-100/70 px-2 py-0.5 rounded">
                    JV-2026-00418
                  </span>
                  <span className="text-xs font-bold text-slate-500">
                    {isAr ? "قيد يومية عامة مرحل" : "Posted General Journal Voucher"}
                  </span>
                </div>
                <h3 className="text-base font-black text-slate-900 mt-0.5">
                  {isAr ? "إثبات تحصيل رسوم إدارة وصيانة — وحدة B-214 (Palm Residence)" : "Record Collection of CAM Dues — Unit B-214 (Palm Residence)"}
                </h3>
              </div>
            </div>

            <div className="flex items-center gap-3">
              <div className="rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-[11px] font-bold text-slate-600 shadow-2xs">
                <span className="text-slate-400 font-normal me-1.5">{isAr ? "الفترة:" : "Period:"}</span>
                <span className="font-mono text-slate-900">2026-08 (Open)</span>
              </div>
              <div className="rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-1.5 text-[11px] font-bold text-emerald-800 flex items-center gap-1.5">
                <Lock className="size-3.5 text-emerald-700" />
                <span>{isAr ? "مرحل ذرياً (Atomic)" : "Atomic Posted"}</span>
              </div>
            </div>
          </div>

          {/* Context Metadata Strip */}
          <div className="mt-5 grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs bg-white rounded-2xl p-4 border border-slate-200/80">
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase">{isAr ? "تاريخ القيد" : "Posting Date"}</span>
              <p className="font-mono font-bold text-slate-800 mt-0.5">24/08/2026</p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase">{isAr ? "المستند المصدر" : "Source Document"}</span>
              <p className="font-mono font-bold text-slate-800 mt-0.5">Receipt #RC-2026-01842</p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase">{isAr ? "الكيان والمركز المالي" : "Cost Center / Dimension"}</span>
              <p className="font-bold text-slate-800 mt-0.5">Palm Residence / Bldg-B</p>
            </div>
            <div>
              <span className="text-[10px] text-slate-400 font-bold uppercase">{isAr ? "المعاملة الضريبية" : "Tax Treatment"}</span>
              <p className="font-bold text-emerald-700 mt-0.5">{isAr ? "خاضع 14% VAT (مصر)" : "Standard 14% VAT (Egypt)"}</p>
            </div>
          </div>

          {/* Table of Journal Lines */}
          <div className="mt-6 overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-xs">
            <table className="w-full text-start text-xs border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/90 text-slate-600 font-bold text-[11px]">
                  <th className="py-3 px-4 text-start">{isAr ? "كود الحساب" : "Account Code"}</th>
                  <th className="py-3 px-4 text-start">{isAr ? "اسم الحساب المحاسبي" : "Account Name"}</th>
                  <th className="py-3 px-4 text-start">{isAr ? "البيان والبعد العقاري" : "Description & Dimension"}</th>
                  <th className="py-3 px-4 text-end">{isAr ? "مدين (Debit)" : "Debit (EGP)"}</th>
                  <th className="py-3 px-4 text-end">{isAr ? "دائن (Credit)" : "Credit (EGP)"}</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {/* Line 1: Debit Cash */}
                <tr className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-700">10101-01</td>
                  <td className="py-3.5 px-4">
                    <span className="font-bold text-slate-900 block">{isAr ? "الصندوق الرئيسي — خزينة الإدارة" : "Main Treasury Cashbox"}</span>
                    <span className="text-[10px] text-slate-400 font-normal">{isAr ? "أصول متداولة • نقدية وما في حكمها" : "Current Assets • Cash & Equiv"}</span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600">
                    {isAr ? "تحصيل نقدي صيانة وإدارة — وحدة B-214" : "Cash collection for CAM dues — Unit B-214"}
                  </td>
                  <td className="py-3.5 px-4 text-end font-mono font-black text-slate-950 tabular-nums">
                    28,500.00
                  </td>
                  <td className="py-3.5 px-4 text-end font-mono text-slate-300">
                    —
                  </td>
                </tr>

                {/* Line 2: Credit Service Revenue */}
                <tr className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-700">40101-02</td>
                  <td className="py-3.5 px-4">
                    <span className="font-bold text-slate-900 block">{isAr ? "إيرادات رسوم الإدارة والتشغيل" : "Management & CAM Service Revenue"}</span>
                    <span className="text-[10px] text-slate-400 font-normal">{isAr ? "إيرادات النشاط • خدمات عقارية" : "Operating Revenue • Real Estate"}</span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600">
                    {isAr ? "استحقاق إدارة سنوي 2026 — أحمد محمد" : "Annual CAM levy 2026 — Ahmed Mohamed"}
                  </td>
                  <td className="py-3.5 px-4 text-end font-mono text-slate-300">
                    —
                  </td>
                  <td className="py-3.5 px-4 text-end font-mono font-black text-slate-950 tabular-nums">
                    25,000.00
                  </td>
                </tr>

                {/* Line 3: Credit Output VAT */}
                <tr className="hover:bg-slate-50/60 transition-colors">
                  <td className="py-3.5 px-4 font-mono font-bold text-slate-700">20301-01</td>
                  <td className="py-3.5 px-4">
                    <span className="font-bold text-slate-900 block">{isAr ? "ضريبة القيمة المضافة المحصلة (مخرجات 14%)" : "Output VAT Payable (14%)"}</span>
                    <span className="text-[10px] text-slate-400 font-normal">{isAr ? "التزامات متداولة • مصلحة الضرائب المصرية" : "Current Liabilities • Tax Authority"}</span>
                  </td>
                  <td className="py-3.5 px-4 text-slate-600">
                    {isAr ? "ضريبة 14% محتسبة على رسوم سند RC-01842" : "14% VAT calculated on RC-01842"}
                  </td>
                  <td className="py-3.5 px-4 text-end font-mono text-slate-300">
                    —
                  </td>
                  <td className="py-3.5 px-4 text-end font-mono font-black text-slate-950 tabular-nums">
                    3,500.00
                  </td>
                </tr>
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-slate-300 bg-slate-50/90 font-bold">
                  <td colSpan={3} className="py-3.5 px-4 text-slate-800">
                    <div className="flex items-center gap-2">
                      <CheckCircle2 className="size-4 text-emerald-600" />
                      <span>{isAr ? "الإجمالي والمطابقة المحاسبية" : "Totals & Balancing Verification"}</span>
                    </div>
                  </td>
                  <td className="py-3.5 px-4 text-end font-mono font-black text-slate-950 text-sm tabular-nums">
                    28,500.00 <span className="text-[10px] text-slate-500 font-normal font-sans">ج.م</span>
                  </td>
                  <td className="py-3.5 px-4 text-end font-mono font-black text-slate-950 text-sm tabular-nums">
                    28,500.00 <span className="text-[10px] text-slate-500 font-normal font-sans">ج.م</span>
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Ledger Proof Banner */}
          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 text-xs bg-emerald-50/70 border border-emerald-200/80 rounded-2xl p-4">
            <div className="flex items-center gap-2 text-emerald-900 font-bold">
              <ShieldCheck className="size-4 text-emerald-700 shrink-0" />
              <span>{isAr ? "القيد متوازن، ولا يقبل التعديل المباشر أو الحذف — أي تصحيح يتم عبر قيد عكسي موثق." : "The entry is balanced and immutable — any correction strictly requires a documented reversal."}</span>
            </div>
            <span className="font-mono text-xs font-black text-emerald-800">
              DEBIT = CREDIT ✓
            </span>
          </div>
        </div>
      </div>
    </section>
  );
}
