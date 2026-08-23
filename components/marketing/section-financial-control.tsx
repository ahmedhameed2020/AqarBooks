import type { Locale } from "@/i18n/routing";
import { Lock, History, ArrowRight, CheckCircle2, RotateCcw, ShieldCheck, User, Clock } from "lucide-react";

export function SectionFinancialControl({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";

  return (
    <section id="audit" className="relative bg-white py-20 border-b border-slate-200/80">
      <div className="mx-auto max-w-7xl px-6">
        {/* Section Header */}
        <div className="max-w-2xl">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#1A3C2E]">
            <span className="flex size-5 items-center justify-center rounded-full bg-[#1A3C2E]/10 text-[10px]">06</span>
            <span>{isAr ? "الرقابة المالية وسجل التدقيق" : "FINANCIAL CONTROL & AUDITABILITY"}</span>
          </div>

          <h2 className="mt-3 text-3xl sm:text-4xl font-black text-slate-950 font-heading">
            {isAr ? "التعديل ليس محوًا للتاريخ." : "A correction is never an erasure of history."}
          </h2>

          <p className="mt-3.5 text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
            {isAr
              ? "القيود وسندات التحصيل المرحلة لا تملك أي زر حذف أو تعديل مباشر في قاعدة البيانات. أي تسوية أو تصحيح يتم عبر قيد عكسي موثق بالكامل يحفظ الأثر المالي ويضمن براءة الذمة أمام المراجع والملاك."
              : "Posted entries and receipts carry zero direct write/delete permissions in the database. Any adjustment strictly generates an immutable reversing entry, ensuring pristine ledger integrity for auditors and owners."}
          </p>
        </div>

        {/* The 3-Stage Reversal & Audit Demonstration */}
        <div className="mt-12 grid grid-cols-1 lg:grid-cols-3 gap-6 items-stretch">
          {/* 1. Original Posted Transaction */}
          <div className="rounded-3xl border border-slate-200/90 bg-[#FBFBFB] p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-slate-200">
                <span className="text-[11px] font-mono font-bold text-slate-400">STAGE 01</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 text-slate-700 px-2.5 py-0.5 text-[10px] font-bold">
                  {isAr ? "القيد الأصلي المرحل" : "Original Posted JV"}
                </span>
              </div>

              <div className="mt-4">
                <span className="font-mono text-xs font-black text-slate-900 block">JV-2026-00418</span>
                <p className="text-xs font-bold text-slate-700 mt-1">
                  {isAr ? "إثبات تحصيل رسوم إدارة (صندوق)" : "Cash Management Dues Collection"}
                </p>
              </div>

              <div className="mt-4 rounded-xl bg-white p-3 border border-slate-200/80 text-xs space-y-1.5 font-mono">
                <div className="flex justify-between text-slate-600">
                  <span>Dr: Cash 10101</span>
                  <span className="font-bold text-slate-900">28,500 ج.م</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Cr: Revenue 40101</span>
                  <span className="font-bold text-slate-900">28,500 ج.م</span>
                </div>
              </div>

              <p className="mt-3 text-[11px] text-slate-500 font-medium">
                {isAr ? "تم اكتشاف خطأ: لم يتم فصل ضريبة القيمة المضافة 14% عند الإدخال الأولي." : "Discovery: 14% VAT was not bifurcated on initial data entry."}
              </p>
            </div>

            <div className="mt-5 pt-3 border-t border-slate-150 flex items-center gap-1.5 text-[11px] font-bold text-slate-600">
              <Lock className="size-3.5 text-slate-400" />
              <span>{isAr ? "محمي من الحذف المباشر" : "Direct Edit Blocked by Core"}</span>
            </div>
          </div>

          {/* 2. Controlled Documented Reversal */}
          <div className="rounded-3xl border border-amber-300 bg-amber-50/40 p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-amber-200">
                <span className="text-[11px] font-mono font-bold text-amber-700">STAGE 02</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 text-amber-900 px-2.5 py-0.5 text-[10px] font-bold">
                  {isAr ? "قيد العكس الموثق" : "Reversing Entry"}
                </span>
              </div>

              <div className="mt-4">
                <span className="font-mono text-xs font-black text-amber-950 block">REV-2026-00419</span>
                <p className="text-xs font-bold text-amber-900 mt-1">
                  {isAr ? "عكس القيد JV-00418 بالكامل" : "Full Reversal of JV-00418"}
                </p>
              </div>

              <div className="mt-4 rounded-xl bg-white p-3 border border-amber-200 text-xs space-y-1.5 font-mono">
                <div className="flex justify-between text-slate-600">
                  <span>Dr: Revenue 40101</span>
                  <span className="font-bold text-slate-900">28,500 ج.م</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Cr: Cash 10101</span>
                  <span className="font-bold text-slate-900">28,500 ج.م</span>
                </div>
              </div>

              <p className="mt-3 text-[11px] text-amber-900/80 font-medium">
                {isAr ? "قام النظام بإلغاء الأثر المالي السابق بالكامل دون شطب أي سطر من سجل الأستاذ العام." : "Core reverses the exact financial impact without wiping any ledger record."}
              </p>
            </div>

            <div className="mt-5 pt-3 border-t border-amber-200 flex items-center gap-1.5 text-[11px] font-bold text-amber-900">
              <RotateCcw className="size-3.5 text-amber-700" />
              <span>{isAr ? "تصفير الأثر المحاسبي السابق" : "Prior Net Impact Zeroed"}</span>
            </div>
          </div>

          {/* 3. Corrected Approved Entry */}
          <div className="rounded-3xl border border-emerald-300 bg-emerald-50/40 p-6 shadow-xs flex flex-col justify-between">
            <div>
              <div className="flex items-center justify-between pb-3 border-b border-emerald-200">
                <span className="text-[11px] font-mono font-bold text-emerald-700">STAGE 03</span>
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-100 text-emerald-900 px-2.5 py-0.5 text-[10px] font-bold">
                  {isAr ? "القيد المصحح النهائي" : "Corrected & Approved"}
                </span>
              </div>

              <div className="mt-4">
                <span className="font-mono text-xs font-black text-emerald-950 block">COR-2026-00420</span>
                <p className="text-xs font-bold text-emerald-900 mt-1">
                  {isAr ? "القيد المعتمد مع فصل الضريبة 14%" : "Approved Entry with 14% VAT"}
                </p>
              </div>

              <div className="mt-4 rounded-xl bg-white p-3 border border-emerald-200 text-xs space-y-1.5 font-mono">
                <div className="flex justify-between text-slate-600">
                  <span>Dr: Cash 10101</span>
                  <span className="font-bold text-slate-900">28,500 ج.م</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Cr: Revenue 40101</span>
                  <span className="font-bold text-slate-900">25,000 ج.م</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Cr: VAT 20301</span>
                  <span className="font-bold text-slate-900">3,500 ج.م</span>
                </div>
              </div>

              <p className="mt-3 text-[11px] text-emerald-900/80 font-medium">
                {isAr ? "القيد الجديد مرحل ومعتمد، وسجل التدقيق يربط القيود الثلاثة ببعضها بدقة متناهية." : "New entry posted. Audit trail interlinks all three vouchers with permanent provenance."}
              </p>
            </div>

            <div className="mt-5 pt-3 border-t border-emerald-200 flex items-center gap-1.5 text-[11px] font-bold text-emerald-900">
              <CheckCircle2 className="size-3.5 text-emerald-700" />
              <span>{isAr ? "سجل تاريخي كامل 100%" : "Auditable 3-Way Trace"}</span>
            </div>
          </div>
        </div>

        {/* Audit Trail Metadata Strip */}
        <div className="mt-8 rounded-2xl border border-slate-200 bg-slate-50 p-4.5 flex flex-wrap items-center justify-between gap-4 text-xs font-medium text-slate-600">
          <div className="flex items-center gap-4">
            <span className="font-bold text-slate-900 flex items-center gap-1.5">
              <History className="size-4 text-[#1A3C2E]" />
              {isAr ? "سجل التدقيق الرقمي:" : "Audit Metadata:"}
            </span>
            <span className="font-mono text-[11px]">User: Tarek_CFO (Auth ID #4091)</span>
            <span className="font-mono text-[11px]">IP: 197.34.112.80</span>
            <span className="font-mono text-[11px]">Timestamp: 2026-08-24T14:32:10Z</span>
          </div>
          <span className="text-[11px] font-bold text-[#1A3C2E]">
            {isAr ? "مطابق لمعايير الحوكمة المالية الدولية (SOC-2 / IFRS)" : "Compliant with IFRS & Financial Governance Controls"}
          </span>
        </div>
      </div>
    </section>
  );
}
