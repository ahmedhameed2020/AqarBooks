"use client";

import { useState } from "react";
import type { Locale } from "@/i18n/routing";
import { BarChart3, FileSpreadsheet, Building, Users, Calendar, ArrowUpRight, CheckCircle2 } from "lucide-react";

export function SectionFinancialReports({ locale }: { locale: Locale }) {
  const isAr = locale === "ar";
  const [activeTab, setActiveTab] = useState<"unit" | "trial" | "aging" | "pnl">("unit");

  return (
    <section id="reports" className="relative bg-[#F8F9FA] py-20 border-b border-slate-200/80">
      <div className="mx-auto max-w-7xl px-6">
        {/* Section Header */}
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 text-xs font-mono font-bold text-[#07425d] bg-[#07425d]/10 px-3 py-1 rounded-full border border-[#07425d]/20 mb-3">
            <span className="flex size-4 items-center justify-center rounded-full bg-[#07425d] text-[10px] text-white">07</span>
            <span>{isAr ? "تقارير المراجعين والإدارة" : "AUDITOR-READY FINANCIAL STATEMENTS"}</span>
          </div>

          <h2 className="text-3xl sm:text-4xl font-black text-slate-950 font-heading leading-tight">
            {isAr ? "ميزان مراجعة، وقائمة دخل، وأعمار ديون.. جاهزة في ثواني بدون إكسيل." : "Trial balance, income statement, and aging reports.. ready in seconds without Excel hassle."}
          </h2>

          <p className="mt-3.5 text-sm sm:text-base text-slate-600 font-medium leading-relaxed">
            {isAr
              ? "بدل ما تقضي أسبوع تجمع أرقام متفرقة، كل التقارير المالية وضريبتك وكشوف حساب الملاك جاهزة للتصدير والطباعة فوراً من واقع القيود الحقيقية."
              : "Instead of spending days reconciling disparate spreadsheets, your tax returns, operating P&Ls, and member statements are always up to date."}
          </p>

          {/* Proof Points */}
          <div className="mt-5 flex flex-wrap items-center gap-2 text-xs font-bold text-slate-700">
            <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 border border-slate-200 shadow-2xs">
              {isAr ? "ميزان مراجعة" : "Trial Balance"}
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 border border-slate-200 shadow-2xs">
              {isAr ? "كشف حساب" : "Account Statement"}
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 border border-slate-200 shadow-2xs">
              {isAr ? "أرباح وخسائر" : "P&L"}
            </span>
            <span className="text-slate-300">·</span>
            <span className="inline-flex items-center rounded-lg bg-white px-2.5 py-1 border border-slate-200 shadow-2xs">
              {isAr ? "مركز مالي" : "Balance Sheet"}
            </span>
          </div>
        </div>

        {/* Interactive Report Tab Selector */}
        <div className="mt-10 flex flex-wrap items-center gap-2 border-b border-slate-200 pb-3">
          <button
            type="button"
            onClick={() => setActiveTab("unit")}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === "unit"
                ? "bg-[#07425d] text-white shadow-sm"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {isAr ? "كشف حساب الوحدة (Unit Ledger)" : "Unit Statement Ledger"}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("trial")}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === "trial"
                ? "bg-[#07425d] text-white shadow-sm"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {isAr ? "ميزان المراجعة (Trial Balance)" : "Trial Balance"}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("aging")}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === "aging"
                ? "bg-[#07425d] text-white shadow-sm"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {isAr ? "أعمار ديون الملاك (Member Aging)" : "Member Aging Analysis"}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("pnl")}
            className={`rounded-xl px-4 py-2 text-xs font-bold transition-all cursor-pointer ${
              activeTab === "pnl"
                ? "bg-[#07425d] text-white shadow-sm"
                : "bg-white text-slate-700 border border-slate-200 hover:bg-slate-50"
            }`}
          >
            {isAr ? "قائمة دخل العقار (Property P&L)" : "Property P&L Statement"}
          </button>
        </div>

        {/* Display Container for Selected Report */}
        <div className="mt-6 rounded-3xl border border-slate-200/90 bg-white p-6 sm:p-8 shadow-sm">
          {/* 1. Unit Statement View */}
          {activeTab === "unit" && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-slate-150 text-xs">
                <div>
                  <span className="font-mono text-slate-400 font-bold block text-[10px]">STATEMENT REF: ST-90214</span>
                  <h3 className="font-black text-slate-900 text-sm mt-0.5">
                    {isAr ? "كشف حساب تفصيلي: وحدة B-214 (أحمد محمد محمود)" : "Unit Statement: Unit B-214 (Ahmed Mohamed)"}
                  </h3>
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-800 border border-emerald-200">
                    {isAr ? "الرصيد الحالي: 0.00 ج.م (خالص)" : "Current Balance: 0.00 EGP (Settled)"}
                  </span>
                </div>
              </div>

              <div className="overflow-x-auto mt-4">
                <table className="w-full text-xs text-start">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-bold text-[11px]">
                      <th className="py-2.5 px-3 text-start">{isAr ? "التاريخ" : "Date"}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? "رقم المرجع" : "Ref"}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? "البيان والحركة" : "Description"}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? "مطالبة (+)" : "Charge (+)"}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? "سداد (-)" : "Payment (-)"}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? "الرصيد التراكمي" : "Balance"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium font-mono">
                    <tr className="hover:bg-slate-50/50">
                      <td className="py-3 px-3 text-slate-600">01/01/2026</td>
                      <td className="py-3 px-3 text-slate-400">OB-2026</td>
                      <td className="py-3 px-3 text-slate-800 font-sans">{isAr ? "رصيد افتتاحي مرحل" : "Opening Balance"}</td>
                      <td className="py-3 px-3 text-end text-slate-900">0.00</td>
                      <td className="py-3 px-3 text-end text-slate-400">—</td>
                      <td className="py-3 px-3 text-end font-bold text-slate-900">0.00</td>
                    </tr>
                    <tr className="hover:bg-slate-50/50">
                      <td className="py-3 px-3 text-slate-600">24/08/2026</td>
                      <td className="py-3 px-3 text-blue-600">EVT-08241</td>
                      <td className="py-3 px-3 text-slate-800 font-sans">{isAr ? "استحقاق رسوم إدارة سنوية 2026 + 14% VAT" : "Annual CAM Dues 2026 + 14% VAT"}</td>
                      <td className="py-3 px-3 text-end font-bold text-rose-600">28,500.00</td>
                      <td className="py-3 px-3 text-end text-slate-400">—</td>
                      <td className="py-3 px-3 text-end font-bold text-rose-600">28,500.00</td>
                    </tr>
                    <tr className="hover:bg-slate-50/50 bg-emerald-50/20">
                      <td className="py-3 px-3 text-slate-600">24/08/2026</td>
                      <td className="py-3 px-3 text-emerald-700">RC-01842</td>
                      <td className="py-3 px-3 text-slate-800 font-sans">{isAr ? "سند تحصيل نقدي (JV-00418) خزينة الإدارة" : "Cash Receipt (JV-00418) Main Treasury"}</td>
                      <td className="py-3 px-3 text-end text-slate-400">—</td>
                      <td className="py-3 px-3 text-end font-bold text-emerald-700">28,500.00</td>
                      <td className="py-3 px-3 text-end font-black text-emerald-800">0.00</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 2. Trial Balance View */}
          {activeTab === "trial" && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-slate-150 text-xs">
                <div>
                  <span className="font-mono text-slate-400 font-bold block text-[10px]">TRIAL BALANCE • PERIOD 2026-Q3</span>
                  <h3 className="font-black text-slate-900 text-sm mt-0.5">
                    {isAr ? "ميزان المراجعة العام — بالم ريزيدنس (مصر)" : "General Trial Balance — Palm Residence"}
                  </h3>
                </div>
                <span className="rounded-lg bg-[#1A3C2E]/10 px-2.5 py-1 text-xs font-mono font-black text-[#1A3C2E]">
                  DEBITS = CREDITS (100% MATCH)
                </span>
              </div>

              <div className="overflow-x-auto mt-4">
                <table className="w-full text-xs text-start">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50/80 text-slate-600 font-bold text-[11px]">
                      <th className="py-2.5 px-3 text-start">{isAr ? "كود الحساب" : "Code"}</th>
                      <th className="py-2.5 px-3 text-start">{isAr ? "اسم الحساب" : "Account Name"}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? "إجمالي المدين (Debit)" : "Total Debit"}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? "إجمالي الدائن (Credit)" : "Total Credit"}</th>
                      <th className="py-2.5 px-3 text-end">{isAr ? "صافي الرصيد" : "Net Balance"}</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 font-medium font-mono">
                    <tr>
                      <td className="py-3 px-3 font-bold text-slate-700">10101</td>
                      <td className="py-3 px-3 font-sans text-slate-900">{isAr ? "النقدية بالصناديق والخزينة" : "Cash & Treasury"}</td>
                      <td className="py-3 px-3 text-end">1,420,000.00</td>
                      <td className="py-3 px-3 text-end">210,000.00</td>
                      <td className="py-3 px-3 text-end font-bold text-emerald-700">1,210,000.00 Dr</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-3 font-bold text-slate-700">10201</td>
                      <td className="py-3 px-3 font-sans text-slate-900">{isAr ? "الحسابات الجارية بالبنوك (CIB / NBE)" : "Bank Current Accounts"}</td>
                      <td className="py-3 px-3 text-end">3,850,000.00</td>
                      <td className="py-3 px-3 text-end">450,000.00</td>
                      <td className="py-3 px-3 text-end font-bold text-emerald-700">3,400,000.00 Dr</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-3 font-bold text-slate-700">40101</td>
                      <td className="py-3 px-3 font-sans text-slate-900">{isAr ? "إيرادات رسوم الخدمات والإدارة" : "CAM & Management Revenue"}</td>
                      <td className="py-3 px-3 text-end">0.00</td>
                      <td className="py-3 px-3 text-end">3,200,000.00</td>
                      <td className="py-3 px-3 text-end font-bold text-slate-900">3,200,000.00 Cr</td>
                    </tr>
                    <tr>
                      <td className="py-3 px-3 font-bold text-slate-700">20301</td>
                      <td className="py-3 px-3 font-sans text-slate-900">{isAr ? "ضريبة القيمة المضافة المستحقة (VAT 14%)" : "Output VAT Payable"}</td>
                      <td className="py-3 px-3 text-end">84,000.00</td>
                      <td className="py-3 px-3 text-end">448,000.00</td>
                      <td className="py-3 px-3 text-end font-bold text-slate-900">364,000.00 Cr</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* 3. Member Aging Analysis */}
          {activeTab === "aging" && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-slate-150 text-xs">
                <div>
                  <span className="font-mono text-slate-400 font-bold block text-[10px]">MEMBER AGING AUDIT</span>
                  <h3 className="font-black text-slate-900 text-sm mt-0.5">
                    {isAr ? "تحليل أعمار ديون الملاك والشاغلين" : "Accounts Receivable Aging Schedule"}
                  </h3>
                </div>
                <span className="rounded-lg bg-rose-50 px-2.5 py-1 text-xs font-bold text-rose-800 border border-rose-200">
                  {isAr ? "إجمالي المتأخرات: 218,500 ج.م" : "Total Overdue: 218,500 EGP"}
                </span>
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                <div className="rounded-2xl bg-slate-50 p-4 border border-slate-200">
                  <span className="text-[11px] font-bold text-slate-500">{isAr ? "فترة 1 - 30 يوم" : "1 - 30 Days"}</span>
                  <p className="text-base font-black text-slate-900 font-mono mt-1">112,000 ج.م</p>
                  <span className="text-[10px] text-slate-400">8 {isAr ? "وحدات" : "units"}</span>
                </div>
                <div className="rounded-2xl bg-amber-50/60 p-4 border border-amber-200">
                  <span className="text-[11px] font-bold text-amber-800">{isAr ? "فترة 31 - 60 يوم" : "31 - 60 Days"}</span>
                  <p className="text-base font-black text-amber-900 font-mono mt-1">64,500 ج.م</p>
                  <span className="text-[10px] text-amber-700">4 {isAr ? "وحدات" : "units"}</span>
                </div>
                <div className="rounded-2xl bg-rose-50/60 p-4 border border-rose-200">
                  <span className="text-[11px] font-bold text-rose-800">{isAr ? "فترة 61 - 90 يوم" : "61 - 90 Days"}</span>
                  <p className="text-base font-black text-rose-900 font-mono mt-1">28,000 ج.م</p>
                  <span className="text-[10px] text-rose-700">2 {isAr ? "وحدات" : "units"}</span>
                </div>
                <div className="rounded-2xl bg-rose-100/60 p-4 border border-rose-300">
                  <span className="text-[11px] font-bold text-rose-900">{isAr ? "أكثر من 90 يوم" : "> 90 Days"}</span>
                  <p className="text-base font-black text-rose-950 font-mono mt-1">14,000 ج.م</p>
                  <span className="text-[10px] text-rose-800 font-bold">{isAr ? "إنذار قانوني" : "Legal Notice"}</span>
                </div>
              </div>
            </div>
          )}

          {/* 4. Property P&L Statement */}
          {activeTab === "pnl" && (
            <div>
              <div className="flex flex-wrap items-center justify-between gap-3 pb-5 border-b border-slate-150 text-xs">
                <div>
                  <span className="font-mono text-slate-400 font-bold block text-[10px]">PROPERTY P&L STATEMENT</span>
                  <h3 className="font-black text-slate-900 text-sm mt-0.5">
                    {isAr ? "قائمة الإيرادات والمصروفات التشغيلية — Palm Residence" : "Operational Revenue & Expense Statement"}
                  </h3>
                </div>
                <span className="rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-black text-emerald-800 border border-emerald-200">
                  {isAr ? "صافي الفائض التشغيلي: +890,400 ج.م" : "Net Operating Surplus: +890,400 EGP"}
                </span>
              </div>

              <div className="mt-4 space-y-2 text-xs font-mono">
                <div className="flex justify-between py-2 border-b border-slate-100 font-bold text-slate-900">
                  <span className="font-sans">{isAr ? "إجمالي إيرادات الصيانة والإدارة المحصلة" : "Gross CAM & Management Revenues"}</span>
                  <span className="font-black">3,200,000.00 ج.م</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100 text-slate-600">
                  <span className="font-sans ps-4">{isAr ? "(-) مصروفات الحراسة والأمن والنظافة" : "(-) Security & Janitorial Contracts"}</span>
                  <span>(1,150,000.00) ج.م</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100 text-slate-600">
                  <span className="font-sans ps-4">{isAr ? "(-) صيانة المصاعد والمسطحات المائية" : "(-) Elevators & Landscape Maintenance"}</span>
                  <span>(680,000.00) ج.م</span>
                </div>
                <div className="flex justify-between py-2 border-b border-slate-100 text-slate-600">
                  <span className="font-sans ps-4">{isAr ? "(-) استهلاك الإنارة العامة والمرافق المشتركة" : "(-) Common Utilities & Power"}</span>
                  <span>(479,600.00) ج.م</span>
                </div>
                <div className="flex justify-between py-3 border-t-2 border-slate-300 font-black text-sm text-emerald-800 font-sans">
                  <span>{isAr ? "صافي الفائض المرحل لاحتياطي الصيانة الرأسمالية (Sinking Fund)" : "Net Surplus to Sinking Fund Reserve"}</span>
                  <span className="font-mono font-black">+890,400.00 ج.م</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
