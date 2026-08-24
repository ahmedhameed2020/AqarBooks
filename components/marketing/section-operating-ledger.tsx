import type { Locale } from "@/i18n/routing";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CheckCircle2, AlertTriangle, Layers, Building, Receipt, Users, Clock, ShoppingCart, Landmark } from "lucide-react";

const OPERATING_ROWS = [
  {
    moduleAr: "تحصيلات الوحدات والأقساط",
    moduleEn: "Unit Dues & Installment Collections",
    code: "MOD-COLLECT",
    scopeAr: "128 وحدة سكنية / تجارية",
    scopeEn: "128 Units in Active Portfolio",
    statusAr: "87% معدل التحصيل",
    statusEn: "87% Collection Efficiency",
    value: "1,420,000 ج.م",
    auditStateAr: "ترحيل لحظي للصندوق والبنك",
    auditStateEn: "Instant Treasury & Bank Posting",
    icon: Receipt,
  },
  {
    moduleAr: "رسوم الإدارة والصيانة المشتركة (CAM)",
    moduleEn: "Management & Common Area Maintenance (CAM)",
    code: "MOD-CAM",
    scopeAr: "94 وحدة خاضعة للجدول الدوري",
    scopeEn: "94 Units on Periodic Schedule",
    statusAr: "مجدولة آلياً بنسبة المساحة",
    statusEn: "Auto-apportioned by Unit Area",
    value: "235,000 ج.م",
    auditStateAr: "مطابقة ضريبية 14% VAT",
    auditStateEn: "Statutory 14% VAT Engine",
    icon: Building,
  },
  {
    moduleAr: "إدارة متأخرات الملاك والإنذارات",
    moduleEn: "Member Aging & Smart Dunning",
    code: "MOD-AGING",
    scopeAr: "14 وحدة عليها أرصدة مستحقة",
    scopeEn: "14 Overdue Accounts",
    statusAr: "أعمار ديون (30-60-90 يوم)",
    statusEn: "Aging Buckets (30/60/90 Days)",
    value: "218,500 ج.م",
    auditStateAr: "روابط سداد إلكتروني مؤمنة",
    auditStateEn: "Verified Direct Payment Links",
    icon: AlertTriangle,
  },
  {
    moduleAr: "موازنة اتحاد الشاغلين وتوزيع المصروفات",
    moduleEn: "HOA / Mollak Pro-Rata Budget",
    code: "MOD-HOA",
    scopeAr: "موازنة سنوية معتمدة من الجمعية",
    scopeEn: "AGM-Approved Annual Budget",
    statusAr: "توزيع حسب نسب حصة الأرض",
    statusEn: "Pro-Rata Land Ownership Shares",
    value: "450,000 ج.م",
    auditStateAr: "تقرير مدقق للجمعية العمومية",
    auditStateEn: "AGM Certified Audit Packets",
    icon: Users,
  },
  {
    moduleAr: "مشتريات ومصروفات الموردين وعقود الصيانة",
    moduleEn: "Supplier Procurement & Contractor Bills",
    code: "MOD-SUPPLIER",
    scopeAr: "18 أمر شراء وعقد صيانة نشط",
    scopeEn: "18 Active Procurement POs",
    statusAr: "اعتماد دورة ثلاثية (3-Way Match)",
    statusEn: "3-Way Match Verified",
    value: "85,400 ج.م",
    auditStateAr: "خصم وتحصيل WHT مطبق",
    auditStateEn: "Withholding Tax (WHT) Applied",
    icon: ShoppingCart,
  },
  {
    moduleAr: "جلسات الكاشير اليومية وإقفال الخزينة",
    moduleEn: "Cashbox Sessions & Daily Variance Audit",
    code: "MOD-TREASURY",
    scopeAr: "جلسة واحدة مفتوحة في المرة",
    scopeEn: "Single Open Session Constraint",
    statusAr: "إقفال ومطابقة عهدة نقدية",
    statusEn: "Shift Float Verification",
    value: "48,500 ج.م",
    auditStateAr: "تسجيل الفروق بحساب مستقل",
    auditStateEn: "Isolated Variance Ledger Posting",
    icon: Landmark,
  },
  {
    moduleAr: "حفظ الشيكات والمقاصة البنكية",
    moduleEn: "Cheque Custody & Bank Clearance",
    code: "MOD-CHEQUES",
    scopeAr: "12 شيك في الخزينة • 4 قيد المقاصة",
    scopeEn: "12 In Custody • 4 In Clearing",
    statusAr: "تتبع خطي: استلام → إيداع → تحصيل",
    statusEn: "Status: Received → Deposited → Cleared",
    value: "380,000 ج.م",
    auditStateAr: "قيود وسيطة للشيكات تحت التحصيل",
    auditStateEn: "PDC Clearing Settlement JVs",
    icon: Clock,
  },
] as const;

export function SectionOperatingLedger({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";

  return (
    <section id="operating-ledger" className="relative bg-[#F8F9FA] py-20 border-b border-slate-200/80">
      <div className="mx-auto max-w-7xl px-6">
        {/* Section Header */}
        <div className="max-w-3xl">
          <div className="flex items-center gap-2 text-xs font-mono font-bold text-[#07425d]">
            <span className="flex size-5 items-center justify-center rounded-full bg-[#07425d]/10 text-[10px]">05</span>
            <span>{isAr ? "مركز الحركة المالية" : "FINANCIAL ACTIVITY HUB"}</span>
          </div>

          <h2 className="mt-3 text-3xl sm:text-4xl font-black text-slate-950 font-heading">
            {isAr ? "كل ما حدث ماليًا. في سجل واحد." : "Everything that occurred financially. In a single ledger."}
          </h2>

          <p className="mt-3.5 text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
            {isAr
              ? "الحركة المالية اليومية للكيان أمامك لحظة بلحظة — من الاستحقاق والتحصيل إلى المصروف والتسوية والقيد — بسياقها الكامل وحالتها وأثرها المحاسبي."
              : "The daily financial pulse of your property right before you in real time — from assessment and collection to disbursement, settlement, and journal entry — with full context, status, and ledger impact."}
          </p>

          {/* Proof Points */}
          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-700">
            <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 border border-slate-200 shadow-2xs">
              {isAr ? "تحصيلات" : "Collections"}
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 border border-slate-200 shadow-2xs">
              {isAr ? "مصروفات" : "Expenses"}
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 border border-slate-200 shadow-2xs">
              {isAr ? "استحقاقات" : "Dues"}
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 border border-slate-200 shadow-2xs">
              {isAr ? "تسويات" : "Settlements"}
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 border border-slate-200 shadow-2xs">
              {isAr ? "قيود" : "Journals"}
            </span>
          </div>
        </div>

        {/* The Operating Ledger Table */}
        <div className="mt-12 rounded-3xl border border-slate-200/90 bg-white shadow-xs overflow-hidden">
          <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-slate-50/90 px-6 py-3.5 text-xs font-bold text-slate-700">
            <div className="flex items-center gap-2">
              <Layers className="size-4 text-[#07425d]" />
              <span className="font-black text-slate-900">{isAr ? "دفتر دورات التشغيل المالي النشطة" : "Active Real Estate Financial Workflows"}</span>
            </div>
            <span className="font-mono text-[11px] text-slate-500">7 VERIFIED MODULES ACTIVE</span>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <tr className="border-b border-slate-200 bg-slate-50/60 text-slate-700 text-xs font-bold">
                  <TableHead className="py-3.5 px-6">{isAr ? "الموديول / دورة العمل" : "Workflow / Module"}</TableHead>
                  <TableHead className="py-3.5 px-4">{isAr ? "نطاق الوحدات والعقود" : "Operational Scope"}</TableHead>
                  <TableHead className="py-3.5 px-4">{isAr ? "الحالة والمنطق المحاسبي" : "Accounting Logic & Status"}</TableHead>
                  <TableHead className="py-3.5 px-4">{isAr ? "الرقابة والامتثال" : "Audit & Controls"}</TableHead>
                  <TableHead className="py-3.5 px-6 text-end">{isAr ? "القيمة المسجلة" : "Monitored Value"}</TableHead>
                </tr>
              </TableHeader>
              <TableBody>
                {OPERATING_ROWS.map((row) => {
                  const Icon = row.icon;

                  return (
                    <TableRow key={row.code} className="hover:bg-slate-50/80 transition-colors border-b border-slate-100">
                      {/* Module */}
                      <TableCell className="py-4 px-6">
                        <div className="flex items-center gap-3">
                          <div className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-slate-100 text-[#1A3C2E] border border-slate-200/80">
                            <Icon className="size-4.5" />
                          </div>
                          <div>
                            <span className="font-black text-xs text-slate-900 block">
                              {isAr ? row.moduleAr : row.moduleEn}
                            </span>
                            <span className="text-[10px] font-mono text-slate-400 font-bold">
                              {row.code}
                            </span>
                          </div>
                        </div>
                      </TableCell>

                      {/* Scope */}
                      <TableCell className="py-4 px-4 text-xs font-semibold text-slate-700">
                        {isAr ? row.scopeAr : row.scopeEn}
                      </TableCell>

                      {/* Status */}
                      <TableCell className="py-4 px-4">
                        <span className="inline-flex items-center gap-1.5 rounded-lg bg-slate-100 px-2.5 py-1 text-[11px] font-bold text-slate-800 border border-slate-200">
                          {isAr ? row.statusAr : row.statusEn}
                        </span>
                      </TableCell>

                      {/* Audit */}
                      <TableCell className="py-4 px-4">
                        <div className="flex items-center gap-1.5 text-xs text-emerald-800 font-bold">
                          <CheckCircle2 className="size-3.5 text-emerald-600 shrink-0" />
                          <span>{isAr ? row.auditStateAr : row.auditStateEn}</span>
                        </div>
                      </TableCell>

                      {/* Value */}
                      <TableCell className="py-4 px-6 text-end font-mono font-black text-xs text-slate-950 tabular-nums">
                        {row.value}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </div>
      </div>
    </section>
  );
}
