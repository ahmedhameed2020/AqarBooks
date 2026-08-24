import Image from "next/image";
import type { Locale } from "@/i18n/routing";
import {
  Building,
  CheckCircle2,
  FileCheck2,
  Wrench,
  Receipt,
  ShieldCheck,
  FileText,
  PieChart,
  ArrowRight,
  Fingerprint,
} from "lucide-react";

interface AuditStep {
  stepNumber: string;
  titleAr: string;
  titleEn: string;
  actorAr: string;
  actorEn: string;
  docHash: string;
  timestamp: string;
  statusAr: string;
  statusEn: string;
  icon: typeof Wrench;
}

const AUDIT_TRAIL_STEPS: AuditStep[] = [
  {
    stepNumber: "01",
    titleAr: "طلب صيانة وإصلاح مصعد",
    titleEn: "Elevator Maintenance Request",
    actorAr: "إدارة العقار · مبنى B-04",
    actorEn: "Property Operations · Bldg B-04",
    docHash: "REQ-8241",
    timestamp: "10:14 AM",
    statusAr: "تم التقديم",
    statusEn: "Submitted",
    icon: Wrench,
  },
  {
    stepNumber: "02",
    titleAr: "أمر شغل معتمد WO-2841",
    titleEn: "Authorized Work Order WO-2841",
    actorAr: "مدير التشغيل الهندسي",
    actorEn: "Engineering Facility Mgr",
    docHash: "WO-2841-SHA",
    timestamp: "10:30 AM",
    statusAr: "معتمد",
    statusEn: "Authorized",
    icon: FileCheck2,
  },
  {
    stepNumber: "03",
    titleAr: "فاتورة المورد الضريبية",
    titleEn: "Certified Vendor Tax Invoice",
    actorAr: "شركة أوراسكوم للمصاعد",
    actorEn: "Orascom Elevator Tech",
    docHash: "INV-9042-EGY",
    timestamp: "11:15 AM",
    statusAr: "مطابقة ETA",
    statusEn: "ETA Matched",
    icon: Receipt,
  },
  {
    stepNumber: "04",
    titleAr: "اعتماد مالي وصرف (Approval)",
    titleEn: "Financial Control & Approval",
    actorAr: "المراقب المالي المعتمد",
    actorEn: "Chief Financial Controller",
    docHash: "APV-9912",
    timestamp: "11:45 AM",
    statusAr: "مصادق عليه",
    statusEn: "Approved",
    icon: ShieldCheck,
  },
  {
    stepNumber: "05",
    titleAr: "قيد اليومية المتولد آلياً",
    titleEn: "Auto-Generated Journal Entry",
    actorAr: "محرك القيد الذري (AqarBooks)",
    actorEn: "AqarBooks Atomic Core",
    docHash: "JV-2026-00418",
    timestamp: "11:46 AM",
    statusAr: "مرحل ذرياً",
    statusEn: "Atomic Commit",
    icon: FileText,
  },
  {
    stepNumber: "06",
    titleAr: "أستاذ الوحدة والقوائم المالية",
    titleEn: "Property Ledger & Financials",
    actorAr: "ميزان المراجعة وقائمة الدخل",
    actorEn: "Trial Balance & Operating P&L",
    docHash: "GL-POST-0418",
    timestamp: "11:46 AM",
    statusAr: "محدث لحظياً",
    statusEn: "Real-Time Sync",
    icon: PieChart,
  },
];

export function SectionPropertyEvent({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";

  return (
    <section id="story" className="relative bg-[#F8FAFC] py-24 border-b border-slate-200/80">
      <div className="mx-auto max-w-7xl px-6">
        
        {/* Section Header */}
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 text-xs font-mono font-bold text-[#07425d] bg-[#07425d]/10 px-3 py-1 rounded-full border border-[#07425d]/20 mb-3">
            <span className="flex size-4 items-center justify-center rounded-full bg-[#07425d] text-[10px] text-white">01</span>
            <span>{isAr ? "الربط بين الموقع والدفاتر المحاسبية" : "CONNECTING SITE OPERATIONS TO LEDGER"}</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-black text-slate-950 font-heading leading-tight">
            {isAr ? "من أول طلب صيانة لحد ميزان المراجعة.. كل حركة لها أصل ومستند." : "From the first maintenance ticket to trial balance.. every event has clear origin and proof."}
          </h2>

          <p className="mt-3.5 text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
            {isAr
              ? "مفيش أرقام مجهولة المصدر. أي تحصيل أو مصروف مسجل باسم الوحدة، المبنى، والمسؤول اللي اعتمد العملية بالوقت والتاريخ وبصمة المستند."
              : "No untraceable figures. Every revenue and expense is bound to unit, building, and approving manager with exact timestamp and document hash."}
          </p>

          {/* Proof Points */}
          <div className="mt-5 flex flex-wrap items-center gap-2.5 text-xs font-bold text-slate-700">
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 border border-slate-200/90 shadow-2xs">
              <CheckCircle2 className="size-3.5 text-[#1b60b9]" />
              <span>{isAr ? "سلسلة تدقيق كاملة (Audit Chain)" : "Complete Audit Chain"}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 border border-slate-200/90 shadow-2xs">
              <CheckCircle2 className="size-3.5 text-[#1b60b9]" />
              <span>{isAr ? "ربط بالهيكل العقاري (Unit Scope)" : "Unit-Bound DNA"}</span>
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 border border-slate-200/90 shadow-2xs">
              <CheckCircle2 className="size-3.5 text-[#1b60b9]" />
              <span>{isAr ? "قيد مزدوج غير قابل للتعديل" : "Immutable Ledger Entry"}</span>
            </span>
          </div>
        </div>

        {/* 6-Stage Event-to-Ledger Provenance Timeline */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4.5">
          {AUDIT_TRAIL_STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isLast = idx === AUDIT_TRAIL_STEPS.length - 1;
            return (
              <div
                key={step.stepNumber}
                className={`group relative rounded-2xl p-5 border transition-all duration-300 ${
                  isLast
                    ? "bg-[#07425d] text-white border-[#07425d] shadow-lg shadow-[#07425d]/15"
                    : "bg-white border-slate-200/90 shadow-xs hover:border-slate-300 hover:shadow-sm"
                }`}
              >
                {/* Step Top Bar */}
                <div className="flex items-center justify-between pb-3 border-b border-slate-100/10 mb-3.5">
                  <div className="flex items-center gap-2.5">
                    <div
                      className={`flex size-8 items-center justify-center rounded-xl font-mono text-xs font-black ${
                        isLast ? "bg-white/20 text-white" : "bg-[#07425d]/10 text-[#07425d]"
                      }`}
                    >
                      <Icon className="size-4" />
                    </div>
                    <span
                      className={`font-mono text-xs font-extrabold ${
                        isLast ? "text-sky-200" : "text-slate-400"
                      }`}
                    >
                      STEP {step.stepNumber}
                    </span>
                  </div>

                  <span
                    className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-mono font-black ${
                      isLast
                        ? "bg-emerald-400/20 text-emerald-300 border border-emerald-400/30"
                        : "bg-slate-100 text-slate-700 border border-slate-200"
                    }`}
                  >
                    <Fingerprint className="size-3" />
                    {isAr ? step.statusAr : step.statusEn}
                  </span>
                </div>

                {/* Step Title */}
                <h3
                  className={`text-sm font-black font-heading leading-snug ${
                    isLast ? "text-white" : "text-slate-950"
                  }`}
                >
                  {isAr ? step.titleAr : step.titleEn}
                </h3>

                {/* Step Metadata: Actor & Timestamp */}
                <div className="mt-3 space-y-1.5 text-xs">
                  <div className="flex items-center justify-between">
                    <span className={isLast ? "text-slate-300" : "text-slate-500"}>
                      {isAr ? "المسؤول (Actor):" : "Actor:"}
                    </span>
                    <span
                      className={`font-bold ${isLast ? "text-white" : "text-slate-800"}`}
                    >
                      {isAr ? step.actorAr : step.actorEn}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[11px] font-mono">
                    <span className={isLast ? "text-slate-300" : "text-slate-400"}>
                      {isAr ? "بصمة المستند:" : "Doc Hash:"}
                    </span>
                    <span
                      className={`font-bold ${
                        isLast ? "text-sky-200" : "text-[#07425d] bg-sky-50 px-1.5 py-0.2 rounded"
                      }`}
                    >
                      {step.docHash}
                    </span>
                  </div>

                  <div className="flex items-center justify-between text-[10px] font-mono pt-1">
                    <span className={isLast ? "text-slate-400" : "text-slate-400"}>
                      {isAr ? "التوقيت الزمني:" : "Timestamp:"}
                    </span>
                    <span className={isLast ? "text-slate-200" : "text-slate-600"}>
                      {step.timestamp} · 24-Aug-2026
                    </span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>

        {/* Bottom Integrity Banner */}
        <div className="mt-8 rounded-2xl bg-white p-5 border border-slate-200/90 shadow-2xs flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex size-9 items-center justify-center rounded-xl bg-emerald-50 text-emerald-700 border border-emerald-200">
              <CheckCircle2 className="size-4.5" />
            </div>
            <div>
              <p className="text-xs font-black text-slate-900 font-heading">
                {isAr ? "مطابقة وتوازن دفتري كامل عبر جميع المستويات" : "Full Provenance & Reconciliation Guarantee"}
              </p>
              <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                {isAr
                  ? "لا يمكن تعديل أو حذف أي حركة مالية دون إنشاء قيد عكسي معتمد ومسجل في سجل التدقيق."
                  : "No financial transaction can be modified or deleted without an audited, approved reversing entry."}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 text-xs font-mono font-bold text-slate-600">
            <span className="size-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>ZERO AUDIT GAP</span>
          </div>
        </div>

      </div>
    </section>
  );
}
