"use client";

import { useState, useEffect, useRef } from "react";
import Image from "next/image";
import {
  Building2,
  CheckCircle2,
  FileText,
  Receipt,
  BadgeCheck,
  Pause,
  Play,
  Layers,
  ShieldCheck,
  Sparkles,
  ArrowDown,
  Hash,
} from "lucide-react";
import { cn } from "@/lib/utils";

interface JournalLine {
  side: "dr" | "cr";
  titleAr: string;
  titleEn: string;
  code: string;
  amountNumber: number;
}

interface UnitProfile {
  id: string;
  code: string;
  nameAr: string;
  nameEn: string;
  entityAr: string;
  entityEn: string;
  buildingCode: string;
  floorCode: string;
  typeAr: string;
  typeEn: string;
  ownerAr: string;
  ownerEn: string;
  areaNumber: number;
  pinPosition: { top: string; left: string };
  txRef: string;
  jvRef: string;
  txTypeAr: string;
  txTypeEn: string;
  
  // Financial Identity Metrics
  outstanding: number;
  lastCollection: number;
  openChargesCount: number;
  ledgerEntriesCount: number;

  baseAmount: number;
  vatAmount: number;
  totalAmount: number;
  isTaxExempt?: boolean;
  taxMetaAr: string;
  taxMetaEn: string;
  journalLines: JournalLine[];
  balanceStatusAr: string;
  balanceStatusEn: string;
}

const UNITS_DATA: UnitProfile[] = [
  {
    id: "b04-0712",
    code: "B04-0712",
    nameAr: "الوحدة B04-0712 (سكني فاخر)",
    nameEn: "Unit B04-0712 (Luxury Res.)",
    entityAr: "مشروع بالم ريزيدنس",
    entityEn: "Palm Residence",
    buildingCode: "B-04",
    floorCode: "07",
    typeAr: "سكني متكرر",
    typeEn: "Residential",
    ownerAr: "د. هشام الفاسي",
    ownerEn: "Dr. Hesham El-Fassi",
    areaNumber: 215,
    pinPosition: { top: "54%", left: "68%" },
    txRef: "TX-2026-08241",
    jvRef: "JV-2026-00418",
    txTypeAr: "سداد رسوم خدمات وصيانة دورية (Q3)",
    txTypeEn: "Q3 Periodic CAM & Operations Settlement",

    outstanding: 28750,
    lastCollection: 12500,
    openChargesCount: 3,
    ledgerEntriesCount: 148,

    baseAmount: 25000,
    vatAmount: 3500,
    totalAmount: 28500,
    taxMetaAr: "فاتورة إلكترونية معتمدة ETA UUID: c89e4-8f12",
    taxMetaEn: "ETA E-Invoice Verified UUID: c89e4-8f12",
    journalLines: [
      { side: "dr", titleAr: "مدين: الصندوق والبنك التجاري", titleEn: "Dr: Treasury & Operating Bank", code: "10101-01", amountNumber: 28500 },
      { side: "cr", titleAr: "دائن: إيرادات صيانة وتشغيل العقار", titleEn: "Cr: Property Operations Revenue", code: "40101-02", amountNumber: 25000 },
      { side: "cr", titleAr: "دائن: ضريبة القيمة المضافة المستحقة", titleEn: "Cr: Output VAT Payable (14%)", code: "20301-01", amountNumber: 3500 },
    ],
    balanceStatusAr: "القيد متوازن ذرياً ومرحل لدفتر الأستاذ",
    balanceStatusEn: "Atomically balanced & posted to General Ledger",
  },
  {
    id: "a01-0102",
    code: "A01-0102",
    nameAr: "الوحدة A01-0102 (تجاري - بنك)",
    nameEn: "Unit A01-0102 (Commercial Bank)",
    entityAr: "مشروع بالم ريزيدنس",
    entityEn: "Palm Residence",
    buildingCode: "A-01",
    floorCode: "01",
    typeAr: "تجاري أرضي",
    typeEn: "Commercial Ground",
    ownerAr: "شركة المشرق للتطوير",
    ownerEn: "Mashreq Development Co.",
    areaNumber: 380,
    pinPosition: { top: "82%", left: "48%" },
    txRef: "TX-2026-09102",
    jvRef: "JV-2026-00520",
    txTypeAr: "تحصيل إيجار ربع سنوي تجاري معتمد",
    txTypeEn: "Quarterly Commercial Lease Collection",

    outstanding: 120000,
    lastCollection: 120000,
    openChargesCount: 1,
    ledgerEntriesCount: 236,

    baseAmount: 105263,
    vatAmount: 14737,
    totalAmount: 120000,
    taxMetaAr: "مطابقة ضريبية ZATCA / ETA معتمدة",
    taxMetaEn: "Tax Compliant ZATCA / ETA Active",
    journalLines: [
      { side: "dr", titleAr: "مدين: بنك مصر - الحساب الجاري", titleEn: "Dr: Current Bank Account", code: "10201-02", amountNumber: 120000 },
      { side: "cr", titleAr: "دائن: إيراد تأجير مساحات تجارية", titleEn: "Cr: Commercial Rental Revenue", code: "40201-01", amountNumber: 105263 },
      { side: "cr", titleAr: "دائن: ضريبة القيمة المضافة المحصلة", titleEn: "Cr: Output VAT Payable (14%)", code: "20301-01", amountNumber: 14737 },
    ],
    balanceStatusAr: "تحصيل بنكي مباشر مع تسوية الفاتورة",
    balanceStatusEn: "Direct bank collection with automatic invoice clearing",
  },
  {
    id: "c02-0401",
    code: "C02-0401",
    nameAr: "الوحدة C02-0401 (بنتهاوس فاخر)",
    nameEn: "Unit C02-0401 (Penthouse Sky)",
    entityAr: "مشروع بالم ريزيدنس",
    entityEn: "Palm Residence",
    buildingCode: "C-02",
    floorCode: "04",
    typeAr: "بنتهاوس بانورامي",
    typeEn: "Panoramic Penthouse",
    ownerAr: "م. طارق العوضي",
    ownerEn: "Eng. Tarek El-Awadi",
    areaNumber: 420,
    pinPosition: { top: "34%", left: "62%" },
    txRef: "TX-2026-10401",
    jvRef: "JV-2026-00635",
    txTypeAr: "إثبات وديعة صيانة مخصصة ومستدامة (Capital Reserve)",
    txTypeEn: "Dedicated Sinking Fund Capital Reserve Deposit",

    outstanding: 50000,
    lastCollection: 50000,
    openChargesCount: 2,
    ledgerEntriesCount: 94,

    baseAmount: 50000,
    vatAmount: 0,
    totalAmount: 50000,
    isTaxExempt: true,
    taxMetaAr: "حساب أمانات معزول بنكياً عن التشغيل",
    taxMetaEn: "Ring-fenced Escrow / Reserve Ledger",
    journalLines: [
      { side: "dr", titleAr: "مدين: بنك الودائع المخصصة للصيانة", titleEn: "Dr: Reserve Sinking Fund Bank", code: "10202-01", amountNumber: 50000 },
      { side: "cr", titleAr: "دائن: أمانات وودائع صيانة الملاك", titleEn: "Cr: Member Capital Reserve Trust", code: "20401-01", amountNumber: 50000 },
    ],
    balanceStatusAr: "محجوزة بحساب استثماري معزول لاتحاد الشاغلين",
    balanceStatusEn: "Secured in isolated HOA reserve investment ledger",
  },
];

/**
 * High-performance 60fps Animated Number Counter
 */
function AnimatedCounter({
  value,
  duration = 750,
  suffix = "",
  prefix = "",
}: {
  value: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
}) {
  const [displayValue, setDisplayValue] = useState<number>(value);
  const startValRef = useRef<number>(value);
  const startTimeRef = useRef<number | null>(null);
  const frameRef = useRef<number | null>(null);

  useEffect(() => {
    const startVal = startValRef.current;
    const targetVal = value;
    startTimeRef.current = null;

    if (startVal === targetVal) {
      setDisplayValue(targetVal);
      return;
    }

    const easeOutExpo = (t: number): number => {
      return t === 1 ? 1 : 1 - Math.pow(2, -10 * t);
    };

    const animate = (timestamp: number) => {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const progress = Math.min((timestamp - startTimeRef.current) / duration, 1);
      const eased = easeOutExpo(progress);
      const current = Math.round(startVal + (targetVal - startVal) * eased);
      setDisplayValue(current);

      if (progress < 1) {
        frameRef.current = requestAnimationFrame(animate);
      } else {
        startValRef.current = targetVal;
      }
    };

    frameRef.current = requestAnimationFrame(animate);

    return () => {
      if (frameRef.current) cancelAnimationFrame(frameRef.current);
    };
  }, [value, duration]);

  return (
    <span className="font-mono tabular-nums tracking-tight">
      {prefix}
      {displayValue.toLocaleString()}
      {suffix}
    </span>
  );
}

const CYCLE_DURATION_MS = 5500;

export function HeroDigitalTwin({ isAr }: { isAr: boolean }) {
  const [currentIndex, setCurrentIndex] = useState<number>(0);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [progress, setProgress] = useState<number>(0);
  const [isTransitioning, setIsTransitioning] = useState<boolean>(false);
  const activeUnit = UNITS_DATA[currentIndex];

  useEffect(() => {
    if (isPaused) return;

    const intervalStep = 50;
    const timer = setInterval(() => {
      setProgress((prev) => {
        const next = prev + (intervalStep / CYCLE_DURATION_MS) * 100;
        if (next >= 100) {
          triggerNextUnit();
          return 0;
        }
        return next;
      });
    }, intervalStep);

    return () => clearInterval(timer);
  }, [isPaused, currentIndex]);

  const triggerNextUnit = () => {
    setIsTransitioning(true);
    setCurrentIndex((prev) => (prev + 1) % UNITS_DATA.length);
    setProgress(0);
    setTimeout(() => setIsTransitioning(false), 300);
  };

  const handleSelectUnit = (index: number) => {
    if (index === currentIndex) return;
    setIsTransitioning(true);
    setCurrentIndex(index);
    setProgress(0);
    setTimeout(() => setIsTransitioning(false), 300);
  };

  return (
    /* Double-Bezel System-Grade Enclosure */
    <div
      className="relative rounded-[2rem] p-2 bg-slate-100/90 border border-slate-200/80 shadow-2xl transition-all"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
    >
      <div className="rounded-[calc(2rem-0.5rem)] bg-white overflow-hidden border border-slate-200/90">
        
        {/* Top Hierarchy Strip: ENTITY ↓ BUILDING ↓ FLOOR ↓ UNIT */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 bg-slate-50/95 px-5 py-3 text-xs font-bold text-slate-700">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            {/* Entity */}
            <div className="flex items-center gap-1.5 font-black text-slate-950 font-heading">
              <Building2 className="size-4 text-[#07425d]" />
              <span>{isAr ? activeUnit.entityAr : activeUnit.entityEn}</span>
            </div>
            
            <span className="text-slate-300">/</span>

            {/* Building */}
            <div className="flex items-center gap-1 text-[11px] font-mono font-bold text-slate-600 bg-slate-200/60 px-2 py-0.5 rounded-md">
              <span className="text-slate-400 text-[10px]">{isAr ? "مبنى" : "BLDG"}</span>
              <span>{activeUnit.buildingCode}</span>
            </div>

            <span className="text-slate-300">/</span>

            {/* Floor */}
            <div className="flex items-center gap-1 text-[11px] font-mono font-bold text-slate-600 bg-slate-200/60 px-2 py-0.5 rounded-md">
              <span className="text-slate-400 text-[10px]">{isAr ? "دور" : "FL"}</span>
              <span>{activeUnit.floorCode}</span>
            </div>

            <span className="text-slate-300">/</span>

            {/* Unit Code */}
            <div className="flex items-center gap-1 text-[11px] font-mono font-black text-[#07425d] bg-[#07425d]/10 px-2 py-0.5 rounded-md ring-1 ring-[#07425d]/20">
              <span className="text-[#07425d]/70 text-[10px]">{isAr ? "وحدة" : "UNIT"}</span>
              <span>{activeUnit.code}</span>
            </div>
          </div>

          {/* Autoplay & Ledger Verification Gate */}
          <div className="flex items-center gap-3 font-mono text-[11px]">
            <button
              type="button"
              onClick={() => setIsPaused((prev) => !prev)}
              className="flex items-center gap-1.5 rounded-full bg-slate-200/70 hover:bg-slate-300/70 text-slate-700 px-2.5 py-0.5 text-[10px] font-bold cursor-pointer transition-colors"
              title={isPaused ? (isAr ? "تشغيل التبديل التلقائي" : "Play Auto-cycle") : (isAr ? "إيقاف مؤقت" : "Pause")}
            >
              {isPaused ? <Play className="size-2.5 fill-current" /> : <Pause className="size-2.5 fill-current" />}
              <span>{isPaused ? (isAr ? "موقوف" : "Paused") : (isAr ? "تلقائي" : "Auto")}</span>
            </button>

            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-100/80 text-emerald-950 border border-emerald-300/60 px-2.5 py-0.5 text-[10px] font-bold">
              <CheckCircle2 className="size-3 text-emerald-600" />
              <span>{isAr ? "سلامة الدفتر موثقة ✓" : "Ledger integrity verified ✓"}</span>
            </span>
          </div>
        </div>

        {/* Main Grid: Left = Visual Digital Twin & HUD, Right = Financial Identity & Atomic Journal */}
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
            {UNITS_DATA.map((unit, idx) => {
              const isSelected = idx === currentIndex;
              return (
                <button
                  key={unit.id}
                  type="button"
                  onClick={() => handleSelectUnit(idx)}
                  style={{ top: unit.pinPosition.top, left: unit.pinPosition.left }}
                  aria-label={isAr ? unit.nameAr : unit.nameEn}
                  className={cn(
                    "absolute -translate-x-1/2 -translate-y-1/2 z-20 flex items-center gap-2 rounded-full px-3 py-1.5 transition-all duration-500 cursor-pointer shadow-xl backdrop-blur-md press-feedback motion-control",
                    isSelected
                      ? "bg-[#07425d] text-white ring-2 ring-white/90 scale-110 shadow-[#07425d]/60 shadow-lg"
                      : "bg-slate-900/85 text-slate-200 border border-white/20 hover:bg-slate-900 hover:scale-105"
                  )}
                >
                  <span
                    className={cn(
                      "size-2 rounded-full transition-colors",
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

            {/* Interactive Floating Quick-Selector Chips with Progress Bar */}
            <div className="absolute top-4 start-4 z-20 flex flex-wrap items-center gap-2 bg-slate-950/85 p-2 rounded-2xl border border-white/15 backdrop-blur-md shadow-2xl">
              <span className="text-[10px] font-bold text-slate-400 px-1 font-mono">
                {isAr ? "الوحدات:" : "Units:"}
              </span>
              {UNITS_DATA.map((u, idx) => {
                const active = idx === currentIndex;
                return (
                  <button
                    key={u.id}
                    type="button"
                    onClick={() => handleSelectUnit(idx)}
                    className={cn(
                      "relative overflow-hidden rounded-xl px-3 py-1.5 text-[11px] font-mono font-bold transition-all cursor-pointer",
                      active
                        ? "bg-[#07425d] text-white shadow-xs ring-1 ring-white/30"
                        : "text-slate-300 hover:text-white hover:bg-white/10"
                    )}
                  >
                    <span className="relative z-10">{u.code}</span>
                    {active && !isPaused && (
                      <span
                        className="absolute bottom-0 start-0 top-0 bg-sky-400/25 transition-all ease-linear"
                        style={{ width: `${progress}%` }}
                      />
                    )}
                  </button>
                );
              })}
            </div>

            {/* FINANCIAL IDENTITY HUD CARD (Bottom Overlay) */}
            <div
              key={`unit-hud-${activeUnit.id}`}
              className={cn(
                "absolute bottom-4 inset-x-4 z-20 rounded-2xl bg-slate-950/90 backdrop-blur-xl p-4 border border-white/15 shadow-2xl text-white transition-all duration-300",
                isTransitioning ? "opacity-75 translate-y-1" : "opacity-100 translate-y-0"
              )}
            >
              {/* Top Row: Unit Name & Owner */}
              <div className="flex items-center justify-between pb-3 border-b border-white/10">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="size-2 rounded-full bg-emerald-400" />
                    <span className="text-xs sm:text-sm font-black text-white font-heading">
                      {isAr ? activeUnit.nameAr : activeUnit.nameEn}
                    </span>
                    <span className="text-[10px] font-mono bg-sky-500/20 text-sky-300 border border-sky-400/30 px-2 py-0.5 rounded-full font-bold">
                      {isAr ? activeUnit.typeAr : activeUnit.typeEn}
                    </span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-slate-300 font-medium">
                    {isAr ? `المالك: ${activeUnit.ownerAr}` : `Owner: ${activeUnit.ownerEn}`}
                  </p>
                </div>

                <div className="text-end">
                  <span className="text-[10px] font-mono text-slate-400 block">{isAr ? "المساحة" : "Area"}</span>
                  <span className="text-xs sm:text-sm font-black text-emerald-400 font-mono">
                    <AnimatedCounter value={activeUnit.areaNumber} suffix=" م²" />
                  </span>
                </div>
              </div>

              {/* Bottom Row: 4 Real Financial Identity Indicators */}
              <div className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-2 text-center text-xs">
                <div className="bg-white/5 rounded-xl p-2 border border-white/5">
                  <span className="text-[10px] font-mono text-slate-400 block">{isAr ? "الرصيد القائم" : "Outstanding"}</span>
                  <span className="font-mono font-black text-amber-300 text-xs">
                    <AnimatedCounter value={activeUnit.outstanding} suffix=" ج.م" />
                  </span>
                </div>

                <div className="bg-white/5 rounded-xl p-2 border border-white/5">
                  <span className="text-[10px] font-mono text-slate-400 block">{isAr ? "آخر تحصيل" : "Last Collection"}</span>
                  <span className="font-mono font-black text-emerald-300 text-xs">
                    <AnimatedCounter value={activeUnit.lastCollection} suffix=" ج.م" />
                  </span>
                </div>

                <div className="bg-white/5 rounded-xl p-2 border border-white/5">
                  <span className="text-[10px] font-mono text-slate-400 block">{isAr ? "المطالبات المفتوحة" : "Open Charges"}</span>
                  <span className="font-mono font-black text-white text-xs">
                    <AnimatedCounter value={activeUnit.openChargesCount} prefix="0" />
                  </span>
                </div>

                <div className="bg-white/5 rounded-xl p-2 border border-white/5">
                  <span className="text-[10px] font-mono text-slate-400 block">{isAr ? "القيود الدفترية" : "Ledger Entries"}</span>
                  <span className="font-mono font-black text-sky-300 text-xs">
                    <AnimatedCounter value={activeUnit.ledgerEntriesCount} />
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* =========================================================================
              RIGHT COLUMN: Live ERP General Ledger & Atomic Journal Transformation
             ========================================================================= */}
          <div
            key={`ledger-${activeUnit.id}`}
            className={cn(
              "lg:col-span-5 p-5 sm:p-6 lg:p-7 flex flex-col justify-between bg-[#FCFCFD] border-t lg:border-t-0 lg:border-s border-slate-200 transition-all duration-300",
              isTransitioning ? "opacity-80 translate-y-0.5" : "opacity-100 translate-y-0"
            )}
          >
            <div>
              {/* Document Header */}
              <div className="flex items-center justify-between pb-3.5 border-b border-slate-200">
                <div className="flex items-center gap-2.5">
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

              {/* Live Figures Grid with Tabular Numerals */}
              <div className="mt-3.5 space-y-2 text-xs">
                <div className="flex items-center justify-between text-slate-600 font-medium">
                  <span>{isAr ? "قيمة المطالبة / الإيراد الأساسي" : "Base Fee / Revenue"}</span>
                  <span className="font-black text-slate-900">
                    <AnimatedCounter value={activeUnit.baseAmount} suffix=" ج.م" />
                  </span>
                </div>

                <div className="flex items-center justify-between text-slate-500 text-[11px]">
                  <span>{isAr ? "ضريبة القيمة المضافة / الودائع" : "Tax / Special Ledger"}</span>
                  <span className="font-bold text-slate-800">
                    {activeUnit.isTaxExempt ? (
                      <span className="font-mono">0.00 ج.م (معفى / أمانات)</span>
                    ) : (
                      <AnimatedCounter value={activeUnit.vatAmount} suffix=" ج.م (14% VAT)" />
                    )}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-200 flex items-center justify-between">
                  <span className="text-xs font-black text-slate-900">{isAr ? "إجمالي المبلغ المحصل والدفتري" : "Total Booked & Cleared"}</span>
                  <span className="text-base font-black text-[#07425d]">
                    <AnimatedCounter value={activeUnit.totalAmount} suffix=" ج.م" duration={900} />
                  </span>
                </div>
              </div>

              {/* Atomic Journal Transformation Box */}
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

                {/* Journal Lines with Rolling Digit Animation */}
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
                        <AnimatedCounter value={line.amountNumber} suffix=" ج.م" />
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
                  <AnimatedCounter value={activeUnit.totalAmount} suffix=" ج.م" />
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
    </div>
  );
}
