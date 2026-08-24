"use client";

import { useState } from "react";
import Image from "next/image";
import {
  Building2,
  CheckCircle2,
  FileText,
  Receipt,
  BadgeCheck,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface UnitProfile {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  typeAr: string;
  typeEn: string;
  ownerAr: string;
  ownerEn: string;
  floorAr: string;
  floorEn: string;
  area: string;
  pinPosition: { top: string; left: string };
  txRef: string;
  jvRef: string;
  txTypeAr: string;
  txTypeEn: string;
  amountNumber: number;
  amountFormatted: string;
  vatAmountFormatted: string;
  totalFormatted: string;
  taxMetaAr: string;
  taxMetaEn: string;
  journalLines: {
    side: "dr" | "cr";
    titleAr: string;
    titleEn: string;
    code: string;
    amount: string;
  }[];
  balanceStatusAr: string;
  balanceStatusEn: string;
}

const UNITS_DATA: UnitProfile[] = [
  {
    id: "b214",
    code: "B-214",
    nameAr: "الوحدة B-214 (سكني فاخر)",
    nameEn: "Unit B-214 (Luxury Res.)",
    typeAr: "سكني متكرر",
    typeEn: "Residential",
    ownerAr: "د. هشام الفاسي",
    ownerEn: "Dr. Hesham El-Fassi",
    floorAr: "الدور الثاني",
    floorEn: "2nd Floor",
    area: "215 م²",
    pinPosition: { top: "56%", left: "68%" },
    txRef: "TX-2026-08241",
    jvRef: "JV-2026-00418",
    txTypeAr: "سداد مصاريف صيانة وخدمات دورية (Q3)",
    txTypeEn: "Q3 Periodic Service & Maintenance Fee",
    amountNumber: 28500,
    amountFormatted: "25,000 ج.م",
    vatAmountFormatted: "3,500 ج.م (14% VAT)",
    totalFormatted: "28,500 ج.م",
    taxMetaAr: "فاتورة إلكترونية معتمدة ETA UUID: c89e4-8f12",
    taxMetaEn: "ETA E-Invoice Verified UUID: c89e4-8f12",
    journalLines: [
      { side: "dr", titleAr: "مدين: الصندوق والبنك التجاري", titleEn: "Dr: Treasury & Operating Bank", code: "10101-01", amount: "28,500 ج.م" },
      { side: "cr", titleAr: "دائن: إيرادات صيانة وتشغيل العقار", titleEn: "Cr: Property Operations Revenue", code: "40101-02", amount: "25,000 ج.م" },
      { side: "cr", titleAr: "دائن: ضريبة القيمة المضافة المستحقة", titleEn: "Cr: Output VAT Payable (14%)", code: "20301-01", amount: "3,500 ج.م" },
    ],
    balanceStatusAr: "القيد متوازن ذرياً ومرحل لدفتر الأستاذ",
    balanceStatusEn: "Atomically balanced & posted to General Ledger",
  },
  {
    id: "a102",
    code: "A-102",
    nameAr: "الوحدة A-102 (تجاري - بنك)",
    nameEn: "Unit A-102 (Commercial Bank)",
    typeAr: "تجاري أرضي",
    typeEn: "Commercial Ground",
    ownerAr: "شركة المشرق للتطوير",
    ownerEn: "Mashreq Development Co.",
    floorAr: "الدور الأرضي",
    floorEn: "Ground Floor",
    area: "380 م²",
    pinPosition: { top: "82%", left: "48%" },
    txRef: "TX-2026-09102",
    jvRef: "JV-2026-00520",
    txTypeAr: "تحصيل إيجار ربع سنوي تجاري معتمد",
    txTypeEn: "Quarterly Commercial Lease Collection",
    amountNumber: 120000,
    amountFormatted: "105,263 ج.م",
    vatAmountFormatted: "14,737 ج.م (14% VAT)",
    totalFormatted: "120,000 ج.م",
    taxMetaAr: "مطابقة ضريبية ZATCA / ETA معتمدة",
    taxMetaEn: "Tax Compliant ZATCA / ETA Active",
    journalLines: [
      { side: "dr", titleAr: "مدين: بنك مصر - الحساب الجاري", titleEn: "Dr: Current Bank Account", code: "10201-02", amount: "120,000 ج.م" },
      { side: "cr", titleAr: "دائن: إيراد تأجير مساحات تجارية", titleEn: "Cr: Commercial Rental Revenue", code: "40201-01", amount: "105,263 ج.م" },
      { side: "cr", titleAr: "دائن: ضريبة القيمة المضافة المحصلة", titleEn: "Cr: Output VAT Payable (14%)", code: "20301-01", amount: "14,737 ج.م" },
    ],
    balanceStatusAr: "تحصيل بنكي مباشر مع تسوية الفاتورة",
    balanceStatusEn: "Direct bank collection with automatic invoice clearing",
  },
  {
    id: "c401",
    code: "C-401",
    nameAr: "الوحدة C-401 (بنتهاوس فاخر)",
    nameEn: "Unit C-401 (Penthouse Sky)",
    typeAr: "بنتهاوس بانورامي",
    typeEn: "Panoramic Penthouse",
    ownerAr: "م. طارق العوضي",
    ownerEn: "Eng. Tarek El-Awadi",
    floorAr: "الدور الرابع - الروف",
    floorEn: "4th Floor - Roof",
    area: "420 م²",
    pinPosition: { top: "34%", left: "62%" },
    txRef: "TX-2026-10401",
    jvRef: "JV-2026-00635",
    txTypeAr: "إثبات وديعة صيانة مخصصة ومستدامة (Capital Reserve)",
    txTypeEn: "Dedicated Sinking Fund Capital Reserve Deposit",
    amountNumber: 50000,
    amountFormatted: "50,000 ج.م",
    vatAmountFormatted: "0.00 ج.م (معفى / أمانات)",
    totalFormatted: "50,000 ج.م",
    taxMetaAr: "حساب أمانات معزول بنكياً عن التشغيل",
    taxMetaEn: "Ring-fenced Escrow / Reserve Ledger",
    journalLines: [
      { side: "dr", titleAr: "مدين: بنك الودائع المخصصة للصيانة", titleEn: "Dr: Reserve Sinking Fund Bank", code: "10202-01", amount: "50,000 ج.م" },
      { side: "cr", titleAr: "دائن: أمانات وودائع صيانة الملاك", titleEn: "Cr: Member Capital Reserve Trust", code: "20401-01", amount: "50,000 ج.م" },
    ],
    balanceStatusAr: "محجوزة بحساب استثماري معزول لاتحاد الشاغلين",
    balanceStatusEn: "Secured in isolated HOA reserve investment ledger",
  },
];

export function HeroDigitalTwin({ isAr }: { isAr: boolean }) {
  const [selectedUnitId, setSelectedUnitId] = useState<string>("b214");
  const activeUnit = UNITS_DATA.find((u) => u.id === selectedUnitId) ?? UNITS_DATA[0];

  return (
    <div className="relative rounded-3xl border border-slate-200/90 bg-white shadow-2xl overflow-hidden">
      {/* Top Architectural Header Bar */}
      <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-slate-50/95 px-5 py-3 text-xs font-bold text-slate-700">
        <div className="flex items-center gap-3">
          <div className="flex size-7 items-center justify-center rounded-lg bg-[#07425d] text-white shadow-xs">
            <Building2 className="size-4" />
          </div>
          <div>
            <span className="font-black text-slate-950 font-heading">
              {isAr ? "مشروع بالم ريزيدنس الفاخر" : "Palm Residence Luxury Complex"}
            </span>
            <span className="text-slate-400 mx-2">•</span>
            <span className="text-slate-500 font-mono text-[11px]">
              {isAr ? "التوأم الرقمي والمحاسبي المباشر" : "Live ERP Digital Twin Twin-Sync"}
            </span>
          </div>
        </div>

        {/* Live Telemetry Status Indicators */}
        <div className="flex items-center gap-3 font-mono text-[11px]">
          <span className="hidden sm:inline-flex items-center gap-1.5 rounded-full bg-emerald-100/80 text-emerald-900 border border-emerald-300/60 px-2.5 py-0.5 font-bold">
            <span className="size-1.5 rounded-full bg-emerald-600 animate-pulse" />
            {isAr ? "القيد الذري نشط" : "Atomic Engine Active"}
          </span>
          <span className="text-slate-400 hidden md:inline">|</span>
          <span className="text-slate-600 font-extrabold">
            {isAr ? "المرجع:" : "Ref:"}{" "}
            <span className="text-[#07425d] bg-[#07425d]/10 px-2 py-0.5 rounded font-mono">
              {activeUnit.txRef}
            </span>
          </span>
        </div>
      </div>

      {/* Main Grid: Left = Visual Interactive Architectural Canvas, Right = Live Financial Ledger Engine */}
      <div className="grid grid-cols-1 lg:grid-cols-12">
        
        {/* =========================================================================
            LEFT COLUMN: Real Architectural Building with Interactive Digital Twin Pins
           ========================================================================= */}
        <div className="relative lg:col-span-7 min-h-[380px] sm:min-h-[460px] lg:min-h-[540px] bg-slate-900 overflow-hidden select-none group">
          {/* Background Architectural Render */}
          <Image
            src="/images/aqarbooks-hero-property.jpg"
            alt={isAr ? "مشروع عقاري معتمد — AqarBooks" : "AqarBooks Real Estate Architecture"}
            fill
            priority
            sizes="(min-width: 1024px) 58vw, 100vw"
            className="object-cover transition-transform duration-700 ease-out group-hover:scale-101"
          />

          {/* Luxury Vignette Overlay */}
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-950/20 to-transparent pointer-events-none" />

          {/* Interactive Unit Selector Pins Over Building Facade */}
          {UNITS_DATA.map((unit) => {
            const isSelected = unit.id === selectedUnitId;
            return (
              <button
                key={unit.id}
                type="button"
                onClick={() => setSelectedUnitId(unit.id)}
                style={{ top: unit.pinPosition.top, left: unit.pinPosition.left }}
                aria-label={isAr ? unit.nameAr : unit.nameEn}
                className={cn(
                  "absolute -translate-x-1/2 -translate-y-1/2 z-20 flex items-center gap-2 rounded-full px-3 py-1.5 transition-all duration-300 cursor-pointer shadow-xl backdrop-blur-md press-feedback motion-control",
                  isSelected
                    ? "bg-[#07425d] text-white ring-2 ring-white/90 scale-110 shadow-[#07425d]/50 shadow-lg"
                    : "bg-slate-900/85 text-slate-200 border border-white/20 hover:bg-slate-900 hover:scale-105"
                )}
              >
                <span
                  className={cn(
                    "size-2 rounded-full",
                    isSelected ? "bg-emerald-400 animate-ping" : "bg-sky-400"
                  )}
                />
                <span className="font-mono font-black text-xs tracking-tight">{unit.code}</span>
                {isSelected && (
                  <span className="hidden sm:inline text-[10px] font-bold text-sky-200 border-s border-white/30 ps-1.5">
                    {isAr ? "محدد" : "Active"}
                  </span>
                )}
              </button>
            );
          })}

          {/* Interactive Floating Quick-Selector Chips */}
          <div className="absolute top-4 start-4 z-20 flex flex-wrap items-center gap-1.5 bg-slate-950/80 p-1.5 rounded-2xl border border-white/15 backdrop-blur-md shadow-lg">
            <span className="text-[10px] font-bold text-slate-400 px-2 font-mono">
              {isAr ? "اختر الوحدة:" : "Select Unit:"}
            </span>
            {UNITS_DATA.map((u) => {
              const active = u.id === selectedUnitId;
              return (
                <button
                  key={u.id}
                  type="button"
                  onClick={() => setSelectedUnitId(u.id)}
                  className={cn(
                    "rounded-xl px-2.5 py-1 text-[11px] font-mono font-bold transition-all cursor-pointer",
                    active
                      ? "bg-[#07425d] text-white shadow-xs ring-1 ring-white/30"
                      : "text-slate-300 hover:text-white hover:bg-white/10"
                  )}
                >
                  {u.code}
                </button>
              );
            })}
          </div>

          {/* Active Unit Glass Card (Bottom Overlay) */}
          <div className="absolute bottom-4 inset-x-4 z-20 rounded-2xl bg-slate-950/90 backdrop-blur-xl p-4 border border-white/15 shadow-2xl text-white">
            <div className="flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-xs sm:text-sm font-black text-white font-heading">
                    {isAr ? activeUnit.nameAr : activeUnit.nameEn}
                  </span>
                  <span className="text-[10px] font-mono bg-sky-500/20 text-sky-300 border border-sky-400/30 px-2 py-0.5 rounded-full font-bold">
                    {isAr ? activeUnit.typeAr : activeUnit.typeEn}
                  </span>
                </div>
                <p className="mt-1 text-[11px] text-slate-300 font-medium">
                  {isAr ? `المالك: ${activeUnit.ownerAr} · ${activeUnit.floorAr}` : `Owner: ${activeUnit.ownerEn} · ${activeUnit.floorEn}`}
                </p>
              </div>

              <div className="text-end shrink-0">
                <span className="text-[10px] font-mono text-slate-400 block">{isAr ? "المساحة الدفترية" : "Asset Area"}</span>
                <span className="text-xs sm:text-sm font-black text-emerald-400 font-mono">{activeUnit.area}</span>
              </div>
            </div>
          </div>
        </div>

        {/* =========================================================================
            RIGHT COLUMN: Live ERP General Ledger & Journal Transformation Document
           ========================================================================= */}
        <div className="lg:col-span-5 p-5 sm:p-6 lg:p-7 flex flex-col justify-between bg-[#FCFCFD] border-t lg:border-t-0 lg:border-s border-slate-200">
          <div>
            {/* Document Header */}
            <div className="flex items-center justify-between pb-3.5 border-b border-slate-200">
              <div className="flex items-center gap-2">
                <div className="flex size-8 items-center justify-center rounded-xl bg-sky-100 text-[#07425d]">
                  <Receipt className="size-4" />
                </div>
                <div>
                  <h3 className="text-xs font-black text-slate-900 font-heading leading-tight">
                    {isAr ? "المستند المالي وسند القيد" : "Voucher & Journal Engine"}
                  </h3>
                  <p className="text-[10px] font-mono text-slate-500">{activeUnit.txRef}</p>
                </div>
              </div>

              <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200 px-2.5 py-1 text-[10px] font-black font-mono shadow-2xs">
                <CheckCircle2 className="size-3 text-emerald-600" />
                POSTED & AUDITED
              </span>
            </div>

            {/* Transaction Narrative */}
            <div className="mt-3.5 rounded-xl bg-slate-50 p-3 border border-slate-200/70 text-xs">
              <span className="text-[10px] font-mono font-bold text-slate-400 uppercase block mb-0.5">
                {isAr ? "بيان المعاملة العقارية:" : "Transaction Description:"}
              </span>
              <p className="font-bold text-slate-800 leading-snug">
                {isAr ? activeUnit.txTypeAr : activeUnit.txTypeEn}
              </p>
            </div>

            {/* Figures Grid */}
            <div className="mt-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between text-slate-600 font-medium">
                <span>{isAr ? "قيمة المطالبة / الإيراد الأساسي" : "Base Fee / Revenue"}</span>
                <span className="font-mono font-black text-slate-900 tabular-nums">{activeUnit.amountFormatted}</span>
              </div>

              <div className="flex items-center justify-between text-slate-500 text-[11px]">
                <span>{isAr ? "ضريبة القيمة المضافة / الودائع" : "Tax / Special Ledger"}</span>
                <span className="font-mono font-bold text-slate-800 tabular-nums">{activeUnit.vatAmountFormatted}</span>
              </div>

              <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                <span className="text-xs font-black text-slate-900">{isAr ? "إجمالي المبلغ المحصل والدفتري" : "Total Booked & Cleared"}</span>
                <span className="text-base font-black text-[#07425d] font-mono tabular-nums">{activeUnit.totalFormatted}</span>
              </div>
            </div>

            {/* Atomic Journal Transformation Engine Box */}
            <div className="mt-4 rounded-2xl border border-[#07425d]/25 bg-[#07425d]/[0.03] p-3.5 sm:p-4 shadow-xs">
              <div className="flex items-center justify-between mb-2.5 pb-2 border-b border-[#07425d]/10 text-xs">
                <div className="flex items-center gap-1.5 font-black text-[#07425d]">
                  <FileText className="size-3.5" />
                  <span>{isAr ? "القيد المحاسبي المتولد آلياً" : "Auto-Generated Journal"}</span>
                </div>
                <span className="font-mono text-[11px] font-black text-slate-700 bg-white px-2 py-0.5 rounded border border-slate-200">
                  {activeUnit.jvRef}
                </span>
              </div>

              {/* Journal Lines */}
              <div className="space-y-1.5 text-xs">
                {activeUnit.journalLines.map((line, idx) => (
                  <div
                    key={idx}
                    className={cn(
                      "flex items-center justify-between rounded-xl p-2.5 border transition-all text-xs",
                      line.side === "dr"
                        ? "bg-sky-50/70 border-sky-200/80 text-sky-950"
                        : "bg-white border-slate-200/90 text-slate-900"
                    )}
                  >
                    <div className="min-w-0 flex-1 pe-2">
                      <span className="font-bold block truncate">
                        {isAr ? line.titleAr : line.titleEn}
                      </span>
                      <span className="text-[10px] font-mono text-slate-500 font-bold block">
                        {line.code} · {line.side === "dr" ? (isAr ? "مدين" : "Debit") : (isAr ? "دائن" : "Credit")}
                      </span>
                    </div>
                    <span className="font-mono font-black tabular-nums text-slate-950 shrink-0">
                      {line.amount}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Verification & Compliance Footer */}
          <div className="mt-4 pt-3 border-t border-slate-200">
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 text-emerald-800 font-bold">
                <CheckCircle2 className="size-4 text-emerald-600 shrink-0" />
                <span className="text-[11px]">{isAr ? activeUnit.balanceStatusAr : activeUnit.balanceStatusEn}</span>
              </div>
              <span className="font-mono text-xs font-black text-[#07425d] bg-sky-50 px-2 py-0.5 rounded border border-sky-200">
                {activeUnit.totalFormatted} = {activeUnit.totalFormatted}
              </span>
            </div>

            <div className="mt-2 text-[10px] font-mono text-slate-500 flex items-center justify-between">
              <span>{isAr ? activeUnit.taxMetaAr : activeUnit.taxMetaEn}</span>
              <span className="font-bold text-emerald-700 flex items-center gap-1">
                <BadgeCheck className="size-3" />
                100% BALANCED
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
