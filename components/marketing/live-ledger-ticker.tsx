"use client";

import { useMemo } from "react";

interface LedgerEvent {
  id: string;
  ref: string;
  typeAr: string;
  typeEn: string;
  descAr: string;
  descEn: string;
  debit: string;
  credit: string;
  entityAr: string;
  entityEn: string;
  statusAr: string;
  statusEn: string;
}

const LEDGER_EVENTS: LedgerEvent[] = [
  {
    id: "tx-1",
    ref: "JV-2026-0842",
    typeAr: "قيد استحقاق صيانة",
    typeEn: "Maintenance Due",
    descAr: "استحقاق وديعة وصيانة - برج الزمرد وحدة 704 (الرياض)",
    descEn: "Due posting - Emerald Tower Unit 704 (Riyadh)",
    debit: "SAR 8,500.00",
    credit: "SAR 8,500.00",
    entityAr: "عمارة / برج سكني",
    entityEn: "Residential Tower",
    statusAr: "مرحّل محاسبياً",
    statusEn: "Posted Atomic",
  },
  {
    id: "tx-2",
    ref: "CR-2026-1190",
    typeAr: "سند تحصيل كاشير",
    typeEn: "Cashier Collection",
    descAr: "سداد قسط شاليه B-14 - قرية لاجونا باي (الساحل الشمالي)",
    descEn: "Chalet B-14 installment - Laguna Bay (North Coast)",
    debit: "EGP 45,000.00",
    credit: "EGP 45,000.00",
    entityAr: "منتجع سياحي",
    entityEn: "Tourist Resort",
    statusAr: "خزينة 1010",
    statusEn: "Cashbox 1010",
  },
  {
    id: "tx-3",
    ref: "ZATCA-2026-041",
    typeAr: "فاتورة إلكترونية معتمدة",
    typeEn: "ZATCA e-Invoice (KSA)",
    descAr: "فوترة تأجير محل تجاري - بوليفارد بلازا (جدة)",
    descEn: "Commercial retail lease - Boulevard Plaza (Jeddah)",
    debit: "SAR 32,000.00",
    credit: "SAR 32,000.00",
    entityAr: "محل / مول تجاري",
    entityEn: "Commercial Retail",
    statusAr: "ZATCA Phase 2",
    statusEn: "ZATCA Ready",
  },
  {
    id: "tx-4",
    ref: "TAX-2026-0312",
    typeAr: "إقرار ضريبة ق.م 14%",
    typeEn: "Egyptian VAT 14%",
    descAr: "احتساب ضريبة القيمة المضافة - فواتير صيانة المول (القاهرة)",
    descEn: "VAT 14% calculated - Cairo Mall Maintenance",
    debit: "EGP 12,600.00",
    credit: "EGP 12,600.00",
    entityAr: "محل / مول تجاري",
    entityEn: "Commercial Retail",
    statusAr: "مطابق للضرائب",
    statusEn: "Tax Verified",
  },
  {
    id: "tx-5",
    ref: "HOA-2026-0094",
    typeAr: "تسوية اتحاد شاغلين وملاك",
    typeEn: "HOA Settlement",
    descAr: "توزيع مصروفات إنارة وحراسة - كمبوند بالمز (دبي)",
    descEn: "Common utilities allocation - Palms Compound (Dubai)",
    debit: "AED 18,400.00",
    credit: "AED 18,400.00",
    entityAr: "اتحاد ملاك وشاغلين",
    entityEn: "HOA Association",
    statusAr: "توزيع نسبي",
    statusEn: "Pro-rata Split",
  },
  {
    id: "tx-6",
    ref: "REV-2026-0018",
    typeAr: "عكس قيد محاسبي موثّق",
    typeEn: "Audit Reversal",
    descAr: "عكس تصحيحي للقيد #0791 بدل التعديل المباشر",
    descEn: "Corrective reversal of #0791 (No direct edit)",
    debit: "SAR 3,200.00",
    credit: "SAR 3,200.00",
    entityAr: "وحدة سكنية",
    entityEn: "Residential Unit",
    statusAr: "سجل تدقيق كامل",
    statusEn: "Audit Logged",
  },
];

export function LiveLedgerTicker({ isAr }: { isAr: boolean }) {
  // Duplicate array to enable continuous seamless looping ticker
  const duplicatedEvents = useMemo(() => [...LEDGER_EVENTS, ...LEDGER_EVENTS], []);

  return (
    <div className="w-full overflow-hidden border-y border-[var(--mk-border)] bg-[var(--mk-bg-elevated)]/80 backdrop-blur-md py-3 shadow-sm">
      <div className="mx-auto flex max-w-7xl items-center gap-4 px-4">
        <div className="flex shrink-0 items-center gap-2 rounded-full border border-blue-500/30 bg-blue-950/60 px-3.5 py-1 text-xs font-bold text-cyan-300 shadow-xs">
          <span className="size-2 rounded-full bg-cyan-400 animate-pulse" />
          <span>{isAr ? "محرك الترحيل اللحظي (Atomic Ledger)" : "Live Atomic Ledger"}</span>
        </div>

        <div className="relative flex-1 overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_8%,black_92%,transparent)]">
          <div
            className={`flex w-max items-center gap-4 ${
              isAr ? "animate-ticker-rtl" : "animate-ticker"
            } hover:[animation-play-state:paused]`}
          >
            {duplicatedEvents.map((evt, idx) => (
              <div
                key={`${evt.id}-${idx}`}
                className="flex items-center gap-3 rounded-xl border border-[var(--mk-border)] bg-[var(--mk-surface)]/90 px-4 py-1.5 text-xs text-white shadow-xs transition-all hover:border-blue-500/50"
              >
                <span className="font-mono font-bold text-cyan-400">{evt.ref}</span>
                <span className="text-slate-600">|</span>
                <span className="font-bold text-white">{isAr ? evt.typeAr : evt.typeEn}</span>
                <span className="hidden text-slate-400 sm:inline font-normal">
                  {isAr ? evt.descAr : evt.descEn}
                </span>
                <span className="rounded-md bg-blue-950/80 px-2 py-0.5 font-mono text-[11px] font-bold text-blue-300 border border-blue-800/40">
                  {isAr ? evt.entityAr : evt.entityEn}
                </span>
                <span className="rounded-md bg-emerald-950/80 px-2 py-0.5 font-mono text-[11px] font-bold text-emerald-300 border border-emerald-800/40">
                  {evt.debit}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
